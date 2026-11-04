/**
 * The combination key of a content/2 slide (docs/PLAN-catalogue.md §3 C3 / C4): the slide's blocks in written order,
 * each with its node count and the length band of every field it carries, by the content-length plan's bands. The
 * catalogue layouts (scripts/catalogue-layouts.mjs, catalogue-defs.js) are keyed with it, and C4's matching reuses it on
 * the summary blocks of a slide (`summarize(slide).blocks`). Pure, no imports: the generator script loads it too.
 *
 * A block is either a summary block `{type, nodes, chars: {<our node field>: longest plain length}}` (packages/engine
 * compose/summary.js describeBlock) or a catalogue block `{type, nodes, bands: {<plan field>: 'lo-hi'}}`. Our node
 * fields map to the plan's field names per block type (PLAN_FIELDS); node fields with no plan field (icon, image, label,
 * when, trend …) are not part of the key. A KPI block with a value and a heading but no body keys as value + body (the
 * plan's "value + body" KPIs): content/2 writes the one line under a figure as its heading.
 *
 * Key: `items:2(heading 1-20,description 1-70)+points:2(bullet 1-70)`; a block with no banded field is `chart:4`; a slide
 * with no block (the catalogue's "Title only") is `title`.
 */

/**
 * The plan's length bands per field (plan characters, inclusive). The plan text (§1) names heading 1–20 / 21–60,
 * description 1–70 / 71–140, value 1–6 / 7–12, body 1–70, bullet 1–70 / 71–220, paragraph 1–80 / 81–400; the spec
 * strings of golden/catalogue/index.json also use description 141–220 and body 71–140 / 141–220 (verified by the
 * generator, which fails on any band not listed here).
 */
export const BANDS = Object.freeze({
  value: Object.freeze([
    [1, 6],
    [7, 12],
  ]),
  heading: Object.freeze([
    [1, 20],
    [21, 60],
  ]),
  description: Object.freeze([
    [1, 70],
    [71, 140],
    [141, 220],
  ]),
  body: Object.freeze([
    [1, 70],
    [71, 140],
    [141, 220],
  ]),
  bullet: Object.freeze([
    [1, 70],
    [71, 220],
  ]),
  paragraph: Object.freeze([
    [1, 80],
    [81, 400],
  ]),
});

/** Plan fields in key order. */
export const FIELD_ORDER = Object.freeze(['value', 'heading', 'description', 'body', 'bullet', 'paragraph']);

/**
 * Our content/2 block type -> {plan field: the summary `chars` fields it reads (summed when several)}. Block types the
 * plan has no fields for (chart, table, and the types outside the plan) key by their count only.
 */
export const PLAN_FIELDS = Object.freeze({
  points: Object.freeze({ bullet: ['text'] }),
  items: Object.freeze({ heading: ['heading'], description: ['body'] }),
  subpoints: Object.freeze({ heading: ['heading'], description: ['lines'] }),
  kpis: Object.freeze({ value: ['value'], heading: ['heading'], body: ['body'] }),
  process: Object.freeze({ heading: ['heading'], description: ['body'] }),
  timeline: Object.freeze({ heading: ['heading'], description: ['body', 'lines'] }),
  compare: Object.freeze({ heading: ['header'], description: ['rows'] }),
  paragraph: Object.freeze({ paragraph: ['text'] }),
  chart: Object.freeze({}),
  table: Object.freeze({}),
  quotes: Object.freeze({}),
  people: Object.freeze({}),
  logos: Object.freeze({}),
  image: Object.freeze({}),
});

const label = ([lo, hi]) => `${lo}-${hi}`;

function bandsOf(field) {
  const list = BANDS[field];
  if (!list)
    throw new Error(`combinationKey: unknown field "${field}" (plan fields: ${FIELD_ORDER.join(', ')})`);
  return list;
}

/**
 * The band of `chars` characters of a plan field: the band holding it, else the nearest (a text shorter than the first
 * band takes the first, longer than the last takes the last). Unknown field -> throws.
 */
export function bandOf(field, chars) {
  const list = bandsOf(field);
  const n = Number(chars) || 0;
  if (n <= list[0][1]) return label(list[0]);
  for (const b of list) if (n >= b[0] && n <= b[1]) return label(b);
  return label(list[list.length - 1]);
}

/** Index of a band label ('1-20') among a field's bands; unknown field or band -> throws. */
export function bandIndex(field, band) {
  const i = bandsOf(field).findIndex((b) => label(b) === band);
  if (i < 0) throw new Error(`combinationKey: field "${field}" has no band "${band}"`);
  return i;
}

