// Font pairs (docs/P4-spec.md §3, P4.3): MD-TYPE keeps the alternative heading / body pairs a brand defines
// (BrandSpec typography.pairs -> Mood type.pairs, provenance per pair, nothing when the brand defines none), and
// applyFontPair swaps the faces of the Mood's roles to a pair's. No golden brand defines pairs today (the input format
// has no field for them): a fixture BrandSpec carries two.
import { applyFontPair, basePair, fontPairList } from '../src/index.js';
import { rule } from '../src/rules/type.js';
import { load } from './fixtures.js';

const withPairs = (pairs) => {
  const spec = JSON.parse(JSON.stringify(load('stripe')));
  spec.typography.pairs = pairs;
  return spec;
};

describe('MD-TYPE font pairs', () => {
  it('no pairs given: the Mood has none (no pair is made up)', () => {
    const res = rule(load('stripe'));
    expect(res.patch.type.pairs).toBeUndefined();
    expect(Object.keys(res.provenance).filter((p) => p.startsWith('/type/pairs'))).toEqual([]);
  });

  it('pairs naming faces of the brand are kept with provenance', () => {
    const res = rule(
      withPairs([
        { id: 'mono-heads', label: 'Mono headings', heading: 'mono', body: 'body' },
        { id: 'all-heading', heading: 'heading', body: 'heading' },
      ]),
    );
    expect(res.patch.type.pairs).toEqual([
      { id: 'mono-heads', label: 'Mono headings', heading: 'mono', body: 'body' },
      { id: 'all-heading', heading: 'heading', body: 'heading' },
    ]);
    expect(res.provenance['/type/pairs/0']).toMatchObject({ rule: 'MD-TYPE', from: ['/typography/pairs/0'] });
    expect(res.provenance['/type/pairs/1'].note).toMatch(/heading face "heading", body face "heading"/);
  });

  it('a pair naming an unknown face, without an id or defined twice is left out with a warning (negative)', () => {
    const res = rule(
      withPairs([
        { id: 'a', heading: 'mono', body: 'body' },
        { id: 'a', heading: 'heading', body: 'body' },
        { id: 'ghost', heading: 'serif', body: 'body' },
        { heading: 'mono', body: 'body' },
      ]),
    );
    expect(res.patch.type.pairs.map((p) => p.id)).toEqual(['a']);
    const msgs = res.warnings.map((w) => w.message);
    expect(msgs).toContain('font pair "a" is defined twice: the first kept');
    expect(msgs.some((m) => /"ghost": heading face "serif" not in typography.faces/.test(m))).toBe(true);
    expect(msgs).toContain('font pair without an id: ignored');
    expect(rule(withPairs('mono')).warnings.map((w) => w.message)).toContain(
      'typography.pairs is not a list of pairs: ignored',
    );
  });
});

describe('applyFontPair', () => {
  const mood = () => ({
    type: {
      faces: {
        heading: { family: 'Head' },
        body: { family: 'Body' },
        mono: { family: 'Mono' },
        serif: { family: 'Serif' },
      },
      roles: {
        display: { face: 'heading', size: 80 },
        h1: { face: 'heading', size: 60 },
        body: { face: 'body', size: 20 },
        caption: { face: 'body', size: 14 },
        code: { face: 'mono', size: 16 },
      },
      pairs: [
        { id: 'serif', heading: 'serif', body: 'body' },
        { id: 'mono', heading: 'mono', body: 'serif' },
      ],
    },
  });

  it('the roles in the heading face take the pair heading face, those in the body face its body face', () => {
    const m = mood();
    const r = applyFontPair(m, 'mono');
    expect(r.mood.type.roles.display.face).toBe('mono');
    expect(r.mood.type.roles.h1.face).toBe('mono');
    expect(r.mood.type.roles.body.face).toBe('serif');
    expect(r.mood.type.roles.caption.face).toBe('serif');
    expect(r.mood.type.roles.code.face).toBe('mono'); // another face of the brand: kept
    expect(r.roles.sort()).toEqual(['body', 'caption', 'display', 'h1']);
    expect(m.type.roles.h1.face).toBe('heading'); // not mutated
    expect(basePair(m)).toEqual({ heading: 'heading', body: 'body' });
    expect(fontPairList(m)).toEqual([
      {
        id: 'serif',
        label: 'Serif / Body',
        heading: 'serif',
        body: 'body',
        headingFamily: 'Serif',
        bodyFamily: 'Body',
      },
      {
        id: 'mono',
        label: 'Mono / Serif',
        heading: 'mono',
        body: 'serif',
        headingFamily: 'Mono',
        bodyFamily: 'Serif',
      },
    ]);
  });

  it('one face for headings and body: the heading roles take the heading face, the rest the body face', () => {
    const m = mood();
    for (const r of Object.values(m.type.roles)) if (r.face === 'body') r.face = 'heading';
    const r = applyFontPair(m, 'serif');
    expect(r.mood.type.roles.h1.face).toBe('serif');
    expect(r.mood.type.roles.body.face).toBe('body');
  });

  it('an unknown pair, or a pair naming a face the Mood lacks, throws (negative)', () => {
    expect(() => applyFontPair(mood(), 'nope')).toThrow(/no font pair "nope"/);
    const m = mood();
    m.type.pairs.push({ id: 'bad', heading: 'ghost', body: 'body' });
    expect(() => applyFontPair(m, 'bad')).toThrow(/face the Mood does not have/);
    expect(() => applyFontPair({ type: { roles: {} } }, 'serif')).toThrow();
  });
});
