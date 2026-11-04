/**
 * Kind normalisation + layout pick (P2-spec §2, §3.1; docs/S2-layouts.md §4). The kind's default layout (the v1 one)
 * unless the slide is content/2 and a layout of the kind matches its blocks better (`def.match(summary)`: main +
 * aside, a process shape, the single-KPI hero, two columns of points).
 *
 * Precedence for a content/2 slide (C4, docs/PLAN-catalogue.md §3), in this order:
 * 1. a pinned `layoutId` the catalogue has (one of the 68 or a catalogue layout `cat-l<plan>-<n>`);
 * 2. the catalogue layouts that take the kind (`forKind(kind, {catalogue: true})`), scored on their own: the exact
 *    family (same combination key) 100 (+1 timeline flavour, +0.5 process labels), else the same combination (block
 *    types + counts) 60 minus the band distance (1-60; the longer band wins a tie); the highest score wins, equal
 *    scores go to the record used fewer times so far in the deck (`options.used`: catalogue id -> count, kept by
 *    composeDeck), then to catalogue order;
 * 3. only when no catalogue layout scores (no record of the combination, a shaped process or nested KPIs - drawn by
 *    the shape / ring layouts -, a kind the catalogue does not draw): the 68 scored as before (their `match` returns
 *    0-40: aside 10 / 20, agenda-rows 20, bullets-columns 15, compare 25 / 30, kpi-hero 30, quote / image 30, process
 *    shapes 30, kpi-nested 40), else the kind's default. A tier, not a score race: no score of the 68 can outrank a
 *    catalogue match.
 * `options.catalogue === false` (the compose opt-out) skips tier 2. A slide that falls to tier 3 with no catalogue
 * record for its combination gets a `catalogue` warning (info) naming the nearest record (catalogue.nearest); cover /
 * section / cta slides, shaped processes and nested KPIs are not warned.
 */
import { validateLayout } from '../validate.js';

export const LAYOUT_KINDS = Object.freeze([
  'cover',
  'section',
  'agenda',
  'bullets',
  'text',
  'two-column',
  'cards',
  'steps',
  'timeline',
  'kpi',
  'chart',
  'table',
  'image',
  'image-text',
  'quote',
  'team',
  'logos',
  'cta',
]);
export const KIND_ALIASES = Object.freeze({ diagram: 'steps', comparison: 'two-column', blank: 'text' });
/**
 * content/2 block types used as a kind hint -> today's kind (docs/S2-content-v2.md §5; chart, table, timeline, logos
 * and image are kinds already).
 */
export const BLOCK_KIND_ALIASES = Object.freeze({
  points: 'bullets',
  items: 'cards',
  subpoints: 'cards',
  kpis: 'kpi',
  process: 'steps',
  quotes: 'quote',
  people: 'team',
  compare: 'two-column',
  paragraph: 'text',
});

/** kind as written -> {kind (a catalogue kind), known} ; unknown -> text. */
export function normalizeKind(kind) {
  const k = KIND_ALIASES[kind] ?? BLOCK_KIND_ALIASES[kind] ?? kind;
  if (LAYOUT_KINDS.includes(k)) return { kind: k, known: true, aliased: k !== kind };
  return { kind: 'text', known: false, aliased: false };
}

/**
 * pick(kind, summary, mood, catalogue, {warn, layoutId, options}) -> Layout instance (schemas/layout.schema.json).
 * A pinned `layoutId` wins when the catalogue has it; a kind with no layout falls back to the `text` layout (warning);
 * an unknown kind is `text` (warning). Returns null when not even `text` exists.
 * `options`: `catalogue` (default on; `false` composes with the 68 only), `used` (Map or object: catalogue id -> times
 * used so far in the deck, the variety tie-break). See the file header for the precedence.
 */
export function pick(kind, summary, mood, catalogue, { warn = () => {}, layoutId, options = {} } = {}) {
  const norm = normalizeKind(kind);
  if (!norm.known) warn('kind', `unknown slide kind "${kind}": composed as "text"`);
  let def = null;
  if (layoutId) {
    def = catalogue.get(layoutId) ?? null;
    if (!def) warn('layout', `pinned layout "${layoutId}" is not in the catalogue: picked by kind`);
  }
  if (!def) {
    const defs = catalogue.forKind(norm.kind);
    def = defs[0] ?? null;
    if (summary?.v2) {
      const fromCatalogue =
        options.catalogue === false ? null : catalogueMatch(norm.kind, summary, catalogue, options);
      if (fromCatalogue) def = fromCatalogue;
      else {
        if (options.catalogue !== false) fallbackWarning(norm.kind, summary, catalogue, warn);
        let best = 0;
        for (const d of defs) {
          const score = typeof d.match === 'function' ? Number(d.match(summary, { options })) || 0 : 0;
          if (score > best) {
            best = score;
            def = d;
          }
        }
      }
    }
  }
  if (!def && norm.kind !== 'text') {
    warn('layout', `the catalogue has no layout for kind "${norm.kind}": composed with the "text" layout`);
    def = catalogue.forKind('text')[0] ?? null;
  }
  if (!def) {
    warn('layout', `the catalogue has no "text" layout: slide left without content`, 'error');
    return null;
  }
  const layout = def.build({
    mood,
    geometry: mood.geometry,
    summary: { ...summary, kind: summary?.kind ?? norm.kind },
  });
  if (summary?.v2) {
    shapeWarnings(summary, layout, catalogue, warn);
    // nested KPIs draw three rings; another node count is a KPI row
    const nested = (summary.blocks ?? []).find((b) => b.type === 'kpis' && b.nested);
    if (nested && nested.nodes !== 3)
      warn('content', `kpis.nested needs 3 nodes (has ${nested.nodes}): drawn as a KPI row`);
    else if (nested && !(layout.boxes ?? []).some((x) => x.flow?.nested))
      warn('content', `kpis.nested not drawn on layout "${layout.id}"`, 'info');
  }
  for (const e of validateLayout(layout)) {
    warn(
      'layout-schema',
      `layout "${def.id}" is invalid against schemas/layout.schema.json: ${e.pointer} ${e.message}`,
      'error',
    );
  }
  return layout;
}

