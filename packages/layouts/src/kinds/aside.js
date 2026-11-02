/**
 * Main + aside layouts (docs/PLAN-studio.md §3.2, docs/S2-layouts.md §1): the reference catalogue's most common
 * three-container slides - a title, a main block (process / chart / table / image / items / kpis / points) and one
 * aside block (points / items / paragraph / kpis) that explains it. Three placements of the aside: right (main 7 /
 * aside 5 of the 12-column grid with the brand's gutter), left (aside 5 / main 7) and below (a row under the main, its
 * height from the aside's own roles). Two lists of one type (items + items, points + points) split 6 + 6.
 *
 * pick() chooses by the blocks present (`match`): the aside below for a KPI aside, else on the side where the aside
 * sits in the content (written first → left, after → right). The Studio's picker lists every placement.
 */
import {
  createBuilder,
  flowBox,
  itemCardFields,
  estimateLines,
  mainAside,
  mainAsides,
  nodesOf,
  standardTitle,
  v2Block,
} from '../common.js';
import { LINES, bottom, frame, gutter, lineBox, pickRole, space, spans } from '../geometry.js';
import { iconFile } from '../icons.js';
import { cardPadding } from '../shapes.js';
import { processInto } from './process.js';
import { tableInto } from './table.js';

/** Main kinds: the def id prefix -> the content/2 block it takes, the layout kind (schema enum), a label. */
export const MAINS = Object.freeze({
  steps: { block: 'process', kind: 'steps', label: 'Process' },
  chart: { block: 'chart', kind: 'chart', label: 'Chart' },
  table: { block: 'table', kind: 'table', label: 'Table' },
  image: { block: 'image', kind: 'image-text', label: 'Image' },
  cards: { block: 'items', kind: 'cards', label: 'Items' },
  kpi: { block: 'kpis', kind: 'kpi', label: 'Numbers' },
  bullets: { block: 'points', kind: 'bullets', label: 'Points' },
});

/** The kind a slide is inferred as when this block is its aside (packages/engine content/parse inferKind). */
const ASIDE_KINDS = Object.freeze(['bullets', 'cards', 'text', 'kpi']);
const SIDES = Object.freeze({ right: 'aside right', left: 'aside left', below: 'aside below' });

/** The item layout an items block takes (rich card when its items carry icons / images / labels). */
export function cardItemLayout(mood, block) {
  return itemCardFields(mood, block, iconFile) ? 'item-card' : 'card-title-text';
}

/** The KPI item layout (with a body slot when the KPIs carry a body). */
export function kpiItemLayout(block) {
  return (block?.fields ?? []).includes('body') ? 'kpi-value-label-body' : 'kpi-value-label';
}

/**
 * A group heading above a list (the items block's `title`): box `<flow>-heading` (role subtitle, h3), bound by the
 * engine to the block bound to slot `<flow>`. Returns the frame left for the list.
 */
export function groupHeading(b, f, flowId, block) {
  if (!block?.title) return f;
  const r = pickRole(b.mood, 'h3', 'body');
  const hh = Math.min(f.h, lineBox(b.mood, r, LINES.heading));
  const id = `${flowId}-heading`;
  b.box(id, frame(f.x, f.y, f.w, hh), { role: 'subtitle', slot: id, ...b.bodyAlign({ v: 'top' }) });
  b.slot(id, 'text', id, { role: r });
  const sm = space(b.mood, 'sm');
  return frame(f.x, f.y + hh + sm, f.w, f.h - hh - sm);
}

/** A list box (points) with the bullets capacity of the Mood. */
function listInto(b, f, id) {
  const r = pickRole(b.mood, 'bullet', 'body');
  b.box(id, f, { role: 'list', slot: id, ...b.bodyAlign({ v: 'top' }) });
  const bl = b.mood.type?.bullets ?? {};
  const capacity = { minItems: 1 };
  if (Number.isInteger(bl.maxPerSlide)) capacity.maxItems = bl.maxPerSlide;
  if (Number.isInteger(bl.maxDepth)) capacity.maxLevels = bl.maxDepth;
  b.slot(id, 'list', id, { role: r, capacity });
}

function itemsInto(b, f, id, block, direction, cols) {
  const rest = groupHeading(b, f, id, block);
  // main + aside slides are content/2 only: their items always take the rich card (its heading gives unused lines
  // to the body), so a narrow column keeps room for the text
  const itemLayout = 'item-card';
  flowBox(b, {
    id,
    f: rest,
    role: 'group',
    slotType: 'cards',
    kind: 'cards',
    n: cols,
    itemLayout,
    direction,
  });
}

function kpisInto(b, f, id, block, direction, cols) {
  flowBox(b, {
    id,
    f,
    role: 'kpis',
    slotType: 'kpis',
    kind: 'kpi',
    n: cols,
    itemLayout: kpiItemLayout(block),
    direction,
  });
}

