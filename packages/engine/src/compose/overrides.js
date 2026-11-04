/**
 * Element overrides (docs/P4-spec.md §1, §2; ED-1 / ED-3): the designer's departures from the composed deck, keyed by
 * element id, applied AFTER compose: `{ frame?, locked?, hidden?, color?, fit? }`. The deck stays derived - a moved or
 * resized text is laid out again by the fitter in its new frame (never cropped), a chart / table is laid out again
 * for its new frame from its content block (P4.3; needs the composed content), a shape / image / line moves with its
 * frame (an image with a focal point is cropped again for the frame's aspect), a group carries its children. Frames
 * are clamped to the canvas, never to the margins (the margins check warns instead). `locked` is an editor affordance
 * only: a locked element's frame override still applies. A hidden element stays in the deck JSON with `hidden: true`
 * and is left out of the painted deck (`paintedDeck`). `fit` (P4.3) is an image's fit mode, cover or contain (the
 * content schema has no field for it: a designer's departure); `focal` ({x, y}, fractions 0–1 of the image) the focal
 * point of an image whose content has no focal field (a compare column's, an item's image, a person's photo - an
 * image block's item keeps its focal point in the content).
 */
import { lowerSlide } from '../content/lower.js';
import { normalizeMetrics } from '../fit/metrics.js';
import { fitTextFont } from '../fit/text.js';
import { r2, sortKeys } from '../util/stable.js';
import { createAssets } from './assets.js';
import { resolve } from './resolve.js';
import { focalCrop, focalOf, relayoutGraphic } from './slots.js';

/** The keys an element override may carry. */
export const ELEMENT_OVERRIDE_KEYS = Object.freeze(['frame', 'locked', 'hidden', 'color', 'fit', 'focal']);
/** The fit modes an image override may set. */
export const IMAGE_FITS = Object.freeze(['cover', 'contain']);
/** The smallest frame side an override may set (px): a 0-wide text cannot be laid out. */
export const MIN_FRAME_SIDE = 1;
const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const FIT_CHECKS = new Set(['overflow', 'long-word']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * One override checked: returns {value, errors}. `value` holds the valid keys (colour upper-cased, frame numbers
 * rounded); `errors` names each key refused (unknown key, a frame without four finite numbers or a side ≤ 0, a colour
 * that is not #RRGGBB(AA), a fit other than cover / contain, a focal point outside 0–1, a non-boolean locked /
 * hidden).
 */
export function checkElementOverride(id, o) {
  const errors = [];
  const value = {};
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    return { value, errors: [`elements.${id} must be an object`] };
  }
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (!ELEMENT_OVERRIDE_KEYS.includes(k)) {
      errors.push(`elements.${id}.${k}: unknown element override`);
    } else if (k === 'frame') {
      const ok =
        v && typeof v === 'object' && ['x', 'y', 'w', 'h'].every((c) => isNum(v[c])) && v.w > 0 && v.h > 0;
      if (ok) value.frame = { x: r2(v.x), y: r2(v.y), w: r2(v.w), h: r2(v.h) };
      else errors.push(`elements.${id}.frame must be {x, y, w, h} numbers with w and h > 0`);
    } else if (k === 'color') {
      if (typeof v === 'string' && HEX.test(v)) value.color = v.toUpperCase();
      else errors.push(`elements.${id}.color: "${v}" is not a #RRGGBB(AA) colour`);
    } else if (k === 'fit') {
      if (IMAGE_FITS.includes(v)) value.fit = v;
      else errors.push(`elements.${id}.fit: "${v}" is not one of ${IMAGE_FITS.join(', ')}`);
    } else if (k === 'focal') {
      const f =
        v && typeof v === 'object' && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1 ? focalOf(v) : null;
      if (f) value.focal = f;
      else errors.push(`elements.${id}.focal must be {x, y} fractions 0–1 of the image`);
    } else if (typeof v === 'boolean') {
      // locked / hidden: false is the default (dropped)
      if (v) value[k] = true;
    } else {
      errors.push(`elements.${id}.${k} must be a boolean`);
    }
  }
  return { value, errors };
}

/**
 * Element overrides as stored / sent → the normalised form (ids sorted, defaults and empty entries dropped). Throws an
 * Error listing every problem (the Studio server answers 400).
 */
