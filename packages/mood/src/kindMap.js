// The Kind map (docs/P1-rules.md §B + D10): brand layout ids / hideOn names -> layout kinds.
// Unknown ids are kept verbatim; the caller warns (deriveMood keeps one warning per id).

const GROUPS = {
  cover: ['title', 'cover'],
  cta: ['closing', 'cta', 'thankyou', 'thanks'],
  section: ['section', 'divider', 'sectionBands'],
  agenda: ['agenda', 'contents'],
  bullets: ['content', 'bullets', 'list'],
  'two-column': ['twoColumn', 'two-column', 'split'],
  chart: ['chart', 'data'],
  table: ['table'],
  kpi: ['kpi', 'stats', 'numbers', 'stat'],
  image: ['image', 'photo', 'imageBleed', 'bleedPhoto', 'hero'],
  'image-text': ['imageText'],
  quote: ['quote', 'testimonial'],
  team: ['team', 'people'],
  logos: ['logos', 'logoWall', 'partners'],
  cards: ['cards', 'features'],
  steps: ['steps', 'process'],
  timeline: ['timeline', 'roadmap'],
  comparison: ['comparison', 'versus'],
  diagram: ['diagram'],
  text: ['text', 'statement'],
};

export const KIND_MAP = Object.freeze(
  Object.fromEntries(Object.entries(GROUPS).flatMap(([kind, ids]) => ids.map((id) => [id, kind]))),
);

export const KINDS = Object.freeze(Object.keys(GROUPS));

/**
 * The layout catalogue's kinds (packages/layouts KINDS), hard-coded because the mood package must not import layouts;
 * a test keeps the two lists equal. The Mood's per-kind maps are expanded over these (G1).
 */
export const CATALOGUE_KINDS = Object.freeze([
  'cover',
  'section',
  'agenda',
  'bullets',
  'text',
  'two-column',
  'cards',
  'steps',
  'timeline',
  'kpi',
  'chart',
  'table',
  'image',
  'image-text',
  'quote',
  'team',
  'logos',
  'cta',
]);

/** G1: the brand layout id that means "a content slide". */
export const CONTENT_ID = 'content';

/** G1: kinds that never fall back to `content` (they are not content slides). */
const NO_CONTENT_FALLBACK = Object.freeze(['cover', 'section', 'cta', 'image']);

/**
 * id -> { kind, known }. A layout kind itself is known too (E4: answers name kinds, e.g. "image-text").
 * Unknown: kind is the id verbatim and known is false. Case-sensitive.
 */
export function toKind(id) {
  if (Object.prototype.hasOwnProperty.call(KIND_MAP, id)) return { kind: KIND_MAP[id], known: true };
  if (KINDS.includes(id)) return { kind: id, known: true };
  return { kind: id, known: false };
}

export function unknownKindMessage(id) {
  return `unknown layout id "${id}": kept verbatim as its own kind (not in the kind map)`;
}

/**
 * G1: the brand's layout vocabulary - every layout id the BrandSpec names anywhere (brandLayouts ids, logos.perLayout
 * keys, decor allowedOn, layout.footer.hideOn, composition opening/closing sequences), in that order, each once.
 */
export function brandVocabulary(brandSpec) {
  const ids = [];
  const add = (id) => {
    if (typeof id === 'string' && !ids.includes(id)) ids.push(id);
  };
  for (const l of brandSpec?.brandLayouts ?? []) add(l?.id);
  for (const id of Object.keys(brandSpec?.logos?.perLayout ?? {})) add(id);
  for (const e of brandSpec?.decor?.elements ?? []) for (const id of e?.allowedOn ?? []) add(id);
  for (const id of brandSpec?.layout?.footer?.hideOn ?? []) add(id);
  for (const k of ['openingSequence', 'closingSequence'])
    for (const id of brandSpec?.composition?.[k] ?? []) add(id);
  return ids;
}

/**
 * G1: catalogue kind -> the brand layout id every brand-keyed lookup uses for it. The exact id when the vocabulary
 * names one for this kind (first in vocabulary order; bullets -> `content` is such an exact match); otherwise
 * `content` for every kind but cover / section / cta / image; otherwise null (the brand says nothing for it).
 */
export function brandIdFor(kind, vocabulary) {
  const exact = (vocabulary ?? []).find((id) => toKind(id).kind === kind);
  if (exact !== undefined) return exact;
  return NO_CONTENT_FALLBACK.includes(kind) ? null : CONTENT_ID;
}

/**
 * G1: the catalogue kinds that resolve to `content` only by the fallback (no exact id in the vocabulary): the kinds a
 * brand-keyed map / list gets from its `content` entry. The kind `content` itself maps to is never in this list.
 */
export function kindsViaContent(vocabulary) {
  const own = toKind(CONTENT_ID).kind;
  return CATALOGUE_KINDS.filter((k) => k !== own && brandIdFor(k, vocabulary) === CONTENT_ID);
}

/** G1: the provenance note on an entry (one kind, or a list of kinds) expanded from the brand's `content` layout. */
export function viaContentNote(kinds) {
  const list = [kinds].flat();
  const named = list.map((k) => `"${k}"`).join(', ');
  return `via content: the brand names no layout for kind${list.length > 1 ? 's' : ''} ${named}, so its "${CONTENT_ID}" layout applies (G1)`;
}
