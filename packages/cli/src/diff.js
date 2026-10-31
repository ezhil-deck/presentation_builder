/**
 * `pb diff <dirA> <dirB> [--out <dir>]` (P3-spec §B): two build folders compared.
 * - JSON (`diffDecks(a, b)`, pure; the review UI server imports it): per slide the elements added / removed / changed
 *   (which keys differ, old → new for scalars, frames and `text.fit` summarised) and the deck-level changes (fonts,
 *   assets, engineVersion, …).
 * - Pixels (`pixelDiff`): every slides/NN.png present in both → pixelmatch (threshold 0.1) → `<out>/NN.png` (the diff
 *   mask) and the changed-pixel share; a slide over 0.1 % is listed. With changed slides, `diff.png`: a sheet
 *   (before | after | mask) via puppeteer, local only.
 * Writes diff.json + DIFF.md. Default out = <dirB>/diff/; a snapshot folder (golden/expected) is never written to.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import paths from './paths.cjs';

const { PNG } = pngjs;

export const DIFF_VERSION = '1.0.0';
/** pixelmatch per-pixel colour threshold (P3-spec §B). */
export const PIXEL_THRESHOLD = 0.1;
/** A slide whose changed-pixel share is above this is listed as changed (0.1 %). */
export const PIXEL_MIN_SHARE = 0.001;

const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keysOf = (...objs) =>
  [...new Set(objs.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))].sort();

/** Deep copy with object keys sorted (arrays keep their order). */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort())
      if (value[key] !== undefined) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/** One key that differs: scalars old → new; objects / arrays name their differing sub-keys. */
function keyChange(key, a, b) {
  if (a === undefined) return { key, change: 'added', ...(isScalar(b) ? { after: b } : {}) };
  if (b === undefined) return { key, change: 'removed', ...(isScalar(a) ? { before: a } : {}) };
  if (isScalar(a) && isScalar(b)) return { key, change: 'changed', before: a, after: b };
  const out = { key, change: 'changed' };
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.length = { before: a.length, after: b.length };
  } else if (!Array.isArray(a) && !Array.isArray(b) && typeof a === 'object' && typeof b === 'object') {
    out.parts = keysOf(a, b).filter((k) => !same(a[k], b[k]));
  }
  return out;
}

/** frame: only the fields that moved, old → new. */
function frameChange(a = {}, b = {}) {
  const fields = {};
  for (const k of keysOf(a, b))
    if (!same(a[k], b[k])) fields[k] = { before: a[k] ?? null, after: b[k] ?? null };
  return { key: 'frame', change: 'changed', fields };
}

const FIT_FIELDS = ['requestedSize', 'appliedSize', 'overflow', 'steps', 'upSteps', 'upRole', 'height'];

/** text: the sub-keys that differ, with the fit, the font scalars and the line count summarised. */
function textChange(a = {}, b = {}) {
  const out = { key: 'text', change: 'changed', parts: keysOf(a, b).filter((k) => !same(a[k], b[k])) };
  if (!same(a.fit, b.fit)) {
    const fit = {};
    for (const k of FIT_FIELDS)
      if (!same(a.fit?.[k], b.fit?.[k])) fit[k] = { before: a.fit?.[k] ?? null, after: b.fit?.[k] ?? null };
    out.fit = fit;
  }
  if (!same(a.font, b.font)) {
    const font = {};
    for (const k of keysOf(a.font, b.font)) {
      const x = a.font?.[k];
      const y = b.font?.[k];
      if (!same(x, y) && isScalar(x ?? null) && isScalar(y ?? null))
        font[k] = { before: x ?? null, after: y ?? null };
    }
    out.font = font;
  }
  if ((a.lines?.length ?? 0) !== (b.lines?.length ?? 0)) {
    out.lines = { before: a.lines?.length ?? 0, after: b.lines?.length ?? 0 };
  }
  const words = (t) =>
    (t.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? '').join('')).join('\n');
  if (words(a) !== words(b)) out.content = { before: words(a), after: words(b) };
  return out;
}

