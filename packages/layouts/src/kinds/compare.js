/**
 * Compare layouts (content/2 `compare`, S2.a slice 3; catalogue: comparison, before / after, pricing tiers): the
 * columns as a row of `compare-column` items (image banner, label, header, rows with check marks) or, for `tiers`,
 * of `tier-card` items (the brand's card: label, name, price in the stat role, unit, features). A plain compare
 * (headers + rows, no label / image / check / tiers) keeps the v1 two-column layout.
 */
import { createBuilder, flowBox, nodesOf, standardTitle, v2Block } from '../common.js';
import { LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

/**
 * The height the columns need (signals: the item layout's roles - label eyebrow, header, price stat, unit, a bullet
 * line per row with the list gap, card padding), capped to the body area; null when the rows are not known (the
 * picker's preview: the full area).
 */
function needHeight(mood, block, tiers) {
  const rows = Number(block?.rows) || 0;
  if (!rows) return null;
  const f = new Set(block.fields ?? []);
  const sm = space(mood, 'sm');
  const md = space(mood, 'md');
  const t = mood.components?.card?.tokens ?? {};
  const list =
    rows * (lineBox(mood, pickRole(mood, 'bullet', 'body'), 1) + sm) + (f.has('check') ? rows * sm : 0);
  let h = (f.has('label') ? lineBox(mood, pickRole(mood, 'eyebrow', 'caption'), LINES.one) + sm : 0) + list;
  if (tiers) {
    const p = typeof t.padding === 'number' ? t.padding : md;
    h +=
      2 * p +
      lineBox(mood, pickRole(mood, t.titleRole, 'h3'), LINES.heading) +
      sm +
      (f.has('price') ? lineBox(mood, 'stat', LINES.one) : 0) +
      (f.has('per') ? lineBox(mood, pickRole(mood, 'bodySmall', 'caption', 'body'), LINES.one) : 0) +
      md;
  } else {
    h += lineBox(mood, pickRole(mood, 'h2', 'h3'), LINES.heading) + sm;
    // a body under some rows: one more line per row (the fitter measures)
    if (f.has('items')) h += rows * lineBox(mood, pickRole(mood, 'bullet', 'body'), 1);
  }
  return h;
}

/** One flow box `compare` (slot type cards, bound to the compare block's columns) across the body area. */
function compareFlow(b, block, itemLayout) {
  const n = Math.max(2, Math.min(4, nodesOf(block) || 2));
  const area = b.area();
  // columns with images take the full area (the banner scales with it); otherwise as tall as the rows need
  const need = (block?.fields ?? []).includes('image')
    ? null
    : needHeight(b.mood, block, itemLayout === 'tier-card');
  const f = need ? frame(area.x, area.y, area.w, Math.min(area.h, need)) : area;
  if (f.h < area.h)
    b.zone(
      frame(area.x, bottom(f) + space(b.mood, 'lg'), area.w, bottom(area) - bottom(f) - space(b.mood, 'lg')),
    );
  flowBox(b, {
    id: 'compare',
    f,
    role: 'group',
    slotType: 'cards',
    kind: 'cards',
    n,
    itemLayout,
  });
}

const isTiers = (block) =>
  Boolean(block && (block.tiers || (block.fields ?? []).some((f) => f === 'price' || f === 'features')));

export const compareColumns = {
  id: 'compare-columns',
  kind: 'two-column',
  version: 1,
  label: 'Compare columns',
  tags: ['compare', 'columns'],
  /** A compare whose columns carry a label, an image or check rows (and are not pricing tiers). */
  match(summary) {
    const block = v2Block(summary, 'compare');
    if (!block || isTiers(block)) return 0;
    return (block.fields ?? []).some((f) => f === 'label' || f === 'image' || f === 'check') ? 25 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'two-column');
    compareFlow(b, v2Block(ctx.summary, 'compare'), 'compare-column');
    return b.finish();
  },
};

export const compareTiers = {
  id: 'compare-tiers',
  kind: 'two-column',
  version: 1,
  label: 'Pricing tiers',
  tags: ['compare', 'pricing', 'cards'],
  /** A compare of pricing tiers (`tiers: true`, or columns with a price / features). */
  match(summary) {
    return isTiers(v2Block(summary, 'compare')) ? 30 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'two-column');
    compareFlow(b, v2Block(ctx.summary, 'compare'), 'tier-card');
    return b.finish();
  },
};
