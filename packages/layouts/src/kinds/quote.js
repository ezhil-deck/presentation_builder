/**
 * Quote. Title (h1) in the title zone; the quote box (role: the quote hint's titleRole when the Mood defines it, else
 * quote) centred in the body area at the quote role's measure; alignment from components.quote.tokens.align, else
 * the layout default `center` (P2-spec §2); attribution (components.quote.tokens.attributionFont when the Mood
 * defines that role, else quoteAttribution) under it.
 */
import { createBuilder } from '../common.js';
import {
  LINES,
  bodyArea,
  bottom,
  frame,
  gutter,
  lineBox,
  measure,
  pickRole,
  right,
  space,
  titleBox,
} from '../geometry.js';

export default {
  id: 'quote',
  kind: 'quote',
  version: 1,
  tags: ['quote', 'airy'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    // The quote hint's titleRole names the quote's own role (below), so the slide title keeps h1.
    b.title(titleBox(mood), pickRole(mood, 'h1'));
    const area = bodyArea(mood);
    const qt = mood.components?.quote?.tokens ?? {};
    const align = ['left', 'center', 'right'].includes(qt.align) ? qt.align : 'center';
    const qRole = pickRole(mood, mood.composition?.layoutHints?.quote?.titleRole, 'quote');
    const aRole = pickRole(mood, qt.attributionFont, 'quoteAttribution');
    const w = measure(mood, qRole, area.w);
    const x = align === 'center' ? area.x + (area.w - w) / 2 : align === 'right' ? right(area) - w : area.x;
    const md = space(mood, 'md');
    const ah = lineBox(mood, aRole, LINES.label);
    const q = b.box('quote', frame(x, area.y, w, area.h - ah - md), {
      role: 'quote',
      slot: 'quote',
      align: { h: align, v: 'middle' },
    });
    b.slot('quote', 'quote', 'quote', { role: qRole });
    b.box('attribution', frame(x, bottom(q) + md, w, ah), {
      role: 'attribution',
      slot: 'attribution',
      align: { h: align, v: 'top' },
    });
    b.slot('attribution', 'text', 'attribution', { role: aRole });
    const g = gutter(mood);
    b.zone(frame(area.x, area.y, x - g - area.x, area.h));
    b.zone(frame(x + w + g, area.y, right(area) - x - w - g, area.h));
    return b.finish();
  },
};
