/**
 * Kind normalisation + layout pick (P2-spec §2, §3.1; docs/S2-layouts.md §4). The kind's default layout (the v1 one)
 * unless the slide is content/2 and a layout of the kind matches its blocks better (`def.match(summary)`: main +
 * aside, a process shape, the single-KPI hero, two columns of points).
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
 * pick(kind, summary, mood, catalogue, {warn, layoutId}) -> Layout instance (schemas/layout.schema.json).
 * A pinned `layoutId` wins when the catalogue has it; a kind with no layout falls back to the `text` layout (warning);
 * an unknown kind is `text` (warning). Returns null when not even `text` exists.
 */
export function pick(kind, summary, mood, catalogue, { warn = () => {}, layoutId } = {}) {
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
      let best = 0;
      for (const d of defs) {
        const score = typeof d.match === 'function' ? Number(d.match(summary)) || 0 : 0;
        if (score > best) {
          best = score;
          def = d;
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
