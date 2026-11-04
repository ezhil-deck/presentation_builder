/**
 * C3 (docs/PLAN-catalogue.md): the combination key (catalogue-key.js) - the plan's bands at their edges, the nearest
 * band for a text outside every band, block order, summary chars vs catalogue bands, and negative tests; C4: the
 * nearest record for a slide no record keys (the fallback warning).
 */
import {
  BANDS,
  bandDistance,
  bandOf,
  blockBands,
  combinationKey,
  combinationShape,
  keyDistance,
  nearestKey,
} from '../src/catalogue-key.js';

describe('the plan bands', () => {
  it('holds the plan text bands and the three the spec strings add', () => {
    expect(BANDS.heading).toEqual([
      [1, 20],
      [21, 60],
    ]);
    expect(BANDS.description.map(([a, b]) => `${a}-${b}`)).toEqual(['1-70', '71-140', '141-220']);
    expect(BANDS.body.map(([a, b]) => `${a}-${b}`)).toEqual(['1-70', '71-140', '141-220']);
    expect(BANDS.value.map(([a, b]) => `${a}-${b}`)).toEqual(['1-6', '7-12']);
    expect(BANDS.bullet.map(([a, b]) => `${a}-${b}`)).toEqual(['1-70', '71-220']);
    expect(BANDS.paragraph.map(([a, b]) => `${a}-${b}`)).toEqual(['1-80', '81-400']);
  });

  it('puts a length on its band at the edges', () => {
    expect(bandOf('heading', 1)).toBe('1-20');
    expect(bandOf('heading', 20)).toBe('1-20');
    expect(bandOf('heading', 21)).toBe('21-60');
    expect(bandOf('heading', 60)).toBe('21-60');
    expect(bandOf('value', 6)).toBe('1-6');
    expect(bandOf('value', 7)).toBe('7-12');
    expect(bandOf('paragraph', 80)).toBe('1-80');
    expect(bandOf('paragraph', 81)).toBe('81-400');
    expect(bandOf('description', 140)).toBe('71-140');
    expect(bandOf('description', 141)).toBe('141-220');
  });

  it('takes the nearest band for a length outside every band', () => {
    expect(bandOf('heading', 0)).toBe('1-20');
    expect(bandOf('heading', 75)).toBe('21-60');
    expect(bandOf('description', 400)).toBe('141-220');
    expect(bandOf('value', 30)).toBe('7-12');
  });

  it('throws on an unknown field (negative)', () => {
    expect(() => bandOf('colour', 10)).toThrow(/unknown field "colour"/);
    expect(() => combinationKey([{ type: 'items', nodes: 2, bands: { colour: '1-20' } }])).toThrow(
      /unknown field "colour"/,
    );
    expect(() => combinationKey([{ type: 'items', nodes: 2, bands: { heading: '1-30' } }])).toThrow(
      /no band "1-30"/,
    );
    expect(() => combinationKey([{ type: 'slideshow', nodes: 2 }])).toThrow(/unknown block type/);
  });
});

describe('combinationKey', () => {
  const items = { type: 'items', nodes: 2, chars: { heading: 18, body: 64, icon: 6 } };
  const points = { type: 'points', nodes: 4, chars: { text: 70 } };

  it('keys block types in written order, counts and the band of every field', () => {
    expect(combinationKey([items, points])).toBe(
      'items:2(heading 1-20,description 1-70)+points:4(bullet 1-70)',
    );
    expect(combinationKey([points, items])).toBe(
      'points:4(bullet 1-70)+items:2(heading 1-20,description 1-70)',
    );
    expect(combinationShape([items, points])).toBe('items:2+points:4');
  });

  it('reads catalogue bands and summary chars alike', () => {
    const cat = [
      { type: 'items', nodes: 2, bands: { description: '1-70', heading: '1-20' } },
      { type: 'points', nodes: 4, bands: { bullet: '1-70' } },
    ];
    expect(combinationKey(cat)).toBe(combinationKey([items, points]));
  });

  it('sums lists and keys counted blocks without bands', () => {
    expect(blockBands({ type: 'timeline', nodes: 3, chars: { heading: 12, body: 50, lines: 40 } })).toEqual({
      heading: '1-20',
      description: '71-140',
    });
    expect(combinationKey([{ type: 'chart', nodes: 4 }])).toBe('chart:4');
    expect(combinationKey([])).toBe('title');
  });

  it('reads a KPI value with one line under it as value + body (plans 36-38)', () => {
    expect(blockBands({ type: 'kpis', nodes: 4, chars: { value: 4, heading: 44 } })).toEqual({
      value: '1-6',
      body: '1-70',
    });
    expect(blockBands({ type: 'kpis', nodes: 4, chars: { value: 4, heading: 12, body: 44 } })).toEqual({
      value: '1-6',
      heading: '1-20',
      body: '1-70',
    });
  });

  it('measures band distance: 2 a step, +1 when the catalogue band is the shorter, 3 for a lone field', () => {
    const slide = [{ type: 'items', nodes: 2, chars: { heading: 40, body: 64 } }];
    expect(
      bandDistance([{ type: 'items', nodes: 2, bands: { heading: '1-20', description: '1-70' } }], slide),
    ).toBe(3);
    expect(
      bandDistance([{ type: 'items', nodes: 2, bands: { heading: '21-60', description: '141-220' } }], slide),
    ).toBe(4);
    expect(bandDistance([{ type: 'items', nodes: 2, bands: { heading: '21-60' } }], slide)).toBe(3);
  });
});