/** Height of an aside placed below the main, from its roles (signals: type.roles, card padding, spacing.sm). */
function belowHeight(mood, type, block) {
  const sm = space(mood, 'sm');
  if (type === 'kpis') {
    const label = pickRole(mood, mood.components?.kpi?.tokens?.labelStyle, 'statLabel');
    let h = lineBox(mood, 'stat', LINES.one) + sm + lineBox(mood, label, LINES.label);
    if ((block?.fields ?? []).includes('body'))
      h += sm + lineBox(mood, pickRole(mood, 'bodySmall', 'body'), 3);
    return h;
  }
  if (type === 'paragraph') return lineBox(mood, pickRole(mood, 'body'), 4);
  if (type === 'items') {
    const t = mood.components?.card?.tokens ?? {};
    const head = block?.title ? lineBox(mood, pickRole(mood, 'h3', 'body'), LINES.heading) + sm : 0;
    return (
      head +
      2 * cardPadding(mood) +
      lineBox(mood, pickRole(mood, t.titleRole, 'h3'), LINES.heading) +
      sm +
      lineBox(mood, pickRole(mood, t.bodyRole, 'body'), 3)
    );
  }
  // points: one bullet line per point (the list wraps inside its box; the fitter measures)
  return lineBox(mood, pickRole(mood, 'bullet', 'body'), Math.max(2, nodesOf(block) || 3));
}

function mainInto(b, f, key, summary, { pair, below }) {
  const block = v2Block(summary, MAINS[key].block);
  const n = nodesOf(block) || Number(summary?.items) || 3;
  switch (key) {
    case 'steps':
      processInto(b, f, block?.shape, summary);
      return;
    case 'chart':
    case 'image':
      b.box(key, f, { role: key, slot: key });
      b.slot(key, key, key);
      return;
    case 'table':
      tableInto(b, f);
      return;
    case 'cards':
      if (pair) itemsInto(b, f, 'cards', block, 'column', 1);
      else itemsInto(b, f, 'cards', block, 'row', Math.min(n, below ? 4 : 2));
      return;
    case 'kpi':
      kpisInto(b, f, 'kpis', block, 'row', Math.min(n, below ? 4 : 2));
      return;
    default:
      listInto(b, f, 'list');
  }
}

function asideInto(b, f, type, block, side, id = 'aside', maxCols = 4) {
  const n = nodesOf(block) || 3;
  const row = side === 'below';
  const cols = row ? Math.min(n, maxCols) : 1;
  if (type === 'items') itemsInto(b, f, id, block, row ? 'row' : 'column', cols);
  else if (type === 'kpis') kpisInto(b, f, id, block, row ? 'row' : 'column', cols);
  else if (type === 'paragraph') {
    const r = pickRole(b.mood, 'body');
    b.box(id, f, { role: 'body', slot: id, ...b.bodyAlign({ v: 'top' }) });
    b.slot(id, 'richtext', id, { role: r });
  } else listInto(b, f, id);
}

function asideDef(key, side) {
  const main = MAINS[key];
  return {
    id: `${key}-aside-${side}`,
    kind: main.kind,
    kinds: [...new Set([main.kind, ...ASIDE_KINDS])],
    version: 1,
    label: `${main.label}, ${SIDES[side]}`,
    tags: ['aside', side, main.block],
    /** One main block of this def's type + one aside block; the preferred placement scores higher. */
    match(summary) {
      const parts = mainAside(summary);
      if (!parts || parts.main.type !== main.block) return 0;
      // image + paragraph is the image-text layout's own composition (image, heading, body)
      if (main.block === 'image' && parts.aside.type === 'paragraph') return 0;
      const prefer = parts.aside.type === 'kpis' ? 'below' : parts.asideFirst ? 'left' : 'right';
      return side === prefer ? 20 : 10;
    },
    build(ctx) {
      const b = createBuilder(this, ctx);
      const { mood } = b;
      const summary = ctx.summary ?? {};
      standardTitle(b, main.kind);
      const area = b.area();
      const parts = mainAside(summary);
      const asideType = parts?.aside.type ?? 'points';
      const pair =
        (key === 'cards' && asideType === 'items') || (key === 'bullets' && asideType === 'points');
      let mf;
      let af;
      if (side === 'below') {
        const lg = space(mood, 'lg');
        const ah = Math.min(area.h * 0.45, belowHeight(mood, asideType, parts?.aside));
        mf = frame(area.x, area.y, area.w, area.h - ah - lg);
        af = frame(area.x, bottom(mf) + lg, area.w, ah);
      } else {
        const split = pair ? [6, 6] : [7, 5];
        const g = gutter(mood);
        if (side === 'right') [mf, af] = spans(area, split, g);
        else [af, mf] = spans(area, [...split].reverse(), g);
      }
      mainInto(b, mf, key, summary, { pair, below: side === 'below' });
      asideInto(b, af, asideType, parts?.aside, side);
      return b.finish();
    },
  };
}

