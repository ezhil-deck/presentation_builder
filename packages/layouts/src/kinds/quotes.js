/**
 * Quote layouts for content/2 `quotes` (S2.a slice 3; catalogue: quotes 30 + testimonials 11 presets): 2–4 quotes as
 * a grid of quote cards (2 or 3 in a row, 4 as 2 × 2), and one quote with a photo (the photo in the left 5 of 12
 * columns, the quote and attribution in the right 7). A label (eyebrow) sits above a single quote.
 */
import { createBuilder, estimateLines, flowBox, nodesOf, standardTitle, v2Blocks } from '../common.js';
import { LINES, bottom, frame, gutter, lineBox, pickRole, space, spans } from '../geometry.js';

const onlyQuotes = (summary) => {
  const blocks = v2Blocks(summary);
  return blocks.length === 1 && blocks[0].type === 'quotes' ? blocks[0] : null;
};

export const quoteGrid = {
  id: 'quote-grid',
  kind: 'quote',
  version: 1,
  label: 'Quotes grid',
  tags: ['quote', 'grid', 'cards'],
  /** One quotes block of 2–4 quotes. */
  match(summary) {
    const n = nodesOf(onlyQuotes(summary));
    return n >= 2 ? 30 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'quote', { role: pickRole(b.mood, 'h1') });
    const block = onlyQuotes(ctx.summary);
    const n = Math.max(2, Math.min(4, nodesOf(block) || 3));
    const cols = n === 4 ? 2 : n;
    const rows = Math.ceil(n / cols);
    const area = b.area();
    // each card as tall as its longest quote needs at the quote role (estimated from the face's average width; the
    // fitter measures and steps down), the rows centred in the body area
    const { mood } = b;
    const md = space(mood, 'md');
    const sm = space(mood, 'sm');
    const t = mood.components?.card?.tokens ?? {};
    const p = typeof t.padding === 'number' ? t.padding : md;
    const cw = (area.w - md * (cols - 1)) / cols;
    const qRole = pickRole(mood, mood.composition?.layoutHints?.quote?.titleRole, 'quote');
    const lines = estimateLines(mood, qRole, block?.chars?.text, cw - 2 * p);
    const f = (block?.fields ?? []).includes('label');
    const qt = mood.components?.quote?.tokens ?? {};
    const person =
      lineBox(mood, pickRole(mood, qt.attributionFont, 'quoteAttribution', 'h3'), LINES.one) +
      ((block?.fields ?? []).includes('role')
        ? lineBox(mood, pickRole(mood, 'personRole', 'bodySmall', 'body'), LINES.one)
        : 0);
    const cardH = lines
      ? 2 * p +
        (f ? lineBox(mood, pickRole(mood, 'eyebrow', 'caption'), LINES.one) + sm : 0) +
        lineBox(mood, qRole, lines) +
        md +
        person
      : null;
    const h = cardH ? Math.min(area.h, rows * cardH + (rows - 1) * md) : area.h;
    const y = area.y + (area.h - h) / 2;
    flowBox(b, {
      id: 'quote',
      f: frame(area.x, y, area.w, h),
      role: 'group',
      slotType: 'quote',
      kind: 'cards',
      n: cols,
      itemLayout: 'quote-card',
      maxItems: 4,
    });
    const lg = space(mood, 'lg');
    b.zone(frame(area.x, area.y, area.w, y - lg - area.y));
    b.zone(frame(area.x, bottom(area) - (y - area.y) + lg, area.w, y - lg - area.y));
    return b.finish();
  },
};

/**
 * The single quote of `area` as the v1 quote layout sets it (quote box + attribution under it, the brand's quote
 * alignment), with a label above when the quote carries one. Returns the quote frame.
 */
export function quoteBlock(b, area, { label }) {
  const { mood } = b;
  const qt = mood.components?.quote?.tokens ?? {};
  const align = ['left', 'center', 'right'].includes(qt.align) ? qt.align : 'center';
  const qRole = pickRole(mood, mood.composition?.layoutHints?.quote?.titleRole, 'quote');
  const aRole = pickRole(mood, qt.attributionFont, 'quoteAttribution');
  const md = space(mood, 'md');
  const sm = space(mood, 'sm');
  const ah = lineBox(mood, aRole, LINES.label);
  let y = area.y;
  if (label) {
    const lr = pickRole(mood, 'eyebrow', 'caption');
    const lh = lineBox(mood, lr, LINES.one);
    b.box('quote-label', frame(area.x, y, area.w, lh), {
      role: 'eyebrow',
      slot: 'quote-label',
      align: { h: align, v: 'bottom' },
    });
    b.slot('quote-label', 'text', 'quote-label', { role: lr });
    y += lh + sm;
  }
  const q = b.box('quote', frame(area.x, y, area.w, bottom(area) - y - ah - md), {
    role: 'quote',
    slot: 'quote',
    align: { h: align, v: 'middle' },
  });
  b.slot('quote', 'quote', 'quote', { role: qRole });
  b.box('attribution', frame(area.x, bottom(q) + md, area.w, ah), {
    role: 'attribution',
    slot: 'attribution',
    align: { h: align, v: 'top' },
  });
  b.slot('attribution', 'text', 'attribution', { role: aRole });
  return q;
}

export const quotePhoto = {
  id: 'quote-photo',
  kind: 'quote',
  version: 1,
  label: 'Quote with photo',
  tags: ['quote', 'photo', 'testimonial'],
  /** One quote that carries a photo. */
  match(summary) {
    const block = onlyQuotes(summary);
    return block && nodesOf(block) === 1 && (block.fields ?? []).includes('photo') ? 30 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'quote', { role: pickRole(b.mood, 'h1') });
    const [left, rightCol] = spans(b.area(), [5, 7], gutter(b.mood));
    b.box('quote-photo', left, { role: 'image', slot: 'quote-photo' });
    b.slot('quote-photo', 'image', 'quote-photo');
    const block = onlyQuotes(ctx.summary);
    quoteBlock(b, rightCol, { label: (block?.fields ?? []).includes('label') });
    return b.finish();
  },
};
