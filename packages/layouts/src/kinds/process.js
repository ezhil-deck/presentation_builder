/**
 * Title + a process drawn as one of the 11 non-linear shapes (docs/S2-layouts.md §2): one group box over the body
 * area whose `flow.shape` names the arrangement; the engine stamps the nodes and marks from `processShape` (shapes.js)
 * at compose time. A process whose node count is outside the shape's range is drawn as linear steps (the `steps`
 * flow) - pick() reports it. `linear` itself is the v1 `steps` layout.
 */
import {
  createBuilder,
  flowCount,
  nodesOf,
  normSummary,
  standardTitle,
  v2Block,
  v2Blocks,
} from '../common.js';
import { SHAPES, SHAPE_RANGES, shapeFits } from '../shapes.js';
import { stepsFlow } from './steps.js';

const LABELS = Object.freeze({
  cycle: 'Cycle',
  funnel: 'Funnel',
  pyramid: 'Pyramid',
  stack: 'Stack',
  hub: 'Hub and spokes',
  ladder: 'Ladder',
  quadrant: 'Quadrant',
  venn: 'Venn',
  tree: 'Tree',
  converge: 'Converge',
  diverge: 'Diverge',
});

/** The shape flow box: slot `steps` (type steps), flow {shape, columns: n}; capacity = the shape's node range. */
export function shapeFlow(b, f, shape, n) {
  b.box('steps', f, {
    role: 'group',
    slot: 'steps',
    flow: { direction: 'row', gap: 'md', columns: Math.max(1, n), shape },
  });
  const r = SHAPE_RANGES[shape];
  b.slot('steps', 'steps', 'steps', { capacity: { minItems: r.min, maxItems: r.max } });
}

/**
 * The process main of a layout in `area`: the shape flow when `shape` fits the node count (an unknown count - the
 * Studio's picker preview - takes the shape), else the linear steps flow.
 */
export function processInto(b, area, shape, summary) {
  const block = v2Block(summary, 'process');
  const n = nodesOf(block) || Number(summary?.items) || 0;
  if (shape && shape !== 'linear' && (!block || shapeFits(shape, n))) {
    shapeFlow(b, area, shape, n || SHAPE_RANGES[shape].min);
  } else {
    stepsFlow(b, area, flowCount('steps', { items: n }));
  }
}

function shapeDef(shape) {
  return {
    id: `process-${shape}`,
    kind: 'steps',
    version: 1,
    label: LABELS[shape],
    tags: ['process', 'shape', shape],
    /** A slide whose one block is a process of this shape, with a node count the shape can draw. */
    match(summary) {
      const blocks = v2Blocks(summary);
      if (blocks.length !== 1 || blocks[0].type !== 'process') return 0;
      return blocks[0].shape === shape && shapeFits(shape, nodesOf(blocks[0])) ? 30 : 0;
    },
    build(ctx) {
      const b = createBuilder(this, ctx);
      standardTitle(b, 'steps');
      processInto(b, b.area(), shape, { ...normSummary(ctx.summary), ...ctx.summary });
      return b.finish();
    },
  };
}

export const processDefs = SHAPES.filter((s) => s !== 'linear').map(shapeDef);
