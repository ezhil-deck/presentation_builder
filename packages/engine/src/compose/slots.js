/** Bound slots -> deck elements (text fitted, charts / tables laid out, flow items placed). */
import { parseInline } from '../content/inline.js';
import { chartElement } from '../fit/chart.js';
import { tableElement } from '../fit/table.js';
import { ruleWidth } from '../fit/metrics.js';
import { fitTextFont } from '../fit/text.js';
import { r2 } from '../util/stable.js';
import { MIN_LITERAL_CONTRAST, contrastRatio } from './resolve.js';

/** The type role a text box uses when its slot names none (a layout omission: info). */
export const ROLE_BY_BOX = Object.freeze({
  title: 'h1',
  subtitle: 'h2',
  eyebrow: 'eyebrow',
  body: 'body',
  list: 'bullet',
  quote: 'quote',
  attribution: 'quoteAttribution',
  number: 'stat',
});

const withElementId = (warnings, id) => warnings.map((w) => ({ ...w, elementId: id }));

/** Content blocks -> deck paragraphs (runs from inline markdown; lists flattened with level / bullet). */
export function paragraphsFor(blocks, ctx) {
  const { mood, R, warn } = ctx;
  const b = mood.type?.bullets ?? {};
  const paraGap = R.spacing('md');
  const listGap = typeof b.gap === 'number' ? b.gap : R.spacing('sm');
  const out = [];
  const para = (text, extra = {}) => out.push({ runs: parseInline(text), spaceAfter: paraGap, ...extra });
  for (const block of blocks) {
    switch (block.type) {
      case 'list': {
        const walk = (items, depth) => {
          if (typeof b.maxDepth === 'number' && depth > b.maxDepth) {
            warn(
              'list-depth',
              `list nesting depth ${depth + 1} exceeds type.bullets.maxDepth ${b.maxDepth}`,
              'info',
            );
          }
          items.forEach((it, k) => {
            const bullet = { ordered: !!block.ordered };
            // level 1 = type.bullets.glyph; deeper levels = type.bullets.nested[depth − 1] when given
            const glyph = block.ordered
              ? `${k + 1}.`
              : depth > 0
                ? (b.nested?.[depth - 1] ?? b.glyph)
                : b.glyph;
            if (glyph) bullet.glyph = glyph;
            else warn('bullets', 'type.bullets.glyph not given: list items carry no glyph', 'info');
            const color = R.color(b.color);
            if (color) bullet.color = color;
            if (typeof b.indent === 'number') bullet.indent = b.indent;
            out.push({ runs: parseInline(it.text), level: depth + 1, bullet, spaceAfter: listGap });
            if (it.children?.length) walk(it.children, depth + 1);
          });
        };
        walk(block.items ?? [], 0);
        break;
      }
      case 'cta':
        para(block.text);
        if (block.url) para(block.url);
        if (block.contact) para(block.contact);
        break;
      default:
        if (typeof block.text === 'string') para(block.text);
        else warn('binding', `${block.type} block cannot be shown as text`);
    }
  }
  return out;
}

export function textElement({
  id,
  frame,
  role,
  box,
  slot,
  paragraphs,
  align,
  valign,
  size,
  color,
  weight,
  ctx,
}) {
  const font = ctx.R.font(role);
  if (!font) return null;
  const { text, warnings } = fitTextFont(paragraphs, frame, font, {
    align,
    valign,
    size,
    bullets:
      typeof ctx.mood.type?.bullets?.indent === 'number'
        ? { indent: ctx.mood.type.bullets.indent }
        : undefined,
  });
  if (color) text.font.color = color;
  if (typeof weight === 'number') text.font.weight = weight;
  const el = { id, type: 'text', frame: rf(frame), z: 30, text };
  if (box?.role) el.role = box.role;
  if (slot?.id) el.slot = slot.id;
  if (box?.id) el.layoutBox = box.id;
  if (warnings.length) el.warnings = withElementId(warnings, id);
  return el;
}

const rf = (f) => ({ x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) });

function roleFor(binding, ctx) {
  if (binding.slot.role) return binding.slot.role;
  const r = ROLE_BY_BOX[binding.box?.role] ?? 'body';
  ctx.warn('layout', `slot "${binding.slot.id}" names no type role: used "${r}"`, 'info');
  return r;
}

function defaultAlign(box, mood) {
  if (box?.align?.h) return box.align.h;
  if (box?.role === 'title') return mood.type?.align?.title ?? 'left';
  return mood.type?.align?.body ?? 'left';
}

function imageEl(id, frame, block, binding, ctx) {
  const image = { asset: ctx.assets.add(block.src), fit: 'cover' };
  if (block.alt) image.alt = block.alt;
  const mask = ctx.mood.decor?.imagery?.mask;
  if (mask) image.mask = mask;
  const el = { id, type: 'image', frame: rf(frame), z: 30, image };
  if (binding?.box?.role) el.role = binding.box.role;
  if (binding?.slot?.id) el.slot = binding.slot.id;
  if (binding?.box?.id) el.layoutBox = binding.box.id;
  return el;
}

