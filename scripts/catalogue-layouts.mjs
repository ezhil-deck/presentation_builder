#!/usr/bin/env node
// The catalogue layouts (C3, docs/PLAN-catalogue.md §3 / §4): one record per content-length plan slide of the Rich
// Slide Catalogue (golden/catalogue/index.json + geometry.json) -> packages/layouts/data/catalogue-layouts.json, which
// packages/layouts/src/catalogue-defs.js turns into a LayoutDef each. No dependencies (node + the pure key module), no
// browser: the geometry was measured once by scripts/catalogue-geometry.mjs.
//
//   npm run catalogue:layouts      (node scripts/catalogue-layouts.mjs + prettier on the output)
//
// A record keeps the catalogue's COMPOSITION only: where each container sits (a zone as fractions of the catalogue's
// body box, snapped to a 12-column grid), how its items flow, which block of ours it takes, the type role each field's
// size band asks for, and whether the catalogue draws its items as cards. Its colours, faces, grounds, rules and
// hairlines are never read (CLAUDE.md rule 3; D5).
//
// Rules (each one a function below):
// - combination: the containers in data-c order, `data-type` -> our content/2 block (TYPE_BLOCK; `title` -> none);
//   node count = the container's largest field count; bands from the spec string, each band field assigned to the one
//   container carrying that field. A band that is not in catalogue-key.js BANDS fails the run.
// - grid: the 12-column gutter is MEASURED (the candidate gutter whose grid lines lie nearest to the containers' inner
//   edges); zone x / w snap to {col, span} on it.
// - zone: the container's extent (box + its parallel items) as fractions of the body box; `group` = the vertical union
//   of the zones (body fractions): the build stretches the group to the Mood's body area (the catalogue centres it).
// - flow: the item boxes (union of a container's fields per data-i): every item its own column -> row; every item its
//   own row -> column; else a grid of the distinct columns.
// - roles (size band of the measured font size): >= 80 px -> display (a figure: the larger of display / stat at
//   build); at least the slide title's size (56.23 px) -> h1 (a figure: stat); 44 px up to the title -> h2; 28-43 ->
//   h3 for headings and values, body for description / bullet / body / paragraph / point / row; < 28 -> bodySmall;
//   a `label` field -> eyebrow (the catalogue marks none). (C3.1 added the title step and display figures.)
// - placement (C3.1): `place` = where the content sits in the zone (fill / top / middle / bottom + its empty share),
//   `itemAlign` = where the first item's fields sit in the item; `numbered` = the item carries an unmarked numeral.
// - card: the container's marked element, or an element from its first field up to its item, carries class `card`;
//   C3.2 (D6): or the catalogue separates / frames it with rules (geometry `rules`: top / bottom / left / right /
//   between / inner; a roadmap's or timeline's own `axis` does not count) and it is a block the build draws on cards
//   (`cardSource`: 'class' / 'rule'). Charts and tables keep no card.
// - numeral (C3.2, D7): a steps / timeline container, or a numbered one, whose first item carries a numeral / year
//   larger than its running text gets `numeral` {role (the size band: display >= 80 px, h1 >= the title's size, h2
//   44 px up, else h3), place (above / beside the fields), share (of the item's height / width up to its fields)}; the
//   numeral counts as content for `place` (the fill target). A roadmap whose label names a year or is not an ordinal
//   (2026, Phase 1 · 2026, Now / Today, a region) gets `labels: 'year'` (D8).
// - cells: a container whose extent takes in another container's (KPIs flanking a chart, a list in a grid's sixth
//   cell) keeps its item boxes as `flow.cells` ({col, span} on the grid, y / h fractions of its zone), so the other
//   block's zone stays free.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BANDS, FIELD_ORDER, combinationKey } from '../packages/layouts/src/catalogue-key.js';

/** Catalogue `data-type` -> our content/2 block type (null: the container is the slide title). */
export const TYPE_BLOCK = Object.freeze({
  kpi_block: 'kpis',
  kpi_vb: 'kpis',
  simple_list: 'points',
  list_with_description: 'items',
  list_with_subpoints: 'subpoints',
  multi_column_list: 'items',
  comparison: 'compare',
  // roadmap -> process (linear): every roadmap marks only a heading and a description per phase; its phase label is
  // an ordinal (Step 1, Phase 1, 01, a numbered row) on 35 of the 54 slides - the steps number marker - and a year,
  // Now / Today or a region on the other 19, which content/2 process nodes cannot carry (no label field). The
  // catalogue's own timeline plans (19, 22, 32) mark the year inside the heading; keeping roadmaps on `process` also
  // gives content/2 process slides a catalogue composition instead of a second key for timeline slides.
  roadmap: 'process',
  timeline: 'timeline',
  timeline_with_list: 'timeline',
  chart: 'chart',
  table: 'table',
  paragraph: 'paragraph',
  title: null,
});

