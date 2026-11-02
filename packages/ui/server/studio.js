// The Studio's server side (docs/PLAN-studio.md §2.1, ST-1 / ST-2): every brand under golden/brands/ derived once
// and kept in memory ({brandSpec, mood} with font metrics), the content list (the showcase + content/*.md), the live
// compose (content + per-slide overrides + the brand's Mood -> Deck + checks), the overrides files
// (content/overrides/<contentId>.<brandId>.json) and the export of a composed deck. The engine is the one in Node;
// the browser only paints what this returns.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { deriveBrand, runRender, slideTable } from '@pb/cli';
import { runChecks } from '@pb/checks';
import { filesFrom } from '@pb/checks/files';
import { composeDeck, parseMarkdownResult } from '@pb/engine';
import { catalogue } from '@pb/layouts';

/** The engine version a Studio deck carries (the CLI's ENGINE_VERSION; build.js is not exported by @pb/cli). */
export const STUDIO_ENGINE_VERSION = '0.3.0';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OVERRIDE_KEYS = new Set(['surface', 'layout', 'decor', 'logo']);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ms = (t0) => Math.round((performance.now() - t0) * 100) / 100;

export class StudioError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function statOrNull(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

/** The title of a Markdown deck: front matter `title:`, else its first `# ` heading, else the file name. */
export function markdownTitle(md, fallback) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const t = fm && /^title:\s*(.+)$/m.exec(fm[1]);
  if (t) return t[1].trim().replace(/^["']|["']$/g, '');
  const h = /^#\s+(.+)$/m.exec(md);
  return h ? h[1].trim() : fallback;
}

/**
 * Overrides as stored / sent: `{slides: {[contentSlideId]: {surface?, layout?, decor?: false, logo?: false}}}`.
 * Returns the normalised form (defaults dropped: decor / logo true, empty entries) or throws 400.
 */
export function normalizeOverrides(value) {
  if (value === undefined || value === null) return { slides: {} };
  if (typeof value !== 'object' || Array.isArray(value))
    throw new StudioError(400, 'overrides must be an object');
  const slides = value.slides ?? {};
  if (typeof slides !== 'object' || Array.isArray(slides)) {
    throw new StudioError(400, 'overrides.slides must be an object of slide id -> override');
  }
  const out = {};
  for (const id of Object.keys(slides).sort()) {
    const o = slides[id];
    if (o === null || o === undefined) continue;
    if (typeof o !== 'object' || Array.isArray(o))
      throw new StudioError(400, `overrides.slides.${id} must be an object`);
    const entry = {};
    for (const [k, v] of Object.entries(o)) {
      if (!OVERRIDE_KEYS.has(k)) throw new StudioError(400, `overrides.slides.${id}.${k}: unknown override`);
      if (v === null || v === undefined) continue;
      if (k === 'surface' || k === 'layout') {
        if (typeof v !== 'string' || !v)
          throw new StudioError(400, `overrides.slides.${id}.${k} must be a string`);
        if (k === 'layout' && !catalogue.get(v)) {
          throw new StudioError(400, `overrides.slides.${id}.layout: "${v}" is not in the layout catalogue`);
        }
        entry[k] = v;
      } else {
        if (typeof v !== 'boolean')
          throw new StudioError(400, `overrides.slides.${id}.${k} must be a boolean`);
        if (v === false) entry[k] = false;
      }
    }
    if (Object.keys(entry).length) out[id] = entry;
  }
  return { slides: out };
}

/** The content slides with the overrides set on them (the engine reads `surface`, `layout`, `decor`, `logo`). */
export function applyOverrides(content, overrides, mood) {
  const notes = [];
  const surfaces = new Set((mood?.palette?.surfaces ?? []).map((s) => s.id));
  const slides = overrides?.slides ?? {};
  const known = new Set(content.slides.map((s) => s.id));
  for (const id of Object.keys(slides)) {
    if (!known.has(id))
      notes.push({
        check: 'override',
        severity: 'info',
        message: `override for unknown slide "${id}" ignored`,
      });
  }
  return {
    content: {
      ...content,
      slides: content.slides.map((s) => {
        const o = slides[s.id];
        if (!o) return s;
        const next = { ...s };
        if (o.surface) {
          if (surfaces.has(o.surface)) next.surface = o.surface;
          else
            notes.push({
              check: 'override',
              severity: 'warn',
              slide: s.id,
              message: `surface "${o.surface}" is not one of this brand's surfaces: ignored`,
            });
        }
        if (o.layout) next.layout = o.layout;
        if (o.decor === false) next.decor = false;
        if (o.logo === false) next.logo = false;
        return next;
      }),
    },
    notes,
  };
}

/** The main logo file of a Mood (variants.full, else the first variant with a file), repo-relative to the brand. */
function mainLogo(mood) {
  const variants = mood?.logo?.variants ?? {};
  const v = variants.full?.file ? variants.full : Object.values(variants).find((x) => x?.file);
  return v?.file ?? null;
}

/**
 * The Studio over one repository: `root` holds golden/brands/, golden/showcase/showcase.md, content/ and out/.
 * `cacheDir` is passed to deriveBrand when given (default: the brand reader's own font metrics cache);
 * `derive` replaces deriveBrand (tests).
 */
export function createStudio({ root, cacheDir, derive = deriveBrand, loadDiff } = {}) {
  const brandsRoot = join(root, 'golden', 'brands');
  const expectedRoot = join(root, 'golden', 'expected');
  const showcaseFile = join(root, 'golden', 'showcase', 'showcase.md');
  const contentRoot = join(root, 'content');
  const overridesRoot = join(contentRoot, 'overrides');
  const outRoot = join(root, 'out');
  const cache = new Map(); // id -> {key, derived, ms, derivedAt}
  const exports = new Map(); // brandId -> running promise

  const brandDir = (id) => join(brandsRoot, id);
  const rel = (p) => relative(root, p).split(sep).join('/');

  function brandIds() {
    try {
      return readdirSync(brandsRoot, { withFileTypes: true })
        .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && ID.test(d.name) && !d.name.startsWith('_'))
        .map((d) => d.name)
        .filter((id) => existsSync(join(brandsRoot, id, `${id}.json`)))
        .sort();
    } catch {
      return [];
    }
  }

  function requireId(id, what = 'brand') {
    if (typeof id !== 'string' || !ID.test(id) || id.startsWith('_'))
      throw new StudioError(400, `bad ${what} id "${id}"`);
  }

  /** The cache key of a brand's inputs: the input json and answers.json (mtime + size, sha on change). */
  function inputKey(id) {
    const files = [join(brandDir(id), `${id}.json`), join(brandDir(id), 'answers.json')];
    return files
      .map((f) => {
        const st = statOrNull(f);
        return st ? `${st.mtimeMs}:${st.size}` : '-';
      })
      .join('|');
  }

  function inputSha(id) {
    const files = [join(brandDir(id), `${id}.json`), join(brandDir(id), 'answers.json')];
    return sha256(files.map((f) => (existsSync(f) ? readFileSync(f) : Buffer.alloc(0))).join('\0'));
  }

  /** The derived brand (from the cache unless the input changed or `force`). Throws 404 for an unknown brand. */
  function brand(id, { force = false } = {}) {
    requireId(id);
    if (!existsSync(join(brandDir(id), `${id}.json`)))
      throw new StudioError(404, `no brand input golden/brands/${id}/${id}.json`);
    const key = inputKey(id);
    const hit = cache.get(id);
    if (hit && !force) {
      if (hit.key === key) return hit;
      // touched but identical bytes: keep the derived brand
      const sha = inputSha(id);
      if (sha === hit.sha) {
        hit.key = key;
        return hit;
      }
    }
    const t0 = performance.now();
    let derived;
    try {
      derived = derive(brandDir(id), cacheDir === undefined ? {} : { cacheDir });
    } catch (err) {
      derived = {
        brandSpec: null,
        mood: null,
        questions: [],
        warnings: [],
        errors: [{ source: 'studio', pointer: '', message: err.message }],
        exitCode: 1,
      };
    }
    const entry = { key, sha: inputSha(id), derived, ms: ms(t0), derivedAt: new Date().toISOString() };
    cache.set(id, entry);
    return entry;
  }

  /** Derive every brand (the server's warm-up). */
  function warm() {
    for (const id of brandIds()) brand(id);
  }

  function brandSummary(id) {
    const { derived, ms: deriveMs, derivedAt } = brand(id);
    const { mood, brandSpec, questions = [], errors = [] } = derived;
    const blocking = questions.filter((q) => q.severity === 'blocking').length;
    const logo = mainLogo(mood);
    const faces = mood?.type?.faces ?? {};
    const roles = mood?.type?.roles ?? {};
    const family = (...roleNames) => {
      for (const r of roleNames) {
        const face = faces[roles[r]?.face];
        if (face?.family) return face.family;
      }
      return null;
    };
    const pal = mood?.palette?.brand ?? {};
    return {
      id,
      name: brandSpec?.name ?? mood?.name ?? id,
      ok: Boolean(mood),
      logo: logo
        ? `/files/brands/${encodeURIComponent(id)}/${logo.split('/').map(encodeURIComponent).join('/')}`
        : null,
      colours: [pal.primary, pal.secondary, pal.accent].filter((c) => typeof c === 'string'),
      accent: typeof pal.accent === 'string' ? pal.accent : null,
      surfaces: (mood?.palette?.surfaces ?? []).map((s) => ({
        id: s.id,
        bg: s.bg,
        text: s.text,
        heading: s.heading ?? s.text,
        accent: s.accent,
        tone: s.tone ?? null,
      })),
      rhythm: mood?.palette?.rhythm ?? [],
      fonts: { heading: family('h1', 'display'), body: family('body') },
      geometry: mood?.geometry
        ? { margins: mood.geometry.margins ?? null, titleZone: mood.geometry.titleZone ?? null }
        : null,
      questions: { blocking, total: questions.length },
      errors: errors.map((e) => e.message),
      deriveMs: deriveMs,
      derivedAt,
    };
  }

  function brands() {
    return brandIds().map(brandSummary);
  }

  /** The brand detail for the drawers: the summary + questions + the live Mood. */
  function brandDetail(id) {
    const { derived } = brand(id);
    return { ...brandSummary(id), questionsList: derived.questions ?? [], mood: derived.mood ?? null };
  }

  function contents() {
    const list = [];
    if (existsSync(showcaseFile)) {
      list.push({
        id: 'showcase',
        title: markdownTitle(readFileSync(showcaseFile, 'utf8'), 'Showcase'),
        file: rel(showcaseFile),
      });
    }
    // other decks beside the showcase (golden/showcase/<name>.md, e.g. showcase-v1 kept for reference) → id "<name>"
    try {
      const showcaseDir = join(root, 'golden', 'showcase');
      for (const f of readdirSync(showcaseDir).sort()) {
        if (!f.endsWith('.md') || f === 'showcase.md' || f.toLowerCase() === 'readme.md') continue;
        const id = f.replace(/\.md$/, '');
        if (!ID.test(id) || list.some((c) => c.id === id)) continue;
        const file = join(showcaseDir, f);
        list.push({ id, title: markdownTitle(readFileSync(file, 'utf8'), id), file: rel(file) });
      }
    } catch {
      /* no showcase folder */
    }
    // content/*.md and one level of sub-folders (content/samples/*.md → id "samples-<name>")
    let files = [];
    try {
      for (const f of readdirSync(contentRoot, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.md') && f.name.toLowerCase() !== 'readme.md') files.push(f.name);
        else if (f.isDirectory() && f.name !== 'overrides') {
          for (const g of readdirSync(join(contentRoot, f.name)))
            if (g.endsWith('.md') && g.toLowerCase() !== 'readme.md') files.push(`${f.name}/${g}`);
        }
      }
    } catch {
      files = [];
    }
    for (const f of files.sort()) {
      let id = f.replace(/\.md$/, '').split('/').join('-');
      if (!ID.test(id)) continue;
      if (id === 'showcase') id = 'content-showcase';
      const file = join(contentRoot, f);
      list.push({ id, title: markdownTitle(readFileSync(file, 'utf8'), id), file: rel(file) });
    }
    return list;
  }

  function contentFile(contentId) {
    requireId(contentId, 'content');
    const hit = contents().find((c) => c.id === contentId);
    if (!hit) throw new StudioError(404, `unknown content "${contentId}"`);
    return join(root, hit.file);
  }

  const overridesFile = (contentId, brandId) => join(overridesRoot, `${contentId}.${brandId}.json`);

  function readOverrides(contentId, brandId) {
    requireId(contentId, 'content');
    requireId(brandId);
    const file = overridesFile(contentId, brandId);
    if (!existsSync(file)) return { slides: {} };
    let value;
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new StudioError(409, `${rel(file)} is not valid JSON`);
    }
    return normalizeOverrides(value);
  }

  function writeOverrides(contentId, brandId, value) {
    contentFile(contentId);
    brand(brandId);
    const normalised = normalizeOverrides(value);
    mkdirSync(overridesRoot, { recursive: true });
    writeFileSync(overridesFile(contentId, brandId), `${JSON.stringify(normalised, null, 2)}\n`);
    return normalised;
  }

  function usableBrand(brandId) {
    const entry = brand(brandId);
    const { mood, brandSpec, errors, questions } = entry.derived;
    if (!mood) {
      const blocking = (questions ?? []).filter((q) => q.severity === 'blocking').length;
      throw new StudioError(
        422,
        `${brandId} has no Mood: ${[
          ...(errors ?? []).map((e) => e.message),
          blocking ? `${blocking} blocking question(s)` : null,
        ]
          .filter(Boolean)
          .join('; ')}`,
      );
    }
    return { mood, brandSpec };
  }

  /**
   * Compose `contentId` for `brandId` with `overrides` (undefined -> the stored overrides file). `only` limits the
   * content to its first N slides (the brand switcher's cover cards). Returns {deck, warnings, checks, report, ms, …}.
   */
  function compose({ brandId, contentId, overrides, only, checks = true } = {}) {
    const t0 = performance.now();
    const { mood, brandSpec } = usableBrand(brandId);
    const file = contentFile(contentId);
    const used = overrides === undefined ? readOverrides(contentId, brandId) : normalizeOverrides(overrides);

    const t1 = performance.now();
    const parsed = parseMarkdownResult(readFileSync(file, 'utf8'), { brandSpec });
    const parseMs = ms(t1);
    let content = parsed.content;
    if (only) content = { ...content, slides: content.slides.slice(0, only) };
    const applied = applyOverrides(content, used, mood);

    const t2 = performance.now();
    const composed = composeDeck({
      content: applied.content,
      mood,
      brandSpec,
      catalogue,
      engineVersion: STUDIO_ENGINE_VERSION,
    });
    const composeMs = ms(t2);

    const warnings = [
      ...parsed.warnings.map((w) => ({ source: 'content', ...w })),
      ...applied.notes.map((w) => ({ source: 'studio', ...w })),
      ...composed.warnings.map((w) => ({ source: 'compose', ...w })),
    ];
    const result = {
      brandId,
      contentId,
      overrides: used,
      deck: composed.deck,
      warnings,
      ms: { parse: parseMs, compose: composeMs },
    };
    if (checks) {
      const t3 = performance.now();
      result.checks = runChecks({
        brandSpec,
        mood,
        deck: composed.deck,
        files: filesFrom(brandDir(brandId)),
      });
      result.ms.checks = ms(t3);
      const slides = slideTable(composed.deck);
      result.report = {
        kind: 'StudioReport',
        brandId,
        deckId: composed.deck.id,
        content: rel(file),
        engineVersion: STUDIO_ENGINE_VERSION,
        counts: {
          slides: composed.deck.slides.length,
          overflow: slides.reduce((n, s) => n + s.overflow, 0),
          warnings: warnings.length,
          overrides: Object.keys(used.slides).length,
        },
        ms: result.ms,
        slides,
        warnings,
      };
    }
    result.ms.total = ms(t0);
    return result;
  }

  /** Every brand's cover (the content's first slide) composed for the brand switcher's cards. */
  function covers(contentId) {
    return brandIds().map((brandId) => {
      try {
        const r = compose({ brandId, contentId, only: 1, checks: false });
        return { brandId, deck: r.deck };
      } catch (err) {
        return { brandId, deck: null, error: err.message };
      }
    });
  }

  /** The catalogue's layouts (for one kind, or all) built for a brand's Mood: [{id, kind, default, boxes}]. */
  function layouts({ kind, brandId } = {}) {
    let mood = null;
    if (brandId) mood = usableBrand(brandId).mood;
    else {
      for (const id of brandIds()) {
        mood = brand(id).derived.mood;
        if (mood) break;
      }
    }
    if (!mood) throw new StudioError(422, 'no brand with a Mood to build the layouts for');
    const defs = kind ? catalogue.forKind(kind) : catalogue.list();
    return defs.flatMap((def, i) => {
      try {
        const layout = def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind, items: 3 } });
        return [
          {
            id: def.id,
            kind: def.kind,
            default: Boolean(kind) && i === 0,
            boxes: (layout.boxes ?? []).map((b) => ({ id: b.id, role: b.role ?? null, frame: b.frame })),
          },
        ];
      } catch {
        return [];
      }
    });
  }

  /** The live deck vs the golden snapshot (showcase only): diffDecks(golden/expected/<id>/deck.json, live). */
  async function diff({ brandId, contentId, overrides }) {
    if (contentId !== 'showcase') throw new StudioError(404, 'the golden snapshots are of the showcase only');
    const golden = join(expectedRoot, brandId, 'deck.json');
    if (!existsSync(golden)) throw new StudioError(404, `golden/expected/${brandId}/deck.json is missing`);
    let diffDecks;
    try {
      diffDecks = (await loadDiff?.())?.diffDecks;
    } catch {
      diffDecks = undefined;
    }
    if (typeof diffDecks !== 'function') throw new StudioError(501, 'diff not available');
    const { deck } = compose({ brandId, contentId, overrides, checks: false });
    return diffDecks(JSON.parse(readFileSync(golden, 'utf8')), deck);
  }

  /**
   * Export the composed deck (with its overrides) to out/<brandId>/studio/<contentId>/: deck.json, checks.json,
   * overrides.json, deck.html (+ deck.pdf, slides/NN.png, sheet.png) through the CLI's `runRender`.
   */
  async function exportDeck({ brandId, contentId, pdf = false, png = false, render = runRender } = {}) {
    requireId(brandId);
    if (exports.get(brandId)) throw new StudioError(409, `an export of "${brandId}" is already running`);
    const r = compose({ brandId, contentId });
    const outDir = join(outRoot, brandId, 'studio', contentId);
    const job = (async () => {
      mkdirSync(outDir, { recursive: true });
      const write = (name, value) => writeFileSync(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
      write('deck.json', r.deck);
      write('checks.json', r.checks);
      write('overrides.json', r.overrides);
      const t0 = performance.now();
      const rendered = await render(join(outDir, 'deck.json'), {
        out: outDir,
        base: brandDir(brandId),
        pdf: Boolean(pdf),
        png: Boolean(png),
      });
      const files = ['deck.json', 'checks.json', 'overrides.json', ...(rendered.files ?? [])];
      return {
        brandId,
        contentId,
        outDir: rel(outDir),
        files,
        urls: Object.fromEntries(
          files.map((f) => [
            f,
            `/files/out/${[brandId, 'studio', contentId, ...f.split('/')].map(encodeURIComponent).join('/')}`,
          ]),
        ),
        ms: ms(t0),
      };
    })();
    exports.set(brandId, job);
    try {
      return await job;
    } finally {
      exports.delete(brandId);
    }
  }

  return {
    brandIds,
    brand,
    warm,
    brands,
    brandSummary,
    brandDetail,
    contents,
    readOverrides,
    writeOverrides,
    compose,
    covers,
    layouts,
    diff,
    exportDeck,
  };
}