function rectEl(id, frame, tokens, ctx, z = 20) {
  const { R } = ctx;
  const style = {};
  const fill = R.color(tokens.fill);
  if (fill) style.fill = fill;
  const bw = tokens['border.width'];
  if (tokens['border.style'] !== 'none' && typeof bw === 'number' && bw > 0) {
    const c = R.color(tokens['border.color'] ?? 'border');
    if (c) style.stroke = { color: c, width: bw };
  }
  const radius = R.radius(tokens.radius);
  if (radius !== undefined) style.radius = radius;
  const shadow = R.shadow(tokens.shadow);
  if (shadow) style.shadow = shadow;
  if (!style.fill && !style.stroke) return null;
  return { id, type: 'shape', frame: rf(frame), z, shape: { kind: 'rect' }, style };
}

function inset(frame, p) {
  return { x: frame.x + p, y: frame.y + p, w: Math.max(0, frame.w - 2 * p), h: Math.max(0, frame.h - 2 * p) };
}

const lineBox = (font) => font.size * font.lineHeight;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * PR-2: the avatar side for a person without a photo: components.avatar.tokens.size, else two lines of the name role
 * (type.roles[nameRole] size × lineHeight × 2); undefined when neither is given.
 */
/** Initials: the first letters of the first two words of a name ('First Person' → 'FP'). */
export function initialsOf(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0].toLocaleUpperCase())
    .join('');
}

export function avatarSize(mood, nameRole) {
  const size = num(mood.components?.avatar?.tokens?.size);
  if (size !== undefined) return size;
  const r = mood.type?.roles?.[nameRole];
  return num(r?.size) !== undefined && num(r?.lineHeight) !== undefined
    ? r2(2 * r.size * r.lineHeight)
    : undefined;
}

/** The colour initials take on an avatar fill: the surface cardText when it reads (≥ 3:1), else the surface role that contrasts most. */
function initialsColor(fill, ctx) {
  const on = fill.slice(0, 7);
  const card = ctx.R.color('cardText');
  if (card && contrastRatio(card.slice(0, 7), on) >= MIN_LITERAL_CONTRAST) return card;
  return ['cardText', 'text', 'heading', 'bg']
    .map((r) => ctx.R.color(r))
    .filter(Boolean)
    .sort((a, b) => contrastRatio(b.slice(0, 7), on) - contrastRatio(a.slice(0, 7), on))[0];
}

/**
 * PR-2: a person without a photo, drawn as the brand's components.avatar: mask circle → ellipse (else rect with the
 * radius token), fill = the avatar fill token else the surface accent; with placeholder 'initials' the initials
 * (first letters of the first two words) are set in the name role, centred, on the cardText / contrast colour.
 */
function avatarElements(frame, name, nameRole, idBase, ctx) {
  const t = ctx.mood.components?.avatar?.tokens ?? {};
  const circle = t.mask === 'circle';
  const fill = ctx.R.color(t.fill ?? 'accent');
  const out = [
    {
      id: `${idBase}-avatar`,
      type: 'shape',
      name: 'avatar placeholder',
      frame: rf(frame),
      z: 20,
      shape: { kind: circle ? 'ellipse' : 'rect' },
      style: {
        ...(fill ? { fill } : {}),
        ...(!circle && t.radius !== undefined ? { radius: ctx.R.radius(t.radius) } : {}),
      },
    },
  ];
  const initials = t.placeholder === 'initials' ? initialsOf(name) : '';
  if (initials && fill) {
    const el = textElement({
      id: `${idBase}-initials`,
      frame,
      role: nameRole,
      paragraphs: [{ runs: [{ text: initials }] }],
      align: 'center',
      valign: 'middle',
      color: initialsColor(fill, ctx),
      ctx,
    });
    if (el) out.push(el);
  }
  return out;
}

