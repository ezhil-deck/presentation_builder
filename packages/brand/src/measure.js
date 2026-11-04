/**
 * Shared file measurements for BR-CAPABILITIES and BR-CLAIMS: one cache per read (decoded rasters, parsed SVGs), the
 * canvas, rounding, and the BrandSpec -> input pointer map the questions need (D5: questions name INPUT pointers).
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { resolveInside } from './assets.js';
import { imageCache, luminance, opaqueStats } from './pixels.js';
import { parseSvg, sample } from './svggeom.js';

export const W = 1920;
export const H = 1080;

/** Round to `d` decimals (default 2); null stays null. */
export const round = (n, d = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(d));

/** A box in canvas px -> % of the canvas. */
export const boxPct = (b) => ({
  x: round((b.x / W) * 100),
  y: round((b.y / H) * 100),
  w: round((b.w / W) * 100),
  h: round((b.h / H) * 100),
});

export const isSvg = (file) => extname(String(file)).toLowerCase() === '.svg';
export const isRaster = (file) => ['.png', '.jpg', '.jpeg'].includes(extname(String(file)).toLowerCase());

/** One measuring context per readBrand: `abs(file)`, `image(file)` (decoded once), `svg(file)` (parsed once). */
export function measureContext(dir) {
  const images = imageCache();
  const svgs = new Map();
  const logos = new Map();
  const abs = (file) => resolveInside(dir, file);
  const ctx = {
    dir,
    abs,
    cache: new Map(), // derived measurements (decor geometry) shared by claims and capabilities
    image(file) {
      const path = abs(file);
      if (!path) return { ok: false, reason: `not a file inside the brand folder: ${file}` };
      return images.get(path);
    },
    svg(file) {
      const path = abs(file);
      if (!path) return null;
      if (!svgs.has(path)) {
        try {
          svgs.set(path, parseSvg(readFileSync(path, 'utf8')));
        } catch {
          svgs.set(path, null);
        }
      }
      return svgs.get(path);
    },
    /**
     * A logo (or any mark) file's opaque box and the mean WCAG luminance of its opaque pixels:
     * `{ ok, bbox (px of the file / viewBox units), bboxPct (% of the file), meanLuminance, approx?, reason? }`.
     * PNG / JPEG: decoded pixels. SVG: the painted shapes point-sampled (160 points on the long side), each sample
     * taking the topmost shape's plain colour (gradient / pattern paint left out); `approx` when the SVG has curves or
     * parts this reader does not model.
     */
    mark(file) {
      if (logos.has(file)) return logos.get(file);
      let out;
      if (isRaster(file)) {
        const img = ctx.image(file);
        if (!img.ok) out = { ok: false, reason: img.reason };
        else {
          const { width, height } = img;
          const s = opaqueStats(img);
          out = {
            ok: true,
            width,
            height,
            bbox: s.bbox,
            bboxPct: s.bbox ? pctOf(s.bbox, width, height) : null,
            meanLuminance: round(s.meanLuminance, 3),
            opaqueShare: round(s.opaqueShare, 3),
          };
        }
      } else if (isSvg(file)) {
        const doc = ctx.svg(file);
        if (!doc || !doc.viewBox) out = { ok: false, reason: 'SVG without a viewBox or size' };
        else {
          const vb = doc.viewBox;
          const s = sample(doc.shapes, vb, { samples: 160 });
          const lums = s.colours.filter(Boolean).map(([r, g, b]) => luminance(r, g, b));
          const bbox = s.bbox ? { x: s.bbox.x - vb.x, y: s.bbox.y - vb.y, w: s.bbox.w, h: s.bbox.h } : null;
          out = {
            ok: true,
            width: vb.w,
            height: vb.h,
            bbox: bbox ? { x: round(bbox.x), y: round(bbox.y), w: round(bbox.w), h: round(bbox.h) } : null,
            bboxPct: bbox ? pctOf(bbox, vb.w, vb.h) : null,
            meanLuminance: lums.length ? round(lums.reduce((a, b) => a + b, 0) / lums.length, 3) : null,
            opaqueShare: round(s.paintedShare, 3),
            ...(doc.approx ? { approx: true } : {}),
          };
        }
      } else {
        out = { ok: false, reason: `format not decoded (${extname(String(file)) || 'no extension'})` };
      }
      logos.set(file, out);
      return out;
    },
  };
  return ctx;
}

function pctOf(b, w, h) {
  return {
    x: round((b.x / w) * 100),
    y: round((b.y / h) * 100),
    w: round((b.w / w) * 100),
    h: round((b.h / h) * 100),
  };
}

// BrandSpec pointer prefix -> input pointer prefix (BR-NORMALIZE's field map, the renamed blocks only)
const INPUT_PREFIX = [
  ['/brandLayouts', '/layouts'],
  ['/decor/elements', '/assets/elements'],
  ['/imagery/masks', '/masks'],
  ['/components/cards', '/cards'],
  ['/components/icons', '/icons'],
  ['/colors/named', '/colors/custom'],
  ['/colors/gradients', '/gradients'],
];

/** The input pointer a BrandSpec pointer was read from (D5: a question names the input pointer). */
export function inputPointer(pointer) {
  const logo = pointer.match(/^\/logos\/variants\/([^/]+)(?:\/file)?$/);
  if (logo) return `/brand/logos/${logo[1]}`;
  for (const [from, to] of INPUT_PREFIX) {
    if (pointer === from || pointer.startsWith(`${from}/`)) return to + pointer.slice(from.length);
  }
  return pointer;
}
