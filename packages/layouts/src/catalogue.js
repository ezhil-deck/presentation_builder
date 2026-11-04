/**
 * The layout catalogue (P2-spec §2): one LayoutDef per kind in v1 (each kind's default, first in `forKind`), the alias
 * table (no module of their own), and the S2.a variants (docs/S2-layouts.md): main + aside layouts, the 11 process
 * shapes, the single-KPI hero and points in two columns; S2.b (§8): main + two asides and the agenda with descriptions.
 * LayoutDef = { id, kind, kinds?, version, label, tags, match?(summary, {options}) → score, build(ctx) → Layout
 * (schemas/layout.schema.json) }. `kinds` lists the other slide kinds a layout can take (a main + aside slide is
 * inferred as either block's kind); `match` scores how well a content/2 slide's blocks fit (0 = not at all).
 *
 * C3 (docs/PLAN-catalogue.md): the 1,077 catalogue layouts (catalogue-defs.js, `cat-l<plan>-<n>`, read lazily on first
 * use) come after the 68. They are listed only when asked for - `list({catalogue: true})`, `forKind(kind, {catalogue:
 * true})` (compose asks for them on every content/2 slide since C4) - so the Studio's picker and every caller that
 * enumerates the 68 are unchanged; `get(id)` finds them always (a pinned catalogue layout). `nearest(blocks)` names
 * the catalogue record nearest a slide's blocks (catalogue-key.js nearestKey: the fallback warning, C4).
 */
import agenda, { agendaRows } from './kinds/agenda.js';
import bullets, { bulletsColumns } from './kinds/bullets.js';
import { asideDefs, asides3Defs } from './kinds/aside.js';
import kpiHero from './kinds/kpi-hero.js';
import kpiNested from './kinds/kpi-nested.js';
import { processDefs } from './kinds/process.js';
import { iconContainer, iconFile, iconSize } from './icons.js';
import { SHAPE_RANGES, connector, nodeRoles, processShape, shapeFits } from './shapes.js';
import cards from './kinds/cards.js';
import { compareColumns, compareTiers } from './kinds/compare.js';
import chart from './kinds/chart.js';
import cover from './kinds/cover.js';
import cta from './kinds/cta.js';
import image from './kinds/image.js';
import imageText from './kinds/image-text.js';
import { imageCollage, imageDevice } from './kinds/media.js';
import { quoteGrid, quotePhoto } from './kinds/quotes.js';
import kpi from './kinds/kpi.js';
import logos from './kinds/logos.js';
import quote from './kinds/quote.js';
import section from './kinds/section.js';
import steps from './kinds/steps.js';
import table from './kinds/table.js';
import team from './kinds/team.js';
import text from './kinds/text.js';
import timeline from './kinds/timeline.js';
import twoColumn from './kinds/two-column.js';
import { flowCells } from './common.js';
import { itemLayout } from './items.js';
import { catalogueDef, catalogueDefs, catalogueMeta } from './catalogue-defs.js';
import { bandDistance, combinationKey, combinationShape, nearestKey } from './catalogue-key.js';