/** The keys that differ between two versions of one element. */
export function elementChanges(a, b) {
  const out = [];
  for (const k of keysOf(a, b)) {
    if (k === 'id' || same(a[k], b[k])) continue;
    if (k === 'frame' && a.frame && b.frame) out.push(frameChange(a.frame, b.frame));
    else if (k === 'text' && a.text && b.text) out.push(textChange(a.text, b.text));
    else out.push(keyChange(k, a[k], b[k]));
  }
  return out;
}

/** Elements of a slide by id (group children included, in order). */
function elementsById(slide) {
  const map = new Map();
  const walk = (els) => {
    for (const el of els ?? []) {
      if (el?.id !== undefined && !map.has(el.id)) map.set(el.id, el);
      if (Array.isArray(el?.children)) walk(el.children);
    }
  };
  walk(slide?.elements);
  return map;
}

const SLIDE_SKIP = new Set(['elements', 'warnings']);

/** One slide pair → its changes (null when identical). Slides pair by position (index). */
function slideDiff(a, b, index) {
  if (same(a, b)) return null;
  if (!a) return { index, id: b.id, kind: b.kind, status: 'added' };
  if (!b) return { index, id: a.id, kind: a.kind, status: 'removed' };
  const ea = elementsById(a);
  const eb = elementsById(b);
  const added = [...eb.keys()].filter((k) => !ea.has(k));
  const removed = [...ea.keys()].filter((k) => !eb.has(k));
  const changed = [...eb.keys()]
    .filter((k) => ea.has(k) && !same(ea.get(k), eb.get(k)))
    .map((k) => ({ id: k, changes: elementChanges(ea.get(k), eb.get(k)) }))
    .filter((c) => c.changes.length);
  const slideKeys = keysOf(a, b)
    .filter((k) => !SLIDE_SKIP.has(k) && !same(a[k], b[k]))
    .map((k) => keyChange(k, a[k], b[k]));
  const out = { index, id: b.id, kind: b.kind, status: 'changed', elements: { added, removed, changed } };
  if (slideKeys.length) out.slide = slideKeys;
  const wa = a.warnings?.length ?? 0;
  const wb = b.warnings?.length ?? 0;
  if (!same(a.warnings, b.warnings)) out.warnings = { before: wa, after: wb };
  if (!added.length && !removed.length && !same([...ea.keys()], [...eb.keys()]))
    out.elements.reordered = true;
  return out;
}

/** Deck-level changes: engineVersion, title, canvas, source, fonts (by family), assets (by id), warnings count. */
function deckChanges(a, b) {
  const out = [];
  for (const k of ['schema', 'id', 'title', 'engineVersion']) {
    if (!same(a[k], b[k])) out.push(keyChange(k, a[k], b[k]));
  }
  for (const k of ['canvas', 'source']) {
    if (same(a[k], b[k])) continue;
    const fields = {};
    for (const f of keysOf(a[k], b[k])) {
      if (!same(a[k]?.[f], b[k]?.[f])) fields[f] = { before: a[k]?.[f] ?? null, after: b[k]?.[f] ?? null };
    }
    out.push({ key: k, change: 'changed', fields });
  }
  if (!same(a.fonts, b.fonts)) {
    const fa = new Map((a.fonts ?? []).map((f) => [f.family, f]));
    const fb = new Map((b.fonts ?? []).map((f) => [f.family, f]));
    out.push({
      key: 'fonts',
      change: 'changed',
      added: [...fb.keys()].filter((k) => !fa.has(k)).sort(),
      removed: [...fa.keys()].filter((k) => !fb.has(k)).sort(),
      changed: [...fb.keys()].filter((k) => fa.has(k) && !same(fa.get(k), fb.get(k))).sort(),
    });
  }
  if (!same(a.assets, b.assets)) {
    const aa = a.assets ?? {};
    const ab = b.assets ?? {};
    const files = (ids, m) => ids.map((id) => ({ id, file: m[id]?.file ?? null }));
    out.push({
      key: 'assets',
      change: 'changed',
      added: files(
        Object.keys(ab)
          .filter((k) => !(k in aa))
          .sort(),
        ab,
      ),
      removed: files(
        Object.keys(aa)
          .filter((k) => !(k in ab))
          .sort(),
        aa,
      ),
      changed: files(
        Object.keys(ab)
          .filter((k) => k in aa && !same(aa[k], ab[k]))
          .sort(),
        ab,
      ),
    });
  }
  if (!same(a.warnings, b.warnings)) {
    out.push({
      key: 'warnings',
      change: 'changed',
      count: { before: a.warnings?.length ?? 0, after: b.warnings?.length ?? 0 },
    });
  }
  return out;
}

