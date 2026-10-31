/**
 * Check 4 `fonts` (P3-spec §A.2): every font family the deck uses (text, table and chart fonts) is in `deck.fonts` with
 * at least one file (else fail); a weight an element uses that no file of its family declares → warn ("measured with
 * the <w> face", the face CSS font matching picks). The compose-time `font-metrics` warnings are folded in here.
 */
import { flatElements, makeItem, result, skip, slideIndex, slidesOf, warningItem } from '../util.js';

export const id = 'fonts';
export const title = 'Every font used has files for its weights';
export const signal = 'deck.fonts';

/** A file's declared weight: "400" | 400 | "100 900" → [min, max]; null when the file declares none. */
export function weightRange(w) {
  if (typeof w === 'number' && Number.isFinite(w)) return [w, w];
  if (typeof w !== 'string') return null;
  const nums = w
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length === 1) return [nums[0], nums[0]];
  if (nums.length === 2) return [Math.min(...nums), Math.max(...nums)];
  return null;
}

/**
 * The weight CSS font matching (CSS Fonts 4 §5.2) picks for `want` among the declared ranges, as the nearest weight of
 * the chosen face: 400–500 → up to 500 first, then down, then up; < 400 → down first; > 500 → up first.
 */
export function matchWeight(want, ranges) {
  if (ranges.some(([a, b]) => want >= a && want <= b)) return want;
  const points = ranges.flatMap(([a, b]) => [a, b]);
  const up = (lo, hi) =>
    points
      .filter((p) => p > lo && p <= hi)
      .sort((x, y) => x - y)
      .shift();
  const down = () =>
    points
      .filter((p) => p < want)
      .sort((x, y) => y - x)
      .shift();
  if (want >= 400 && want <= 500) return up(want, 500) ?? down() ?? up(500, Infinity);
  if (want < 400) return down() ?? up(want, Infinity);
  return up(want, Infinity) ?? down();
}

/** Every font literal an element carries: text font, table header / cell fonts, chart font. */
function fontsOf(el) {
  const out = [];
  if (el.text?.font?.family) out.push({ family: el.text.font.family, weight: el.text.font.weight });
  for (const f of [el.table?.style?.font, el.table?.style?.header?.font, el.chart?.style?.font]) {
    if (f?.family) out.push({ family: f.family, weight: f.weight });
  }
  return out;
}

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const declared = new Map((deck.fonts ?? []).map((f) => [f.family, f]));
  const items = [];
  const missing = new Map(); // family -> first use
  const weights = new Map(); // family -> weight -> { slides: Set, count }
  for (const { slide, index } of slidesOf(deck)) {
    for (const el of flatElements(slide)) {
      for (const f of fontsOf(el)) {
        if (!declared.has(f.family)) {
          if (!missing.has(f.family)) missing.set(f.family, { slide, index, el });
          continue;
        }
        if (!Number.isFinite(f.weight)) continue;
        const byW = weights.get(f.family) ?? new Map();
        const entry = byW.get(f.weight) ?? { slides: new Set(), count: 0 };
        entry.slides.add(index);
        entry.count += 1;
        byW.set(f.weight, entry);
        weights.set(f.family, byW);
      }
    }
  }
  for (const [family, where] of [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    items.push(
      makeItem('fail', `font family "${family}" is used but not listed in deck.fonts`, {
        ...where,
        data: { family },
      }),
    );
  }
  for (const f of [...declared.values()].sort((a, b) => a.family.localeCompare(b.family))) {
    const files = Array.isArray(f.files) ? f.files : [];
    if (!files.length) {
      items.push(
        makeItem(
          'fail',
          `font family "${f.family}" has no font files${f.fallback ? ` (rendered with ${f.fallback})` : ''}`,
          { data: { family: f.family } },
        ),
      );
      continue;
    }
    const byW = weights.get(f.family);
    if (!byW) continue;
    const ranges = files.map((x) => weightRange(x.weight));
    if (ranges.some((r) => r === null)) {
      items.push(
        makeItem(
          'info',
          `font family "${f.family}": a file declares no weight, so its weights were not checked`,
          {
            data: { family: f.family },
          },
        ),
      );
      continue;
    }
    for (const [w, entry] of [...byW.entries()].sort((a, b) => a[0] - b[0])) {
      const got = matchWeight(w, ranges);
      if (got === w) continue;
      const slides = [...entry.slides].sort((a, b) => a - b);
      items.push(
        makeItem(
          'warn',
          `font family "${f.family}" has no ${w} face: ${entry.count} element(s) are measured with the ${got} face`,
          { data: { family: f.family, weight: w, measuredWith: got, elements: entry.count, slides } },
        ),
      );
    }
  }
  // compose-time font-metrics warnings (a face without metrics) belong to this check
  const idx = slideIndex(deck);
  for (const w of deck.warnings ?? []) {
    if (w.check !== 'font-metrics') continue;
    items.push(warningItem(w, idx));
  }
  return result(items);
}
