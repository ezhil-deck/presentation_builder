import * as check from '../src/checks/empty-space.js';
import { contentBox, unionArea } from '../src/util.js';
import { deck, golden, image, mood, slide, text } from './fixtures.js';

describe('check empty-space', () => {
  it('info when the text / image boxes cover less than 35 % of the content frame (text counted by its laid-out block)', () => {
    // content frame 1720 × 920 = 1 582 400 px²
    const d = deck([
      slide('s1', [
        text('s1-title', { x: 100, y: 80, w: 1720, h: 120 }, { height: 80 }),
        text('s1-body', { x: 100, y: 240, w: 1720, h: 700 }, { height: 200 }),
      ]),
      slide('s2', [image('s2-image', { x: 100, y: 80, w: 1000, h: 920 }, 'a')], { kind: 'image-text' }),
      slide('s3', [], { kind: 'cover' }),
    ]);
    const r = check.run({ deck: d, mood: mood() });
    expect(r.status).toBe('pass');
    expect(r.items).toEqual([
      expect.objectContaining({
        severity: 'info',
        slide: 's1',
        index: 1,
        message: 'content covers 30.4 % of the content frame on this text slide (below 35 %)',
        data: { coverage: 0.3, min: 0.35 },
      }),
    ]);
  });

  it('no item when the content fills the frame; golden decks pass', () => {
    const d = deck([slide('s1', [text('s1-body', { x: 100, y: 80, w: 1720, h: 920 }, { height: 600 })])]);
    expect(check.run({ deck: d, mood: mood() })).toEqual({ status: 'pass', items: [] });
    expect(check.run(golden('rukko')).status).toBe('pass');
  });

  it('a text counts as its laid-out block (placed by valign); overlapping boxes count once', () => {
    expect(
      unionArea([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 5, y: 5, w: 10, h: 10 },
      ]),
    ).toBe(175);
    expect(
      contentBox({
        type: 'text',
        frame: { x: 0, y: 0, w: 10, h: 100 },
        text: { fit: { height: 20 }, valign: 'bottom' },
      }),
    ).toEqual({
      x: 0,
      y: 80,
      w: 10,
      h: 20,
    });
  });

  it('skips without geometry.margins', () => {
    expect(check.run({ deck: deck([slide('s1', [])]), mood: mood({ geometry: {} }) })).toMatchObject({
      status: 'skip',
    });
  });
});
