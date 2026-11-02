/**
 * Full-bleed image (the canvas) with a short title at the bottom of the content frame (hint titleRole, else h1).
 * The image fills the canvas, so the only decor zones left are none (a photo is content).
 */
import {
  createBuilder,
  labelBox,
  slideKeys,
  subtitleLines,
  subtitleRole,
  titleRoleFor,
  v2Block,
} from '../common.js';
import { CANVAS, LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

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
    // content/2: [label] title [subtitle], stacked up from the bottom of the content frame
    const keys = slideKeys(ctx.summary);
    const sm = space(mood, 'sm');
    let y = bottom(c);
    // content/2: the image's caption on the last line of the content frame (caption role)
    if ((v2Block(ctx.summary, 'image')?.fields ?? []).includes('caption')) {
      const cr = pickRole(mood, 'caption', 'bodySmall');
      const ch = lineBox(mood, cr, LINES.one);
      y -= ch;
      b.box('image-caption', frame(c.x, y, c.w, ch), {
        role: 'body',
        slot: 'image-caption',
        ...b.bodyAlign({ v: 'top' }),
      });
      b.slot('image-caption', 'text', 'image-caption', { role: cr });
      y -= sm;
    }
    if (keys.subtitle) {
      const sr = subtitleRole(mood);
      const sh = lineBox(mood, sr, subtitleLines(mood, sr, Number(ctx.summary?.subtitleChars) || 0, c.w));
      y -= sh;
      b.box('subtitle', frame(c.x, y, c.w, sh), {
        role: 'subtitle',
        slot: 'subtitle',
        ...b.bodyAlign({ v: 'top' }),
      });
      b.slot('subtitle', 'text', 'subtitle', { role: sr });
      y -= sm;
    }
    b.title(frame(c.x, y - th, c.w, th), r, { v: 'bottom' });
    if (keys.label) {
      const lh = lineBox(mood, 'eyebrow', LINES.one);
      if (lh) labelBox(b, c.x, y - th - sm - lh, c.w);
    }
    return b.finish();
  },
};
