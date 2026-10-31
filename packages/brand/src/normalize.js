/**
 * BR-NORMALIZE: Brand Presentation Spec input -> BrandSpec data (docs/P1-rules.md §A field map).
 *
 * Pure: reads only the input object. Font files / metrics (BR-FONTFILES, BR-METRICS), asset sizes (BR-ASSET) and
 * questions (BR-QUESTIONS) are added by readBrand(). Every copied leaf gets a provenance entry
 * `{source: 'given', from: <input pointer>, inputProvenance?}` (or `answered` when answers.json set it); the input's
 * own `provenance` blocks are lifted into that sidecar and stripped from the copied data. Input keys the field map
 * does not read are listed once each in `warnings`.
 */
import { escapeToken as esc, getAt, isUnder, parsePointer, toPointer } from './pointer.js';
import { toneOf } from './tone.js';

export const BRANDSPEC_SCHEMA_ID = 'brand-spec/1';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parentPointer(pointer) {
  const tokens = parsePointer(pointer);
  return toPointer(tokens.slice(0, -1));
}

class Context {
  constructor(input, answers) {
    this.input = input;
    this.answers = [...answers].sort((a, b) => b.length - a.length); // most specific first
    this.provenance = {};
    this.consumed = new Set();
    this.containers = new Map(); // input pointer -> warning pattern
    this.warnings = [];
  }

  /** Provenance entry for a value read from `inPtr`. */
  origin(inPtr, inputProvenance) {
    const answer = this.answers.find((a) => isUnder(inPtr, a));
    if (answer !== undefined) return { source: 'answered', from: answer };
    const entry = { source: 'given', from: inPtr };
    if (inputProvenance) entry.inputProvenance = inputProvenance;
    return entry;
  }

  /** Deep copy of `value` (at input `inPtr`) to output `outPtr`, stripping `provenance` blocks, recording leaves. */
  copy(inPtr, outPtr, value, parentProv) {
    if (Array.isArray(value)) {
      if (value.length === 0) this.provenance[outPtr] = this.origin(inPtr, parentProv);
      return value.map((item, i) => this.copy(`${inPtr}/${i}`, `${outPtr}/${i}`, item, parentProv));
    }
    if (isPlainObject(value)) {
      const own = isPlainObject(value.provenance) ? value.provenance : undefined;
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        if (key === 'provenance' && own) continue;
        const token = toPointer([key]);
        out[key] = this.copy(`${inPtr}${token}`, `${outPtr}${token}`, child, own);
      }
      if (Object.keys(out).length === 0) this.provenance[outPtr] = this.origin(inPtr, own);
      return out;
    }
    this.provenance[outPtr] = this.origin(inPtr, parentProv);
    return value;
  }

  /** The provenance block of the input object holding `inPtr` (when that holder is an object). */
  holderProvenance(inPtr) {
    const holder = getAt(this.input, parentPointer(inPtr));
    return isPlainObject(holder) && isPlainObject(holder.provenance) ? holder.provenance : undefined;
  }

  /** Copy the input value at `inPtr` to `outPtr`; undefined when the input does not give it. Marks it read. */
  take(inPtr, outPtr) {
    const value = getAt(this.input, inPtr);
    if (value === undefined) return undefined;
    this.consumed.add(inPtr);
    return this.copy(inPtr, outPtr, value, this.holderProvenance(inPtr));
  }

  /** Mark an input object as partially read: its unread keys are warned under `pattern`. */
  container(inPtr, pattern = inPtr) {
    this.containers.set(inPtr, pattern);
  }

  /** Mark an input subtree as read (by a rule other than a plain copy, e.g. BR-FONTFILES). */
  read(inPtr) {
    this.consumed.add(inPtr);
  }

  derived(outPtr, rule, signal) {
    const entry = { source: 'derived', from: rule };
    if (signal !== undefined) entry.signal = signal;
    this.provenance[outPtr] = entry;
  }

  /** Every unread key under a partially read container, listed once per pattern. */
  unknownKeys() {
    const seen = new Map();
    for (const [ptr, pattern] of this.containers) {
      const node = getAt(this.input, ptr);
      if (!isPlainObject(node)) continue;
      for (const key of Object.keys(node)) {
        const child = `${ptr}${toPointer([key])}`;
        if (key === 'provenance' && isPlainObject(node.provenance)) continue;
        if (this.consumed.has(child) || this.containers.has(child)) continue;
        const pat = `${pattern}${toPointer([key])}`;
        if (!seen.has(pat)) seen.set(pat, []);
        seen.get(pat).push(child);
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([pointer, where]) => ({
        pointer,
        message:
          `input key not read by BR-NORMALIZE (ignored)` +
          (where.length > 1 || where[0] !== pointer
            ? `: ${where.length} occurrence(s), e.g. ${where[0]}`
            : ''),
      }));
  }
}

