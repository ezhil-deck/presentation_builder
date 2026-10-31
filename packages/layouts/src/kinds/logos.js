/**
 * Title + a logo wall (n = min(8, items) per row). With components.logoWall.tokens.height the row is logo + label
 * tall, centred in the body area; without it the row fills the body area.
 */
import { createBuilder, flowBox, flowCount, normSummary, standardTitle } from '../common.js';
import { LINES, bodyArea, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

export default {
  id: 'logos',
  kind: 'logos',
  version: 1,
  tags: ['logos', 'proof'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('logos', normSummary(ctx.summary));
    standardTitle(b, 'logos');
    const area = bodyArea(mood);
    const t = mood.components?.logoWall?.tokens ?? {};
    let f = area;
    if (typeof t.height === 'number') {
      const labelRole = pickRole(mood, t.labelStyle, 'caption');
      const h = Math.min(area.h, t.height + space(mood, 'sm') + lineBox(mood, labelRole, LINES.one));
      f = frame(area.x, area.y + (area.h - h) / 2, area.w, h);
      const lg = space(mood, 'lg');
      b.zone(frame(area.x, area.y, area.w, f.y - lg - area.y));
      b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    }
    flowBox(b, {
      id: 'logos',
      f,
      role: 'group',
      slotType: 'logos',
      kind: 'logos',
      n,
      itemLayout: 'logo-chip',
    });
    return b.finish();
  },
};