/**
 * diffDecks(a, b) → DeckDiff: `a` = before, `b` = after. Pure and deterministic (sorted keys); identical decks give
 * `identical: true` and no slide entries.
 */
export function diffDecks(a, b) {
  const sa = a?.slides ?? [];
  const sb = b?.slides ?? [];
  const slides = [];
  for (let i = 0; i < Math.max(sa.length, sb.length); i += 1) {
    const d = slideDiff(sa[i], sb[i], i + 1);
    if (d) slides.push(d);
  }
  const deck = deckChanges(a ?? {}, b ?? {});
  const count = (key) => slides.reduce((n, s) => n + (s.elements?.[key]?.length ?? 0), 0);
  return sortKeys({
    kind: 'DeckDiff',
    version: DIFF_VERSION,
    a: { id: a?.id ?? null, engineVersion: a?.engineVersion ?? null, slides: sa.length },
    b: { id: b?.id ?? null, engineVersion: b?.engineVersion ?? null, slides: sb.length },
    identical: !deck.length && !slides.length,
    summary: {
      deckChanges: deck.length,
      slidesChanged: slides.length,
      slidesAdded: slides.filter((s) => s.status === 'added').length,
      slidesRemoved: slides.filter((s) => s.status === 'removed').length,
      elements: { added: count('added'), removed: count('removed'), changed: count('changed') },
    },
    deck,
    slides,
  });
}

/** The slides/NN.png names in a build folder, sorted. */
export function slidePngs(dir) {
  const d = join(dir, 'slides');
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort();
}

/**
 * Pixel diff of the slide PNGs present in both folders → masks `<outDir>/NN.png`. Returns { compared, changed: [{ n,
 * file, share, pixels, width, height, sizeDiffers? }], slides: [ every compared slide ], onlyA, onlyB }.
 */
