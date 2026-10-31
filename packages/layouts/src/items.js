/**
 * Item sub-layouts: what the engine stamps once per item inside a flow box (`flow.itemLayout`). Each is
 * `{ id, build({ mood, w, h }) → { id, boxes, slots } }` with frames in ITEM-LOCAL px (x, y from 0, inside w × h).
 * Sizes trace to the Mood: role line boxes (type.roles), component tokens (components.*.tokens), spacing tokens.
 */
import { LINES, frame, lineBox, pickRole, round, space } from './geometry.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Component tokens, or {}. */
const tokens = (mood, name) => mood?.components?.[name]?.tokens ?? {};

/** A component's inner padding (signal: components[name].tokens.padding / padding.0), else spacing.md. */
function padding(mood, name) {
  const t = tokens(mood, name);
  return num(t.padding) ?? num(t['padding.0']) ?? space(mood, 'md');
}

/** Shape-box token refs for a component background (surface roles only; literal colours stay in the component). */
function shapeFor(mood, name, kind = 'rect') {
  const t = tokens(mood, name);
  const s = { kind, fill: 'card' };
  if (t['border.style'] && t['border.style'] !== 'none') s.stroke = 'border';
  if (typeof t.radius === 'string') s.radius = t.radius;
  return s;
}

function make(id, w, h, parts) {
  const boxes = [];
  const slots = [];
  for (const p of parts) {
    if (!p) continue;
    const { slot, ...box } = p;
    // Clamp every box to the item so stamping never leaks outside the item frame.
    // (an item too small for its roles collapses boxes to zero size at the edge; the fitter reports the overflow).
    const x = Math.min(w, Math.max(0, box.frame.x));
    const y = Math.min(h, Math.max(0, box.frame.y));
    const f = frame(x, y, Math.min(box.frame.w, w - x), Math.min(box.frame.h, h - y));
    boxes.push({ ...box, frame: round(f), ...(slot ? { slot: slot.id } : {}) });
    if (slot)
      slots.push({
        id: slot.id,
        type: slot.type,
        box: box.id,
        required: false,
        ...(slot.role ? { role: slot.role } : {}),
      });
  }
  return { id, w, h, boxes, slots };
}

/** Card: background shape, title (components.card.tokens.titleRole, else h3), text (bodyRole, else body). */
const card = {
  id: 'card-title-text',
  build({ mood, w, h }) {
    const p = padding(mood, 'card');
    const t = tokens(mood, 'card');
    const titleRole = pickRole(mood, t.titleRole, 'h3');
    const bodyRole = pickRole(mood, t.bodyRole, 'body');
    const th = lineBox(mood, titleRole, LINES.heading);
    const g = space(mood, 'sm');
    const ty = p;
    const by = ty + th + g;
    return make(this.id, w, h, [
      { id: 'bg', role: 'shape', frame: frame(0, 0, w, h), shape: shapeFor(mood, 'card') },
      {
        id: 'title',
        role: 'title',
        frame: frame(p, ty, w - 2 * p, th),
        slot: { id: 'title', type: 'text', role: titleRole },
      },
      {
        id: 'text',
        role: 'body',
        frame: frame(p, by, w - 2 * p, h - by - p),
        slot: { id: 'text', type: 'richtext', role: bodyRole },
      },
    ]);
  },
};

/** KPI: value (stat role) over label (components.kpi.tokens.labelStyle, else statLabel). */
const kpi = {
  id: 'kpi-value-label',
  build({ mood, w, h }) {
    const labelRole = pickRole(mood, tokens(mood, 'kpi').labelStyle, 'statLabel');
    const vh = lineBox(mood, 'stat', LINES.one);
    const g = space(mood, 'sm');
    return make(this.id, w, h, [
      {
        id: 'value',
        role: 'number',
        frame: frame(0, 0, w, vh),
        slot: { id: 'value', type: 'number', role: 'stat' },
      },
      {
        id: 'label',
        role: 'body',
        frame: frame(0, vh + g, w, h - vh - g),
        slot: { id: 'label', type: 'text', role: labelRole },
      },
    ]);
  },
};

/** Marker side for numbered steps: one h3 line plus spacing.sm around it (signals: type.roles.h3, spacing.sm). */
export function markerSize(mood) {
  return lineBox(mood, 'h3', LINES.one) + 2 * space(mood, 'sm');
}

/** Marker shape from components.steps.tokens.marker (circle-* → ellipse, square-* → rect, other / none → no shape). */
function markerShape(marker) {
  if (typeof marker !== 'string') return null;
  if (marker.startsWith('circle')) return { kind: 'ellipse', fill: 'accent' };
  if (marker.startsWith('square')) return { kind: 'rect', fill: 'accent' };
  return null;
}

/**
 * Step: number marker, title, text. Wide items (vertical step lists: w ≥ 2h) put the marker left of the text;
 * otherwise the marker sits on top.
 */