/** Our block -> the slide kind it is inferred as (engine content/parse.js inferKind, content/2 aliases). */
export const BLOCK_KIND = Object.freeze({
  kpis: 'kpi',
  chart: 'chart',
  table: 'table',
  items: 'cards',
  subpoints: 'cards',
  process: 'steps',
  timeline: 'timeline',
  compare: 'two-column',
  points: 'bullets',
  paragraph: 'text',
});
/** inferKind's priority among those kinds (the first present wins; none -> text). */
export const KIND_ORDER = Object.freeze([
  'kpi',
  'chart',
  'table',
  'cards',
  'steps',
  'timeline',
  'two-column',
  'bullets',
  'text',
]);

/** Spec field words -> the plan field (catalogue `data-f`). */
const SPEC_FIELD = { heading: 'heading', description: 'description', value: 'value', body: 'body' };
SPEC_FIELD.bullets = 'bullet';
SPEC_FIELD.bullet = 'bullet';
SPEC_FIELD.paragraph = 'paragraph';
/** Catalogue fields that carry a length band. */
const BANDED = new Set(['heading', 'description', 'value', 'body', 'bullet', 'paragraph']);

/** Blocks drawn as a flow of items (a chart / table / paragraph is one box: its items are not cells). */
const FLOW_BLOCKS = new Set(['kpis', 'points', 'items', 'subpoints', 'process', 'timeline', 'compare']);

const COLUMNS = 12;
const GUTTER_CANDIDATES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
/** px: item edges closer than this are one column / row of the flow. */
const FLOW_TOLERANCE = 16;

const r4 = (v) => Math.round(v * 10000) / 10000;
const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
};

/** The bands a spec string names: {field: 'lo-hi'}; a field named twice, or a band BANDS lacks, throws. */
export function specBands(id, spec) {
  const out = {};
  for (const m of String(spec).matchAll(/([a-z]+) (\d+)–(\d+)/g)) {
    const field = SPEC_FIELD[m[1]];
    if (!field) throw new Error(`${id}: spec "${spec}": unknown band field "${m[1]}"`);
    const band = `${m[2]}-${m[3]}`;
    if (!(BANDS[field] ?? []).some(([lo, hi]) => `${lo}-${hi}` === band))
      throw new Error(`${id}: spec "${spec}": band ${field} ${band} is not in catalogue-key.js BANDS`);
    if (out[field]) throw new Error(`${id}: spec "${spec}": field ${field} has two bands`);
    out[field] = band;
  }
  return out;
}

/**
 * The 12-column gutter the catalogue's containers sit on: of GUTTER_CANDIDATES, the one whose grid lines lie nearest
 * (mean px) to every inner container edge (left edges to column starts, right edges to column ends; the body's own
 * edges left out: every gutter puts them on a line).
 */
export function measureGrid(slides) {
  const lefts = [];
  const rights = [];
  for (const g of slides) {
    for (const c of g.containers ?? []) {
      if (c.type === 'title') continue;
      const b = c.extent ?? c.box;
      const l = b.x - g.body.x;
      const r = b.x + b.w - g.body.x;
      if (l > 2) lefts.push({ e: l, w: g.body.w });
      if (r < g.body.w - 2) rights.push({ e: r, w: g.body.w });
    }
  }
  const fit = GUTTER_CANDIDATES.map((gutter) => {
    let sum = 0;
    let within = 0;
    for (const { e, w } of lefts) {
      const p = (w + gutter) / COLUMNS;
      const d = Math.abs(e - Math.round(e / p) * p);
      sum += d;
      if (d <= 1) within += 1;
    }
    for (const { e, w } of rights) {
      const p = (w + gutter) / COLUMNS;
      const d = Math.abs(e - (Math.round((e + gutter) / p) * p - gutter));
      sum += d;
      if (d <= 1) within += 1;
    }
    const n = lefts.length + rights.length;
    return {
      gutter,
      meanPx: Math.round((sum / n) * 100) / 100,
      within1px: Math.round((within / n) * 1000) / 10,
    };
  });
  const best = fit.reduce((a, b) => (b.meanPx < a.meanPx ? b : a));
  return { columns: COLUMNS, gutter: best.gutter, edges: lefts.length + rights.length, fit };
}