/** The v1 kinds, in showcase order. */
export const KINDS = Object.freeze([
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

/** Kinds that reuse another kind's layout (P2-spec §2). */
export const ALIASES = Object.freeze({ diagram: 'steps', comparison: 'two-column', blank: 'text' });

/** Short labels for the picker (v1 defaults). */
const V1_LABELS = Object.freeze({
  cover: 'Cover',
  section: 'Section',
  agenda: 'Agenda',
  bullets: 'Points',
  text: 'Text',
  'two-column': 'Two columns',
  cards: 'Cards',
  steps: 'Steps',
  timeline: 'Timeline',
  kpi: 'Numbers',
  chart: 'Chart',
  table: 'Table',
  image: 'Full image',
  'image-text': 'Image and text',
  quote: 'Quote',
  team: 'Team',
  logos: 'Logos',
  cta: 'Closing',
});

const V1 = [
  cover,
  section,
  agenda,
  bullets,
  text,
  twoColumn,
  cards,
  steps,
  timeline,
  kpi,
  chart,
  table,
  image,
  imageText,
  quote,
  team,
  logos,
  cta,
];

const DEFS = Object.freeze(
  [
    ...V1.map((d) => ({ ...d, label: d.label ?? V1_LABELS[d.id] })),
    ...processDefs,
    ...asideDefs,
    kpiHero,
    bulletsColumns,
    compareColumns,
    compareTiers,
    imageCollage,
    imageDevice,
    quoteGrid,
    quotePhoto,
    kpiNested,
    ...asides3Defs,
    agendaRows,
  ].map((d) => Object.freeze(d)),
);

const byId = new Map(DEFS.map((d) => [d.id, d]));

/** The kind a (possibly aliased) kind resolves to. */
export function resolveKind(kind) {
  return ALIASES[kind] ?? kind;
}

/** Defs of `list` that take kind `k`: its own first, then those listing `k` in `kinds`. */
const takes = (list, k) => [
  ...list.filter((d) => d.kind === k),
  ...list.filter((d) => d.kind !== k && d.kinds?.includes(k)),
];

export const catalogue = Object.freeze({
  /** Every LayoutDef: the 68; with `{catalogue: true}` the 1,077 catalogue layouts after them (1,145). */
  list({ catalogue: withCatalogue = false } = {}) {
    return withCatalogue ? [...DEFS, ...catalogueDefs()] : [...DEFS];
  },
  /**
   * LayoutDefs that can take a slide of this kind (aliases resolve: diagram → steps …): the kind's own layouts first
   * (the v1 default at [0]), then the layouts that list the kind in `kinds`; with `{catalogue: true}` the catalogue
   * layouts that take the kind after them; unknown kind → [].
   */
  forKind(kind, { catalogue: withCatalogue = false } = {}) {
    const k = resolveKind(kind);
    const own = takes(DEFS, k);
    return withCatalogue ? [...own, ...takes(catalogueDefs(), k)] : own;
  },
  /** A LayoutDef by id (the 68 or a catalogue layout `cat-l<plan>-<n>`), or undefined. */
  get(id) {
    return byId.get(id) ?? catalogueDef(id);
  },
  /** The combination key of a content/2 slide's summary blocks (catalogue-key.js; C4 matches on it). */
  combinationKey,
  combinationShape,
  bandDistance,
  /**
   * The catalogue layout whose record lies nearest a slide's summary blocks (nearestKey over every record, catalogue
   * order): `{def, distance: {types, counts, bands}, missing: [block types no record has]}`, or null.
   */
  nearest(blocks) {
    const defs = catalogueDefs();
    const hit = nearestKey(
      defs.map((d) => d.record),
      blocks,
    );
    if (!hit) return null;
    const types = new Set(defs.flatMap((d) => d.record.combination.map((b) => b.type)));
    const missing = [...new Set((blocks ?? []).map((b) => b.type).filter((t) => !types.has(t)))];
    return { def: defs.find((d) => d.record === hit.record), distance: hit.distance, missing };
  },
  /** The catalogue layouts' measured grid, size-band roles and bands (catalogue-defs.js). */
  catalogueMeta,
  aliases: ALIASES,
  /** Item sub-layout for one flow cell (P2-spec §7 F6): `itemLayout(id, {mood, w, h})` → {id, boxes, slots}, item-local px. */
  itemLayout,
  /** The cell frames of a flow box: `flowCells(frame, n, gap, direction)` (row / column). */
  flowCells,
  /** Process shape geometry (shapes.js): `processShape(shape, {mood, frame, n, body, icon})` → {nodes, marks} | null. */
  processShape,
  shapeFits,
  shapeRanges: SHAPE_RANGES,
  /** The node roles and connector look the shapes use. */
  nodeRoles,
  connector,
  /** Brand icons by name (icons.js). */
  iconFile,
  iconSize,
  iconContainer,
});