export function pixelDiff(
  dirA,
  dirB,
  outDir,
  { threshold = PIXEL_THRESHOLD, minShare = PIXEL_MIN_SHARE } = {},
) {
  const a = slidePngs(dirA);
  const b = slidePngs(dirB);
  const both = a.filter((f) => b.includes(f));
  const slides = [];
  if (both.length) mkdirSync(outDir, { recursive: true });
  for (const file of both) {
    const n = Number(file.replace(/\.png$/, ''));
    const ia = PNG.sync.read(readFileSync(join(dirA, 'slides', file)));
    const ib = PNG.sync.read(readFileSync(join(dirB, 'slides', file)));
    if (ia.width !== ib.width || ia.height !== ib.height) {
      slides.push({ n, file, share: 1, pixels: null, width: ib.width, height: ib.height, sizeDiffers: true });
      continue;
    }
    const mask = new PNG({ width: ia.width, height: ia.height });
    const pixels = pixelmatch(ia.data, ib.data, mask.data, ia.width, ia.height, { threshold });
    writeFileSync(join(outDir, file), PNG.sync.write(mask));
    slides.push({
      n,
      file,
      share: pixels / (ia.width * ia.height),
      pixels,
      width: ia.width,
      height: ia.height,
    });
  }
  return {
    compared: both.length,
    slides,
    changed: slides.filter((s) => s.share > minShare),
    onlyA: a.filter((f) => !b.includes(f)),
    onlyB: b.filter((f) => !a.includes(f)),
  };
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Relative URL from `fromDir` to `file`, forward slashes. */
const relUrl = (fromDir, file) => relative(resolve(fromDir), resolve(file)).split(sep).join('/');

/**
 * The diff sheet (compareSheet-style): one row per changed slide — before | after | mask, each 560 px wide, captioned
 * with the slide number and its changed share — screenshotted with puppeteer to `outFile`.
 */
export async function diffSheet(rows, outFile, { title = '', browser } = {}) {
  const thumbW = 560;
  const thumbH = 315;
  const gap = 16;
  const width = 3 * thumbW + 4 * gap;
  const dir = dirname(resolve(outFile));
  const fig = (f, cap) =>
    f
      ? `<figure><img src="${escapeHtml(relUrl(dir, f))}"><figcaption>${cap}</figcaption></figure>`
      : `<figure><div class="none">no mask (sizes differ)</div><figcaption>${cap}</figcaption></figure>`;
  const body = rows
    .map(
      (r) =>
        `<section><div class="cap">${escapeHtml(r.caption)}</div><div class="row">` +
        `${fig(r.before, 'before')}${fig(r.after, 'after')}${fig(r.mask, 'mask')}</div></section>`,
    )
    .join('');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    `html,body{margin:0;background:#E9E9EC;font:14px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#222;width:${width}px}` +
    `h1{font-size:18px;margin:0;padding:${gap}px}section{padding:0 ${gap}px ${gap}px}` +
    `.cap{height:28px;line-height:28px;font-weight:600}.row{display:grid;grid-template-columns:repeat(3,${thumbW}px);gap:${gap}px}` +
    `figure{margin:0}img,.none{display:block;width:${thumbW}px;height:${thumbH}px;box-shadow:0 0 0 1px #BBB;background:#fff}` +
    `.none{display:flex;align-items:center;justify-content:center;color:#999}figcaption{color:#666;font-size:12px;padding-top:4px}` +
    `</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
  const tmp = join(dir, `.pb-diff-${process.pid}.html`);
  writeFileSync(tmp, html);
  const { default: puppeteer } = await import('puppeteer');
  const own = !browser;
  const b = browser ?? (await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] }));
  try {
    const page = await b.newPage();
    await page.setViewport({ width, height: 400, deviceScaleFactor: 1 });
    await page.goto(`file://${tmp}`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: resolve(outFile), type: 'png', fullPage: true });
    await page.close();
  } finally {
    if (own) await b.close();
    rmSync(tmp, { force: true });
  }
  return { file: resolve(outFile), width, rows: rows.length };
}

const pct = (share) => `${Math.round(share * 10000) / 100} %`;
const show = (v) => (v === undefined || v === null ? '—' : typeof v === 'string' ? `"${v}"` : String(v));

/** One element / slide key change as a short Markdown phrase. */
function changeText(c) {
  if (c.key === 'frame') {
    return `frame (${Object.entries(c.fields)
      .map(([k, v]) => `${k} ${show(v.before)} → ${show(v.after)}`)
      .join(', ')})`;
  }
  if (c.key === 'text') {
    const bits = [];
    for (const [k, v] of Object.entries(c.fit ?? {}))
      bits.push(`fit.${k} ${show(v.before)} → ${show(v.after)}`);
    for (const [k, v] of Object.entries(c.font ?? {}))
      bits.push(`font.${k} ${show(v.before)} → ${show(v.after)}`);
    if (c.lines) bits.push(`lines ${c.lines.before} → ${c.lines.after}`);
    if (c.content) bits.push('content');
    const rest = c.parts.filter((p) => !['fit', 'font', 'lines', 'paragraphs'].includes(p));
    return `text (${[...bits, ...rest].join(', ') || c.parts.join(', ')})`;
  }
  if (c.change === 'changed' && 'before' in c) return `${c.key} ${show(c.before)} → ${show(c.after)}`;
  if (c.parts) return `${c.key} (${c.parts.join(', ')})`;
  if (c.length) return `${c.key} (length ${c.length.before} → ${c.length.after})`;
  return `${c.key} ${c.change}`;
}

