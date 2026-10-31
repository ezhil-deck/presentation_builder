import * as check from '../src/checks/overflow.js';
import { deck, golden, slide, text } from './fixtures.js';

const F = { x: 200, y: 200, w: 400, h: 100 };

describe('check overflow', () => {
  it('warns on fit.overflow and on an element overflow warning (table), with the refit fix', () => {
    const table = {
      id: 's1-table',
      type: 'table',
      frame: F,
      table: { rows: [['a']] },
      warnings: [{ check: 'overflow', message: 'table cells overflow by 12 px' }],
    };
    const d = deck([slide('s1', [text('s1-body', F, { overflow: true, size: 24 }), table])]);
    const r = check.run({ deck: d });
    expect(r.status).toBe('warn');
    expect(r.items).toEqual([
      expect.objectContaining({
        severity: 'warn',
        slide: 's1',
        index: 1,
        elementId: 's1-body',
        message: 'text "s1-body" (role body) overflows its 400 × 100 px box at 24 px',
        fix: { command: 'refit' },
      }),
      expect.objectContaining({ elementId: 's1-table', message: 'table cells overflow by 12 px' }),
    ]);
  });

  it('passes fitted text and every golden deck', () => {
    expect(check.run({ deck: deck([slide('s1', [text('t', F)])]) }).status).toBe('pass');
    expect(check.run({ deck: golden('cisco').deck }).status).toBe('pass');
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
