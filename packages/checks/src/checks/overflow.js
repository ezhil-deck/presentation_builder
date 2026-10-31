/**
 * Check 5 `overflow` (P3-spec §A.2): no text whose fitter output says `fit.overflow`, no element (table cells) carrying
 * an `overflow` warning. Each → warn with the one-click fix `refit`.
 */
import { flatElements, fmt, makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'overflow';
export const title = 'No text overflows its box';
export const signal = 'text.fit, element warnings (fitter output)';

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    for (const el of flatElements(slide)) {
      const fit = el.text?.fit;
      if (fit?.overflow) {
        const role = el.text.font?.role;
        items.push(
          makeItem(
            'warn',
            `text "${el.id}"${role ? ` (role ${role})` : ''} overflows its ${fmt(el.frame.w)} × ${fmt(el.frame.h)} px box at ${fmt(fit.appliedSize ?? el.text.font?.size)} px`,
            {
              slide,
              index,
              el,
              data: { appliedSize: fit.appliedSize, height: fit.height, boxHeight: el.frame.h },
              fix: { command: 'refit' },
            },
          ),
        );
        continue;
      }
      const w = (el.warnings ?? []).find((x) => x.check === 'overflow');
      if (w) {
        items.push(makeItem('warn', w.message, { slide, index, el, fix: { command: 'refit' } }));
      }
    }
  }
  return result(items);
}
