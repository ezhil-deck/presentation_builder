/**
 * Title + one list. Capacity from type.bullets (maxPerSlide → maxItems, maxDepth → maxLevels) when the Mood gives
 * them; the list column is the measure of the bullet role, the rest is decor zone.
 */
import { createBuilder, sideZone, standardTitle } from '../common.js';
import { bodyArea, frame, gutter, measure, pickRole } from '../geometry.js';

export default {
  id: 'bullets',
  kind: 'bullets',
  version: 1,
  tags: ['text', 'list'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'bullets');
    const area = bodyArea(mood);
    const r = pickRole(mood, 'bullet', 'body');
    const f = b.box('list', frame(area.x, area.y, measure(mood, r, area.w), area.h), {
      role: 'list',
      slot: 'list',
      ...b.bodyAlign({ v: 'top' }),
    });
    const bl = mood.type?.bullets ?? {};
    const capacity = { minItems: 1 };
    if (Number.isInteger(bl.maxPerSlide)) capacity.maxItems = bl.maxPerSlide;
    if (Number.isInteger(bl.maxDepth)) capacity.maxLevels = bl.maxDepth;
    b.slot('list', 'list', 'list', { role: r, capacity });
    sideZone(b, f, area, gutter(mood));
    return b.finish();
  },
};
