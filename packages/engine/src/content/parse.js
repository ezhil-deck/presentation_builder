/**
 * Markdown -> Content (schemas/content.schema.json v2.0), P2-spec §1 + docs/S2-content-v2.md. Deterministic, no
 * network, no AI. A document written in the P2 grammar only is read exactly as before and stays `content/1` (so the
 * golden decks keep their content hash); a document that uses any content/2 construct - a slide front (a YAML `---`
 * fence right under the `# ` heading), a content/2 fence (points, items, subpoints, process, quotes, quote, compare,
 * paragraph, image), a content/2 field in a shared fence, or `schema: content/2` in the front matter / options - is
 * read as `content/2`: its P2 constructs are upgraded (upgrade.js) and every block is a content/2 block.
 *
 * Grammar notes where §1 leaves a choice (listed in the P2 report):
 * - one source line = one paragraph (a slide line is a line; consecutive lines are not joined);
 * - paragraph / title text keeps its inline markdown (the content schema says text is inline markdown); the composer
 *   turns it into runs with `parseInline`;
 * - `<!-- kind: X -->` is read anywhere in the slide; other HTML comments are ignored.
 */
import { parse as parseYaml } from 'yaml';
import { validateBlock, validateContent } from '../validate.js';
import { blockWarnings, slideWarnings } from './blocks.js';
import { SHARED_FENCES, V2_FENCES, fenceBlockV2, sharedFenceIsV2 } from './fences.js';
import { lowerSlide } from './lower.js';
import { validateBlockV2 } from './schema.js';
import { orderSlide, upgradeSlide } from './upgrade.js';

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
export function parseFenceYaml(raw, options) {
  try {
    return { data: parseYaml(raw, options), repaired: false };
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
    return { data: parseYaml(fixed, options), repaired: true };
  }
}

/**
 * Slide body lines -> {kind, items: [{block} | {h2}]}. `fenceHook(name, raw)` (content/2) builds a fence's item;
 * without it the P2 fences are read as before.
 */
function parseBody(lines, warn, slideNo, fenceHook) {
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
      if (fenceHook) {
        items.push(fenceHook(name, raw));
        continue;
      }
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
      // content/2: the attribution may also be the quote's last line (`> — Name, Role`, as Prettier writes it)
      const inside = fenceHook && parts.length > 1 ? /^(?:—|--)\s*(.+)$/.exec(parts[parts.length - 1]) : null;
      if (inside) parts.pop();
      const block = { type: 'quote', text: parts.join(' ').trim() };
      const next = i < lines.length ? lines[i].trim() : '';
      const attrM = inside ?? /^(?:—|--)\s*(.+)$/.exec(next);
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
        if (!inside) i += 1;
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

/** The P2 inference (P2-spec §1) on a v1-shaped block list; `skip` = block types that do not count (content/2: eyebrow). */
function inferFromBlocks(blocks, { index, count, skip } = {}) {
  const has = (type) => blocks.some((b) => b.type === type);
  if (index === 0) return 'cover';
  if (count !== undefined && index === count - 1 && has('cta')) return 'cta';
  const rest = blocks.filter((b) => b.type !== 'title' && !skip?.has(b.type));
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

const SECTION_SKIP = new Set(['eyebrow', 'number']);

/**
 * The slide kind when `slide.kind` is absent (P2-spec §1). `index` / `count` enable the position rules (first slide ->
 * cover; last slide with a `cta` block -> cta). A content/2 slide is read through its aliases onto today's kinds
 * (docs/S2-content-v2.md §5: points -> bullets, items / subpoints -> cards, process -> steps, quotes -> quote, people
 * -> team, compare -> two-column, paragraph -> text, image -> image, or image-text with `treatment: side` or text);
 * its label does not count against a section (title + subtitle [+ label, number]).
 */
export function inferKind(slide, { index, count } = {}) {
  const lowered = lowerSlide(slide);
  if (!lowered.changed) return inferFromBlocks(slide?.blocks ?? [], { index, count });
  const kind = inferFromBlocks(lowered.slide.blocks, { index, count, skip: SECTION_SKIP });
  const side = (slide.blocks ?? []).some((b) => b.type === 'image' && b.treatment === 'side');
  return kind === 'image' && side ? 'image-text' : kind;
}

const FRONT_KEYS = new Set([
  'label',
  'subtitle',
  'number',
  'background',
  'cta',
  'kind',
  'surface',
  'layout',
  'notes',
  'decor',
  'logo',
]);

/** The slide front (YAML mapping under the heading) -> {keys, kind}; failsafe YAML so "01" stays "01". */
function readFront(lines, warn) {
  if (!lines) return { keys: {} };
  let data;
  try {
    data = parseFenceYaml(lines.join('\n'), { schema: 'failsafe' }).data;
  } catch (err) {
    warn(`slide front is not valid YAML (${err.message}): ignored`);
    return { keys: {} };
  }
  if (data === null || data === undefined || data === '') return { keys: {} };
  if (typeof data !== 'object' || Array.isArray(data)) {
    warn('slide front must be a YAML mapping of slide keys: ignored');
    return { keys: {} };
  }
  const keys = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'title') {
      warn('slide front "title" ignored: the "# " heading is the title');
      continue;
    }
    if (!FRONT_KEYS.has(k)) {
      warn(`slide front: unknown key "${k}" ignored`);
      continue;
    }
    if (v === '' || v === null || v === undefined) continue;
    if (k === 'decor' || k === 'logo') {
      if (v === 'true' || v === 'false') keys[k] = v === 'true';
      else warn(`slide front "${k}" must be true or false: ignored`);
      continue;
    }
    if (typeof v === 'object') {
      warn(`slide front "${k}" must be text: ignored`);
      continue;
    }
    keys[k] = String(v);
  }
  return { keys };
}

