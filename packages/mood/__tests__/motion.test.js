import { familyOf, rule } from '../src/rules/motion.js';
import { load } from './fixtures.js';

describe('MD-MOTION', () => {
  it('stripe: fade at 300ms -> soft; keys copied', () => {
    const res = rule(load('stripe'));
    expect(res.patch.motion).toEqual({
      family: 'soft',
      transition: 'fade',
      build: 'none',
      duration: 300,
      easing: 'ease-out',
      stagger: 80,
    });
    expect(res.provenance['/motion/family'].from).toEqual(['/motion/transition', '/motion/duration']);
  });

  it('family table', () => {
    expect(familyOf('none', 300)).toBe('calm');
    expect(familyOf('wipe', 180)).toBe('crisp');
    expect(familyOf('fade', 150)).toBe('crisp');
    expect(familyOf('dissolve', 250)).toBe('soft');
    expect(familyOf('fade', 220)).toBe('neutral');
    expect(familyOf('zoom', 400)).toBe('neutral');
  });

  it('no motion block -> absent', () => {
    expect(rule(load('minimal')).patch).toEqual({});
  });

  it('block without transition or duration -> no family + warning', () => {
    const b = load('minimal');
    b.motion = { easing: 'linear' };
    const r = rule(b);
    expect(r.patch.motion).toEqual({ easing: 'linear' });
    expect(r.warnings).toHaveLength(1);
  });
});
