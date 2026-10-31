import { resolve } from '../src/index.js';
import { stripeMood } from './helpers.js';

describe('resolve (tokens -> literals)', () => {
  const mood = stripeMood();
  const page = mood.palette.surfaces.find((s) => s.id === 'page');
  const navy = mood.palette.surfaces.find((s) => s.id === 'navy');
  const warnings = [];
  const R = resolve(mood, page, { warn: (check, message) => warnings.push({ check, message }) });

  it('resolves colour refs: surface roles, semantic, chart, hex, transparent', () => {
    expect(R.color('accent')).toBe('#533AFD');
    expect(R.color('textMuted')).toBe('#50617A');
    expect(resolve(mood, navy).color('textMuted')).toBe('#839BC8');
    expect(R.color('semantic.success')).toBe('#15BE53');
    expect(R.color('chart.1')).toBe('#533AFD');
    expect(R.color('chartMuted')).toBe('#E5EDF5');
    expect(R.color('#abc')).toBe('#AABBCC');
    expect(R.color('transparent')).toBe('#00000000');
  });
  it('an unknown colour ref is undefined with a warning (never a made-up colour)', () => {
    expect(R.color('brandPink')).toBeUndefined();
    expect(warnings).toContainEqual({ check: 'token', message: 'unknown colour ref "brandPink"' });
  });
  it('radius by name, custom brand names too (G3); unknown -> 0 + warning', () => {
    expect(R.radius('md')).toBe(8);
    expect(R.radius(5)).toBe(5);
    expect(R.radius('tile')).toBe(6);
    expect(R.radius('button')).toBe(4);
    expect(warnings.some((w) => /radius "tile"/.test(w.message))).toBe(false);
    expect(R.radius('blob')).toBe(0);
    expect(warnings.some((w) => /radius "blob"/.test(w.message))).toBe(true);
  });
  it('G2: brand colour names resolve from palette.brand (stripe textOverImage overlay primary -> #533AFD)', () => {
    expect(mood.decor.imagery.textOverImage.overlay).toBe('primary');
    expect(R.color(mood.decor.imagery.textOverImage.overlay)).toBe('#533AFD');
    expect(R.color('secondary')).toBe('#0D1738');
    expect(R.color('tertiary')).toBe('#F44BCC');
    expect(R.color('accent')).toBe(page.accent.toUpperCase()); // a surface role first
    const w = [];
    const noBrand = structuredClone(mood);
    delete noBrand.palette.brand;
    expect(
      resolve(noBrand, page, { warn: (check, message) => w.push(message) }).color('primary'),
    ).toBeUndefined();
    expect(w).toContain('palette.brand has no "primary"');
  });
  it('shadow and spacing', () => {
    expect(R.shadow('card')).toEqual({ x: 0, y: 15, blur: 35, spread: 0, color: '#3C4257', opacity: 0.08 });
    expect(R.shadow('none')).toBeUndefined();
    expect(R.spacing('lg')).toBe(32);
    expect(R.spacing(7)).toBe(7);
  });
  it('font(role) carries the face family, role colour and metrics', () => {
    const h1 = R.font('h1');
    expect(h1).toMatchObject({
      family: 'Sohne',
      size: 56,
      weight: 300,
      lineHeight: 1.1,
      letterSpacing: -0.02,
      case: 'none',
      color: '#061B31',
    });
    expect(h1.metrics.ascent).toBe(1.04);
    expect(R.font('nope')).toBeNull();
  });

  it('a literal role colour below 3:1 on the surface takes the surface text colour (info); surface roles never change', () => {
    const m = structuredClone(mood);
    m.type.roles.h3.color = '#0D1738'; // a dark literal, fine on page, unreadable on navy
    const said = [];
    const onNavy = resolve(m, navy, { warn: (check, message, severity) => said.push({ check, severity }) });
    expect(onNavy.font('h3').color).toBe(navy.text.toUpperCase());
    expect(said).toContainEqual({ check: 'contrast', severity: 'info' });
    expect(resolve(m, page).font('h3').color).toBe('#0D1738'); // negative: readable on page, kept
    m.type.roles.h3.color = 'bg'; // a surface role is the brand's choice for that surface
    expect(resolve(m, navy).font('h3').color).toBe(navy.bg.toUpperCase());
  });
});