describe('nearestKey (C4: the fallback warning)', () => {
  const rec = (id, combination) => ({ id, combination });
  const records = [
    rec('a', [{ type: 'points', nodes: 3, bands: { bullet: '71-220' } }]),
    rec('b', [
      { type: 'items', nodes: 3, bands: { heading: '1-20', description: '1-70' } },
      { type: 'paragraph', nodes: 1, bands: { paragraph: '1-80' } },
    ]),
    rec('c', [{ type: 'items', nodes: 4, bands: { heading: '1-20', description: '1-70' } }]),
    rec('d', [{ type: 'items', nodes: 3, bands: { heading: '21-60', description: '1-70' } }]),
    rec('e', [{ type: 'items', nodes: 3, bands: { heading: '1-20', description: '71-140' } }]),
  ];
  const items = (nodes, heading = 12, body = 50) => ({ type: 'items', nodes, chars: { heading, body } });

  it('measures type differences (order ignored), count difference and band distance of the paired blocks', () => {
    expect(keyDistance(records[1].combination, [items(3)])).toEqual({ types: 1, counts: 0, bands: 0 });
    expect(keyDistance(records[2].combination, [items(3)])).toEqual({ types: 0, counts: 1, bands: 0 });
    expect(keyDistance(records[3].combination, [items(3)])).toEqual({ types: 0, counts: 0, bands: 2 });
    // pairing by type: a paragraph written first still pairs with the record's paragraph
    expect(
      keyDistance(records[1].combination, [{ type: 'paragraph', nodes: 1, chars: { text: 40 } }, items(3)]),
    ).toEqual({ types: 0, counts: 0, bands: 0 });
    expect(keyDistance([], [])).toEqual({ types: 0, counts: 0, bands: 0 });
  });

  it('takes the fewest type differences, then the count, then the band distance; a tie keeps catalogue order', () => {
    // items:3 with a 40-character heading: d (heading 21-60) is the band neighbour, e two fields away
    expect(nearestKey(records, [items(3, 40)]).record.id).toBe('d');
    // items:3 with a long description: e's own bands
    expect(nearestKey(records, [items(3, 12, 90)]).record.id).toBe('e');
    // items:3 with short fields: d (a longer heading) and e (a longer description) tie at 2: the first in order wins
    expect(nearestKey(records, [items(3)]).distance).toEqual({ types: 0, counts: 0, bands: 2 });
    expect(nearestKey(records, [items(3)]).record.id).toBe('d');
    // a count no record has: the nearest count of the same blocks before a record of other blocks
    expect(nearestKey(records, [items(5)]).record.id).toBe('c');
    // points + items: no record has both; the one block type away comes first (a: points)
    expect(
      nearestKey(records, [{ type: 'points', nodes: 3, chars: { text: 100 } }, items(9)]).record.id,
    ).toBe('a');
  });

  it('returns null without records and throws on an unknown block type (negative)', () => {
    expect(nearestKey([], [items(3)])).toBeNull();
    expect(nearestKey(undefined, [items(3)])).toBeNull();
    expect(() => nearestKey(records, [{ type: 'slideshow', nodes: 2 }])).toThrow(/unknown block type/);
  });
});
