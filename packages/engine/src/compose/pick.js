/** Kind normalisation + layout pick (P2-spec §2, §3.1). v1: the single layout of a kind. */
import { validateLayout } from '../validate.js';

export const LAYOUT_KINDS = Object.freeze([
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
export const KIND_ALIASES = Object.freeze({ diagram: 'steps', comparison: 'two-column', blank: 'text' });

/** kind as written -> {kind (a catalogue kind), known} ; unknown -> text. */
export function normalizeKind(kind) {
  const k = KIND_ALIASES[kind] ?? kind;
  if (LAYOUT_KINDS.includes(k)) return { kind: k, known: true, aliased: k !== kind };
  return { kind: 'text', known: false, aliased: false };
}

/**
 * pick(kind, summary, mood, catalogue, {warn, layoutId}) -> Layout instance (schemas/layout.schema.json).
 * A pinned `layoutId` wins when the catalogue has it; a kind with no layout falls back to the `text` layout (warning);
 * an unknown kind is `text` (warning). Returns null when not even `text` exists.
 */
export function pick(kind, summary, mood, catalogue, { warn = () => {}, layoutId } = {}) {
  const norm = normalizeKind(kind);
  if (!norm.known) warn('kind', `unknown slide kind "${kind}": composed as "text"`);
  let def = null;
  if (layoutId) {
    def = catalogue.get(layoutId) ?? null;
    if (!def) warn('layout', `pinned layout "${layoutId}" is not in the catalogue: picked by kind`);
  }
  if (!def) def = catalogue.forKind(norm.kind)[0] ?? null;
  if (!def && norm.kind !== 'text') {
    warn('layout', `the catalogue has no layout for kind "${norm.kind}": composed with the "text" layout`);
    def = catalogue.forKind('text')[0] ?? null;
  }
  if (!def) {
    warn('layout', `the catalogue has no "text" layout: slide left without content`, 'error');
    return null;
  }
  const layout = def.build({
    mood,
    geometry: mood.geometry,
    summary: { ...summary, kind: summary?.kind ?? norm.kind },
  });
  for (const e of validateLayout(layout)) {
    warn(
      'layout-schema',
      `layout "${def.id}" is invalid against schemas/layout.schema.json: ${e.pointer} ${e.message}`,
      'error',
    );
  }
  return layout;
}
