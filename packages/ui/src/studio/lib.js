// Pure helpers of the Studio (docs/PLAN-studio.md §2): fit scale, navigation keys, overrides, captions. No rule is
// computed here: the server composes and checks; these only read what it returned.

export const CANVAS = Object.freeze({ width: 1920, height: 1080 });

/** The fit scale of a 1920×1080 slide in a w×h area (pad on every side): min(w / 1920, h / 1080), never ≤ 0. */
export function fitScale(w, h, { pad = 0, canvas = CANVAS } = {}) {
  const sw = (w - 2 * pad) / canvas.width;
  const sh = (h - 2 * pad) / canvas.height;
  const s = Math.min(sw, sh);
  return Number.isFinite(s) && s > 0 ? s : 0.1;
}

/** The scale for a zoom setting: 'fit' → the fit scale, 50 / 100 → 0.5 / 1. */
export function zoomScale(zoom, fit) {
  if (zoom === 'fit') return fit;
  const n = Number(zoom);
  return Number.isFinite(n) && n > 0 ? n / 100 : fit;
}

/**
 * The slide index a key moves to (null: not a navigation key). ← ↑ PageUp: previous; → ↓ PageDown: next;
 * Home / Cmd(Ctrl)+← ↑: first; End / Cmd(Ctrl)+→ ↓: last.
 */
export function navTarget(e, index, total) {
  if (!total) return null;
  const meta = e.metaKey || e.ctrlKey;
  const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
  const fwd = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key);
  let n = null;
  if (e.key === 'Home' || (meta && back)) n = 0;
  else if (e.key === 'End' || (meta && fwd)) n = total - 1;
  else if (back) n = index - 1;
  else if (fwd) n = index + 1;
  if (n === null) return null;
  return Math.max(0, Math.min(total - 1, n));
}

/** True when a key event comes from a field the user is typing in. */
export function typingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/**
 * The overrides with one slide's entry patched: `null` / `undefined` removes a key, decor / logo `true` is the
 * default (removed), an entry left empty is removed. Never mutates `overrides`.
 */
export function patchOverrides(overrides, slideId, patch) {
  const slides = { ...(overrides?.slides ?? {}) };
  const entry = { ...(slides[slideId] ?? {}) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === null || v === undefined || ((k === 'decor' || k === 'logo') && v === true)) delete entry[k];
    else entry[k] = v;
  }
  if (Object.keys(entry).length) slides[slideId] = entry;
  else delete slides[slideId];
  return { slides };
}

/** The override entry of a deck slide (by its content slide id). */
export function overrideOf(overrides, slide) {
  if (!slide) return {};
  return overrides?.slides?.[slide.contentSlideId ?? slide.id] ?? {};
}

/** Does the slide paint an element of this role (decor, logo …)? Groups searched. */
export function hasRole(slide, role) {
  const walk = (els) => (els ?? []).some((e) => e.role === role || walk(e.children));
  return walk(slide?.elements);
}

/** The caption under the canvas: kind · layout · surface. */
export function caption(slide) {
  if (!slide) return '';
  return [slide.requestedKind ?? slide.kind, slide.layoutId, slide.surfaceId].filter(Boolean).join(' · ');
}

/** Check items split into this slide's and the deck's (no slide / index). */
export function splitItems(checks, slide, n) {
  const mine = [];
  const deck = [];
  for (const r of checks?.results ?? []) {
    for (const item of r.items ?? []) {
      const it = { ...item, check: r.id, title: r.title };
      if (it.slide == null && it.index == null) deck.push(it);
      else if ((it.slide != null && it.slide === slide?.id) || (it.slide == null && it.index === n))
        mine.push(it);
    }
  }
  return { mine, deck };
}

/** Severity counts of a list of check items. */
export function countSeverities(items) {
  const c = { fail: 0, warn: 0, info: 0 };
  for (const it of items ?? []) if (c[it.severity] !== undefined) c[it.severity] += 1;
  return c;
}
