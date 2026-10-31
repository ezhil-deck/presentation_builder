import { Slide } from './slide.js';
import { h } from './util.js';

/** A whole Deck (or the subset of slide indexes in `only`): its slides in order. */
export function Deck({ deck, opts = {}, only }) {
  const indexes = only ?? deck.slides.map((_, i) => i);
  const attrs = { className: 'pb-deck', 'data-deck-id': deck.id };
  if (deck.source?.brandId) attrs['data-brand-id'] = deck.source.brandId;
  return h(
    'main',
    attrs,
    ...indexes.map((i) => h(Slide, { key: deck.slides[i].id ?? i, deck, index: i, opts })),
  );
}