/** {col, span} of a horizontal extent on the 12-column grid over the body (gutter px). */
export function snapGrid(x, w, bodyW, gutter) {
  const p = (bodyW + gutter) / COLUMNS;
  const col = Math.min(COLUMNS - 1, Math.max(0, Math.round(x / p)));
  const end = Math.min(COLUMNS, Math.max(col + 1, Math.round((x + w + gutter) / p)));
  return { col, span: end - col };
}

/** Rule sides that make a container a card (D6); a roadmap's / timeline's own `axis` does not. */
export const RULE_SIDES = Object.freeze(['top', 'bottom', 'left', 'right', 'between', 'inner']);
/** Blocks the build draws on the Mood's card (charts and tables are drawn to their box). */
export const CARD_BLOCKS = new Set([
  'kpis',
  'points',
  'items',
  'subpoints',
  'process',
  'timeline',
  'compare',
  'paragraph',
]);

/**
 * Whether the catalogue draws a container on a card (class `card` on its marked element or from its first field up to
 * its item: 'class') or separates / frames it with rules (D6: 'rule'), for a block the build can put on a card; null
 * otherwise.
 */
export function cardSource(c, block) {
  if ([...(c.classes ?? []), ...(c.itemClasses ?? [])].includes('card')) return 'class';
  if (CARD_BLOCKS.has(block) && RULE_SIDES.some((k) => c.rules?.[k])) return 'rule';
  return null;
}

/** An ordinal label (01, 1., Step 1, Phase 2, First … Last): numbered items, the steps number marker. */
export const ORDINAL =
  /^(?:0?[1-9]|[1-9][0-9])\.?$|^(?:step|phase|stage|level|move|part)\s+[0-9]+\b|^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|last)$/i;

/**
 * A roadmap phase label our number marker cannot show (D8): one naming a year (2026, Feb 2025, Phase 1 · 2026), a
 * time (Now, Today, Near term) or a region - any label but a plain ordinal.
 */
export function yearLabel(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return /\b(?:19|20)\d{2}\b/.test(text) || !ORDINAL.test(text.trim());
}

/** Fields that hold an item's running text (the size a numeral must exceed to get its own zone, D7). */
const RUNNING = new Set(['description', 'body', 'bullet', 'paragraph', 'point']);

/**
 * The numeral zone of a container (C3.2, D7), or null: a steps / timeline container (any label) or a numbered one (an
 * ordinal) whose first item carries a numeral larger than its running text (`first` = the first item's fields) ->
 * {role, place: 'above' | 'beside', share: the numeral's part of the item up to its fields (height above, width
 * beside)}.
 */
export function numeralZone(c, block, first, titleSize = TITLE_SIZE) {
  const n = c.numeral;
  if (!n?.box || !n.fields || !(n.fontSize > 0)) return null;
  if (!(block === 'process' || block === 'timeline' || (c.numbered && ORDINAL.test(n.text ?? ''))))
    return null;
  const running = first.filter((f) => RUNNING.has(f.f)).map((f) => f.fontSize);
  const text = running.length ? Math.max(...running) : Math.max(0, ...first.map((f) => f.fontSize));
  if (!(n.fontSize > text)) return null;
  const role = n.fontSize >= 80 ? 'display' : n.fontSize >= titleSize ? 'h1' : n.fontSize >= 44 ? 'h2' : 'h3';
  const b = n.box;
  const f = n.fields;
  const above = c.numeralAlign !== 'left';
  const share = above
    ? (f.y - b.y) / Math.max(1, f.y + f.h - b.y)
    : (f.x - b.x) / Math.max(1, f.x + f.w - b.x);
  return { role, place: above ? 'above' : 'beside', share: r4(Math.min(0.9, Math.max(0, share))) };
}

/** The catalogue's slide title size (px): every plan slide but L35-1 sets its title at 56.23 px. */
export const TITLE_SIZE = 56.23;

/**
 * The type role a field's measured size asks for (the size bands in the file header; C3.1: a field at least as large
 * as the slide's own title is set at the title's scale - `h1`, a figure `stat` - and a figure from 80 px is `display`,
 * which the build reads as the larger of the Mood's display / stat).
 */
