import { languageOf, parseShadow, rule } from '../src/rules/shape.js';
import { load, messages } from './fixtures.js';

describe('MD-SHAPE', () => {
  const res = rule(load('stripe'));
  const { shape } = res.patch;

  it('radius from the scale (same-named step first), language from the largest named step', () => {
    // canonical steps + every brand step under its own name (G3)
    expect(shape.radius).toEqual({ none: 0, sm: 6, md: 8, lg: 12, pill: 9999, xs: 4, button: 4, tile: 6 });
    expect(shape.language).toBe('soft'); // max(none, xs, sm, md, lg) = 12
    expect(res.provenance['/shape/language'].note).toMatch(/largest named radius 12/);
  });

  it('border width from cards.style.border.width; shadows parsed', () => {
    expect(shape.borderWidth).toBe(1);
    // D2: the input gives shadow objects; copied as {x,y,blur,spread,color,opacity}
    expect(shape.shadow.card).toEqual({ x: 0, y: 15, blur: 35, spread: 0, color: '#3C4257', opacity: 0.08 });
  });

  it('divider: thickness -> weight, solid -> line (kept as lineStyle)', () => {
    expect(shape.divider).toEqual({
      style: 'line',
      lineStyle: 'solid',
      weight: 1,
      color: 'border',
      length: 'full',
    });
  });

  it('minimal: sharp; xs used for sm only when sm is absent; full for pill', () => {
    expect(rule(load('minimal')).patch.shape.language).toBe('sharp');
    const b = load('minimal');
    b.layout.radiusScale = { xs: 4, md: 24, full: 999 };
    const s = rule(b).patch.shape;
    expect(s.radius).toEqual({ sm: 4, md: 24, pill: 999, xs: 4, full: 999 });
    expect(s.language).toBe('round');
  });

  it('languageOf thresholds', () => {
    expect([languageOf(0), languageOf(2), languageOf(3), languageOf(16), languageOf(17)]).toEqual([
      'sharp',
      'sharp',
      'soft',
      'soft',
      'round',
    ]);
  });

  it('parseShadow: CSS string, object, and unreadable', () => {
    expect(parseShadow('0 4px 12px #00000033')).toEqual({
      x: 0,
      y: 4,
      blur: 12,
      spread: 0,
      color: '#00000033',
    });
    expect(parseShadow({ x: 0, y: 2, blur: 6, spread: 0, color: '#000000', opacity: 0.1 })).toEqual({
      x: 0,
      y: 2,
      blur: 6,
      spread: 0,
      color: '#000000',
      opacity: 0.1,
    });
    expect(parseShadow('inset 0 1px 2px #000')).toBeNull();
    expect(parseShadow('0 1px 2px #000, 0 2px 4px #111')).toBeNull();
  });

  it('negatives: unreadable shadow warned + dropped; none != 0 dropped; no radius scale -> optional question', () => {
    const b = load('minimal');
    b.layout.shadowScale = { soft: 'big and blurry' };
    b.layout.radiusScale = { none: 3, sm: 2 };
    const r = rule(b);
    expect(r.patch.shape.shadow).toBeUndefined();
    expect(r.patch.shape.radius.none).toBeUndefined();
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/shadow "soft" could not be read/),
        expect.stringMatching(/radiusScale.none is 3/),
      ]),
    );
    delete b.layout.radiusScale;
    expect(rule(b).questions).toContainEqual(
      expect.objectContaining({ pointer: '/layout/radiusScale', severity: 'optional' }),
    );
  });

  it('G3: custom radius names kept verbatim (stripe tile 6, button 4); provenance names the brand step', () => {
    expect(shape.radius.tile).toBe(6);
    expect(shape.radius.button).toBe(4);
    expect(res.provenance['/shape/radius/tile'].from).toEqual(['/layout/radiusScale/tile']);
  });

  it('G3 negative: a non-number step is not carried; none other than 0 still dropped', () => {
    const b = load('stripe');
    b.layout.radiusScale.chip = 'round';
    b.layout.radiusScale.none = 2;
    const s = rule(b).patch.shape;
    expect(s.radius.chip).toBeUndefined();
    expect(s.radius.none).toBeUndefined();
  });
});