export function normalizeElementOverrides(elements) {
  if (elements === undefined || elements === null) return {};
  if (typeof elements !== 'object' || Array.isArray(elements)) {
    throw new Error('overrides.elements must be an object of element id -> override');
  }
  const out = {};
  const errors = [];
  for (const id of Object.keys(elements).sort()) {
    if (elements[id] === null || elements[id] === undefined) continue;
    const { value, errors: e } = checkElementOverride(id, elements[id]);
    errors.push(...e);
    if (Object.keys(value).length) out[id] = value;
  }
  if (errors.length) throw new Error(errors.join('; '));
  return out;
}

/** The frame clamped to the canvas: each side at most the canvas side (≥ MIN_FRAME_SIDE), the box inside it. */
export function clampFrame(frame, canvas = { width: 1920, height: 1080 }) {
  const w = Math.max(MIN_FRAME_SIDE, Math.min(frame.w, canvas.width));
  const h = Math.max(MIN_FRAME_SIDE, Math.min(frame.h, canvas.height));
  const x = Math.max(0, Math.min(frame.x, canvas.width - w));
  const y = Math.max(0, Math.min(frame.y, canvas.height - h));
  return { x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
}

/** Every element of a deck, depth first, with its slide (group children after their group). */
export function deckElements(deck) {
  const out = [];
  const walk = (els, slide, parent) => {
    for (const el of els ?? []) {
      out.push({ el, slide, parent });
      if (Array.isArray(el.children)) walk(el.children, slide, el);
    }
  };
  for (const slide of deck?.slides ?? []) walk(slide.elements, slide, null);
  return out;
}

/** An element of the deck by id (groups searched): {el, slide, parent} or null. */
export function findDeckElement(deck, id) {
  return deckElements(deck).find((e) => e.el.id === id) ?? null;
}

const sameFrame = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs((a?.[k] ?? 0) - (b?.[k] ?? 0)) < 1e-9);

/** Scale frame-relative points ([[x, y], ...]) by sx / sy. */
const scalePoints = (pts, sx, sy) => pts.map(([x, y, ...rest]) => [r2(x * sx), r2(y * sy), ...rest]);

/**
 * Re-fit a text element in `frame` with its own font / role / align / valign: the fitter starts at the role's size
 * (or at the fit-up size the compose gave it) and steps down to the role's fit.min. Returns the fitter's warnings
 * (overflow / long-word, with the element id) or a `note` when the element cannot be re-fitted.
 */
function refitText(el, frame, slide, env) {
  const t = el.text;
  if (!t?.font || t.autofit === false) {
    el.frame = frame;
    return { warnings: [] };
  }
  const roleName = t.font.role;
  const surface = env.surfaces.get(slide.surfaceId);
  const R = resolve(env.mood, surface, { warn: () => {} });
  const role = roleName ? R.font(roleName) : null;
  if (!role) {
    el.frame = frame;
    return {
      warnings: [],
      note: `"${el.id}" moved without a re-fit: its font names no type role of the Mood`,
    };
  }
  const face = env.mood.type?.faces?.[env.mood.type?.roles?.[roleName]?.face];
  if (!normalizeMetrics(face?.metrics)) {
    el.frame = frame;
    return { warnings: [], note: `"${el.id}" moved without a re-fit: face "${face?.family}" has no metrics` };
  }
  const grown = Boolean(t.fit?.upRole);
  const start = grown ? t.fit.appliedSize : (t.fit?.requestedSize ?? t.font.size);
  const font = {
    ...role,
    family: t.font.family,
    weight: t.font.weight,
    lineHeight: t.font.lineHeight,
    letterSpacing: t.font.letterSpacing ?? 0,
    case: t.font.case ?? 'none',
    color: t.font.color,
    size: start,
  };
  const indent = env.mood.type?.bullets?.indent;
  const { text, warnings } = fitTextFont(t.paragraphs ?? [], frame, font, {
    align: t.align,
    valign: t.valign,
    bullets: typeof indent === 'number' ? { indent } : undefined,
  });
  if (grown) {
    text.fit.requestedSize = t.fit.requestedSize;
    text.fit.upSteps = t.fit.upSteps;
    text.fit.upRole = t.fit.upRole;
  }
  el.frame = frame;
  el.text = text;
  return { warnings: warnings.map((w) => ({ ...w, elementId: el.id })) };
}

