/**
 * Item sub-layouts: what the engine stamps once per item inside a flow box (`flow.itemLayout`). Each is
 * `{ id, build({ mood, w, h }) → { id, boxes, slots } }` with frames in ITEM-LOCAL px (x, y from 0, inside w × h).
 * Sizes trace to the Mood: role line boxes (type.roles), component tokens (components.*.tokens), spacing tokens.
 */
import { LINES, frame, gutter, lineBox, pickRole, role, round, space, spans } from './geometry.js';
import { iconSize } from './icons.js';

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
 * otherwise the marker sits on top. Steps whose icons resolve to the brand set (`fields.icon`, content/2 process)
 * show the icon in the marker's square instead of the number.
 */
const step = {
  id: 'step-number-title-text',
  build({ mood, w, h, fields = {} }) {
    const m = Math.min(markerSize(mood), w, h);
    const g = space(mood, 'sm');
    const th = lineBox(mood, 'h3', LINES.heading);
    const shape = markerShape(tokens(mood, 'steps').marker);
    const wide = w >= 2 * h;
    const tx = wide ? m + space(mood, 'md') : 0;
    const ty = wide ? 0 : m + g;
    const tw = w - tx;
    const head = fields.icon
      ? [{ id: 'icon', role: 'image', frame: frame(0, 0, m, m), slot: { id: 'icon', type: 'image' } }]
      : [
          shape ? { id: 'marker', role: 'shape', frame: frame(0, 0, m, m), shape } : null,
          {
            id: 'number',
            role: 'number',
            frame: frame(0, 0, m, m),
            align: { h: 'center', v: 'middle' },
            slot: { id: 'number', type: 'number', role: 'h3' },
          },
        ];
    return make(this.id, w, h, [
      ...head,
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

/**
 * Agenda row (content/2 agenda with descriptions, docs/S2-layouts.md §8): the number marker (steps marker shape and
 * size), the heading (h3) in the first 5 of the 12 columns after it and the description (body) in the rest, both
 * vertically centred on the row; a row too narrow for two columns (w < 3 × the marker + gutter) stacks the
 * description under the heading.
 */
const agendaRow = {
  id: 'agenda-row',
  build({ mood, w, h }) {
    const m = Math.min(markerSize(mood), w, h);
    const g = gutter(mood);
    const shape = markerShape(tokens(mood, 'steps').marker);
    const tx = m + space(mood, 'md');
    const tw = Math.max(0, w - tx);
    const my = Math.max(0, (h - m) / 2);
    const head = [
      shape ? { id: 'marker', role: 'shape', frame: frame(0, my, m, m), shape } : null,
      {
        id: 'number',
        role: 'number',
        frame: frame(0, my, m, m),
        align: { h: 'center', v: 'middle' },
        slot: { id: 'number', type: 'number', role: 'h3' },
      },
    ];
    if (tw < 3 * m + g) {
      const th = Math.min(h, lineBox(mood, 'h3', LINES.one));
      return make(this.id, w, h, [
        ...head,
        {
          id: 'title',
          role: 'title',
          frame: frame(tx, 0, tw, th),
          slot: { id: 'title', type: 'text', role: 'h3' },
        },
        {
          id: 'text',
          role: 'body',
          frame: frame(tx, th, tw, h - th),
          slot: { id: 'text', type: 'richtext', role: 'body' },
        },
      ]);
    }
    const [hf, bf] = spans(frame(tx, 0, tw, h), [5, 7], g);
    return make(this.id, w, h, [
      ...head,
      {
        id: 'title',
        role: 'title',
        frame: hf,
        align: { v: 'middle' },
        slot: { id: 'title', type: 'text', role: 'h3' },
      },
      {
        id: 'text',
        role: 'body',
        frame: bf,
        align: { v: 'middle' },
        slot: { id: 'text', type: 'richtext', role: 'body' },
      },
    ]);
  },
};

/** Timeline: when (eyebrow), a dot on the line (spacing.sm; only with components.timeline), title, text. */
const timeline = {
  id: 'timeline-when-title-text',
  build({ mood, w, h, fields = {} }) {
    const g = space(mood, 'sm');
    const wh = lineBox(mood, 'eyebrow', LINES.one);
    const hasLine = Boolean(mood?.components?.timeline);
    // content/2: a brand icon in place of the dot (the icon's room, signal: components.icon tokens)
    const icon = fields.icon ? iconSize(mood, 'h3').room : 0;
    const dot = icon || (hasLine ? 2 * g : 0);
    const dotY = wh + g;
    const ty = dotY + dot + (hasLine || icon ? g : 0);
    const th = lineBox(mood, 'h3', LINES.heading);
    return make(this.id, w, h, [
      {
        id: 'when',
        role: 'eyebrow',
        frame: frame(0, 0, w, wh),
        slot: { id: 'when', type: 'text', role: 'eyebrow' },
      },
      icon
        ? {
            id: 'icon',
            role: 'image',
            frame: frame(0, dotY, icon, icon),
            slot: { id: 'icon', type: 'image' },
          }
        : hasLine
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
export function timelineLineY(mood, iconRoom = 0) {
  const g = space(mood, 'sm');
  return lineBox(mood, 'eyebrow', LINES.one) + g + (iconRoom ? iconRoom / 2 : g);
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

/** Thumbnail aspect (signal: decor.imagery.crop.defaultRatio "w:h"); none → null (no thumbnail room). */
export function thumbRatio(mood) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(mood?.decor?.imagery?.crop?.defaultRatio ?? ''));
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}

/**
 * Rich item card (content/2 `items`, docs/S2-layouts.md §3): the card background, then from the top an optional
 * thumbnail (decor.imagery.crop.defaultRatio, at most 45 % of the card), an icon (the brand icon's room) or a
 * sequence-number marker (components.steps.tokens.marker), a label in the eyebrow role, the heading (card titleRole,
 * else h3) and the body (card bodyRole, else body). `fields` says which parts the items carry, so every card of a
 * list keeps the same rhythm.
 */
const itemCard = {
  id: 'item-card',
  build({ mood, w, h, fields = {} }) {
    const p = padding(mood, 'card');
    const t = tokens(mood, 'card');
    const titleRole = pickRole(mood, t.titleRole, 'h3');
    const bodyRole = pickRole(mood, t.bodyRole, 'body');
    const labelRole = pickRole(mood, 'eyebrow', 'caption');
    const g = space(mood, 'sm');
    const iw = w - 2 * p;
    const parts = [{ id: 'bg', role: 'shape', frame: frame(0, 0, w, h), shape: shapeFor(mood, 'card') }];
    let y = p;
    const ratio = thumbRatio(mood);
    if (fields.image && ratio) {
      const ih = Math.min(iw / ratio, 0.45 * h);
      parts.push({
        id: 'image',
        role: 'image',
        frame: frame(p, y, iw, ih),
        slot: { id: 'image', type: 'image' },
      });
      y += ih + g;
    }
    if (fields.icon) {
      const s = iconSize(mood, titleRole).room;
      parts.push({
        id: 'icon',
        role: 'image',
        frame: frame(p, y, s, s),
        slot: { id: 'icon', type: 'image' },
      });
      y += s + g;
    } else if (fields.number) {
      const m = Math.min(markerSize(mood), iw);
      const shape = markerShape(tokens(mood, 'steps').marker);
      if (shape) parts.push({ id: 'marker', role: 'shape', frame: frame(p, y, m, m), shape });
      parts.push({
        id: 'number',
        role: 'number',
        frame: frame(p, y, m, m),
        align: { h: 'center', v: 'middle' },
        slot: { id: 'number', type: 'number', role: 'h3' },
      });
      y += m + g;
    }
    if (fields.label) {
      const lh = lineBox(mood, labelRole, LINES.one);
      parts.push({
        id: 'label',
        role: 'eyebrow',
        frame: frame(p, y, iw, lh),
        slot: { id: 'label', type: 'text', role: labelRole },
      });
      y += lh + g;
    }
    const th = lineBox(mood, titleRole, LINES.heading);
    parts.push({
      id: 'title',
      role: 'title',
      frame: frame(p, y, iw, th),
      slot: { id: 'title', type: 'text', role: titleRole },
    });
    y += th + g;
    parts.push({
      id: 'text',
      role: 'body',
      frame: frame(p, y, iw, h - y - p),
      slot: { id: 'text', type: 'richtext', role: bodyRole },
    });
    return make(this.id, w, h, parts);
  },
};

/** KPI with a body: value (stat), heading (kpi labelStyle, else statLabel), body (bodySmall, else body). */
const kpiBody = {
  id: 'kpi-value-label-body',
  build({ mood, w, h }) {
    const labelRole = pickRole(mood, tokens(mood, 'kpi').labelStyle, 'statLabel');
    const bodyRole = pickRole(mood, 'bodySmall', 'body');
    const vh = lineBox(mood, 'stat', LINES.one);
    const lh = lineBox(mood, labelRole, LINES.label);
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
        frame: frame(0, vh + g, w, lh),
        slot: { id: 'label', type: 'text', role: labelRole },
      },
      {
        id: 'body',
        role: 'body',
        frame: frame(0, vh + g + lh + g, w, h - vh - lh - 2 * g),
        slot: { id: 'body', type: 'richtext', role: bodyRole },
      },
    ]);
  },
};

/** The hero value role: of display / stat, the one the brand sets largest (signal: type.roles sizes). */
export function heroValueRole(mood) {
  const d = role(mood, 'display');
  const s = role(mood, 'stat');
  if (d && s) return d.size > s.size ? 'display' : 'stat';
  return d ? 'display' : 'stat';
}

/**
 * Single-KPI hero: the value in the hero role (display / stat, the larger) in the left 5 of 12 columns, the heading
 * (h2) and body (body) beside it in the right 7, both vertically centred.
 */
const kpiHero = {
  id: 'kpi-hero',
  build({ mood, w, h }) {
    const vRole = heroValueRole(mood);
    const hRole = pickRole(mood, 'h2', 'h3');
    const bRole = pickRole(mood, 'body');
    const [left, rightCol] = spans(frame(0, 0, w, h), [5, 7], gutter(mood));
    const vh = Math.min(h, lineBox(mood, vRole, LINES.one));
    const hh = lineBox(mood, hRole, LINES.heading);
    const g = space(mood, 'sm');
    const bh = Math.min(h - hh - g, lineBox(mood, bRole, 4));
    const ty = Math.max(0, (h - hh - g - bh) / 2);
    return make(this.id, w, h, [
      {
        id: 'value',
        role: 'number',
        frame: frame(left.x, (h - vh) / 2, left.w, vh),
        align: { v: 'middle' },
        slot: { id: 'value', type: 'number', role: vRole },
      },
      {
        id: 'label',
        role: 'title',
        frame: frame(rightCol.x, ty, rightCol.w, hh),
        slot: { id: 'label', type: 'text', role: hRole },
      },
      {
        id: 'body',
        role: 'body',
        frame: frame(rightCol.x, ty + hh + g, rightCol.w, bh),
        slot: { id: 'body', type: 'richtext', role: bRole },
      },
    ]);
  },
};

/**
 * One point of a points flow: a marker (the brand icon, else the sequence number, else the bullet glyph - the engine
 * decides from the point) in a square one bullet line tall, the text after it at the bullet indent.
 */
const pointMarker = {
  id: 'point-marker-text',
  build({ mood, w, h, fields = {} }) {
    const r = pickRole(mood, 'bullet', 'body');
    const line = lineBox(mood, r, LINES.one);
    const m = fields.icon ? Math.max(line, Math.min(iconSize(mood, r).room, 2 * line)) : line;
    const indent = mood?.type?.bullets?.indent;
    const tx = Math.max(m + space(mood, 'sm'), typeof indent === 'number' ? indent : 0);
    return make(this.id, w, h, [
      {
        id: 'marker',
        role: 'number',
        frame: frame(0, 0, m, Math.min(m, h)),
        slot: { id: 'marker', type: 'text', role: r },
      },
      {
        id: 'text',
        role: 'body',
        frame: frame(tx, 0, w - tx, h),
        slot: { id: 'text', type: 'richtext', role: r },
      },
    ]);
  },
};

/**
 * A compare column (content/2 `compare`, S2.a slice 3): from the top an optional image banner (decor.imagery.crop
 * ratio, else 35 % of the column; at most 35 %), a label (eyebrow), the header (h2) and the rows (body: a list whose
 * check rows carry the brand check / cross marks). No background: the columns stand side by side as in two-column.
 */
const compareColumn = {
  id: 'compare-column',
  build({ mood, w, h, fields = {} }) {
    const g = space(mood, 'sm');
    const headRole = pickRole(mood, 'h2', 'h3');
    const labelRole = pickRole(mood, 'eyebrow', 'caption');
    const parts = [];
    let y = 0;
    if (fields.image) {
      const ratio = thumbRatio(mood);
      const ih = Math.min(ratio ? w / ratio : 0.35 * h, 0.35 * h);
      parts.push({
        id: 'image',
        role: 'image',
        frame: frame(0, 0, w, ih),
        slot: { id: 'image', type: 'image' },
      });
      y += ih + space(mood, 'md');
    }
    if (fields.label) {
      const lh = lineBox(mood, labelRole, LINES.one);
      parts.push({
        id: 'label',
        role: 'eyebrow',
        frame: frame(0, y, w, lh),
        slot: { id: 'label', type: 'text', role: labelRole },
      });
      y += lh + g;
    }
    const hh = lineBox(mood, headRole, LINES.heading);
    parts.push({
      id: 'title',
      role: 'title',
      frame: frame(0, y, w, hh),
      slot: { id: 'title', type: 'text', role: headRole },
    });
    y += hh + g;
    parts.push({
      id: 'text',
      role: 'body',
      frame: frame(0, y, w, h - y),
      slot: { id: 'text', type: 'richtext', role: pickRole(mood, 'bullet', 'body') },
    });
    return make(this.id, w, h, parts);
  },
};

/**
 * A pricing tier (content/2 `compare` with `tiers`): the card component, its padding, then a label (eyebrow), the
 * tier name (card titleRole, else h3), the price (stat), the unit (`per`, bodySmall / caption) and the features
 * (a list in the card bodyRole).
 */
const tierCard = {
  id: 'tier-card',
  build({ mood, w, h, fields = {} }) {
    const p = padding(mood, 'card');
    const t = tokens(mood, 'card');
    const iw = w - 2 * p;
    const g = space(mood, 'sm');
    const titleRole = pickRole(mood, t.titleRole, 'h3');
    const labelRole = pickRole(mood, 'eyebrow', 'caption');
    const perRole = pickRole(mood, 'bodySmall', 'caption', 'body');
    const parts = [{ id: 'bg', role: 'shape', frame: frame(0, 0, w, h), shape: shapeFor(mood, 'card') }];
    let y = p;
    if (fields.image) {
      const ratio = thumbRatio(mood);
      if (ratio) {
        const ih = Math.min(iw / ratio, 0.3 * h);
        parts.push({
          id: 'image',
          role: 'image',
          frame: frame(p, y, iw, ih),
          slot: { id: 'image', type: 'image' },
        });
        y += ih + g;
      }
    }
    if (fields.label) {
      const lh = lineBox(mood, labelRole, LINES.one);
      parts.push({
        id: 'label',
        role: 'eyebrow',
        frame: frame(p, y, iw, lh),
        slot: { id: 'label', type: 'text', role: labelRole },
      });
      y += lh + g;
    }
    const th = lineBox(mood, titleRole, LINES.heading);
    parts.push({
      id: 'title',
      role: 'title',
      frame: frame(p, y, iw, th),
      slot: { id: 'title', type: 'text', role: titleRole },
    });
    y += th + g;
    if (fields.price) {
      const ph = lineBox(mood, 'stat', LINES.one);
      parts.push({
        id: 'price',
        role: 'number',
        frame: frame(p, y, iw, ph),
        slot: { id: 'price', type: 'number', role: 'stat' },
      });
      y += ph;
    }
    if (fields.per) {
      const uh = lineBox(mood, perRole, LINES.one);
      parts.push({
        id: 'per',
        role: 'body',
        frame: frame(p, y, iw, uh),
        slot: { id: 'per', type: 'text', role: perRole },
      });
      y += uh;
    }
    y += space(mood, 'md');
    parts.push({
      id: 'text',
      role: 'body',
      frame: frame(p, y, iw, h - y - p),
      slot: { id: 'text', type: 'richtext', role: pickRole(mood, t.bodyRole, 'body') },
    });
    return make(this.id, w, h, parts);
  },
};

/**
 * A quote card (content/2 `quotes` grid, S2.a slice 3): the card component, a label (eyebrow), the quote (the quote
 * hint's role, else quote; the fitter steps it down) and the person at the foot: a photo square two text lines tall
 * (the photo, else the brand's avatar rule) beside the name (quote attribution role) and role (personRole, else
 * bodySmall).
 */
const quoteCard = {
  id: 'quote-card',
  build({ mood, w, h, fields = {} }) {
    const p = padding(mood, 'card');
    const iw = w - 2 * p;
    const g = space(mood, 'sm');
    const qt = tokens(mood, 'quote');
    const quoteRole = pickRole(mood, mood?.composition?.layoutHints?.quote?.titleRole, 'quote');
    const nameRole = pickRole(mood, qt.attributionFont, 'quoteAttribution', 'h3');
    const roleRole = pickRole(mood, 'personRole', 'bodySmall', 'body');
    const labelRole = pickRole(mood, 'eyebrow', 'caption');
    const nh = lineBox(mood, nameRole, LINES.one);
    const rh = fields.role ? lineBox(mood, roleRole, LINES.one) : 0;
    const person = nh + rh;
    const a = fields.photo ? person : 0;
    const parts = [{ id: 'bg', role: 'shape', frame: frame(0, 0, w, h), shape: shapeFor(mood, 'card') }];
    let y = p;
    if (fields.label) {
      const lh = lineBox(mood, labelRole, LINES.one);
      parts.push({
        id: 'label',
        role: 'eyebrow',
        frame: frame(p, y, iw, lh),
        slot: { id: 'label', type: 'text', role: labelRole },
      });
      y += lh + g;
    }
    const py = h - p - person;
    parts.push({
      id: 'text',
      role: 'quote',
      frame: frame(p, y, iw, py - space(mood, 'md') - y),
      slot: { id: 'text', type: 'richtext', role: quoteRole },
    });
    if (a)
      parts.push({
        id: 'photo',
        role: 'image',
        frame: frame(p, py, a, a),
        slot: { id: 'photo', type: 'image' },
      });
    const tx = a ? p + a + g : p;
    parts.push({
      id: 'attribution',
      role: 'attribution',
      frame: frame(tx, py, p + iw - tx, nh),
      slot: { id: 'attribution', type: 'text', role: nameRole },
    });
    if (rh)
      parts.push({
        id: 'role',
        role: 'body',
        frame: frame(tx, py + nh, p + iw - tx, rh),
        slot: { id: 'role', type: 'text', role: roleRole },
      });
    return make(this.id, w, h, parts);
  },
};

/**
 * A person with a bio (content/2 `people`, S2.a slice 3): the photo square (components.avatar.tokens.size, capped to
 * the room; the engine draws the brand's avatar rule when there is no photo), the name (personName, else h3), the
 * role (personRole, else bodySmall) and the bio (bodySmall, else body). A cell at least 1.6 × as wide as tall (a 3 × 2
 * or 3 × 3 grid) puts the photo left of the text, otherwise on top.
 */
const personCard = {
  id: 'person-card',
  build({ mood, w, h, fields = {} }) {
    const g = space(mood, 'sm');
    const nameRole = pickRole(mood, 'personName', 'h3');
    const roleRole = pickRole(mood, 'personRole', 'bodySmall', 'body');
    const bioRole = pickRole(mood, 'bodySmall', 'body');
    const nh = lineBox(mood, nameRole, LINES.one);
    const rh = fields.role !== false ? lineBox(mood, roleRole, LINES.one) : 0;
    const bh = fields.bio ? lineBox(mood, bioRole, 3) : 0;
    const want = num(tokens(mood, 'avatar').size);
    const wide = w >= 1.6 * h;
    const parts = [];
    if (wide) {
      const a = Math.min(h, want ?? h, w / 3);
      const tx = a + space(mood, 'md');
      const tw = w - tx;
      parts.push({
        id: 'photo',
        role: 'image',
        frame: frame(0, 0, a, a),
        slot: { id: 'photo', type: 'image' },
      });
      parts.push({
        id: 'name',
        role: 'title',
        frame: frame(tx, 0, tw, nh),
        slot: { id: 'name', type: 'text', role: nameRole },
      });
      if (rh)
        parts.push({
          id: 'role',
          role: 'body',
          frame: frame(tx, nh, tw, rh),
          slot: { id: 'role', type: 'text', role: roleRole },
        });
      if (bh)
        parts.push({
          id: 'bio',
          role: 'body',
          frame: frame(tx, nh + rh + g, tw, h - nh - rh - g),
          slot: { id: 'bio', type: 'richtext', role: bioRole },
        });
      return make(this.id, w, h, parts);
    }
    const room = Math.max(0, h - nh - rh - (bh ? bh + g : 0) - g);
    const a = Math.min(w, room, want ?? Math.min(w, room));
    parts.push({
      id: 'photo',
      role: 'image',
      frame: frame(0, 0, a, a),
      slot: { id: 'photo', type: 'image' },
    });
    let y = a + g;
    parts.push({
      id: 'name',
      role: 'title',
      frame: frame(0, y, w, nh),
      slot: { id: 'name', type: 'text', role: nameRole },
    });
    y += nh;
    if (rh) {
      parts.push({
        id: 'role',
        role: 'body',
        frame: frame(0, y, w, rh),
        slot: { id: 'role', type: 'text', role: roleRole },
      });
      y += rh;
    }
    if (bh)
      parts.push({
        id: 'bio',
        role: 'body',
        frame: frame(0, y + g, w, h - y - g),
        slot: { id: 'bio', type: 'richtext', role: bioRole },
      });
    return make(this.id, w, h, parts);
  },
};

/**
 * A logo card (content/2 `logos` with heading + body, S2.a slice 3; catalogue: logo cards): the card component, the
 * logo at the top (components.logoWall.tokens.height, else two h3 lines; contain), the heading (card titleRole, else
 * h3) and the body (card bodyRole, else body).
 */
const logoCard = {
  id: 'logo-card',
  build({ mood, w, h, fields = {} }) {
    const p = padding(mood, 'card');
    const t = tokens(mood, 'card');
    const iw = w - 2 * p;
    const g = space(mood, 'sm');
    const titleRole = pickRole(mood, t.titleRole, 'h3');
    const bodyRole = pickRole(mood, t.bodyRole, 'body');
    const parts = [{ id: 'bg', role: 'shape', frame: frame(0, 0, w, h), shape: shapeFor(mood, 'card') }];
    let y = p;
    if (fields.logo) {
      const lh = num(tokens(mood, 'logoWall').height) ?? lineBox(mood, 'h3', LINES.heading);
      parts.push({
        id: 'logo',
        role: 'logo',
        frame: frame(p, y, iw, lh),
        slot: { id: 'logo', type: 'image' },
      });
      y += lh + space(mood, 'md');
    }
    const th = lineBox(mood, titleRole, LINES.heading);
    parts.push({
      id: 'heading',
      role: 'title',
      frame: frame(p, y, iw, th),
      slot: { id: 'heading', type: 'text', role: titleRole },
    });
    y += th + g;
    parts.push({
      id: 'body',
      role: 'body',
      frame: frame(p, y, iw, h - y - p),
      slot: { id: 'body', type: 'richtext', role: bodyRole },
    });
    return make(this.id, w, h, parts);
  },
};

export const items = Object.freeze({
  [logoCard.id]: logoCard,
  [personCard.id]: personCard,
  [quoteCard.id]: quoteCard,
  [compareColumn.id]: compareColumn,
  [tierCard.id]: tierCard,
  [card.id]: card,
  [kpi.id]: kpi,
  [step.id]: step,
  [timeline.id]: timeline,
  [person.id]: person,
  [logoChip.id]: logoChip,
  [itemCard.id]: itemCard,
  [kpiBody.id]: kpiBody,
  [kpiHero.id]: kpiHero,
  [pointMarker.id]: pointMarker,
  [agendaRow.id]: agendaRow,
});

/** Build an item sub-layout by id: `itemLayout(id, { mood, w, h })`. */
export function itemLayout(id, args) {
  const def = items[id];
  if (!def) throw new Error(`unknown item layout: ${id}`);
  return def.build(args);
}
