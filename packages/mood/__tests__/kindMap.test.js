import { KIND_MAP, toKind } from '../src/kindMap.js';

describe('kind map', () => {
  it.each([
    ['title', 'cover'],
    ['closing', 'cta'],
    ['sectionBands', 'section'],
    ['content', 'bullets'],
    ['twoColumn', 'two-column'],
    ['imageBleed', 'image'],
    ['logoWall', 'logos'],
    ['statement', 'text'],
    ['stat', 'kpi'],
    ['imageText', 'image-text'],
  ])('%s -> %s', (id, kind) => {
    expect(toKind(id)).toEqual({ kind, known: true });
  });

  it('unknown ids are kept verbatim and flagged', () => {
    expect(toKind('mosaic')).toEqual({ kind: 'mosaic', known: false });
    expect(toKind('Title')).toEqual({ kind: 'Title', known: false });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(KIND_MAP)).toBe(true);
  });
});

describe('kind map vs schemas/layout.schema.json', () => {
  it('every kind the map produces is a layout kind (D10: image-text added)', () => {
    const { readJson } = require('./fixtures.js');
    const kinds = readJson('..', '..', '..', 'schemas', 'layout.schema.json').$defs.kind.enum;
    for (const kind of new Set(Object.values(KIND_MAP))) expect(kinds).toContain(kind);
  });
});

describe('G1: brandIdFor / catalogue kinds', () => {
  const { CATALOGUE_KINDS, brandIdFor, brandVocabulary, kindsViaContent } = require('../src/kindMap.js');
  const VOCAB = ['title', 'agenda', 'section', 'content', 'twoColumn', 'cards', 'stat', 'chart', 'imageText'];

  it('the hard-coded catalogue kinds equal packages/layouts KINDS (no drift)', async () => {
    const { KINDS: LAYOUT_KINDS } = await import('../../layouts/src/catalogue.js');
    expect([...CATALOGUE_KINDS]).toEqual([...LAYOUT_KINDS]);
  });

  it.each([
    ['bullets', 'content'],
    ['cover', 'title'],
    ['kpi', 'stat'],
    ['two-column', 'twoColumn'],
    ['steps', 'content'],
    ['timeline', 'content'],
    ['team', 'content'],
    ['diagram', 'content'],
    ['table', 'content'],
    ['cta', null],
    ['image', null],
  ])('%s -> %s', (kind, id) => {
    expect(brandIdFor(kind, VOCAB)).toBe(id);
  });

  it('section never falls back; an exact id wins over content', () => {
    expect(brandIdFor('section', ['content'])).toBeNull();
    expect(brandIdFor('team', [...VOCAB, 'people'])).toBe('people');
  });

  it('kindsViaContent excludes the kind content itself maps to and every exact kind', () => {
    expect(kindsViaContent(VOCAB)).toEqual(['text', 'steps', 'timeline', 'table', 'quote', 'team', 'logos']);
  });

  it('brandVocabulary reads every place a brand names a layout id, once each, in order', () => {
    expect(
      brandVocabulary({
        brandLayouts: [{ id: 'title' }, { id: 'content' }],
        logos: { perLayout: { content: 'small', team: 'none' } },
        decor: { elements: [{ allowedOn: ['quote', 'title'] }] },
        layout: { footer: { hideOn: ['closing'] } },
        composition: { openingSequence: ['agenda'] },
      }),
    ).toEqual(['title', 'content', 'team', 'quote', 'closing', 'agenda']);
  });
});
