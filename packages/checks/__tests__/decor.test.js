import * as check from '../src/checks/decor.js';
import { deck, golden, image, mood, slide, text } from './fixtures.js';

const decorMood = () =>
  mood({
    decor: {
      elements: [
        {
          id: 'rays',
          file: 'rays.png',
          layer: 'behind',
          allowedOn: ['section'],
          surfaces: ['dark'],
          frequency: 'often',
        },
        { id: 'spark', file: 'spark.png', layer: 'front', allowedOn: ['text'], frequency: 'always' },
        { id: 'rule', type: 'rule', layer: 'front', allowedOn: ['text'], frequency: 'always' },
        { id: 'spare', file: 'x.png', allowedOn: [], frequency: 'always', unused: true },
      ],
    },
  });

const decorEl = (id, name, frame, z = 10) => image(id, frame, 'a', { role: 'decor', name, z });

describe('check decor', () => {
  it('warns on decor off its allowedOn / surfaces, a missing always-decor, and front decor over text', () => {
    const d = deck([
      slide('s1', [decorEl('s1-decor-rays', 'rays', { x: 0, y: 0, w: 100, h: 100 })], { surfaceId: 'light' }),
      slide('s2', [
        text('s2-title', { x: 100, y: 100, w: 600, h: 100 }),
        decorEl('s2-decor-spark', 'spark', { x: 600, y: 120, w: 80, h: 80 }, 60),
      ]),
    ]);
    const r = check.run({ deck: d, mood: decorMood() });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => i.message)).toEqual([
      'decor "rays" is on a text slide, which its allowedOn does not list',
      'decor "rays" is on surface "light", which its surfaces do not list',
      'decor "spark" (frequency always) is missing on this text slide',
      'decor "rule" (frequency always) is missing on this text slide (a drawn element: no file to place)',
      'front decor "spark" covers text "s2-title" by 80 × 80 px',
      'decor "rule" (frequency always) is missing on this text slide (a drawn element: no file to place)',
    ]);
  });

  it('folds the compose decor-overlap notes in as info items; passes well-placed decor', () => {
    const d = deck(
      [
        slide('s1', [decorEl('s1-decor-rays', 'rays', { x: 0, y: 0, w: 100, h: 100 })], {
          kind: 'section',
          surfaceId: 'dark',
        }),
      ],
      {
        warnings: [
          {
            check: 'decor-overlap',
            message: 'decor "rays" overlaps the title box "title"',
            severity: 'info',
            slide: 's1',
          },
        ],
      },
    );
    const r = check.run({ deck: d, mood: decorMood() });
    expect(r.status).toBe('pass');
    expect(r.items).toEqual([
      expect.objectContaining({ severity: 'info', slide: 's1', index: 1, data: { check: 'decor-overlap' } }),
    ]);
    expect(check.run(golden('stripe')).status).toBe('pass');
  });

  it('skips when the Mood gives no decor elements', () => {
    expect(check.run({ deck: deck([slide('s1', [])]), mood: mood() })).toMatchObject({ status: 'skip' });
  });
});
