/**
 * Check 10 `logo` (P3-spec §A.2): on each slide whose kind `mood.logo.perKind` gives a size (large / small), a logo
 * element exists (the slide logo, or the footer's logo, which the engine uses in place of a small slide logo); its
 * height is at least the brand's `logo.height[size]` when given (else that item is not checked); no text block (the
 * fitter's laid-out lines, not the empty part of its frame) or image comes inside `mood.logo.clearSpace` around it
 * (an image that contains the logo is its backdrop, not a neighbour). Each finding → warn. The compose-time
 * `logo-clearspace` warnings are represented by this check.
 */
import {
  contains,
  contentBox,
  flatElements,
  fmt,
  inflate,
  isFrame,
  makeItem,
  overlap,
  result,
  skip,
  slideKinds,
  slidesOf,
} from '../util.js';

export const id = 'logo';
export const title = 'Logo present, sized and clear';
export const signal = 'mood.logo.perKind, mood.logo.height, mood.logo.clearSpace';

const SIZES = new Set(['large', 'small', 'none']);
const NOT_CONTENT = new Set(['decor', 'background', 'logo']);

/** The logo elements of a slide: the slide logo (role logo) and the footer's logo image. */
export const isLogo = (el) => el.role === 'logo' || (el.role === 'footer' && el.type === 'image');

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const perKind = mood?.logo?.perKind;
  if (!perKind || !Object.keys(perKind).length) return skip('the Mood gives no logo.perKind');
  const heights = mood.logo.height ?? {};
  const clear = mood.logo.clearSpace;
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    const kinds = slideKinds(slide);
    const k = kinds.find((x) => SIZES.has(perKind[x]));
    const size = k ? perKind[k] : undefined;
    const all = flatElements(slide);
    const logos = all.filter((el) => isLogo(el) && isFrame(el.frame));
    if (size && size !== 'none' && !logos.length) {
      items.push(
        makeItem('warn', `no logo on this ${k} slide (logo.perKind.${k} = ${size})`, {
          slide,
          index,
          data: { kind: k, size },
        }),
      );
    }
    for (const logo of logos) {
      const s = logo.role === 'footer' ? 'small' : size && size !== 'none' ? size : undefined;
      const want = s ? heights[s] : undefined;
      if (typeof want === 'number' && logo.frame.h < want - 0.5) {
        items.push(
          makeItem(
            'warn',
            `logo "${logo.id}" is ${fmt(logo.frame.h)} px tall, below logo.height.${s} ${fmt(want)} px`,
            {
              slide,
              index,
              el: logo,
              data: { height: logo.frame.h, min: want, size: s },
            },
          ),
        );
      }
      if (typeof clear !== 'number') continue;
      const guard = inflate(logo.frame, clear);
      for (const el of all) {
        if (el === logo || NOT_CONTENT.has(el.role) || isLogo(el) || !isFrame(el.frame)) continue;
        if (el.type !== 'text' && el.type !== 'image') continue;
        if (el.type === 'image' && contains(el.frame, logo.frame)) continue; // the logo sits on this image
        const o = overlap(guard, contentBox(el));
        if (o.w > 0.01 && o.h > 0.01) {
          items.push(
            makeItem(
              'warn',
              `${el.type} "${el.id}" is inside the clear space (${fmt(clear)} px) of logo "${logo.id}"`,
              {
                slide,
                index,
                el,
                data: { logo: logo.id, clearSpace: clear },
              },
            ),
          );
        }
      }
    }
  }
  return result(items);
}
