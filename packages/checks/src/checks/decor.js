/**
 * Check 11 `decor` (P3-spec §A.2): decor elements appear only on slides their `allowedOn` lists and only on surfaces
 * their `surfaces` list names (when given); a decor with `frequency: 'always'` missing on an allowed slide → warn; a
 * front-layer decor intersecting a text element → warn. The compose-time `decor-overlap` notes are folded into this
 * check's items (with their own severity), except where the geometric finding already covers that decor.
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
  slideIndex,
  slideKinds,
  slidesOf,
  warningItem,
} from '../util.js';

export const id = 'decor';
export const title = 'Decor only where the brand allows it';
export const signal = 'mood.decor.elements';

/** z of the front decor layer (P2-spec §3.5: decor-front 60). */
const FRONT_Z = 60;

const allowedHere = (def, kinds, surfaceId) =>
  Array.isArray(def.allowedOn) &&
  kinds.some((k) => def.allowedOn.includes(k)) &&
  !(Array.isArray(def.surfaces) && def.surfaces.length && !def.surfaces.includes(surfaceId));

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const defs = mood?.decor?.elements;
  if (!Array.isArray(defs) || !defs.length) return skip('the Mood gives no decor elements');
  const byId = new Map(defs.map((d) => [d.id, d]));
  const items = [];
  const frontHits = new Set(); // `${slideId}|${decorId}`
  for (const { slide, index } of slidesOf(deck)) {
    const kinds = slideKinds(slide);
    const all = flatElements(slide);
    const decor = all.filter((el) => el.role === 'decor');
    const placed = new Set(decor.map((el) => el.name));
    for (const el of decor) {
      const def = byId.get(el.name);
      if (!def) {
        items.push(
          makeItem('warn', `decor "${el.id}" names no decor element of the Mood ("${el.name ?? ''}")`, {
            slide,
            index,
            el,
          }),
        );
        continue;
      }
      if (!Array.isArray(def.allowedOn) || !kinds.some((k) => def.allowedOn.includes(k))) {
        items.push(
          makeItem('warn', `decor "${def.id}" is on a ${kinds[0]} slide, which its allowedOn does not list`, {
            slide,
            index,
            el,
            data: { allowedOn: def.allowedOn ?? [] },
          }),
        );
      }
      if (Array.isArray(def.surfaces) && def.surfaces.length && !def.surfaces.includes(slide.surfaceId)) {
        items.push(
          makeItem(
            'warn',
            `decor "${def.id}" is on surface "${slide.surfaceId}", which its surfaces do not list`,
            {
              slide,
              index,
              el,
              data: { surfaces: def.surfaces },
            },
          ),
        );
      }
      const front = def.layer === 'front' || (el.z ?? 0) >= FRONT_Z;
      if (!front || !isFrame(el.frame)) continue;
      for (const t of all) {
        if (t.type !== 'text' || t.role === 'decor' || !isFrame(t.frame) || !hasText(t)) continue;
        const o = overlap(el.frame, t.frame);
        if (o.w > 0.01 && o.h > 0.01) {
          frontHits.add(`${slide.id}|${def.id}`);
          items.push(
            makeItem(
              'warn',
              `front decor "${def.id}" covers text "${t.id}" by ${fmt(o.w)} × ${fmt(o.h)} px`,
              {
                slide,
                index,
                el,
                data: { text: t.id, overlap: { w: r2(o.w), h: r2(o.h) } },
              },
            ),
          );
        }
      }
    }
    for (const def of defs) {
      if (def.unused || def.frequency !== 'always' || placed.has(def.id)) continue;
      if (!allowedHere(def, kinds, slide.surfaceId)) continue;
      items.push(
        makeItem(
          'warn',
          `decor "${def.id}" (frequency always) is missing on this ${kinds[0]} slide${def.file ? '' : ' (a drawn element: no file to place)'}`,
          { slide, index, data: { decor: def.id, drawn: !def.file } },
        ),
      );
    }
  }
  const idx = slideIndex(deck);
  for (const w of deck.warnings ?? []) {
    if (w.check !== 'decor-overlap') continue;
    const name = /decor "([^"]+)"/.exec(w.message ?? '')?.[1];
    if (name && frontHits.has(`${w.slide}|${name}`)) continue;
    items.push(warningItem(w, idx));
  }
  return result(items);
}
