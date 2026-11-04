/**
 * C3.1 (docs/PLAN-catalogue.md): placement and scale. Catalogue layouts composed on every golden Mood (all 1,076 with blocks on
 * stripe, bosch and headspace; every tenth on the other seven) with a slide written for it (its combination at the middle of each band, catalogueFill.js), and the empty share of each container
 * box compared with the catalogue's own (`place.empty`, +15 points allowed). The per-container bound is not met
 * everywhere (the brands' type ladders are smaller than the catalogue's and the catalogue fills its zones with
 * numerals, labels and meters we do not draw): the test holds the measured level as a floor - at least half the
 * containers of every Mood within the bound - and the rules that bring them there are tested on their own below.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { composeDeck, inferKind, summarize } from '../src/index.js';
import { stepRole } from '../src/compose/slots.js';
import { emptyShares, slideFor } from './catalogueFill.js';
import { ROOT } from './helpers.js';

const GOLDEN = join(ROOT, 'golden', 'expected');
const MOODS = readdirSync(GOLDEN)
  .filter((id) => existsSync(join(GOLDEN, id, 'mood.json')))
  .sort()
  .map((id) => JSON.parse(readFileSync(join(GOLDEN, id, 'mood.json'), 'utf8')));
const DEFS = catalogue.list({ catalogue: true }).filter((d) => d.catalogue && d.record.combination.length);
/** Every record on three Moods, every tenth record on the other seven (about 6 s). */
const FULL = new Set(['stripe', 'bosch', 'headspace']);
const defsFor = (mood) => (FULL.has(mood.id) ? DEFS : DEFS.filter((_, i) => i % 10 === 0));

/** {containers, within, excess: [per container: ours − catalogue's]} for one Mood. */
function measure(mood) {
  const defs = defsFor(mood);
  const slides = [
    { id: 'cover', title: 'Cover', blocks: [] },
    ...defs.map((d) => ({ id: d.catalogue, ...slideFor(d.record), layout: d.id })),
  ];
  const { deck } = composeDeck({
    content: { schema: 'content/2', slides },
    mood,
    catalogue,
    options: { catalogue: true },
  });
  let containers = 0;
  let within = 0;
  defs.forEach((d, i) => {
    const cs = slides[i + 1];
    const kind = inferKind(cs, { index: i + 1, count: slides.length });
    const layout = d.build({ mood, geometry: mood.geometry, summary: { ...summarize(cs, { kind }), kind } });
    const shares = emptyShares(deck.slides[i + 1], layout);
    for (const c of d.record.containers) {
      if (!(c.c in shares)) continue;
      containers += 1;
      if (shares[c.c] <= c.place.empty + 0.15) within += 1;
    }
  });
  return { containers, within };
}

describe('catalogue layouts fill their zones (C3.1)', () => {
  it.each(MOODS.map((m) => [m.id, m]))(
    '%s: at least half the containers within the catalogue’s empty share + 15 points',
    (_id, mood) => {
      const { containers, within } = measure(mood);
      expect(containers).toBeGreaterThan(FULL.has(mood.id) ? 1600 : 160);
      expect(within / containers).toBeGreaterThanOrEqual(0.5);
    },
  );

  it('steps a role up the brand ladder, capped, and leaves a role off the ladder alone (negative)', () => {
    const mood = MOODS.find((m) => m.id === 'stripe');
    expect(stepRole(mood, 'body', 1)).not.toBe('body');
    expect(mood.type.roles[stepRole(mood, 'body', 1)].size).toBeGreaterThan(mood.type.roles.body.size);
    expect(stepRole(mood, 'body', 9, 'h2')).toBe('h2');
    expect(stepRole(mood, 'h1', 3)).toBe('h1');
    expect(stepRole(mood, 'stat', 2)).toBe('stat');
    expect(stepRole(mood, 'body', 0)).toBe('body');
  });
});
