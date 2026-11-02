/**
 * Single-KPI hero (docs/S2-layouts.md §3; catalogue: 66 presets with one KPI): the one value in the larger of the
 * brand's display / stat roles, its heading and body beside it (item layout `kpi-hero`), the group centred vertically
 * in the body area; the bands above and below are decor zones.
 */
import { createBuilder, flowBox, standardTitle, v2Blocks } from '../common.js';
import { LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';
import { heroValueRole } from '../items.js';

export default {
  id: 'kpi-hero',
  kind: 'kpi',
  version: 1,
  label: 'One number',
  tags: ['data', 'numbers', 'hero'],
  /** A slide whose one block is a single KPI. */
  match(summary) {
    const blocks = v2Blocks(summary);
    return blocks.length === 1 && blocks[0].type === 'kpis' && Number(blocks[0].nodes) === 1 ? 30 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'kpi');
    const area = b.area();
    const text =
      lineBox(mood, pickRole(mood, 'h2', 'h3'), LINES.heading) +
      space(mood, 'sm') +
      lineBox(mood, pickRole(mood, 'body'), 4);
    const h = Math.min(area.h, Math.max(lineBox(mood, heroValueRole(mood), LINES.one), text));
    const y = area.y + (area.h - h) / 2;
    const f = frame(area.x, y, area.w, h);
    flowBox(b, { id: 'kpis', f, role: 'kpis', slotType: 'kpis', kind: 'kpi', n: 1, itemLayout: 'kpi-hero' });
    const lg = space(mood, 'lg');
    b.zone(frame(area.x, area.y, area.w, y - lg - area.y));
    b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    return b.finish();
  },
};
