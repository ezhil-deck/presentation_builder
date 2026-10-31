import * as check from '../src/checks/margins.js';
import { deck, golden, image, mood, slide, text } from './fixtures.js';

describe('check margins', () => {
  it('warns on an element partly outside the content frame, with the overshoot per side', () => {
    const d = deck([
      slide('s1', [
        text('s1-title', { x: 60, y: 100, w: 400, h: 100 }),
        text('s1-body', { x: 1500, y: 900, w: 400, h: 150 }),
        image('s1-decor', { x: 0, y: 0, w: 300, h: 300 }, 'a', { role: 'decor' }),
      ]),
    ]);
    const r = check.run({ deck: d, mood: mood() });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => [i.elementId, i.data.overshoot])).toEqual([
      ['s1-title', { left: 40 }],
      ['s1-body', { right: 80, bottom: 50 }],
    ]);
    expect(r.items[0].fix).toEqual({ command: 'move-inside' });
  });

  it('allows logo / footer in the margin when their position is given, and full-bleed image slides', () => {
    const d = deck([
      slide('s1', [
        image('s1-logo', { x: 40, y: 40, w: 100, h: 40 }, 'l', { role: 'logo' }),
        text('s1-footer', { x: 100, y: 1000, w: 100, h: 80 }, { boxRole: 'footer' }),
      ]),
      slide('s2', [image('s2-image', { x: 0, y: 0, w: 1920, h: 1080 }, 'i')], { kind: 'image' }),
    ]);
    const m = mood({
      logo: { variants: {}, position: 'top-left' },
      footer: { show: true, position: 'bottom-left' },
    });
    expect(check.run({ deck: d, mood: m })).toEqual({ status: 'pass', items: [] });
    // without the positions the logo and footer are outside
    expect(check.run({ deck: d, mood: mood() }).items.map((i) => i.elementId)).toEqual([
      's1-logo',
      's1-footer',
    ]);
    expect(check.run(golden('bosch')).status).toBe('pass');
  });

  it('skips without geometry.margins', () => {
    const d = deck([slide('s1', [])]);
    expect(check.run({ deck: d, mood: mood({ geometry: {} }) })).toMatchObject({ status: 'skip' });
  });
});
