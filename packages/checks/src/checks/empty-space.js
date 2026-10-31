/**
 * Check 13 `empty-space` (P3-spec §A.2): on text / bullets / two-column / image-text / quote slides, the union of the
 * text, image, chart and table boxes covers less than 35 % of the content frame → info (a report line for the owner;
 * no fix). A text box counts as its laid-out block (frame width × the fitter's `fit.height`, placed by valign), so an
 * empty part of a tall text frame is empty space; logo, footer, decor and background are not content.
 */
import {
  canvasOf,
  contentBox,
  contentFrame,
  flatElements,
  isFrame,
  makeItem,
  overlap,
  r2,
  result,
  skip,
  slidesOf,
  unionArea,
} from '../util.js';

export const id = 'empty-space';
export const title = 'Content fills the content frame';
export const signal = 'mood.geometry.margins, slide layout';

export const KINDS = new Set(['text', 'bullets', 'two-column', 'image-text', 'quote']);
/** Below this share of the content frame covered → info. */
export const MIN_COVERAGE = 0.35;
const CONTENT_TYPES = new Set(['text', 'image', 'chart', 'table']);
const NOT_CONTENT = new Set(['logo', 'footer', 'decor', 'background']);

/** Clip a frame to another (null when they do not meet). */
function clip(f, c) {
  const o = overlap(f, c);
  if (!(o.w > 0 && o.h > 0)) return null;
  return { x: Math.max(f.x, c.x), y: Math.max(f.y, c.y), w: o.w, h: o.h };
}

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const m = mood?.geometry?.margins;
  if (!m || !['top', 'right', 'bottom', 'left'].every((k) => typeof m[k] === 'number')) {
    return skip('the Mood gives no geometry.margins');
  }
  const c = contentFrame(mood, canvasOf(deck));
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    if (!KINDS.has(slide.kind)) continue;
    const boxes = flatElements(slide)
      .filter((el) => CONTENT_TYPES.has(el.type) && !NOT_CONTENT.has(el.role) && isFrame(el.frame))
      .map((el) => clip(contentBox(el), c))
      .filter(Boolean);
    const coverage = unionArea(boxes) / (c.w * c.h);
    if (coverage < MIN_COVERAGE) {
      const pct = Math.round(coverage * 1000) / 10;
      items.push(
        makeItem(
          'info',
          `content covers ${pct} % of the content frame on this ${slide.kind} slide (below 35 %)`,
          {
            slide,
            index,
            data: { coverage: r2(coverage), min: MIN_COVERAGE },
          },
        ),
      );
    }
  }
  return result(items);
}
