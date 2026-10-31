/**
 * Title + a timeline row (n = min(5, items)). When the Mood gives components.timeline, a divider line runs through the
 * item markers across the row (stroke: border).
 */
import { createBuilder, flowBox, flowCount, normSummary, standardTitle } from '../common.js';
import { bodyArea, frame } from '../geometry.js';
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
    const n = flowCount('timeline', normSummary(ctx.summary));
    standardTitle(b, 'timeline');
    const area = bodyArea(mood);
    if (mood.components?.timeline) {
      const wgt = lineWeight(mood);
      b.box('line', frame(area.x, area.y + timelineLineY(mood) - wgt / 2, area.w, wgt), {
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
    });
    return b.finish();
  },
};