/** DIFF.md: the JSON diff and the pixel diff summarised for a person. */
export function diffMarkdown({ diff, pixels, labelA, labelB, sheet }) {
  const s = diff.summary;
  const lines = [
    `# Deck diff`,
    '',
    `- before (A): \`${labelA}\` — ${diff.a.id} · engine ${diff.a.engineVersion} · ${diff.a.slides} slides`,
  ];
  lines.push(
    `- after (B): \`${labelB}\` — ${diff.b.id} · engine ${diff.b.engineVersion} · ${diff.b.slides} slides`,
    '',
  );
  if (diff.identical) lines.push('**The decks are identical.**');
  else {
    lines.push(
      `**${s.slidesChanged} slide(s) differ** (added ${s.slidesAdded}, removed ${s.slidesRemoved}); elements: ` +
        `${s.elements.added} added, ${s.elements.removed} removed, ${s.elements.changed} changed; ${s.deckChanges} deck-level change(s).`,
    );
  }
  if (diff.deck.length) {
    lines.push('', '## Deck');
    for (const c of diff.deck) {
      if (c.key === 'fonts' || c.key === 'assets') {
        const name = (x) => (typeof x === 'string' ? x : (x.file ?? x.id));
        lines.push(
          `- ${c.key}: added ${c.added.map(name).join(', ') || '—'}; removed ${c.removed.map(name).join(', ') || '—'}; changed ${c.changed.map(name).join(', ') || '—'}`,
        );
      } else if (c.key === 'warnings') lines.push(`- warnings: ${c.count.before} → ${c.count.after}`);
      else if (c.fields) {
        const f = Object.entries(c.fields).map(([k, v]) => `${k} ${show(v.before)} → ${show(v.after)}`);
        lines.push(`- ${c.key}: ${f.join(', ')}`);
      } else lines.push(`- ${changeText(c)}`);
    }
  }
  if (diff.slides.length) {
    lines.push('', '## Slides');
    for (const sl of diff.slides) {
      lines.push('', `### ${sl.index} · ${sl.kind ?? '?'} (${sl.id}) — ${sl.status}`);
      if (sl.status !== 'changed') continue;
      for (const c of sl.slide ?? []) lines.push(`- slide ${changeText(c)}`);
      if (sl.warnings) lines.push(`- warnings ${sl.warnings.before} → ${sl.warnings.after}`);
      if (sl.elements.added.length)
        lines.push(`- added: ${sl.elements.added.map((x) => `\`${x}\``).join(', ')}`);
      if (sl.elements.removed.length)
        lines.push(`- removed: ${sl.elements.removed.map((x) => `\`${x}\``).join(', ')}`);
      for (const e of sl.elements.changed)
        lines.push(`- \`${e.id}\`: ${e.changes.map(changeText).join('; ')}`);
      if (sl.elements.reordered) lines.push('- elements reordered');
    }
  }
  lines.push('', '## Pixels');
  if (!pixels.compared) lines.push('No slide PNGs on both sides (JSON diff only).');
  else {
    lines.push(
      `${pixels.compared} slide PNG(s) compared (pixelmatch threshold ${PIXEL_THRESHOLD}); ` +
        `${pixels.changed.length} changed by more than ${pct(PIXEL_MIN_SHARE)}.`,
    );
    if (pixels.changed.length) {
      lines.push('', '| slide | changed pixels | share | mask |', '|---|---|---|---|');
      for (const c of pixels.changed) {
        lines.push(
          `| ${c.n} | ${c.pixels ?? '—'} | ${c.sizeDiffers ? 'size differs' : pct(c.share)} | ${c.sizeDiffers ? '—' : `[${c.file}](${c.file})`} |`,
        );
      }
    }
    if (sheet) lines.push('', `Sheet: [diff.png](diff.png) (before | after | mask).`);
  }
  if (pixels.onlyA?.length || pixels.onlyB?.length) {
    lines.push(
      '',
      `PNG only in A: ${pixels.onlyA.join(', ') || '—'}; only in B: ${pixels.onlyB.join(', ') || '—'}.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const inside = (child, parent) => {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
};

/**
 * The output folder: `--out`, else <dirB>/diff. A golden snapshot folder is never written to: a default inside
 * golden/expected falls back to <dirA>/diff; an explicit --out there is an error.
 */
export function diffOutDir(dirA, dirB, out, { expectedDir = paths.GOLDEN_EXPECTED } = {}) {
  if (out) {
    if (inside(out, expectedDir)) {
      const err = new Error(
        `pb diff: --out ${out} is inside golden/expected (snapshots are written by --snapshot only)`,
      );
      err.exitCode = 1;
      throw err;
    }
    return { outDir: resolve(out), note: null };
  }
  const def = join(resolve(dirB), 'diff');
  if (!inside(def, expectedDir)) return { outDir: def, note: null };
  const alt = join(resolve(dirA), 'diff');
  if (inside(alt, expectedDir)) {
    const err = new Error('pb diff: both folders are golden snapshots: give --out <dir>');
    err.exitCode = 1;
    throw err;
  }
  const rel = (p) => relative(process.cwd(), p) || '.';
  return { outDir: alt, note: `B is a golden snapshot: wrote to ${rel(alt)} instead of ${rel(def)}` };
}

/**
 * `pb diff`: deck.json of both folders → diff.json + DIFF.md (+ NN.png masks, diff.png) in the output folder.
 * Returns { outDir, files, diff, pixels, note }.
 */
export async function runDiff(dirA, dirB, { out, sheet = true, expectedDir } = {}) {
  for (const d of [dirA, dirB]) {
    if (!existsSync(join(d, 'deck.json'))) {
      const err = new Error(`pb diff: ${d}/deck.json is missing`);
      err.exitCode = 1;
      throw err;
    }
  }
  const read = (d) => JSON.parse(readFileSync(join(d, 'deck.json'), 'utf8'));
  const diff = diffDecks(read(dirA), read(dirB));
  const { outDir, note } = diffOutDir(dirA, dirB, out, expectedDir ? { expectedDir } : {});
  mkdirSync(outDir, { recursive: true });
  const pixels = pixelDiff(dirA, dirB, outDir);
  const files = ['diff.json', 'DIFF.md', ...pixels.slides.filter((s) => !s.sizeDiffers).map((s) => s.file)];
  let sheetFile = null;
  if (sheet && pixels.changed.length) {
    const rows = pixels.changed.map((c) => ({
      before: join(dirA, 'slides', c.file),
      after: join(dirB, 'slides', c.file),
      mask: c.sizeDiffers ? null : join(outDir, c.file),
      caption: `${c.n} · ${c.sizeDiffers ? 'size differs' : `${pct(c.share)} of pixels changed`}`,
    }));
    await diffSheet(rows, join(outDir, 'diff.png'), {
      title: `${diff.b.id}: ${rows.length} changed slide(s) — before | after | mask`,
    });
    sheetFile = 'diff.png';
    files.push('diff.png');
  }
  const labelA = relative(process.cwd(), resolve(dirA)) || '.';
  const labelB = relative(process.cwd(), resolve(dirB)) || '.';
  const pixelSummary = {
    compared: pixels.compared,
    threshold: PIXEL_THRESHOLD,
    minShare: PIXEL_MIN_SHARE,
    changed: pixels.changed.map((c) => ({ ...c, share: Math.round(c.share * 1e6) / 1e6 })),
    onlyA: pixels.onlyA,
    onlyB: pixels.onlyB,
  };
  writeFileSync(
    join(outDir, 'diff.json'),
    `${JSON.stringify(sortKeys({ ...diff, pixels: pixelSummary }), null, 2)}\n`,
  );
  writeFileSync(join(outDir, 'DIFF.md'), diffMarkdown({ diff, pixels, labelA, labelB, sheet: sheetFile }));
  return { outDir, files, diff, pixels, note };
}

/** The one-line summary `pb diff` prints. */
export function diffSummaryLine({ diff, pixels }) {
  const s = diff.summary;
  const json = diff.identical
    ? `identical (${diff.b.slides} slides)`
    : `${s.slidesChanged} slide(s) differ (elements +${s.elements.added} -${s.elements.removed} ~${s.elements.changed}), ${s.deckChanges} deck-level change(s)`;
  const px = pixels.compared
    ? `; pixels: ${pixels.compared} compared, ${pixels.changed.length} changed > ${pct(PIXEL_MIN_SHARE)}`
    : '; pixels: none (no PNGs on both sides)';
  return `${json}${px}`;
}
