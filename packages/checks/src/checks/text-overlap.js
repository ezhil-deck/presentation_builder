/**
 * Check 9 `text-overlap` (P3-spec §A.2): two text elements of one slide whose frames intersect by more than 2 px on
 * both axes → warn (decor, background and group containers are ignored). Geometric: no brand signal.
 */
import {
  flatElements,
  fmt,
  hasText,
  isFrame,
  makeItem,
  overlap,
  r2,
  result,
  skip,
  slidesOf,
} from '../util.js';

export const id = 'text-overlap';
export const title = 'Text boxes do not overlap';
export const signal = null;

/** More than this many px on both axes is an overlap. */
export const OVERLAP_PX = 2;
const IGNORED_ROLES = new Set(['decor', 'background']);

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    const texts = flatElements(slide)
      .filter((el) => el.type === 'text' && !IGNORED_ROLES.has(el.role) && isFrame(el.frame) && hasText(el))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const o = overlap(texts[i].frame, texts[j].frame);
        if (o.w > OVERLAP_PX && o.h > OVERLAP_PX) {
          items.push(
            makeItem(
              'warn',
              `text "${texts[i].id}" and text "${texts[j].id}" overlap by ${fmt(o.w)} × ${fmt(o.h)} px`,
              {
                slide,
                index,
                el: texts[i],
                data: { other: texts[j].id, overlap: { w: r2(o.w), h: r2(o.h) } },
              },
            ),
          );
        }
      }
    }
  }
  return result(items);
}
