/**
 * Title + a row of KPIs (n = min(4, items)). The row is one stat line + spacing.sm + two label lines tall
 * (signals: type.roles.stat, the kpi label role), centred vertically in the body area; the bands above / below are
 * decor zones. A content/2 KPI block whose KPIs carry a body takes `kpi-value-label-body` and three body lines more.
 */
import { createBuilder, flowBox, flowCount, normSummary, standardTitle, v2Block } from '../common.js';
import { LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';
import { kpiItemLayout } from './aside.js';

export default {
  id: 'kpi',
  kind: 'kpi',
  version: 1,
  label: 'Numbers',
  tags: ['data', 'numbers'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('kpi', normSummary(ctx.summary));
    standardTitle(b, 'kpi');
    const area = b.area();
    const labelRole = pickRole(mood, mood.components?.kpi?.tokens?.labelStyle, 'statLabel');
    const block = v2Block(ctx.summary, 'kpis');
    const itemLayout = kpiItemLayout(block);
    const body =
      itemLayout === 'kpi-value-label-body'
        ? space(mood, 'sm') + lineBox(mood, pickRole(mood, 'bodySmall', 'body'), 3)
        : 0;
    const h = Math.min(
      area.h,
      lineBox(mood, 'stat', LINES.one) + space(mood, 'sm') + lineBox(mood, labelRole, LINES.label) + body,
    );
    // KPIs with images fill the body area (the image is the card background or a thumbnail above the value)
    const tall = (block?.fields ?? []).includes('image');
    const y = tall ? area.y : area.y + (area.h - h) / 2;
    const f = frame(area.x, y, area.w, tall ? area.h : h);
    flowBox(b, {
      id: 'kpis',
      f,
      role: 'kpis',
      slotType: 'kpis',
      kind: 'kpi',
      n,
      itemLayout,
    });
    const lg = space(mood, 'lg');
    b.zone(frame(area.x, area.y, area.w, y - lg - area.y));
    b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    return b.finish();
  },
};