/** Replace the fitter warnings of `el` (on the element, its slide and the deck) with `next`. */
function replaceFitWarnings(deck, slide, el, next) {
  const stale = (w) => w.elementId === el.id && FIT_CHECKS.has(w.check);
  const own = (el.warnings ?? []).filter((w) => !FIT_CHECKS.has(w.check));
  if (own.length || next.length) el.warnings = [...own, ...next];
  else delete el.warnings;
  const withSlide = next.map((w) => ({ ...w, slide: slide.id }));
  const slideW = [...(slide.warnings ?? []).filter((w) => !stale(w)), ...withSlide];
  if (slideW.length) slide.warnings = slideW;
  else delete slide.warnings;
  const deckW = [...(deck.warnings ?? []).filter((w) => !(w.slide === slide.id && stale(w))), ...withSlide];
  if (deckW.length) deck.warnings = deckW;
  else delete deck.warnings;
}

/**
 * Place `el` (and its children) at `frame`: a text is re-fitted when its size changed (moved only: its lines are
 * frame-relative and stay), shapes / lines scale their frame-relative points, an image keeps its `fit` in the new
 * frame, a group moves (and scales) its children. Chart / table geometry is laid out for its size, so they move only
 * (a size change is reported). Returns {warnings, notes}.
 */
function place(el, frame, slide, env) {
  const from = el.frame;
  const sized = Math.abs(from.w - frame.w) > 1e-9 || Math.abs(from.h - frame.h) > 1e-9;
  const warnings = [];
  const notes = [];
  if (el.type === 'text' && sized) {
    const r = refitText(el, frame, slide, env);
    warnings.push(...r.warnings);
    if (r.note) notes.push(r.note);
    replaceFitWarnings(env.deck, slide, el, r.warnings);
  } else if ((el.type === 'chart' || el.type === 'table') && sized) {
    // (laid out again by relayout() when the composed content is given; without it the box moves only)
    el.frame = { ...frame, w: from.w, h: from.h };
    notes.push(`"${el.id}" moved, not resized: a ${el.type} is laid out again from its content block`);
  } else {
    if (sized && el.type === 'image' && el.image?.focal && el.image.fit !== 'contain') {
      const crop = focalCrop(el.image.focal, env.deck.assets?.[el.image.asset], frame);
      if (crop) el.image.crop = crop;
    }
    if (sized && from.w > 0 && from.h > 0) {
      const sx = frame.w / from.w;
      const sy = frame.h / from.h;
      if (Array.isArray(el.shape?.points)) el.shape.points = scalePoints(el.shape.points, sx, sy);
      if (el.lineProps) {
        if (isNum(el.lineProps.x2)) el.lineProps.x2 = r2(el.lineProps.x2 * sx);
        if (isNum(el.lineProps.y2)) el.lineProps.y2 = r2(el.lineProps.y2 * sy);
      }
      if (el.shape?.kind === 'path') notes.push(`"${el.id}": a path keeps its drawing size when resized`);
    }
    el.frame = frame;
  }
  if (Array.isArray(el.children) && el.children.length) {
    const sx = from.w > 0 ? frame.w / from.w : 1;
    const sy = from.h > 0 ? frame.h / from.h : 1;
    for (const child of el.children) {
      const f = child.frame;
      const next = {
        x: r2(frame.x + (f.x - from.x) * sx),
        y: r2(frame.y + (f.y - from.y) * sy),
        w: r2(Math.max(MIN_FRAME_SIDE, f.w * sx)),
        h: r2(Math.max(MIN_FRAME_SIDE, f.h * sy)),
      };
      const r = place(child, next, slide, env);
      warnings.push(...r.warnings);
      notes.push(...r.notes);
    }
  }
  return { warnings, notes };
}

/**
 * A chart / table laid out again in `frame` (P4.3): its lowered content block found through its `source` in the
 * composed content slide, drawn by the composer's own slot code (compose/slots.js relayoutGraphic) on the slide's
 * surface. Its drawn parts (`<id>-value`, `<id>-cell-*`) are replaced; its title / subtitle / source elements stay.
 * Returns {el, warnings} (the new element) or null when the block cannot be found.
 */
