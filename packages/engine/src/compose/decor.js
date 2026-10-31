/**
 * Decor placement (P2-spec §3.5): only brand-given elements, only on their allowedOn kinds and surfaces, at the
 * brand's frequency (counted per element over the slides where it is eligible, so the result depends on slide index
 * only), at element.box when given else in the layout's first free decor zone (image scaled to fit, centred).
 */
import { r2 } from '../util/stable.js';

export const createDecorState = () => ({ counts: new Map(), said: new Set() });

const placeOnCount = (frequency, e) => {
  if (frequency === 'often') return e % 2 === 0;
  if (frequency === 'sometimes') return e % 3 === 0;
  if (frequency === 'rare') return e === 0;
  return true; // always (and absent: the brand allowed it on these kinds without a frequency)
};

export function placeDecor({ kinds, surface, layout, mood, assets, warn, state, slideId }) {
  const out = [];
  if (layout?.decor?.allow === false) return out;
  const zones = layout?.decor?.zones ?? [];
  const used = new Set();
  const max = mood.decor?.maxPerSlide;
  for (const el of mood.decor?.elements ?? []) {
    if (el.unused || !Array.isArray(el.allowedOn) || !kinds.some((k) => el.allowedOn.includes(k))) continue;
    if (Array.isArray(el.surfaces) && el.surfaces.length && !el.surfaces.includes(surface.id)) continue;
    const e = state.counts.get(el.id) ?? 0;
    state.counts.set(el.id, e + 1);
    if (!placeOnCount(el.frequency, e)) continue;
    if (!el.file) {
      if (!state.said.has(el.id)) {
        state.said.add(el.id);
        warn(
          'decor',
          `drawn decor element "${el.id}" (type ${el.type ?? '?'}) is not placed in v1 (no file)`,
          'info',
        );
      }
      continue;
    }
    if (typeof max === 'number' && out.length >= max) {
      warn('decor', `decor "${el.id}" skipped: decor.maxPerSlide ${max} reached`, 'info');
      continue;
    }
    let frame;
    let fit = 'cover';
    if (el.box && ['x', 'y', 'w', 'h'].every((k) => typeof el.box[k] === 'number')) {
      frame = { x: el.box.x, y: el.box.y, w: el.box.w, h: el.box.h };
    } else {
      const zi = zones.findIndex((z, k) => !used.has(k));
      if (zi < 0) {
        warn(
          'decor',
          `decor "${el.id}" has no box and layout "${layout?.id}" has no free decor zone: not placed`,
          'info',
        );
        continue;
      }
      used.add(zi);
      const z = zones[zi];
      const info = assets.info(el.file);
      fit = 'contain';
      if (info?.width && info?.height) {
        const s = Math.min(z.w / info.width, z.h / info.height);
        const w = info.width * s;
        const h = info.height * s;
        frame = { x: r2(z.x + (z.w - w) / 2), y: r2(z.y + (z.h - h) / 2), w: r2(w), h: r2(h) };
      } else frame = { x: z.x, y: z.y, w: z.w, h: z.h };
    }
    const image = { asset: assets.add(el.file), fit };
    if (el.animated) image.animated = assets.add(el.animated);
    if (el.tile) {
      image.tile = true;
      if (typeof el.scale === 'number') image.scale = el.scale;
    }
    const element = {
      id: `${slideId}-decor-${el.id}`,
      type: 'image',
      role: 'decor',
      name: el.id,
      frame,
      z: el.layer === 'front' ? 60 : 10,
      image,
    };
    if (typeof el.opacity === 'number') element.style = { opacity: el.opacity };
    out.push(element);
  }
  return out;
}
