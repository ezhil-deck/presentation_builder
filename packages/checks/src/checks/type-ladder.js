/**
 * Check `type-ladder` (info report, every deck; 2026-11-03, docs/research/fill-diagnosis-2026-11-03.md): how many text
 * sizes the slides use and the brand's type ratios - reported, never a target and never a pick. Info items only:
 * - the deck's display : body and title : body ratios from the Mood's roles (`display`, `h1`, `body` of
 *   mood.type.roles); a role the Mood does not define is named instead of a ratio;
 * - a slide whose text elements use more than five distinct sizes (the fitted size, `text.fit.appliedSize`) outside
 *   the furniture: the slide title, the footer and eyebrows (element role title / footer / eyebrow, or font role
 *   eyebrow). Tables and charts are not counted.
 */
import { flatElements, fmt, makeItem, r2, result, skip, slidesOf } from '../util.js';

export const id = 'type-ladder';
export const title = 'Text sizes per slide and the type ratios (info)';
export const signal = 'mood.type.roles (display, h1, body) + text.fit.appliedSize';

/** More than this many distinct text sizes per slide outside the furniture is reported. */
export const MAX_SIZES = 5;
const FURNITURE = new Set(['title', 'footer', 'eyebrow']);

/** The furniture text elements are not counted: slide title, footer, eyebrows. */
export const isFurniture = (el) => FURNITURE.has(el.role) || el.text?.font?.role === 'eyebrow';

/** The ratios read (display : body, title : body), from the Mood's role sizes. */
export const RATIOS = Object.freeze([
  { name: 'display : body', role: 'display' },
  { name: 'title : body', role: 'h1' },
]);

/** One info item per ratio: `<name> is <r> : 1 (<role> <px> / body <px>)`, or the role the Mood lacks. */
export function ratioItems(mood) {
  if (!mood) return [];
  const size = (r) => mood.type?.roles?.[r]?.size;
  const body = size('body');
  return RATIOS.map(({ name, role }) => {
    const top = size(role);
    if (typeof body !== 'number' || !(body > 0))
      return makeItem('info', `${name}: not read (the Mood has no body role)`, { data: { ratio: name } });
    if (typeof top !== 'number')
      return makeItem('info', `${name}: not read (the Mood has no ${role} role)`, { data: { ratio: name } });
    const value = r2(top / body);
    return makeItem('info', `${name} is ${fmt(value)} : 1 (${role} ${fmt(top)} / body ${fmt(body)} px)`, {
      data: { ratio: name, role, value, sizes: { [role]: top, body } },
    });
  });
}

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const items = ratioItems(mood);
  for (const { slide, index } of slidesOf(deck)) {
    const sizes = new Set();
    for (const el of flatElements(slide)) {
      if (el.type !== 'text' || isFurniture(el)) continue;
      const s = el.text?.fit?.appliedSize ?? el.text?.font?.size;
      if (typeof s === 'number') sizes.add(r2(s));
    }
    if (sizes.size > MAX_SIZES) {
      const list = [...sizes].sort((a, b) => b - a);
      items.push(
        makeItem(
          'info',
          `${list.length} text sizes outside the title / footer / eyebrow (more than ${MAX_SIZES}): ${list.map(fmt).join(', ')} px`,
          { slide, index, data: { sizes: list } },
        ),
      );
    }
  }
  return result(items);
}
