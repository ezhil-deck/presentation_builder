import * as check from '../src/checks/schema.js';
import { deck, golden, slide, text } from './fixtures.js';

describe('check schema', () => {
  it('fails an invalid deck, one item per schema error', () => {
    const bad = deck([slide('s1', [text('t', { x: 100, y: 100, w: 400, h: 100 })])]);
    delete bad.slides[0].elements[0].frame;
    bad.canvas.width = 1000;
    const r = check.run({ deck: bad });
    expect(r.status).toBe('fail');
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.items.every((i) => i.severity === 'fail')).toBe(true);
    expect(r.items.map((i) => i.data.pointer)).toEqual(
      expect.arrayContaining(['/canvas/width', '/slides/0/elements/0']),
    );
  });

  it('passes a valid handmade deck and a golden deck', () => {
    expect(check.run({ deck: deck([slide('s1', [text('t', { x: 100, y: 100, w: 400, h: 100 })])]) })).toEqual(
      {
        status: 'pass',
        items: [],
      },
    );
    expect(check.run({ deck: golden('stripe').deck }).status).toBe('pass');
  });

  it('skips without a deck', () => {
    expect(check.run({})).toMatchObject({ status: 'skip', reason: 'no deck' });
  });
});
