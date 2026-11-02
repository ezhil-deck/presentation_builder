/**
 * Content v2 block vocabulary (docs/PLAN-studio.md §3.1, docs/S2-content-v2.md): the 14 block types, their node count
 * ranges and the design-intent character ranges per field. Numbers come from the reference catalogue
 * (docs/research/preset-content-catalogue.md §2 per container type, §6 container ranges); they are the *design intent*
 * of a field, never a limit: the fitter still measures, and a node count over its range or a text far over its range is
 * a content warning, never an error. Exported for layouts, the fitter and the Studio.
 *
 * Shape: BLOCKS[type] = { nodes: {min, max}, fields: {name: {maxChars, minChars?}}, block?: {name: {maxChars}},
 * columns?: {min, max} (table) }. `fields` are node fields; `block` are block-level text keys.
 */

/** The 14 content/2 block types, in PLAN-studio §3.1 order. */
export const BLOCK_TYPES = Object.freeze([
  'points',
  'items',
  'subpoints',
  'kpis',
  'process',
  'timeline',
  'chart',
  'table',
  'quotes',
  'people',
  'logos',
  'compare',
  'paragraph',
  'image',
]);

/** process.shape values (PLAN-studio §3.1: the diagram families reduced to 12 shapes). */
export const PROCESS_SHAPES = Object.freeze([
  'linear',
  'cycle',
  'funnel',
  'pyramid',
  'stack',
  'hub',
  'ladder',
  'quadrant',
  'venn',
  'tree',
  'converge',
  'diverge',
]);

/** chart.chartType values in content/2. */
export const CHART_TYPES = Object.freeze([
  'column',
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'stacked',
  'grouped',
  'stacked%',
  'funnel',
  'waterfall',
  'scatter',
  'radar',
  'gauge',
]);

/** table rich-cell types. */
export const CELL_TYPES = Object.freeze([
  'text',
  'heading',
  'number',
  'check',
  'rating',
  'image',
  'logo',
  'chip',
]);

/** image.treatment values. */
export const IMAGE_TREATMENTS = Object.freeze(['side', 'full', 'background', 'collage', 'device']);

const f = (maxChars, minChars) => Object.freeze(minChars ? { minChars, maxChars } : { maxChars });

/**
 * Node counts and field ranges per block type. Sources (catalogue §2 / §6): simple_list item 40–130 (up to 250),
 * 2–12 nodes; list_with_description head 1–40, body 30–160, label 3–15, 2–10 nodes; list_with_subpoints head 1–40,
 * sub-points 2–4 per node, 1–8 nodes; kpi_block value 1–8, head 1–40, body 40–350, 1–8 nodes; diagram head 1–30,
 * body 30–60, 2–8 nodes; timeline / roadmap date 1–11, head 1–30, body 20–90, 2–10 nodes; chart 1–30 rows; table
 * 2–8 × 2–8; quotes 80–200, name 5–25, designation 10–40, label 5–15, 1–4 nodes; team name 5–25, designation 10–40,
 * bio 10–120, 1–9 nodes; logogrid head 1–20, body 80–90, 1–20 logos; comparison head 1–40, body 20–145, pricing
 * value 1–10, subheading 10–40; paragraph 150–400; image 1–4. Block titles: graphictitle ≈ a list heading (1–40);
 * team title / subtitle follow the slide title / subtitle bands (≤ 60 / ≤ 140).
 */
export const BLOCKS = Object.freeze({
  points: Object.freeze({ nodes: { min: 2, max: 12 }, fields: Object.freeze({ text: f(130) }) }),
  items: Object.freeze({
    nodes: { min: 2, max: 10 },
    fields: Object.freeze({ heading: f(40), body: f(160, 30), label: f(15) }),
    block: Object.freeze({ title: f(40) }),
  }),
  subpoints: Object.freeze({
    nodes: { min: 1, max: 8 },
    fields: Object.freeze({ heading: f(40), lines: Object.freeze({ maxChars: 40, maxItems: 4 }) }),
  }),
  kpis: Object.freeze({
    nodes: { min: 1, max: 8 },
    fields: Object.freeze({ value: f(8), heading: f(40), body: f(350, 40) }),
  }),
  process: Object.freeze({
    nodes: { min: 2, max: 8 },
    fields: Object.freeze({ heading: f(30), body: f(60, 30) }),
  }),
  timeline: Object.freeze({
    nodes: { min: 2, max: 10 },
    fields: Object.freeze({
      when: f(11),
      heading: f(30),
      body: f(90, 20),
      lines: Object.freeze({ maxChars: 40 }),
    }),
  }),
  chart: Object.freeze({ nodes: { min: 1, max: 30 }, fields: Object.freeze({}) }),
  table: Object.freeze({ nodes: { min: 2, max: 8 }, columns: { min: 2, max: 8 }, fields: Object.freeze({}) }),
  quotes: Object.freeze({
    nodes: { min: 1, max: 4 },
    fields: Object.freeze({ text: f(200, 80), name: f(25), role: f(40), label: f(15) }),
  }),
  people: Object.freeze({
    nodes: { min: 1, max: 9 },
    fields: Object.freeze({ name: f(25), role: f(40), bio: f(120, 10) }),
    block: Object.freeze({ title: f(60), subtitle: f(140) }),
  }),
  logos: Object.freeze({
    nodes: { min: 1, max: 20 },
    fields: Object.freeze({ heading: f(20), body: f(90) }),
  }),
  compare: Object.freeze({
    nodes: { min: 2, max: 4 },
    fields: Object.freeze({ header: f(40), label: f(15), price: f(10), per: f(40) }),
    items: Object.freeze({ heading: f(40), body: f(145, 20) }),
  }),
  paragraph: Object.freeze({ nodes: { min: 1, max: 1 }, fields: Object.freeze({ text: f(400, 150) }) }),
  image: Object.freeze({ nodes: { min: 1, max: 4 }, fields: Object.freeze({}) }),
});

