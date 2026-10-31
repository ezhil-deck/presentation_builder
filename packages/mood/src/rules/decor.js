// MD-DECOR: brand-supplied elements (every brand-given key kept, E3; allowedOn via the kind map, expanded via content,
// G1; none -> unused, E2, or a question when the brand wants the element often, E4), maxPerSlide, imagery
// treatment/mask/textOverImage/crop.
import {
  brandVocabulary,
  CONTENT_ID,
  KINDS,
  kindsViaContent,
  toKind,
  unknownKindMessage,
  viaContentNote,
} from '../kindMap.js';
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-DECOR';

/** E4: an element the brand wants on (nearly) every slide; with no allowed layouts it raises a question. */
export const WANTED_FREQUENCIES = ['always', 'often'];

/** E4: the optional question for a wanted element with no allowed layouts (answer: input pointer, layout kinds). */
export function allowedOnQuestion(element) {
  return `Which layouts may ${element.id} appear on?`;
}

/** BR-ASSET's reading of `file` (mime, width, height): BrandSpec data, not brand-given element keys (E3). */
function assetKeys(brandSpec, i) {
  const base = ptr('decor', 'elements', i);
  return Object.keys(brandSpec.provenance ?? {})
    .filter((p) => p.startsWith(`${base}/`) && brandSpec.provenance[p]?.from === 'BR-ASSET')
    .map((p) => p.slice(base.length + 1));
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const d = brandSpec.decor;
  const decor = {};
  const surfaceIds = (brandSpec.surfaces ?? []).map((s) => s.id);
  const viaContent = kindsViaContent(brandVocabulary(brandSpec));

  if (isObj(d)) {
    if (Array.isArray(d.elements)) {
      decor.elements = d.elements.map((e, i) => {
        const out = {};
        // E3: every key the brand gives is carried verbatim (allowedOn mapped below; BR-ASSET's mime/size left out).
        const derived = assetKeys(brandSpec, i);
        for (const k of Object.keys(e)) {
          if (k === 'allowedOn' || derived.includes(k) || !has(e, k)) continue;
          out[k] = clone(e[k]);
        }
        if (Array.isArray(e.allowedOn)) {
          out.allowedOn = [];
          e.allowedOn.forEach((id, j) => {
            const { kind, known } = toKind(id);
            if (!known) c.warn(ptr('decor', 'elements', i, 'allowedOn', j), unknownKindMessage(id));
            if (!out.allowedOn.includes(kind)) out.allowedOn.push(kind);
          });
        }
        // G1: allowed on `content` -> allowed on every catalogue kind the brand names no layout for
        const via = e.allowedOn?.includes(CONTENT_ID)
          ? viaContent.filter((k) => !out.allowedOn.includes(k))
          : [];
        out.allowedOn?.push(...via);
        // E2: no allowed layouts (absent or empty after the kind map) -> kept, never placed, marked unused.
        // E4: a wanted element (frequency always|often) asks where it goes instead of warning.
        const unused = !out.allowedOn?.length;
        const wanted = unused && WANTED_FREQUENCIES.includes(e.frequency);
        if (unused) {
          out.allowedOn = [];
          out.unused = true;
          if (wanted) {
            c.ask(ptr('decor', 'elements', i, 'allowedOn'), allowedOnQuestion(e), {
              id: `decor.${e.id}.allowedOn`,
              severity: 'optional',
              options: [...KINDS],
            });
          } else {
            c.warn(
              ptr('decor', 'elements', i, 'allowedOn'),
              `decor element "${e.id}" has no allowed layouts (allowedOn missing or empty)`,
            );
          }
        }
        for (const [j, sid] of (e.surfaces ?? []).entries()) {
          if (!surfaceIds.includes(sid))
            c.warn(
              ptr('decor', 'elements', i, 'surfaces', j),
              `decor element "${e.id}" names unknown surface "${sid}"`,
            );
        }
        c.prov(
          ptr('decor', 'elements', i),
          [ptr('decor', 'elements', i)],
          [
            'every brand-given key copied as given',
            Array.isArray(e.allowedOn) && !unused ? 'allowedOn: layout ids -> kinds' : undefined,
            via.length ? `allowedOn ${viaContentNote(via)}` : undefined,
            unused && !wanted ? 'unused: no allowed layouts (allowedOn missing or empty)' : undefined,
            wanted
              ? `unused until answered: frequency ${e.frequency} with no allowed layouts (question decor.${e.id}.allowedOn)`
              : undefined,
          ]
            .filter(Boolean)
            .join('; '),
        );
        return out;
      });
    }
    if (Number.isInteger(d.maxElementsPerSlide)) {
      decor.maxPerSlide = d.maxElementsPerSlide;
      c.prov(ptr('decor', 'maxPerSlide'), [ptr('decor', 'maxElementsPerSlide')]);
    }
  }

  const im = brandSpec.imagery;
  if (isObj(im)) {
    const imagery = {};
    const treatment = im.treatments?.default;
    if (typeof treatment === 'string') {
      imagery.treatment = treatment;
      c.prov(
        ptr('decor', 'imagery', 'treatment'),
        [ptr('imagery', 'treatments', 'default')],
        "the brand's default treatment",
      );
    }
    const mask = im.masks?.default;
    if (typeof mask === 'string') {
      imagery.mask = mask;
      c.prov(
        ptr('decor', 'imagery', 'mask'),
        [ptr('imagery', 'masks', 'default')],
        "the brand's default mask",
      );
    }
    for (const k of ['textOverImage', 'crop']) {
      if (isObj(im[k])) {
        imagery[k] = clone(im[k]);
        c.prov(ptr('decor', 'imagery', k), [ptr('imagery', k)]);
      }
    }
    if (Object.keys(imagery).length) decor.imagery = imagery;
  }

  c.res.patch = Object.keys(decor).length ? { decor } : {};
  return c.res;
}
