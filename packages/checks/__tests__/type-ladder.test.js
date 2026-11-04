// Check `type-ladder` (info report, every deck, 2026-11-03): distinct text sizes per slide outside the furniture
// (info when more than five) and the deck's display : body / title : body ratios from the Mood's roles - reported,
// no target, never a proposal.
import * as check from '../src/checks/type-ladder.js';
import { runChecks } from '../src/index.js';
import { deck, golden, slide, text } from './fixtures.js';

const frame = { x: 100, y: 100, w: 400, h: 60 };
const sized = (sizes, extra = []) =>
  slide('s1', [...sizes.map((s, i) => text(`t${i}`, frame, { size: s })), ...extra]);
const moodOf = (roles) => ({
  type: { roles: Object.fromEntries(Object.entries(roles).map(([r, size]) => [r, { size }])) },
});

describe('check type-ladder (info report)', () => {
  it('informs on a slide with more than five text sizes outside the title / footer / eyebrow, and reads the ratios', () => {
    const { mood } = golden('stripe');
    const furniture = [
      text('title', frame, { size: 56, boxRole: 'title' }),
      text('foot', frame, { size: 12, boxRole: 'footer' }),
      text('eye', frame, { size: 14, role: 'eyebrow' }),
    ];
    const d = deck([sized([10, 20, 30, 40, 50, 60], furniture)]);
    const r = check.run({ deck: d, mood });
    expect(r.status).toBe('pass'); // info only
    expect(r.items.map((i) => i.message)).toEqual([
      'display : body is 3.57 : 1 (display 80 / body 22.4 px)',
      'title : body is 2.5 : 1 (h1 56 / body 22.4 px)',
      '6 text sizes outside the title / footer / eyebrow (more than 5): 60, 50, 40, 30, 20, 10 px',
    ]);
    expect(r.items[2]).toMatchObject({ slide: 's1', index: 1, data: { sizes: [60, 50, 40, 30, 20, 10] } });
    expect(r.items[0].data).toEqual({
      ratio: 'display : body',
      role: 'display',
      value: 3.57,
      sizes: { display: 80, body: 22.4 },
    });
  });

  it('negative: five sizes (the furniture not counted) and no Mood give no item', () => {
    const furniture = [
      text('title', frame, { size: 56, boxRole: 'title' }),
      text('eye', frame, { size: 14, role: 'eyebrow' }),
    ];
    const d = deck([sized([10, 20, 30, 40, 50], furniture)]);
    expect(check.run({ deck: d })).toEqual({ status: 'pass', items: [] });
  });

  it('a role the Mood lacks is named, never guessed', () => {
    const r = check.run({ deck: deck([sized([20])]), mood: moodOf({ body: 20, h1: 50 }) });
    expect(r.items.map((i) => i.message)).toEqual([
      'display : body: not read (the Mood has no display role)',
      'title : body is 2.5 : 1 (h1 50 / body 20 px)',
    ]);
    const nb = check.run({ deck: deck([sized([20])]), mood: moodOf({ h1: 50 }) });
    expect(nb.items.map((i) => i.message)).toEqual([
      'display : body: not read (the Mood has no body role)',
      'title : body: not read (the Mood has no body role)',
    ]);
  });

  it('runs on every deck as an info report (golden decks: never a warn, never depends on a proposal)', () => {
    const g = golden('stripe');
    const report = runChecks(g);
    const r = report.results.find((x) => x.id === 'type-ladder');
    expect(r.status).toBe('pass');
    expect(r.items.every((i) => i.severity === 'info')).toBe(true);
    expect(report.results.map((x) => x.id).slice(-1)).toEqual(['type-ladder']);
    expect(check.run({}).status).toBe('skip');
  });
});
