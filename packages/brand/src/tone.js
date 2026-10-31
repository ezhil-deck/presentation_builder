/** BR-TONE: WCAG 2.x relative luminance and contrast; surface tone from its text and background colours. */

const HEX = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

/** [r, g, b] in 0..255 from #RRGGBB or #RRGGBBAA (alpha ignored). Throws on anything else. */
export function parseHex(hex) {
  const match = typeof hex === 'string' && hex.match(HEX);
  if (!match) throw new Error(`not a #RRGGBB colour: ${JSON.stringify(hex)}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 .. 21 (order of the two colours does not matter). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Surface tone (BR-TONE v2, P1-rules E1). With the surface's own `text` colour: `dark` when the text is lighter
 * than the background (relative luminance), else `light`. Without `text`: v1 contrast comparison, `dark` when white
 * text contrasts at least as much as black on `bg`.
 */
export function toneOf(bg, text) {
  if (text !== undefined) return relativeLuminance(text) > relativeLuminance(bg) ? 'dark' : 'light';
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#000000') ? 'dark' : 'light';
}
