/**
 * @pb/layouts — the layout catalogue: JS modules that take the Mood's geometry (+ a content summary) and return Layout
 * instances (schemas/layout.schema.json), plus the item sub-layouts the engine stamps inside flow boxes.
 */
import { catalogue } from './catalogue.js';

export { catalogue, ALIASES, KINDS, resolveKind } from './catalogue.js';
export { items, itemLayout } from './items.js';
export {
  CANVAS,
  bodyArea,
  columns,
  contentFrame,
  footerBand,
  grid,
  measure,
  safe,
  spans,
  titleBox,
} from './geometry.js';
export { MAX_ITEMS, flowCells, mainAside, v2Blocks } from './common.js';
// the template binding (engine compose/templateBind.js, proposal PR-6) builds its Layout with the kinds' own helpers
export {
  createBuilder,
  estimateLines,
  footerFor,
  labelRole,
  slideKeys,
  surfaceFromHint,
  titleRoleFor,
} from './common.js';
export { LINES, lineBox, pickRole } from './geometry.js';
export { SHAPES, SHAPE_RANGES, processShape, shapeFits } from './shapes.js';
export { iconFile, iconSize } from './icons.js';

/** Every LayoutDef (kept for the engine stub, which imports `layouts`). */
export const layouts = catalogue.list();

/** Build a kind's layout for a Mood: `buildLayout(kind, mood, summary)` (alias-aware). */
export function buildLayout(kind, mood, summary = {}) {
  const [def] = catalogue.forKind(kind);
  if (!def) return null;
  return def.build({ mood, geometry: mood.geometry, summary });
}
