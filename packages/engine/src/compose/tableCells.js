/**
 * Rich table cells (content/2 `table`, S2.a slice 3): the brand look the table fitter needs (cellLook) and the
 * elements drawn over the table for the cells that are not text (cellElements): brand check / cross icons, rating
 * dots, image / logo thumbnails and chips. Everything is a plain box over the native table (PPTX-safe: a table plus
 * shapes and pictures on top of it).
 */
import { parseInline } from '../content/inline.js';
import { r2 } from '../util/stable.js';
import { MIN_LITERAL_CONTRAST, contrastRatio } from './resolve.js';

/** Body-text contrast the highlighted column's text reaches (WCAG AA). */
export const HIGHLIGHT_CONTRAST = 4.5;
/** The accent tint a highlighted column takes when the brand gives no tables.highlightColumn fill: accent at 15 % over bg. */
export const HIGHLIGHT_TINT = 0.15;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const hex2 = (n) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** `color` laid over `bg` at `alpha` (both #RRGGBB) → #RRGGBB. */
export function tint(color, bg, alpha) {
  const ch = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => hex2(ch(bg, i) + (ch(color, i) - ch(bg, i)) * alpha)).join('')}`;
}

/**
 * The resolved look of a rich table's cells on this surface:
 * - check: tables.checkIcon.glyph names a brand icon (else `check` / `tick`), else the glyph ✓ in
 *   tables.checkIcon.color (else accent); a false check: a brand `cross` / `x` / `close` icon, else
 *   tables.checkIcon.emptyGlyph (else ✗) in textMuted;
 * - highlight: tables.highlightColumn.fill (else the accent tint) and tables.highlightColumn.text when it reaches
 *   4.5:1 on that fill (else the surface / brand text colour that does, textOn);
 * - chip: components.chip (font role, padding.0 / padding.1); rating dots in the accent; thumbnails at
 *   decor.imagery.crop.defaultRatio.
 */
/**
 * The check marks of this brand on this surface: a true check = a brand icon named tables.checkIcon.glyph / check /
 * tick, else the glyph ✓ in tables.checkIcon.color (else accent); a false check = a brand cross / x / close icon,
 * else tables.checkIcon.emptyGlyph (else ✗) in textMuted. A colour under 3:1 on the slide bg is dropped (the text
 * colour stands). Used by table cells and compare rows.
 */
export function checkMarks(ctx, iconOf) {
  const { mood, R } = ctx;
  const ci = mood.tables?.checkIcon ?? {};
  const first = (...names) => names.map((n) => (n ? iconOf(ctx, n) : null)).find(Boolean) ?? null;
  const bg = R.color('bg')?.slice(0, 7);
  const reads = (c) => (c && bg && contrastRatio(c.slice(0, 7), bg) >= MIN_LITERAL_CONTRAST ? c : undefined);
  return {
    on: { icon: first(ci.glyph, 'check', 'tick'), text: '✓', color: reads(R.color(ci.color ?? 'accent')) },
    off: {
      icon: first('cross', 'x', 'close'),
      text: typeof ci.emptyGlyph === 'string' && ci.emptyGlyph ? ci.emptyGlyph : '✗',
      color: reads(R.color('textMuted')),
    },
    reads,
  };
}

export function cellLook(block, ctx, { iconOf, textOn, cropRatio }) {
  const { mood, R } = ctx;
  const t = mood.tables ?? {};
  const marks = checkMarks(ctx, iconOf);
  const look = {
    check: { on: marks.on, off: marks.off },
    rating: marks.reads(R.color('accent')) ?? R.color('text'),
    thumbRatio: cropRatio(mood) ?? undefined,
    assetInfo: (src) => ctx.assets.info(src),
  };
  if (Number.isInteger(block.highlightColumn)) {
    const accent = R.color('accent')?.slice(0, 7);
    const bg = R.color('bg')?.slice(0, 7);
    const fill = t.highlightColumn?.fill
      ? R.color(t.highlightColumn.fill)
      : accent && bg
        ? tint(accent, bg, HIGHLIGHT_TINT)
        : undefined;
    if (fill) {
      const given = t.highlightColumn?.text ? R.color(t.highlightColumn.text) : undefined;
      const color =
        given && contrastRatio(given.slice(0, 7), fill.slice(0, 7)) >= HIGHLIGHT_CONTRAST
          ? given
          : textOn(fill, ctx);
      look.highlight = { fill, color };
    }
  }
  const chip = mood.components?.chip;
  if (chip) {
    const ct = chip.tokens ?? {};
    const role = typeof ct.font === 'string' && mood.type?.roles?.[ct.font] ? ct.font : null;
    const padV = num(ct['padding.0']) ?? num(ct.padding) ?? 0;
    look.chip = {
      role,
      font: role ? R.font(role) : undefined,
      padV,
      padH: num(ct['padding.1']) ?? padV,
      tokens: ct,
      color: ct.text !== undefined ? R.color(ct.text) : undefined,
      weight: num(ct.weight),
    };
  }
  return look;
}

/**
 * The elements over the table for its non-text cells (z 31, above the table): icon images, rating dots (ellipses),
 * image / logo thumbnails (cover / contain), chips (the chip rect + its text). `frame` = the table element's frame.
 */
export function cellElements(table, frame, look, idBase, ctx, { imageEl, rectEl, textElement }) {
  const out = [];
  const at = (g) => ({ x: frame.x + g.x, y: frame.y + g.y, w: g.w, h: g.h });
  (table.cells ?? []).forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell.graphic) return;
      const id = `${idBase}-cell-${r}-${c}`;
      const g = at(cell.graphic);
      if (cell.kind === 'icon') {
        const el = imageEl(id, g, { src: cell.icon }, null, ctx);
        el.image.fit = 'contain';
        delete el.image.mask;
        el.name = 'icon';
        out.push(el);
      } else if (cell.kind === 'rating') {
        for (let k = 0; k < cell.n; k += 1) {
          out.push({
            id: `${id}-dot-${k}`,
            type: 'shape',
            name: 'rating dot',
            frame: { x: r2(g.x + k * (cell.d + cell.gap)), y: r2(g.y), w: cell.d, h: cell.d },
            shape: { kind: 'ellipse' },
            style: look.rating ? { fill: look.rating } : {},
          });
        }
      } else if (cell.kind === 'image' || cell.kind === 'logo') {
        const el = imageEl(id, g, { src: cell.src, alt: cell.alt }, null, ctx);
        if (cell.kind === 'logo') {
          el.image.fit = 'contain';
          delete el.image.mask;
        }
        out.push(el);
      } else if (cell.kind === 'chip' && look.chip) {
        const rect = rectEl(`${id}-chip`, g, look.chip.tokens, ctx);
        if (rect) {
          rect.name = 'chip';
          out.push(rect);
        }
        const text = textElement({
          id,
          frame: {
            x: g.x + look.chip.padH,
            y: g.y + look.chip.padV,
            w: Math.max(0, g.w - 2 * look.chip.padH),
            h: Math.max(0, g.h - 2 * look.chip.padV),
          },
          role: look.chip.role ?? ctx.mood.tables?.rows?.font ?? 'tableCell',
          paragraphs: [{ runs: parseInline(cell.chipText ?? '') }],
          align: 'center',
          valign: 'middle',
          color: look.chip.color,
          weight: look.chip.weight,
          ctx,
        });
        if (text) out.push(text);
      }
    }),
  );
  for (const el of out) el.z = 31;
  return out;
}