/** Copy the listed keys of the input object at `inBase` into `out` (keys renamed by `[from, to]` pairs). */
function takeKeys(ctx, inBase, outBase, out, keys) {
  for (const k of keys) {
    const [from, to] = Array.isArray(k) ? k : [k, k];
    const v = ctx.take(`${inBase}/${esc(from)}`, `${outBase}/${esc(to)}`);
    if (v !== undefined) out[to] = v;
  }
}

const LOGO_RULE_KEYS = [
  'onSurface',
  'height',
  'heightLarge', // not in the input schema: set only by answers.json (D5, question /brand/logoRules/heightLarge)
  'minHeight',
  'clearSpace',
  'position',
  'perLayout',
  'forbidOnSurfaces',
  'noFilter',
];
const FACE_KEYS = ['family', 'weights', 'fallback', 'embeddable', 'license'];
const FONTFILE_KEYS = ['source', 'url', 'files', 'weight', 'style']; // read by BR-FONTFILES
const ROLE_KEYS = [['font', 'face'], 'size', 'weight', 'lineHeight', 'letterSpacing', 'case', 'color'];
// Top-level input blocks copied whole: [input key, BrandSpec pointer].
const WHOLE_BLOCKS = [
  ['charts', '/charts'],
  ['tables', '/tables'],
  ['composition', '/composition'],
  ['layouts', '/brandLayouts'],
  ['voice', '/voice'],
  ['motion', '/motion'],
  ['rules', '/rules'],
  ['accessibility', '/accessibility'],
  ['locale', '/locale'],
  ['export', '/export'],
];

const round2 = (n) => Math.round(n * 100) / 100;

/** D3: legacy inputs (no sizeUnits) give site px up to this size, slide px above it. */
export const LEGACY_SITE_MAX = 40;

/**
 * D3: role sizes (and limits.minBodySize) are canvas px. `sizeUnits` slide -> as given; site -> every size x slideScale;
 * absent (legacy) -> sizes <= 40 x slideScale, larger as given. Results rounded to 0.01 px. Without a slideScale a
 * size that needs scaling stays as given (BR-QUESTIONS asks for /typography/slideScale). Paddings are not scaled
 * (warned once). slideSize() is the rule for one size: `{ size, scaled, needs }`.
 */
export function slideSize(size, sizeUnits, slideScale) {
  if (typeof size !== 'number' || sizeUnits === 'slide') return { size, scaled: false };
  const needs = sizeUnits === 'site' || size <= LEGACY_SITE_MAX;
  if (!needs || typeof slideScale !== 'number') return { size, scaled: false, needs };
  return { size: round2(size * slideScale), scaled: true, needs };
}

