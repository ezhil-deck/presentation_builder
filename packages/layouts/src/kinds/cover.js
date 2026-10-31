/**
 * Cover. Title in the lower half of the content frame when composition.layoutHints.cover.titleRole is 'display', else
 * at the top (P2-spec §2); text column = the left two thirds, the right third (to the canvas edge) is a decor zone.
 * Logo / footer / surface from the cover hint; logo at mood.logo.position inside the safe area.
 */
import { createBuilder, surfaceFromHint, titleRoleFor } from '../common.js';
import { CANVAS, LINES, bottom, frame, gutter, lineBox, space } from '../geometry.js';

export default {
  id: 'cover',
  kind: 'cover',
  version: 1,
  tags: ['opening', 'hero'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood, content: c } = b;
    const g = gutter(mood);
    const md = space(mood, 'md');
    const titleRole = titleRoleFor(mood, 'cover', 'display');
    const subRole = 'h3';
    const subH = lineBox(mood, subRole, LINES.heading);
    // Right third is the decor zone (P2-spec §2 example); the text column ends one gutter before it.
    const textW = (2 / 3) * (c.w + g) - g;
    const zoneX = c.x + textW + g;
    let top;
    if (titleRole === 'display') {
      top = c.y + c.h / 2; // lower half
      b.title(frame(c.x, top, textW, bottom(c) - subH - md - top), titleRole, { v: 'bottom' });
      b.box('subtitle', frame(c.x, bottom(c) - subH, textW, subH), {
        role: 'subtitle',
        slot: 'subtitle',
        ...b.bodyAlign({ v: 'top' }),
      });
    } else {
      top = c.y;
      const th = lineBox(mood, titleRole, LINES.title);
      b.title(frame(c.x, c.y, textW, th), titleRole, { v: 'top' });
      b.box('subtitle', frame(c.x, c.y + th + md, textW, subH), {
        role: 'subtitle',
        slot: 'subtitle',
        ...b.bodyAlign({ v: 'top' }),
      });
    }
    b.slot('subtitle', 'text', 'subtitle', { role: subRole });
    b.zone(frame(zoneX, 0, CANVAS.w - zoneX, CANVAS.h));
    if (titleRole === 'display') b.zone(frame(0, 0, zoneX, top - md));
    else {
      const yz = c.y + lineBox(mood, titleRole, LINES.title) + md + subH + md;
      b.zone(frame(0, yz, zoneX, CANVAS.h - yz));
    }
    return b.finish({ surface: surfaceFromHint(mood, 'cover') });
  },
};
