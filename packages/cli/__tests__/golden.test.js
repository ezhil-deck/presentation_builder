import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { composeContent, deriveBrand, withoutWidths } from '../src/index.js';
import paths from '../src/paths.cjs';

/**
 * Golden Moods + Decks (P1-rules §C, D13; P2-spec §6): every golden/expected/<id>/mood.json is re-derived from golden/brands/<id>/ and
 * deep-compared. golden/brands is git-ignored, so a brand whose input folder is absent is skipped (CI without inputs
 * passes); a brand input present without a snapshot fails. Refresh a snapshot with
 * `pb mood golden/brands/<id> --snapshot` only after reviewing the diff.
 */
const dirs = (root) =>
  existsSync(root)
    ? readdirSync(root)
        .filter((id) => statSync(join(root, id)).isDirectory())
        .sort()
    : [];

const expected = dirs(paths.GOLDEN_EXPECTED).filter((id) =>
  existsSync(join(paths.GOLDEN_EXPECTED, id, 'mood.json')),
);
const inputs = dirs(paths.GOLDEN_BRANDS).filter((id) =>
  existsSync(join(paths.GOLDEN_BRANDS, id, `${id}.json`)),
);
const ids = [...new Set([...expected, ...inputs])].sort();

describe('golden Moods', () => {
  if (ids.length === 0) {
    it.skip('no golden snapshots or inputs', () => {});
    return;
  }

  for (const id of ids) {
    const hasInput = inputs.includes(id);
    const test = hasInput ? it : it.skip;
    test(`${id}: derived Mood equals golden/expected/${id}/mood.json${hasInput ? '' : ' (input absent: skipped)'}`, () => {
      const file = join(paths.GOLDEN_EXPECTED, id, 'mood.json');
      expect(existsSync(file)).toBe(true);
      const { mood, errors } = deriveBrand(join(paths.GOLDEN_BRANDS, id));
      expect(errors).toEqual([]);
      expect(withoutWidths(mood)).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  }
});

/**
 * Golden Decks (P2-spec §6): golden/expected/<id>/deck.json is the showcase composed for that brand, compared whole
 * (nothing stripped). Refresh with `pb build golden/brands/<id> --snapshot` only after reviewing the diff.
 */
describe('golden Decks (showcase)', () => {
  const deckIds = ids.filter(
    (id) => inputs.includes(id) || existsSync(join(paths.GOLDEN_EXPECTED, id, 'deck.json')),
  );
  if (deckIds.length === 0) {
    it.skip('no golden decks or inputs', () => {});
    return;
  }
  for (const id of deckIds) {
    const hasInput = inputs.includes(id);
    const test = hasInput ? it : it.skip;
    test(`${id}: composed showcase equals golden/expected/${id}/deck.json${hasInput ? '' : ' (input absent: skipped)'}`, () => {
      const file = join(paths.GOLDEN_EXPECTED, id, 'deck.json');
      expect(existsSync(file)).toBe(true);
      const derived = deriveBrand(join(paths.GOLDEN_BRANDS, id));
      expect(derived.errors).toEqual([]);
      const { deck } = composeContent(derived);
      expect(JSON.parse(JSON.stringify(deck))).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  }
});
