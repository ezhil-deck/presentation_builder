/**
 * Font metrics -> advance widths (P2-spec §3.4). A `font` here is what `resolve(...).font(role)` returns:
 * { size, letterSpacing (em), metrics: { ascent, descent, avgCharWidth, widths: { [codepoint]: per-em advance } } }.
 */

/** Face metrics as em fractions (a face that gives font units is divided by unitsPerEm). */
export function normalizeMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  const upm = metrics.unitsPerEm || 1000;
  const scale = Math.abs(metrics.ascent ?? 0) > 4 ? 1 / upm : 1;
  const widths = {};
  for (const [cp, w] of Object.entries(metrics.widths ?? {})) widths[cp] = w * scale;
  return {
    ascent: (metrics.ascent ?? 0) * scale,
    descent: (metrics.descent ?? 0) * scale,
    capHeight: metrics.capHeight !== undefined ? metrics.capHeight * scale : undefined,
    xHeight: metrics.xHeight !== undefined ? metrics.xHeight * scale : undefined,
    avgCharWidth: (metrics.avgCharWidth ?? 0) * scale,
    widths,
  };
}

/** Advance of one code point, in em. Missing code point -> avgCharWidth. */
export function advance(cp, metrics) {
  const w = metrics.widths?.[cp];
  return w !== undefined ? w : metrics.avgCharWidth;
}

/**
 * measure(text, font) -> width px = Σ widths[cp] × size + letterSpacing × size × (n − 1).
 * Code points, not UTF-16 units; the space is widths[32] like any other character.
 */
export function measure(text, font) {
  const m = font?.metrics;
  if (!m) throw new Error(`measure(): font "${font?.family ?? '?'}" has no metrics`);
  let em = 0;
  let n = 0;
  for (const ch of String(text)) {
    em += advance(ch.codePointAt(0), m);
    n += 1;
  }
  const ls = font.letterSpacing ?? 0;
  return em * font.size + (n > 1 ? ls * font.size * (n - 1) : 0);
}

/**
 * Width of a rule / divider line (table rows, chart grid and axis, connectors): shape.divider.weight, else
 * shape.borderWidth, else a 1 px hairline.
 */
export function ruleWidth(mood) {
  return mood?.shape?.divider?.weight || mood?.shape?.borderWidth || 1;
}
