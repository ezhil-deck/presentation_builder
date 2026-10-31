/**
 * Title + steps (n = min(5, items)). Direction from components.steps.tokens.orientation ('vertical' → a column flow,
 * else a row). When components.steps.tokens.line is true a divider line joins the step markers (stroke: border).
 * Also used for the `diagram` alias.
 */
import { createBuilder, flowBox, flowCells, flowCount, normSummary, standardTitle } from '../common.js';
import { bodyArea, frame, space } from '../geometry.js';
import { markerSize } from '../items.js';

/** Line weight (signal: shape.divider.weight, else shape.borderWidth); none given → 0 (renderer's hairline). */
export function lineWeight(mood) {
  return mood.shape?.divider?.weight ?? mood.shape?.borderWidth ?? 0;
}

export default {
  id: 'steps',
  kind: 'steps',
  version: 1,
  tags: ['process', 'sequence'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('steps', normSummary(ctx.summary));
    standardTitle(b, 'steps');
    const area = bodyArea(mood);
    const t = mood.components?.steps?.tokens ?? {};
    const direction = t.orientation === 'vertical' ? 'column' : 'row';
    if (t.line === true && n > 1) {
      const cells = flowCells(area, n, space(mood, 'md'), direction);
      const m = Math.min(markerSize(mood), cells[0].w, cells[0].h);
      const a = cells[0];
      const z = cells[n - 1];
      const wgt = lineWeight(mood);
      const line =
        direction === 'row'
          ? frame(a.x + m / 2, a.y + m / 2 - wgt / 2, z.x - a.x, wgt)
          : frame(a.x + m / 2 - wgt / 2, a.y + m / 2, wgt, z.y - a.y);
      b.box('connector', line, { role: 'divider', shape: { kind: 'line', stroke: 'border' } });
    }
    flowBox(b, {
      id: 'steps',
      f: area,
      role: 'group',
      slotType: 'steps',
      kind: 'steps',
      n,
      itemLayout: 'step-number-title-text',
      direction,
    });
    return b.finish();
  },
};
