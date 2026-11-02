/**
 * @pb/engine: Markdown -> Content (content/1 and content/2, docs/S2-content-v2.md), text fit from font metrics, chart / table geometry, and composeDeck
 * (Content + Mood + layout catalogue -> Deck). docs/P2-spec.md §1 + §3.
 */
export {
  parseMarkdown,
  parseMarkdownResult,
  inferKind,
  resolvePlaceholder,
  parseFenceYaml,
} from './content/parse.js';
export { parseInline, plainText } from './content/inline.js';
export {
  BLOCKS,
  BLOCK_TYPES,
  SLIDE_FIELDS,
  PROCESS_SHAPES,
  CHART_TYPES,
  CELL_TYPES,
  IMAGE_TREATMENTS,
  FAR_OVER,
  MAX_BLOCKS_PER_SLIDE,
  blockNodes,
  blockWarnings,
  slideWarnings,
} from './content/blocks.js';
export { upgradeContent, upgradeSlide } from './content/upgrade.js';
export { lowerSlide, cellText, NATIVE_CHART_TYPES } from './content/lower.js';
export { fenceBlockV2, FENCE_ALIASES } from './content/fences.js';
export { validateBlockV2, validateSlideV2 } from './content/schema.js';
export { measure, normalizeMetrics, ruleWidth } from './fit/metrics.js';
export { breakLines, layoutText, applyCase } from './fit/lines.js';
export { fitText, fitTextFont } from './fit/text.js';
export { layoutChart, chartLayout, chartElement, niceTicks, formatValue } from './fit/chart.js';
export { layoutTable, tableElement, proportionalWidths } from './fit/table.js';
export { resolve, deckFont, contrastRatio, MIN_LITERAL_CONTRAST } from './compose/resolve.js';
export { surfaceFor, backgroundFor, defaultSurface, createSurfaceState } from './compose/surface.js';
export { pick, normalizeKind, LAYOUT_KINDS, KIND_ALIASES, BLOCK_KIND_ALIASES } from './compose/pick.js';
export { summarize } from './compose/summary.js';
export { placeDecor, createDecorState } from './compose/decor.js';
export { placeLogo, footerElements, logoSize, footerShown } from './compose/logoFooter.js';
export { bindSlots } from './compose/bind.js';
export { composeDeck } from './compose/index.js';
export {
  PROPOSALS,
  PROPOSAL_KEYS,
  normalizeProposals,
  proposalKey,
  clearOfDecor,
  contentFrame,
} from './compose/proposals.js';
export { fitUpLadder, fitUpSteps, FIT_UP_KINDS, FIT_UP_BOX_ROLES, FIT_UP_LADDER } from './compose/fitup.js';
export { initialsOf, avatarSize } from './compose/slots.js';
export { validateContent, validateLayout, validateDeck } from './validate.js';

export const CANVAS = Object.freeze({ width: 1920, height: 1080 });
