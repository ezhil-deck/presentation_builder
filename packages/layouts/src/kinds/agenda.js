/** Title + the agenda list (one level, h3 role). Column = the measure of that role; the rest is decor zone. */
import { createBuilder, sideZone, standardTitle } from '../common.js';
import { bodyArea, frame, gutter, measure, pickRole } from '../geometry.js';

export default {
  id: 'agenda',
  kind: 'agenda',
  version: 1,
  tags: ['opening', 'list'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'agenda');
    const area = bodyArea(mood);
    const r = pickRole(mood, 'h3', 'body');
    const f = b.box('list', frame(area.x, area.y, measure(mood, r, area.w), area.h), {
      role: 'list',
      slot: 'list',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('list', 'list', 'list', { role: r, capacity: { minItems: 1, maxLevels: 1 } });
    sideZone(b, f, area, gutter(mood));
    return b.finish();
  },
};
