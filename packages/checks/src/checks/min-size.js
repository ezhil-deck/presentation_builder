/**
 * Check 6 `min-size` (P3-spec §A.2): every text's applied size is at least its role's `fit.min`; when the brand gives
 * an absolute floor (`accessibility.minFontSize`, the brand-spec schema's field) also at least that. Below → warn.
 */
import { flatElements, fmt, makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'min-size';
export const title = 'Text is not smaller than its role minimum';
export const signal = 'mood.type.roles[].fit.min, brandSpec.accessibility.minFontSize';

/** The brand's absolute text-size floor and the field it came from, or null. */
export function brandFloor(brandSpec) {
  const v = brandSpec?.accessibility?.minFontSize;
  return typeof v === 'number' && v > 0 ? { field: 'accessibility.minFontSize', size: v } : null;
}

export function run({ deck, mood, brandSpec }) {
  if (!deck) return skip('no deck');
  const roles = mood?.type?.roles ?? {};
  const floor = brandFloor(brandSpec);
  const anyMin = Object.values(roles).some((r) => typeof r?.fit?.min === 'number');
  if (!anyMin && !floor) return skip('no role gives fit.min and the brand gives no minimum text size');
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    for (const el of flatElements(slide)) {
      if (el.type !== 'text' || !el.text) continue;
      const size = el.text.fit?.appliedSize ?? el.text.font?.size;
      if (typeof size !== 'number') continue;
      const role = el.text.font?.role;
      const min = role ? roles[role]?.fit?.min : undefined;
      if (typeof min === 'number' && size < min - 1e-9) {
        items.push(
          makeItem(
            'warn',
            `text "${el.id}" is ${fmt(size)} px, below its role ${role}'s minimum ${fmt(min)} px`,
            {
              slide,
              index,
              el,
              data: { size, role, min },
            },
          ),
        );
        continue;
      }
      if (floor && size < floor.size - 1e-9) {
        items.push(
          makeItem(
            'warn',
            `text "${el.id}" is ${fmt(size)} px, below the brand's minimum text size ${fmt(floor.size)} px (${floor.field})`,
            { slide, index, el, data: { size, role, floor: floor.size, field: floor.field } },
          ),
        );
      }
    }
  }
  return result(items);
}