/** {plan field: band} of one block (catalogue `bands` validated, else from summary `chars`), in key order. */
export function blockBands(block) {
  const fields = PLAN_FIELDS[block?.type];
  if (!fields) throw new Error(`combinationKey: unknown block type "${block?.type}"`);
  const out = {};
  if (block.bands) {
    for (const [f, band] of Object.entries(block.bands)) {
      bandIndex(f, band);
      out[f] = band;
    }
  } else {
    let chars = block.chars ?? {};
    // KPIs with a value and one line under it: content/2 reads a body-only KPI node as its heading (fences.js), so
    // that line is the plan's `body` (KPI numbers, value + body: plans 36-38)
    if (block.type === 'kpis' && !(Number(chars.body) > 0) && Number(chars.heading) > 0)
      chars = { value: chars.value, body: chars.heading };
    for (const [f, from] of Object.entries(fields)) {
      const n = from.reduce((a, k) => a + (Number(chars[k]) || 0), 0);
      if (n > 0) out[f] = bandOf(f, n);
    }
  }
  return Object.fromEntries(FIELD_ORDER.filter((f) => f in out).map((f) => [f, out[f]]));
}

const nodesOf = (block) => Number(block?.nodes) || 0;

/** The canonical combination key of a block list (see the file header). */
export function combinationKey(blocks) {
  const list = blocks ?? [];
  if (!list.length) return 'title';
  return list
    .map((b) => {
      const bands = Object.entries(blockBands(b));
      const head = `${b.type}:${nodesOf(b)}`;
      return bands.length ? `${head}(${bands.map(([f, x]) => `${f} ${x}`).join(',')})` : head;
    })
    .join('+');
}

/** The combination without bands (block types in order + node counts): `items:2+points:2`; no block -> `title`. */
export function combinationShape(blocks) {
  const list = blocks ?? [];
  if (!list.length) return 'title';
  return list
    .map((b) => {
      if (!PLAN_FIELDS[b?.type]) throw new Error(`combinationKey: unknown block type "${b?.type}"`);
      return `${b.type}:${nodesOf(b)}`;
    })
    .join('+');
}

/**
 * How far a catalogue block list's bands lie from a slide's (same combination assumed; blocks paired in order): per
 * field 2 per band step, +1 when the catalogue's band is the shorter one (longer text wins a tie: the fitter steps
 * down, never up), 3 for a field only one side carries.
 */
export function bandDistance(catalogueBlocks, slideBlocks) {
  let d = 0;
  (catalogueBlocks ?? []).forEach((cb, k) => {
    d += blockBandDistance(cb, slideBlocks?.[k] ?? { type: cb.type });
  });
  return d;
}

/** bandDistance of one catalogue block against one slide block (the same rule, per field). */
function blockBandDistance(catalogueBlock, slideBlock) {
  let d = 0;
  const a = blockBands(catalogueBlock);
  const b = blockBands(slideBlock);
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(f in a) || !(f in b)) {
      d += 3;
      continue;
    }
    const ia = bandIndex(f, a[f]);
    const ib = bandIndex(f, b[f]);
    d += 2 * Math.abs(ia - ib) + (ia < ib ? 1 : 0);
  }
  return d;
}

/**
 * How far a catalogue combination lies from a slide's blocks when the two need not share a shape (C4, the fallback
 * warning's "nearest"): `{types, counts, bands}` - `types` = the block types only one side has (multiset difference,
 * order ignored), `counts` = the node-count difference summed over the paired blocks, `bands` = their band distance
 * (bandDistance's rule). Blocks pair by type in written order (the k-th block of a type with the k-th of that type).
 * An unknown slide block type throws, as in combinationKey.
 */
export function keyDistance(catalogueBlocks, slideBlocks) {
  const cat = catalogueBlocks ?? [];
  const slide = slideBlocks ?? [];
  const taken = new Set();
  let types = 0;
  let counts = 0;
  let bands = 0;
  for (const sb of slide) {
    if (!PLAN_FIELDS[sb?.type]) throw new Error(`combinationKey: unknown block type "${sb?.type}"`);
    const k = cat.findIndex((cb, i) => !taken.has(i) && cb.type === sb.type);
    if (k < 0) {
      types += 1;
      continue;
    }
    taken.add(k);
    counts += Math.abs(nodesOf(cat[k]) - nodesOf(sb));
    bands += blockBandDistance(cat[k], sb);
  }
  types += cat.length - taken.size;
  return { types, counts, bands };
}

/**
 * The record nearest a slide's blocks (C4): fewest block-type differences, then the smallest count difference, then
 * the smallest band distance (keyDistance); a tie keeps the first in `records`' order (catalogue order). `records` =
 * [{combination, ...}] (the generated catalogue records). Returns `{record, distance}`, or null for no records.
 */
export function nearestKey(records, blocks) {
  let best = null;
  for (const record of records ?? []) {
    const distance = keyDistance(record.combination, blocks);
    if (
      !best ||
      distance.types < best.distance.types ||
      (distance.types === best.distance.types &&
        (distance.counts < best.distance.counts ||
          (distance.counts === best.distance.counts && distance.bands < best.distance.bands)))
    )
      best = { record, distance };
  }
  return best;
}
