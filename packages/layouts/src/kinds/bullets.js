/**
 * Title + one list. Capacity from type.bullets (maxPerSlide → maxItems, maxDepth → maxLevels) when the Mood gives
 * them; the list column is the measure of the bullet role, the rest is decor zone. A content/2 points block with
 * brand icons or more than six points is a flow of points in one or two columns (`pointsFlow`).
 */
import { createBuilder, nodesOf, sideZone, standardTitle, v2Block } from '../common.js';
import { LINES, frame, gutter, lineBox, measure, pickRole, space } from '../geometry.js';
import { anyIcon } from '../icons.js';

/** Points per column before a points list splits into two (half the block's 2–12 node range, catalogue §2). */
export const POINTS_PER_COLUMN = 6;

/**
 * A content/2 points block drawn as a flow of points (`point-marker-text`): when a point's icon resolves to the brand
 * set (the icon is the marker) or the list is longer than POINTS_PER_COLUMN (two columns, column-major). Rows are
 * two bullet lines tall plus the list gap, the block top-aligned. Returns true when it placed the flow.
 */
export function pointsFlow(b, area, block, { columns, items } = {}) {
  const { mood } = b;
  const n = nodesOf(block) || Number(items) || 0;
  const icons = anyIcon(mood, block?.icons);
  if (!columns && (!block || (!icons && n <= POINTS_PER_COLUMN))) return false;
  const cols = columns ?? (n > POINTS_PER_COLUMN ? 2 : 1);
  const r = pickRole(mood, 'bullet', 'body');
  const gap = space(mood, 'md');
  const rowsN = Math.max(1, Math.ceil(n / cols));
  const rowH = lineBox(mood, r, LINES.label);
  const h = Math.min(area.h, rowsN * rowH + (rowsN - 1) * gap);
  const g = gutter(mood);
  const w = cols === 2 ? area.w : measure(mood, r, area.w);
  const f = b.box('list', frame(area.x, area.y, w, h), {
    role: 'list',
    slot: 'list',
    flow: { direction: 'column', gap: 'md', columns: cols, itemLayout: 'point-marker-text' },
    ...b.bodyAlign({ v: 'top' }),
  });
  b.slot('list', 'list', 'list', { role: r, capacity: { minItems: 1, maxItems: 12 } });
  if (cols === 1) sideZone(b, f, area, g);
  return true;
}

export default {
  id: 'bullets',
  kind: 'bullets',
  version: 1,
  label: 'Points',
  tags: ['text', 'list'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'bullets');
    const area = b.area();
    if (pointsFlow(b, area, v2Block(ctx.summary, 'points'))) return b.finish();
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

/**
 * Points in two columns (the picker's "two columns" variant; pick() takes it for a points block over
 * POINTS_PER_COLUMN): a flow of points, column-major, each column half the body width.
 */
export const bulletsColumns = {
  id: 'bullets-columns',
  kind: 'bullets',
  version: 1,
  label: 'Points, two columns',
  tags: ['text', 'list', 'columns'],
  match(summary) {
    const block = v2Block(summary, 'points');
    return block && summary.blocks.length === 1 && nodesOf(block) > POINTS_PER_COLUMN ? 15 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'bullets');
    pointsFlow(b, b.area(), v2Block(ctx.summary, 'points'), {
      columns: 2,
      items: ctx.summary?.items,
    });
    return b.finish();
  },
};
