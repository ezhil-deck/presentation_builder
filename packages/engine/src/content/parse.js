/**
 * Markdown -> Content (schemas/content.schema.json v1.1), P2-spec §1. Deterministic, no network, no AI.
 *
 * Grammar notes where §1 leaves a choice (listed in the P2 report):
 * - one source line = one paragraph (a slide line is a line; consecutive lines are not joined);
 * - paragraph / title text keeps its inline markdown (the content schema says text is inline markdown); the composer
 *   turns it into runs with `parseInline`;
 * - `<!-- kind: X -->` is read anywhere in the slide; other HTML comments are ignored.
 */
import { parse as parseYaml } from 'yaml';
import { validateBlock, validateContent } from '../validate.js';

const FENCE_TYPES = new Set(['cards', 'steps', 'timeline', 'kpis', 'chart', 'table', 'logos', 'people']);
const LIST_RE = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const SUBTITLE_KINDS = new Set(['cover', 'section', 'cta']);
const PLACEHOLDER_RE = /\{brand\.([^{}]+)\}/g;

const scalarToString = (v) => (v === null || v === undefined ? v : typeof v === 'object' ? v : String(v));

function coerceItem(item) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return { text: String(item ?? '') };
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    const s = scalarToString(v);
    if (s !== null && s !== undefined) out[k] = s;
  }
  return out;
}

function fenceBlock(name, data) {
  if (name === 'chart') {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('chart fence must be a YAML mapping');
    const block = { type: 'chart', chartType: String(data.chartType) };
    if (Array.isArray(data.categories)) block.categories = data.categories.map(String);
    block.series = (Array.isArray(data.series) ? data.series : []).map((s) => ({
      name: String(s?.name ?? ''),
      values: (Array.isArray(s?.values) ? s.values : []).map(Number),
    }));
    if (data.unit !== undefined) block.unit = String(data.unit);
    if (data.highlight !== undefined) block.highlight = Number(data.highlight);
    return block;
  }
  if (name === 'table') {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('table fence must be a YAML mapping');
    const block = { type: 'table' };
    if (Array.isArray(data.header)) block.header = data.header.map(String);
    block.rows = (Array.isArray(data.rows) ? data.rows : []).map((r) =>
      (Array.isArray(r) ? r : [r]).map(String),
    );
    if (Array.isArray(data.align)) block.align = data.align.map(String);
    return block;
  }
  if (!Array.isArray(data)) throw new Error(`${name} fence must be a YAML list`);
  return { type: name, items: data.map(coerceItem) };
}

function buildList(lines) {
  const root = { children: [] };
  const stack = [{ depth: -1, node: root }];
  let ordered = null;
  for (const line of lines) {
    const m = LIST_RE.exec(line);
    const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
    if (ordered === null) ordered = /\d/.test(m[2]);
    const node = { text: m[3].trim() };
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    (parent.children ??= []).push(node);
    stack.push({ depth, node });
  }
  const clean = (items) =>
    items.map((it) =>
      it.children?.length ? { text: it.text, children: clean(it.children) } : { text: it.text },
    );
  const block = { type: 'list', items: clean(root.children) };
  if (ordered) block.ordered = true;
  return block;
}

/**
 * YAML as people write it in slides: a plain value that itself contains ": " (e.g. `text: a mood: palette`) is invalid
 * YAML. Strict parse first; on failure, retry once with such `key: value` scalars double-quoted. Returns {data, repaired}.
 */