export const asideDefs = Object.keys(MAINS).flatMap((key) =>
  Object.keys(SIDES).map((side) => asideDef(key, side)),
);

/**
 * Three-block slides (docs/S2-layouts.md §8): a main (process / chart / table / image) with two asides (points /
 * items / paragraph / kpis). `<main>-asides-right`: main 7 / the two asides stacked in 5, each as tall as its
 * content needs (30–70 % of the column); `<main>-aside-below-2`: the main above, the two asides side by side below
 * (6 / 6), as tall as the taller one needs (≤ 45 % of the body area). pick() takes the asides below when one of them is
 * a KPI block (as for one aside), else the stacked column.
 */
const PLACEMENTS3 = Object.freeze({
  right: { suffix: 'asides-right', label: 'two asides right' },
  below: { suffix: 'aside-below-2', label: 'two asides below' },
});
const MAIN3_KEYS = Object.freeze(['steps', 'chart', 'table', 'image']);

/** Height an aside needs as one block of a column `w` wide (its roles; weights for the stacked split). */
function columnNeed(mood, type, block, w) {
  const md = space(mood, 'md');
  const n = Math.max(1, nodesOf(block) || 2);
  if (type === 'kpis' || type === 'items') {
    const head = block?.title ? lineBox(mood, pickRole(mood, 'h3', 'body'), LINES.heading) + md : 0;
    return head + n * belowHeight(mood, type, { ...block, title: undefined }) + (n - 1) * md;
  }
  const chars = Number(block?.chars?.text) || 0;
  if (type === 'paragraph') {
    const r = pickRole(mood, 'body');
    return lineBox(mood, r, estimateLines(mood, r, chars, w) ?? 4);
  }
  const r = pickRole(mood, 'bullet', 'body');
  return n * lineBox(mood, r, estimateLines(mood, r, chars, w) ?? 2) + (n - 1) * md;
}

function asides3Def(key, side) {
  const main = MAINS[key];
  const { suffix, label } = PLACEMENTS3[side];
  return {
    id: `${key}-${suffix}`,
    kind: main.kind,
    kinds: [...new Set([main.kind, ...ASIDE_KINDS])],
    version: 1,
    label: `${main.label}, ${label}`,
    tags: ['aside', 'asides', side, main.block],
    /** One main block of this def's type + two aside blocks; the preferred placement scores higher. */
    match(summary) {
      const parts = mainAsides(summary);
      if (!parts || parts.main.type !== main.block) return 0;
      const prefer = parts.asides.some((a) => a.type === 'kpis') ? 'below' : 'right';
      return side === prefer ? 20 : 10;
    },
    build(ctx) {
      const b = createBuilder(this, ctx);
      const { mood } = b;
      const summary = ctx.summary ?? {};
      standardTitle(b, main.kind);
      const area = b.area();
      const parts = mainAsides(summary);
      const asides = parts?.asides ?? [
        { type: 'points', nodes: 3 },
        { type: 'paragraph', nodes: 1 },
      ];
      const lg = space(mood, 'lg');
      const g = gutter(mood);
      let mf;
      let frames;
      if (side === 'below') {
        const need = Math.max(...asides.map((a) => belowHeight(mood, a.type, a)));
        const ah = Math.min(area.h * 0.45, need);
        mf = frame(area.x, area.y, area.w, area.h - ah - lg);
        const row = frame(area.x, bottom(mf) + lg, area.w, ah);
        frames = spans(row, [6, 6], g);
      } else {
        let col;
        [mf, col] = spans(area, [7, 5], g);
        const avail = col.h - lg;
        const [n1, n2] = asides.map((a) => Math.max(1, columnNeed(mood, a.type, a, col.w)));
        const h1 = Math.min(0.7 * avail, Math.max(0.3 * avail, (avail * n1) / (n1 + n2)));
        frames = [frame(col.x, col.y, col.w, h1), frame(col.x, col.y + h1 + lg, col.w, avail - h1)];
      }
      mainInto(b, mf, key, summary, { pair: false, below: side === 'below' });
      // body slots last: a paragraph's richtext slot takes every body block left, so the list slots bind first
      const order = [0, 1].sort(
        (i, j) => Number(asides[i].type === 'paragraph') - Number(asides[j].type === 'paragraph'),
      );
      for (const i of order)
        asideInto(b, frames[i], asides[i].type, asides[i], side, `aside-${i + 1}`, side === 'below' ? 3 : 1);
      return b.finish();
    },
  };
}

export const asides3Defs = MAIN3_KEYS.flatMap((key) =>
  Object.keys(PLACEMENTS3).map((side) => asides3Def(key, side)),
);