/** Per item type: decoration elements + the stacked text parts (fitted with shared sizes across items). */
const ITEM_SPECS = {
  kpis(it, cell, ctx, k, n) {
    const tokens = ctx.mood.components?.kpi?.tokens ?? {};
    const decor = [];
    let inner = cell;
    if (ctx.mood.components?.kpi?.variant === 'card') {
      const r = rectEl(`${ctx.base}-${k}-card`, cell, tokens, ctx);
      if (r) decor.push(r);
      const p = tokens.padding;
      inner = inset(cell, typeof p === 'number' ? p : ctx.R.spacing(p ?? 'md'));
    }
    const parts = [{ key: 'value', role: 'stat', text: it.value }];
    if (it.label) parts.push({ key: 'label', role: tokens.labelStyle ?? 'statLabel', text: it.label });
    if (it.delta) {
      const c = it.trend ? ctx.R.color(tokens[`deltaColors.${it.trend}`]) : undefined;
      parts.push({ key: 'delta', role: 'statLabel', text: it.delta, color: c });
    }
    return { decor, inner, parts, n };
  },
  cards(it, cell, ctx, k) {
    const comp = ctx.mood.components?.card ?? {};
    const tokens = comp.tokens ?? {};
    const decor = [];
    const r = comp.variant === 'flat' ? null : rectEl(`${ctx.base}-${k}-card`, cell, tokens, ctx);
    if (r) decor.push(r);
    const p = tokens.padding;
    const inner = r ? inset(cell, typeof p === 'number' ? p : ctx.R.spacing(p ?? 'md')) : cell;
    const parts = [];
    if (it.number) parts.push({ key: 'number', role: 'stat', text: it.number });
    if (it.title) parts.push({ key: 'title', role: tokens.titleRole ?? 'h3', text: it.title });
    if (it.text) parts.push({ key: 'text', role: tokens.bodyRole ?? 'body', text: it.text });
    return { decor, inner, parts };
  },
  steps(it, cell, ctx, k, n) {
    const tokens = ctx.mood.components?.steps?.tokens ?? {};
    const decor = [];
    let inner = cell;
    const titleFont = ctx.R.font('h3');
    if (tokens.marker && titleFont) {
      const d = lineBox(titleFont);
      const fill = ctx.R.color(tokens.activeColor ?? 'accent');
      decor.push({
        id: `${ctx.base}-${k}-marker`,
        type: 'shape',
        frame: rf({ x: cell.x, y: cell.y, w: d, h: d }),
        z: 20,
        shape: { kind: String(tokens.marker).includes('square') ? 'rect' : 'ellipse' },
        ...(fill ? { style: { fill } } : {}),
      });
      if (String(tokens.marker).includes('number')) {
        const t = textElement({
          id: `${ctx.base}-${k}-number`,
          frame: { x: cell.x, y: cell.y, w: d, h: d },
          role: 'h3',
          paragraphs: [{ runs: [{ text: String(k + 1) }] }],
          align: 'center',
          valign: 'middle',
          color: ctx.R.color('bg'),
          ctx,
        });
        if (t) decor.push(t);
      }
      if (tokens.line && k < n - 1) {
        const color = ctx.R.color(tokens.inactiveColor ?? 'border');
        const x1 = cell.x + d + ctx.R.spacing('sm');
        const x2 = cell.x + cell.w + ctx.gap - ctx.R.spacing('sm');
        decor.push({
          id: `${ctx.base}-${k}-connector`,
          type: 'line',
          frame: rf({ x: x1, y: cell.y + d / 2, w: x2 - x1, h: 0 }),
          z: 20,
          lineProps: { x2: r2(x2), y2: r2(cell.y + d / 2) },
          style: { stroke: { color, width: tokens.stroke ?? ruleWidth(ctx.mood) } },
        });
      }
      inner = {
        x: cell.x,
        y: cell.y + d + ctx.R.spacing('md'),
        w: cell.w,
        h: Math.max(0, cell.h - d - ctx.R.spacing('md')),
      };
    }
    const parts = [];
    if (it.title) parts.push({ key: 'title', role: 'h3', text: it.title });
    if (it.text) parts.push({ key: 'text', role: 'body', text: it.text });
    return { decor, inner, parts };
  },
  timeline(it, cell, ctx, k) {
    const tokens = ctx.mood.components?.timeline?.tokens ?? {};
    const decor = [];
    let inner = cell;
    const f = ctx.R.font('eyebrow');
    if (tokens.marker && f) {
      const d = f.size;
      const fill = ctx.R.color(tokens.markerColor ?? 'accent');
      decor.push({
        id: `${ctx.base}-${k}-marker`,
        type: 'shape',
        frame: rf({ x: cell.x, y: cell.y, w: d, h: d }),
        z: 21,
        shape: { kind: tokens.marker === 'square' ? 'rect' : 'ellipse' },
        ...(fill ? { style: { fill } } : {}),
      });
      inner = {
        x: cell.x,
        y: cell.y + d + ctx.R.spacing('md'),
        w: cell.w,
        h: Math.max(0, cell.h - d - ctx.R.spacing('md')),
      };
    }
    const parts = [];
    if (it.when) parts.push({ key: 'when', role: 'eyebrow', text: it.when });
    if (it.title) parts.push({ key: 'title', role: 'h3', text: it.title });
    if (it.text) parts.push({ key: 'text', role: 'body', text: it.text });
    return { decor, inner, parts };
  },
  people(it, cell, ctx, k) {
    const tokens = ctx.mood.components?.avatar?.tokens ?? {};
    const decor = [];
    const size = Math.min(typeof tokens.size === 'number' ? tokens.size : cell.w, cell.w, cell.h * 0.5);
    const frame = { x: cell.x, y: cell.y, w: size, h: size };
    const circle = tokens.mask === 'circle';
    if (it.photo) {
      const el = imageEl(`${ctx.base}-${k}-photo`, frame, { src: it.photo, alt: it.name }, null, ctx);
      if (circle) el.image.mask = 'circle';
      else if (tokens.radius !== undefined) el.style = { radius: ctx.R.radius(tokens.radius) };
      decor.push(el);
    } else {
      // avatar rule (PR-2): the brand's avatar component; no size token → two lines of the name role
      const a = Math.min(avatarSize(ctx.mood, 'h3') ?? size, cell.w, cell.h * 0.5);
      const f = { x: cell.x, y: cell.y, w: a, h: a };
      decor.push(...avatarElements(f, it.name, 'h3', `${ctx.base}-${k}`, ctx));
      const inner = {
        x: cell.x,
        y: cell.y + a + ctx.R.spacing('md'),
        w: cell.w,
        h: Math.max(0, cell.h - a - ctx.R.spacing('md')),
      };
      const parts = [];
      if (it.name) parts.push({ key: 'name', role: 'h3', text: it.name });
      if (it.role) parts.push({ key: 'role', role: 'bodySmall', text: it.role });
      return { decor, inner, parts };
    }
    const inner = {
      x: cell.x,
      y: cell.y + size + ctx.R.spacing('md'),
      w: cell.w,
      h: Math.max(0, cell.h - size - ctx.R.spacing('md')),
    };
    const parts = [];
    if (it.name) parts.push({ key: 'name', role: 'h3', text: it.name });
    if (it.role) parts.push({ key: 'role', role: 'bodySmall', text: it.role });
    return { decor, inner, parts };
  },
  logos(it, cell, ctx, k) {
    const tokens = ctx.mood.components?.logoWall?.tokens ?? {};
    if (it.src) {
      const el = imageEl(`${ctx.base}-${k}-logo`, cell, { src: it.src, alt: it.name }, null, ctx);
      el.image.fit = 'contain';
      return { decor: [el], inner: cell, parts: [] };
    }
    ctx.warn('logos', 'logo items without src: the name is shown as text', 'info');
    return {
      decor: [],
      inner: cell,
      parts: [
        {
          key: 'name',
          role: tokens.labelStyle ?? 'eyebrow',
          text: it.name ?? '',
          align: 'center',
          valign: 'middle',
        },
      ],
    };
  },
};