export function parseFenceYaml(raw) {
  try {
    return { data: parseYaml(raw), repaired: false };
  } catch (strictErr) {
    const fixed = raw
      .split('\n')
      .map((line) => {
        const m = /^(\s*(?:-\s+)?[A-Za-z_][\w-]*:\s+)(.+)$/.exec(line);
        if (!m || !m[2].includes(': ') || /^["'[{|>&*!]/.test(m[2].trim())) return line;
        return `${m[1]}"${m[2].trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      })
      .join('\n');
    if (fixed === raw) throw strictErr;
    return { data: parseYaml(fixed), repaired: true };
  }
}

/** Slide body lines -> {kind, items: [{block} | {h2}]}. */
function parseBody(lines, warn, slideNo) {
  const items = [];
  let kind;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i += 1;
      continue;
    }
    const kindM = /^<!--\s*kind:\s*([A-Za-z0-9_-]+)\s*-->$/.exec(t);
    if (kindM) {
      kind = kindM[1];
      i += 1;
      continue;
    }
    if (t.startsWith('<!--')) {
      while (i < lines.length && !lines[i].includes('-->')) i += 1;
      i += 1;
      continue;
    }
    const fenceM = /^```\s*([A-Za-z0-9_-]*)\s*$/.exec(t);
    if (fenceM) {
      const body = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== '```') body.push(lines[(i += 1) - 1]);
      i += 1; // closing fence
      const name = fenceM[1];
      const raw = body.join('\n');
      if (FENCE_TYPES.has(name)) {
        try {
          const { data, repaired } = parseFenceYaml(raw);
          if (repaired)
            warn(
              slideNo,
              `fenced block "${name}": values containing ": " were read as quoted strings`,
              'info',
            );
          items.push({ block: fenceBlock(name, data) });
        } catch (err) {
          warn(
            slideNo,
            `fenced block "${name}" is not valid YAML for its type (${err.message}): kept as a paragraph`,
          );
          items.push({ block: { type: 'paragraph', text: raw } });
        }
      } else {
        warn(slideNo, `unknown fenced block "${name || '(none)'}": kept as a paragraph`);
        items.push({ block: { type: 'paragraph', text: raw } });
      }
      continue;
    }
    const h2M = /^##\s+(.*)$/.exec(t);
    if (h2M) {
      items.push({ h2: h2M[1].trim() });
      i += 1;
      continue;
    }
    const imgM = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(t);
    if (imgM) {
      const block = { type: 'image', src: imgM[2].trim() };
      if (imgM[1]) block.alt = imgM[1];
      items.push({ block });
      i += 1;
      continue;
    }
    if (/^>/.test(t)) {
      const parts = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) {
        parts.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const block = { type: 'quote', text: parts.join(' ').trim() };
      const next = i < lines.length ? lines[i].trim() : '';
      const attrM = /^(?:—|--)\s*(.+)$/.exec(next);
      if (attrM) {
        const attr = attrM[1].trim();
        const sep = [' · ', ', ']
          .map((s) => ({ s, at: attr.indexOf(s) }))
          .filter((x) => x.at > 0)
          .sort((a, b) => a.at - b.at)[0];
        if (sep) {
          block.attribution = attr.slice(0, sep.at).trim();
          block.role = attr.slice(sep.at + sep.s.length).trim();
        } else block.attribution = attr;
        i += 1;
      }
      items.push({ block });
      continue;
    }
    if (LIST_RE.test(line)) {
      const listLines = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        listLines.push(lines[i]);
        i += 1;
      }
      items.push({ block: buildList(listLines) });
      continue;
    }
    items.push({ block: { type: 'paragraph', text: t.replace(/^#{3,}\s+/, '') } });
    i += 1;
  }
  return { kind, items };
}

/** `{brand.name}`, `{brand.tagline}`, `{brand.imagery.samples[N]}` -> value, or undefined when unresolvable. */
export function resolvePlaceholder(path, brandSpec) {
  if (!brandSpec) return undefined;
  if (path === 'name')
    return typeof brandSpec.name === 'string' && brandSpec.name ? brandSpec.name : undefined;
  if (path === 'tagline')
    return typeof brandSpec.tagline === 'string' && brandSpec.tagline ? brandSpec.tagline : undefined;
  const m = /^imagery\.samples\[(\d+)\]$/.exec(path);
  if (m) {
    const file = brandSpec.imagery?.samples?.[Number(m[1])]?.file;
    return typeof file === 'string' && file ? file : undefined;
  }
  return undefined;
}

/** Replace placeholders in every string of a value; returns {value, missing:[...]} */
function resolveDeep(value, brandSpec, missing) {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER_RE, (whole, path) => {
      const v = resolvePlaceholder(path, brandSpec);
      if (v === undefined) {
        missing.push(whole);
        return whole;
      }
      return v;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, brandSpec, missing));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDeep(v, brandSpec, missing);
    return out;
  }
  return value;
}

/**
 * The slide kind when `slide.kind` is absent (P2-spec §1). `index` / `count` enable the position rules (first slide ->
 * cover; last slide with a `cta` block -> cta).
 */
export function inferKind(slide, { index, count } = {}) {
  const blocks = slide?.blocks ?? [];
  const has = (type) => blocks.some((b) => b.type === type);
  if (index === 0) return 'cover';
  if (count !== undefined && index === count - 1 && has('cta')) return 'cta';
  const rest = blocks.filter((b) => b.type !== 'title');
  if (rest.length === 0) return 'text';
  if (rest.every((b) => b.type === 'subtitle')) return 'section';
  if (has('kpis')) return 'kpi';
  if (has('chart')) return 'chart';
  if (has('table')) return 'table';
  if (has('cards')) return 'cards';
  if (has('steps')) return 'steps';
  if (has('timeline')) return 'timeline';
  if (has('logos')) return 'logos';
  if (has('people')) return 'team';
  if (has('quote')) return 'quote';
  if (has('columns')) return 'two-column';
  if (has('image') && has('paragraph')) return 'image-text';
  if (has('image') && !has('list')) return 'image';
  if (has('list')) return 'bullets';
  return 'text';
}

/** md -> {content, warnings}. Throws only when the assembled Content fails its schema (a parser bug). */
export function parseMarkdownResult(md, { brandSpec } = {}) {
  const warnings = [];
  const warn = (slide, message, severity = 'warn') =>
    warnings.push({ check: 'content', severity, message, ...(slide ? { slide } : {}) });
  const lines = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let start = 0;
  let title;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    const close = end > 0 ? end : lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (close > 0) {
      try {
        const fm = parseYaml(lines.slice(1, close).join('\n')) ?? {};
        if (typeof fm.title === 'string') title = fm.title;
      } catch (err) {
        warn(null, `front matter is not valid YAML (${err.message}): ignored`);
      }
      start = close + 1;
    }
  }

  // split into slides at `# ` outside fences
  const raw = [];
  let cur = null;
  let inFence = false;
  for (const line of lines.slice(start)) {
    const t = line.trim();
    if (!inFence && /^```/.test(t)) inFence = true;
    else if (inFence && t === '```') inFence = false;
    else if (!inFence && /^#\s+/.test(t)) {
      cur = { title: t.replace(/^#\s+/, '').trim(), lines: [] };
      raw.push(cur);
      continue;
    }
    if (!cur) {
      if (t) warn(null, `text before the first "# " heading ignored: "${t.slice(0, 40)}"`);
      continue;
    }
    cur.lines.push(line);
  }

  const slides = raw.map((r, index) => {
    const id = `s${index + 1}`;
    const { kind, items } = parseBody(r.lines, (no, msg, sev) => warn(id, msg, sev), index + 1);

    // placeholders: a block whose placeholder cannot be resolved is dropped (never left as literal braces)
    const resolveBlock = (block) => {
      const missing = [];
      const value = resolveDeep(block, brandSpec, missing);
      if (missing.length) {
        warn(id, `${block.type} block dropped: unresolvable placeholder ${[...new Set(missing)].join(', ')}`);
        return null;
      }
      return value;
    };
    const checkBlock = (block) => {
      if (!block) return null;
      const errors = validateBlock(block);
      if (errors.length) {
        warn(id, `${block.type} block dropped: not a valid content block (${errors[0].message})`);
        return null;
      }
      return block;
    };

    const blocks = [];
    const titleBlock = checkBlock(resolveBlock({ type: 'title', text: r.title }));
    if (titleBlock) blocks.push(titleBlock);

    const h2Count = items.filter((it) => it.h2 !== undefined).length;
    if (h2Count >= 2) {
      const columns = [];
      for (const it of items) {
        if (it.h2 !== undefined) {
          const col = { blocks: [] };
          const resolved = resolveBlock({ type: 'subtitle', text: it.h2 });
          if (resolved) col.title = resolved.text;
          columns.push(col);
        } else {
          const b = checkBlock(resolveBlock(it.block));
          if (!b) continue;
          if (columns.length) columns[columns.length - 1].blocks.push(b);
          else blocks.push(b);
        }
      }
      blocks.push({ type: 'columns', items: columns });
    } else {
      for (const it of items) {
        const b = checkBlock(
          resolveBlock(it.h2 !== undefined ? { type: 'subtitle', text: it.h2 } : it.block),
        );
        if (b) blocks.push(b);
      }
    }

    // the first plain paragraph on a cover / section / cta slide is its subtitle
    const subtitleKind = kind ?? (index === 0 ? 'cover' : undefined);
    if (SUBTITLE_KINDS.has(subtitleKind)) {
      const first = blocks.find((b) => b.type === 'paragraph');
      if (first) first.type = 'subtitle';
    }

    const slide = { id, blocks };
    if (kind) slide.kind = kind;
    return slide;
  });

  if (!slides.length) throw new Error('parseMarkdown: no slides (a slide starts with "# Title")');
  const content = { schema: 'content/1', ...(title ? { title } : {}), slides };
  const errors = validateContent(content);
  if (errors.length) {
    throw new Error(
      `parsed Content is invalid against schemas/content.schema.json:\n${errors
        .slice(0, 10)
        .map((e) => `  ${e.pointer} ${e.message}`)
        .join('\n')}`,
    );
  }
  return { content, warnings };
}

/**
 * parseMarkdown(md, {brandSpec}) -> Content (P2-spec §1). Warnings (dropped blocks, unknown fences) are pushed into
 * `opts.warnings` when an array is given; use `parseMarkdownResult` to get them returned.
 */
export function parseMarkdown(md, opts = {}) {
  const { content, warnings } = parseMarkdownResult(md, opts);
  if (Array.isArray(opts.warnings)) opts.warnings.push(...warnings);
  return content;
}
