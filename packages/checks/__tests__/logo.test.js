import * as check from '../src/checks/logo.js';
import { deck, golden, image, mood, slide, text } from './fixtures.js';

const logoMood = (extra = {}) =>
  mood({
    logo: {
      variants: { full: { file: 'logo.svg' } },
      perKind: { cover: 'large', text: 'small', section: 'none' },
      height: { small: 40 },
      clearSpace: 20,
      position: 'top-left',
      ...extra,
    },
  });

describe('check logo', () => {
  it('warns on a missing logo, a logo below logo.height, and an element inside the clear space', () => {
    const d = deck([
      slide('s1', [], { kind: 'cover' }),
      slide('s2', [
        image('s2-logo', { x: 100, y: 80, w: 90, h: 30 }, 'l', { role: 'logo' }),
        text('s2-title', { x: 200, y: 90, w: 600, h: 80 }, { height: 40 }),
      ]),
      slide('s3', [], { kind: 'section' }),
    ]);
    const r = check.run({ deck: d, mood: logoMood() });
    expect(r.status).toBe('warn');
    expect(r.items.map((i) => i.message)).toEqual([
      'no logo on this cover slide (logo.perKind.cover = large)',
      'logo "s2-logo" is 30 px tall, below logo.height.small 40 px',
      'text "s2-title" is inside the clear space (20 px) of logo "s2-logo"',
    ]);
  });

  it('the footer logo stands in for a small slide logo; an image the logo sits on is its backdrop', () => {
    const d = deck([
      slide('s1', [
        image('s1-photo', { x: 0, y: 0, w: 1920, h: 1080 }, 'p'),
        text('s1-body', { x: 100, y: 100, w: 600, h: 800 }, { height: 200 }),
        image('s1-footer-logo', { x: 100, y: 1010, w: 120, h: 40 }, 'l', { role: 'footer' }),
      ]),
    ]);
    // the body's text block (fit.height) ends far above the logo, though its frame reaches it
    expect(check.run({ deck: d, mood: logoMood() })).toEqual({ status: 'pass', items: [] });
    expect(check.run(golden('stripe')).status).toBe('pass');
    expect(check.run(golden('hdfc-2')).status).toBe('pass');
  });

  it('skips when the Mood gives no logo.perKind', () => {
    expect(check.run({ deck: deck([slide('s1', [])]), mood: mood() })).toMatchObject({ status: 'skip' });
  });
});
