/**
 * Nested market sizes (content/2 `kpis` with `nested: true`, S2.a slice 3; catalogue: tam_sam_som_block): three
 * nested shapes, largest first, the value and heading inside each ring (the engine draws them, compose/nested.js).
 * Circles for a brand whose shape language is not sharp, else rects with the card radius (signal: shape.language).
 * KPIs with a body: the rings in the left 7 of 12 columns, each KPI's heading + body in the right 5.
 */
import { createBuilder, nodesOf, standardTitle, v2Blocks } from '../common.js';
import { gutter, spans } from '../geometry.js';

/** The node count nested KPIs draw (TAM, SAM, SOM). */
export const NESTED_NODES = 3;

const nestedBlock = (summary) => {
  const blocks = v2Blocks(summary);
  return blocks.length === 1 && blocks[0].type === 'kpis' && blocks[0].nested ? blocks[0] : null;
};

export default {
  id: 'kpi-nested',
  kind: 'kpi',
  version: 1,
  label: 'Nested sizes',
  tags: ['data', 'numbers', 'market'],
  /** One kpis block with `nested: true` and three KPIs. */
  match(summary) {
    return nodesOf(nestedBlock(summary)) === NESTED_NODES ? 40 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'kpi');
    const area = b.area();
    const shape = mood.shape?.language === 'sharp' ? 'rect' : 'ellipse';
    const body = (nestedBlock(ctx.summary)?.fields ?? []).includes('body');
    const [rings, list] = body ? spans(area, [7, 5], gutter(mood)) : [area, null];
    b.box('kpis', rings, {
      role: 'kpis',
      slot: 'kpis',
      flow: { direction: 'row', gap: 'md', columns: NESTED_NODES, nested: shape, ...(list ? { list } : {}) },
    });
    b.slot('kpis', 'kpis', 'kpis', { capacity: { minItems: NESTED_NODES, maxItems: NESTED_NODES } });
    // the list column is content: a box (no slot) keeps decor zones off it
    if (list) b.box('kpis-list', list, { role: 'group' });
    return b.finish();
  },
};