function relayout(entry, frame, env) {
  const { el, slide, parent } = entry;
  const cslide = env.content?.slides?.find((x) => x.id === (slide.contentSlideId ?? slide.id));
  if (!cslide || !el.source?.path || !el.slot) return null;
  const lowered = lowerSlide(cslide);
  const block = (lowered.slide.blocks ?? []).find(
    (b) => b.type === el.type && lowered.sources.get(b)?.path === el.source.path,
  );
  if (!block) return null;
  const surface = env.surfaces.get(slide.surfaceId);
  const warnings = [];
  const assets = createAssets(env.brandSpec);
  const ctx = {
    mood: env.mood,
    R: resolve(env.mood, surface, { warn: () => {} }),
    slideId: slide.id,
    assets,
    warn: (check, message, severity = 'warn') =>
      warnings.push({ check, severity, message, slide: slide.id, elementId: el.id }),
    surface,
    catalogue: env.catalogue,
    kind: slide.kind,
    layoutId: slide.layoutId,
  };
  let made;
  try {
    made = relayoutGraphic(el, frame, { block, content: cslide, sources: lowered.sources, ctx });
  } catch (err) {
    warnings.push({
      check: el.type,
      severity: 'warn',
      message: `${el.type} not laid out again: ${err.message}`,
    });
    return { el: null, warnings };
  }
  const next = made.find((x) => x.id === el.id);
  if (!next) return { el: null, warnings };
  const list = parent ? parent.children : slide.elements;
  const part = (id) => id === el.id || id === `${el.id}-value` || id.startsWith(`${el.id}-cell-`);
  const at = list.findIndex((x) => x.id === el.id);
  const kept = list.filter((x, i) => i < at && !part(x.id));
  const after = list.filter((x, i) => i > at && !part(x.id));
  list.splice(0, list.length, ...kept, ...made, ...after);
  for (const [id, a] of Object.entries(assets.map)) {
    env.deck.assets ??= {};
    if (!env.deck.assets[id]) env.deck.assets[id] = a;
  }
  for (const x of made) {
    const fit = (x.warnings ?? []).filter((w) => FIT_CHECKS.has(w.check));
    const own = (x.warnings ?? []).filter((w) => !FIT_CHECKS.has(w.check));
    if (own.length) x.warnings = own;
    else delete x.warnings;
    replaceFitWarnings(env.deck, slide, x, fit);
  }
  return { el: next, warnings };
}

/** An image's focal point (an override): kept on the element, the cover crop made around it for the frame. */
function setFocal(el, focal, env) {
  if (el.type !== 'image' || !el.image) return false;
  el.image.focal = focal;
  if (el.image.fit !== 'contain') {
    const crop = focalCrop(focal, env.deck.assets?.[el.image.asset], el.frame);
    if (crop) el.image.crop = crop;
  }
  return true;
}

/** An image's fit mode (cover / contain): a contain image shows the whole file (no crop); cover keeps its focal crop. */
function setFit(el, fit, env) {
  if (el.type !== 'image' || !el.image) return false;
  el.image.fit = fit;
  if (fit === 'contain') delete el.image.crop;
  else if (el.image.focal) {
    const crop = focalCrop(el.image.focal, env.deck.assets?.[el.image.asset], el.frame);
    if (crop) el.image.crop = crop;
  }
  return true;
}

/** A literal colour on the element: a text's font (and the bullets painted in the old font colour), a shape's fill, a line's stroke. */
function setColor(el, color) {
  if (el.type === 'text' && el.text?.font) {
    const old = el.text.font.color;
    el.text.font.color = color;
    for (const p of el.text.paragraphs ?? [])
      if (p.bullet?.color && p.bullet.color === old) p.bullet.color = color;
    return true;
  }
  const kind = el.type === 'line' ? 'line' : el.shape?.kind;
  if (el.type === 'line' || kind === 'line') {
    el.style = { ...(el.style ?? {}), stroke: { ...(el.style?.stroke ?? { width: 1 }), color } };
    return true;
  }
  if (el.type === 'shape') {
    el.style = { ...(el.style ?? {}), fill: color };
    return true;
  }
  return false;
}

/**
 * applyElementOverrides(deck, elements, {mood, brandSpec, content, catalogue}) -> {deck, warnings}
 * `elements[id] = {frame?, locked?, hidden?, color?, fit?}` for any element of any slide (group children included).
 * The deck is copied, never mutated; without overrides it is returned as is (so the golden decks stay byte-identical).
 * `content` = the content the deck was composed from (its `source` pointers name its slides' blocks) and `catalogue`
 * the layout catalogue (brand icons): with them a resized chart / table is laid out again for its frame; without
 * them it moves only (a note). `warnings`: one per override whose id is not in the deck, per key refused, per text
 * still overflowing after its re-fit (check `overflow`, kept on the element / slide / deck as compose does) and per
 * element moved without a re-fit.
 */