const usedOf = (used, id) => Number((used instanceof Map ? used.get(id) : used?.[id]) ?? 0) || 0;

/**
 * Tier 2 of the precedence (file header): the best-scoring catalogue layout that takes the kind, or null when none
 * scores. Equal scores: the one used fewer times in the deck so far (`options.used`), then catalogue order.
 */
function catalogueMatch(kind, summary, catalogue, options) {
  const defs = catalogue.forKind(kind, { catalogue: true }).filter((d) => d.catalogue);
  let best = 0;
  let pickedDef = null;
  for (const d of defs) {
    const score = typeof d.match === 'function' ? Number(d.match(summary, { options })) || 0 : 0;
    if (score <= 0) continue;
    if (
      score > best ||
      (score === best && usedOf(options.used, d.catalogue) < usedOf(options.used, pickedDef.catalogue))
    ) {
      best = score;
      pickedDef = d;
    }
  }
  return pickedDef;
}

const UNWARNED_KINDS = new Set(['cover', 'section', 'cta']);

/**
 * A content/2 slide composed on the 68 because no catalogue record has its combination (C4): a `catalogue` warning
 * (info) naming the nearest record (`catalogue.nearest`: fewest block-type differences, then count, then band
 * distance) and the block types no plan has (a slide made only of such blocks names those alone). Not for cover / section / cta slides or for blocks the shape / ring layouts draw (a shaped process,
 * nested KPIs); a record of the combination that does not take the slide's kind is named with its kind.
 */
function fallbackWarning(kind, summary, catalogue, warn) {
  if (UNWARNED_KINDS.has(kind) || typeof catalogue.nearest !== 'function') return;
  const blocks = summary.blocks ?? [];
  if (
    blocks.some(
      (b) => (b.type === 'process' && b.shape && b.shape !== 'linear') || (b.type === 'kpis' && b.nested),
    )
  )
    return;
  let key;
  let near;
  try {
    key = catalogue.combinationKey(blocks);
    near = catalogue.nearest(blocks);
  } catch {
    return; // a block type the plans have no fields for (an unknown type): nothing to name
  }
  if (!near) return;
  const missing = near.missing ?? [];
  const without = missing.length
    ? `the plans have no ${missing.join(' / ')} block${missing.length > 1 ? 's' : ''}`
    : '';
  const other = near.def.kinds?.includes(kind) ? '' : ` (a ${near.def.kind} layout)`;
  const nearest = `nearest ${near.def.catalogue} "${near.def.key}"${other}`;
  // every block of the slide is of a type the plans lack: the nearest record says nothing about it
  const all = missing.length >= new Set(blocks.map((b) => b.type)).size;
  warn(
    'catalogue',
    `no catalogue slide for "${key}": ${all ? without : [nearest, without].filter(Boolean).join('; ')}`,
    'info',
  );
}

/**
 * A content/2 process whose shape is not drawn: a node count outside the shape's range (catalogue.shapeRanges) →
 * linear steps; a shape that fits but the chosen layout has no shape flow for it (another layout pinned / picked).
 */
function shapeWarnings(summary, layout, catalogue, warn) {
  const own = /^process-(.+)$/.exec(layout.id ?? '')?.[1];
  const block = (summary.blocks ?? []).find((b) => b.type === 'process');
  if (own && block && !(layout.boxes ?? []).some((x) => x.flow?.shape)) {
    const r = catalogue.shapeRanges?.[own];
    if (r) {
      const need = r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
      warn(
        'content',
        `layout "${layout.id}" needs ${need} nodes (has ${block.nodes}): drawn as linear steps`,
      );
    }
  }
  for (const b of summary.blocks ?? []) {
    if (b.type !== 'process' || !b.shape || b.shape === 'linear') continue;
    const range = catalogue.shapeRanges?.[b.shape];
    const drawn = (layout.boxes ?? []).some((x) => x.flow?.shape === b.shape);
    if (range && (b.nodes < range.min || b.nodes > range.max)) {
      const need = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
      warn(
        'content',
        `process.shape "${b.shape}" needs ${need} nodes (has ${b.nodes}): drawn as linear steps`,
      );
    } else if (range && !drawn) {
      warn('content', `process.shape "${b.shape}" not drawn on layout "${layout.id}"`, 'info');
    }
  }
}
