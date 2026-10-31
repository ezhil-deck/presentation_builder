/**
 * Check 1 `schema` (P3-spec §A.2): the deck validates against schemas/deck.schema.json. A contract failure: fail.
 */
import { validateDeck } from '@pb/engine';
import { makeItem, result, skip } from '../util.js';

export const id = 'schema';
export const title = 'Deck validates against the deck schema';
export const signal = null;

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const errors = validateDeck(deck);
  return result(
    errors.map((e) =>
      makeItem('fail', `${e.pointer || '/'} ${e.message}`, { data: { pointer: e.pointer || '/' } }),
    ),
  );
}
