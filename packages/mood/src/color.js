// WCAG 2.x relative luminance and contrast ratio. Self-contained on purpose (no import from packages/brand).

const HEX = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX.test(value);
}

/** '#RRGGBB' or '#RRGGBBAA' -> {r, g, b} in 0..255 (alpha ignored). */
export function hexToRgb(hex) {
  const m = HEX.exec(hex ?? '');
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1..21), unrounded. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast rounded to 2 decimals, the form stored in the Mood. */
export function contrast(a, b) {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

/** BR-TONE: dark when white text contrasts at least as well as black text on bg. */
export function toneOf(bg) {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#000000') ? 'dark' : 'light';
}

export function sameColor(a, b) {
  return isHexColor(a) && isHexColor(b) && a.toUpperCase() === b.toUpperCase();
}
