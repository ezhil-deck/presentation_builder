// P3-spec §A.3: the checks over every golden deck (golden/expected/<id>/, in git) have no `fail` result, except a brand
// whose brand-spec has blocking questions (hdfc-2: two font files missing) - there exactly `questions` and `fonts`.
// Warn counts are not snapshotted: they are reviewed in the UI.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks } from '../src/index.js';
import { filesFrom } from '../src/files.js';
import { GOLDEN_BRANDS, golden, goldenIds } from './fixtures.js';

/** The results expected to fail: from the brand's own blocking questions / font families without files. */
function expectedFails({ brandSpec, deck }) {
  const out = [];
  if ((brandSpec.questions ?? []).some((q) => q.severity === 'blocking')) out.push('questions');
  if ((deck.fonts ?? []).some((f) => !(f.files ?? []).length)) out.push('fonts');
  return out;
}

describe('checks over the golden decks', () => {
  const ids = goldenIds();

  it('finds the ten golden brands', () => {
    expect(ids).toHaveLength(10);
  });

  it.each(ids)('%s: no fail result except its blocking questions / font families without files', (id) => {
    const g = golden(id);
    const report = runChecks(g);
    const fails = report.results.filter((r) => r.status === 'fail').map((r) => r.id);
    expect(fails).toEqual(expectedFails(g));
    expect(report.summary.checks).toBe(14);
    // deterministic
    expect(JSON.stringify(runChecks(golden(id)))).toBe(JSON.stringify(report));
  });

  it('hdfc-2 fails exactly questions (two blocking) and fonts (Lato has no files)', () => {
    const report = runChecks(golden('hdfc-2'));
    expect(report.results.filter((r) => r.status === 'fail').map((r) => r.id)).toEqual([
      'questions',
      'fonts',
    ]);
    expect(
      report.results.find((r) => r.id === 'questions').items.filter((i) => i.severity === 'fail'),
    ).toHaveLength(2);
    expect(report.results.find((r) => r.id === 'fonts').items[0].message).toMatch(
      /^font family "Lato" has no font files/,
    );
  });

  // with the brand inputs present (git-ignored, local only): asset and logo files exist too
  const local = ids.filter((id) => existsSync(join(GOLDEN_BRANDS, id)));
  (local.length ? it.each(local) : it.skip.each(['(no golden/brands inputs)']))(
    '%s with its brand folder: every asset and logo file exists',
    (id) => {
      const report = runChecks({ ...golden(id), files: filesFrom(join(GOLDEN_BRANDS, id)) });
      expect(report.results.find((r) => r.id === 'assets').status).toBe('pass');
    },
  );
});