function scaleSizes(ctx, typography) {
  const { sizeUnits, slideScale } = typography;
  if (sizeUnits === 'slide') return;
  const signal =
    `/typography/sizeUnits = ${sizeUnits ?? `(absent: legacy, sizes <= ${LEGACY_SITE_MAX} scaled)`}` +
    ` + /typography/slideScale = ${slideScale ?? '(absent)'}`;
  let scaledAny = false;
  const apply = (holder, key, outPtr) => {
    if (!holder || typeof holder[key] !== 'number') return;
    const given = holder[key];
    const r = slideSize(given, sizeUnits, slideScale);
    holder[key] = r.size;
    if (r.scaled) scaledAny = true;
    const from = ctx.provenance[outPtr]?.from ?? outPtr;
    ctx.derived(outPtr, 'BR-NORMALIZE', `${signal}; given ${given} at ${from}`);
  };
  for (const [key, role] of Object.entries(typography.roles)) {
    apply(role, 'size', `/typography/roles/${esc(key)}/size`);
  }
  apply(typography.limits, 'minBodySize', '/typography/limits/minBodySize');
  if (scaledAny && slideScale !== 1) {
    ctx.warnings.push({
      pointer: '/typography/sizeUnits',
      message:
        `text sizes scaled to canvas px (x${slideScale}, D3); paddings and indents ` +
        '(cards.style.padding, component paddings, bullets.indent/gap) are kept as given',
    });
  }
}

/**
 * Normalise a (validated) input object. `answers` = input pointers set by answers.json.
 * Returns `{ spec, provenance, warnings, fontKeys }`; `spec` has no files/metrics/questions yet.
 */