function stackParts(plan, sizes, idBase, align, ctx) {
  const gap = ctx.R.spacing('sm');
  const out = [];
  const applied = {};
  let cursor = plan.inner.y;
  plan.parts.forEach((part, i) => {
    const last = i === plan.parts.length - 1;
    const frame = {
      x: plan.inner.x,
      y: cursor,
      w: plan.inner.w,
      h: Math.max(0, plan.inner.y + plan.inner.h - cursor),
    };
    const el = textElement({
      id: `${idBase}-${part.key}`,
      frame,
      role: part.role,
      paragraphs: [{ runs: parseInline(part.text) }],
      align: part.align ?? align,
      valign: part.valign ?? 'top',
      size: sizes?.[part.key],
      color: part.color,
      ctx,
    });
    if (!el) return;
    applied[part.key] = el.text.fit.appliedSize;
    if (!last) {
      const h = el.text.fit.height;
      el.frame.h = r2(h);
      cursor += h + gap;
    }
    out.push(el);
  });
  return { elements: out, applied };
}

function flowElements(binding, ctx) {
  const block = binding.blocks[0];
  const items = block.items ?? [];
  const box = binding.box;
  const frame = box.frame;
  const flow = box.flow ?? {};
  const cap = binding.slot.capacity?.maxItems;
  if (typeof cap === 'number' && items.length > cap) {
    ctx.warn(
      'capacity',
      `${items.length} ${block.type} items exceed slot "${binding.slot.id}" maxItems ${cap}`,
    );
  }
  if (!items.length) return [];
  if (flow.itemLayout && typeof ctx.catalogue?.itemLayout === 'function') {
    return itemFlowElements(binding, ctx);
  }
  const n =
    flow.direction === 'column' ? 1 : Math.max(1, Math.min(flow.columns ?? items.length, items.length));
  const gap = ctx.R.spacing(flow.gap ?? 'md');
  const rows = Math.ceil(items.length / n);
  const cw = (frame.w - gap * (n - 1)) / n;
  const ch = (frame.h - gap * (rows - 1)) / rows;
  const spec = ITEM_SPECS[block.type];
  const base = `${ctx.slideId}-${binding.slot.id}`;
  const sub = { ...ctx, base, gap };
  const align = box.align?.h ?? 'left';
  const plans = items.map((it, k) =>
    spec(
      it,
      { x: frame.x + (k % n) * (cw + gap), y: frame.y + Math.floor(k / n) * (ch + gap), w: cw, h: ch },
      sub,
      k,
      items.length,
    ),
  );
  // shared sizing: every item of the flow takes the smallest applied size per part
  const first = plans.map((p, k) => stackParts(p, null, `${base}-${k}`, align, sub));
  const shared = {};
  for (const f of first) {
    for (const [key, s] of Object.entries(f.applied)) shared[key] = Math.min(shared[key] ?? Infinity, s);
  }
  const elements = [];
  if (block.type === 'timeline') {
    const tokens = ctx.mood.components?.timeline?.tokens ?? {};
    const f = ctx.R.font('eyebrow');
    if (tokens.marker && f && tokens.line !== false) {
      const color = ctx.R.color(tokens.lineColor ?? 'border');
      const y = frame.y + f.size / 2;
      elements.push({
        id: `${base}-line`,
        type: 'line',
        frame: rf({ x: frame.x, y, w: frame.w, h: 0 }),
        z: 20,
        lineProps: { x2: r2(frame.x + frame.w), y2: r2(y) },
        style: { stroke: { color, width: ruleWidth(ctx.mood) } },
      });
    }
  }
  plans.forEach((p, k) => {
    elements.push(...p.decor);
    elements.push(...stackParts(p, shared, `${base}-${k}`, align, sub).elements);
  });
  for (const el of elements) {
    el.role ??= box.role ?? block.type;
    el.slot ??= binding.slot.id;
    el.layoutBox ??= box.id;
  }
  return elements;
}