/** Slide-level text keys (catalogue §6: the title steps down at 35–60 / 70–80 chars; subtitle 1–140; label 1–15). */
export const SLIDE_FIELDS = Object.freeze({ title: f(60), subtitle: f(140), label: f(15) });

/** "Far over its range": a text longer than FAR_OVER × maxChars is a content warning. */
export const FAR_OVER = 1.5;

/** A slide holds up to this many content blocks (PLAN-studio §3.1); more is a content warning. */
export const MAX_BLOCKS_PER_SLIDE = 3;

const plain = (s) => String(s ?? '').replace(/\*\*|[*_]|\[([^\]]*)\]\([^)]*\)/g, (m, t) => t ?? '');

/** The nodes of a block (the list its node range counts). */
export function blockNodes(block) {
  if (!block) return [];
  if (block.type === 'compare') return block.columns ?? [];
  if (block.type === 'table') return block.rows ?? [];
  if (block.type === 'chart') {
    const n =
      block.categories?.length ?? Math.max(0, ...(block.series ?? []).map((s) => s.values?.length ?? 0));
    return Array.from({ length: n });
  }
  if (block.type === 'paragraph') return [block];
  return block.items ?? [];
}

/**
 * Content warnings for one content/2 block: node count outside BLOCKS[type].nodes, text far over a field's maxChars
 * (FAR_OVER ×), sub-point lines over their count. Returns [{severity, message}] (no slide id; the caller adds it).
 */
export function blockWarnings(block) {
  const spec = BLOCKS[block?.type];
  if (!spec) return [];
  const out = [];
  const nodes = blockNodes(block);
  const n = nodes.length;
  const { min, max } = spec.nodes;
  const unit = block.type === 'compare' ? 'columns' : block.type === 'table' ? 'rows' : 'nodes';
  if (n > max)
    out.push({ severity: 'warn', message: `${block.type} has ${n} ${unit}, over its range ${min}–${max}` });
  else if (n < min)
    out.push({ severity: 'info', message: `${block.type} has ${n} ${unit}, under its range ${min}–${max}` });
  if (block.type === 'table' && spec.columns) {
    const cols = Math.max(block.header?.length ?? 0, ...(block.rows ?? []).map((r) => r.length));
    if (cols > spec.columns.max)
      out.push({
        severity: 'warn',
        message: `table has ${cols} columns, over its range ${spec.columns.min}–${spec.columns.max}`,
      });
  }
  const far = (where, text, range) => {
    const len = plain(text).length;
    if (range?.maxChars && len > range.maxChars * FAR_OVER) {
      out.push({
        severity: 'warn',
        message: `${where} is ${len} characters, far over its design range (≤ ${range.maxChars})`,
      });
    }
  };
  for (const [key, range] of Object.entries(spec.block ?? {})) {
    if (typeof block[key] === 'string') far(`${block.type}.${key}`, block[key], range);
  }
  if (block.type === 'paragraph') {
    far('paragraph.text', block.text, spec.fields.text);
    return out;
  }
  nodes.forEach((node, k) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, range] of Object.entries(spec.fields)) {
      const v = node[key];
      if (typeof v === 'string') far(`${block.type}[${k}].${key}`, v, range);
      else if (Array.isArray(v)) {
        v.forEach(
          (line, j) => typeof line === 'string' && far(`${block.type}[${k}].${key}[${j}]`, line, range),
        );
        if (range.maxItems && v.length > range.maxItems) {
          out.push({
            severity: 'warn',
            message: `${block.type}[${k}].${key} has ${v.length} lines, over its range (≤ ${range.maxItems})`,
          });
        }
      }
    }
    if (block.type === 'compare') {
      (node.items ?? []).forEach((it, j) => {
        for (const [key, range] of Object.entries(spec.items)) {
          if (typeof it[key] === 'string') far(`compare[${k}].items[${j}].${key}`, it[key], range);
        }
      });
    }
  });
  return out;
}

/** Content warnings for a content/2 slide's own keys (title / subtitle / label far over range, > 3 blocks). */
export function slideWarnings(slide) {
  const out = [];
  for (const [key, range] of Object.entries(SLIDE_FIELDS)) {
    const v = slide?.[key];
    if (typeof v !== 'string') continue;
    const len = plain(v).length;
    if (len > range.maxChars * FAR_OVER)
      out.push({
        severity: 'warn',
        message: `${key} is ${len} characters, far over its design range (≤ ${range.maxChars})`,
      });
  }
  const n = slide?.blocks?.length ?? 0;
  if (n > MAX_BLOCKS_PER_SLIDE)
    out.push({
      severity: 'warn',
      message: `${n} content blocks on one slide (a slide holds up to ${MAX_BLOCKS_PER_SLIDE})`,
    });
  return out;
}
