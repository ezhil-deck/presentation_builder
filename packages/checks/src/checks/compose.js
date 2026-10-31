/**
 * Check 14 `compose` (P3-spec §A.2): every `deck.warnings[]` entry that no check above represents, as items with the
 * warning's severity (error → fail) and its check id in `data.check`. Represented elsewhere: overflow (overflow),
 * contrast (contrast: the compose-time guard notes are not repeated), decor-overlap (decor), logo-clearspace (logo),
 * font-metrics (fonts).
 */
import { result, skip, slideIndex, warningItem } from '../util.js';

export const id = 'compose';
export const title = 'Compose warnings';
export const signal = 'deck.warnings';

/** compose warning check id → the check of this report that represents it. */
export const REPRESENTED = Object.freeze({
  overflow: 'overflow',
  contrast: 'contrast',
  'decor-overlap': 'decor',
  'logo-clearspace': 'logo',
  'font-metrics': 'fonts',
});

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const idx = slideIndex(deck);
  const items = (deck.warnings ?? [])
    .filter((w) => !Object.hasOwn(REPRESENTED, w.check))
    .map((w) => warningItem(w, idx))
    .sort((a, b) => String(a.data.check).localeCompare(String(b.data.check)));
  return result(items);
}