/** The item field an item sub-layout slot shows (slot id = field name, plus the few named here). */
function itemValue(slotId, it, k) {
  switch (slotId) {
    case 'number':
      return it.number !== undefined ? String(it.number) : String(k + 1);
    case 'photo':
      return it.photo ?? it.image;
    case 'logo':
      return it.src ?? it.logo;
    case 'text':
      return it.text ?? it.description;
    default:
      return it[slotId] === undefined || it[slotId] === null ? undefined : String(it[slotId]);
  }
}

/** Which Mood component paints an item layout's background box (its tokens: fill, border, radius, shadow). */
const ITEM_COMPONENT = { 'card-title-text': 'card' };

/** The component background of an item: the card rect (variant flat → none), a top-only border as its own bar. */
function componentBackground(name, frame, ctx, id) {
  const comp = ctx.mood.components?.[name];
  if (!comp) return null;
  const tokens = comp.tokens ?? {};
  const out = [];
  const topOnly = tokens['border.sides'] === 'top';
  const rect =
    comp.variant === 'flat'
      ? null
      : rectEl(id, frame, topOnly ? { ...tokens, 'border.style': 'none' } : tokens, ctx);
  if (rect) out.push(rect);
  const bw = tokens['border.width'];
  if (topOnly && tokens['border.style'] !== 'none' && typeof bw === 'number' && bw > 0) {
    const fill = ctx.R.color(tokens['border.color'] ?? 'border');
    if (fill) {
      out.push({
        id: `${id}-border-top`,
        type: 'shape',
        frame: rf({ x: frame.x, y: frame.y, w: frame.w, h: bw }),
        z: 21,
        shape: { kind: 'rect' },
        style: { fill },
      });
    }
  }
  return out;
}

const offset = (f, cell) => ({ x: cell.x + f.x, y: cell.y + f.y, w: f.w, h: f.h });
const union = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * Flow items stamped from the catalogue's item sub-layout (P2-spec §7 F6): one `catalogue.itemLayout(id, {mood, w, h})`
 * per cell (cells from `catalogue.flowCells` for one row / column, else an even grid), each item field bound to the
 * sub-layout slot of the same name; every text slot of the flow takes the smallest applied size among the items.
 */
