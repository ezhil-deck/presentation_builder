/**
 * Check 3 `assets` (P3-spec §A.2): every `image.asset` / `image.animated` / `background.asset` id exists in
 * `deck.assets`; with `files`, every referenced asset file and every logo variant file (`mood.logo.variants`) exists in
 * the brand folder. Missing → fail. Without `files` the file part is not checked (an info item says so).
 */
import { flatElements, makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'assets';
export const title = 'Every referenced asset and logo file exists';
export const signal = 'deck.assets, mood.logo.variants';

export function run({ deck, mood, files }) {
  if (!deck) return skip('no deck');
  const assets = deck.assets ?? {};
  const items = [];
  const used = new Map(); // asset id -> first {slide, index, el}
  const ref = (assetId, where, label) => {
    if (typeof assetId !== 'string') return;
    if (!Object.hasOwn(assets, assetId)) {
      items.push(
        makeItem('fail', `${label} references asset "${assetId}", which deck.assets does not list`, {
          ...where,
          data: { asset: assetId },
        }),
      );
      return;
    }
    if (!used.has(assetId)) used.set(assetId, where);
  };
  for (const { slide, index } of slidesOf(deck)) {
    if (slide.background?.type === 'image' || slide.background?.asset) {
      ref(slide.background.asset, { slide, index }, 'the slide background');
    }
    for (const el of flatElements(slide)) {
      if (!el.image) continue;
      ref(el.image.asset, { slide, index, el }, `image "${el.id}"`);
      if (el.image.animated !== undefined)
        ref(el.image.animated, { slide, index, el }, `image "${el.id}" (animated)`);
    }
  }
  if (!files) {
    items.push(makeItem('info', 'Asset and logo files were not checked: no brand folder was given'));
    return result(items);
  }
  for (const [assetId, where] of [...used.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const file = assets[assetId]?.file;
    if (typeof file !== 'string' || !files.exists(file)) {
      items.push(
        makeItem(
          'fail',
          `asset file ${file ?? '(none)'} (asset "${assetId}") is missing from the brand folder`,
          {
            slide: where.slide,
            index: where.index,
            el: where.el,
            data: { asset: assetId, file: file ?? null },
          },
        ),
      );
    }
  }
  for (const [variant, v] of Object.entries(mood?.logo?.variants ?? {}).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (typeof v?.file !== 'string' || !files.exists(v.file)) {
      items.push(
        makeItem(
          'fail',
          `logo variant "${variant}" file ${v?.file ?? '(none)'} is missing from the brand folder`,
          {
            data: { variant, file: v?.file ?? null },
          },
        ),
      );
    }
  }
  return result(items);
}
