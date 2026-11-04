// The Studio's server side (docs/PLAN-studio.md §2.1, ST-1 / ST-2): every brand under golden/brands/ derived once
// and kept in memory ({brandSpec, mood} with font metrics), the content list (the showcase + content/*.md), the live
// compose (content + per-slide overrides + the brand's Mood -> Deck + checks), the overrides files
// (content/overrides/<contentId>.<brandId>.json: slide overrides + element overrides, docs/P4-spec.md §1), the
// one-click fixes (§4), the editor's command history (content/history/<contentId>.<brandId>.json, §5), the uploaded
// images of a deck (content/assets/<deck>/, ED-5; P4.3), the deck-level font-pair switch (§3) and the export of a
// composed deck. The engine is the one in Node; the browser only paints what this returns.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { deriveBrand, runRender, slideTable } from '@pb/cli';
import { runChecks } from '@pb/checks';
import { filesFrom } from '@pb/checks/files';
import {
  applyElementOverrides,
  blockWarnings,
  composeDeck,
  fixCommand,
  normalizeElementOverrides,
  paintedDeck,
  parseMarkdownResult,
  remapSourcePaths,
  resolveContentPlaceholders,
  slideWarnings,
  upgradeContent,
  validateContent,
} from '@pb/engine';
import { catalogue } from '@pb/layouts';
import { applyFontPair, fontPairList } from '@pb/mood';
import { IMAGE_TYPES, imageSize } from './imageSize.js';

/** The engine version a Studio deck carries (the CLI's ENGINE_VERSION; build.js is not exported by @pb/cli). */
export const STUDIO_ENGINE_VERSION = '0.4.0';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OVERRIDE_KEYS = new Set(['surface', 'layout', 'decor', 'logo', 'hidden']);
/** The editor's command history keeps the last HISTORY_LIMIT commands (docs/P4-spec.md §5). */
export const HISTORY_LIMIT = 200;
/** An uploaded image may be this large (bytes, docs/P4-spec.md §6). */
export const ASSET_LIMIT = 20 * 1024 * 1024;
/** Where a deck's uploaded images live, repo-relative (ED-5): content/assets/<deck>/<sha>-<name>. */
export const ASSETS_DIR = 'content/assets';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ms = (t0) => Math.round((performance.now() - t0) * 100) / 100;

export class StudioError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    if (errors) this.errors = errors;
  }
}

/** The id of a content document a designer names (an import / a copy): lower-case letters, digits, hyphens. */
export const COPY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A content document under content/: `content/<id>.content.json` (docs/P4-spec.md §1, ED-1 / ED-2). */
const JSON_SUFFIX = '.content.json';

/**
 * A content document as PUT (schema content/1 or content/2): valid against schemas/content.schema.json, slide ids
 * unique. Returns [{pointer, message}] (empty when it can be written).
 */
export function contentErrors(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc))
    return [{ pointer: '', message: 'content must be an object' }];
  const errors = validateContent(doc);
  if (errors.length) return errors;
  const seen = new Set();
  const out = [];
  doc.slides.forEach((s, i) => {
    if (seen.has(s.id)) out.push({ pointer: `/slides/${i}/id`, message: `duplicate slide id "${s.id}"` });
    seen.add(s.id);
  });
  return out;
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
 * Overrides as stored / sent: `{slides: {[contentSlideId]: {surface?, layout?, decor?: false, logo?: false,
 * hidden?: true}}, elements?: {[elementId]: {frame?, locked?, hidden?, color?, fit?}}, fontPair?: <pair id>}`
 * (`fontPair`, P4.3: the deck-level font-pair switch, one of the brand's alternative pairs). `hidden` (P4.2, the filmstrip's
 * Hide) keeps the slide in the Studio, dimmed, and leaves it out of an export. Returns the normalised form (defaults
 * dropped: decor / logo true, hidden false, empty entries; `elements` only when it holds an override) or throws 400.
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
        if (k === 'hidden') {
          if (v) entry.hidden = true;
        } else if (v === false) entry[k] = false;
      }
    }
    if (Object.keys(entry).length) out[id] = entry;
  }
  let elements;
  try {
    elements = normalizeElementOverrides(value.elements);
  } catch (err) {
    throw new StudioError(400, err.message);
  }
  const fontPair = value.fontPair ?? null;
  if (fontPair !== null && (typeof fontPair !== 'string' || !fontPair))
    throw new StudioError(400, 'overrides.fontPair must be a font pair id (a string) or null');
  const result = Object.keys(elements).length ? { slides: out, elements } : { slides: out };
  if (fontPair) result.fontPair = fontPair;
  return result;
}

