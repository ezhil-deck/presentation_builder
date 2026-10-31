/**
 * Check 7 `margins` (P3-spec §A.2): every element frame lies inside the content frame (the canvas inset by
 * `mood.geometry.margins`). Allowed outside: decor, background and band roles; logo / footer when `mood.logo.position`
 * / `mood.footer.position` places them (in the margin); every element of a full-bleed image slide (`kind === 'image'`).
 * An element partly outside → warn with the overshoot per side and the fix `move-inside`.
 */
import {
  canvasOf,
  contentFrame,
  flatElements,
  fmt,
  isFrame,
  makeItem,
  r2,
  result,
  skip,
  slidesOf,
} from '../util.js';

export const id = 'margins';
export const title = 'Elements stay inside the margins';
export const signal = 'mood.geometry.margins';

const ALWAYS_OUTSIDE = new Set(['decor', 'background', 'band']);
const EPS = 0.5;

/** Overshoot per side ({left, right, top, bottom}, only sides > EPS px) of frame `f` outside content frame `c`. */
export function overshoot(f, c) {
  const out = {};
  const sides = {
    left: c.x - f.x,
    right: f.x + f.w - (c.x + c.w),
    top: c.y - f.y,
    bottom: f.y + f.h - (c.y + c.h),
  };
  for (const [side, v] of Object.entries(sides)) if (v > EPS) out[side] = r2(v);
  return out;
}

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const m = mood?.geometry?.margins;
  if (!m || !['top', 'right', 'bottom', 'left'].every((k) => typeof m[k] === 'number')) {
    return skip('the Mood gives no geometry.margins');
  }
  const c = contentFrame(mood, canvasOf(deck));
  const allowed = new Set(ALWAYS_OUTSIDE);
  if (typeof mood.logo?.position === 'string') allowed.add('logo');
  if (typeof mood.footer?.position === 'string') allowed.add('footer');
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    if (slide.kind === 'image') continue;
    for (const el of flatElements(slide)) {
      if (allowed.has(el.role) || !isFrame(el.frame)) continue;
      const over = overshoot(el.frame, c);
      const sides = Object.keys(over);
      if (!sides.length) continue;
      items.push(
        makeItem(
          'warn',
          `${el.type} "${el.id}"${el.role ? ` (role ${el.role})` : ''} is outside the margins by ${sides.map((s) => `${fmt(over[s])} px ${s}`).join(', ')}`,
          { slide, index, el, data: { overshoot: over, contentFrame: c }, fix: { command: 'move-inside' } },
        ),
      );
    }
  }
  return result(items);
}
