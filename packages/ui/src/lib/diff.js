// Reading the JSON deck diff (P3-spec §B) for display. The shape is the CLI's (`diffDecks(a, b)`); this only
// reads it tolerantly (field names vary between `changed` / `elements.changed`, `keys` / `changes`) and computes
// nothing about the decks themselves.

const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const idOf = (x) => (typeof x === 'string' ? x : (x?.id ?? x?.elementId ?? x?.element ?? JSON.stringify(x)));

function keysOf(c) {
  if (typeof c === 'string') return [];
  const k = c?.keys ?? c?.changes ?? c?.fields ?? c?.diff;
  if (Array.isArray(k))
    return k.map((x) => (typeof x === 'string' ? x : (x?.key ?? x?.path ?? JSON.stringify(x))));
  if (k && typeof k === 'object') return Object.keys(k);
  return [];
}

function changeOf(key, v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const from = v.old ?? v.from ?? v.a ?? v.before;
    const to = v.new ?? v.to ?? v.b ?? v.after;
    if (from !== undefined || to !== undefined) return { key, from, to };
  }
  return { key, value: v };
}

export function normaliseDiff(diff) {
  if (!diff || typeof diff !== 'object') return { identical: true, deck: [], slides: [] };
  const deckRaw = diff.deck ?? diff.deckChanges ?? diff.changes?.deck ?? null;
  let deck = [];
  if (Array.isArray(deckRaw))
    deck = deckRaw.map((d, i) => (typeof d === 'string' ? { key: d } : changeOf(d?.key ?? i, d)));
  else if (deckRaw && typeof deckRaw === 'object')
    deck = Object.entries(deckRaw).map(([k, v]) => changeOf(k, v));

  const slidesRaw = diff.slides ?? diff.changes?.slides ?? [];
  const entries = Array.isArray(slidesRaw)
    ? slidesRaw.map((s, i) => [s?.id ?? s?.slide ?? s?.slideId ?? String(i + 1), s])
    : Object.entries(slidesRaw);
  const slides = [];
  for (const [key, s] of entries) {
    if (!s || typeof s !== 'object') continue;
    const els = s.elements && !Array.isArray(s.elements) ? s.elements : s;
    const added = asArray(els.added).map(idOf);
    const removed = asArray(els.removed).map(idOf);
    const changed = asArray(els.changed).map((c) => ({ id: idOf(c), keys: keysOf(c) }));
    const slideKeys = Array.isArray(s.keys) ? s.keys : [];
    const status = typeof s.status === 'string' ? s.status : null;
    const touched = added.length || removed.length || changed.length || slideKeys.length;
    if (!touched && (!status || status === 'same' || status === 'identical' || status === 'unchanged'))
      continue;
    slides.push({ key, index: s.index ?? null, status, added, removed, changed, slideKeys });
  }
  const identical = typeof diff.identical === 'boolean' ? diff.identical : !deck.length && !slides.length;
  return { identical, deck, slides };
}
