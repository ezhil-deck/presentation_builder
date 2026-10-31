/**
 * The layout catalogue (P2-spec §2): one LayoutDef per kind in v1, plus the alias table (no module of their own).
 * LayoutDef = { id, kind, version, tags, build(ctx) → Layout (schemas/layout.schema.json) }.
 */
import agenda from './kinds/agenda.js';
import bullets from './kinds/bullets.js';
import cards from './kinds/cards.js';
import chart from './kinds/chart.js';
import cover from './kinds/cover.js';
import cta from './kinds/cta.js';
import image from './kinds/image.js';
import imageText from './kinds/image-text.js';
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

const DEFS = Object.freeze(
  [
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
  ].map((d) => Object.freeze(d)),
);

const byId = new Map(DEFS.map((d) => [d.id, d]));

/** The kind a (possibly aliased) kind resolves to. */
export function resolveKind(kind) {
  return ALIASES[kind] ?? kind;
}

export const catalogue = Object.freeze({
  /** Every LayoutDef. */
  list() {
    return [...DEFS];
  },
  /** LayoutDefs for a kind (aliases resolve: diagram → steps …); unknown kind → []. */
  forKind(kind) {
    const k = resolveKind(kind);
    return DEFS.filter((d) => d.kind === k);
  },
  /** A LayoutDef by id, or undefined. */
  get(id) {
    return byId.get(id);
  },
  aliases: ALIASES,
  /** Item sub-layout for one flow cell (P2-spec §7 F6): `itemLayout(id, {mood, w, h})` → {id, boxes, slots}, item-local px. */
  itemLayout,
  /** The cell frames of a flow box: `flowCells(frame, n, gap, direction)` (row / column). */
  flowCells,
});
