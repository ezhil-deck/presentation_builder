import * as check from '../src/checks/compose.js';
import { deck, golden, slide } from './fixtures.js';

describe('check compose', () => {
  it('lists deck warnings no other check represents, severity error → fail, grouped by check id', () => {
    const d = deck([slide('s1', []), slide('s2', [])], {
      warnings: [
        {
          check: 'table',
          message: 'no tableHeader role',
          severity: 'error',
          slide: 's2',
          elementId: 's2-table',
        },
        { check: 'logo', message: 'logo.height.large not given', severity: 'info', slide: 's1' },
        { check: 'bold', message: 'face has no bold file', severity: 'info', slide: 's2' },
        { check: 'overflow', message: 'overflow (the overflow check)', severity: 'warn', slide: 's1' },
        { check: 'contrast', message: 'guard note (the contrast check)', severity: 'info', slide: 's1' },
        {
          check: 'decor-overlap',
          message: 'decor "x" overlaps (the decor check)',
          severity: 'info',
          slide: 's1',
        },
        { check: 'logo-clearspace', message: 'clear space (the logo check)', severity: 'warn', slide: 's1' },
        { check: 'font-metrics', message: 'no metrics (the fonts check)', severity: 'error', slide: 's1' },
      ],
    });
    const r = check.run({ deck: d });
    expect(r.status).toBe('fail');
    expect(r.items.map((i) => [i.severity, i.data.check, i.index])).toEqual([
      ['info', 'bold', 2],
      ['info', 'logo', 1],
      ['fail', 'table', 2],
    ]);
    expect(r.items[2].elementId).toBe('s2-table');
  });

  it('passes a deck without warnings and the golden decks (info notes only)', () => {
    expect(check.run({ deck: deck([slide('s1', [])]) })).toEqual({ status: 'pass', items: [] });
    const r = check.run(golden('the-ken'));
    expect(r.status).toBe('pass');
    expect(r.items.length).toBeGreaterThan(0);
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
