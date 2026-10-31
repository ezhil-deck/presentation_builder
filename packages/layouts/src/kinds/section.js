/**
 * Section divider. Title (hint titleRole, else display) + subtitle, the group centred vertically in the content frame
 * (P2-spec §2); the bands above and below the group are decor zones. surface: the hint's surface, else
 * `prefer: 'dark'` only when palette.perKind.section is absent (P2-spec §2).
 */
import { createBuilder, surfaceFromHint, titleRoleFor } from '../common.js';
import { CANVAS, LINES, bottom, frame, lineBox, space } from '../geometry.js';

export default {
  id: 'section',
  kind: 'section',
  version: 1,
  tags: ['divider'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood, content: c } = b;
    const md = space(mood, 'md');
    const lg = space(mood, 'lg');
    const titleRole = titleRoleFor(mood, 'section', 'display');
    const subRole = 'h3';
    const th = lineBox(mood, titleRole, LINES.title);
    const sh = lineBox(mood, subRole, LINES.heading);
    const groupH = Math.min(c.h, th + md + sh);
    const y0 = c.y + (c.h - groupH) / 2;
    b.title(frame(c.x, y0, c.w, th), titleRole, { v: 'bottom' });
    const sub = b.box('subtitle', frame(c.x, y0 + th + md, c.w, sh), {
      role: 'subtitle',
      slot: 'subtitle',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('subtitle', 'text', 'subtitle', { role: subRole });
    b.zone(frame(0, bottom(sub) + lg, CANVAS.w, CANVAS.h - bottom(sub) - lg));
    b.zone(frame(0, 0, CANVAS.w, y0 - lg));
    let surface = surfaceFromHint(mood, 'section');
    if (!surface && !mood.palette?.perKind?.section) surface = { prefer: 'dark' };
    return b.finish({ surface });
  },
};
