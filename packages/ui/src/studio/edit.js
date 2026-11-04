// Pure helpers of the Studio's editor (docs/P4-spec.md §1, §2, §5; P4.1): overrides patches and commands (undo /
// redo), the draft frames painted during a gesture, snapping, resize, align / distribute / match size. No rule is
// computed here: every committed change goes to the server, which re-composes, re-fits and re-checks.
import { findElement } from '../lib/checks.js';

/** The fix commands the server can turn into element overrides (POST /api/studio/fix). */
export const FIX_COMMANDS = Object.freeze(['refit', 'move-inside', 'snap-colour', 'reset']);
/** Snapping distance on screen (px); divided by the canvas scale to compare canvas px. */
export const SNAP_PX = 6;
/** The smallest frame side a resize leaves (canvas px). */
export const MIN_SIDE = 8;
/** The command log keeps this many commands (the server trims to the same). */
export const HISTORY_LIMIT = 200;

const KEYS = ['slides', 'elements'];
const r2 = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};
export const roundFrame = (f) => ({ x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) });
export const sameFrame = (a, b) =>
  Boolean(a && b) && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.005);

/**
 * The overrides as sent to the server: `{slides}` plus `elements` only when it holds an override, plus `fontPair`
 * (P4.3, the deck-level font pair) when one is chosen.
 */
export function cleanOverrides(o) {
  const out = { slides: { ...(o?.slides ?? {}) } };
  if (o?.elements && Object.keys(o.elements).length) out.elements = { ...o.elements };
  if (typeof o?.fontPair === 'string' && o.fontPair) out.fontPair = o.fontPair;
  return out;
}

const entryOrNull = (v) => (v && typeof v === 'object' && Object.keys(v).length ? v : null);

const hasPair = (patch) => Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, 'fontPair');

/**
 * A patch applied to the overrides: `{slides?: {[id]: entry | null}, elements?: {[id]: entry | null}, fontPair?:
 * id | null}`, each entry the whole new value (null or empty = removed). Never mutates `overrides`.
 */
export function applyPatch(overrides, patch) {
  const out = {
    slides: { ...(overrides?.slides ?? {}) },
    elements: { ...(overrides?.elements ?? {}) },
    fontPair: overrides?.fontPair ?? null,
  };
  for (const k of KEYS) {
    for (const [id, v] of Object.entries(patch?.[k] ?? {})) {
      const e = entryOrNull(v);
      if (e) out[k][id] = e;
      else delete out[k][id];
    }
  }
  if (hasPair(patch)) out.fontPair = patch.fontPair || null;
  return cleanOverrides(out);
}

