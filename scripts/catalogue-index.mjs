#!/usr/bin/env node
// The Rich Slide Catalogue index: reads golden/catalogue/rich-slide-catalogue.html (the owner's hand-written reference,
// 1,646 slides as HTML) and writes golden/catalogue/index.json, one record per slide plus the coverage table and the
// content-length plans. No dependencies: the HTML is machine-written and regular, so a few regexes and a tag matcher
// read it. Anything that does not fit the model throws (no guessing); text is kept as written (entities decoded,
// HTML whitespace collapsed, typography untouched).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const ARTIFACT_URL = 'https://claude.ai/artifact/7qR3iQpw2HeNuVjWKNtSFa';

/** Section -> the id prefix its figures carry. */
export const SECTION_PREFIX = { blocks: 'B', common: 'C', presets: 'P', shapes: 'S', plan: 'L' };
const ID_PATTERN = {
  blocks: /^B\d+$/,
  common: /^C\d+$/,
  presets: /^P\d+$/,
  shapes: /^S\d+$/,
  plan: /^L\d+-\d+$/,
};

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the HTML entities (named: amp lt gt quot apos nbsp; numeric: decimal and hex). An unknown name throws. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()];
    if (named === undefined) throw new Error(`catalogue: unknown HTML entity ${whole}`);
    return named;
  });
}

/** Visible text of an HTML fragment: tags dropped, entities decoded, runs of ASCII whitespace collapsed (as HTML renders). */
export function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/[ \t\r\n\f]+/g, ' ')
    .trim();
}

/** The attributes of one start tag's attribute string, entity-decoded. */
export function parseAttrs(attrText) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrText))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

const classTokens = (attrs) => (attrs.class || '').split(/\s+/).filter(Boolean);

