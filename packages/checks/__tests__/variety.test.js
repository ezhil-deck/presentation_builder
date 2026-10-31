import * as check from '../src/checks/variety.js';
import { deck, golden, mood, slide } from './fixtures.js';

const run = (surfaces) => surfaces.map((s, i) => slide(`s${i + 1}`, [], { surfaceId: s }));

describe('check variety', () => {
  it('warns when every content slide shares one surface, and on a run longer than rhythm length + 1', () => {
    const d = deck([
      slide('s0', [], { kind: 'cover', surfaceId: 'dark' }),
      ...run(['light', 'light', 'light', 'light']),
    ]);
    const r = check.run({ deck: d, mood: mood() });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => i.message)).toEqual([
      'all 4 content slides use one surface ("light")',
      '4 consecutive content slides share surface "light" (more than rhythm length 2 + 1)',
    ]);
    expect(r.items[1]).toMatchObject({
      slide: 's1',
      index: 2,
      data: { length: 4, max: 3, slides: [2, 3, 4, 5] },
    });
  });

  it('passes a deck that follows the rhythm (cover / section / cta are not content slides)', () => {
    const d = deck([
      ...run(['light', 'dark', 'light']),
      slide('x', [], { kind: 'section', surfaceId: 'light' }),
      ...run(['light', 'light']).map((s, i) => ({ ...s, id: `y${i}` })),
    ]);
    expect(check.run({ deck: d, mood: mood() })).toEqual({ status: 'pass', items: [] });
    expect(check.run(golden('stripe')).status).toBe('pass');
  });

  it('skips when the rhythm names one surface or the brand gives one surface', () => {
    expect(check.run(golden('cisco'))).toMatchObject({
      status: 'skip',
      reason: 'palette.rhythm names one surface ("black")',
    });
    const one = mood({ palette: { surfaces: [{ id: 'light' }], rhythm: ['light'] } });
    expect(check.run({ deck: deck(run(['light'])), mood: one })).toMatchObject({
      status: 'skip',
      reason: 'the brand gives one surface',
    });
  });
});
