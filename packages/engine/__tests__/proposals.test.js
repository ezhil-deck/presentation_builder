// docs/P3-proposals.md: the open proposal PR-4, behind its composeDeck `proposals` option, off by default. Positive
// tests show the effect on the golden Moods (in git); negative tests show that with the option off nothing changes.
// PR-1..3 (approved 2026-10-31) and PR-F / PR-C′ (approved 2026-11-03) are rules of every build, tested in
// rules-approved.test.js.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  clearOfDecor,
  composeDeck,
  normalizeProposals,
  parseMarkdown,
  proposalKey,
  validateDeck,
} from '../src/index.js';
import { ROOT, goldenShowcaseMd, showcaseMd } from './helpers.js';

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const BRANDS = [
  'akgmedia',
  'bosch',
  'cisco',
  'hdfc-2',
  'headspace',
  'notion',
  'rukko',
  'shopify',
  'stripe',
  'the-ken',
];
const golden = (id) => ({
  mood: readJson(`golden/expected/${id}/mood.json`),
  brandSpec: readJson(`golden/expected/${id}/brand-spec.json`),
});
const md = showcaseMd();
const composeFor = ({ mood, brandSpec }, proposals) =>
  composeDeck({
    content: parseMarkdown(md, { brandSpec }),
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
    ...(proposals === undefined ? {} : { proposals }),
  });
// the golden showcase (content/2, what `pb build` and the golden decks compose)
const md2 = goldenShowcaseMd();
const composeV2 = ({ mood, brandSpec }, proposals) =>
  composeDeck({
    content: parseMarkdown(md2, { brandSpec }),
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
    ...(proposals === undefined ? {} : { proposals }),
  });
const slideOf = (deck, kind) => deck.slides.find((s) => s.kind === kind);
const el = (slide, id) => slide.elements.find((e) => e.id === id);

describe('proposals option', () => {
  it('normalizes all / lists / objects; unknown names (incl. the approved PR-1..3, PR-F, PR-C′) are ignored by the engine, rejected by proposalKey', () => {
    const none = { titleClearOfDecor: false };
    const all = { titleClearOfDecor: true };
    const only4 = { titleClearOfDecor: true };
    expect(normalizeProposals('all')).toEqual(all);
    expect(normalizeProposals(true)).toEqual(all);
    expect(normalizeProposals(['pr4'])).toEqual(only4);
    expect(normalizeProposals('PR-4')).toEqual(only4);
    // the approved PR-F / PR-C′ (2026-11-03) are rules now: no option
    expect(normalizeProposals('prf')).toEqual(none);
    expect(normalizeProposals('prf,PR-C')).toEqual(none);
    expect(normalizeProposals({ fillRoom: true, recordedPlacement: true })).toEqual(none);
    expect(normalizeProposals(['pr4', 'PR-F', 'prc'])).toEqual(only4);
    expect(normalizeProposals(['pr1', 'PR-3'])).toEqual(none);
    expect(normalizeProposals({ titleClearOfDecor: true })).toEqual(only4);
    expect(normalizeProposals({ fitUp: true })).toEqual(none);
    expect(normalizeProposals(undefined)).toEqual(none);
    expect(proposalKey('pr5')).toBeNull();
    expect(proposalKey('pr1')).toBeNull();
    expect(proposalKey('prb')).toBeNull();
    expect(proposalKey('fitUp')).toBeNull();
    expect(proposalKey('titleClearOfDecor')).toBe('titleClearOfDecor');
    expect(proposalKey('PR-4')).toBe('titleClearOfDecor');
    expect(proposalKey('prf')).toBeNull();
    expect(proposalKey('PR-F')).toBeNull();
    expect(proposalKey('prc')).toBeNull();
    expect(proposalKey('PR-C')).toBeNull();
    expect(proposalKey('fillRoom')).toBeNull();
    expect(proposalKey('recordedPlacement')).toBeNull();
    // the withdrawn P-E / P-A (2026-11-03) are no proposals any more
    expect(proposalKey('pre')).toBeNull();
    expect(proposalKey('PR-A')).toBeNull();
    expect(proposalKey('composerLadder')).toBeNull();
  });

  it.each(['stripe', 'hdfc-2', 'rukko'])(
    '%s: proposals off (absent, {} or all false) compose the identical deck, with no proposals section',
    (id) => {
      const g = golden(id);
      const base = composeFor(g);
      expect(base.proposals).toBeUndefined();
      for (const off of [{}, normalizeProposals(undefined), [], ['pr1', 'pr2', 'pr3'], ['prf', 'prc']]) {
        const r = composeFor(g, off);
        expect(r.deck).toEqual(base.deck);
        expect(r.proposals).toBeUndefined();
      }
    },
  );

  it('the approved PR-F / PR-C′ (rules since 2026-11-03) are no option: their names compose the golden showcase as the default', () => {
    for (const id of ['bosch', 'rukko']) {
      const g = golden(id);
      const base = composeV2(g);
      const named = composeV2(g, ['prf', 'prc']);
      expect(JSON.stringify(named.deck)).toBe(JSON.stringify(base.deck));
      expect(named.proposals).toBeUndefined();
    }
  });

  it('every brand: all proposals on still writes a schema-valid deck', () => {
    for (const id of BRANDS) {
      const { deck, proposals } = composeFor(golden(id), 'all');
      expect([id, validateDeck(deck)]).toEqual([id, []]);
      expect(proposals.options).toEqual(normalizeProposals('all'));
    }
  });
});

