/**
 * Full-bleed image (the canvas) with a short title at the bottom of the content frame (hint titleRole, else h1).
 * The image fills the canvas, so the only decor zones left are none (a photo is content).
 */
import { createBuilder, titleRoleFor } from '../common.js';
import { CANVAS, LINES, bottom, frame, lineBox } from '../geometry.js';

export default {
  id: 'image',
  kind: 'image',
  version: 1,
  tags: ['image', 'full-bleed'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood, content: c } = b;
    b.box('image', frame(0, 0, CANVAS.w, CANVAS.h), { role: 'image', slot: 'image' });
    b.slot('image', 'image', 'image');
    const r = titleRoleFor(mood, 'image', 'h1');
    const th = Math.min(c.h, lineBox(mood, r, LINES.title));
    b.title(frame(c.x, bottom(c) - th, c.w, th), r, { v: 'bottom' });
    return b.finish();
  },
};
