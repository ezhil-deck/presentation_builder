/**
 * BR-FONTFILES: the font files of a face, resolved under the brand folder.
 * BR-METRICS: metrics per 1 em read with fontkit from the first normal-style file, cached by file sha256.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import * as fontkit from 'fontkit';
import { resolveInside } from './assets.js';
import paths from './paths.cjs';

const METRICS_VERSION = 1;
const FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'ttf', '.otf': 'otf' };
const GOOGLE_DIR = 'assets/fonts/google';

function formatOf(file) {
  return FORMATS[extname(file).toLowerCase()];
}

function fontFile(file, weight, style) {
  const out = { file };
  const format = formatOf(file);
  if (format) out.format = format;
  if (weight !== undefined && weight !== null) out.weight = String(weight);
  out.style = style === 'italic' ? 'italic' : 'normal';
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Font files of one input font (typography.fonts[k]).
 * - source `google`: `assets/fonts/google/<Family>-normal-<min>-<max>-latin.woff2` (+ `-italic-`), Family without spaces;
 * - source `system`: no files;
 * - any other source (`file`, or none given): each `files[].url`, else `url`.
 * Returns `{ files, variable, missing: [{file, pointer}], fromPointer }`; `files` holds only files that exist.
 */
export function resolveFaceFiles(brandDir, key, font) {
  const base = `/typography/fonts/${key}`;
  const files = [];
  const missing = [];
  let fromPointer = base;

  if (font.source === 'system') {
    return { files, variable: false, missing, fromPointer: `${base}/source` };
  }

  if (font.source === 'google') {
    fromPointer = `${base}/family`;
    const family = String(font.family).replace(/\s+/g, '');
    const dir = join(brandDir, GOOGLE_DIR);
    const pattern = new RegExp(`^${escapeRegExp(family)}-(normal|italic)-(\\d+)-(\\d+)-latin\\.woff2$`);
    const found = existsSync(dir)
      ? readdirSync(dir)
          .map((name) => ({ name, m: name.match(pattern) }))
          .filter((x) => x.m)
      : [];
    const order = (x) => [x.m[1] === 'normal' ? 0 : 1, Number(x.m[2]), Number(x.m[3])];
    found.sort((a, b) => {
      const [p, q] = [order(a), order(b)];
      return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
    });
    for (const { name, m } of found) {
      const weight = m[2] === m[3] ? m[2] : `${m[2]} ${m[3]}`;
      files.push(fontFile(`${GOOGLE_DIR}/${name}`, weight, m[1]));
    }
    if (!found.length)
      missing.push({ file: `${GOOGLE_DIR}/${family}-normal-<min>-<max>-latin.woff2`, pointer: fromPointer });
  } else {
    const listed = Array.isArray(font.files)
      ? font.files.map((f, i) => ({
          url: f.url,
          weight: f.weight,
          style: f.style,
          pointer: `${base}/files/${i}/url`,
        }))
      : font.url !== undefined
        ? [{ url: font.url, weight: font.weight, style: font.style, pointer: `${base}/url` }]
        : [];
    fromPointer = Array.isArray(font.files) ? `${base}/files` : `${base}/url`;
    for (const f of listed) {
      const abs = resolveInside(brandDir, f.url);
      if (abs && existsSync(abs)) files.push(fontFile(f.url, f.weight, f.style));
      else missing.push({ file: String(f.url), pointer: f.pointer });
    }
  }

  const variable = files.some((f) => typeof f.weight === 'string' && f.weight.trim().includes(' '));
  return { files, variable, missing, fromPointer };
}

// ---------------------------------------------------------------------------------------------- BR-METRICS

const round = (n) => Math.round(n * 1e6) / 1e6;

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function glyphId(font, cp) {
  // fontkit's cmap lookup (no glyph decoding: WOFF2 + variations decoding is broken in fontkit 2.0.4).
  if (font._cmapProcessor && typeof font._cmapProcessor.lookup === 'function')
    return font._cmapProcessor.lookup(cp);
  return font.glyphForCodePoint(cp).id;
}

function baseAdvance(font, gid) {
  const metrics = font.hmtx.metrics;
  return gid < metrics.length ? metrics.get(gid).advance : metrics.get(metrics.length - 1).advance;
}

function wghtAxis(font) {
  const axes = font.fvar?.axis ?? [];
  const index = axes.findIndex((a) => a.axisTag.trim() === 'wght');
  return index < 0
    ? null
    : { index, min: axes[index].minValue, default: axes[index].defaultValue, max: axes[index].maxValue };
}

function instanceName(font, nameID) {
  try {
    const records = font.name?.records?.fontFeatures?.[nameID];
    return records?.en ?? (records ? Object.values(records)[0] : undefined);
  } catch {
    return undefined;
  }
}

/**
 * The variation instance to measure: the named instances' weights (read from fvar) plus the default, the one
 * closest to `weight` (ties -> the lighter). No `weight` -> the default instance. Returns `{ wght, name }`, or null
 * when the font has no wght axis.
 */
