/** BR-ASSET: referenced files must exist under the brand folder; mime from the extension; image sizes from headers. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
};

/** Mime type from the file extension (application/octet-stream when unknown). */
export function mimeOf(file) {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function pngSize(b) {
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG' || b.toString('ascii', 12, 16) !== 'IHDR')
    return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2; // standalone marker
      continue;
    }
    const length = b.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP')
    return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const b1 = b[21];
    const b2 = b[22];
    const b3 = b[23];
    const b4 = b[24];
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  }
  return null;
}

function gifSize(b) {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function svgLength(value) {
  if (value === undefined) return null;
  const match = value.trim().match(/^([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)(px)?$/i);
  return match ? Number(match[1]) : null;
}

/**
 * SVG size from the root element: width/height attributes when both are absolute (unitless or px), else the
 * viewBox's width/height. Rounded to whole px. null when neither gives a size.
 */
export function svgSize(text) {
  const tag = text.match(/<svg\b[^>]*>/i);
  if (!tag) return null;
  const attrs = {};
  for (const m of tag[0].matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = m[2] ?? m[3];
  }
  const w = svgLength(attrs.width);
  const h = svgLength(attrs.height);
  if (w !== null && h !== null) return { width: Math.round(w), height: Math.round(h) };
  const viewBox = attrs.viewBox ?? attrs.viewbox;
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  return null;
}

/** {width, height} of an image file read from its header (PNG, JPEG, WebP, GIF, SVG); null when unknown. */
export function imageSize(path) {
  const mime = mimeOf(path);
  if (mime === 'image/svg+xml') return svgSize(readFileSync(path, 'utf8'));
  const b = readFileSync(path);
  if (mime === 'image/png') return pngSize(b);
  if (mime === 'image/jpeg') return jpegSize(b);
  if (mime === 'image/webp') return webpSize(b);
  if (mime === 'image/gif') return gifSize(b);
  return pngSize(b) ?? jpegSize(b) ?? webpSize(b) ?? gifSize(b);
}

/** Absolute path of `file` when it lies inside `brandDir`, else null. */
export function resolveInside(brandDir, file) {
  if (typeof file !== 'string' || file === '' || /^[a-z][a-z0-9+.-]*:/i.test(file)) return null;
  const abs = resolve(brandDir, file);
  const rel = relative(resolve(brandDir), abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return abs;
}

/**
 * Inspect one referenced file. Returns `{ ok: true, asset: {file, mime, width?, height?}, isDir }` or
 * `{ ok: false, message }` (outside the brand folder / missing).
 * `allowDir`: a folder reference (e.g. icons.customPath) is accepted.
 */
export function inspectAsset(brandDir, file, { allowDir = false } = {}) {
  const abs = resolveInside(brandDir, file);
  if (!abs) return { ok: false, message: `not a file path inside the brand folder: ${JSON.stringify(file)}` };
  if (!existsSync(abs)) return { ok: false, message: `file not found: ${file}` };
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    return allowDir
      ? { ok: true, isDir: true, asset: { file } }
      : { ok: false, message: `is a folder, not a file: ${file}` };
  }
  const asset = { file, mime: mimeOf(file) };
  if (asset.mime.startsWith('image/')) {
    const size = imageSize(abs);
    if (size) Object.assign(asset, size);
  }
  return { ok: true, isDir: false, asset };
}

const IMAGE_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf', '.eot']);
/** E5: `<name>-<suffix>.<ext>` beside `<name>.<ext>` is that icon's variant. */
export const ICON_VARIANTS = ['white', 'light', 'dark'];

const toPosix = (p) => p.split(sep).join('/');
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every file under the brand-relative folder `rel` (recursively), as sorted brand-relative posix paths.
 * Dot files (.DS_Store, ...) are not brand files and are left out. [] when the folder does not exist.
 */
export function listFiles(brandDir, rel) {
  const root = resolve(brandDir);
  const start = resolveInside(root, rel);
  if (!start || !existsSync(start) || !statSync(start).isDirectory()) return [];
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const child = join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.push(toPosix(relative(root, child)));
    }
  };
  walk(start);
  return out.sort(byCodepoint);
}

/**
 * BR-ICONS (E5): the icon set of a folder named by icons.customPath. Every image file in it (recursively) is an icon
 * `{name, file, mime, width?, height?, variants}`; `<name>-white|-light|-dark.<ext>` is recorded under the variants of
 * `<name>.<ext>` when that file exists, else it is an icon of its own. `name` = the path inside the folder without the
 * extension. Sorted by name.
 */
export function iconSet(brandDir, folder) {
  const root = resolveInside(resolve(brandDir), folder);
  if (!root) return [];
  const base = toPosix(relative(resolve(brandDir), root));
  const files = listFiles(brandDir, folder).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()));
  const present = new Set(files);
  const icons = new Map();
  const variants = [];
  for (const file of files) {
    const ext = extname(file);
    const stem = file.slice(0, -ext.length);
    const m = stem.match(new RegExp(`^(.*)-(${ICON_VARIANTS.join('|')})$`));
    if (m && present.has(`${m[1]}${ext}`)) variants.push({ of: `${m[1]}${ext}`, kind: m[2], file });
    else icons.set(file, { file, name: stem.slice(base.length + 1) });
  }
  for (const icon of icons.values()) {
    const { asset } = inspectAsset(brandDir, icon.file);
    Object.assign(icon, asset, { variants: {} });
  }
  for (const v of variants) icons.get(v.of).variants[v.kind] = v.file;
  return [...icons.values()].sort((a, b) => byCodepoint(a.name, b.name));
}

/** Every string inside `value` (objects and arrays, recursively). */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value !== null && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

/** E6: a font file (by extension, anywhere) or any file in the fonts folder (assets/fonts/: files + their manifest). */
export function isFontFile(file) {
  return FONT_EXT.has(extname(file).toLowerCase()) || file.startsWith('assets/fonts/');
}

/**
 * BR-ASSET inventory (E6): files under `<brandDir>/assets/` that no string value of `data` names, either as the file
 * itself or as a folder holding it. Font files are left out (isFontFile: a face lists only the files it uses).
 * Returns sorted `[{file, size}]` (size in bytes).
 */
export function unreferencedAssets(brandDir, data) {
  const root = resolve(brandDir);
  const files = new Set();
  const folders = [];
  for (const s of strings(data)) {
    const abs = resolveInside(root, s);
    if (!abs || !existsSync(abs)) continue;
    const rel = toPosix(relative(root, abs));
    if (statSync(abs).isDirectory()) folders.push(`${rel}/`);
    else files.add(rel);
  }
  return listFiles(root, 'assets')
    .filter((f) => !isFontFile(f))
    .filter((f) => !files.has(f) && !folders.some((d) => f.startsWith(d)))
    .map((file) => ({ file, size: statSync(join(root, file)).size }));
}