/**
 * A command history as stored / sent: `{commands: [{type, label?, slideId?, args, inverse}], cursor}` - commands
 * before `cursor` are done (undo), from `cursor` on undone (redo). Keeps the last HISTORY_LIMIT commands (the cursor
 * moves with the trim). Each `args` / `inverse` is a patch `{slides?, elements?, content?, fontPair?}`. Throws 400.
 */
export function normalizeHistory(value) {
  if (value === undefined || value === null) return { commands: [], cursor: 0 };
  if (typeof value !== 'object' || Array.isArray(value))
    throw new StudioError(400, 'history must be an object');
  const list = value.commands ?? [];
  if (!Array.isArray(list)) throw new StudioError(400, 'history.commands must be an array');
  const patch = (p, where) => {
    if (p === undefined || p === null) return {};
    if (typeof p !== 'object' || Array.isArray(p)) throw new StudioError(400, `${where} must be an object`);
    for (const k of Object.keys(p)) {
      if (k === 'fontPair') {
        // the deck-level font pair (P4.3): an id, or null = the brand's own pair
        if (p[k] !== null && typeof p[k] !== 'string')
          throw new StudioError(400, `${where}.fontPair must be a string or null`);
        continue;
      }
      if (k !== 'slides' && k !== 'elements' && k !== 'content')
        throw new StudioError(400, `${where}.${k}: unknown patch key`);
      if (typeof p[k] !== 'object' || p[k] === null || Array.isArray(p[k]))
        throw new StudioError(400, `${where}.${k} must be an object`);
    }
    // a content patch (P4.2): whole slides by id (null = removed) and the slide order
    const c = p.content;
    if (c) {
      for (const k of Object.keys(c)) {
        if (k !== 'slides' && k !== 'order') throw new StudioError(400, `${where}.content.${k}: unknown key`);
      }
      if (c.slides !== undefined && (typeof c.slides !== 'object' || !c.slides || Array.isArray(c.slides)))
        throw new StudioError(400, `${where}.content.slides must be an object`);
      if (c.order !== undefined && (!Array.isArray(c.order) || c.order.some((x) => typeof x !== 'string')))
        throw new StudioError(400, `${where}.content.order must be an array of slide ids`);
    }
    return p;
  };
  const commands = list.map((c, i) => {
    if (!c || typeof c !== 'object' || typeof c.type !== 'string' || !c.type)
      throw new StudioError(400, `history.commands[${i}] needs a type`);
    const out = { type: c.type, args: patch(c.args, `commands[${i}].args`) };
    out.inverse = patch(c.inverse, `commands[${i}].inverse`);
    if (typeof c.label === 'string') out.label = c.label;
    if (typeof c.slideId === 'string') out.slideId = c.slideId;
    if (typeof c.at === 'string') out.at = c.at;
    return out;
  });
  let cursor = Number.isInteger(value.cursor) ? value.cursor : commands.length;
  cursor = Math.max(0, Math.min(commands.length, cursor));
  const drop = Math.max(0, commands.length - HISTORY_LIMIT);
  return { commands: commands.slice(drop), cursor: Math.max(0, cursor - drop) };
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
  const historyRoot = join(contentRoot, 'history');
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
      // the alternative pairs the brand defines (Mood type.pairs, P4.3): empty = the brand defines one pair
      fontPairs: mood ? fontPairList(mood) : [],
      geometry: mood?.geometry
        ? {
            margins: mood.geometry.margins ?? null,
            titleZone: mood.geometry.titleZone ?? null,
            grid: mood.geometry.grid ?? null,
          }
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
    // Markdown decks are imports (ED-2): read-only in the Studio, an edit saves a copy under content/
    const md = (entry) => ({ ...entry, source: 'markdown', readOnly: true });
    if (existsSync(showcaseFile)) {
      list.push(
        md({
          id: 'showcase',
          title: markdownTitle(readFileSync(showcaseFile, 'utf8'), 'Showcase'),
          file: rel(showcaseFile),
        }),
      );
    }
    // other decks beside the showcase (golden/showcase/<name>.md, e.g. showcase-v1 kept for reference) → id "<name>"
    try {
      const showcaseDir = join(root, 'golden', 'showcase');
      for (const f of readdirSync(showcaseDir).sort()) {
        if (!f.endsWith('.md') || f === 'showcase.md' || f.toLowerCase() === 'readme.md') continue;
        const id = f.replace(/\.md$/, '');
        if (!ID.test(id) || list.some((c) => c.id === id)) continue;
        const file = join(showcaseDir, f);
        list.push(md({ id, title: markdownTitle(readFileSync(file, 'utf8'), id), file: rel(file) }));
      }
    } catch {
      /* no showcase folder */
    }
    // content/*.md and one level of sub-folders (content/samples/*.md → id "samples-<name>")
    let files = [];
    const docs = [];
    try {
      for (const f of readdirSync(contentRoot, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith(JSON_SUFFIX)) docs.push(f.name);
        if (f.isFile() && f.name.endsWith('.md') && f.name.toLowerCase() !== 'readme.md') files.push(f.name);
        else if (f.isDirectory() && f.name !== 'overrides' && f.name !== 'history') {
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
      list.push(md({ id, title: markdownTitle(readFileSync(file, 'utf8'), id), file: rel(file) }));
    }
    // content/<id>.content.json: the documents the Studio edits (docs/P4-spec.md §1)
    for (const f of docs.sort()) {
      const id = f.slice(0, -JSON_SUFFIX.length);
      if (!ID.test(id) || list.some((c) => c.id === id)) continue;
      const file = join(contentRoot, f);
      let title = id;
      try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        if (typeof doc?.title === 'string' && doc.title) title = doc.title;
      } catch {
        /* listed; reading it reports the error */
      }
      list.push({ id, title, file: rel(file), source: 'json', readOnly: false });
    }
    return list;
  }

  /** The content list entry of an id ({id, title, file, source, readOnly}); 404 when there is none. */
  function contentEntry(contentId) {
    requireId(contentId, 'content');
    const hit = contents().find((c) => c.id === contentId);
    if (!hit) throw new StudioError(404, `unknown content "${contentId}"`);
    return hit;
  }

  function contentFile(contentId) {
    return join(root, contentEntry(contentId).file);
  }

  /** A JSON content document as stored (409 when the file is not valid JSON). */
  function readDoc(entry) {
    const file = join(root, entry.file);
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new StudioError(409, `${entry.file} is not valid JSON`);
    }
  }

  /**
   * The content of a deck for one brand, as compose reads it: {content, warnings, blockIndex?, file}. Markdown is
   * parsed with the brand (its placeholders resolved, as the CLI does); a JSON document has its placeholders resolved
   * for the brand (`blockIndex`: the stored block index of each kept block, for the source pointers) and the content
   * warnings of its slides and blocks.
   */
  function loadContent(contentId, brandSpec) {
    const entry = contentEntry(contentId);
    const file = join(root, entry.file);
    if (entry.source !== 'json') {
      const parsed = parseMarkdownResult(readFileSync(file, 'utf8'), { brandSpec });
      return { content: parsed.content, warnings: parsed.warnings, file };
    }
    const doc = readDoc(entry);
    const errors = contentErrors(doc);
    if (errors.length)
      throw new StudioError(
        409,
        `${entry.file} is not valid content: ${errors[0].pointer} ${errors[0].message}`,
        errors,
      );
    const r = resolveContentPlaceholders(doc, brandSpec);
    const warnings = [...r.warnings];
    if (doc.schema === 'content/2') {
      for (const slide of r.content.slides) {
        const at = (w) => ({ check: 'content', ...w, slide: slide.id });
        for (const w of slideWarnings(slide)) warnings.push(at(w));
        for (const b of slide.blocks ?? []) for (const w of blockWarnings(b)) warnings.push(at(w));
      }
    }
    return { content: r.content, warnings, blockIndex: r.blockIndex, file };
  }

  /**
   * GET content: the document (`source: 'json'`), or for a Markdown deck its parse with the `{brand.*}`
   * placeholders as written (`source: 'markdown'`, read-only). `readOnly` says whether a PUT is accepted.
   */
  function readContent(contentId) {
    const entry = contentEntry(contentId);
    if (entry.source === 'json') return { ...readDoc(entry), source: 'json', readOnly: false };
    const md = readFileSync(join(root, entry.file), 'utf8');
    const { content } = parseMarkdownResult(md, { keepPlaceholders: true });
    return { ...content, source: 'markdown', readOnly: true };
  }

  /**
   * PUT content: validated (400 with the errors), written to content/<id>.content.json; with `brandId` the deck is
   * composed for it ({deck, warnings, checks, …} as compose). A Markdown deck is read-only (409: save a copy).
   */
  function writeContent(contentId, value, { brandId } = {}) {
    const entry = contentEntry(contentId);
    if (entry.source !== 'json')
      throw new StudioError(
        409,
        `"${contentId}" is a Markdown deck (read-only): save it as a copy (POST /api/studio/content/import)`,
      );
    const doc = value && typeof value === 'object' ? { ...value } : value;
    if (doc && typeof doc === 'object') {
      delete doc.source;
      delete doc.readOnly;
    }
    const errors = contentErrors(doc);
    if (errors.length)
      throw new StudioError(400, `not valid content: ${errors[0].pointer} ${errors[0].message}`, errors);
    writeFileSync(join(root, entry.file), `${JSON.stringify(doc, null, 2)}\n`);
    if (!brandId) return { contentId, saved: true };
    return { ...compose({ brandId, contentId }), saved: true };
  }

  /**
   * Import (docs/P4-spec.md §1): `from` (a Markdown deck: its parse with the placeholders kept, upgraded to content/2;
   * a JSON document: copied) -> content/<id>.content.json; the overrides and command logs of `from` are copied to
   * the new id for every brand, so the copy looks and undoes as the original did. Returns the new list entry +
   * `content`. 400 for a bad id, 409 when the id is taken.
   */
  function importContent({ from, id, title } = {}) {
    const src = contentEntry(from);
    if (typeof id !== 'string' || !COPY_ID.test(id))
      throw new StudioError(400, `bad content id "${id}": lower-case letters, digits and hyphens`);
    if (contents().some((c) => c.id === id)) throw new StudioError(409, `content "${id}" already exists`);
    let doc;
    if (src.source === 'json') doc = readDoc(src);
    else {
      const parsed = parseMarkdownResult(readFileSync(join(root, src.file), 'utf8'), {
        keepPlaceholders: true,
      });
      doc = upgradeContent(parsed.content).content;
    }
    if (typeof title === 'string' && title.trim()) doc = { ...doc, title: title.trim() };
    const errors = contentErrors(doc);
    if (errors.length)
      throw new StudioError(400, `the import is not valid content: ${errors[0].message}`, errors);
    mkdirSync(contentRoot, { recursive: true });
    const file = join(contentRoot, `${id}${JSON_SUFFIX}`);
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    for (const [dir, ext] of [
      [overridesRoot, '.json'],
      [historyRoot, '.json'],
    ]) {
      let names = [];
      try {
        names = readdirSync(dir);
      } catch {
        names = [];
      }
      for (const n of names) {
        if (!n.startsWith(`${from}.`) || !n.endsWith(ext)) continue;
        const brandPart = n.slice(from.length + 1, -ext.length);
        if (!ID.test(brandPart) || brandPart.includes('.')) continue;
        copyFileSync(join(dir, n), join(dir, `${id}.${brandPart}${ext}`));
      }
    }
    return { ...contentEntry(id), content: doc };
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

  const historyFile = (contentId, brandId) => join(historyRoot, `${contentId}.${brandId}.json`);

  function readHistory(contentId, brandId) {
    requireId(contentId, 'content');
    requireId(brandId);
    const file = historyFile(contentId, brandId);
    if (!existsSync(file)) return { commands: [], cursor: 0 };
    let value;
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new StudioError(409, `${rel(file)} is not valid JSON`);
    }
    return normalizeHistory(value);
  }

  function writeHistory(contentId, brandId, value) {
    contentFile(contentId);
    brand(brandId);
    const normalised = normalizeHistory(value);
    mkdirSync(historyRoot, { recursive: true });
    writeFileSync(historyFile(contentId, brandId), `${JSON.stringify(normalised)}\n`);
    return normalised;
  }

  /** The Mood with the deck's font pair applied ({mood, notes}): an unknown pair is a warning, the brand's own kept. */
  function pairedMood(mood, fontPair) {
    if (!fontPair) return { mood, notes: [] };
    try {
      return { mood: applyFontPair(mood, fontPair).mood, notes: [] };
    } catch (err) {
      return {
        mood,
        notes: [
          { check: 'override', severity: 'warn', message: `${err.message}: the brand's own pair kept` },
        ],
      };
    }
  }

  const sizes = new Map(); // repo-relative asset file -> {key, size}
  /** The pixel size of an uploaded image (content/assets/…), cached by mtime + size; null when unreadable. */
  function assetSize(file) {
    const abs = join(root, file);
    const st = statOrNull(abs);
    if (!st?.isFile()) return null;
    const key = `${st.mtimeMs}:${st.size}`;
    const hit = sizes.get(file);
    if (hit?.key === key) return hit.size;
    let size = null;
    try {
      size = imageSize(readFileSync(abs), extname(file).slice(1));
    } catch {
      size = null;
    }
    sizes.set(file, { key, size });
    return size;
  }

  /**
   * The BrandSpec the composer is given: the brand's, plus the size of every uploaded image the content names
   * (content/assets/…; the composer's asset index reads `{file, width, height}` objects - a focal point crops a cover
   * image with it). The brand's own object when the content names none.
   */
  function withContentAssets(brandSpec, content) {
    const files = new Set();
    const walk = (v) => {
      if (typeof v === 'string') {
        if (v.startsWith(`${ASSETS_DIR}/`)) files.add(v);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(content?.slides);
    const studioAssets = [...files].sort().flatMap((file) => {
      const size = assetSize(file);
      const mime = IMAGE_TYPES[extname(file).slice(1).toLowerCase()];
      return size ? [{ file, width: size.width, height: size.height, ...(mime ? { mime } : {}) }] : [];
    });
    return studioAssets.length ? { ...brandSpec, studioAssets } : brandSpec;
  }

  /**
   * The deck with its uploaded images (content/assets/…, repo-relative in the content) named relative to the brand
   * folder, the base the renderer and the export resolve every asset against (ED-5: nothing is copied into the brand).
   */
  function withAssetPaths(deck, brandId) {
    const entries = Object.entries(deck.assets ?? {});
    if (!entries.some(([, a]) => a?.file?.startsWith(`${ASSETS_DIR}/`))) return deck;
    const assets = {};
    for (const [id, a] of entries) {
      assets[id] = a?.file?.startsWith(`${ASSETS_DIR}/`)
        ? { ...a, file: relative(brandDir(brandId), join(root, a.file)).split(sep).join('/') }
        : a;
    }
    return { ...deck, assets };
  }

  /**
   * The checks' file lookup for a Studio deck: the brand folder's, plus the deck's uploaded images (named from the
   * brand folder as ../../../content/assets/…, ED-5) - they are files of the deck, not missing brand files.
   */
  function withContentFiles(files, brandId) {
    const assetsRoot = join(root, ASSETS_DIR);
    return {
      ...files,
      exists(relPath) {
        if (files.exists(relPath)) return true;
        if (typeof relPath !== 'string' || !relPath) return false;
        const abs = join(brandDir(brandId), relPath);
        if (!abs.startsWith(`${assetsRoot}${sep}`)) return false;
        return Boolean(statOrNull(abs)?.isFile());
      },
    };
  }

  /**
   * An uploaded image (docs/P4-spec.md §6, ED-5): `{name, data}` (`data` base64, a data URL, or a Buffer) saved as
   * content/assets/<deck>/<sha>-<name>. Images only (png, jpg, jpeg, webp, gif, svg - the extension and the bytes
   * must agree), at most ASSET_LIMIT bytes. Returns {file (repo-relative: the content's `src`), width, height, size,
   * mime}. 400 / 413 when refused; 409 for a Markdown deck (read-only: save a copy first).
   */
  function uploadAsset(deckId, { name, data } = {}) {
    const entry = contentEntry(deckId);
    if (entry.source !== 'json')
      throw new StudioError(409, `"${deckId}" is a Markdown deck (read-only): save it as a copy first`);
    if (typeof name !== 'string' || !name.trim()) throw new StudioError(400, 'the upload needs a file name');
    const ext = extname(name).slice(1).toLowerCase();
    if (!IMAGE_TYPES[ext])
      throw new StudioError(
        400,
        `"${name}" is not an image the Studio takes (${Object.keys(IMAGE_TYPES).join(', ')})`,
      );
    let bytes;
    if (Buffer.isBuffer(data)) bytes = data;
    else if (typeof data === 'string') bytes = Buffer.from(data.replace(/^data:[^,]*,/, ''), 'base64');
    else throw new StudioError(400, 'the upload needs the file as base64 `data`');
    if (!bytes.length) throw new StudioError(400, `"${name}" is empty`);
    if (bytes.length > ASSET_LIMIT)
      throw new StudioError(413, `"${name}" is ${bytes.length} bytes: images up to 20 MB`);
    const size = imageSize(bytes, ext);
    if (!size) throw new StudioError(400, `"${name}" is not a readable ${ext} image`);
    const safe =
      name
        .trim()
        .split(/[\\/]/)
        .pop()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+/, '')
        .slice(-80) || `image.${ext}`;
    const fileName = `${sha256(bytes).slice(0, 12)}-${safe}`;
    const dir = join(contentRoot, 'assets', deckId);
    mkdirSync(dir, { recursive: true });
    const abs = join(dir, fileName);
    if (!existsSync(abs)) writeFileSync(abs, bytes);
    return {
      file: `${ASSETS_DIR}/${deckId}/${fileName}`,
      width: size.width,
      height: size.height,
      size: bytes.length,
      mime: IMAGE_TYPES[ext],
    };
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
    const brandUsed = usableBrand(brandId);
    const file = contentFile(contentId);
    const used = overrides === undefined ? readOverrides(contentId, brandId) : normalizeOverrides(overrides);
    // the deck's font pair (P4.3): the Mood's role faces swapped before compose (the fitter measures the pair's faces)
    const paired = pairedMood(brandUsed.mood, used.fontPair);
    const { mood } = paired;

    const t1 = performance.now();
    const parsed = loadContent(contentId, brandUsed.brandSpec);
    const parseMs = ms(t1);
    let content = parsed.content;
    if (only) content = { ...content, slides: content.slides.slice(0, only) };
    const applied = applyOverrides(content, used, mood);
    applied.notes.push(...paired.notes);
    const brandSpec = withContentAssets(brandUsed.brandSpec, applied.content);

    const t2 = performance.now();
    const composed = composeDeck({
      content: applied.content,
      mood,
      brandSpec,
      catalogue,
      engineVersion: STUDIO_ENGINE_VERSION,
    });
    const composeMs = { compose: ms(t2) };

    // element overrides after compose (P4-spec §1): frames clamped, texts re-fitted, charts / tables laid out again
    // from their content block (P4.3: the content as composed), hidden kept in the JSON; then the sources point into
    // the document as stored (a block dropped for an unresolvable placeholder) and uploaded images are named from the
    // brand folder
    let deck = composed.deck;
    let composeWarnings = composed.warnings;
    let elementWarnings = [];
    if (used.elements) {
      const t4 = performance.now();
      const r = applyElementOverrides(deck, used.elements, {
        mood,
        brandSpec,
        content: applied.content,
        catalogue,
      });
      deck = r.deck;
      composeWarnings = deck.warnings ?? [];
      // (the switcher's cover cards compose the first slide only: overrides of later slides are not "unknown";
      // a re-fit's overflow warning is already in deck.warnings)
      elementWarnings = r.warnings.filter(
        (w) => w.check !== 'overflow' && !(only && /unknown element/.test(w.message)),
      );
      composeMs.elements = ms(t4);
    }
    if (parsed.blockIndex) deck = remapSourcePaths(deck, parsed.blockIndex);
    deck = withAssetPaths(deck, brandId);
    const warnings = [
      ...parsed.warnings.map((w) => ({ source: 'content', ...w })),
      ...applied.notes.map((w) => ({ source: 'studio', ...w })),
      ...composeWarnings.map((w) => ({ source: 'compose', ...w })),
      ...elementWarnings.map((w) => ({ source: 'studio', ...w })),
    ];
    const result = {
      brandId,
      contentId,
      overrides: used,
      deck,
      warnings,
      ms: { parse: parseMs, compose: composeMs.compose },
    };
    if (composeMs.elements !== undefined) result.ms.elements = composeMs.elements;
    if (checks) {
      const t3 = performance.now();
      // the checks read the deck as painted (hidden elements left out)
      result.checks = runChecks({
        brandSpec: brandUsed.brandSpec,
        mood,
        deck: paintedDeck(deck),
        files: withContentFiles(filesFrom(brandDir(brandId)), brandId),
        editor: true,
      });
      result.ms.checks = ms(t3);
      const slides = slideTable(deck);
      result.report = {
        kind: 'StudioReport',
        brandId,
        deckId: deck.id,
        content: rel(file),
        engineVersion: STUDIO_ENGINE_VERSION,
        counts: {
          slides: composed.deck.slides.length,
          overflow: slides.reduce((n, s) => n + s.overflow, 0),
          warnings: warnings.length,
          overrides: Object.keys(used.slides).length,
          elementOverrides: Object.keys(used.elements ?? {}).length,
        },
        ms: result.ms,
        slides,
        warnings,
      };
    }
    result.ms.total = ms(t0);
    return result;
  }

  /**
   * The element overrides a check item's one-click fix makes (P4-spec §4): `{elements: {[id]: override | null},
   * message}` - the client applies them as an undoable command. `overrides` = the client's current overrides
   * (undefined -> the stored file). An item the fix cannot apply to answers 400.
   */
  function fix({ brandId, contentId, item, overrides } = {}) {
    if (!item || typeof item !== 'object') throw new StudioError(400, 'fix needs the check item');
    const { mood: brandMood, brandSpec } = usableBrand(brandId);
    const r = compose({ brandId, contentId, overrides, checks: false });
    const { mood } = pairedMood(brandMood, r.overrides.fontPair);
    try {
      return fixCommand(r.deck, item, { mood, brandSpec, overrides: r.overrides.elements ?? {} });
    } catch (err) {
      throw new StudioError(400, err.message);
    }
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
            label: def.label ?? def.id,
            tags: def.tags ?? [],
            ...(def.kinds ? { kinds: def.kinds } : {}),
            default: kind ? i === 0 : catalogue.forKind(def.kind)[0]?.id === def.id,
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
    // slides hidden in the filmstrip are left out of the export
    const hidden = new Set(
      Object.entries(r.overrides.slides ?? {})
        .filter(([, o]) => o.hidden)
        .map(([id]) => id),
    );
    if (hidden.size) {
      const slides = r.deck.slides.filter((s) => !hidden.has(s.contentSlideId ?? s.id));
      if (slides.length) r.deck = { ...r.deck, slides };
    }
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
    readContent,
    writeContent,
    importContent,
    readOverrides,
    writeOverrides,
    readHistory,
    writeHistory,
    uploadAsset,
    compose,
    fix,
    covers,
    layouts,
    diff,
    exportDeck,
  };
}
