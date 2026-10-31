import { rule } from '../src/rules/composition.js';
import { load, messages } from './fixtures.js';

describe('MD-COMPOSITION', () => {
  const res = rule(load('stripe'));
  const { composition } = res.patch;

  it('copies composition; opening/closing as kinds', () => {
    expect(composition).toMatchObject({
      density: 'balanced',
      maxAccentsPerSlide: 1,
      titleEverySlide: true,
      opening: ['cover', 'agenda'],
      closing: ['cta'],
    });
    expect(composition.openingSequence).toBeUndefined();
  });

  it('layoutHints keyed by kind; titleStyle -> titleRole', () => {
    expect(composition.layoutHints.cover).toEqual({
      surface: 'page',
      background: 'heroRibbon',
      logo: 'large',
      titleRole: 'display',
      footer: false,
    });
    expect(composition.layoutHints.section).toMatchObject({ surface: 'navy', logo: 'none' });
    expect(composition.layoutHints.kpi).toBeDefined(); // stat -> kpi (D10)
    expect(composition.layoutHints['image-text']).toBeDefined(); // imageText -> image-text (D10)
    expect(messages(res).filter((m) => /unknown layout id/.test(m))).toHaveLength(0);
  });

  it('two layouts on one kind: first kept + warning', () => {
    const b = load('stripe');
    b.brandLayouts.push({ id: 'cover', surface: 'navy', titleStyle: 'h1' });
    const r = rule(b);
    expect(r.patch.composition.layoutHints.cover.surface).toBe('page');
    expect(messages(r)).toContainEqual(expect.stringMatching(/"cover" maps to kind "cover" already hinted/));
  });

  it('absent -> empty patch', () => {
    expect(rule(load('minimal')).patch).toEqual({});
  });
});