export function pickInstance(font, weight) {
  const axis = wghtAxis(font);
  if (!axis) return null;
  const candidates = [{ wght: axis.default, name: 'default' }];
  for (const inst of font.fvar.instance ?? []) {
    const wght = inst.coord?.[axis.index];
    if (typeof wght === 'number')
      candidates.push({ wght, name: instanceName(font, inst.nameID) ?? `wght ${wght}` });
  }
  if (typeof weight !== 'number') return candidates[0];
  let best = candidates[0];
  for (const c of candidates) {
    const d = Math.abs(c.wght - weight);
    const bd = Math.abs(best.wght - weight);
    if (d < bd || (d === bd && c.wght < best.wght)) best = c;
  }
  return best;
}

/**
 * Advance function (glyph id -> font units) for the given instance. Uses hmtx + HVAR deltas (works for WOFF2);
 * a variable font without HVAR falls back to fontkit's getVariation (TTF/OTF only). Returns `{ advance, warning? }`.
 */
function advanceFn(path, font, instance) {
  if (!instance || instance.wght === wghtAxis(font).default) {
    return { advance: (gid) => baseAdvance(font, gid) };
  }
  const settings = { wght: instance.wght };
  if (font.HVAR) {
    const varied = fontkit.openSync(path);
    varied.variationCoords = varied.fvar.axis.map((a) => {
      const tag = a.axisTag.trim();
      return tag in settings ? Math.max(a.minValue, Math.min(a.maxValue, settings[tag])) : a.defaultValue;
    });
    const processor = varied._variationProcessor;
    return { advance: (gid) => baseAdvance(varied, gid) + processor.getAdvanceAdjustment(gid, varied.HVAR) };
  }
  try {
    const varied = font.getVariation(settings);
    varied.glyphForCodePoint(0x41).advanceWidth; // probe
    return { advance: (gid) => varied.getGlyph(gid).advanceWidth };
  } catch (err) {
    return {
      advance: (gid) => baseAdvance(font, gid),
      warning: `variable font without HVAR: instance wght ${instance.wght} could not be read (${err.message}); measured the default instance`,
    };
  }
}

function measure(path, weight) {
  const font = fontkit.openSync(path);
  if (Array.isArray(font.fonts)) throw new Error('font collections are not supported');
  const upm = font.unitsPerEm;
  const instance = pickInstance(font, weight);
  const { advance, warning } = advanceFn(path, font, instance);
  const widths = {};
  for (let cp = 0x20; cp <= 0xff; cp += 1) {
    if (!font.hasGlyphForCodePoint(cp)) continue;
    widths[String(cp)] = round(advance(glyphId(font, cp)) / upm);
  }
  let sum = 0;
  let count = 0;
  for (let cp = 0x61; cp <= 0x7a; cp += 1) {
    if (widths[String(cp)] !== undefined) {
      sum += widths[String(cp)];
      count += 1;
    }
  }
  const metrics = {
    unitsPerEm: upm,
    ascent: round(font.ascent / upm),
    descent: round(font.descent / upm),
    lineGap: round(font.lineGap / upm),
    capHeight: round(font.capHeight / upm),
    xHeight: round(font.xHeight / upm),
    widths,
  };
  if (count) metrics.avgCharWidth = round(sum / count);
  if (instance) metrics.instance = { wght: round(instance.wght), name: instance.name };
  return { metrics, warning };
}

function readCache(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data.version === METRICS_VERSION ? data : null;
  } catch {
    return null;
  }
}

/**
 * Metrics of one font file at the instance closest to `weight` (variable fonts; static fonts ignore it).
 * Cached under `.cache/fontmetrics/<sha256>.json` (one entry per instance key).
 * Returns `{ metrics, warning? }`; `metrics` has no `file` (the caller names it).
 */
export function fontMetrics(path, { weight, cacheDir = paths.FONT_METRICS_CACHE_DIR } = {}) {
  const sha = sha256File(path);
  const key = typeof weight === 'number' ? `w${weight}` : 'default';
  const cacheFile = cacheDir ? join(cacheDir, `${sha}.json`) : null;
  const cached = cacheFile ? readCache(cacheFile) : null;
  if (cached?.instances?.[key]) return cached.instances[key];

  const result = measure(path, weight);
  if (cacheFile) {
    const data = cached ?? { version: METRICS_VERSION, sha256: sha, instances: {} };
    data.instances[key] = result;
    mkdirSync(cacheDir, { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data)}\n`);
    renameSync(tmp, cacheFile);
  }
  return result;
}

/**
 * BR-METRICS for one face: the first normal-style file, at the instance closest to the face's first listed weight.
 * Returns `{ metrics?, warnings: [] }`.
 */
export function faceMetrics(brandDir, face, options = {}) {
  const warnings = [];
  const first = (face.files ?? []).find((f) => f.style !== 'italic');
  if (!first) {
    if ((face.files ?? []).length) warnings.push('no normal-style font file: metrics not read');
    return { warnings };
  }
  const weight = Array.isArray(face.weights) && face.weights.length ? face.weights[0] : undefined;
  try {
    const { metrics, warning } = fontMetrics(join(brandDir, first.file), { ...options, weight });
    if (warning) warnings.push(warning);
    return { metrics: { ...metrics, file: first.file }, warnings };
  } catch (err) {
    warnings.push(`font file could not be read (${first.file}): ${err.message}`);
    return { warnings };
  }
}