/** The patch that undoes `patch` on `overrides`: each touched id back to its current value (or null). */
export function inversePatch(overrides, patch) {
  const inv = {};
  for (const k of KEYS) {
    if (!patch?.[k]) continue;
    inv[k] = {};
    for (const id of Object.keys(patch[k])) inv[k][id] = overrides?.[k]?.[id] ?? null;
  }
  if (hasPair(patch)) inv.fontPair = overrides?.fontPair ?? null;
  return inv;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** True when the patch changes nothing on `overrides`. */
export function isNoop(overrides, patch) {
  if (hasPair(patch) && (patch.fontPair || null) !== (overrides?.fontPair ?? null)) return false;
  return KEYS.every((k) =>
    Object.entries(patch?.[k] ?? {}).every(([id, v]) => same(entryOrNull(v), overrides?.[k]?.[id] ?? null)),
  );
}

/** A command (P4-spec §1): `{type, label, slideId, args, inverse, at}` - args / inverse are patches. */
export function makeCommand(overrides, patch, { type = 'edit', label, slideId } = {}) {
  const cmd = { type, args: patch, inverse: inversePatch(overrides, patch), at: new Date().toISOString() };
  if (label) cmd.label = label;
  if (slideId) cmd.slideId = slideId;
  return cmd;
}

/** The log with `cmd` pushed after the cursor (the redo tail dropped), trimmed to HISTORY_LIMIT. */
export function pushCommand(history, cmd) {
  const done = (history?.commands ?? []).slice(0, history?.cursor ?? 0);
  const commands = [...done, cmd].slice(-HISTORY_LIMIT);
  return { commands, cursor: commands.length };
}

/** An element override with some keys changed (null / false / undefined = removed). */
export function withKeys(entry, changes) {
  const out = { ...(entry ?? {}) };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === false) delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Every element of a slide, depth first. */
export function slideElements(slide) {
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

/** The ids of every element of a slide (groups searched). */
export const elementIds = (slide) => slideElements(slide).map((e) => e.id);

/** The elements selectable at one level: the slide's own, or a group's children when the group is entered. */
export function levelElements(slide, group) {
  if (group) return findElement(slide?.elements, group)?.children ?? [];
  return slide?.elements ?? [];
}

/**
 * The element a pointer target selects: of the `[data-element-id]` boxes around `target` (inside the slide), the one
 * at the current level - the outermost, or the direct child of the entered `group`. Null outside any element.
 */
export function pickTarget(target, group) {
  const chain = [];
  let node = target;
  while (node && node.nodeType === 1) {
    if (node.classList?.contains('slide')) break;
    const id = node.getAttribute?.('data-element-id');
    if (id) chain.push(id);
    node = node.parentNode;
  }
  if (!chain.length) return null;
  if (group) {
    const k = chain.indexOf(group);
    if (k > 0) return chain[k - 1];
    if (k === 0) return null;
  }
  return chain[chain.length - 1];
}

/** The slide's overflowing texts (fitter output). */
export const overflowing = (slide) => slideElements(slide).filter((e) => e.text?.fit?.overflow);

/**
 * The deck with draft frames on one slide (during a gesture): each element at its draft frame; a group's children
 * moved (and scaled) with it. The deck is copied along the changed path only.
 */
export function withFrames(deck, index, frames) {
  if (!deck || !frames || !Object.keys(frames).length) return deck;
  const move = (el, frame) => {
    const from = el.frame;
    const out = { ...el, frame };
    if (Array.isArray(el.children)) {
      const sx = from.w > 0 ? frame.w / from.w : 1;
      const sy = from.h > 0 ? frame.h / from.h : 1;
      out.children = el.children.map((c) =>
        move(c, {
          x: frame.x + (c.frame.x - from.x) * sx,
          y: frame.y + (c.frame.y - from.y) * sy,
          w: c.frame.w * sx,
          h: c.frame.h * sy,
        }),
      );
    }
    return out;
  };
  const walk = (els) =>
    els.map((el) => {
      let next = frames[el.id] ? move(el, frames[el.id]) : el;
      if (Array.isArray(next.children) && !frames[el.id]) {
        const kids = walk(next.children);
        if (kids.some((k, i) => k !== next.children[i])) next = { ...next, children: kids };
      }
      return next;
    });
  const slides = deck.slides.map((s, i) => (i === index ? { ...s, elements: walk(s.elements ?? []) } : s));
  return { ...deck, slides };
}

/** The content frame (the canvas inset by the brand's margins), or the canvas without margins. */
export function contentFrameOf(geometry, canvas = { width: 1920, height: 1080 }) {
  const m = geometry?.margins ?? {};
  const l = m.left ?? 0;
  const t = m.top ?? 0;
  return { x: l, y: t, w: canvas.width - l - (m.right ?? 0), h: canvas.height - t - (m.bottom ?? 0) };
}

/** The snapping distance in canvas px at canvas `scale`: SNAP_PX on screen at every zoom (P4.4). */
export const snapThreshold = (scale) => SNAP_PX / (scale > 0 ? scale : 1);

/**
 * Snap targets on each axis: the content frame (margins) and its centre, the title zone, the brand's grid columns
 * (geometry.grid {columns, gutter} across the content frame), the canvas centre and the other elements' edges and
 * centres. Each target: {v, kind} (an element's also carries its `frame`, for the distance label); `frames` = the
 * other elements' frames (the equal-spacing snap, P4.4). Hidden and background elements are not targets.
 */
export function snapTargets({
  slide,
  geometry,
  canvas = { width: 1920, height: 1080 },
  exclude = new Set(),
}) {
  const x = [];
  const y = [];
  const frames = [];
  const c = contentFrameOf(geometry, canvas);
  if (geometry?.margins) {
    x.push({ v: c.x, kind: 'margin' }, { v: c.x + c.w, kind: 'margin' });
    y.push({ v: c.y, kind: 'margin' }, { v: c.y + c.h, kind: 'margin' });
  }
  x.push({ v: canvas.width / 2, kind: 'centre' });
  y.push({ v: canvas.height / 2, kind: 'centre' });
  const tz = geometry?.titleZone;
  if (tz && typeof tz.y === 'number' && typeof tz.height === 'number') {
    y.push({ v: tz.y, kind: 'title' }, { v: tz.y + tz.height, kind: 'title' });
  }
  const grid = geometry?.grid;
  if (geometry?.margins && grid?.columns > 1) {
    const g = grid.gutter ?? 0;
    const col = (c.w - (grid.columns - 1) * g) / grid.columns;
    for (let i = 0; i < grid.columns; i += 1) {
      const left = c.x + i * (col + g);
      if (i > 0) x.push({ v: left, kind: 'grid' });
      if (i < grid.columns - 1) x.push({ v: left + col, kind: 'grid' });
    }
  }
  for (const el of slide?.elements ?? []) {
    if (exclude.has(el.id) || el.hidden || !el.frame || el.role === 'background') continue;
    const f = el.frame;
    frames.push(f);
    x.push(
      { v: f.x, kind: 'element', frame: f },
      { v: f.x + f.w / 2, kind: 'element', frame: f },
      { v: f.x + f.w, kind: 'element', frame: f },
    );
    y.push(
      { v: f.y, kind: 'element', frame: f },
      { v: f.y + f.h / 2, kind: 'element', frame: f },
      { v: f.y + f.h, kind: 'element', frame: f },
    );
  }
  return { x, y, frames };
}

/** How far `frame` is from `other` across `axis` (0 when they overlap); Infinity without a frame. */
function across(frame, other, axis) {
  if (!frame || !other) return Infinity;
  const c = axis === 'x' ? 'y' : 'x';
  const size = c === 'x' ? 'w' : 'h';
  return Math.max(0, other[c] - (frame[c] + frame[size]), frame[c] - (other[c] + other[size]));
}

/**
 * The nearest target to any of `edges` within `threshold`: {delta, v, target} or null. On a tie an element wins
 * over a margin / grid / centre line (its distance label says more), and of two elements the one nearer `frame`
 * across the axis.
 */
function nearest(edges, targets, threshold, frame = null, axis = 'x') {
  let best = null;
  const rank = (t) => (t.kind === 'element' ? across(frame, t.frame, axis) : Infinity);
  for (const e of edges) {
    for (const t of targets ?? []) {
      const d = t.v - e;
      if (Math.abs(d) > threshold) continue;
      if (
        !best ||
        Math.abs(d) < Math.abs(best.delta) - 1e-9 ||
        (Math.abs(Math.abs(d) - Math.abs(best.delta)) <= 1e-9 && rank(t) < rank(best.target))
      )
        best = { delta: d, v: t.v, target: t };
    }
  }
  return best;
}

const AXIS = {
  x: { pos: 'x', size: 'w', cpos: 'y', csize: 'h' },
  y: { pos: 'y', size: 'h', cpos: 'x', csize: 'w' },
};
const overlaps = (a, b, k) => a[k.cpos] < b[k.cpos] + b[k.csize] && a[k.cpos] + a[k.csize] > b[k.cpos];

/**
 * The equal-spacing snap of `frame` on `axis` ('x' | 'y'): the nearest neighbour on each side (overlapping it across
 * the axis) and the position that leaves equal gaps to both, when within `threshold`: {delta, pos, gap, before,
 * after} or null.
 */
export function spacingSnap(frame, axis, frames, threshold) {
  const k = AXIS[axis];
  const mid = frame[k.pos] + frame[k.size] / 2;
  let before = null;
  let after = null;
  for (const f of frames ?? []) {
    if (!overlaps(frame, f, k)) continue;
    const end = f[k.pos] + f[k.size];
    if (end <= mid && f[k.pos] < frame[k.pos] && (!before || end > before[k.pos] + before[k.size]))
      before = f;
    if (f[k.pos] >= mid && end > frame[k.pos] + frame[k.size] && (!after || f[k.pos] < after[k.pos]))
      after = f;
  }
  if (!before || !after) return null;
  const room = after[k.pos] - (before[k.pos] + before[k.size]) - frame[k.size];
  if (room <= 0) return null;
  const pos = before[k.pos] + before[k.size] + room / 2;
  const delta = pos - frame[k.pos];
  if (Math.abs(delta) > threshold) return null;
  return { delta, pos, gap: room / 2, before, after };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The guides of a snapped frame: a line per snapped axis ({axis, v}); for a snap to another element's edge the
 * distance to it across the axis ({type: 'gap', axis, from, to, at, label}, drawn along the line; none when they
 * overlap); for an equal-spacing snap the two equal gaps.
 */
export function snapGuides(frame, snaps) {
  const guides = [];
  for (const s of snaps) {
    if (s.spacing) {
      const k = AXIS[s.axis];
      const at = frame[k.cpos] + frame[k.csize] / 2;
      const { before, after } = s.spacing;
      const label = round1(s.spacing.gap);
      guides.push(
        { type: 'gap', axis: s.axis, from: before[k.pos] + before[k.size], to: frame[k.pos], at, label },
        { type: 'gap', axis: s.axis, from: frame[k.pos] + frame[k.size], to: after[k.pos], at, label },
      );
      continue;
    }
    guides.push({ axis: s.axis, v: s.v });
    const other = s.target?.kind === 'element' ? s.target.frame : null;
    if (!other) continue;
    // the distance across the guide line: between the frame and the element it lines up with
    const c = s.axis === 'x' ? 'y' : 'x';
    const size = c === 'x' ? 'w' : 'h';
    let from = null;
    let to = null;
    if (frame[c] >= other[c] + other[size]) {
      from = other[c] + other[size];
      to = frame[c];
    } else if (other[c] >= frame[c] + frame[size]) {
      from = frame[c] + frame[size];
      to = other[c];
    }
    if (from !== null && to > from)
      guides.push({ type: 'gap', axis: c, from, to, at: s.v, label: round1(to - from) });
  }
  return guides;
}

/**
 * A moved frame snapped: its left / centre / right and top / middle / bottom to the nearest targets, or to the
 * position with equal gaps to its two neighbours (`targets.frames`); the nearer snap wins (an edge on a tie).
 * Returns {frame, guides}.
 */
export function snapMove(frame, targets, threshold) {
  const snaps = [];
  const out = { ...frame };
  for (const axis of ['x', 'y']) {
    const k = AXIS[axis];
    const p = frame[k.pos];
    const edge = nearest(
      [p, p + frame[k.size] / 2, p + frame[k.size]],
      targets[axis],
      threshold,
      frame,
      axis,
    );
    const eq = targets.frames ? spacingSnap(frame, axis, targets.frames, threshold) : null;
    if (eq && (!edge || Math.abs(eq.delta) < Math.abs(edge.delta))) {
      out[k.pos] = p + eq.delta;
      snaps.push({ axis, spacing: eq });
    } else if (edge) {
      out[k.pos] = p + edge.delta;
      snaps.push({ axis, v: edge.v, target: edge.target });
    }
  }
  return { frame: out, guides: snapGuides(out, snaps) };
}

/**
 * A frame resized from `start` by handle `dir` (n, s, e, w and the corners) by (dx, dy) canvas px; `keepAspect`
 * keeps start's ratio (Shift on images, and on a multi-selection); the moving edges snap to `targets` within
 * `threshold` (the same targets as a move; null: no snapping), with the distance label of an element edge.
 */
export function resizeFrame(start, dir, dx, dy, { keepAspect = false, targets = null, threshold = 0 } = {}) {
  let { x, y, w, h } = start;
  let right = x + w;
  let bottom = y + h;
  const snaps = [];
  if (dir.includes('w')) x += dx;
  if (dir.includes('e')) right += dx;
  if (dir.includes('n')) y += dy;
  if (dir.includes('s')) bottom += dy;
  if (targets) {
    const snapEdge = (v, list, axis) => {
      const n = nearest([v], list, threshold, start, axis);
      if (!n) return v;
      snaps.push({ axis, v: n.v, target: n.target });
      return n.v;
    };
    if (dir.includes('w')) x = snapEdge(x, targets.x, 'x');
    if (dir.includes('e')) right = snapEdge(right, targets.x, 'x');
    if (dir.includes('n')) y = snapEdge(y, targets.y, 'y');
    if (dir.includes('s')) bottom = snapEdge(bottom, targets.y, 'y');
  }
  if (right - x < MIN_SIDE) {
    if (dir.includes('w')) x = right - MIN_SIDE;
    else right = x + MIN_SIDE;
  }
  if (bottom - y < MIN_SIDE) {
    if (dir.includes('n')) y = bottom - MIN_SIDE;
    else bottom = y + MIN_SIDE;
  }
  w = right - x;
  h = bottom - y;
  if (keepAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    const horizontal = dir.includes('e') || dir.includes('w');
    const vertical = dir.includes('n') || dir.includes('s');
    if (horizontal && (!vertical || w / start.w >= h / start.h)) {
      const nh = w / ratio;
      if (dir.includes('n')) y = bottom - nh;
      h = nh;
    } else {
      const nw = h * ratio;
      if (dir.includes('w')) x = right - nw;
      w = nw;
    }
  }
  const frame = roundFrame({ x, y, w, h });
  return { frame, guides: snapGuides(frame, snaps) };
}

/**
 * The move (dx, dy) of a group of frames whose bounding box is `box`, kept on the canvas: the group is clamped as
 * one (its frames keep their places to each other); a box larger than the canvas stays at its top / left edge.
 */
export function clampMove(box, dx, dy, canvas = { width: 1920, height: 1080 }) {
  const fit = (pos, size, d, max) => {
    const lo = -pos;
    const hi = max - size - pos;
    if (hi < lo) return lo;
    return Math.max(lo, Math.min(hi, d));
  };
  return { dx: fit(box.x, box.w, dx, canvas.width), dy: fit(box.y, box.h, dy, canvas.height) };
}

/** Frames {[id]: frame} scaled from box `from` to box `to` (a multi-selection resize): each in proportion. */
export function scaleFrames(frames, from, to) {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  const out = {};
  for (const [id, f] of Object.entries(frames)) {
    out[id] = roundFrame({
      x: to.x + (f.x - from.x) * sx,
      y: to.y + (f.y - from.y) * sy,
      w: f.w * sx,
      h: f.h * sy,
    });
  }
  return out;
}

/** The corner handles of a multi-selection (its edges do not resize: the selection scales from a corner). */
export const CORNERS = Object.freeze(['nw', 'ne', 'se', 'sw']);

// ---- selection (P4.4: the multi-select rules) ----

/** The elements that can be selected at one level: hidden ones never are (click, Tab, ⌘A). */
export const selectableElements = (slide, group) => levelElements(slide, group).filter((el) => !el.hidden);

/** ⌘A: every editable element at the level - not hidden, not locked, not the background. */
export const selectAllIds = (slide, group) =>
  selectableElements(slide, group)
    .filter((el) => !el.locked && el.role !== 'background')
    .map((el) => el.id);

/** The selection kept on a new deck: the ids it still has that are not hidden (the rest is dropped). */
export function pruneSelection(slide, selection) {
  const kept = selection.filter((id) => {
    const el = findElement(slide?.elements, id);
    return el && !el.hidden;
  });
  return kept.length === selection.length ? selection : kept;
}

/** A click on `id`: Shift toggles it in the selection; a plain click selects it alone (unless already selected). */
export function clickSelection(selection, id, shift) {
  if (shift) return selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
  return selection.includes(id) ? selection : [id];
}

/** The bounding box of frames. */
export function bounds(frames) {
  const x = Math.min(...frames.map((f) => f.x));
  const y = Math.min(...frames.map((f) => f.y));
  const right = Math.max(...frames.map((f) => f.x + f.w));
  const bottom = Math.max(...frames.map((f) => f.y + f.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Align `items` ([{id, frame}]) - left / center / right / top / middle / bottom - to `ref` (the selection's bounds
 * with ≥ 2, the content frame with 1). Returns {[id]: frame} of the frames that changed.
 */
export function alignFrames(items, how, ref) {
  const out = {};
  for (const { id, frame: f } of items) {
    const n = { ...f };
    if (how === 'left') n.x = ref.x;
    else if (how === 'center') n.x = ref.x + (ref.w - f.w) / 2;
    else if (how === 'right') n.x = ref.x + ref.w - f.w;
    else if (how === 'top') n.y = ref.y;
    else if (how === 'middle') n.y = ref.y + (ref.h - f.h) / 2;
    else if (how === 'bottom') n.y = ref.y + ref.h - f.h;
    const r = roundFrame(n);
    if (!sameFrame(r, f)) out[id] = r;
  }
  return out;
}

/** Equal gaps between ≥ 3 items along 'x' or 'y' (the first and last stay). Returns {[id]: frame} that changed. */
export function distributeFrames(items, axis) {
  if (items.length < 3) return {};
  const pos = axis === 'x' ? 'x' : 'y';
  const size = axis === 'x' ? 'w' : 'h';
  const sorted = [...items].sort((a, b) => a.frame[pos] - b.frame[pos]);
  const first = sorted[0].frame;
  const last = sorted[sorted.length - 1].frame;
  const span = last[pos] + last[size] - first[pos];
  const total = sorted.reduce((s, it) => s + it.frame[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  const out = {};
  let at = first[pos];
  for (const it of sorted) {
    const n = roundFrame({ ...it.frame, [pos]: at });
    if (!sameFrame(n, it.frame)) out[it.id] = n;
    at += it.frame[size] + gap;
  }
  return out;
}

/** Every item to the first item's width ('w') or height ('h'). Returns {[id]: frame} that changed. */
export function matchSize(items, key) {
  if (items.length < 2) return {};
  const v = items[0].frame[key];
  const out = {};
  for (const it of items.slice(1)) {
    const n = roundFrame({ ...it.frame, [key]: v });
    if (!sameFrame(n, it.frame)) out[it.id] = n;
  }
  return out;
}