function itemFlowElements(binding, ctx) {
  const block = binding.blocks[0];
  const items = block.items ?? [];
  const box = binding.box;
  const frame = box.frame;
  const flow = box.flow ?? {};
  const column = flow.direction === 'column';
  const n = column ? 1 : Math.max(1, Math.min(flow.columns ?? items.length, items.length));
  const gap = ctx.R.spacing(flow.gap ?? 'md');
  const rows = Math.ceil(items.length / n);
  let cells;
  if (column) cells = ctx.catalogue.flowCells(frame, items.length, gap, 'column');
  else if (rows === 1) cells = ctx.catalogue.flowCells(frame, items.length, gap, 'row');
  else {
    const cw = (frame.w - gap * (n - 1)) / n;
    const ch = (frame.h - gap * (rows - 1)) / rows;
    cells = items.map((_, k) => ({
      x: frame.x + (k % n) * (cw + gap),
      y: frame.y + Math.floor(k / n) * (ch + gap),
      w: cw,
      h: ch,
    }));
  }
  const base = `${ctx.slideId}-${binding.slot.id}`;
  const component = ITEM_COMPONENT[flow.itemLayout];
  const unbound = new Set();
  const plans = items.map((it, k) => {
    const cell = cells[k];
    let sub = ctx.catalogue.itemLayout(flow.itemLayout, { mood: ctx.mood, w: cell.w, h: cell.h });
    // avatar rule (PR-2): a person without a photo takes the avatar size (token, else two lines of the name role); the item
    // sub-layout is rebuilt with it so the name and role follow the avatar
    const photoSlot = sub.slots.find((x) => x.id === 'photo');
    let nameRole;
    if (block.type === 'people' && photoSlot && !itemValue('photo', it, k)) {
      nameRole = sub.slots.find((x) => x.id === 'name')?.role ?? 'h3';
      const a = avatarSize(ctx.mood, nameRole);
      if (a !== undefined && num(ctx.mood.components?.avatar?.tokens?.size) === undefined) {
        const avatar = ctx.mood.components?.avatar ?? {};
        const mood = {
          ...ctx.mood,
          components: {
            ...(ctx.mood.components ?? {}),
            avatar: { ...avatar, tokens: { ...(avatar.tokens ?? {}), size: a } },
          },
        };
        sub = ctx.catalogue.itemLayout(flow.itemLayout, { mood, w: cell.w, h: cell.h });
      }
    }
    const boxes = new Map(sub.boxes.map((b) => [b.id, b]));
    const shapes = [];
    for (const b of sub.boxes) {
      if (!b.shape || b.slot) continue;
      const f = offset(b.frame, cell);
      const id = `${base}-${k}-${b.id}`;
      const bg = component && b.id === 'bg' ? componentBackground(component, f, ctx, id) : null;
      if (bg) shapes.push(...bg);
      else shapes.push(boxShapeElement({ ...b, frame: f }, { ...ctx, slideId: `${base}-${k}` }));
    }
    const used = new Set();
    const parts = [];
    for (const slot of sub.slots) {
      const b = boxes.get(slot.box);
      const value = itemValue(slot.id, it, k);
      used.add(slot.id === 'photo' ? (it.photo ? 'photo' : 'image') : slot.id === 'logo' ? 'src' : slot.id);
      parts.push({ slot, box: b, frame: offset(b.frame, cell), value });
    }
    for (const key of Object.keys(it)) {
      if (!used.has(key) && it[key] !== undefined && key !== 'trend' && !unbound.has(key)) {
        unbound.add(key);
        ctx.warn(
          'binding',
          `${block.type} item field "${key}" has no slot in item layout "${flow.itemLayout}": not shown`,
          'info',
        );
      }
    }
    // text on a filled component card takes the surface's cardText colour (when the surface gives one)
    const filled = component && shapes.some((x) => x.style?.fill && /-bg$/.test(x.id));
    const onCard = filled && ctx.surface?.cardText ? ctx.R.color('cardText') : undefined;
    return { k, cell, shapes, parts, it, onCard, nameRole };
  });

  const text = (part, k, size) => {
    const marker = part.slot.id === 'number' && plansHaveMarker(plans[k]);
    if (part.chip) return chipText(part, `${base}-${k}-${part.slot.id}`, size, ctx);
    return textElement({
      id: `${base}-${k}-${part.slot.id}`,
      frame: part.frame,
      role: part.slot.role ?? ROLE_BY_BOX[part.box?.role] ?? 'body',
      box: null,
      slot: null,
      paragraphs: [{ runs: parseInline(part.value) }],
      align: part.box?.align?.h ?? box.align?.h ?? 'left',
      valign: part.box?.align?.v ?? 'top',
      size,
      color: marker ? ctx.R.color('bg') : plans[k].onCard ? plans[k].onCard : undefined,
      ctx,
    });
  };
  // logos without a src: the name takes the logo's room too, centred
  for (const p of plans) {
    const logo = p.parts.find((x) => x.slot.id === 'logo');
    const name = p.parts.find((x) => x.slot.id === 'name');
    if (logo && !logo.value && name) {
      name.frame = union(logo.frame, name.frame);
      name.box = { ...name.box, align: { h: 'center', v: 'middle' } };
      if (name.value !== undefined) name.chip = chipSpec(name, p.cell, ctx);
    }
  }
  // shared sizing: the smallest applied size per text slot across the items
  const shared = {};
  for (const p of plans) {
    for (const part of p.parts) {
      if (part.slot.type === 'image' || part.value === undefined) continue;
      const el = text(part, p.k);
      if (el) shared[part.slot.id] = Math.min(shared[part.slot.id] ?? Infinity, el.text.fit.appliedSize);
    }
  }
  const elements = [];
  let noSrc = 0;
  for (const p of plans) {
    elements.push(...p.shapes);
    for (const part of p.parts) {
      const id = `${base}-${p.k}-${part.slot.id}`;
      if (part.slot.type === 'image') {
        if (part.value) {
          const el = imageEl(id, part.frame, { src: part.value, alt: p.it.name }, null, ctx);
          if (part.slot.id === 'logo') {
            el.image.fit = 'contain';
            delete el.image.mask;
          } else {
            const t = ctx.mood.components?.avatar?.tokens ?? {};
            if (t.mask === 'circle') el.image.mask = 'circle';
            else {
              delete el.image.mask;
              if (t.radius !== undefined) el.style = { radius: ctx.R.radius(t.radius) };
            }
          }
          elements.push(el);
        } else if (part.slot.id === 'photo') {
          elements.push(...avatarElements(part.frame, p.it.name, p.nameRole ?? 'h3', `${base}-${p.k}`, ctx));
        } else if (part.slot.id === 'logo') {
          noSrc += 1;
        }
        continue;
      }
      if (part.value === undefined) continue;
      if (part.chip) {
        elements.push(
          ...chipElements(part, `${base}-${p.k}-${part.slot.id}`, shared[part.slot.id], p.cell, ctx),
        );
        continue;
      }
      const el = text(part, p.k, shared[part.slot.id]);
      if (el) elements.push(el);
    }
  }
  if (noSrc) ctx.warn('logos', `${noSrc} logo item(s) without src: the name is shown as text`, 'info');
  for (const el of elements) {
    el.role ??= box.role ?? block.type;
    el.slot ??= binding.slot.id;
    el.layoutBox ??= box.id;
  }
  return elements;
}