describe('PR-4 cover / section / cta text keeps clear of front-layer brand-boxed decor', () => {
  const content = { x: 100, y: 0, w: 1600, h: 1000 };
  it('clearOfDecor: narrows only on intersect, to the free side, never below 50 % of the content width', () => {
    const f = { x: 100, y: 100, w: 1600, h: 200 };
    expect(clearOfDecor(f, { x: 100, y: 500, w: 100, h: 100 }, content)).toBeNull(); // no intersection
    expect(clearOfDecor(f, { x: 1300, y: 150, w: 200, h: 100 }, content)).toEqual({ ...f, w: 1200 }); // right
    expect(clearOfDecor(f, { x: 150, y: 150, w: 200, h: 100 }, content)).toEqual({ ...f, x: 350, w: 1350 }); // left
    expect(clearOfDecor(f, { x: 600, y: 150, w: 1000, h: 100 }, content)).toEqual({ ...f, w: 800 }); // floor
    expect(clearOfDecor({ ...f, w: 800 }, { x: 600, y: 150, w: 1000, h: 100 }, content)).toBeNull(); // at floor
  });

  /** stripe + a front-layer decor boxed over the right part of the cover title. */
  const withDecor = (layer, box) => {
    const g = golden('stripe');
    g.mood.decor.elements = [
      ...g.mood.decor.elements,
      {
        id: 'testMark',
        file: 'assets/decor/rays.png',
        layer,
        box,
        allowedOn: ['cover'],
        frequency: 'always',
      },
    ];
    return g;
  };
  const box = { x: 1000, y: 600, w: 300, h: 200 };

  it('positive: the cover title ends at the decor (no other change), recorded as PR-4', () => {
    const off = slideOf(composeFor(withDecor('front', box)).deck, 'cover');
    const { deck, proposals } = composeFor(withDecor('front', box), { titleClearOfDecor: true });
    const cover = slideOf(deck, 'cover');
    const before = el(off, 's1-title');
    const after = el(cover, 's1-title');
    expect(after.frame.x).toBe(before.frame.x);
    expect(after.frame.w).toBe(box.x - before.frame.x);
    expect(after.frame.w).toBeGreaterThanOrEqual(0.5 * (1920 - 2 * 138) - 1e-6);
    expect(after.text.fit.overflow).toBe(false);
    expect(proposals.effects).toContainEqual(
      expect.objectContaining({
        proposal: 'PR-4',
        index: 1,
        box: 'title',
        to: { x: before.frame.x, w: after.frame.w },
      }),
    );
  });

  it('negative: behind-layer decor, or the proposal off, leave the title box as G6c makes it', () => {
    const offFront = slideOf(composeFor(withDecor('front', box)).deck, 'cover');
    const onBehind = slideOf(composeFor(withDecor('behind', box), { titleClearOfDecor: true }).deck, 'cover');
    const offBehind = slideOf(composeFor(withDecor('behind', box)).deck, 'cover');
    expect(el(onBehind, 's1-title')).toEqual(el(offBehind, 's1-title'));
    // G6c (proposal off) keeps one gutter before the decor
    const gutter = golden('stripe').mood.geometry.grid.gutter;
    expect(el(offFront, 's1-title').frame.w).toBe(box.x - gutter - el(offFront, 's1-title').frame.x);
  });

  it('negative: a decor that does not intersect the text changes nothing', () => {
    const far = { x: 1700, y: 60, w: 100, h: 100 };
    const off = composeFor(withDecor('front', far)).deck;
    const on = composeFor(withDecor('front', far), { titleClearOfDecor: true });
    expect(on.deck).toEqual(off);
    expect(on.proposals.effects).toEqual([]);
  });
});
