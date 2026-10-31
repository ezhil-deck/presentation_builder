import * as check from '../src/checks/text-overlap.js';
import { deck, golden, slide, text } from './fixtures.js';

describe('check text-overlap', () => {
  it('warns when two text frames intersect by more than 2 px on both axes', () => {
    const d = deck([
      slide('s1', [
        text('s1-a', { x: 100, y: 100, w: 400, h: 100 }),
        text('s1-b', { x: 450, y: 150, w: 400, h: 100 }),
        text('s1-c', { x: 100, y: 198, w: 400, h: 100 }), // 2 px: touching, not overlapping
        text('s1-decor', { x: 100, y: 100, w: 400, h: 100 }, { boxRole: 'decor' }),
      ]),
    ]);
    const r = check.run({ deck: d });
    expect(r.status).toBe('warn');
    expect(r.items).toEqual([
      expect.objectContaining({
        elementId: 's1-a',
        message: 'text "s1-a" and text "s1-b" overlap by 50 × 50 px',
        data: { other: 's1-b', overlap: { w: 50, h: 50 } },
      }),
      expect.objectContaining({ elementId: 's1-b', data: expect.objectContaining({ other: 's1-c' }) }),
    ]);
  });

  it('passes separate boxes and the golden decks', () => {
    const d = deck([
      slide('s1', [
        text('a', { x: 100, y: 100, w: 400, h: 100 }),
        text('b', { x: 100, y: 300, w: 400, h: 100 }),
      ]),
    ]);
    expect(check.run({ deck: d })).toEqual({ status: 'pass', items: [] });
    expect(check.run(golden('notion')).status).toBe('pass');
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
