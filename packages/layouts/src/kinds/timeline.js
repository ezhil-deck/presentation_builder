/**
 * Title + a timeline row (n = min(5, items)). When the Mood gives components.timeline, a divider line runs through the
 * item markers across the row (stroke: border).
 */
import {
  MAX_ITEMS,
  createBuilder,
  flowBox,
  flowCount,
  nodesOf,
  normSummary,
  standardTitle,
  v2Block,
} from '../common.js';
import { anyIcon, iconSize } from '../icons.js';
import { frame } from '../geometry.js';
import { timelineLineY } from '../items.js';
import { lineWeight } from './steps.js';

export default {
  id: 'timeline',
  kind: 'timeline',
  version: 1,
  tags: ['process', 'time'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    // content/2: a roadmap of 6 milestones keeps one row (6 columns); more wrap to two rows of ceil(n / 2)
    const block = v2Block(ctx.summary, 'timeline');
    const nodes = Math.min(nodesOf(block), 10);
    const wide = nodes > MAX_ITEMS.timeline;
    const n = wide
      ? nodes <= 6
        ? nodes
        : Math.ceil(nodes / 2)
      : flowCount('timeline', normSummary(ctx.summary));
    standardTitle(b, 'timeline');
    const area = b.area();
    // content/2: the line runs through the brand icons when the milestones carry icons that resolve
    const room = anyIcon(mood, block?.icons) ? iconSize(mood, 'h3').room : 0;
    if (mood.components?.timeline) {
      const wgt = lineWeight(mood);
      b.box('line', frame(area.x, area.y + timelineLineY(mood, room) - wgt / 2, area.w, wgt), {
        role: 'divider',
        shape: { kind: 'line', stroke: 'border' },
      });
    }
    flowBox(b, {
      id: 'timeline',
      f: area,
      role: 'group',
      slotType: 'timeline',
      kind: 'timeline',
      n,
      itemLayout: 'timeline-when-title-text',
      ...(wide ? { maxItems: nodes } : {}),
    });
    return b.finish();
  },
};