export function roleFor(f, size, titleSize = TITLE_SIZE) {
  if (f === 'label') return 'eyebrow';
  if (size >= 80) return 'display';
  if (size >= titleSize) return f === 'value' ? 'stat' : 'h1';
  if (size >= 44) return 'h2';
  if (size >= 28) return f === 'heading' || f === 'value' ? 'h3' : 'body';
  return 'bodySmall';
}

/**
 * Where content sits in a box, vertically: `fill` (less than 8 % of the box free), else `top` / `middle` / `bottom`
 * by the free space above and below it (middle when they differ by at most a quarter of the free space); `empty` = the
 * free share of the box's height.
 */
export function placement(box, content) {
  const free = Math.max(0, box.h - content.h);
  const empty = box.h > 0 ? r4(free / box.h) : 0;
  if (free < 0.08 * box.h) return { align: 'fill', empty };
  const above = Math.max(0, content.y - box.y);
  const below = Math.max(0, free - above);
  const align = Math.abs(above - below) <= 0.25 * free ? 'middle' : above < below ? 'top' : 'bottom';
  return { align, empty };
}

const ALIGN = {
  start: 'left',
  left: 'left',
  center: 'center',
  end: 'right',
  right: 'right',
  justify: 'left',
};

/** Cluster sorted numbers whose neighbours lie within `tol`: the number of clusters. */
function clusters(values, tol) {
  const v = [...values].sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const x of v) {
    if (x - last > tol) n += 1;
    last = x;
  }
  return n;
}

/** The flow of a container's items: the union of its fields per data-i (a field without data-i: one item). */
export function flowOf(fields) {
  const byItem = new Map();
  for (const f of fields) {
    const k = f.i ?? 0;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(f.box);
  }
  const items = [...byItem.values()].map(union);
  const n = items.length;
  if (n <= 1) return { direction: 'row', columns: 1, rows: 1 };
  const cols = clusters(
    items.map((b) => b.x),
    FLOW_TOLERANCE,
  );
  const rows = clusters(
    items.map((b) => b.y),
    FLOW_TOLERANCE,
  );
  if (cols >= n) return { direction: 'row', columns: n, rows: 1 };
  if (rows >= n) return { direction: 'column', columns: 1, rows: n };
  return { direction: 'grid', columns: cols, rows: Math.ceil(n / cols) };
}

/** Two boxes overlap by more than 2 px both ways. */
const overlapPx = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

/**
 * A container's item boxes in data-i order: the marked first item and its parallel items when the catalogue marks
 * only the first (`items`), else the union of each item's fields.
 */
export function itemBoxes(c, fields) {
  if (c.items) return [c.box, ...c.items];
  const byItem = new Map();
  for (const f of fields) {
    const k = f.i ?? 0;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(f.box);
  }
  return [...byItem.entries()].sort((a, b) => a[0] - b[0]).map(([, boxes]) => union(boxes));
}

const frac = (b, o) => ({
  x: r4((b.x - o.x) / o.w),
  y: r4((b.y - o.y) / o.h),
  w: r4(b.w / o.w),
  h: r4(b.h / o.h),
});

