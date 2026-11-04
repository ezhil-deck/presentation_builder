/**
 * Raster measurements for BR-CAPABILITIES / BR-CLAIMS (docs/P1-rules.md §A): decode a PNG (pngjs) or JPEG (jpeg-js)
 * into RGBA pixels and measure them. Other formats (WebP, GIF, AVIF ...) are not decoded: decodeImage() says so and
 * the claim that needed the pixels is recorded as skipped (`pass: null`). Decoded pixels never enter the BrandSpec:
 * only the numbers measured from them do.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** Pixels with alpha at or above this are opaque (half coverage). */
export const ALPHA_OPAQUE = 128;

/**
 * Decode an image file -> `{ ok: true, width, height, data }` (data = RGBA bytes, row-major) or
 * `{ ok: false, reason }` ("format not decoded" for anything but PNG / JPEG, or the decoder's error).
 */
export function decodeImage(path) {
  const ext = extname(path).toLowerCase();
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch (err) {
    return { ok: false, reason: `cannot read the file: ${err.message}` };
  }
  const isPng = ext === '.png' || buffer.slice(1, 4).toString('ascii') === 'PNG';
  const isJpeg = ext === '.jpg' || ext === '.jpeg' || (buffer[0] === 0xff && buffer[1] === 0xd8);
  try {
    if (isPng) {
      const png = PNG.sync.read(buffer);
      return { ok: true, width: png.width, height: png.height, data: png.data };
    }
    if (isJpeg) {
      const img = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
      return { ok: true, width: img.width, height: img.height, data: img.data };
    }
  } catch (err) {
    return { ok: false, reason: `format not decoded: ${err.message}` };
  }
  return { ok: false, reason: `format not decoded (${ext || 'no extension'}; only PNG and JPEG are read)` };
}

// sRGB channel (0-255) -> linear light, as a table
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** WCAG relative luminance (0-1) of 8-bit r, g, b. */
export function luminance(r, g, b) {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/** Euclidean RGB distance (0-441.7). */
export function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const clampRect = (img, r) => {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(img.width, Math.ceil(r.x + r.w));
  const y1 = Math.min(img.height, Math.ceil(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
};

/**
 * Opaque pixels (alpha >= ALPHA_OPAQUE): `{ bbox: {x, y, w, h} | null, opaqueShare, meanLuminance }` where
 * meanLuminance is the mean WCAG relative luminance of the opaque pixels (null when none).
 */
export function opaqueStats(img) {
  const { width, height, data } = img;
  let n = 0;
  let sum = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < ALPHA_OPAQUE) continue;
      n += 1;
      sum += luminance(data[i], data[i + 1], data[i + 2]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return {
    bbox: n ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
    opaqueShare: n / (width * height),
    meanLuminance: n ? sum / n : null,
  };
}

/** The per-channel median colour of the 1-pixel ring along the inside of `rect` (canvas = image px). */
export function borderMedian(img, rect) {
  const r = clampRect(img, rect);
  if (!r) return null;
  const ch = [[], [], []];
  const push = (x, y) => {
    const i = (y * img.width + x) * 4;
    ch[0].push(img.data[i]);
    ch[1].push(img.data[i + 1]);
    ch[2].push(img.data[i + 2]);
  };
  for (let x = r.x0; x < r.x1; x += 1) {
    push(x, r.y0);
    if (r.y1 - 1 > r.y0) push(x, r.y1 - 1);
  }
  for (let y = r.y0 + 1; y < r.y1 - 1; y += 1) {
    push(r.x0, y);
    if (r.x1 - 1 > r.x0) push(r.x1 - 1, y);
  }
  const median = (list) => {
    const s = list.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return ch.map(median);
}

/**
 * Inside `rect`, the bounding box of the pixels whose colour is farther than `threshold` (RGB distance) from `ref`.
 * A row or column counts only when it holds at least `minCount` such pixels (a stray JPEG speck does not move the
 * box). Returns `{ bbox: {x, y, w, h} | null, count }` in image px.
 */
export function diffBbox(img, rect, ref, threshold, { minCount = 2 } = {}) {
  const r = clampRect(img, rect);
  if (!r) return { bbox: null, count: 0 };
  const cols = new Array(r.x1 - r.x0).fill(0);
  const rows = new Array(r.y1 - r.y0).fill(0);
  let count = 0;
  for (let y = r.y0; y < r.y1; y += 1) {
    for (let x = r.x0; x < r.x1; x += 1) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < ALPHA_OPAQUE) continue;
      if (rgbDistance([img.data[i], img.data[i + 1], img.data[i + 2]], ref) <= threshold) continue;
      cols[x - r.x0] += 1;
      rows[y - r.y0] += 1;
      count += 1;
    }
  }
  const first = (list) => list.findIndex((v) => v >= minCount);
  const lastOf = (list) => {
    for (let k = list.length - 1; k >= 0; k -= 1) if (list[k] >= minCount) return k;
    return -1;
  };
  const cx0 = first(cols);
  const cy0 = first(rows);
  if (cx0 < 0 || cy0 < 0) return { bbox: null, count };
  const cx1 = lastOf(cols);
  const cy1 = lastOf(rows);
  return { bbox: { x: r.x0 + cx0, y: r.y0 + cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 }, count };
}

/** Share (0-1) of the image's opaque pixels within `maxDistance` (RGB) of `rgb`. */
export function nearShare(img, rgb, maxDistance) {
  const { data } = img;
  let n = 0;
  let near = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_OPAQUE) continue;
    n += 1;
    if (rgbDistance([data[i], data[i + 1], data[i + 2]], rgb) <= maxDistance) near += 1;
  }
  return n ? near / n : 0;
}

/** A decode cache for one read: `get(absPath)` decodes once. Never stored in the BrandSpec. */
export function imageCache() {
  const cache = new Map();
  return {
    get(path) {
      if (!cache.has(path)) cache.set(path, decodeImage(path));
      return cache.get(path);
    },
  };
}