/**
 * PR-3: how a logo name without a file is set. With components.chip: the chip font (tokens.font when it names a Mood
 * role, else the name slot's role), tokens.weight, tokens.text colour, padding.0 / padding.1 (vertical / horizontal),
 * the chip rect from fill / border / radius / shadow. Without a chip component: the name in h3 centred in its cell,
 * with a hairline border (shape.divider.weight, else shape.borderWidth; colour shape.divider.color, else border) when
 * the brand gives one.
 */
function chipSpec(part, cell, ctx) {
  const comp = ctx.mood.components?.chip;
  if (comp) {
    const t = comp.tokens ?? {};
    const role = typeof t.font === 'string' && ctx.mood.type?.roles?.[t.font] ? t.font : part.slot.role;
    const padV = num(t['padding.0']) ?? num(t.padding) ?? 0;
    const padH = num(t['padding.1']) ?? padV;
    return {
      component: true,
      role,
      tokens: t,
      padV,
      padH,
      color: t.text !== undefined ? ctx.R.color(t.text) : undefined,
      weight: num(t.weight),
    };
  }
  const d = ctx.mood.shape?.divider;
  const w = num(d?.weight) ?? num(ctx.mood.shape?.borderWidth);
  const hairline = w > 0 ? { width: w, color: ctx.R.color(d?.color ?? 'border') } : null;
  return { component: false, role: 'h3', padV: 0, padH: 0, hairline, cell };
}

/** PR-3: the chip's text element, fitted inside the padded room of the name frame (first pass / shared size). */
function chipText(part, id, size, ctx, frame) {
  const c = part.chip;
  const f = frame ?? {
    x: part.frame.x + c.padH,
    y: part.frame.y + c.padV,
    w: Math.max(0, part.frame.w - 2 * c.padH),
    h: Math.max(0, part.frame.h - 2 * c.padV),
  };
  return textElement({
    id,
    frame: f,
    role: c.role,
    paragraphs: [{ runs: parseInline(part.value) }],
    align: 'center',
    valign: 'middle',
    size,
    color: c.color,
    weight: c.weight,
    ctx,
  });
}

/** Logo chip rule (PR-3): the chip (rect hugging the name + padding, centred in the name frame) and its text; or h3 + hairline. */
function chipElements(part, id, size, cell, ctx) {
  const c = part.chip;
  const first = chipText(part, id, size, ctx);
  if (!first) return [];
  const out = [];
  if (!c.component) {
    if (c.hairline?.color) {
      out.push({
        id: `${id}-border`,
        type: 'shape',
        name: 'logo name hairline',
        frame: rf(cell),
        z: 20,
        shape: { kind: 'rect' },
        style: { stroke: { color: c.hairline.color, width: c.hairline.width } },
      });
    }
    out.push(first);
    return out;
  }
  const lineW = Math.max(0, ...first.text.lines.map((l) => l.width));
  const innerW = Math.min(Math.ceil(lineW), Math.max(0, part.frame.w - 2 * c.padH));
  const innerH = first.text.fit.height;
  const w = innerW + 2 * c.padH;
  const h = innerH + 2 * c.padV;
  const chip = { x: part.frame.x + (part.frame.w - w) / 2, y: part.frame.y + (part.frame.h - h) / 2, w, h };
  const rect = rectEl(`${id}-chip`, chip, c.tokens, ctx);
  if (rect) {
    rect.name = 'logo chip';
    out.push(rect);
  }
  const inner = { x: chip.x + c.padH, y: chip.y + c.padV, w: innerW, h: innerH };
  const el = chipText(part, id, first.text.fit.appliedSize, ctx, inner) ?? first;
  out.push(el);
  return out;
}

