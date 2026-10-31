import * as check from '../src/checks/min-size.js';
import { deck, golden, mood, slide, text } from './fixtures.js';

const F = { x: 200, y: 200, w: 400, h: 100 };

describe('check min-size', () => {
  it("warns below the role's fit.min, and below the brand's absolute floor", () => {
    const d = deck([
      slide('s1', [
        text('s1-small', F, { size: 20 }),
        text('s1-tiny', F, { size: 12, role: 'caption' }),
        text('s1-ok', F, { size: 24 }),
      ]),
    ]);
    const r = check.run({ deck: d, mood: mood(), brandSpec: { accessibility: { minFontSize: 14 } } });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => i.message)).toEqual([
      'text "s1-small" is 20 px, below its role body\'s minimum 24 px',
      'text "s1-tiny" is 12 px, below the brand\'s minimum text size 14 px (accessibility.minFontSize)',
    ]);
  });

  it('passes a golden deck (sizes at or above fit.min and the brand floor)', () => {
    const g = golden('akgmedia');
    expect(check.run(g)).toEqual({ status: 'pass', items: [] });
  });

  it('skips when no role gives fit.min and the brand gives no floor', () => {
    const d = deck([slide('s1', [text('t', F, { size: 8 })])]);
    expect(check.run({ deck: d, mood: mood({ type: { roles: { body: { size: 32 } } } }) })).toMatchObject({
      status: 'skip',
    });
  });
});
