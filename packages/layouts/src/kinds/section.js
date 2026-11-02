/**
 * Section divider. Title (hint titleRole, else display) + subtitle, the group centred vertically in the content frame
 * (P2-spec §2); the bands above and below the group are decor zones. surface: the hint's surface, else
 * `prefer: 'dark'` only when palette.perKind.section is absent (P2-spec §2).
 */
import { createBuilder, labelBox, labelRole, slideKeys, surfaceFromHint, titleRoleFor } from '../common.js';
import { CANVAS, LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

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
    // content/2: the section number ("01", stat role, else display) and the label (eyebrow) above the title
    const keys = slideKeys(ctx.summary);
    const numRole = pickRole(mood, 'stat', 'display');
    const nh = keys.number ? lineBox(mood, numRole, LINES.one) : 0;
    const lh = keys.label && labelRole(mood) ? lineBox(mood, labelRole(mood), LINES.one) : 0;
    const sm = space(mood, 'sm');
    const head = (nh ? nh + md : 0) + (lh ? lh + sm : 0);
    const groupH = Math.min(c.h, head + th + md + sh);
    const top = c.y + (c.h - groupH) / 2;
    if (nh) {
      b.box('number', frame(c.x, top, c.w, nh), {
        role: 'number',
        slot: 'number',
        ...b.bodyAlign({ v: 'bottom' }),
      });
      b.slot('number', 'number', 'number', { role: numRole });
    }
    if (lh) labelBox(b, c.x, top + (nh ? nh + md : 0), c.w);
    const y0 = top + head;
    b.title(frame(c.x, y0, c.w, th), titleRole, { v: 'bottom' });
    const sub = b.box('subtitle', frame(c.x, y0 + th + md, c.w, sh), {
      role: 'subtitle',
      slot: 'subtitle',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('subtitle', 'text', 'subtitle', { role: subRole });
    b.zone(frame(0, bottom(sub) + lg, CANVAS.w, CANVAS.h - bottom(sub) - lg));
    b.zone(frame(0, 0, CANVAS.w, top - lg));
    let surface = surfaceFromHint(mood, 'section');
    if (!surface && !mood.palette?.perKind?.section) surface = { prefer: 'dark' };
    return b.finish({ surface });
  },
};