/** Whether an item has a marker shape behind its number (numbers on a marker take the surface bg colour). */
function plansHaveMarker(plan) {
  return plan.shapes.some((s) => s.layoutBox === 'marker' || /-marker$/.test(s.id));
}

/** One binding -> its elements. */
export function slotElements(binding, ctx) {
  const { slot, box, blocks } = binding;
  const id = `${ctx.slideId}-${slot.id}`;
  if (!box) {
    ctx.warn('layout', `slot "${slot.id}" names box "${slot.box}", which the layout does not have`, 'error');
    return [];
  }
  const frame = box.frame;
  const first = blocks[0];
  if (['kpis', 'cards', 'steps', 'timeline', 'logos', 'people'].includes(first.type))
    return flowElements(binding, ctx);
  if (first.type === 'chart') {
    const warnings = [];
    let chart;
    try {
      chart = chartElement(first, frame, ctx.mood, ctx.R, { warnings });
    } catch (err) {
      ctx.warn('chart', `chart not drawn: ${err.message}`, 'error');
      return [];
    }
    const el = {
      id,
      type: 'chart',
      frame: rf(frame),
      z: 30,
      role: box.role ?? 'chart',
      slot: slot.id,
      layoutBox: box.id,
      chart,
    };
    if (warnings.length) el.warnings = withElementId(warnings, id);
    return [el];
  }
  if (first.type === 'table') {
    const warnings = [];
    let table;
    try {
      ({ table } = tableElement(first, frame, ctx.mood, ctx.R, { warnings }));
    } catch (err) {
      ctx.warn('table', `table not drawn: ${err.message}`, 'error');
      return [];
    }
    const el = {
      id,
      type: 'table',
      frame: rf(frame),
      z: 30,
      role: box.role ?? 'table',
      slot: slot.id,
      layoutBox: box.id,
      table,
    };
    if (warnings.length) el.warnings = withElementId(warnings, id);
    return [el];
  }
  const images = blocks.filter((b) => b.type === 'image');
  const texts = blocks.filter((b) => b.type !== 'image');
  const out = [];
  if (images.length && !texts.length) {
    out.push(imageEl(id, frame, images[0], binding, ctx));
    images
      .slice(1)
      .forEach(() => ctx.warn('binding', `slot "${slot.id}" shows one image: extra image not shown`));
    return out;
  }
  images.forEach(() =>
    ctx.warn('binding', `slot "${slot.id}" mixes text and an image: the image is not shown`),
  );
  if (first.type === 'quote') {
    const tokens = ctx.mood.components?.quote?.tokens ?? {};
    const el = textElement({
      id,
      frame,
      role: slot.role ?? tokens.font ?? 'quote',
      box,
      slot,
      paragraphs: [{ runs: parseInline(first.text) }],
      align: box.align?.h ?? tokens.align ?? 'center',
      valign: box.align?.v ?? 'top',
      ctx,
    });
    return el ? [el] : [];
  }
  const el = textElement({
    id,
    frame,
    role: roleFor(binding, ctx),
    box,
    slot,
    paragraphs: paragraphsFor(texts, ctx),
    align: defaultAlign(box, ctx.mood),
    valign: box.align?.v ?? 'top',
    ctx,
  });
  return el ? [el] : [];
}

/** A layout box with a shape and no slot -> a shape element (token refs resolved); a line runs along the box's long side. */
export function boxShapeElement(box, ctx) {
  const s = box.shape;
  const style = {};
  const fill = ctx.R.color(s.fill);
  if (fill) style.fill = fill;
  const stroke = ctx.R.color(s.stroke);
  const f = box.frame;
  if (s.kind === 'line') {
    // a line box is as thick as the line (layouts: shape.divider.weight / shape.borderWidth); 0 → ruleWidth
    const width = Math.min(f.w, f.h) || ruleWidth(ctx.mood);
    const horizontal = f.w >= f.h;
    const points = horizontal
      ? [
          [0, r2(f.h / 2)],
          [r2(f.w), r2(f.h / 2)],
        ]
      : [
          [r2(f.w / 2), 0],
          [r2(f.w / 2), r2(f.h)],
        ];
    return {
      id: `${ctx.slideId}-${box.id}`,
      type: 'line',
      frame: rf(f),
      z: 20,
      role: box.role ?? 'divider',
      layoutBox: box.id,
      shape: { kind: 'line', points },
      style: stroke ? { stroke: { color: stroke, width } } : {},
    };
  }
  if (stroke) style.stroke = { color: stroke, width: ctx.mood.shape?.borderWidth ?? 1 };
  const radius = ctx.R.radius(s.radius);
  if (radius !== undefined) style.radius = radius;
  return {
    id: `${ctx.slideId}-${box.id}`,
    type: 'shape',
    frame: rf(f),
    z: 20,
    role: box.role ?? 'shape',
    layoutBox: box.id,
    shape: { kind: s.kind ?? 'rect' },
    style,
  };
}