/** One plan slide (index entry + geometry entry) -> its layout record. */
export function layoutRecord(s, g, grid) {
  if (!g?.body) throw new Error(`${s.id}: no body box in the geometry`);
  const bands = specBands(s.id, s.spec);
  const counts = new Map(s.fields.map((c) => [c.c, c.fields]));
  const owner = {};
  for (const c of s.fields)
    for (const f of Object.keys(c.fields)) {
      if (!BANDED.has(f)) continue;
      if (owner[f] !== undefined)
        throw new Error(`${s.id}: field ${f} in containers ${owner[f]} and ${c.c}: bands are ambiguous`);
      owner[f] = c.c;
    }
  for (const f of Object.keys(bands))
    if (owner[f] === undefined) throw new Error(`${s.id}: spec band ${f} has no container carrying it`);
  for (const f of Object.keys(owner))
    if (!bands[f]) throw new Error(`${s.id}: field ${f} of container ${owner[f]} has no band in the spec`);

  const combination = [];
  const cellsOf = new Map();
  const titleSize = g.header?.t?.fontSize ?? TITLE_SIZE;
  const containers = (g.containers ?? []).map((c) => {
    if (!(c.type in TYPE_BLOCK)) throw new Error(`${s.id}: container ${c.c} has unknown type "${c.type}"`);
    const block = TYPE_BLOCK[c.type];
    const fieldCounts = counts.get(c.c) ?? {};
    const own = (g.fields ?? []).filter((f) => f.c === c.c);
    const ext = c.extent ?? c.box;
    const rec = {
      c: c.c,
      type: c.type,
      block,
      zone: frac(ext, g.body),
      grid: snapGrid(ext.x - g.body.x, ext.w, g.body.w, grid.gutter),
      flow: flowOf(own),
    };
    if (block) {
      const nodes = Math.max(1, ...Object.values(fieldCounts));
      const b = Object.fromEntries(
        FIELD_ORDER.filter((f) => fieldCounts[f] !== undefined && bands[f]).map((f) => [f, bands[f]]),
      );
      combination.push({ type: block, nodes, bands: b });
      rec.nodes = nodes;
    }
    // the first item: the marked element when the catalogue marks only the first of a row (`items`), else the union
    // of the fields with the lowest data-i
    const firstI = own.length ? Math.min(...own.map((f) => f.i ?? 0)) : 0;
    const first = own.filter((f) => (f.i ?? 0) === firstI);
    const itemBox = c.items ? c.box : first.length ? union(first.map((f) => f.box)) : c.box;
    rec.fields = first.map((f) => {
      const out = {
        f: f.f,
        role: roleFor(f.f, f.fontSize, titleSize),
        align: ALIGN[f.textAlign] ?? 'left',
        lines: f.lines,
        box: frac(f.box, itemBox),
      };
      if (f.parts) out.parts = f.parts.length;
      return out;
    });
    const source = cardSource(c, block);
    rec.card = Boolean(source);
    if (source) rec.cardSource = source;
    if (c.rules) rec.rules = { ...c.rules };
    rec.numbered = Boolean(c.numbered);
    const numeral = numeralZone(c, block, first, titleSize);
    if (numeral) rec.numeral = numeral;
    if (block === 'process' && yearLabel(c.numeral?.text)) rec.labels = 'year';
    // placement: where the content (its fields; its item boxes too when they are cards) sits in the zone, and where
    // the first item's fields sit in the first item (a marked first item); else the zone's placement
    const boxes = itemBoxes(c, own);
    if (own.length && block !== 'chart' && block !== 'table') {
      // the numeral with its own zone is content too (C3.2, D7: we draw it at its size band)
      const mark = numeral ? [c.numeral.box] : [];
      const content = union([...own.map((f) => f.box), ...mark, ...(rec.card && c.items ? boxes : [])]);
      rec.place = placement(ext, content);
      // the share the text alone leaves free (cards left out): what the build's fill steps the text toward
      if (rec.card && c.items)
        rec.place.text = placement(ext, union([...own.map((f) => f.box), ...mark])).empty;
      rec.itemAlign = c.items ? placement(c.box, union(first.map((f) => f.box))).align : rec.place.align;
    } else {
      rec.place = { align: 'fill', empty: 0 };
      rec.itemAlign = 'fill';
    }
    cellsOf.set(rec, { ext, items: boxes });
    return rec;
  });
  // a container whose extent takes in another container (KPIs flanking a chart, a list in a grid's last cell) keeps
  // its items' own cells, so the other block's zone stays free
  const solid = containers.filter((c) => c.block);
  for (const a of solid) {
    const { ext, items } = cellsOf.get(a);
    const hit = solid.some((b) => b !== a && overlapPx(ext, cellsOf.get(b).ext));
    if (hit && items.length > 1 && FLOW_BLOCKS.has(a.block))
      a.flow.cells = items.map((b) => {
        const y = frac(b, ext);
        return { ...snapGrid(b.x - g.body.x, b.w, g.body.w, grid.gutter), y: y.y, h: y.h };
      });
  }
  // the content group: the vertical union of the block containers' zones (body fractions). The catalogue centres the
  // group in its body; our body area is already the content's room, so the build stretches the group to fill it
  const zs = containers.filter((c) => c.block).map((c) => c.zone);
  const top = zs.length ? Math.max(0, Math.min(...zs.map((z) => z.y))) : 0;
  const end = zs.length ? Math.min(1, Math.max(...zs.map((z) => z.y + z.h))) : 1;
  const group = { y: r4(top), h: r4(Math.max(0.0001, end - top)) };
  const kinds = [...new Set(combination.map((b) => BLOCK_KIND[b.type]))];
  const kind = KIND_ORDER.find((k) => kinds.includes(k)) ?? 'text';
  return {
    id: `cat-${s.id.toLowerCase()}`,
    catalogue: s.id,
    plan: s.plan,
    row: s.row,
    family: s.family,
    combination,
    key: combinationKey(combination),
    kind,
    kinds: [kind, ...kinds.filter((k) => k !== kind)],
    group,
    containers,
  };
}

