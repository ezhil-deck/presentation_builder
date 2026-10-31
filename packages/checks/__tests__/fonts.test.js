import * as check from '../src/checks/fonts.js';
import { deck, golden, slide, text } from './fixtures.js';

const F = { x: 200, y: 200, w: 400, h: 100 };

describe('check fonts', () => {
  it('fails a family with no files and a family missing from deck.fonts; warns on a weight no file declares', () => {
    const d = deck(
      [
        slide('s1', [
          text('a', F, { weight: 600 }),
          text('b', F, { family: 'Ghost' }),
          text('c', F, { family: 'Empty' }),
          text('d', F, { weight: 700 }),
        ]),
      ],
      {},
    );
    d.fonts.push({ family: 'Empty', files: [], fallback: 'Arial' });
    const r = check.run({ deck: d });
    expect(r.status).toBe('fail');
    expect(r.items.map((i) => [i.severity, i.message])).toEqual([
      ['fail', 'font family "Ghost" is used but not listed in deck.fonts'],
      ['fail', 'font family "Empty" has no font files (rendered with Arial)'],
      ['warn', 'font family "Test Sans" has no 600 face: 1 element(s) are measured with the 700 face'],
    ]);
  });

  it('golden hdfc-2: Lato has no files (fail) and the compose font-metrics error is folded in', () => {
    const r = check.run({ deck: golden('hdfc-2').deck });
    expect(r.status).toBe('fail');
    expect(r.items.filter((i) => i.severity === 'fail').map((i) => i.data?.family ?? i.data?.check)).toEqual([
      'Lato',
      'font-metrics',
    ]);
  });

  it('CSS weight matching: 400-500 up to 500 first, light down first, bold up first', () => {
    expect(
      check.matchWeight(450, [
        [400, 400],
        [500, 500],
      ]),
    ).toBe(500);
    expect(
      check.matchWeight(300, [
        [400, 400],
        [200, 200],
      ]),
    ).toBe(200);
    expect(
      check.matchWeight(600, [
        [400, 400],
        [800, 800],
      ]),
    ).toBe(800);
    expect(check.matchWeight(600, [[100, 900]])).toBe(600);
    expect(check.weightRange('100 900')).toEqual([100, 900]);
    expect(check.weightRange(undefined)).toBeNull();
  });

  it('passes a deck whose weights all have files, and a golden deck; files without weight are info', () => {
    expect(check.run({ deck: deck([slide('s1', [text('a', F, { weight: 700 })])]) })).toEqual({
      status: 'pass',
      items: [],
    });
    expect(check.run({ deck: golden('stripe').deck }).status).toBe('pass');
    const notion = check.run({ deck: golden('notion').deck });
    expect(notion.status).toBe('pass');
    expect(notion.items.every((i) => i.severity === 'info')).toBe(true);
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
