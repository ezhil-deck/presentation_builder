/** deck.assets: id = sha1(path) -> {file, mime, width?, height?}; dimensions come from the BrandSpec when it has them. */
import { sha1 } from '../util/stable.js';

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
const SKIP = new Set(['provenance', 'questions', 'warnings', 'unreferencedAssets']);

/** file path -> {mime, width, height} from every BrandSpec object that names a `file` (first in sorted-key order). */
export function brandAssetIndex(brandSpec) {
  const index = new Map();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (typeof v.file === 'string' && !index.has(v.file)) {
      const width = v.width ?? v.w;
      const height = v.height ?? v.h;
      if (Number.isFinite(width) && Number.isFinite(height)) {
        index.set(v.file, {
          width: Math.round(width),
          height: Math.round(height),
          ...(v.mime ? { mime: v.mime } : {}),
        });
      }
    }
    for (const key of Object.keys(v).sort()) if (!SKIP.has(key)) walk(v[key]);
  };
  walk(brandSpec ?? {});
  return index;
}

export function createAssets(brandSpec) {
  const index = brandAssetIndex(brandSpec);
  const map = {};
  return {
    map,
    info: (file) => index.get(file) ?? null,
    add(file) {
      const id = sha1(file);
      if (!map[id]) {
        const ext = /\.([A-Za-z0-9]+)$/.exec(file)?.[1]?.toLowerCase();
        const info = index.get(file);
        const entry = { file };
        const mime = info?.mime ?? MIME[ext];
        if (mime) entry.mime = mime;
        if (info) {
          entry.width = info.width;
          entry.height = info.height;
        }
        map[id] = entry;
      }
      return id;
    },
  };
}