/** Every plan slide -> {grid, roles, records}. */
export function buildRecords(index, geometry) {
  const plan = index.slides.filter((s) => s.section === 'plan');
  const grid = measureGrid(plan.map((s) => geometry.slides[s.id]));
  const records = plan.map((s) => layoutRecord(s, geometry.slides[s.id], grid));
  // the size-band histogram over every field (all items): field -> role -> count
  const roles = {};
  for (const s of plan)
    for (const f of geometry.slides[s.id].fields ?? []) {
      const r = roleFor(f.f, f.fontSize, geometry.slides[s.id].header?.t?.fontSize ?? TITLE_SIZE);
      roles[f.f] ??= {};
      roles[f.f][r] = (roles[f.f][r] ?? 0) + 1;
    }
  return { grid, roles, records };
}

function main() {
  const t0 = Date.now();
  const ROOT = resolve(dirname(process.argv[1]), '..');
  const indexFile = join(ROOT, 'golden/catalogue/index.json');
  const geometryFile = join(ROOT, 'golden/catalogue/geometry.json');
  const out = join(ROOT, 'packages/layouts/data/catalogue-layouts.json');
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));
  const geometry = JSON.parse(readFileSync(geometryFile, 'utf8'));
  if (index.source.sha256 !== geometry.source.sha256)
    throw new Error(
      'catalogue: geometry.json was measured from another version: run npm run catalogue:geometry',
    );
  const { grid, roles, records } = buildRecords(index, geometry);
  const data = {
    source: {
      sha256: index.source.sha256,
      geometryMeasured: geometry.measured,
      generator: 'scripts/catalogue-layouts.mjs',
      geometryHash: createHash('sha256').update(JSON.stringify(geometry.slides)).digest('hex').slice(0, 16),
    },
    grid,
    bands: Object.fromEntries(
      Object.entries(BANDS).map(([f, list]) => [f, list.map(([a, b]) => `${a}-${b}`)]),
    ),
    roles,
    records,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);

  const tally = (fn) => {
    const t = {};
    for (const r of records) for (const k of [fn(r)].flat()) t[k] = (t[k] ?? 0) + 1;
    return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  };
  const keys = tally((r) => r.key);
  const shared = Object.values(keys).filter((n) => n > 1).length;
  console.log(
    `catalogue layouts: ${records.length} records, ${Object.keys(keys).length} keys (${shared} shared by more than ` +
      `one slide) -> ${out} (${Date.now() - t0} ms)`,
  );
  console.log(
    `catalogue layouts: grid ${grid.columns} columns, gutter ${grid.gutter} px (${grid.edges} inner edges)`,
  );
  console.log(`catalogue layouts: kinds ${JSON.stringify(tally((r) => r.kind))}`);
  console.log(`catalogue layouts: roles ${JSON.stringify(roles)}`);
  console.log(
    `catalogue layouts: flows ${JSON.stringify(tally((r) => r.containers.filter((c) => c.block).map((c) => c.flow.direction)))}; ` +
      `cards ${records.reduce((n, r) => n + r.containers.filter((c) => c.card).length, 0)}`,
  );
  const perPlan = (fn) => {
    const t = {};
    for (const r of records) {
      const n = r.containers.filter(fn).length;
      if (n) t[r.plan] = (t[r.plan] ?? 0) + n;
    }
    return t;
  };
  const ruleCards = perPlan((c) => c.cardSource === 'rule');
  console.log(
    `catalogue layouts: C3.2 cards by rule ${Object.values(ruleCards).reduce((a, b) => a + b, 0)} containers ` +
      `(by class ${records.reduce((n, r) => n + r.containers.filter((c) => c.cardSource === 'class').length, 0)}); ` +
      `per plan ${JSON.stringify(ruleCards)}`,
  );
  const zones = perPlan((c) => c.numeral);
  console.log(
    `catalogue layouts: C3.2 numeral zones ${Object.values(zones).reduce((a, b) => a + b, 0)} containers ` +
      `(per plan ${JSON.stringify(zones)}); roadmaps with year labels ` +
      `${records.filter((r) => r.containers.some((c) => c.labels === 'year')).length}`,
  );
}

if (process.argv[1] && basename(process.argv[1]) === 'catalogue-layouts.mjs') {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
