/**
 * Shared helpers of the checks (P3-spec §A): element walks, frame geometry, items and result status. Pure, no I/O.
 */
import { contentFrame } from '@pb/engine';

/** Item severities, worst first (P3-spec §A.1: a result's status is its worst item; info alone = pass). */
export const SEVERITY_ORDER = Object.freeze(['fail', 'warn', 'info']);

/** Deep copy with object keys sorted (arrays keep their order); undefined values dropped. */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

/** Round to 2 decimals, -0 → 0. */
export function r2(n) {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

/** A number for messages: up to 2 decimals, no trailing zeros. */
export const fmt = (n) => String(r2(n));

/** Every element of a slide, depth first (group children right after their group). */
export function flatElements(slide) {
  const out = [];
  const walk = (els) => {
    for (const el of els ?? []) {
      out.push(el);
      if (Array.isArray(el.children)) walk(el.children);
    }
  };
  walk(slide?.elements);
  return out;
}

/** The kinds a slide answers to, most specific first: the kind as written (requestedKind), then the catalogue kind. */
export function slideKinds(slide) {
  return [...new Set([slide?.requestedKind, slide?.kind].filter(Boolean))];
}

/** Overlap of two frames: { w, h } (0 when they do not overlap on that axis). */
export function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

/** Whether `outer` contains `inner` (tolerance `eps` px on every side). */
export function contains(outer, inner, eps = 0.5) {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  );
}

/**
 * The box an element occupies on the slide: a text's laid-out block (frame width × the fitter's `fit.height`, placed
 * by valign) when the fitter recorded a height smaller than the frame, else the element frame.
 */
export function contentBox(el) {
  const f = el.frame;
  const h = el.text?.fit?.height;
  if (el.type !== 'text' || typeof h !== 'number' || h >= f.h) return f;
  const v = el.text.valign ?? 'top';
  const y = v === 'middle' ? f.y + (f.h - h) / 2 : v === 'bottom' ? f.y + f.h - h : f.y;
  return { x: f.x, y, w: f.w, h };
}

/** A frame grown by `d` px on every side. */
export const inflate = (f, d) => ({ x: f.x - d, y: f.y - d, w: f.w + 2 * d, h: f.h + 2 * d });

/** Whether a frame has four finite numbers. */
export const isFrame = (f) => Boolean(f) && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(f[k]));

/** Area of the union of rectangles (coordinate compression; exact for axis-aligned boxes). */
export function unionArea(rects) {
  const rs = rects.filter((r) => r.w > 0 && r.h > 0);
  if (!rs.length) return 0;
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rs.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rs.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h)) {
        area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return area;
}

/** The content frame: the canvas inset by mood.geometry.margins (the engine's own rule). */
export { contentFrame };

/** The canvas of a deck ({width, height}; the deck schema fixes 1920 × 1080). */
export const canvasOf = (deck) => ({
  width: deck?.canvas?.width ?? 1920,
  height: deck?.canvas?.height ?? 1080,
});

/**
 * An item (P3-spec §A.1). `slide` is the deck slide object (its id and 1-based index are recorded), `el` the element
 * the item is about; both optional.
 */
export function makeItem(severity, message, { slide, index, el, elementId, data, fix } = {}) {
  const item = { severity, message };
  if (slide) item.slide = slide.id;
  if (Number.isInteger(index)) item.index = index;
  const eid = el?.id ?? elementId;
  if (eid) item.elementId = eid;
  if (data !== undefined) item.data = data;
  if (fix) item.fix = fix;
  return item;
}

/** The worst item severity as a result status: fail > warn > pass (info alone = pass). */
export function statusOf(items) {
  if (items.some((i) => i.severity === 'fail')) return 'fail';
  if (items.some((i) => i.severity === 'warn')) return 'warn';
  return 'pass';
}

/** A check result from its items. */
export const result = (items) => ({ status: statusOf(items), items });

/** A skipped check: the signal it needs is absent (never a guessed threshold). */
export const skip = (reason) => ({ status: 'skip', reason, items: [] });

/** Stable item order: deck-level items first, then by slide index, then element id; ties keep their order. */
export function sortItems(items) {
  return items
    .map((it, k) => ({ it, k }))
    .sort(
      (a, b) =>
        (a.it.index ?? 0) - (b.it.index ?? 0) ||
        String(a.it.elementId ?? '').localeCompare(String(b.it.elementId ?? '')) ||
        a.k - b.k,
    )
    .map((x) => x.it);
}

/** Every slide with its 1-based index: [{ slide, index }]. */
export const slidesOf = (deck) => (deck?.slides ?? []).map((slide, i) => ({ slide, index: i + 1 }));

/** Slide id → 1-based index. */
export function slideIndex(deck) {
  const map = new Map();
  (deck?.slides ?? []).forEach((s, i) => map.set(s.id, i + 1));
  return map;
}

/** Whether a text element carries any visible text. */
export function hasText(el) {
  return (el.text?.paragraphs ?? []).some((p) => (p.runs ?? []).some((r) => String(r.text ?? '').trim()));
}

/** A compose warning's severity as an item severity: error → fail, info → info, warn (or none: the engine's default) → warn. */
export const severityOf = (w) => (w.severity === 'error' ? 'fail' : w.severity === 'info' ? 'info' : 'warn');

/** A compose warning (deck.warnings[]) as an item of a check. */
export function warningItem(w, idx, data = {}) {
  return makeItem(severityOf(w), w.message, {
    slide: w.slide ? { id: w.slide } : undefined,
    index: idx.get(w.slide),
    elementId: w.elementId,
    data: { check: w.check, ...data },
    fix: w.fix,
  });
}
