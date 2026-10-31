import { contrast, hexToRgb, relativeLuminance, toneOf } from '../src/color.js';

describe('color (WCAG)', () => {
  it('luminance of white and black', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBe(0);
  });
  it('contrast black/white is 21, symmetric, rounded to 2 decimals', () => {
    expect(contrast('#000000', '#FFFFFF')).toBe(21);
    expect(contrast('#061B31', '#FFFFFF')).toBe(contrast('#FFFFFF', '#061B31'));
    expect(contrast('#767676', '#FFFFFF')).toBe(4.54);
  });
  it('tone: dark when white contrasts at least as well as black', () => {
    expect(toneOf('#0D1738')).toBe('dark');
    expect(toneOf('#F8FAFD')).toBe('light');
  });
  it('ignores alpha, rejects non-hex', () => {
    expect(hexToRgb('#11223380')).toEqual({ r: 17, g: 34, b: 51 });
    expect(() => hexToRgb('red')).toThrow();
  });
});