const step = {
  id: 'step-number-title-text',
  build({ mood, w, h }) {
    const m = Math.min(markerSize(mood), w, h);
    const g = space(mood, 'sm');
    const th = lineBox(mood, 'h3', LINES.heading);
    const shape = markerShape(tokens(mood, 'steps').marker);
    const wide = w >= 2 * h;
    const tx = wide ? m + space(mood, 'md') : 0;
    const ty = wide ? 0 : m + g;
    const tw = w - tx;
    return make(this.id, w, h, [
      shape ? { id: 'marker', role: 'shape', frame: frame(0, 0, m, m), shape } : null,
      {
        id: 'number',
        role: 'number',
        frame: frame(0, 0, m, m),
        align: { h: 'center', v: 'middle' },
        slot: { id: 'number', type: 'number', role: 'h3' },
      },
      {
        id: 'title',
        role: 'title',
        frame: frame(tx, ty, tw, th),
        slot: { id: 'title', type: 'text', role: 'h3' },
      },
      {
        id: 'text',
        role: 'body',
        frame: frame(tx, ty + th + g, tw, h - ty - th - g),
        slot: { id: 'text', type: 'richtext', role: 'body' },
      },
    ]);
  },
};

/** Timeline: when (eyebrow), a dot on the line (spacing.sm; only with components.timeline), title, text. */
const timeline = {
  id: 'timeline-when-title-text',
  build({ mood, w, h }) {
    const g = space(mood, 'sm');
    const wh = lineBox(mood, 'eyebrow', LINES.one);
    const hasLine = Boolean(mood?.components?.timeline);
    const dot = hasLine ? 2 * g : 0;
    const dotY = wh + g;
    const ty = dotY + dot + (hasLine ? g : 0);
    const th = lineBox(mood, 'h3', LINES.heading);
    return make(this.id, w, h, [
      {
        id: 'when',
        role: 'eyebrow',
        frame: frame(0, 0, w, wh),
        slot: { id: 'when', type: 'text', role: 'eyebrow' },
      },
      hasLine
        ? {
            id: 'marker',
            role: 'shape',
            frame: frame(0, dotY, dot, dot),
            shape: { kind: 'ellipse', fill: 'accent' },
          }
        : null,
      {
        id: 'title',
        role: 'title',
        frame: frame(0, ty, w, th),
        slot: { id: 'title', type: 'text', role: 'h3' },
      },
      {
        id: 'text',
        role: 'body',
        frame: frame(0, ty + th + g, w, h - ty - th - g),
        slot: { id: 'text', type: 'richtext', role: 'body' },
      },
    ]);
  },
};

/** Where the timeline line runs inside an item (item-local y of the dot centre), for the layout's divider box. */
export function timelineLineY(mood) {
  const g = space(mood, 'sm');
  return lineBox(mood, 'eyebrow', LINES.one) + g + g;
}

/** Person: avatar (components.avatar.tokens.size, capped to the room), name (h3), role (bodySmall). */
const person = {
  id: 'person-avatar-name-role',
  build({ mood, w, h }) {
    const g = space(mood, 'sm');
    const nh = lineBox(mood, 'h3', LINES.one);
    const rh = lineBox(mood, 'bodySmall', LINES.label);
    const room = Math.max(0, h - nh - rh - 2 * g);
    const want = num(tokens(mood, 'avatar').size);
    const a = Math.min(w, room, want ?? Math.min(w, room));
    return make(this.id, w, h, [
      { id: 'photo', role: 'image', frame: frame(0, 0, a, a), slot: { id: 'photo', type: 'image' } },
      {
        id: 'name',
        role: 'title',
        frame: frame(0, a + g, w, nh),
        slot: { id: 'name', type: 'text', role: 'h3' },
      },
      {
        id: 'role',
        role: 'body',
        frame: frame(0, a + g + nh + g, w, rh),
        slot: { id: 'role', type: 'text', role: 'bodySmall' },
      },
    ]);
  },
};

/** Logo chip: the logo (components.logoWall.tokens.height, capped) over its name (labelStyle, else caption). */
const logoChip = {
  id: 'logo-chip',
  build({ mood, w, h }) {
    const t = tokens(mood, 'logoWall');
    const labelRole = pickRole(mood, t.labelStyle, 'caption');
    const g = space(mood, 'sm');
    const lh = lineBox(mood, labelRole, LINES.one);
    const lg = Math.min(num(t.height) ?? h - lh - g, h - lh - g);
    return make(this.id, w, h, [
      {
        id: 'logo',
        role: 'logo',
        frame: frame(0, 0, w, lg),
        align: { h: 'center', v: 'middle' },
        slot: { id: 'logo', type: 'image' },
      },
      {
        id: 'name',
        role: 'body',
        frame: frame(0, lg + g, w, lh),
        align: { h: 'center' },
        slot: { id: 'name', type: 'text', role: labelRole },
      },
    ]);
  },
};

export const items = Object.freeze({
  [card.id]: card,
  [kpi.id]: kpi,
  [step.id]: step,
  [timeline.id]: timeline,
  [person.id]: person,
  [logoChip.id]: logoChip,
});

/** Build an item sub-layout by id: `itemLayout(id, { mood, w, h })`. */
export function itemLayout(id, args) {
  const def = items[id];
  if (!def) throw new Error(`unknown item layout: ${id}`);
  return def.build(args);
}