/** Every start tag in `html`: { tag, attrs, start, end } (end = index after '>'). */
function startTags(html) {
  const out = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = re.exec(html)))
    out.push({ tag: m[1].toLowerCase(), attrs: parseAttrs(m[2]), start: m.index, end: re.lastIndex });
  return out;
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** The inner HTML of the element whose start tag ends at `from`, matching nested tags of the same name. */
function innerHtml(html, tag, from) {
  if (VOID.has(tag)) return '';
  const re = new RegExp(`<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*?(/?)>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) depth -= 1;
    else if (!m[2]) depth += 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  throw new Error(`catalogue: <${tag}> opened at ${from} is never closed`);
}

/** The first element carrying class token `cls` among `tags` (from startTags of `html`), as its text, or null. */
function firstClassText(html, tags, cls) {
  const t = tags.find((x) => classTokens(x.attrs).includes(cls));
  return t ? textOf(innerHtml(html, t.tag, t.end)) : null;
}

const strip = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');

/** The figcaption: <b>id · name</b>, spans (spec, span.ax, span.shape), <p> description. */
function parseCaption(id, html) {
  const b = /<b>([\s\S]*?)<\/b>/.exec(html);
  if (!b) throw new Error(`catalogue: ${id}: figcaption has no <b>`);
  const head = textOf(b[1]);
  if (!head.startsWith(`${id} · `))
    throw new Error(`catalogue: ${id}: caption <b> "${head}" does not start "${id} · "`);
  const cap = { name: head.slice(id.length + 3), spec: null, axes: null, shape: null, description: null };
  const spanRe = /<span((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = spanRe.exec(html))) {
    const cls = classTokens(parseAttrs(m[1]));
    const key = cls.includes('ax')
      ? 'axes'
      : cls.includes('shape')
        ? 'shape'
        : cls.length === 0
          ? 'spec'
          : null;
    if (!key) throw new Error(`catalogue: ${id}: caption span with unknown class "${cls.join(' ')}"`);
    if (cap[key] !== null) throw new Error(`catalogue: ${id}: caption has two ${key} spans`);
    cap[key] = textOf(m[2]);
  }
  const p = /<p>([\s\S]*?)<\/p>/.exec(html);
  if (p) cap.description = textOf(p[1]);
  return cap;
}

/** The content containers of a plan slide, from the data-c / data-type / data-f / data-i markers. */
function parseContainers(id, tags) {
  const byC = new Map();
  const get = (c) => {
    if (!byC.has(c)) byC.set(c, { c, type: null, fields: {} });
    return byC.get(c);
  };
  for (const { attrs } of tags) {
    if (!('data-c' in attrs)) continue;
    const c = Number(attrs['data-c']);
    if (!Number.isInteger(c))
      throw new Error(`catalogue: ${id}: data-c="${attrs['data-c']}" is not a number`);
    const box = get(c);
    if ('data-type' in attrs) {
      if (box.type !== null && box.type !== attrs['data-type'])
        throw new Error(`catalogue: ${id}: container ${c} is both ${box.type} and ${attrs['data-type']}`);
      box.type = attrs['data-type'];
    }
    if ('data-f' in attrs) {
      const f = attrs['data-f'];
      box.fields[f] = (box.fields[f] || 0) + 1;
    }
  }
  const list = [...byC.values()].sort((a, b) => a.c - b.c);
  for (const box of list)
    if (box.type === null)
      throw new Error(`catalogue: ${id}: container ${box.c} has fields but no data-type`);
  return list;
}

/** One <figure class="it"> -> a slide record. `ctx` = { section, plan, row, family } from the headings around it. */
export function parseFigure(attrText, body, ctx = {}) {
  const fa = parseAttrs(attrText);
  const id = fa.id;
  if (!id) throw new Error(`catalogue: a <figure> has no id (${attrText.trim().slice(0, 80)})`);
  const section = fa['data-sec'];
  if (!ID_PATTERN[section]) throw new Error(`catalogue: ${id}: unknown data-sec "${section}"`);
  if (!ID_PATTERN[section].test(id))
    throw new Error(`catalogue: ${id}: id does not match section ${section}`);
  if (ctx.section && ctx.section !== section)
    throw new Error(`catalogue: ${id}: data-sec "${section}" inside the "${ctx.section}" section`);

  const capM = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(body);
  if (!capM) throw new Error(`catalogue: ${id}: no <figcaption>`);
  const slideHtml = body.slice(0, capM.index);
  const tags = startTags(slideHtml);
  const slideTag = tags.find((t) => classTokens(t.attrs).includes('slide'));
  if (!slideTag) throw new Error(`catalogue: ${id}: no .slide`);
  const inner = innerHtml(slideHtml, slideTag.tag, slideTag.end);
  const innerTags = startTags(inner);
  const cap = parseCaption(id, capM[1]);

  const slide = { id, section };
  if (section === 'plan') {
    const n = Number(/^L(\d+)-/.exec(id)[1]);
    if (ctx.plan !== undefined && ctx.plan !== n)
      throw new Error(`catalogue: ${id}: sits under Plan ${ctx.plan}, its id says Plan ${n}`);
    slide.plan = n;
    if (ctx.row) slide.row = ctx.row;
    if (ctx.family) slide.family = ctx.family;
  }
  slide.name = cap.name;
  slide.spec = cap.spec;
  if (cap.axes !== null) slide.axes = cap.axes;
  if (cap.shape !== null) slide.shape = cap.shape;
  slide.description = cap.description;
  slide.kicker = firstClassText(inner, innerTags, 'k');
  slide.title = firstClassText(inner, innerTags, 't');
  slide.dark = classTokens(slideTag.attrs).includes('dark');
  const rot = slideTag.attrs['data-rot'];
  slide.rot = rot === undefined ? null : Number(rot);

  if (section === 'presets') {
    const m = /^(\S+) · (\d+) presets?$/.exec(cap.spec || '');
    if (!m)
      throw new Error(`catalogue: ${id}: preset spec "${cap.spec}" is not "<combination> · <n> presets"`);
    slide.code = m[1];
    slide.presetCount = Number(m[2]);
  }
  if (section === 'shapes') {
    const m = /^(\S+) · \d+ blocks?$/.exec(cap.spec || '');
    if (!m) throw new Error(`catalogue: ${id}: shape spec "${cap.spec}" is not "<code> · <n> blocks"`);
    slide.code = m[1];
  }
  if (section === 'plan') slide.fields = parseContainers(id, innerTags);
  const v = /\bvariant of ([A-Z]\d+(?:-\d+)?)\b/.exec(cap.spec || '');
  if (v) slide.variantOf = v[1];
  return slide;
}

/** The Coverage table rows. */
function parseCoverage(html) {
  const i = html.indexOf('<h2>Coverage</h2>');
  if (i < 0) throw new Error('catalogue: no Coverage heading');
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html.slice(i));
  if (!tbody) throw new Error('catalogue: the Coverage table has no <tbody>');
  return [...tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (cells.length !== 5)
      throw new Error(`catalogue: a Coverage row has ${cells.length} cells, expected 5`);
    const go = /data-go="([^"]*)"/.exec(cells[0]);
    return {
      section: textOf(cells[0]),
      key: go ? go[1] : null,
      ids: textOf(cells[1]),
      slides: textOf(cells[2]),
      covers: textOf(cells[3]),
      status: textOf(cells[4]),
    };
  });
}

/** Parses the whole catalogue HTML -> { title, coverage, sections, plans, slides } (throws on anything off-model). */
export function parseCatalogue(rawHtml) {
  const html = strip(rawHtml);
  const titleM = /<title>([\s\S]*?)<\/title>/.exec(html);

  // Markers in document order: section starts, plan headings, row and family labels, figures.
  const marks = [];
  for (const m of html.matchAll(/<section\b[^>]*\bdata-sec="([^"]*)"[^>]*>/g))
    marks.push({ at: m.index, kind: 'section', value: m[1] });
  for (const m of html.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p class="pls">([\s\S]*?)<\/p>/g))
    marks.push({ at: m.index, kind: 'plan', title: textOf(m[1]), pls: textOf(m[2]) });
  for (const m of html.matchAll(/<div class="plh">([\s\S]*?)<\/div>/g))
    marks.push({ at: m.index, kind: 'row', value: textOf(m[1]) });
  for (const m of html.matchAll(/<div class="fl">([\s\S]*?)<\/div>/g))
    marks.push({ at: m.index, kind: 'family', value: textOf(m[1]) });
  for (const m of html.matchAll(/<figure\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/figure>/g))
    marks.push({ at: m.index, kind: 'figure', attrs: m[1], body: m[2] });
  marks.sort((a, b) => a.at - b.at);

  const plans = [];
  const slides = [];
  const seen = new Set();
  const ctx = {};
  for (const mk of marks) {
    if (mk.kind === 'section') {
      Object.keys(ctx).forEach((k) => delete ctx[k]);
      ctx.section = mk.value;
    } else if (mk.kind === 'plan') {
      const h = /^Plan (\d+) · (.+)$/.exec(mk.title);
      const p = /^(\d+) layouts? in (\d+) famil(?:y|ies)\b/.exec(mk.pls);
      if (!h || !p) throw new Error(`catalogue: plan heading "${mk.title}" / "${mk.pls}" off-model`);
      plans.push({
        n: Number(h[1]),
        title: mk.title,
        combination: h[2],
        layouts: Number(p[1]),
        families: Number(p[2]),
      });
      ctx.plan = Number(h[1]);
      delete ctx.row;
      delete ctx.family;
    } else if (mk.kind === 'row') {
      ctx.row = mk.value;
      delete ctx.family;
    } else if (mk.kind === 'family') {
      ctx.family = mk.value;
    } else {
      const slide = parseFigure(mk.attrs, mk.body, ctx);
      if (seen.has(slide.id)) throw new Error(`catalogue: duplicate id ${slide.id}`);
      seen.add(slide.id);
      slides.push(slide);
    }
  }

  const sections = { blocks: 0, common: 0, presets: 0, shapes: 0, plan: 0 };
  for (const s of slides) sections[s.section] += 1;
  sections.total = slides.length;

  return {
    title: titleM ? textOf(titleM[1]) : null,
    coverage: html.includes('<h2>Coverage</h2>') ? parseCoverage(html) : [],
    sections,
    plans,
    slides,
  };
}

function main() {
  const root = resolve(dirname(process.argv[1]), '..');
  const src = join(root, 'golden/catalogue/rich-slide-catalogue.html');
  const out = join(root, 'golden/catalogue/index.json');
  const raw = readFileSync(src, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  // Keep the extraction date while the source is unchanged, so a re-run does not churn the checked-in file.
  let extracted = new Date().toISOString().slice(0, 10);
  if (existsSync(out)) {
    const prev = JSON.parse(readFileSync(out, 'utf8'));
    if (prev.source?.sha256 === sha256 && prev.source.extracted) extracted = prev.source.extracted;
  }
  const { title, coverage, sections, plans, slides } = parseCatalogue(raw);
  const index = {
    source: {
      title,
      artifactUrl: ARTIFACT_URL,
      file: 'golden/catalogue/rich-slide-catalogue.html',
      sha256,
      extracted,
    },
    coverage,
    sections,
    plans,
    slides,
  };
  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`catalogue: ${slides.length} slides, ${plans.length} plans -> ${out}`);
}

if (process.argv[1] && basename(process.argv[1]) === 'catalogue-index.mjs') main();
