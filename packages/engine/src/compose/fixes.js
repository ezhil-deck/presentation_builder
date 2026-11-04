/**
 * One-click fixes (docs/P4-spec.md §4, ED-4): a check item's `fix` command turned into element overrides the editor
 * applies as an undoable command - never a silent change, and every fix re-composes and re-checks like any edit.
 *   refit        drop the element's frame override (the compose frame + the fitter at the role size)
 *   move-inside  the frame shifted into the content frame (shrunk only where it is larger than the content frame)
 *   snap-colour  the brand surface colour nearest the text's colour that reaches the item's required contrast on the
 *                element's background (the contrast check's `data.background` / `data.min`)
 *   reset        every override of the element removed
 * The result maps element id -> the element's whole new override, or null (no override left).
 */
import { r2 } from '../util/stable.js';
import { findDeckElement } from './overrides.js';
import { contentFrame } from './proposals.js';
import { SURFACE_ROLES, contrastRatio, resolve } from './resolve.js';

export const FIX_COMMANDS = Object.freeze(['refit', 'move-inside', 'snap-colour', 'reset']);

const HEX = /^#[0-9A-Fa-f]{6}/;

/** sRGB #RRGGBB -> CIE L*a*b* (D65), for "nearest colour". */
function lab(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 distance of two #RRGGBB colours. */
export function colourDistance(a, b) {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Every literal colour the brand's surfaces define (each surface role resolved on its surface), deduplicated. */
export function surfaceColours(mood) {
  const out = [];
  for (const surface of mood.palette?.surfaces ?? []) {
    const R = resolve(mood, surface, { warn: () => {} });
    for (const role of SURFACE_ROLES) {
      if (surface[role] === undefined) continue;
      const c = R.color(role);
      if (typeof c === 'string' && HEX.test(c) && !(c.length === 9 && c.endsWith('00'))) {
        const hex = c.slice(0, 7).toUpperCase();
        if (!out.includes(hex)) out.push(hex);
      }
    }
  }
  return out;
}

/**
 * The brand surface colour nearest `color` that reaches `min`:1 on `background`: {color, ratio} or null when none
 * does. Ties keep the higher contrast.
 */
export function snapColour(mood, { color, background, min }) {
  const bg = background.slice(0, 7);
  const ok = surfaceColours(mood)
    .map((c) => ({ color: c, ratio: contrastRatio(c, bg), d: color ? colourDistance(c, color) : 0 }))
    .filter((c) => c.ratio >= min - 1e-9)
    .sort((a, b) => a.d - b.d || b.ratio - a.ratio);
  return ok.length ? { color: ok[0].color, ratio: Math.floor(ok[0].ratio * 100) / 100 } : null;
}

/** `frame` moved into `c` (shrunk only on an axis where it is larger than `c`). */
export function moveInside(frame, c) {
  const w = Math.min(frame.w, c.w);
  const h = Math.min(frame.h, c.h);
  const x = Math.max(c.x, Math.min(frame.x, c.x + c.w - w));
  const y = Math.max(c.y, Math.min(frame.y, c.y + c.h - h));
  return { x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
}

const withoutKey = (o, key) => {
  const rest = { ...(o ?? {}) };
  delete rest[key];
  return Object.keys(rest).length ? rest : null;
};

/**
 * fixCommand(deck, item, {mood, brandSpec, overrides}) -> {elements: {[id]: override | null}, message}
 * `deck` = the composed deck (element overrides applied), `item` = a check item ({elementId, fix: {command}, data}),
 * `overrides` = the current element overrides ({[id]: override}). `elements` is empty when the fix has nothing to
 * change (the message says why). Throws for an item without an element, an element not in the deck, or a command
 * that is not one of FIX_COMMANDS.
 */
export function fixCommand(deck, item, { mood, overrides = {} } = {}) {
  const command = item?.fix?.command;
  if (!FIX_COMMANDS.includes(command)) {
    throw new Error(`fix command "${command}" is not supported (${FIX_COMMANDS.join(', ')})`);
  }
  const id = item.elementId;
  if (typeof id !== 'string' || !id) throw new Error(`the "${command}" fix needs the item's elementId`);
  const hit = findDeckElement(deck, id);
  if (!hit) throw new Error(`element "${id}" is not in the deck`);
  const cur = overrides[id] ?? null;

  if (command === 'reset') {
    if (!cur) return { elements: {}, message: `"${id}" has no override to reset` };
    return { elements: { [id]: null }, message: `"${id}" reset to the composed element` };
  }
  if (command === 'refit') {
    if (!cur?.frame) {
      return {
        elements: {},
        message: `"${id}" keeps the layout's frame: the fitter already sized it (shorten the text or enlarge the box)`,
      };
    }
    return {
      elements: { [id]: withoutKey(cur, 'frame') },
      message: `"${id}" back in its layout frame, re-fitted`,
    };
  }
  if (!mood) throw new Error(`the "${command}" fix needs the Mood`);
  if (command === 'move-inside') {
    const c = item.data?.contentFrame ?? contentFrame(mood, deck.canvas);
    const frame = moveInside(hit.el.frame, c);
    if (['x', 'y', 'w', 'h'].every((k) => frame[k] === hit.el.frame[k])) {
      return { elements: {}, message: `"${id}" is already inside the content frame` };
    }
    return { elements: { [id]: { ...(cur ?? {}), frame } }, message: `"${id}" moved inside the margins` };
  }
  // snap-colour
  const data = item.data ?? {};
  if (typeof data.background !== 'string' || !HEX.test(data.background) || typeof data.min !== 'number') {
    throw new Error("the snap-colour fix needs the contrast item's data.background and data.min");
  }
  const current = data.color ?? hit.el.text?.font?.color ?? null;
  const snap = snapColour(mood, { color: current, background: data.background, min: data.min });
  if (!snap) {
    return {
      elements: {},
      message: `no brand surface colour reaches ${data.min}:1 on ${data.background.slice(0, 7)}`,
    };
  }
  return {
    elements: { [id]: { ...(cur ?? {}), color: snap.color } },
    message: `"${id}" coloured ${snap.color} (${snap.ratio}:1 on ${data.background.slice(0, 7)})`,
  };
}
