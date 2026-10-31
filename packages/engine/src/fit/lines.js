/**
 * Line breaking and text layout from font metrics (P2-spec §3.4). The renderer places these lines verbatim, so HTML and
 * PPTX agree: nothing here may depend on a browser.
 */
import { r2 } from '../util/stable.js';
import { measure } from './metrics.js';

const EPS = 0.01;

/** Text case transform (font.case): none | upper | lower | title. */
export function applyCase(text, kase) {
  if (kase === 'upper') return text.toUpperCase();
  if (kase === 'lower') return text.toLowerCase();
  if (kase === 'title') return text.replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
  return text;
}

/** A paragraph as runs: a string, {runs:[...]} or {text}. */
export function toRuns(paragraph) {
  if (typeof paragraph === 'string') return [{ text: paragraph }];
  if (Array.isArray(paragraph?.runs)) return paragraph.runs;
  if (typeof paragraph?.text === 'string') return [{ text: paragraph.text }];
  return [{ text: '' }];
}

const textOf = (items) => items.map((c) => c.ch).join('');

function formatLine(items, font) {
  const text = textOf(items);
  const ls = (font.letterSpacing ?? 0) * font.size;
  const runs = [];
  let k = 0;
  while (k < items.length) {
    let end = k;
    while (end < items.length && items[end].run === items[k].run) end += 1;
    const prefix = textOf(items.slice(0, k));
    const seg = textOf(items.slice(k, end));
    runs.push({
      text: seg,
      run: items[k].run,
      x: k > 0 ? measure(prefix, font) + ls : 0,
      width: measure(seg, font),
    });
    k = end;
  }
  return { text, width: items.length ? measure(text, font) : 0, runs };
}

/**
 * breakLines(paragraph, font, maxWidth, {warnings}) -> [{text, width, runs:[{text, run, x, width}]}]
 * Greedy word wrap on spaces (runs of spaces collapse to one; '\n' is a hard break). A word wider than maxWidth is
 * broken by characters and a `long-word` warning is pushed into `opts.warnings` (when given). Run x is relative to
 * the line start; `run` is the index into the paragraph's runs.
 */
export function breakLines(paragraph, font, maxWidth, opts = {}) {
  const runs = toRuns(paragraph);
  const chars = [];
  runs.forEach((r, ri) => {
    for (const ch of applyCase(String(r.text ?? ''), opts.case ?? 'none')) chars.push({ ch, run: ri });
  });
  const hard = [[]];
  for (const c of chars) {
    if (c.ch === '\n') hard.push([]);
    else hard[hard.length - 1].push(c);
  }
  const width = (items) => (items.length ? measure(textOf(items), font) : 0);
  const out = [];
  for (const segment of hard) {
    const words = [];
    let cur = [];
    let space = null;
    for (const c of segment) {
      if (c.ch === ' ' || c.ch === '\t') {
        if (cur.length) {
          words.push({ items: cur, space });
          cur = [];
          space = null;
        }
        if (!space && words.length) space = { ch: ' ', run: c.run };
      } else cur.push(c);
    }
    if (cur.length) words.push({ items: cur, space });

    let line = [];
    for (const word of words) {
      const cand = line.length
        ? [...line, word.space ?? { ch: ' ', run: word.items[0].run }, ...word.items]
        : word.items;
      if (width(cand) <= maxWidth + EPS) {
        line = cand;
        continue;
      }
      if (line.length) out.push(line);
      line = [];
      if (width(word.items) <= maxWidth + EPS) {
        line = word.items;
        continue;
      }
      opts.warnings?.push({
        check: 'long-word',
        severity: 'warn',
        message: `word "${textOf(word.items)}" is wider than ${r2(maxWidth)}px at ${font.size}px: broken by characters`,
      });
      let chunk = [];
      for (const c of word.items) {
        if (chunk.length && width([...chunk, c]) > maxWidth + EPS) {
          out.push(chunk);
          chunk = [c];
        } else chunk.push(c);
      }
      line = chunk;
    }
    out.push(line);
  }
  return out.map((items) => formatLine(items, font));
}

