/**
 * Title + a row of people (n = min(4, items)). With components.avatar.tokens.size the row is avatar + name + role
 * tall, centred in the body area; without it the row fills the body area. Slot type `people` (layout schema v1.2,
 * P2-spec §7 F5): the engine binds the content's `people` block here.
 */
import { createBuilder, flowBox, flowCells, flowCount, normSummary, standardTitle } from '../common.js';
import { LINES, bodyArea, bottom, frame, lineBox, space } from '../geometry.js';

export default {
  id: 'team',
  kind: 'team',
  version: 1,
  tags: ['people'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('team', normSummary(ctx.summary));
    standardTitle(b, 'team');
    const area = bodyArea(mood);
    const size = mood.components?.avatar?.tokens?.size;
    let f = area;
    if (typeof size === 'number') {
      const cellW = flowCells(area, n, space(mood, 'md'))[0].w;
      const sm = space(mood, 'sm');
      const h = Math.min(
        area.h,
        Math.min(size, cellW) +
          sm +
          lineBox(mood, 'h3', LINES.one) +
          sm +
          lineBox(mood, 'bodySmall', LINES.label),
      );
      f = frame(area.x, area.y + (area.h - h) / 2, area.w, h);
      const lg = space(mood, 'lg');
      b.zone(frame(area.x, area.y, area.w, f.y - lg - area.y));
      b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    }
    flowBox(b, {
      id: 'team',
      f,
      role: 'group',
      slotType: 'people',
      kind: 'team',
      n,
      itemLayout: 'person-avatar-name-role',
    });
    return b.finish();
  },
};
