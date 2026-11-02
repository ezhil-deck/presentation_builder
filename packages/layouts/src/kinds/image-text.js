/** Image beside text: 5+7 grid spans, image left (P2-spec §2); the text column takes an optional heading + body. */
import { createBuilder, standardTitle } from '../common.js';
import { LINES, frame, gutter, lineBox, pickRole, space, spans } from '../geometry.js';

export default {
  id: 'image-text',
  kind: 'image-text',
  version: 1,
  tags: ['image', 'columns'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'image-text', { subtitle: false });
    const area = b.area();
    const [left, rightCol] = spans(area, [5, 7], gutter(mood));
    b.box('image', left, { role: 'image', slot: 'image' });
    b.slot('image', 'image', 'image');
    const headRole = pickRole(mood, 'h2');
    const bodyRole = pickRole(mood, 'body');
    const hh = lineBox(mood, headRole, LINES.heading);
    const sm = space(mood, 'sm');
    b.box('subtitle', frame(rightCol.x, rightCol.y, rightCol.w, hh), {
      role: 'subtitle',
      slot: 'subtitle',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('subtitle', 'text', 'subtitle', { role: headRole });
    b.box('body', frame(rightCol.x, rightCol.y + hh + sm, rightCol.w, rightCol.h - hh - sm), {
      role: 'body',
      slot: 'body',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('body', 'richtext', 'body', { role: bodyRole });
    return b.finish();
  },
};
