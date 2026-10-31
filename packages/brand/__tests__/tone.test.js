import { contrastRatio, parseHex, relativeLuminance, toneOf } from '../src/tone.js';

describe('BR-TONE', () => {
  it('relative luminance of known colours (WCAG)', () => {
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2158605, 6);
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 6);
    expect(relativeLuminance('#00FF00')).toBeCloseTo(0.7152, 6);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 6);
  });

  it('contrast ratio of known pairs', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.4781, 3);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.5422, 3);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('tone: dark when white contrasts at least as much as black', () => {
    expect(toneOf('#FFFFFF')).toBe('light');
    expect(toneOf('#000000')).toBe('dark');
    expect(toneOf('#1A1A2E')).toBe('dark');
    expect(toneOf('#F7F2F2')).toBe('light');
    expect(toneOf('#767676')).toBe('light'); // 4.54 vs white < 4.62 vs black
    expect(toneOf('#FF2A2A')).toBe('light'); // brand red: black text contrasts more
    expect(toneOf('#533AFD')).toBe('dark');
  });

  it('E1: tone from the surface text when given (text lighter than bg -> dark)', () => {
    expect(toneOf('#007BC0', '#FFFFFF')).toBe('dark'); // bosch blue with white text
    expect(toneOf('#F7F2F2', '#1A1A2E')).toBe('light'); // light bg, dark text
    expect(toneOf('#000000', '#FFFFFF')).toBe('dark');
    expect(toneOf('#FFFFFF', '#000000')).toBe('light');
  });

  it('E1: no text -> v1 contrast comparison (differs from the text path on bosch blue)', () => {
    expect(toneOf('#007BC0')).toBe('light'); // black beats white by 0.04
    expect(toneOf('#007BC0', undefined)).toBe('light');
  });

  it('E1: an invalid text colour throws (the schema check reports it)', () => {
    expect(() => toneOf('#007BC0', 'white')).toThrow(/not a #RRGGBB colour/);
  });

  it('accepts #RRGGBBAA (alpha ignored)', () => {
    expect(relativeLuminance('#FFFFFF80')).toBe(1);
  });

  it('rejects anything that is not #RRGGBB(AA)', () => {
    for (const bad of ['red', '#FFF', 'FFFFFF', '#GGGGGG', '', null, undefined]) {
      expect(() => parseHex(bad)).toThrow(/not a #RRGGBB colour/);
    }
    expect(() => toneOf('white')).toThrow();
  });
});
