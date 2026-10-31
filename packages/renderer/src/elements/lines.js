import { cssColor, fontFamily, fontMetrics, h, num, px } from '../util.js';

/**
 * Fitted lines -> one absolutely positioned `<span>` per line (the fitter's lines; the browser never wraps).
 *
 * Line placement (P2-spec §3.4 / §4): `left = line.x`, `top = line.y − ascent·size`, both relative to the box that
 * holds the lines (the element frame, or the table cell), so on the slide `left = frame.x + line.x` and
 * `top = frame.y + line.y − ascent·size`. `line.y` is the baseline.
 * For that `top` to put the baseline exactly at `line.y`, the span's line box must have no half-leading:
 * `line-height = ascent − descent` (unitless, em) when both metrics are known (the @font-face also pins the
 * browser's ascent/descent to the same metrics, see fonts.js). With no descent the span gets `line-height: 1` and
 * a `data-warning`; with no ascent at all, 0.9 em is used and flagged - never silently.
 *
 * Font fields read (`text.font`, or a table cell's `font`): `family`, `size`, `weight`, `letterSpacing` (em),
 * `color`, `case` ('none'|'upper'|'lower'|'title'), and `ascent` / `descent` (em, descent negative) when
 * `deck.fonts[family].metrics` does not carry them.
 *
 * Runs: `line.runs[k] = {text, run, x, width}`; `run` indexes `paragraphs[line.paragraph].runs` for bold / italic /
 * colour / link, which become nested inline spans (`<a>` for links) inside the line span. Run `x` / `width` are
 * not used: runs flow inline inside the line.
 *
 * Bullets (P2-spec §7 F4: the engine owns bullet geometry): a line carrying `bullet {text, x, width}` gets its glyph
 * `bullet.text` at `left = bullet.x`, same baseline, colour `paragraphs[line.paragraph].bullet.color` else the font
 * colour. The renderer never computes an indent or a number; a bulleted paragraph whose first line has no
 * `line.bullet` is flagged (`data-warning`), not guessed.
 *
 * Case: applied at render to the run text (`title` = first letter of each word upper-cased, the rest unchanged; a
 * word starts at the line start or after whitespace).
 */

export function applyCase(text, kase, state = { prev: '' }) {
  if (!kase || kase === 'none') return text;
  if (kase === 'upper') return text.toUpperCase();
  if (kase === 'lower') return text.toLowerCase();
  if (kase !== 'title') return text;
  let out = '';
  for (const ch of text) {
    out += state.prev === '' || /\s/.test(state.prev) ? ch.toUpperCase() : ch;
    state.prev = ch;
  }
  return out;
}

/** CSS of a text font (family, size, weight, spacing, colour) + line-height from the metrics. */
export function fontCss(ctx, font, metrics) {
  const css = {
    fontFamily: fontFamily(ctx, font.family),
    fontSize: px(font.size),
    fontWeight: font.weight,
    lineHeight: typeof metrics.descent === 'number' ? num(metrics.ascent - metrics.descent) : 1,
  };
  if (typeof font.letterSpacing === 'number' && font.letterSpacing !== 0)
    css.letterSpacing = `${num(font.letterSpacing)}em`;
  if (font.color) css.color = cssColor(font.color);
  return css;
}

function runNode(text, run, key) {
  const css = {};
  if (run.bold) css.fontWeight = 700;
  if (run.italic) css.fontStyle = 'italic';
  if (run.color) css.color = cssColor(run.color);
  const styled = Object.keys(css).length > 0;
  if (run.link) {
    return h(
      'a',
      { key, href: run.link, style: { color: 'inherit', textDecoration: 'inherit', ...css } },
      text,
    );
  }
  return styled ? h('span', { key, style: css }, text) : text;
}

/**
 * Renders `lines` for `font`. Returns `{ nodes, warning }`; `warning` is the metrics warning (if any) for the
 * caller's `data-warning`.
 */
export function renderLines(ctx, { lines = [], paragraphs = [], font }) {
  const metrics = fontMetrics(ctx, font);
  const size = font.size;
  const base = fontCss(ctx, font, metrics);
  const nodes = [];
  const warnings = [];
  let prevParagraph = -1;
  lines.forEach((line, li) => {
    const top = line.y - metrics.ascent * size;
    const para = paragraphs[line.paragraph] ?? {};
    const firstOfParagraph = line.paragraph !== prevParagraph;
    prevParagraph = line.paragraph;
    if (line.bullet) {
      if (line.bullet.text) {
        const css = {
          ...base,
          position: 'absolute',
          left: px(line.bullet.x),
          top: px(top),
          whiteSpace: 'pre',
        };
        if (para.bullet?.color) css.color = cssColor(para.bullet.color);
        nodes.push(h('span', { key: `b${li}`, className: 'pb-bullet', style: css }, line.bullet.text));
      }
    } else if (firstOfParagraph && (para.bullet?.glyph || para.bullet?.ordered)) {
      warnings.push(`paragraph ${line.paragraph} has a bullet but its line has no bullet geometry`);
    }
    const state = { prev: '' };
    const children = (line.runs ?? []).map((lr, k) => {
      const run = para.runs?.[lr.run] ?? {};
      return runNode(applyCase(lr.text, font.case, state), run, k);
    });
    nodes.push(
      h(
        'span',
        {
          key: `l${li}`,
          className: 'pb-line',
          'data-line': li,
          style: { ...base, position: 'absolute', left: px(line.x), top: px(top), whiteSpace: 'pre' },
        },
        ...children,
      ),
    );
  });
  const warning = [metrics.warning, ...new Set(warnings)].filter(Boolean).join('; ') || undefined;
  return { nodes, warning };
}