/**
 * layoutText(paragraphs, frame, font, {align, valign, bullets, warnings}) -> {lines, height, overflow}
 *
 * Line box L = lineHeight × size; baseline of a line whose box starts at `top` (block-relative):
 *   top + (L − (ascent − descent)·size)/2 + ascent·size            (CSS half-leading; descent is negative)
 * which for the i-th line of an unspaced block is y0 + i·L + … exactly as §3.4. Paragraph spacing adds
 * `spaceAfter` of the previous + `spaceBefore` of the next paragraph. List paragraphs (level ≥ 1) are indented by
 * `bullets.indent × level` (else 1.5 × size per level; signal: the role size; never less than the widest glyph + a
 * space, so a "10." never runs into its text); the glyph sits one indent to the left
 * of the text (`line.bullet`). All x / y are relative to the frame; run x is relative to the frame too.
 * `valign` (top|middle|bottom) shifts the whole block when it fits.
 */
export function layoutText(paragraphs, frame, font, opts = {}) {
  const size = font.size;
  const m = font.metrics;
  const L = font.lineHeight * size;
  const asc = m.ascent * size;
  const half = (L - (m.ascent - m.descent) * size) / 2;
  // a glyph never runs into its text: the indent is at least the widest glyph of the block plus one space
  const glyphRoom = Math.max(
    0,
    ...(paragraphs ?? [])
      .filter((p) => p && typeof p === 'object' && p.bullet?.glyph && (p.level ?? 0) > 0)
      .map((p) => measure(`${p.bullet.glyph} `, font)),
  );
  const indentUnit = Math.max(opts.bullets?.indent ?? 1.5 * size, glyphRoom);
  const lines = [];
  let cursor = 0;
  let overflowX = false;
  const list = (paragraphs ?? []).map((p) => (typeof p === 'string' ? { runs: [{ text: p }] } : p));
  list.forEach((p, pi) => {
    if (pi > 0) cursor += (list[pi - 1].spaceAfter ?? 0) + (p.spaceBefore ?? 0);
    const level = p.level ?? 0;
    const indent = level > 0 ? indentUnit * level : 0;
    const avail = frame.w - indent;
    const broken = breakLines(p, font, avail, { warnings: opts.warnings, case: font.case });
    const align = p.align ?? opts.align ?? 'left';
    broken.forEach((ln, k) => {
      const dx = align === 'center' ? (avail - ln.width) / 2 : align === 'right' ? avail - ln.width : 0;
      const x = indent + dx;
      if (ln.width > avail + 0.5) overflowX = true;
      const line = {
        paragraph: pi,
        text: ln.text,
        x,
        y: cursor + half + asc,
        width: ln.width,
        runs: ln.runs.map((r) => ({ text: r.text, run: r.run, x: x + r.x, width: r.width })),
      };
      if (k === 0 && p.bullet && level > 0) {
        const glyph = p.bullet.glyph ?? '';
        line.bullet = { text: glyph, x: indent - indentUnit, width: glyph ? measure(glyph, font) : 0 };
      }
      lines.push(line);
      cursor += L;
    });
  });
  const height = cursor;
  const overflow = height > frame.h + 0.5 || overflowX;
  const free = frame.h - height;
  const dy =
    opts.valign === 'middle' ? Math.max(0, free / 2) : opts.valign === 'bottom' ? Math.max(0, free) : 0;
  const round = (ln) => ({
    ...ln,
    x: r2(ln.x),
    y: r2(ln.y + dy),
    width: r2(ln.width),
    runs: ln.runs.map((r) => ({ ...r, x: r2(r.x), width: r2(r.width) })),
    ...(ln.bullet ? { bullet: { ...ln.bullet, x: r2(ln.bullet.x), width: r2(ln.bullet.width) } } : {}),
  });
  return { lines: lines.map(round), height, overflow };
}
