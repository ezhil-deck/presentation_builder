import * as check from '../src/checks/contrast.js';
import { deck, golden, image, rect, slide, text } from './fixtures.js';

const F = { x: 200, y: 200, w: 400, h: 100 };

describe('check contrast', () => {
  it('warns below WCAG AA: 4.5:1 for small text, 3:1 for large (24 px, or 18.66 px bold); literal message', () => {
    const d = deck([
      slide('s1', [
        text('s1-small', F, { color: '#8A8A8A', size: 22 }),
        text('s1-large', F, { color: '#999999', size: 48 }),
        text('s1-large-ok', F, { color: '#8A8A8A', size: 48 }),
        text('s1-bold-ok', F, { color: '#8A8A8A', size: 20, weight: 700 }),
      ]),
    ]);
    const r = check.run({ deck: d });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => [i.elementId, i.message])).toEqual([
      ['s1-small', '#8A8A8A on #FFFFFF is 3.45:1 (needs 4.5:1 at 22 px)'],
      ['s1-large', '#999999 on #FFFFFF is 2.84:1 (needs 3:1 at 48 px large)'],
    ]);
    expect(r.items[0].fix).toEqual({ command: 'snap-colour', args: { role: 'body' } });
  });

  it('measures against the nearest filled shape behind the text, blends translucent fills, worst gradient stop', () => {
    const d = deck([
      slide('s1', [
        rect('s1-card', { x: 100, y: 100, w: 800, h: 400 }, '#222222'),
        text('s1-t', F, { color: '#333333' }),
      ]),
      slide('s2', [
        rect('s2-veil', { x: 0, y: 0, w: 1920, h: 1080 }, '#000000', { opacity: 0.5 }),
        text('s2-t', F, { color: '#808080' }),
      ]),
      slide('s3', [text('s3-t', F, { color: '#FFFFFF' })], {
        background: {
          type: 'gradient',
          gradient: {
            stops: [
              { color: '#000000', at: 0 },
              { color: '#EEEEEE', at: 1 },
            ],
          },
        },
      }),
    ]);
    const r = check.run({ deck: d });
    expect(r.items.map((i) => [i.elementId, i.data.background])).toEqual([
      ['s1-t', '#222222'],
      ['s2-t', '#808080'],
      ['s3-t', '#EEEEEE'],
    ]);
  });

  it('an image background with overlay is measured on the overlay; without overlay (or a photo behind) it is an info item', () => {
    const d = deck(
      [
        slide('s1', [text('s1-t', F, { color: '#FFFFFF' })], {
          background: { type: 'image', asset: 'a', overlay: '#000000', overlayOpacity: 0.4 },
        }),
        slide('s2', [text('s2-t', F)], { background: { type: 'image', asset: 'a' } }),
        slide('s3', [image('s3-photo', { x: 0, y: 0, w: 1920, h: 1080 }, 'a'), text('s3-t', F)]),
      ],
      { assets: { a: { file: 'a.jpg' } } },
    );
    const r = check.run({ deck: d });
    expect(r.status).toBe('pass');
    expect(r.items.map((i) => [i.elementId, i.severity, i.data.skipped])).toEqual([
      ['s2-t', 'info', 'image background'],
      ['s3-t', 'info', 'image "s3-photo" behind the text'],
    ]);
  });

  it("the brand's accessibility minimum wins over WCAG", () => {
    const d = deck([slide('s1', [text('s1-t', F, { color: '#595959', size: 22 })])]);
    expect(check.run({ deck: d }).status).toBe('pass'); // 7:1
    const strict = check.run({ deck: d, brandSpec: { accessibility: { minContrastBody: 7.5 } } });
    expect(strict.status).toBe('warn');
    expect(strict.items[0].data.minSource).toBe('accessibility.minContrastBody');
  });

  it('passes clean text and the golden akgmedia deck has no contrast warning', () => {
    expect(check.run({ deck: deck([slide('s1', [text('t', F)])]) })).toEqual({ status: 'pass', items: [] });
    expect(check.run(golden('akgmedia')).status).toBe('pass');
  });

  it('skips without a deck', () => {
    expect(check.run({}).status).toBe('skip');
  });
});
