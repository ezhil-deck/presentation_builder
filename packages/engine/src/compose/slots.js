/** Bound slots -> deck elements (text fitted, charts / tables laid out, flow items placed). */
import { parseInline } from '../content/inline.js';
import { chartElement } from '../fit/chart.js';
import { tableElement } from '../fit/table.js';
import { ruleWidth } from '../fit/metrics.js';
import { fitTextFont } from '../fit/text.js';
import { r2 } from '../util/stable.js';
import { aroundGraphic } from './dataText.js';
import { buttonElements } from './keys.js';
import { mediaElements } from './media.js';
import { nestedElements } from './nested.js';
import { cellElements, cellLook, checkMarks } from './tableCells.js';
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

export function rectEl(id, frame, tokens, ctx, z = 20) {
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
const ITEM_COMPONENT = {
  'card-title-text': 'card',
  'item-card': 'card',
  'tier-card': 'card',
  'quote-card': 'card',
  'logo-card': 'card',
};

/**
 * Item layouts whose label / heading may give the lines it does not need to the text under it (content/2 rich
 * items: the heading box is sized for two lines).
 */
const GIVE_BACK = new Set([
  'item-card',
  'compare-column',
  'tier-card',
  'quote-card',
  'person-card',
  'logo-card',
]);

/**
 * Node `lines` (compare rows, tier features, timeline sub-points) -> list paragraphs: a check row's marker is the
 * brand check / cross glyph in its colour (checkMarks), any other line takes the brand bullet (type.bullets glyph
 * and colour); a row's body follows as an unmarked paragraph at the same indent.
 */
export function linesParagraphs(lines, ctx) {
  const b = ctx.mood.type?.bullets ?? {};
  const marks = lines.some((l) => typeof l.check === 'boolean') ? checkMarks(ctx, iconOf) : null;
  const gap = typeof b.gap === 'number' ? b.gap : ctx.R.spacing('sm');
  const indent = typeof b.indent === 'number' ? { indent: b.indent } : {};
  const color = ctx.R.color(b.color);
  const out = [];
  for (const l of lines) {
    const mark = l.check === true ? marks.on : l.check === false ? marks.off : null;
    const glyph = mark ? mark.text : b.glyph;
    const bullet = glyph ? { glyph, ...indent } : null;
    const c = mark ? mark.color : color;
    if (bullet && c) bullet.color = c;
    const p = { runs: parseInline(l.text ?? ''), level: 1, spaceAfter: gap };
    if (bullet) p.bullet = bullet;
    out.push(p);
    for (const child of l.children ?? [])
      out.push({ runs: parseInline(child.text ?? ''), level: 1, spaceAfter: gap });
  }
  return out;
}

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
  if (column && (flow.columns ?? 1) > 1) {
    // a column flow over several columns (points in two columns): column-major, the column gap = the grid gutter
    const cols = Math.min(flow.columns, items.length);
    const per = Math.ceil(items.length / cols);
    const cg = ctx.mood.geometry?.grid?.gutter ?? gap;
    const cw = (frame.w - cg * (cols - 1)) / cols;
    const ch = (frame.h - gap * (per - 1)) / per;
    cells = items.map((_, k) => ({
      x: frame.x + Math.floor(k / per) * (cw + cg),
      y: frame.y + (k % per) * (ch + gap),
      w: cw,
      h: ch,
    }));
  } else if (block.type === 'logos' && items.some((it) => Number.isInteger(it.row))) {
    // explicit logo rows (content/2 `rows`): one line per row, each logo the size of a cell of the fullest row,
    // every row centred
    const rowIds = [...new Set(items.map((it) => it.row ?? 0))].sort((a, b) => a - b);
    const per = rowIds.map((r) => items.filter((it) => (it.row ?? 0) === r).length);
    const cols = Math.max(1, ...per);
    const cw = (frame.w - gap * (cols - 1)) / cols;
    const ch = (frame.h - gap * (rowIds.length - 1)) / rowIds.length;
    const seen = new Map();
    cells = items.map((it) => {
      const ri = rowIds.indexOf(it.row ?? 0);
      const k = seen.get(ri) ?? 0;
      seen.set(ri, k + 1);
      const x0 = frame.x + (frame.w - (per[ri] * cw + (per[ri] - 1) * gap)) / 2;
      return { x: x0 + k * (cw + gap), y: frame.y + ri * (ch + gap), w: cw, h: ch };
    });
  } else if (column) cells = ctx.catalogue.flowCells(frame, items.length, gap, 'column');
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
  const fields = itemFields(flow.itemLayout, items, ctx);
  const plans = items.map((it, k) => {
    const full = cells[k];
    // a KPI with an image: the image is the cell's background (brand text-over-image rule) or a thumbnail above it
    const kpiImage = block.type === 'kpis' && it.image ? kpiImagePlan(it, full, `${base}-${k}`, ctx) : null;
    const cell = kpiImage?.inner ?? full;
    let sub = ctx.catalogue.itemLayout(flow.itemLayout, { mood: ctx.mood, w: cell.w, h: cell.h, fields });
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
        sub = ctx.catalogue.itemLayout(flow.itemLayout, { mood, w: cell.w, h: cell.h, fields });
      }
    }
    const boxes = new Map(sub.boxes.map((b) => [b.id, b]));
    const shapes = kpiImage ? [...kpiImage.elements] : [];
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
      const part = { slot, box: b, frame: offset(b.frame, cell), value };
      if (slot.id === 'icon') part.value = iconOf(ctx, it.icon) ?? undefined;
      if (slot.id === 'marker' && block.type === 'list') {
        Object.assign(part, pointMarker(it, k, block, ctx));
        used.add('icon');
      }
      if (slot.id === 'text' && block.type === 'list') {
        part.value = [it.text, ...(it.children ?? []).map((c) => c.text)].filter(Boolean).join('\n');
        used.add('children');
      }
      if (slot.id === 'text' && Array.isArray(it.lines) && it.lines.length) {
        // a node's lines (compare rows, tier features, timeline sub-points) as a list under its text
        part.paragraphs = [
          ...(part.value !== undefined
            ? [{ runs: parseInline(part.value), spaceAfter: ctx.R.spacing('sm') }]
            : []),
          ...linesParagraphs(it.lines, ctx),
        ];
        part.value = part.value ?? '';
        used.add('lines');
      }
      parts.push(part);
    }
    if (kpiImage) used.add('image');
    if (block.type === 'columns') used.add('blocks'); // the two-column shape of a compare column
    if (block.type === 'logos') used.add('row'); // placed by row
    if (it.icon !== undefined) {
      used.add('icon');
      if (!iconOf(ctx, it.icon) && !unbound.has(`icon:${it.icon}`)) {
        unbound.add(`icon:${it.icon}`);
        ctx.warn('icon', `icon "${it.icon}" is not in the brand's icon set: not shown`, 'info');
      }
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
    let onCard = filled && ctx.surface?.cardText ? ctx.R.color('cardText') : undefined;
    // rich item cards (content/2): the text colour that reads on the card's actual fill (a literal card fill may not
    // be the surface's card colour)
    const cardFill = shapes.find((x) => typeof x.style?.fill === 'string' && /-bg$/.test(x.id))?.style.fill;
    // (every content/2 card item layout: a logo / quote / tier card on an accent surface may be lighter than its
    // cardText)
    if (GIVE_BACK.has(flow.itemLayout) && cardFill) onCard = textOn(cardFill, ctx);
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
      paragraphs: part.paragraphs ?? [{ runs: parseInline(part.value) }],
      align: part.box?.align?.h ?? box.align?.h ?? 'left',
      valign: part.box?.align?.v ?? 'top',
      size,
      color: part.color ?? (marker ? ctx.R.color('bg') : plans[k].onCard ? plans[k].onCard : undefined),
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
  // rich item cards: a label / heading that needs fewer lines than its box gives the rest to the body below it
  if (GIVE_BACK.has(flow.itemLayout)) {
    for (const p of plans) {
      for (const key of ['label', 'title', 'heading']) {
        const part = p.parts.find((x) => x.slot.id === key && x.value !== undefined);
        if (!part) continue;
        const el = text(part, p.k);
        const saved = el ? part.frame.h - el.text.fit.height : 0;
        if (!(saved > 0)) continue;
        const top = part.frame.y;
        part.frame = { ...part.frame, h: part.frame.h - saved };
        for (const other of p.parts) {
          if (other === part || other.frame.y <= top) continue;
          other.frame = { ...other.frame, y: other.frame.y - saved };
          if (other.slot.id === 'text') other.frame = { ...other.frame, h: other.frame.h + saved };
        }
      }
    }
  }
  // a KPI trend mark sits after the value's line: the value is fitted in its box less the mark's room (0.35 × the
  // value size + spacing.sm), so the mark never runs into the next KPI
  if (block.type === 'kpis') {
    for (const p of plans) {
      const color =
        p.it.trend && ctx.R.color(ctx.mood.components?.kpi?.tokens?.[`deltaColors.${p.it.trend}`]);
      const part = color && p.parts.find((x) => x.slot.id === 'value' && x.value !== undefined);
      const size = part && ctx.R.font(part.slot.role ?? 'stat')?.size;
      if (size)
        part.frame = { ...part.frame, w: Math.max(0, part.frame.w - (0.35 * size + ctx.R.spacing('sm'))) };
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
        if (part.slot.id === 'icon') {
          if (part.value) elements.push(...iconElements(part.value, part.frame, id, ctx, 'left'));
          continue;
        }
        if (part.slot.id === 'image') {
          if (part.value)
            elements.push(imageEl(id, part.frame, { src: part.value, alt: p.it.title }, null, ctx));
          continue;
        }
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
          elements.push(
            ...avatarElements(
              part.frame,
              p.it.name ?? p.it.attribution,
              p.nameRole ?? 'h3',
              `${base}-${p.k}`,
              ctx,
            ),
          );
        } else if (part.slot.id === 'logo') {
          noSrc += 1;
        }
        continue;
      }
      if (part.iconFile) {
        elements.push(...iconElements(part.iconFile, part.frame, id, ctx, 'left'));
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
      if (el) {
        elements.push(el);
        if (part.slot.id === 'value' && block.type === 'kpis' && p.it.trend) {
          const mark = trendMark(el, p.it.trend, `${base}-${p.k}-trend`, ctx);
          if (mark) elements.push(mark);
        }
      }
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

/** The brand icon file for a node's icon name (catalogue.iconFile, docs/PLAN-studio.md §3.3), or null. */
function iconOf(ctx, name) {
  return typeof ctx.catalogue?.iconFile === 'function' ? ctx.catalogue.iconFile(ctx.mood, name) : null;
}

/** The thumbnail aspect (decor.imagery.crop.defaultRatio "w:h"), or null. */
function cropRatio(mood) {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(mood?.decor?.imagery?.crop?.defaultRatio ?? ''));
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}

/**
 * The optional parts an item layout draws, from the items of the flow (all items share them, so a list keeps one
 * rhythm): item-card {image (with a crop ratio), icon (a name that resolves), label, number (no icon resolves and the
 * brand's steps marker carries a number)}, steps / points {icon}.
 */
function itemFields(layoutId, items, ctx) {
  const icon = items.some((it) => iconOf(ctx, it.icon));
  if (layoutId === 'item-card') {
    const marker = String(ctx.mood.components?.steps?.tokens?.marker ?? '');
    return {
      image: items.some((it) => it.image) && Boolean(cropRatio(ctx.mood)),
      icon,
      label: items.some((it) => it.label),
      number: !icon && marker.includes('number'),
    };
  }
  if (layoutId === 'step-number-title-text' || layoutId === 'point-marker-text') return icon ? { icon } : {};
  // the content/2 item layouts of S2.a slice 3: which optional parts any item of the flow carries
  const any = (k) => items.some((it) => it[k] !== undefined && it[k] !== null && it[k] !== '');
  switch (layoutId) {
    case 'compare-column':
    case 'tier-card':
      return { image: any('image'), label: any('label'), price: any('price'), per: any('per') };
    case 'quote-card':
      return { label: any('label'), photo: any('photo'), role: any('role'), name: any('attribution') };
    case 'person-card':
      return { bio: any('bio'), role: any('role') };
    case 'logo-card':
      return { logo: any('src'), body: any('body') };
    case 'timeline-when-title-text':
      return icon ? { icon } : {};
    default:
      return {};
  }
}

/**
 * A brand icon in `room` (canvas px): the brand's icon container (components.icon.tokens container.*: rect / ellipse,
 * border, fill) when it gives one, and the icon image (fit contain) at the glyph size, centred in the room.
 */
function iconElements(file, room, id, ctx, align = 'left') {
  const cat = ctx.catalogue;
  const { room: side, glyph } = cat.iconSize(ctx.mood);
  const s = Math.min(side, room.w, room.h);
  const x = align === 'center' ? room.x + (room.w - s) / 2 : room.x;
  const box = { x, y: room.y, w: s, h: s };
  const out = [];
  const c = cat.iconContainer?.(ctx.mood);
  if (c) {
    const style = {};
    const fill = c.fill ? ctx.R.color(c.fill) : undefined;
    if (fill) style.fill = fill;
    const stroke = c.stroke ? ctx.R.color(c.stroke) : undefined;
    if (stroke) style.stroke = { color: stroke, width: c.strokeWidth };
    if (c.radius) {
      const r = ctx.R.radius(c.radius);
      if (r !== undefined) style.radius = r;
    }
    if (style.fill || style.stroke)
      out.push({
        id: `${id}-container`,
        type: 'shape',
        name: 'icon container',
        frame: rf(box),
        z: 20,
        shape: { kind: c.shape },
        style,
      });
  }
  const g = Math.min(glyph, s);
  const img = imageEl(
    id,
    { x: box.x + (s - g) / 2, y: box.y + (s - g) / 2, w: g, h: g },
    { src: file },
    null,
    ctx,
  );
  img.image.fit = 'contain';
  delete img.image.mask;
  img.name = 'icon';
  out.push(img);
  return out;
}

/**
 * The marker of one point in a points flow: the brand icon when its name resolves, else the number (an ordered
 * list) or the brand's bullet glyph (type.bullets.glyph), in the bullet colour (type.bullets.color).
 */
function pointMarker(it, k, block, ctx) {
  const file = iconOf(ctx, it.icon);
  if (file) return { iconFile: file, value: undefined };
  const b = ctx.mood.type?.bullets ?? {};
  const color = ctx.R.color(b.color);
  const value = block.ordered ? `${k + 1}.` : b.glyph;
  return { value: value || undefined, ...(color ? { color } : {}) };
}

/**
 * The Mood a content/2 table is re-laid with when its layout asks for taller rows (box `table.rowHeight`, docs/S2-
 * layouts.md §8): tables.rows.minHeight raised to min(rowHeight, frame height / rows) - never lowered. null when the
 * box gives no row height or the rows would not grow.
 */
function tallRowsMood(box, block, table, frame, mood) {
  const want = box?.table?.rowHeight;
  if (!(want > 0)) return null;
  const rows = (table.rowHeights ?? []).length;
  if (!rows) return null;
  const minH = Math.floor(Math.min(want, frame.h / rows));
  const rowsTok = mood.tables?.rows ?? {};
  const now = rowsTok.minHeight ?? rowsTok.height ?? 0;
  if (minH <= now || minH <= Math.min(...table.rowHeights)) return null;
  return { ...mood, tables: { ...mood.tables, rows: { ...rowsTok, minHeight: minH } } };
}

/** Whether the brand's text-over-image rule lays an overlay (decor.imagery.textOverImage opacity > 0, a colour). */
function textOverImageRule(mood) {
  const t = mood.decor?.imagery?.textOverImage;
  return Boolean(t && t.opacity > 0 && t.overlay && t.overlay !== 'transparent');
}

/**
 * Whether text can meet the brand's own contrast on its text-over-image overlay whatever the photo shows: some brand
 * surface text colour must reach decor.imagery.textOverImage.minContrast (else 4.5 : 1) on the overlay colour at its
 * opacity over both a white and a black pixel (the two extremes a photo can show). A weaker overlay → the KPI image is
 * a thumbnail above the KPI instead of its background (info).
 */
function overlayReads(ctx) {
  const t = ctx.mood.decor?.imagery?.textOverImage ?? {};
  const color = ctx.R.color(t.overlay);
  if (!color) return false;
  const a = Math.min(1, t.opacity);
  const ch = (i) => parseInt(color.slice(1 + 2 * i, 3 + 2 * i), 16);
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  const over = (px) => `#${[0, 1, 2].map((i) => hex(a * ch(i) + (1 - a) * px)).join('')}`;
  const light = over(255);
  const dark = over(0);
  const need = typeof t.minContrast === 'number' ? t.minContrast : 4.5;
  const best = Math.max(
    0,
    ...(ctx.mood.palette?.surfaces ?? [])
      .map((sf) => ctx.R.color(sf.text))
      .filter(Boolean)
      .map((c) => Math.min(contrastRatio(c.slice(0, 7), light), contrastRatio(c.slice(0, 7), dark))),
  );
  if (best >= need) return true;
  ctx.warn(
    'kpis',
    `KPI image drawn as a thumbnail: no brand text colour reaches ${need}:1 on the text-over-image overlay over any photo`,
    'info',
  );
  return false;
}

/**
 * Where text reads on an image under the brand's overlay: a gradient overlay (decor.imagery.textOverImage gradient,
 * towards `direction`, default bottom - as compose/index.js lays it) is dense at one end only, so the text keeps to the
 * DENSE_SHARE of the frame at that end; an even overlay → the whole frame.
 */
const DENSE_SHARE = 0.45;
function denseSide(f, mood) {
  const t = mood.decor?.imagery?.textOverImage ?? {};
  if (!t.gradient || t.direction === 'none') return f;
  const d = DENSE_SHARE;
  switch (t.direction ?? 'bottom') {
    case 'top':
      return { ...f, h: d * f.h };
    case 'left':
      return { ...f, w: Math.max(d, 0.6) * f.w };
    case 'right':
      return { ...f, x: f.x + (1 - Math.max(d, 0.6)) * f.w, w: Math.max(d, 0.6) * f.w };
    default:
      return { ...f, y: f.y + (1 - d) * f.h, h: d * f.h };
  }
}

/**
 * A KPI with an image: with the brand's text-over-image rule the image fills the cell and the KPI text sits inside
 * it, inset by spacing.md (the compose step lays the overlay and fixes the text colour); without the rule the image is
 * a thumbnail at the top of the cell (decor.imagery.crop.defaultRatio, ≤ 45 % of the cell) and the KPI sits below.
 * Neither signal → the image is not shown (info).
 */
function kpiImagePlan(it, cell, id, ctx) {
  const md = ctx.R.spacing('md');
  if (textOverImageRule(ctx.mood) && overlayReads(ctx)) {
    const el = imageEl(`${id}-image`, cell, { src: it.image, alt: it.label }, null, ctx);
    return { elements: [el], inner: denseSide(inset(cell, md), ctx.mood) };
  }
  const ratio = cropRatio(ctx.mood);
  if (!ratio) {
    ctx.warn(
      'kpis',
      'KPI image not shown: the brand gives no text-over-image rule and no crop ratio',
      'info',
    );
    return null;
  }
  const h = Math.min(cell.w / ratio, 0.45 * cell.h);
  const el = imageEl(
    `${id}-image`,
    { x: cell.x, y: cell.y, w: cell.w, h },
    { src: it.image, alt: it.label },
    null,
    ctx,
  );
  const sm = ctx.R.spacing('sm');
  return {
    elements: [el],
    inner: { x: cell.x, y: cell.y + h + sm, w: cell.w, h: Math.max(0, cell.h - h - sm) },
  };
}

/**
 * The trend mark of a KPI (content/2 `trend`): a small triangle (up / down) or bar (flat) after the value's first
 * line, in the brand's delta colour (components.kpi.tokens deltaColors.<trend>); no colour → no mark.
 */
function trendMark(valueEl, trend, id, ctx) {
  const color = ctx.R.color(ctx.mood.components?.kpi?.tokens?.[`deltaColors.${trend}`]);
  const line = valueEl.text.lines?.[0];
  if (!color || !line) return null;
  const size = valueEl.text.font.size;
  const s = r2(0.35 * size);
  const x = valueEl.frame.x + line.x + line.width + ctx.R.spacing('sm');
  const asc = valueEl.text.font.metrics?.ascent ?? 0.8;
  const mid = valueEl.frame.y + line.y - 0.35 * asc * size;
  const f = { x, y: mid - s / 2, w: s, h: s };
  if (trend === 'flat') {
    const h = Math.max(1, r2(s / 4));
    return {
      id,
      type: 'shape',
      name: 'trend',
      frame: rf({ x, y: mid - h / 2, w: s, h }),
      z: 30,
      shape: { kind: 'rect' },
      style: { fill: color },
    };
  }
  const points =
    trend === 'up'
      ? [
          [s / 2, 0],
          [s, s],
          [0, s],
        ]
      : [
          [0, 0],
          [s, 0],
          [s / 2, s],
        ];
  return {
    id,
    type: 'shape',
    name: 'trend',
    frame: rf(f),
    z: 30,
    shape: { kind: 'polygon', points: points.map(([a, b]) => [r2(a), r2(b)]) },
    style: { fill: color },
  };
}

/**
 * A connector colour on this surface: the ref resolved; a literal colour (one that does not follow the surface) that
 * hardly differs from the slide background (contrast < 1.5) gives way to the surface's own `border` role.
 */
function strokeOnSurface(ref, ctx) {
  const c = ctx.R.color(ref);
  const bg = ctx.R.color('bg');
  if (c && bg && /^#/.test(String(ref)) && contrastRatio(c.slice(0, 7), bg.slice(0, 7)) < 1.5)
    return ctx.R.color('border') ?? c;
  return c;
}

/** Body-text contrast (WCAG AA): node text on a card / accent fill reads at this ratio when a surface role allows. */
const BODY_CONTRAST = 4.5;

/**
 * The text colour on a node / rich-card fill: the first of the surface's cardText, text, heading, bg - then of the
 * brand's other surfaces' cardText / text - that reaches BODY_CONTRAST on it, else the one that contrasts most.
 */
export function textOn(fill, ctx) {
  const on = fill.slice(0, 7);
  const roles = ['cardText', 'text', 'heading', 'bg'].map((r) => ctx.R.color(r)).filter(Boolean);
  // then the text / cardText colours of the brand's other surfaces (as the text-over-image rule does)
  const others = (ctx.mood.palette?.surfaces ?? [])
    .flatMap((sf) => [sf.cardText, sf.text])
    .map((c) => (typeof c === 'string' ? ctx.R.color(c) : undefined))
    .filter(Boolean);
  const all = [...roles, ...others];
  const reads = all.find((c) => contrastRatio(c.slice(0, 7), on) >= BODY_CONTRAST);
  return reads ?? all.sort((a, b) => contrastRatio(b.slice(0, 7), on) - contrastRatio(a.slice(0, 7), on))[0];
}

/**
 * A process drawn as a shape (docs/S2-layouts.md §2): the arrangement from catalogue.processShape (nodes + marks in
 * canvas px, token refs), painted here - connectors as lines (the divider colour / weight; an arrowhead when the
 * brand defines components.arrow), outlines as ellipses, bands as polygons in the card component's look, nodes on
 * the card component (cardText on a filled card) or on the accent (the surface text colour that reads best on it) -
 * and each node's icon + heading + body fitted with one shared size per part across the nodes. A node count the
 * shape cannot draw falls back to the linear steps flow (pick() warns).
 */
function shapeElements(binding, ctx) {
  const block = binding.blocks[0];
  const items = block.items ?? [];
  const box = binding.box;
  const cat = ctx.catalogue;
  const icons = items.map((it) => iconOf(ctx, it.icon));
  const arr = cat.processShape(box.flow.shape, {
    mood: ctx.mood,
    frame: box.frame,
    n: items.length,
    body: items.some((it) => it.text),
    icon: icons.some(Boolean),
  });
  if (!arr) {
    const flow = {
      direction: 'row',
      gap: 'md',
      columns: Math.min(items.length, 5),
      itemLayout: 'step-number-title-text',
    };
    return itemFlowElements({ ...binding, box: { ...box, flow } }, ctx);
  }
  const base = `${ctx.slideId}-${binding.slot.id}`;
  const out = [];
  const weightOf = (w) => (typeof w === 'number' && w > 0 ? w : ruleWidth(ctx.mood));
  for (const m of arr.marks) {
    const id = `${base}-${m.id}`;
    if (m.kind === 'line') {
      const color = strokeOnSurface(m.stroke, ctx);
      if (!color) continue;
      const x = Math.min(m.x1, m.x2);
      const y = Math.min(m.y1, m.y2);
      const el = {
        id,
        type: 'line',
        role: 'connector',
        frame: rf({ x, y, w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) }),
        z: 20,
        shape: {
          kind: 'line',
          points: [
            [r2(m.x1 - x), r2(m.y1 - y)],
            [r2(m.x2 - x), r2(m.y2 - y)],
          ],
        },
        style: { stroke: { color, width: weightOf(m.weight) } },
      };
      if (m.arrow) el.lineProps = { arrowEnd: true };
      out.push(el);
    } else if (m.kind === 'polygon') {
      const style = bandStyle(ctx);
      if (style)
        out.push({
          id,
          type: 'shape',
          role: 'shape',
          frame: rf(m.frame),
          z: 20,
          shape: { kind: 'polygon', points: m.points.map(([a, b]) => [r2(a), r2(b)]) },
          style,
        });
    } else {
      const style = {};
      const stroke = m.stroke ? ctx.R.color(m.stroke) : undefined;
      if (stroke) style.stroke = { color: stroke, width: weightOf(m.weight) };
      const fill = m.fill ? ctx.R.color(m.fill) : undefined;
      if (fill) style.fill = fill;
      if (style.fill || style.stroke)
        out.push({
          id,
          type: 'shape',
          role: 'shape',
          frame: rf(m.frame),
          z: 20,
          shape: { kind: m.kind },
          style,
        });
    }
  }
  const roles = cat.nodeRoles(ctx.mood);
  const sm = ctx.R.spacing('sm');
  const plans = arr.nodes.map((node, k) => {
    const it = items[k] ?? {};
    const id = `${base}-${k}`;
    const decor = [];
    let color;
    if (node.paint === 'card') {
      const bg = componentBackground('card', node.frame, ctx, `${id}-bg`) ?? [];
      decor.push(...bg);
      // the card's own fill (not a border side drawn as a filled strip: an outlined card leaves the text on the slide)
      const fill = bg.find((x) => x.id === `${id}-bg` && typeof x.style?.fill === 'string')?.style.fill;
      if (fill) color = textOn(fill, ctx);
    } else if (node.paint === 'accent') {
      const fill = ctx.R.color('accent');
      if (fill) {
        const radius = ctx.R.radius(ctx.mood.components?.card?.tokens?.radius);
        decor.push({
          id: `${id}-bg`,
          type: 'shape',
          role: 'shape',
          frame: rf(node.frame),
          z: 20,
          shape: { kind: 'rect' },
          style: { fill, ...(radius !== undefined ? { radius } : {}) },
        });
        color = textOn(fill, ctx);
      }
    }
    let text = node.text;
    // a card's top border drawn as a strip (border.sides top) sits over the node's first line on a bare (flat) card:
    // the text starts spacing.sm under it
    const strip = decor.find((x) => x.id === `${id}-bg-border-top`);
    const below = strip ? strip.frame.y + strip.frame.h + sm - text.y : 0;
    if (below > 0 && !node.head)
      text = { x: text.x, y: text.y + below, w: text.w, h: Math.max(0, text.h - below) };
    if (icons[k] && !node.head) {
      const room = cat.iconSize(ctx.mood, roles.heading).room;
      decor.push(...iconElements(icons[k], text, `${id}-icon`, ctx, node.align));
      text = { x: text.x, y: text.y + room + sm, w: text.w, h: Math.max(0, text.h - room - sm) };
    }
    const parts = [];
    if (it.title) parts.push({ key: 'title', role: roles.heading, text: it.title, frame: node.head });
    if (it.text)
      parts.push({ key: 'text', role: roles.body, text: it.text, frame: node.head ? node.body : undefined });
    return { k, id, node, text, parts, decor, color };
  });
  const place = (plan, sizes) => {
    const els = [];
    const applied = {};
    let y = plan.text.y;
    plan.parts.forEach((part, i) => {
      const own = part.frame;
      if (own === null) return;
      const last = i === plan.parts.length - 1 || Boolean(plan.node.head);
      const f = own ?? { x: plan.text.x, y, w: plan.text.w, h: Math.max(0, plan.text.y + plan.text.h - y) };
      const el = textElement({
        id: `${plan.id}-${part.key}`,
        frame: f,
        role: part.role,
        paragraphs: [{ runs: parseInline(part.text) }],
        align: plan.node.align ?? 'left',
        valign: own ? (plan.node.valign ?? 'top') : 'top',
        size: sizes?.[part.key],
        color: plan.color,
        ctx,
      });
      if (!el) return;
      applied[part.key] = el.text.fit.appliedSize;
      if (!own && !last) {
        el.frame.h = r2(el.text.fit.height);
        y += el.text.fit.height + sm;
      }
      els.push(el);
    });
    // a stacked node centred vertically: shift the whole stack (the last part's frame shrinks to its text)
    if (plan.node.valign === 'middle' && !plan.node.head && els.length) {
      const lastEl = els[els.length - 1];
      lastEl.frame.h = r2(Math.min(lastEl.frame.h, lastEl.text.fit.height));
      const used = lastEl.frame.y + lastEl.frame.h - plan.text.y;
      const dy = Math.max(0, (plan.text.h - used) / 2);
      for (const el of els) el.frame.y = r2(el.frame.y + dy);
    }
    return { els, applied };
  };
  const shared = {};
  for (const plan of plans) {
    for (const [key, size] of Object.entries(place(plan).applied))
      shared[key] = Math.min(shared[key] ?? Infinity, size);
  }
  for (const plan of plans) {
    out.push(...plan.decor);
    out.push(...place(plan, shared).els);
  }
  for (const el of out) {
    el.role ??= box.role ?? 'steps';
    el.slot ??= binding.slot.id;
    el.layoutBox ??= box.id;
  }
  return out;
}

/** Below this contrast against the slide background a band's card fill does not read as a shape (WCAG ratio). */
const BAND_CONTRAST = 1.25;

/**
 * A process band (polygon) in the card component's look (its fill and border); when that fill hardly differs from the
 * slide background (an outlined or flat card: contrast < BAND_CONTRAST) the band takes the surface accent instead, so
 * the funnel / pyramid stays visible.
 */
function bandStyle(ctx) {
  const comp = ctx.mood.components?.card;
  const t = comp?.tokens ?? {};
  const style = {};
  if (comp && comp.variant !== 'flat') {
    const fill = ctx.R.color(t.fill ?? 'card');
    if (fill) style.fill = fill;
    const bw = t['border.width'];
    if (t['border.style'] && t['border.style'] !== 'none' && typeof bw === 'number' && bw > 0) {
      const c = ctx.R.color(t['border.color'] ?? 'border');
      if (c) style.stroke = { color: c, width: bw };
    }
  }
  // a band the slide background swallows (card fill = bg, or no card) takes the accent fill: the bands are the graphic
  const bg = ctx.R.color('bg');
  if (!style.fill || (bg && contrastRatio(style.fill.slice(0, 7), bg.slice(0, 7)) < BAND_CONTRAST)) {
    const accent = ctx.R.color('accent');
    if (accent) {
      style.fill = accent;
      delete style.stroke;
    }
  }
  return style.fill || style.stroke ? style : null;
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
  if (slot.id === 'action' && first.type === 'cta')
    return buttonElements(binding, ctx, { textElement, rectEl, textOn });
  if (first.type === 'kpis' && box.flow?.nested) return nestedElements(binding, ctx, { textElement, textOn });
  if (first.type === 'steps' && box.flow?.shape && typeof ctx.catalogue?.processShape === 'function')
    return shapeElements(binding, ctx);
  if (
    (first.type === 'list' || first.type === 'columns') &&
    box.flow?.itemLayout &&
    typeof ctx.catalogue?.itemLayout === 'function'
  )
    return itemFlowElements(binding, ctx);
  if (['kpis', 'cards', 'steps', 'timeline', 'logos', 'people'].includes(first.type))
    return flowElements(binding, ctx);
  if (first.type === 'chart') {
    const warnings = [];
    let chart;
    // content/2 chart text: the graphic title above the plot, the source line under it (axis titles and legend
    // labels are part of the chart geometry)
    const around = first.text
      ? aroundGraphic(frame, { title: first.text.title, source: first.text.source }, id, ctx, textElement)
      : { frame, elements: [] };
    const cf = around.frame;
    try {
      chart = chartElement(first, cf, ctx.mood, ctx.R, { warnings });
    } catch (err) {
      ctx.warn('chart', `chart not drawn: ${err.message}`, 'error');
      return [];
    }
    const el = {
      id,
      type: 'chart',
      frame: rf(cf),
      z: 30,
      role: box.role ?? 'chart',
      slot: slot.id,
      layoutBox: box.id,
      chart,
    };
    if (warnings.length) el.warnings = withElementId(warnings, id);
    const out = [el, ...around.elements];
    const g = chart.geometry;
    if (g.valueBox && g.valueText !== undefined) {
      // a gauge's value: the stat role (else display), centred in the ring (or under a filled half disc)
      const r = ctx.mood.type?.roles?.stat ? 'stat' : 'display';
      const v = textElement({
        id: `${id}-value`,
        frame: { x: cf.x + g.valueBox.x, y: cf.y + g.valueBox.y, w: g.valueBox.w, h: g.valueBox.h },
        role: r,
        paragraphs: [{ runs: [{ text: g.valueText }] }],
        align: 'center',
        valign: 'bottom',
        ctx,
      });
      if (v) out.push(v);
      delete g.valueBox;
      delete g.valueText;
    }
    for (const e of out) {
      e.role ??= box.role ?? 'chart';
      e.slot ??= slot.id;
      e.layoutBox ??= box.id;
    }
    return out;
  }
  if (first.type === 'table') {
    const warnings = [];
    let table;
    // content/2: the table's title / subtitle above it; rich cells drawn by type over the native table
    const around =
      first.title || first.subtitle
        ? aroundGraphic(frame, { title: first.title, subtitle: first.subtitle }, id, ctx, textElement)
        : { frame, elements: [] };
    const tf = around.frame;
    const rich = first.rich || Number.isInteger(first.highlightColumn);
    const look = rich ? cellLook(first, ctx, { iconOf, textOn, cropRatio }) : undefined;
    try {
      const opts = look ? { cells: look } : {};
      ({ table } = tableElement(first, tf, ctx.mood, ctx.R, { warnings, ...opts }));
      // content/2: rows grow to the brand's row height (the layout's `table.rowHeight`, by geometry.density), at
      // most the frame over the row count, so a short table fills its box; kept only when it still fits
      const tall = tallRowsMood(box, first, table, tf, ctx.mood);
      if (tall) {
        const w2 = [];
        const grown = tableElement(first, tf, tall, ctx.R, { warnings: w2, ...opts }).table;
        if (!w2.some((w) => w.check === 'overflow')) {
          table = grown;
          warnings.splice(0, warnings.length, ...w2);
        }
      }
    } catch (err) {
      ctx.warn('table', `table not drawn: ${err.message}`, 'error');
      return [];
    }
    const el = {
      id,
      type: 'table',
      frame: rf(tf),
      z: 30,
      role: box.role ?? 'table',
      slot: slot.id,
      layoutBox: box.id,
      table,
    };
    if (warnings.length) el.warnings = withElementId(warnings, id);
    const out = [el, ...around.elements];
    if (look) out.push(...cellElements(table, tf, look, id, ctx, { imageEl, rectEl, textElement }));
    for (const e of out) {
      e.role ??= box.role ?? 'table';
      e.slot ??= slot.id;
      e.layoutBox ??= box.id;
    }
    return out;
  }
  const images = blocks.filter((b) => b.type === 'image');
  const texts = blocks.filter((b) => b.type !== 'image');
  const out = [];
  if (images.length && !texts.length) {
    // content/2: a collage (2–4 images), a device frame, captions (compose/media.js)
    if (images[0].v2) out.push(...mediaElements(images[0], binding, ctx, { imageEl, textElement }));
    else out.push(imageEl(id, frame, images[0], binding, ctx));
    images
      .slice(1)
      .forEach(() => ctx.warn('binding', `slot "${slot.id}" shows one image: extra image not shown`));
    return out;
  }
  images.forEach(() =>
    ctx.warn('binding', `slot "${slot.id}" mixes text and an image: the image is not shown`),
  );
  if (first.type === 'quote' && box.flow?.itemLayout && typeof ctx.catalogue?.itemLayout === 'function')
    return itemFlowElements(binding, ctx); // a grid of quote cards (content/2 quotes)
  if (first.type === 'quote' && first.items?.length > 1)
    ctx.warn('content', `quotes beyond the first not rendered on layout "${ctx.layoutId ?? '?'}"`);
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