export function normalize(input, { answers = [] } = {}) {
  const ctx = new Context(input, answers);
  const spec = { schema: BRANDSPEC_SCHEMA_ID };
  ctx.container('');

  // id, name, tagline
  takeKeys(ctx, '', '', spec, ['id']);
  ctx.container('/brand');
  takeKeys(ctx, '/brand', '', spec, ['name', 'tagline']);
  ctx.read('/version'); // -> spec.input.version (readBrand)

  // logos
  const logos = {};
  if (isPlainObject(input.brand?.logos)) {
    ctx.read('/brand/logos');
    const variants = {};
    for (const key of Object.keys(input.brand.logos)) {
      const file = ctx.take(`/brand/logos/${esc(key)}`, `/logos/variants/${esc(key)}/file`);
      if (file !== undefined) variants[key] = { file };
    }
    logos.variants = variants;
  }
  if (isPlainObject(input.brand?.logoRules)) {
    ctx.container('/brand/logoRules');
    takeKeys(ctx, '/brand/logoRules', '/logos', logos, LOGO_RULE_KEYS);
  }
  if (Object.keys(logos).length) spec.logos = logos;

  // colors (+ named <- colors.custom, gradients <- gradients)
  if (isPlainObject(input.colors)) {
    ctx.container('/colors');
    const colors = {};
    for (const key of Object.keys(input.colors)) {
      const to = key === 'custom' ? 'named' : key;
      const v = ctx.take(`/colors/${esc(key)}`, `/colors/${esc(to)}`);
      if (v !== undefined) colors[to] = v;
    }
    const gradients = ctx.take('/gradients', '/colors/gradients');
    if (gradients !== undefined) colors.gradients = gradients;
    spec.colors = colors;
  }

  // surfaces (+ tone by BR-TONE)
  if (Array.isArray(input.surfaces)) {
    spec.surfaces = ctx.take('/surfaces', '/surfaces');
    spec.surfaces.forEach((surface, i) => {
      if (surface.tone === undefined && typeof surface.bg === 'string') {
        try {
          // E1: the surface's own text colour decides when given; else the v1 contrast comparison.
          const text = typeof surface.text === 'string' ? surface.text : undefined;
          surface.tone = toneOf(surface.bg, text);
          ctx.derived(
            `/surfaces/${i}/tone`,
            'BR-TONE',
            text === undefined ? `/surfaces/${i}/bg` : `/surfaces/${i}/text + /surfaces/${i}/bg`,
          );
        } catch {
          // invalid bg: the schema check reports it
        }
      }
    });
  }

  // backgrounds (rhythm <- rhythm.sequence)
  if (isPlainObject(input.backgrounds)) {
    ctx.container('/backgrounds');
    const backgrounds = {};
    takeKeys(ctx, '/backgrounds', '/backgrounds', backgrounds, ['default', 'variants']);
    if (isPlainObject(input.backgrounds.rhythm)) {
      ctx.container('/backgrounds/rhythm');
      const seq = ctx.take('/backgrounds/rhythm/sequence', '/backgrounds/rhythm');
      if (seq !== undefined) backgrounds.rhythm = seq;
    }
    if (Object.keys(backgrounds).length) spec.backgrounds = backgrounds;
  }

  // typography
  const fontKeys = [];
  if (isPlainObject(input.typography)) {
    ctx.container('/typography');
    const typography = { faces: {}, roles: {} };
    if (isPlainObject(input.typography.fonts)) {
      ctx.container('/typography/fonts');
      for (const [key, font] of Object.entries(input.typography.fonts)) {
        const base = `/typography/fonts/${esc(key)}`;
        ctx.container(base, '/typography/fonts/*');
        const face = {};
        takeKeys(ctx, base, `/typography/faces/${esc(key)}`, face, FACE_KEYS);
        for (const k of FONTFILE_KEYS) if (font[k] !== undefined) ctx.read(`${base}/${esc(k)}`);
        typography.faces[key] = face;
        fontKeys.push(key);
      }
    }
    if (isPlainObject(input.typography.styles)) {
      ctx.container('/typography/styles');
      for (const key of Object.keys(input.typography.styles)) {
        const base = `/typography/styles/${esc(key)}`;
        ctx.container(base, '/typography/styles/*');
        const role = {};
        takeKeys(ctx, base, `/typography/roles/${esc(key)}`, role, ROLE_KEYS);
        typography.roles[key] = role;
      }
    }
    takeKeys(ctx, '/typography', '/typography', typography, [
      'alignment',
      'bullets',
      'limits',
      'sizeUnits',
      'slideScale',
      'scriptFallbacks',
    ]);
    scaleSizes(ctx, typography);
    spec.typography = typography;
  }

  // layout (canvas <- width/height; every other key as given)
  if (isPlainObject(input.layout)) {
    ctx.container('/layout');
    const layout = {};
    const canvas = {};
    takeKeys(ctx, '/layout', '/layout/canvas', canvas, ['width', 'height']);
    if (Object.keys(canvas).length) layout.canvas = canvas;
    for (const key of Object.keys(input.layout)) {
      if (['width', 'height', 'aspect'].includes(key)) continue;
      layout[key] = ctx.take(`/layout/${esc(key)}`, `/layout/${esc(key)}`);
    }
    spec.layout = layout;
  }

  // components: cards <- cards, components.* <- components.*, icons <- icons
  const components = {};
  const cards = ctx.take('/cards', '/components/cards');
  if (cards !== undefined) components.cards = cards;
  if (isPlainObject(input.components)) {
    ctx.container('/components');
    for (const key of Object.keys(input.components)) {
      components[key] = ctx.take(`/components/${esc(key)}`, `/components/${esc(key)}`);
    }
  }
  const icons = ctx.take('/icons', '/components/icons');
  if (icons !== undefined) components.icons = icons;
  if (Object.keys(components).length) spec.components = components;

  // imagery (+ masks)
  const imagery = ctx.take('/imagery', '/imagery');
  const masks = ctx.take('/masks', '/imagery/masks');
  if (imagery !== undefined || masks !== undefined) {
    spec.imagery = imagery ?? {};
    if (masks !== undefined) spec.imagery.masks = masks;
  }

  // decor <- assets.{elements, illustrationStyle, maxElementsPerSlide}
  if (isPlainObject(input.assets)) {
    ctx.container('/assets');
    const decor = {};
    takeKeys(ctx, '/assets', '/decor', decor, ['elements', 'illustrationStyle', 'maxElementsPerSlide']);
    if (Object.keys(decor).length) spec.decor = decor;
  }

  for (const [key, to] of WHOLE_BLOCKS) {
    const v = ctx.take(`/${esc(key)}`, to);
    if (v !== undefined) spec[to.slice(1)] = v;
  }

  return { spec, provenance: ctx.provenance, warnings: [...ctx.warnings, ...ctx.unknownKeys()], fontKeys };
}