export function applyElementOverrides(deck, elements, { mood, brandSpec, content, catalogue } = {}) {
  const ids = Object.keys(elements ?? {});
  if (!ids.length) return { deck, warnings: [] };
  if (!mood) throw new Error('applyElementOverrides() needs the Mood (text is re-fitted with its metrics)');
  const out = structuredClone(deck);
  const canvas = out.canvas ?? { width: 1920, height: 1080 };
  const env = {
    deck: out,
    mood,
    brandSpec,
    content,
    catalogue,
    surfaces: new Map((mood.palette?.surfaces ?? []).map((s) => [s.id, s])),
  };
  let byId = new Map(deckElements(out).map((e) => [e.el.id, e]));
  const warnings = [];
  const say = (message, extra = {}) =>
    warnings.push({ check: 'override', severity: 'warn', message, ...extra });
  // parents before children: a group carries its children, then a child's own override places it
  const pos = new Map([...byId.keys()].map((k, i) => [k, i]));
  const order = ids
    .filter((id) => {
      if (byId.has(id)) return true;
      say(`element override for unknown element "${id}" ignored`, { elementId: id });
      return false;
    })
    .sort((a, b) => pos.get(a) - pos.get(b));
  for (const id of order) {
    const entry = byId.get(id);
    if (!entry) continue; // a drawn part replaced when its chart / table was laid out again
    const { slide } = entry;
    let { el } = entry;
    const { value, errors } = checkElementOverride(id, elements[id]);
    for (const e of errors) say(`${e}: ignored`, { elementId: id, slide: slide.id });
    if (value.frame) {
      const frame = clampFrame(value.frame, canvas);
      if (!sameFrame(frame, value.frame)) {
        warnings.push({
          check: 'override',
          severity: 'info',
          slide: slide.id,
          elementId: id,
          message: `"${id}" frame clamped to the canvas`,
        });
      }
      // a chart / table is drawn again for any new frame (its drawn parts - rich cells, a gauge value - move too)
      const moved = !sameFrame(frame, el.frame);
      const again =
        moved && (el.type === 'chart' || el.type === 'table') ? relayout(entry, frame, env) : null;
      if (again?.el) {
        el = again.el;
        warnings.push(...again.warnings);
        byId = new Map(deckElements(out).map((e) => [e.el.id, e]));
      } else if (!sameFrame(frame, el.frame)) {
        if (again) warnings.push(...again.warnings);
        const r = place(el, frame, slide, env);
        warnings.push(...r.warnings.map((w) => ({ ...w, slide: slide.id })));
        for (const n of r.notes)
          warnings.push({ check: 'override', severity: 'info', slide: slide.id, elementId: id, message: n });
      }
    }
    if (value.focal && !setFocal(el, value.focal, env)) {
      say(`"${id}" is a ${el.type}: a focal point applies to images only`, {
        elementId: id,
        slide: slide.id,
      });
    }
    if (value.fit && !setFit(el, value.fit, env)) {
      say(`"${id}" is a ${el.type}: a fit override applies to images only`, {
        elementId: id,
        slide: slide.id,
      });
    }
    if (value.color && !setColor(el, value.color)) {
      say(`"${id}" is a ${el.type}: a colour override applies to text, shapes and lines only`, {
        elementId: id,
        slide: slide.id,
      });
    }
    if (value.locked) el.locked = true;
    if (value.hidden) el.hidden = true;
  }
  return { deck: sortKeys(out), warnings };
}

/** The deck as painted: hidden elements (and hidden group children) left out. The same object when none is hidden. */
export function paintedDeck(deck) {
  const anyHidden = deckElements(deck).some((e) => e.el.hidden);
  if (!anyHidden) return deck;
  const keep = (els) =>
    (els ?? [])
      .filter((el) => !el.hidden)
      .map((el) => (Array.isArray(el.children) ? { ...el, children: keep(el.children) } : el));
  return { ...deck, slides: deck.slides.map((s) => ({ ...s, elements: keep(s.elements) })) };
}
