// MD-COMPOSITION: composition copied; opening/closing and layoutHints keyed by kind (kind map; layoutHints expanded
// via content, G1).
import {
  brandVocabulary,
  CONTENT_ID,
  kindsViaContent,
  toKind,
  unknownKindMessage,
  viaContentNote,
} from '../kindMap.js';
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-COMPOSITION';

const HINT_KEYS = [
  ['surface', 'surface'],
  ['background', 'background'],
  ['logo', 'logo'],
  ['titleStyle', 'titleRole'],
  ['footer', 'footer'],
];

export function rule(brandSpec) {
  const c = collector(RULE);
  const comp = brandSpec.composition;
  const composition = {};

  if (isObj(comp)) {
    for (const [k, v] of Object.entries(comp)) {
      if (k === 'openingSequence' || k === 'closingSequence') continue;
      composition[k] = clone(v);
      c.prov(ptr('composition', k), [ptr('composition', k)]);
    }
    for (const [from, to] of [
      ['openingSequence', 'opening'],
      ['closingSequence', 'closing'],
    ]) {
      if (!Array.isArray(comp[from])) continue;
      composition[to] = comp[from].map((id, i) => {
        const { kind, known } = toKind(id);
        if (!known) c.warn(ptr('composition', from, i), unknownKindMessage(id));
        return kind;
      });
      c.prov(ptr('composition', to), [ptr('composition', from)], 'layout ids -> kinds (kind map)');
    }
  }

  const layouts = brandSpec.brandLayouts;
  if (Array.isArray(layouts) && layouts.length) {
    const hints = {};
    let contentHint = null;
    layouts.forEach((l, i) => {
      const { kind, known } = toKind(l.id);
      if (!known) c.warn(ptr('brandLayouts', i, 'id'), unknownKindMessage(l.id));
      if (has(hints, kind)) {
        c.warn(
          ptr('brandLayouts', i, 'id'),
          `layout "${l.id}" maps to kind "${kind}" already hinted by an earlier layout: first kept`,
        );
        return;
      }
      const hint = {};
      for (const [from, to] of HINT_KEYS) if (has(l, from)) hint[to] = l[from];
      hints[kind] = hint;
      if (l.id === CONTENT_ID) contentHint = { hint, i };
      c.prov(
        ptr('composition', 'layoutHints', kind),
        [ptr('brandLayouts', i)],
        `layout "${l.id}" -> kind "${kind}"; titleStyle -> titleRole`,
      );
    });
    // G1: every catalogue kind the brand names no layout for takes the `content` layout's hint
    if (contentHint) {
      for (const kind of kindsViaContent(brandVocabulary(brandSpec))) {
        if (has(hints, kind)) continue;
        hints[kind] = clone(contentHint.hint);
        c.prov(
          ptr('composition', 'layoutHints', kind),
          [ptr('brandLayouts', contentHint.i)],
          viaContentNote(kind),
        );
      }
    }
    composition.layoutHints = hints;
  }

  c.res.patch = Object.keys(composition).length ? { composition } : {};
  return c.res;
}
