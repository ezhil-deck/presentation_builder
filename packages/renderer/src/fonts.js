import { extOf, fileUrl, num } from './util.js';

/**
 * `@font-face` rules for every file of every `deck.fonts[]` entry: `src: url(fontBase + file) format(...)`, the
 * format from the file extension (woff2, woff, ttf -> truetype, otf -> opentype), `font-weight` / `font-style`
 * from the file entry (`{file, weight?, style?}`; a bare string is a file path), `font-display: block`.
 *
 * When the deck font carries `metrics` ({ascent, descent, lineGap} in em, descent negative), the face also gets
 * `ascent-override` / `descent-override` / `line-gap-override` with exactly those values, so the browser lays the
 * line box out with the same metrics the fitter used (lines.js) - they are the font file's own metrics, not a
 * correction. Identical rules are emitted once (heading and body often share a file); order = deck order.
 */
const FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

const pct = (v) => `${num(v * 100)}%`;
const quote = (s) => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

export function fontFaceCss(deck, opts = {}) {
  const seen = new Set();
  const out = [];
  for (const font of deck.fonts ?? []) {
    const files = font.files ?? [];
    if (!files.length) {
      const note = `/* pb-warning: no font files for ${String(font.family).replace(/\*\//g, '')} */`;
      if (!seen.has(note)) out.push(note);
      seen.add(note);
      continue;
    }
    const m = font.metrics ?? {};
    for (const entry of files) {
      const f = typeof entry === 'string' ? { file: entry } : entry;
      const ext = extOf(f.file);
      const url = fileUrl(opts.fontBase, f.file, opts);
      const decl = [
        `font-family:${quote(font.family)}`,
        `src:url(${quote(url)})${FORMAT[ext] ? ` format(${quote(FORMAT[ext])})` : ''}`,
      ];
      if (f.weight != null) decl.push(`font-weight:${f.weight}`);
      if (f.style) decl.push(`font-style:${f.style}`);
      decl.push('font-display:block');
      if (typeof m.ascent === 'number') decl.push(`ascent-override:${pct(m.ascent)}`);
      if (typeof m.descent === 'number') decl.push(`descent-override:${pct(Math.abs(m.descent))}`);
      if (typeof m.lineGap === 'number') decl.push(`line-gap-override:${pct(m.lineGap)}`);
      const rule = `@font-face{${decl.join(';')}}`;
      if (seen.has(rule)) continue;
      seen.add(rule);
      out.push(rule);
    }
  }
  return out.join('\n');
}
