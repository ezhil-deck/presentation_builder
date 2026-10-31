import React from 'react';

/** `React.createElement` without JSX, so Node runs the renderer without Babel. */
export const h = React.createElement;

/** A number rounded to 3 decimals (no float noise, no "-0") - keeps the HTML deterministic and readable. */
export function num(v) {
  const r = Math.round(Number(v) * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/** `<n>px` with `num` rounding. */
export const px = (v) => `${num(v)}px`;

/** `#RRGGBB` / `#RRGGBBAA` (+ an extra opacity factor) -> a CSS colour; `undefined` passes through. */
export function cssColor(hex, opacity) {
  if (typeof hex !== 'string') return undefined;
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) return hex;
  const alpha = (m[2] ? parseInt(m[2], 16) / 255 : 1) * (opacity ?? 1);
  if (alpha >= 1) return `#${m[1].toUpperCase()}`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${num(alpha)})`;
}

/** Joins an asset/font base and a relative file ("" base = the file as given). */
export function joinUrl(base, file) {
  if (!base) return file;
  return base.endsWith('/') ? `${base}${file}` : `${base}/${file}`;
}

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

export const extOf = (file) => (/\.([a-z0-9]+)$/i.exec(file ?? '')?.[1] ?? '').toLowerCase();

/**
 * The URL of a file under a base. With `inlineAssets` the file is read (sync) and embedded as a data: URI; the
 * reader is `opts.readFile(path)` or, in Node, `node:fs` via `process.getBuiltinModule` (no static fs import, so
 * the renderer still bundles for the browser).
 */
export function fileUrl(base, file, opts, mime) {
  const path = joinUrl(base, file);
  if (!opts.inlineAssets) return path;
  const read = opts.readFile ?? globalThis.process?.getBuiltinModule?.('node:fs')?.readFileSync ?? null;
  if (!read) throw new Error('renderer: inlineAssets needs opts.readFile outside Node');
  const bytes = read(path);
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String(bytes));
  return `data:${mime ?? MIME[extOf(file)] ?? 'application/octet-stream'};base64,${b64}`;
}

/** The deck font entry for a family (first match), or undefined. */
export function deckFont(ctx, family) {
  return (ctx.deck.fonts ?? []).find((f) => f.family === family);
}

/** CSS font-family: the quoted family, then the deck's fallback list for it (as given by the Mood). */
export function fontFamily(ctx, family) {
  if (!family) return undefined;
  const fallback = deckFont(ctx, family)?.fallback;
  const quoted = `"${String(family).replace(/["\\]/g, '\\$&')}"`;
  return fallback ? `${quoted}, ${fallback}` : quoted;
}

/** Fallback ascent (em) when neither the deck font nor the element font carries one - always flagged. */
export const FALLBACK_ASCENT = 0.9;

/**
 * Vertical metrics of a text font, in em: `deck.fonts[family].metrics` first, then `font.ascent` / `font.descent`
 * (descent is negative, as in the font file). `warning` names what is missing - the caller puts it in a
 * `data-warning` attribute; nothing is filled silently.
 */
export function fontMetrics(ctx, font) {
  const m = deckFont(ctx, font?.family)?.metrics ?? {};
  const ascent = m.ascent ?? font?.ascent;
  const descent = m.descent ?? font?.descent;
  if (typeof ascent !== 'number') {
    return {
      ascent: FALLBACK_ASCENT,
      descent: undefined,
      warning: `no ascent for "${font?.family}": used ${FALLBACK_ASCENT}`,
    };
  }
  if (typeof descent !== 'number') {
    return {
      ascent,
      descent: undefined,
      warning: `no descent for "${font?.family}": line-height 1, baseline approximate`,
    };
  }
  return { ascent, descent, warning: undefined };
}

/** Joins several warnings into one `data-warning` value (undefined when none). */
export function warn(...list) {
  const w = list.flat().filter(Boolean);
  return w.length ? w.join('; ') : undefined;
}

/** Common absolute box style of an element frame, relative to `origin` (the parent's frame origin). */
export function boxStyle(frame, origin = { x: 0, y: 0 }, extra = {}) {
  const style = {
    position: 'absolute',
    left: px(frame.x - origin.x),
    top: px(frame.y - origin.y),
    width: px(frame.w),
    height: px(frame.h),
    ...extra,
  };
  if (frame.rotation) style.transform = `rotate(${num(frame.rotation)}deg)`;
  return style;
}

/** A document-unique, deterministic SVG id for an element (`slide index` + element id + suffix). */
export function svgId(ctx, el, suffix) {
  return `pb${ctx.slideIndex}-${String(el.id).replace(/[^A-Za-z0-9_-]/g, '_')}-${suffix}`;
}
