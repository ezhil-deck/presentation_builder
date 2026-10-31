import * as check from '../src/checks/assets.js';
import { deck, filesOf, golden, image, mood, slide } from './fixtures.js';

const F = { x: 200, y: 200, w: 400, h: 300 };

describe('check assets', () => {
  it('fails on an asset id deck.assets does not list (image, animated, background)', () => {
    const d = deck(
      [
        slide('s1', [image('s1-img', F, 'a1', { animated: 'nope' }), image('s1-img2', F, 'missing')], {
          background: { type: 'image', asset: 'gone' },
        }),
      ],
      { assets: { a1: { file: 'assets/a.png' } } },
    );
    const r = check.run({ deck: d });
    expect(r.status).toBe('fail');
    expect(r.items.filter((i) => i.severity === 'fail').map((i) => i.data.asset)).toEqual([
      'gone',
      'nope',
      'missing',
    ]);
  });

  it('with files: a missing asset file and a missing logo variant file fail', () => {
    const d = deck([slide('s1', [image('s1-img', F, 'a1')])], { assets: { a1: { file: 'assets/a.png' } } });
    const m = mood({ logo: { variants: { full: { file: 'logo.svg' }, light: { file: 'logo-light.svg' } } } });
    const r = check.run({ deck: d, mood: m, files: filesOf(['logo.svg']) });
    expect(r.status).toBe('fail');
    expect(r.items.map((i) => i.message)).toEqual([
      'asset file assets/a.png (asset "a1") is missing from the brand folder',
      'logo variant "light" file logo-light.svg is missing from the brand folder',
    ]);
    const ok = check.run({
      deck: d,
      mood: m,
      files: filesOf(['logo.svg', 'logo-light.svg', 'assets/a.png']),
    });
    expect(ok).toEqual({ status: 'pass', items: [] });
  });

  it('passes a golden deck; without files the file part is an info item, not a failure', () => {
    const { deck: d, mood: m } = golden('stripe');
    const r = check.run({ deck: d, mood: m });
    expect(r.status).toBe('pass');
    expect(r.items).toEqual([expect.objectContaining({ severity: 'info' })]);
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
