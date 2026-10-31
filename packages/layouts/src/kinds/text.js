/** Title + one body text block. The body column is the comfortable measure of the body role; the rest is decor zone. */
import { createBuilder, sideZone, standardTitle } from '../common.js';
import { bodyArea, frame, gutter, measure, pickRole } from '../geometry.js';

export default {
  id: 'text',
  kind: 'text',
  version: 1,
  tags: ['text', 'airy'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'text');
    const area = bodyArea(mood);
    const r = pickRole(mood, 'body');
    const f = b.box('body', frame(area.x, area.y, measure(mood, r, area.w), area.h), {
      role: 'body',
      slot: 'body',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('body', 'richtext', 'body', { role: r });
    sideZone(b, f, area, gutter(mood));
    return b.finish();
  },
};
