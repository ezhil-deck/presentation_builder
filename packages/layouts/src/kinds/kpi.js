/**
 * Title + a row of KPIs (n = min(4, items)). The row is one stat line + spacing.sm + two label lines tall
 * (signals: type.roles.stat, the kpi label role), centred vertically in the body area; the bands above / below are
 * decor zones.
 */
import { createBuilder, flowBox, flowCount, normSummary, standardTitle } from '../common.js';
import { LINES, bodyArea, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

export default {
  id: 'kpi',
  kind: 'kpi',
  version: 1,
  tags: ['data', 'numbers'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('kpi', normSummary(ctx.summary));
    standardTitle(b, 'kpi');
    const area = bodyArea(mood);
    const labelRole = pickRole(mood, mood.components?.kpi?.tokens?.labelStyle, 'statLabel');
    const h = Math.min(
      area.h,
      lineBox(mood, 'stat', LINES.one) + space(mood, 'sm') + lineBox(mood, labelRole, LINES.label),
    );
    const y = area.y + (area.h - h) / 2;
    const f = frame(area.x, y, area.w, h);
    flowBox(b, {
      id: 'kpis',
      f,
      role: 'kpis',
      slotType: 'kpis',
      kind: 'kpi',
      n,
      itemLayout: 'kpi-value-label',
    });
    const lg = space(mood, 'lg');
    b.zone(frame(area.x, area.y, area.w, y - lg - area.y));
    b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    return b.finish();
  },
};
