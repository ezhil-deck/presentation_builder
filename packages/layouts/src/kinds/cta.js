/**
 * Closing call to action. Title (hint titleRole when the Mood defines it, else display), subtitle, a body line and an
 * action, stacked and centred vertically in the left two thirds; the right third is a decor zone (as on the cover).
 */
import { createBuilder, labelBox, labelRole, slideKeys, surfaceFromHint, titleRoleFor } from '../common.js';
import { CANVAS, LINES, frame, gutter, lineBox, pickRole, space } from '../geometry.js';

export default {
  id: 'cta',
  kind: 'cta',
  version: 1,
  tags: ['closing'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood, content: c } = b;
    const g = gutter(mood);
    const md = space(mood, 'md');
    const lg = space(mood, 'lg');
    const titleRole = titleRoleFor(mood, 'cta', 'display');
    const subRole = 'h3';
    const bodyRole = pickRole(mood, 'body');
    const actionRole = pickRole(mood, 'button', 'body');
    const bt = mood.components?.button?.tokens ?? {};
    const pad = typeof bt['padding.0'] === 'number' ? bt['padding.0'] : 0; // signal: components.button.tokens.padding.0
    const th = lineBox(mood, titleRole, LINES.title);
    const sh = lineBox(mood, subRole, LINES.heading);
    const bh = lineBox(mood, bodyRole, LINES.label);
    const ah = lineBox(mood, actionRole, LINES.one) + 2 * pad;
    // content/2: a label (eyebrow) above the title
    const lh =
      slideKeys(ctx.summary).label && labelRole(mood) ? lineBox(mood, labelRole(mood), LINES.one) : 0;
    const sm = space(mood, 'sm');
    const total = (lh ? lh + sm : 0) + th + md + sh + lg + bh + lg + ah;
    const textW = (2 / 3) * (c.w + g) - g;
    let y = c.y + Math.max(0, (c.h - total) / 2);
    if (lh) {
      labelBox(b, c.x, y, textW);
      y += lh + sm;
    }
    b.title(frame(c.x, y, textW, th), titleRole, { v: 'bottom' });
    y += th + md;
    b.box('subtitle', frame(c.x, y, textW, sh), {
      role: 'subtitle',
      slot: 'subtitle',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('subtitle', 'text', 'subtitle', { role: subRole });
    y += sh + lg;
    b.box('body', frame(c.x, y, textW, bh), { role: 'body', slot: 'body', ...b.bodyAlign({ v: 'top' }) });
    b.slot('body', 'richtext', 'body', { role: bodyRole });
    y += bh + lg;
    b.box('action', frame(c.x, y, textW, ah), {
      role: 'body',
      slot: 'action',
      ...b.bodyAlign({ v: 'middle' }),
    });
    b.slot('action', 'text', 'action', { role: actionRole });
    const zoneX = c.x + textW + g;
    b.zone(frame(zoneX, 0, CANVAS.w - zoneX, CANVAS.h));
    return b.finish({ surface: surfaceFromHint(mood, 'cta') });
  },
};