/** Does this split document use any content/2 construct? (docs/S2-content-v2.md §1) */
function usesV2(raw) {
  for (const r of raw) {
    if (r.front) return true;
    let fence = null;
    let body = [];
    for (const line of r.lines) {
      const t = line.trim();
      if (fence === null) {
        const m = /^```\s*([A-Za-z0-9_-]*)\s*$/.exec(t);
        if (m) {
          fence = m[1];
          body = [];
        }
        continue;
      }
      if (t !== '```') {
        body.push(line);
        continue;
      }
      if (V2_FENCES.includes(fence)) return true;
      if (SHARED_FENCES.includes(fence)) {
        try {
          if (sharedFenceIsV2(fence, parseFenceYaml(body.join('\n')).data)) return true;
        } catch {
          // invalid YAML: the version-specific reader reports it
        }
      }
      fence = null;
    }
  }
  return false;
}

/**
 * md -> {content, warnings}. Throws only when the assembled Content fails its schema (a parser bug).
 * `keepPlaceholders: true` leaves `{brand.*}` placeholders as written (a content document independent of the brand,
 * the Studio's Markdown import: they are resolved at compose time by `resolveContentPlaceholders`).
 */
export function parseMarkdownResult(md, { brandSpec, schema, keepPlaceholders = false } = {}) {
  const warnings = [];
  const warn = (slide, message, severity = 'warn') =>
    warnings.push({ check: 'content', severity, message, ...(slide ? { slide } : {}) });
  const lines = String(md ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  let start = 0;
  let title;
  let fmSchema;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    const close = end > 0 ? end : lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (close > 0) {
      try {
        const fm = parseYaml(lines.slice(1, close).join('\n')) ?? {};
        if (typeof fm.title === 'string') title = fm.title;
        if (typeof fm.schema === 'string') fmSchema = fm.schema;
      } catch (err) {
        warn(null, `front matter is not valid YAML (${err.message}): ignored`);
      }
      start = close + 1;
    }
  }

  // split into slides at `# ` outside fences; a `---` fence right under the heading is the slide front
  const raw = [];
  let cur = null;
  let inFence = false;
  let front = null; // 'open' while reading a slide front
  for (const line of lines.slice(start)) {
    const t = line.trim();
    if (front === 'open') {
      if (t === '---') front = null;
      else cur.front.push(line);
      continue;
    }
    if (!inFence && /^```/.test(t)) inFence = true;
    else if (inFence && t === '```') inFence = false;
    else if (!inFence && /^#\s+/.test(t)) {
      cur = { title: t.replace(/^#\s+/, '').trim(), lines: [], front: null };
      raw.push(cur);
      continue;
    } else if (!inFence && cur && t === '---' && cur.front === null && cur.lines.every((l) => !l.trim())) {
      cur.front = [];
      front = 'open';
      continue;
    }
    if (!cur) {
      if (t) warn(null, `text before the first "# " heading ignored: "${t.slice(0, 40)}"`);
      continue;
    }
    cur.lines.push(line);
  }
  if (front === 'open')
    warn(raw[raw.length - 1] ? `s${raw.length}` : null, 'slide front "---" is not closed');

  const v2 = schema === 'content/2' || fmSchema === 'content/2' || usesV2(raw);

  // placeholders: a block whose placeholder cannot be resolved is dropped (never left as literal braces)
  const resolveBlock = (id, block) => {
    if (keepPlaceholders) return block;
    const missing = [];
    const value = resolveDeep(block, brandSpec, missing);
    if (missing.length) {
      warn(id, `${block.type} block dropped: unresolvable placeholder ${[...new Set(missing)].join(', ')}`);
      return null;
    }
    return value;
  };

  const slides = raw.map((r, index) => {
    const id = `s${index + 1}`;
    const v2Blocks = new WeakSet(); // blocks that are content/2 already (fences read by fenceBlockV2)
    const fenceHook = v2
      ? (name, body) => {
          if (
            !V2_FENCES.includes(name) &&
            !SHARED_FENCES.includes(name) &&
            !['cards', 'steps'].includes(name)
          ) {
            warn(id, `unknown fenced block "${name || '(none)'}": kept as a paragraph`);
            return { block: { type: 'paragraph', text: body } };
          }
          try {
            const { data, repaired } = parseFenceYaml(body, { schema: 'failsafe' });
            if (repaired)
              warn(id, `fenced block "${name}": values containing ": " were read as quoted strings`, 'info');
            const block = fenceBlockV2(name, data, body, (m, s) => warn(id, m, s));
            v2Blocks.add(block);
            return { block };
          } catch (err) {
            if (name === 'paragraph') {
              warn(
                id,
                `fenced block "paragraph" is not YAML text (${err.message}): read as plain text`,
                'info',
              );
              const block = { type: 'paragraph', text: body.trim() };
              v2Blocks.add(block);
              return { block };
            }
            warn(
              id,
              `fenced block "${name}" is not valid YAML for its type (${err.message}): kept as a paragraph`,
            );
            return { block: { type: 'paragraph', text: body } };
          }
        }
      : undefined;
    const { kind, items } = parseBody(r.lines, (no, msg, sev) => warn(id, msg, sev), index + 1, fenceHook);

    const resolve = (block) => {
      const out = resolveBlock(id, block);
      if (out && v2Blocks.has(block)) v2Blocks.add(out);
      return out;
    };
    const checkBlock = (block) => {
      if (!block) return null;
      const isV2 = v2Blocks.has(block);
      const errors = isV2 ? validateBlockV2(block) : validateBlock(block);
      if (errors.length) {
        const where = isV2 && errors[0].pointer ? `${errors[0].pointer} ` : '';
        warn(id, `${block.type} block dropped: not a valid content block (${where}${errors[0].message})`);
        return null;
      }
      return block;
    };

    const blocks = [];
    const titleBlock = checkBlock(resolve({ type: 'title', text: r.title }));
    if (titleBlock) blocks.push(titleBlock);

    const h2Count = items.filter((it) => it.h2 !== undefined).length;
    if (h2Count >= 2) {
      const columns = [];
      for (const it of items) {
        if (it.h2 !== undefined) {
          const col = { blocks: [] };
          const resolved = resolve({ type: 'subtitle', text: it.h2 });
          if (resolved) col.title = resolved.text;
          columns.push(col);
        } else {
          const b = checkBlock(resolve(it.block));
          if (!b) continue;
          if (columns.length) columns[columns.length - 1].blocks.push(b);
          else blocks.push(b);
        }
      }
      blocks.push({ type: 'columns', items: columns });
    } else {
      for (const it of items) {
        const b = checkBlock(resolve(it.h2 !== undefined ? { type: 'subtitle', text: it.h2 } : it.block));
        if (b) blocks.push(b);
      }
    }

    // content/2 slide front (resolved like a block; an unresolvable key is dropped)
    const frontKeys = {};
    if (v2 && r.front) {
      const { keys } = readFront(r.front, (m, s) => warn(id, m, s));
      for (const [k, v] of Object.entries(keys)) {
        if (typeof v !== 'string' || keepPlaceholders) {
          frontKeys[k] = v;
          continue;
        }
        const missing = [];
        const value = resolveDeep(v, brandSpec, missing);
        if (missing.length)
          warn(id, `slide key "${k}" dropped: unresolvable placeholder ${[...new Set(missing)].join(', ')}`);
        else frontKeys[k] = value;
      }
    }
    const slideKind = frontKeys.kind ?? kind;
    delete frontKeys.kind;

    // the first plain paragraph on a cover / section / cta slide is its subtitle
    const subtitleKind = slideKind ?? (index === 0 ? 'cover' : undefined);
    if (SUBTITLE_KINDS.has(subtitleKind) && frontKeys.subtitle === undefined) {
      const first = blocks.find((b) => b.type === 'paragraph' && !v2Blocks.has(b));
      if (first) first.type = 'subtitle';
    }

    if (!v2) {
      const slide = { id, blocks };
      if (kind) slide.kind = kind;
      return slide;
    }

    const v1Slide = { id, ...(slideKind ? { kind: slideKind } : {}), blocks };
    const upgraded = upgradeSlide(v1Slide, {
      isV2: (b) => v2Blocks.has(b),
      warn: (m, s) => warn(id, m, s),
      keys: frontKeys,
    });
    upgraded.blocks = upgraded.blocks.filter((b) => {
      const errors = validateBlockV2(b);
      if (errors.length) {
        warn(
          id,
          `${b.type} block dropped: not a valid content/2 block (${errors[0].pointer} ${errors[0].message})`,
        );
        return false;
      }
      for (const w of blockWarnings(b)) warn(id, w.message, w.severity);
      return true;
    });
    for (const w of slideWarnings(upgraded)) warn(id, w.message, w.severity);
    return orderSlide(upgraded);
  });

  if (!slides.length) throw new Error('parseMarkdown: no slides (a slide starts with "# Title")');
  const content = { schema: v2 ? 'content/2' : 'content/1', ...(title ? { title } : {}), slides };
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

const SLIDE_TEXT_KEYS = ['label', 'title', 'subtitle', 'number', 'background', 'cta', 'notes'];

/**
 * A content document's `{brand.*}` placeholders resolved for one brand, as the Markdown reader resolves them: a slide
 * key whose placeholder cannot be resolved is dropped, a block with one is dropped (never left as literal braces),
 * each with a content warning. Returns {content, warnings, blockIndex: {[slideId]: [original index of each kept
 * block]}} - `blockIndex` only for slides that lost a block (remapSourcePaths turns the deck's pointers back).
 */
export function resolveContentPlaceholders(doc, brandSpec) {
  const warnings = [];
  const blockIndex = {};
  const slides = (doc?.slides ?? []).map((slide, i) => {
    const id = slide.id ?? `s${i + 1}`;
    const out = { ...slide };
    for (const k of SLIDE_TEXT_KEYS) {
      if (typeof slide[k] !== 'string' || !slide[k].includes('{brand.')) continue;
      const missing = [];
      const v = resolveDeep(slide[k], brandSpec, missing);
      if (missing.length) {
        delete out[k];
        warnings.push({
          check: 'content',
          severity: 'warn',
          slide: id,
          message: `slide key "${k}" dropped: unresolvable placeholder ${[...new Set(missing)].join(', ')}`,
        });
      } else out[k] = v;
    }
    const kept = [];
    const blocks = [];
    (slide.blocks ?? []).forEach((b, j) => {
      const missing = [];
      const v = resolveDeep(b, brandSpec, missing);
      if (missing.length) {
        warnings.push({
          check: 'content',
          severity: 'warn',
          slide: id,
          message: `${b?.type} block dropped: unresolvable placeholder ${[...new Set(missing)].join(', ')}`,
        });
        return;
      }
      kept.push(j);
      blocks.push(v);
    });
    out.blocks = blocks;
    if (kept.length !== (slide.blocks ?? []).length) blockIndex[id] = kept;
    return out;
  });
  return { content: { ...doc, slides }, warnings, blockIndex };
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
