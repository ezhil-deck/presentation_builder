/**
 * PR-6 template binding (proposal, docs/P3-proposals.md; docs/PLAN-template-library.md §4, V3): a cover / section /
 * CTA / statement slide is drawn from the hand-authored template its brand can fill best (@pb/templates match.js),
 * every element from a named brand signal. Behind `composeDeck({ proposals: { templateBinding } })`; off, nothing here
 * runs. No AI, nothing invented: a template element no signal fills is left out and listed; no template qualifies ->
 * the kind's layout as today plus an info `template` warning naming the nearest template and its unmet needs (D15).
 *
 * What a binding draws (z: photo 2 / 30, overlay 4, device by its layer 10 / 60, panel and cut-out 20, text 30,
 * logo 40):
 * - the **device**: the brand's element with its OWN geometry (a file at its brand `box`, else in the template's
 *   device box at the asset's aspect; a drawn rule as a line from its keys, under the title when it says
 *   `placement: under-title`); placeDecor does not place it again on that slide (compose dedupes by name);
 * - the **photo**: the slide's own image, else a brand sample of the kind the template needs (rotated per deck); in the
 *   brand's photo area its frame is the polygon's bounding box and `image.clip` the polygon in frame fractions; the
 *   brand's overlay over it (`image.blend` as the brand gives), under the device; text on it gets the brand's
 *   text-over-image overlay (compose textOverImage, z 30) and none when no text sits on it;
 * - the **text zone**: the brand's `text-zone` of the kind (titleAlign / textPosition / maxWidthPct) inside the content
 *   frame, else the template's measured quiet box; the slide's label / number / title / subtitle / action / contact /
 *   quote / attribution stacked in the template's order with the template's gaps scaled by the brand's title size,
 *   each in the kind's own role (titleRoleFor ...), fitted as every slot is (R-FILLROOM / R-PLACE untouched);
 * - the **logo**: the brand's placement box for the kind, else the template's furniture anchor through placeLogo (the
 *   brand's size for the kind; `none` leaves it out);
 * - a **panel** (a colour field holding the text) in the surface colour; a **cut-out**; an **avatar** from the brand's
 *   avatar component; the **button** through the cta slot (the brand's button component).
 * The slide background is the surface colour when the template binds a photo area + device, or its own photo while
 * the kind's background is an image (the reason recorded); else as today.
 */
import { lowerSlide } from '../content/lower.js';
import {
  LINES,
  createBuilder,
  estimateLines,
  footerFor,
  labelRole,
  lineBox,
  pickRole,
  titleRoleFor,
} from '@pb/layouts';
import { toKind } from '@pb/mood';
import { KIND_CATEGORY, pickTemplate } from '@pb/templates';
import { r2 } from '../util/stable.js';
import { validateLayout } from '../validate.js';
import { logoSize, placeLogo } from './logoFooter.js';
import { initialsOf, textElement, textOn } from './slots.js';

const W = 1920;
const H = 1080;

/** The kinds the binding serves (our kinds -> E3 slide kinds, @pb/templates KIND_CATEGORY). */
export const TEMPLATE_KINDS = new Set(Object.keys(KIND_CATEGORY));

const px = (b) => ({
  x: r2((b.x / 100) * W),
  y: r2((b.y / 100) * H),
  w: r2((b.w / 100) * W),
  h: r2((b.h / 100) * H),
});
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const inside = (a, b) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const plain = (s) => String(s ?? '').replace(/[*_`]/g, '');

/** A frame `box` holding an asset of aspect w / h at its largest, anchored at `v` (bottom | middle). */
function containIn(box, info, v = 'middle') {
  if (!(info?.width > 0 && info?.height > 0)) return { ...box };
  const s = Math.min(box.w / info.width, box.h / info.height);
  const w = info.width * s;
  const h = info.height * s;
  const y = v === 'bottom' ? box.y + box.h - h : box.y + (box.h - h) / 2;
  return { x: r2(box.x + (box.w - w) / 2), y: r2(y), w: r2(w), h: r2(h) };
}

/** x extent [min, max] of polygon `poly` (px points) between y0 and y1, or null when it does not reach that band. */
export function polyXRange(poly, y0, y1) {
  const xs = [];
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    if (ay >= y0 && ay <= y1) xs.push(ax);
    for (const y of [y0, y1]) {
      if ((ay - y) * (by - y) <= 0 && ay !== by) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

/**
 * The painted areas a bound template's text keeps clear of (px polygons): the device's painted polygons as the brand
 * capability measured them from its file (`measured.geometry.polygons`, canvas frame) when the device is drawn at its
 * full-canvas box, else the device's frame; the brand's photo area polygon.
 */
function paintedObstacles(parts, values, assets) {
  const out = [];
  const dev = parts.find((p) => p.part === 'device' && values[p.e.id]);
  if (dev) {
    const { c, el } = values[dev.e.id];
    const geo = c?.cap?.measured?.geometry;
    const box = el?.box;
    if (
      el?.file &&
      geo?.frame === 'canvas' &&
      Array.isArray(geo.polygons) &&
      box &&
      box.w === W &&
      box.h === H
    )
      for (const poly of geo.polygons) out.push(poly.map(([x, y]) => [(x / 100) * W, (y / 100) * H]));
    else if (el?.file) {
      const f =
        box && ['x', 'y', 'w', 'h'].every((k) => typeof box[k] === 'number')
          ? box
          : containIn(px(dev.e.box), assets.info(el.file));
      out.push([
        [f.x, f.y],
        [f.x + f.w, f.y],
        [f.x + f.w, f.y + f.h],
        [f.x, f.y + f.h],
      ]);
    }
  }
  const area = parts.find((p) => p.part === 'photo-area' && values[p.e.id]);
  if (area) out.push(values[area.e.id].layout.polygon.map(([x, y]) => [(x / 100) * W, (y / 100) * H]));
  return out;
}

/**
 * Brand decor placed on this slide as today (allowedOn the kind, frequency always, at a full-canvas brand box) whose
 * painted polygons the capability measured: the text keeps clear of them too (the bound device is counted once).
 */
function decorObstacles(kinds, surface, mood, brandSpec, values) {
  const boundIds = new Set(
    Object.values(values)
      .map((v) => v?.el?.id)
      .filter(Boolean),
  );
  const caps = new Map((brandSpec?.capabilities ?? []).map((c) => [c.key, c]));
  const out = [];
  for (const el of mood.decor?.elements ?? []) {
    if (el.unused || !el.file || boundIds.has(el.id)) continue;
    if (!Array.isArray(el.allowedOn) || !kinds.some((k) => el.allowedOn.includes(k))) continue;
    if (el.frequency && el.frequency !== 'always') continue;
    if (Array.isArray(el.surfaces) && el.surfaces.length && !el.surfaces.includes(surface.id)) continue;
    if (!(el.box?.w === W && el.box?.h === H)) continue;
    const geo = caps.get(`device:${el.id}`)?.measured?.geometry;
    if (geo?.frame !== 'canvas' || !Array.isArray(geo.polygons)) continue;
    for (const poly of geo.polygons) out.push(poly.map(([x, y]) => [(x / 100) * W, (y / 100) * H]));
  }
  return out;
}

/**
 * The zone narrowed to the wider free side of what the obstacles paint between y0 and y1 (one gutter clear), or null
 * when nothing overlaps; `{blocked: true}` when the free side is under 40 % of the zone.
 */
function clearOf(zone, obstacles, y0, y1, gutter) {
  const f = zone.frame;
  const ranges = obstacles.map((p) => polyXRange(p, y0, y1)).filter(Boolean);
  const hits = ranges.filter(([a, b]) => a < f.x + f.w && b > f.x);
  if (!hits.length) return null;
  const L = Math.min(...hits.map((r) => r[0]));
  const R = Math.max(...hits.map((r) => r[1]));
  const leftW = L - gutter - f.x;
  const rightW = f.x + f.w - (R + gutter);
  const w = Math.max(leftW, rightW);
  if (w < 0.4 * f.w) return { blocked: true };
  const x = rightW >= leftW ? R + gutter : f.x;
  return {
    ...zone,
    frame: { ...f, x: r2(x), w: r2(w) },
    signal: `${zone.signal} · clear of the device / photo area`,
  };
}

/** What the slide carries that a template may need: its image, its quote count, its keys and text lengths. */
export function slideFacts(cslide, summary, brandSpec) {
  const lowered = lowerSlide(cslide);
  const blocks = lowered.slide?.blocks ?? [];
  const sampleKind = (src) => (brandSpec?.imagery?.samples ?? []).find((s) => s?.file === src)?.kind ?? null;
  let image = null;
  if (lowered.background)
    image = { src: lowered.background, pointer: '/background', kind: sampleKind(lowered.background) };
  else {
    const quote = blocks.find((b) => b.type === 'quote');
    const img = blocks.find((b) => b.type === 'image' && b.src);
    if (quote?.photo) {
      const at = lowered.sources.get(quote)?.path;
      const p = at ? `${at}${quote.items ? '/items/0' : ''}/photo` : '/photo';
      image = { src: quote.photo, pointer: p, kind: sampleKind(quote.photo), alt: quote.attribution };
    } else if (img) {
      const at = lowered.sources.get(img)?.path ?? '/blocks';
      image = { src: img.src, pointer: at, kind: sampleKind(img.src), alt: img.alt };
    }
  }
  const quote = blocks.find((b) => b.type === 'quote');
  const textOf = (t) => blocks.find((b) => b.type === t)?.text;
  return {
    image,
    quotes: quote ? Math.max(1, quote.items?.length ?? 1) : 0,
    keys: summary?.keys ?? {},
    has: {
      label: Boolean(textOf('eyebrow')),
      subtitle: Boolean(textOf('subtitle')),
      number: Boolean(textOf('number')),
      cta: blocks.some((b) => b.type === 'cta'),
      body: blocks.some((b) => b.type === 'paragraph' || b.type === 'list'),
      quoteLabel: Boolean(quote?.label),
      title: Boolean(textOf('title')),
    },
    chars: {
      title: plain(textOf('title')).length,
      subtitle: plain(textOf('subtitle')).length,
      quote: plain(quote?.text).length,
      body: blocks
        .filter((b) => b.type === 'paragraph' || b.type === 'cta')
        .reduce((n, b) => n + plain(b.text).length, 0),
    },
    attribution: quote ? [quote.attribution, quote.role].filter(Boolean).join(', ') : '',
    lowered,
  };
}

/** The text part of a template element (its identified role; the label by its header mark), or null. */
function textPart(e, kind) {
  if (e.primitive !== 'text') return null;
  const role = e.mark?.part === 'k' ? 'eyebrow' : e.mark?.part === 't' ? 'header-title' : e.role;
  if (kind === 'quote') {
    // a statement: the largest text is the quote; the header (marks t / k) holds the slide title and label
    if (role === 'header-title') return 'title';
    if (role === 'title') return 'quote';
    if (role === 'attribution' || role === 'subtitle') return 'attribution';
    if (role === 'eyebrow' || role === 'label') return 'label';
    return null;
  }
  if (role === 'header-title') return 'title';
  if (role === 'eyebrow' || role === 'label') return 'label';
  if (role === 'title') return 'title';
  if (role === 'subtitle' || (role === 'body' && e.authored?.role === 'subtitle')) return 'subtitle';
  if (role === 'big-number') return 'number';
  if (role === 'contact' || role === 'body') return 'body';
  return null;
}

/** The template's parts by what the binding does with them. */
function partsOf(T, kind) {
  const needOf = (e) => (T.needs ?? []).find((n) => n.element === e.id)?.key ?? e.authored?.need ?? null;
  const parts = [];
  const button = T.elements.find((e) => needOf(e) === 'component:button');
  for (const e of T.elements) {
    const need = needOf(e);
    let part = null;
    if (need?.startsWith('colour-field:') && e.role === 'background') part = 'field';
    else if (need?.startsWith('colour-field:') && e.role === 'panel') part = 'panel';
    else if (need === 'photo-area') part = 'photo-area';
    else if (need?.startsWith('image:')) part = 'photo';
    else if (need?.startsWith('overlay:')) part = 'overlay';
    else if (need?.startsWith('device:')) part = 'device';
    else if (need === 'cutout') part = 'cutout';
    else if (need === 'component:avatar') part = 'avatar';
    else if (need === 'component:button') part = 'action';
    else if (e.role === 'brand-logo' || need?.startsWith('logo:')) part = 'logo';
    else if (e.primitive === 'text') {
      // the button's own text is the button
      if (button && inside(e.box, button.box)) part = 'button-text';
      else part = textPart(e, kind);
    } else if (e.role === 'background' && !need) part = 'canvas';
    parts.push({ e, need, part });
  }
  return parts;
}

const TEXT_PARTS = new Set([
  'label',
  'number',
  'title',
  'subtitle',
  'action',
  'body',
  'quote',
  'attribution',
]);

/** The kind's own role for a text part (the existing slot rules: titleRoleFor, the cta / section / quote roles). */
function roleOf(part, kind, mood) {
  const qt = mood.components?.quote?.tokens ?? {};
  switch (part) {
    case 'label':
    case 'quote-label':
      return labelRole(mood);
    case 'title':
      // a statement's title is its working-slide header (the quote layout's h1); the quote hint names the quote's role
      return kind === 'quote' ? pickRole(mood, 'h1') : titleRoleFor(mood, kind, 'display');
    case 'subtitle':
      return 'h3';
    case 'number':
      return pickRole(mood, 'stat', 'display');
    case 'action':
      return pickRole(mood, 'button', 'body');
    case 'body':
      return pickRole(mood, 'body');
    case 'quote':
      return pickRole(mood, mood.composition?.layoutHints?.quote?.titleRole, 'quote');
    case 'attribution':
      return pickRole(mood, qt.attributionFont, 'quoteAttribution');
    default:
      return null;
  }
}

/** Whether the slide has content for a text part. */
function present(part, facts, kind) {
  const h = facts.has;
  switch (part) {
    case 'label':
      return kind === 'quote' ? h.label || h.quoteLabel : h.label;
    case 'quote-label':
      return h.quoteLabel;
    case 'title':
      return h.title;
    case 'subtitle':
      return h.subtitle;
    case 'number':
      return h.number;
    case 'action':
      return h.cta;
    case 'body':
      return h.body || h.cta;
    case 'quote':
      return facts.quotes > 0;
    case 'attribution':
      return Boolean(facts.attribution);
    default:
      return false;
  }
}

/** Lines a part is sized for (the fitter decides the real count; the estimate keeps the stack from overlapping). */
function linesOf(part, role, facts, w, mood) {
  const est = (chars, lo, hi, fallback) =>
    Math.max(lo, Math.min(hi, estimateLines(mood, role, chars, w) ?? fallback));
  switch (part) {
    case 'title':
      return est(facts.chars.title, 1, 4, LINES.title);
    case 'subtitle':
      return est(facts.chars.subtitle, 1, 3, LINES.heading);
    case 'body':
      return est(facts.chars.body, 1, 4, LINES.label);
    case 'quote':
      return est(facts.chars.quote, 1, 8, 4);
    case 'attribution':
      return LINES.label;
    default:
      return LINES.one;
  }
}

/** The text zone in px: the brand's for the kind, else the template's quiet box; with its alignment and anchor. */
function textZone(T, values, parts, mood) {
  const m = mood.geometry?.margins ?? {};
  const content = {
    x: m.left ?? 0,
    y: m.top ?? 0,
    w: W - (m.left ?? 0) - (m.right ?? 0),
    h: H - (m.top ?? 0) - (m.bottom ?? 0),
  };
  const zonePart = parts.find((p) => p.need === 'text-zone' && values[p.e.id]);
  if (zonePart) {
    const l = values[zonePart.e.id].layout;
    const w = Math.min(content.w, ((num(l.maxWidthPct) ?? 100) / 100) * W);
    const align = ['left', 'right', 'center'].includes(l.titleAlign) ? l.titleAlign : null;
    const x =
      align === 'right'
        ? content.x + content.w - w
        : align === 'center'
          ? content.x + (content.w - w) / 2
          : content.x;
    const pos = l.textPosition === 'center' ? 'middle' : l.textPosition;
    const anchor = ['top', 'bottom', 'middle'].includes(pos) ? pos : 'top';
    return {
      frame: { x: r2(x), y: content.y, w: r2(w), h: content.h },
      align: align ?? mood.type?.align?.title ?? 'left',
      anchor,
      content,
      from: 'text-zone',
      signal: values[zonePart.e.id].signal,
      element: zonePart.e.id,
    };
  }
  const q = T.intent?.quiet?.box ?? T.zones?.text;
  const f = q ? px(q) : { ...content };
  // inside the content frame horizontally (the brand's margins)
  const x0 = Math.max(content.x, f.x);
  const x1 = Math.min(content.x + content.w, f.x + f.w);
  const title = T.elements.find(
    (e) => e.primitive === 'text' && (e.role === 'title' || e.mark?.part === 't'),
  );
  const ta = title?.text?.align;
  const align = ta === 'end' || ta === 'right' ? 'right' : ta === 'center' ? 'center' : 'left';
  const cy = f.y + f.h / 2;
  const anchor = cy < 0.4 * H ? 'top' : cy > 0.6 * H ? 'bottom' : 'middle';
  return {
    frame: { x: r2(x0), y: r2(f.y), w: r2(Math.max(0, x1 - x0)), h: r2(f.h) },
    align,
    anchor,
    content,
    from: 'quiet',
    signal: `template ${T.id} intent.quiet.box`,
  };
}

/**
 * The stack of text parts in the zone: the template's order (top to bottom), heights from the kind's roles, gaps =
 * the template's gaps in title sizes x the brand's title size. Returns [{part, e, role, frame}] and the left-out parts.
 */
function stack(T, parts, zone, facts, kind, mood) {
  const items = parts
    .filter((p) => TEXT_PARTS.has(p.part) || p.part === 'quote-label')
    .sort((a, b) => a.e.box.y - b.e.box.y);
  const titleEl =
    items.find((p) => p.part === (kind === 'quote' ? 'quote' : 'title'))?.e ??
    T.elements.find((e) => e.role === 'title');
  const tplTitlePx = ((titleEl?.text?.sizePctH ?? 6) / 100) * H;
  const brandTitle =
    mood.type?.roles?.[roleOf(kind === 'quote' ? 'quote' : 'title', kind, mood)]?.size ?? tplTitlePx;
  const scale = brandTitle / tplTitlePx;
  const bt = mood.components?.button?.tokens ?? {};
  const pad = num(bt['padding.0']) ?? 0;
  const out = [];
  const leftOut = [];
  for (const p of items) {
    const role = roleOf(p.part, kind, mood);
    if (!present(p.part, facts, kind)) {
      leftOut.push({ ...p, why: 'the slide has no content for it' });
      continue;
    }
    if (!role || !mood.type?.roles?.[role]) {
      leftOut.push({ ...p, why: `the Mood has no ${role ?? p.part} role` });
      continue;
    }
    let h = lineBox(mood, role, linesOf(p.part, role, facts, zone.frame.w, mood));
    if (p.part === 'action') h = lineBox(mood, role, LINES.one) + 2 * pad;
    // the gap from the element above it in the template (scaled by the brand's title size)
    const idx = T.elements.indexOf(p.e);
    const above = items.filter((q) => q.e.box.y < p.e.box.y && T.elements.indexOf(q.e) !== idx);
    const tplPrev = above.length ? above[above.length - 1].e : null;
    let gap = 0;
    if (out.length && tplPrev) {
      const g = ((p.e.box.y - (tplPrev.box.y + tplPrev.box.h)) / 100) * H;
      gap = Math.max(0, g * scale);
    }
    out.push({ ...p, role, h: r2(h), gap: r2(gap) });
  }
  const c = zone.content;
  // a statement's header (its title and label above the quote in the template) sits at the brand's title zone; the
  // quote group is placed in the zone under it
  const quoteTpl = out.find((s) => s.part === 'quote')?.e;
  const head =
    kind === 'quote' && quoteTpl
      ? out.filter((s) => (s.part === 'title' || s.part === 'label') && s.e.box.y < quoteTpl.box.y)
      : [];
  if (head.length) {
    const tz = mood.geometry?.titleZone;
    let y = typeof tz?.y === 'number' ? tz.y : c.y;
    head.forEach((s, k) => {
      if (k) y += s.gap;
      s.frame = { x: zone.frame.x, y: r2(y), w: zone.frame.w, h: s.h };
      y += s.h;
    });
    const lg = mood.geometry?.spacing?.lg ?? 0;
    const top = Math.max(zone.frame.y, y + lg);
    const rest = out.filter((s) => !head.includes(s));
    if (rest.length) rest[0].gap = 0;
    placeIn(
      rest,
      { ...zone, frame: { ...zone.frame, y: r2(top), h: r2(c.y + c.h - top) }, from: 'header' },
      mood,
      pad,
    );
    return { items: out, leftOut, scale };
  }
  placeIn(out, zone, mood, pad);
  return { items: out, leftOut, scale };
}

/** Sets each stack item's frame in the zone (anchored as the zone says, inside its room). */
function placeIn(out, zone, mood, pad) {
  const c = zone.content;
  const room0 = zone.from === 'quiet' ? c.h : Math.min(zone.frame.h, c.y + c.h - Math.max(c.y, zone.frame.y));
  const gaps0 = out.reduce((n, s) => n + s.gap, 0);
  const sum0 = out.reduce((n, s) => n + s.h, 0);
  if (sum0 + gaps0 > room0 && sum0 > 0) {
    const one = (s) => lineBox(mood, s.role, LINES.one) + (s.part === 'action' ? 2 * pad : 0);
    const excess = out.reduce((n, s) => n + Math.max(0, s.h - one(s)), 0);
    const k = excess > 0 ? Math.min(1, (sum0 + gaps0 - room0) / excess) : 0;
    for (const s of out) s.h = r2(s.h - Math.max(0, s.h - one(s)) * k);
  }
  const total = out.reduce((n, s) => n + s.h + s.gap, 0);
  const a = zone.anchor;
  let y0 =
    a === 'bottom'
      ? zone.frame.y + zone.frame.h - total
      : a === 'middle'
        ? zone.frame.y + (zone.frame.h - total) / 2
        : zone.frame.y;
  if (zone.from === 'quiet') {
    // the template's quiet box anchors the stack; it may grow out of it, never out of the content frame
    const fy = zone.frame;
    y0 = a === 'bottom' ? fy.y + fy.h - total : a === 'middle' ? fy.y + (fy.h - total) / 2 : fy.y;
  }
  const lo = zone.from === 'quiet' ? c.y : Math.max(c.y, zone.frame.y);
  const hi = zone.from === 'quiet' ? c.y + c.h : Math.min(c.y + c.h, zone.frame.y + zone.frame.h);
  y0 = Math.max(lo, Math.min(y0, hi - total));
  let y = y0;
  for (const s of out) {
    y += s.gap;
    s.frame = { x: zone.frame.x, y: r2(y), w: zone.frame.w, h: s.h };
    y += s.h;
  }
}

/**
 * The binding of one slide, or null when no template qualifies (an info `template` warning names the nearest).
 * Returns { candidate, layout, pre: [elements], logo: {element|null, entry}|undefined, background|undefined,
 *   deviceIds: Set, entries: [binding rows], textSignals: Map box id -> {template, signal}, post(elements, ctx) }.
 */
export function bindTemplate({
  kind,
  kinds,
  cslide,
  summary,
  surface,
  mood,
  brandSpec,
  R,
  assets,
  slideId,
  warn,
  used,
  background,
}) {
  const facts = slideFacts(cslide, summary, brandSpec);
  const pick = pickTemplate(kind, {
    brandSpec,
    mood,
    slide: {
      surface,
      image: facts.image,
      quotes: facts.quotes,
      keys: facts.keys,
      fields: {
        title: facts.has.title,
        label: facts.has.label,
        quoteLabel: facts.has.quoteLabel,
        subtitle: facts.has.subtitle,
        number: facts.has.number,
        cta: facts.has.cta,
      },
      layoutId: cslide.layout,
    },
    used,
  });
  if (!pick.best) {
    const n = pick.nearest;
    if (n) {
      const unmet = [
        ...n.needs.filter((x) => !x.met && !x.optional).map((x) => `${x.key} (${x.why})`),
        ...n.content.why,
      ];
      warn(
        'template',
        `no ${KIND_CATEGORY[kind]} template binds (PR-6): nearest "${n.template.id}" (score ${n.score}), unmet: ${unmet.join('; ')}`,
        'info',
      );
    }
    return { none: true, nearest: n ?? null, list: pick.list };
  }
  const cand = pick.best;
  const T = cand.template;
  const values = Object.fromEntries(
    Object.entries(cand.values).map(([el, v]) => [
      el,
      { ...v, signal: cand.needs.find((n) => n.element === el)?.signal },
    ]),
  );
  const parts = partsOf(T, kind);
  const entries = [];
  const entry = (p, status, signal, why, deckElement) => {
    const row = { element: p.e.id, role: p.e.role, status };
    if (p.need) row.need = p.need;
    if (signal) row.signal = signal;
    if (why) row.why = why;
    if (deckElement) row.deckElement = deckElement;
    entries.push(row);
  };
  const pre = [];
  const deviceIds = new Set();
  const sources = new Map(); // deck element id -> {template, signal}
  const tag = (el, p, signal) => {
    el.source = { template: p.e.id, signal };
    sources.set(el.id, el.source);
    return el;
  };

  // ---------------------------------------------------------------- text zone + stack -> the Layout
  let zone = textZone(T, values, parts, mood);
  // a panel the template sets on its own side margin moves to the brand's margin, the text it holds with it
  const panelTpl = parts.find((p) => p.part === 'panel' && values[p.e.id]);
  let panelShift = 0;
  if (panelTpl) {
    const f = px(panelTpl.e.box);
    const tm = ((T.margins?.left ?? 0) / 100) * W;
    const c = zone.content;
    if (Math.abs(f.x - tm) < 2) panelShift = c.x - f.x;
    else if (Math.abs(f.x + f.w - (W - tm)) < 2) panelShift = c.x + c.w - (f.x + f.w);
    if (panelShift && zone.from === 'quiet') {
      const x = Math.max(c.x, zone.frame.x + panelShift);
      const w = Math.min(c.x + c.w, zone.frame.x + panelShift + zone.frame.w) - x;
      zone = { ...zone, frame: { ...zone.frame, x: r2(x), w: r2(Math.max(0, w)) } };
    }
  }
  let { items, leftOut } = stack(T, parts, zone, facts, kind, mood);
  // nothing crosses the brand's device or photo area: the zone keeps to the free side of what they paint
  const obstacles = [
    ...paintedObstacles(parts, values, assets),
    ...decorObstacles(kinds, surface, mood, brandSpec, values),
  ];
  for (let pass = 0; pass < 2 && obstacles.length && items.length; pass += 1) {
    const y0 = Math.min(...items.map((s) => s.frame.y));
    const y1 = Math.max(...items.map((s) => s.frame.y + s.frame.h));
    const g = mood.geometry?.grid?.gutter ?? mood.geometry?.spacing?.lg ?? 0;
    const nz = clearOf(zone, obstacles, y0, y1, g);
    if (!nz) break;
    if (nz.blocked) {
      warn(
        'template',
        `template "${T.id}": the text zone has no side free of the brand's device / photo area (PR-6)`,
        'info',
      );
      break;
    }
    zone = nz;
    ({ items, leftOut } = stack(T, parts, zone, facts, kind, mood));
  }
  // a photo the template keeps its text off (no template text box overlaps it) stays clear of the text here too: the
  // stack starts under a photo above it (or ends over one below it), one spacing.lg apart
  const photoTpl = parts.find((p) => p.part === 'photo' && values[p.e.id]);
  if (photoTpl && !parts.some((p) => p.part === 'photo-area') && items.length) {
    const pf = px(photoTpl.e.box);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const tplClear = !items.some((q) => hit(px(q.e.box), pf));
    const over = items.some((q) => hit(q.frame, pf));
    if (tplClear && over) {
      const lg = mood.geometry?.spacing?.lg ?? 0;
      const c = zone.content;
      const f = zone.frame;
      const top = items[0].frame.y;
      zone =
        pf.y + pf.h / 2 <= top + (items.at(-1).frame.y + items.at(-1).frame.h - top) / 2
          ? {
              ...zone,
              frame: {
                ...f,
                y: r2(Math.max(c.y, pf.y + pf.h + lg)),
                h: r2(c.y + c.h - Math.max(c.y, pf.y + pf.h + lg)),
              },
              anchor: 'top',
              from: 'photo',
            }
          : { ...zone, frame: { ...f, y: c.y, h: r2(pf.y - lg - c.y) }, anchor: 'bottom', from: 'photo' };
      zone.signal = `${zone.signal} · clear of the template photo`;
      ({ items, leftOut } = stack(T, parts, zone, facts, kind, mood));
    }
  }
  // a layout id is lower-case letters, digits and '-' (layout schema): an option `~dark` becomes `--dark`
  const def = {
    id: `tpl-${T.id.replace(/~/g, '--')}`,
    kind,
    version: 1,
    name: `template ${T.id}`,
    tags: ['template', T.id],
  };
  const b = createBuilder(def, { mood, summary });
  const titleV = zone.anchor === 'bottom' ? 'bottom' : 'top';
  const textSignals = new Map();
  const keepFrames = new Map(); // box id -> the frame the header gives it (hugTitle never moves it to the quote)
  let titleTop = false;
  const avatarPart = parts.find((p) => p.part === 'avatar' && values[p.e.id]);
  for (const [k, s] of items.entries()) {
    const sig = `${zone.signal} · /type/roles/${s.role}`;
    if (s.part === 'title') {
      b.title(s.frame, s.role, { h: zone.align, v: titleV });
      titleTop = titleV === 'top';
      textSignals.set('title', { template: s.e.id, signal: sig });
    } else {
      const prev = items[k - 1];
      // a statement's label shows the slide label, else its quote's label (bindSlots: slot quote-label)
      const slotId = s.part === 'label' && kind === 'quote' && !facts.has.label ? 'quote-label' : s.part;
      const id = s.part === 'subtitle' && titleTop && prev?.part === 'title' ? 'title-subtitle' : slotId;
      if (slotId === 'quote-label') keepFrames.set(id, s.frame);
      const boxRole =
        s.part === 'label' || s.part === 'quote-label'
          ? 'eyebrow'
          : s.part === 'action'
            ? 'body'
            : s.part === 'number'
              ? 'number'
              : s.part;
      const slotType =
        s.part === 'number'
          ? 'number'
          : s.part === 'quote'
            ? 'quote'
            : s.part === 'body'
              ? 'richtext'
              : 'text';
      let f = s.frame;
      if (s.part === 'attribution' && avatarPart) {
        // the avatar sits left of the attribution as in the template (its size from the brand's avatar token)
        const a = px(avatarPart.e.box);
        const size = num(mood.components?.[values[avatarPart.e.id].component]?.tokens?.size) ?? a.h;
        const at = px(s.e.box);
        const gap = Math.max(0, at.x - (a.x + a.w));
        f = {
          ...f,
          x: r2(f.x + size + gap),
          w: r2(Math.max(0, f.w - size - gap)),
          h: r2(Math.max(f.h, size)),
        };
        s.avatar = { x: s.frame.x, y: r2(f.y + (f.h - size) / 2), w: size, h: size };
      }
      b.box(id, f, {
        role: boxRole,
        slot: slotId,
        align: { h: zone.align, v: s.part === 'action' ? 'middle' : 'top' },
      });
      b.slot(slotId, slotType, id, { role: s.role });
      textSignals.set(id, { template: s.e.id, signal: sig });
    }
    entry(s, 'bound', sig);
  }
  for (const p of leftOut) entry(p, 'left out', null, p.why);
  // the slide's content the template has no element for (listed: a pick never drops content silently)
  const has = new Set(items.map((s) => s.part));
  const missing = [];
  if (facts.has.label && !has.has('label')) missing.push('label');
  if (facts.has.subtitle && !has.has('subtitle')) missing.push('subtitle');
  if (facts.has.title && !has.has('title')) missing.push('title');
  if (kind === 'quote' && facts.has.quoteLabel && (facts.has.label || !has.has('label')))
    missing.push('quote label');
  if (missing.length)
    warn(
      'template',
      `template "${T.id}" has no element for the slide's ${missing.join(', ')}: not shown (PR-6)`,
      'info',
    );
  // a template without a logo element leaves the logo to the brand's own rule for the kind (logo.perKind)
  const hasLogo = parts.some((p) => p.part === 'logo');
  const layout = b.finish({ logo: hasLogo ? 'none' : 'mood', footer: footerFor(mood, kind) });
  for (const e of validateLayout(layout))
    warn('layout-schema', `template layout "${layout.id}": ${e.pointer} ${e.message}`, 'error');

  // ---------------------------------------------------------------- photo, overlay, device, panel, cut-out, avatar
  const photoArea = parts.find((p) => p.part === 'photo-area' && values[p.e.id]);
  const photoPart = parts.find((p) => p.part === 'photo' && values[p.e.id]);
  const panelPart = parts.find((p) => p.part === 'panel' && values[p.e.id]);
  const devicePart = parts.find((p) => p.part === 'device' && values[p.e.id]);
  let photo = null;
  if (photoPart) {
    const v = values[photoPart.e.id];
    let frame = px(photoPart.e.box);
    let clip = null;
    if (photoArea) {
      const poly = values[photoArea.e.id].layout.polygon;
      const xs = poly.map((q) => q[0]);
      const ys = poly.map((q) => q[1]);
      const box = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
      frame = px(box);
      clip = poly.map(([x, y]) => [r4((x - box.x) / box.w), r4((y - box.y) / box.h)]);
      entry(photoArea, 'bound', values[photoArea.e.id].signal, null, `${slideId}-photo`);
    }
    const textInside = items.some((s) => inside(s.frame, frame));
    photo = {
      id: `${slideId}-photo`,
      type: 'image',
      role: 'image',
      name: `template photo (${v.content ? 'content' : `sample ${v.sample}`})`,
      frame,
      z: textInside && !panelPart && !clip ? 30 : 2,
      image: { asset: assets.add(v.file), fit: 'cover', ...(v.alt ? { alt: v.alt } : {}) },
    };
    if (clip) photo.image.clip = clip;
    tag(photo, photoPart, v.signal);
    pre.push(photo);
    entry(photoPart, 'bound', v.signal, null, photo.id);
    if (!v.content) used?.samples?.set(v.file, (used.samples.get(v.file) ?? 0) + 1);
  } else if (photoArea) entry(photoArea, 'left out', null, 'no photo to frame');

  const overlayPart = parts.find((p) => p.part === 'overlay');
  if (overlayPart && values[overlayPart.e.id] && photo) {
    const { el } = values[overlayPart.e.id];
    const box = el.box && ['x', 'y', 'w', 'h'].every((k) => typeof el.box[k] === 'number') ? el.box : null;
    const ov = {
      id: `${slideId}-overlay-${el.id}`,
      type: 'image',
      role: 'decor',
      name: el.id,
      frame: box ? { x: box.x, y: box.y, w: box.w, h: box.h } : px(overlayPart.e.box),
      z: 4,
      image: { asset: assets.add(el.file), fit: box ? 'cover' : 'contain' },
    };
    if (el.blend) ov.image.blend = el.blend;
    if (typeof el.opacity === 'number' && el.opacity < 1) ov.style = { opacity: el.opacity };
    tag(ov, overlayPart, values[overlayPart.e.id].signal);
    pre.push(ov);
    deviceIds.add(el.id);
    entry(overlayPart, 'bound', values[overlayPart.e.id].signal, null, ov.id);
  } else if (overlayPart)
    entry(
      overlayPart,
      'left out',
      null,
      cand.needs.find((n) => n.element === overlayPart.e.id)?.why ?? 'no photo to lay it over',
    );

  let rule = null;
  if (devicePart) {
    const v = values[devicePart.e.id];
    const el = v.el;
    deviceIds.add(el.id);
    if (el.file) {
      const box = el.box && ['x', 'y', 'w', 'h'].every((k) => typeof el.box[k] === 'number') ? el.box : null;
      const frame = box
        ? { x: box.x, y: box.y, w: box.w, h: box.h }
        : containIn(px(devicePart.e.box), assets.info(el.file));
      const dev = {
        id: `${slideId}-device-${el.id}`,
        type: 'image',
        role: 'decor',
        name: el.id,
        frame,
        z: el.layer === 'front' ? 60 : 10,
        image: { asset: assets.add(el.file), fit: box ? 'cover' : 'contain' },
      };
      if (el.animated) dev.image.animated = assets.add(el.animated);
      if (typeof el.opacity === 'number' && el.opacity < 1) dev.style = { opacity: el.opacity };
      tag(dev, devicePart, v.signal);
      pre.push(dev);
      entry(devicePart, 'bound', v.signal, box ? null : 'no brand box: in the template device box', dev.id);
    } else {
      // a drawn rule: a line from its keys, placed after the fit (under the title when its placement says so)
      rule = { el, part: devicePart, signal: v.signal };
    }
  }

  if (panelPart) {
    const fill = R.color(surface.bg);
    const v = values[panelPart.e.id];
    if (fill) {
      const panel = {
        id: `${slideId}-panel`,
        type: 'shape',
        role: 'panel',
        frame: (() => {
          const f = px(panelPart.e.box);
          return { ...f, x: r2(f.x + panelShift) };
        })(),
        z: 20,
        shape: { kind: 'rect' },
        style: { fill },
      };
      tag(panel, panelPart, v.signal);
      pre.push(panel);
      entry(panelPart, 'bound', v.signal, null, panel.id);
    } else entry(panelPart, 'left out', null, `surface "${surface.id}" has no bg colour`);
  }

  const cutPart = parts.find((p) => p.part === 'cutout' && values[p.e.id]);
  if (cutPart) {
    const v = values[cutPart.e.id];
    const cut = {
      id: `${slideId}-cutout`,
      type: 'image',
      role: 'image',
      name: 'template cut-out',
      frame: containIn(px(cutPart.e.box), assets.info(v.file), 'bottom'),
      z: 20,
      image: { asset: assets.add(v.file), fit: 'contain' },
    };
    tag(cut, cutPart, v.signal);
    pre.push(cut);
    used?.samples?.set(v.file, (used.samples.get(v.file) ?? 0) + 1);
    entry(cutPart, 'bound', v.signal, null, cut.id);
  }

  const attr = items.find((s) => s.part === 'attribution' && s.avatar);
  if (avatarPart && attr) {
    const v = values[avatarPart.e.id];
    const t = mood.components?.[v.component]?.tokens ?? {};
    const fill = R.color(t.fill) ?? R.color('accent');
    if (fill) {
      const shape = String(t.mask ?? t.shape ?? 'circle');
      const av = {
        id: `${slideId}-avatar`,
        type: 'shape',
        role: 'avatar',
        frame: attr.avatar,
        z: 30,
        shape: { kind: shape === 'square' || shape === 'rect' ? 'rect' : 'ellipse' },
        style: { fill },
      };
      const radius = R.radius(t.radius);
      if (av.shape.kind === 'rect' && radius !== undefined) av.style.radius = radius;
      tag(av, avatarPart, v.signal);
      pre.push(av);
      entry(avatarPart, 'bound', v.signal, null, av.id);
      const name = facts.lowered.slide?.blocks?.find((x) => x.type === 'quote')?.attribution;
      if (t.placeholder === 'initials' && name) {
        const ini = textElement({
          id: `${slideId}-avatar-initials`,
          frame: attr.avatar,
          role: attr.role,
          paragraphs: [{ runs: [{ text: initialsOf(name) }] }],
          align: 'center',
          valign: 'middle',
          color: textOn(fill, { R, mood }),
          ctx: { R, mood, warn },
        });
        if (ini) pre.push(tag(Object.assign(ini, { role: 'avatar', z: 31 }), avatarPart, v.signal));
      }
    } else
      entry(avatarPart, 'left out', null, 'the avatar component gives no fill and the surface no accent');
  } else if (avatarPart) entry(avatarPart, 'left out', null, 'no attribution to sit beside');

  // ---------------------------------------------------------------- logo
  let logo;
  const logoPart = parts.find((p) => p.part === 'logo');
  if (logoPart) {
    const v = values[logoPart.e.id];
    const placement = (v?.placements ?? []).find((pl) => {
      const k = String(pl.layout ?? '');
      return kinds.includes(k) || (k && toKind(k).kind === kind);
    });
    const variant = v?.variant ? mood.logo?.variants?.[v.variant] : null;
    if (placement?.box && variant?.file) {
      const el = {
        id: `${slideId}-logo`,
        type: 'image',
        role: 'logo',
        name: `logo (${v.variant}, brand placement)`,
        frame: px(placement.box),
        z: 40,
        image: {
          asset: assets.add(variant.file),
          fit: 'contain',
          alt: brandSpec?.name ? `${brandSpec.name} logo` : 'logo',
        },
      };
      const sig = `${v.signal} placements[${placement.layout}]`;
      tag(el, logoPart, sig);
      logo = { size: 'placed', element: el };
      entry(logoPart, 'bound', sig, null, el.id);
    } else {
      const size = logoSize(kinds, { logo: 'mood' }, mood);
      const anchor = (T.intent?.furniture ?? []).find((f) => f.id === logoPart.e.id)?.anchor;
      if (size === 'none') {
        logo = { size: 'none', element: null };
        entry(
          logoPart,
          'left out',
          null,
          `the brand gives no logo on ${kind} (logo.perKind / layoutHints: none)`,
        );
      } else {
        const placed = placeLogo({
          kinds,
          surface,
          layout: { logo: size },
          mood: anchor ? { ...mood, logo: { ...mood.logo, position: anchor } } : mood,
          assets,
          warn,
          slideId,
          brandName: brandSpec?.name ?? mood.name,
        });
        if (placed) {
          const sig = `${v?.signal ?? '/logo/perSurface (Mood)'} · /logo/perKind/${kind} ${size}${anchor ? ` · template anchor ${anchor}` : ''}`;
          tag(placed.element, logoPart, sig);
          logo = placed;
          entry(logoPart, 'bound', sig, null, placed.element.id);
        } else {
          logo = { size: 'none', element: null };
          entry(
            logoPart,
            'left out',
            null,
            'the logo could not be placed (no variant / height for this surface)',
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------- background
  let bg;
  const bgReasons = [];
  if (photoArea && devicePart && photo) {
    bg = { type: 'solid', color: R.color(surface.bg) };
    bgReasons.push(
      "the template binds a photo area + device: the surface colour (not the kind's background image)",
    );
  } else if (photo && (background?.type === 'image' || facts.image)) {
    bg = { type: 'solid', color: R.color(surface.bg) };
    bgReasons.push('the template draws its own photo: the surface colour under it (not a background image)');
  }
  if (bg && !bg.color) bg = undefined;

  // the template's own elements nothing above handled (the canvas fill, a gradient, the button text ...)
  const field = parts.find((p) => p.part === 'field');
  if (field && values[field.e.id])
    entry(field, 'bound', values[field.e.id].signal, bgReasons[0] ?? 'the slide background');
  const done = new Set(entries.map((x) => x.element));
  for (const p of parts) {
    if (done.has(p.e.id)) continue;
    if (p.part === 'canvas')
      entry(p, 'bound', `surface ${surface.id} (/palette/surfaces)`, 'the slide background');
    else if (p.part === 'button-text') entry(p, 'bound', 'the button text (cta slot)', null);
    else if (p.part === 'action') entry(p, 'left out', null, 'the slide has no action');
    else if (p.need && !values[p.e.id])
      entry(p, 'left out', null, cand.needs.find((n) => n.element === p.e.id)?.why ?? 'need unmet');
    else entry(p, 'left out', null, 'no brand signal fills it (a template-only element)');
  }
  const button = items.find((s) => s.part === 'action');
  if (button) {
    const row = entries.find((x) => x.element === button.e.id);
    const comp = values[button.e.id];
    if (row && comp) row.signal = `${comp.signal} · ${row.signal}`;
  }

  used?.templates?.set(T.id, (used.templates.get(T.id) ?? 0) + 1);

  /** After the slot elements are fitted: the drawn rule device, the template sources on the text elements. */
  function post(elements, ctx) {
    for (const el of elements) {
      const s = el.layoutBox ? textSignals.get(el.layoutBox) : null;
      if (s && el.slot) el.source = { ...(el.source ?? {}), template: s.template, signal: s.signal };
    }
    for (const el of elements) {
      const f = el.layoutBox ? keepFrames.get(el.layoutBox) : null;
      // (its lines are frame-relative: moving the frame back moves them with it)
      if (f && el.type === 'text' && el.frame.y !== f.y) el.frame = { ...el.frame, y: f.y };
    }
    // a top-aligned title whose subtitle hugged up to its last line (hugTitle) ends at that subtitle: its box keeps
    // the lines and gives up the room it did not use (the boxes no longer overlap)
    const title = elements.find((x) => x.slot === 'title' && x.type === 'text' && x.text?.valign === 'top');
    const under = elements.find((x) => x.slot === 'subtitle' && x.type === 'text');
    if (title?.text?.fit && under && under.frame.y < title.frame.y + title.frame.h) {
      const h = Math.max(title.text.fit.height, under.frame.y - title.frame.y);
      title.frame = { ...title.frame, h: r2(h) };
    }
    if (rule) {
      const { el, part, signal } = rule;
      const thick = num(el.thickness) ?? num(el.draw?.thickness);
      const len = num(el.length) ?? num(el.draw?.length);
      const color = ctx.R.color(el.color ?? el.draw?.color);
      if (!(thick > 0) || !(len > 0) || !color) {
        entry(part, 'left out', null, 'the drawn rule gives no thickness / length / colour');
        return;
      }
      const title = elements.find((x) => x.slot === 'title' && x.type === 'text');
      let frame;
      if (el.placement === 'under-title' && title?.text?.fit) {
        const tf = title.frame;
        const hgt = title.text.fit.height;
        const free = Math.max(0, tf.h - hgt);
        const top =
          title.text.valign === 'bottom'
            ? tf.y + free
            : title.text.valign === 'middle'
              ? tf.y + free / 2
              : tf.y;
        const tplTitle = T.elements.find((x) => x.role === 'title' || x.mark?.part === 't');
        const g = tplTitle ? ((part.e.box.y - (tplTitle.box.y + tplTitle.box.h)) / 100) * H : 0;
        const tplPx = ((tplTitle?.text?.sizePctH ?? 6) / 100) * H;
        const gap = Math.max(ctx.R.spacing('sm'), (g * (title.text.font.size ?? tplPx)) / tplPx);
        const align = el.align ?? zone.align;
        const x = align === 'right' ? tf.x + tf.w - len : align === 'center' ? tf.x + (tf.w - len) / 2 : tf.x;
        frame = { x: r2(x), y: r2(top + hgt + gap), w: len, h: thick };
        // the subtitle under it moves down by what the rule needs
        const sub = elements.find((x) => x.slot === 'subtitle' && x.type === 'text');
        if (sub && sub.frame.y < frame.y + frame.h + gap) {
          const dy = r2(frame.y + frame.h + gap - sub.frame.y);
          sub.frame = { ...sub.frame, y: r2(sub.frame.y + dy) };
        }
      } else {
        const t = px(part.e.box);
        frame = { x: t.x, y: t.y, w: len, h: thick };
      }
      const line = {
        id: `${ctx.slideId}-device-${el.id}`,
        type: 'line',
        role: 'decor',
        name: el.id,
        frame,
        z: el.layer === 'front' ? 60 : 10,
        shape: {
          kind: 'line',
          points: [
            [0, r2(thick / 2)],
            [r2(len), r2(thick / 2)],
          ],
        },
        style: { stroke: { color, width: thick } },
        source: { template: part.e.id, signal },
      };
      elements.push(line);
      entry(
        part,
        'bound',
        signal,
        el.placement ? `drawn from its keys, ${el.placement}` : 'drawn from its keys',
        line.id,
      );
    }
  }

  /**
   * The template photo keeps clear of the brand's furniture and canvas decor (owner 2026-11-04): its frame is inset
   * away from every decor element placed on the slide at a brand box (`obstacles` with role decor whose Mood element
   * has a box; the bound device / overlay are not among them) and from the footer's own frames, one gutter clear,
   * keeping the larger free side each time; a photo that would lose more than half its height is left out and listed.
   * A clip polygon is carried over in the new frame's fractions; the photo's text-over-image overlay follows it.
   */
  function clearPhoto(elements, obstacles, ctx) {
    if (!photo) return;
    const el = elements.find((x) => x.id === photo.id);
    if (!el) return;
    const g = mood.geometry?.grid?.gutter ?? mood.geometry?.spacing?.lg ?? 0;
    const boxed = new Set((mood.decor?.elements ?? []).filter((d) => d.box).map((d) => d.id));
    const rects = obstacles
      .filter((o) => o?.frame && (o.role === 'footer' || (o.role === 'decor' && boxed.has(o.name))))
      .map((o) => ({ f: o.frame, what: o.role === 'footer' ? 'the footer' : `decor ${o.name}` }));
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const orig = { ...el.frame };
    let f = { ...orig };
    const cleared = [];
    for (const { f: o, what } of rects) {
      if (!f || !hit(f, o)) continue;
      const cands = [
        { ...f, y: o.y + o.h + g, h: f.y + f.h - (o.y + o.h + g) },
        { ...f, h: o.y - g - f.y },
        { ...f, x: o.x + o.w + g, w: f.x + f.w - (o.x + o.w + g) },
        { ...f, w: o.x - g - f.x },
      ].filter((c) => c.w > 0 && c.h > 0);
      f = cands.sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? null;
      if (!cleared.includes(what)) cleared.push(what);
    }
    if (!cleared.length) return;
    const row = entries.find((x) => x.deckElement === photo.id && x.need?.startsWith('image:'));
    if (!f || f.h < 0.5 * orig.h) {
      for (let k = elements.length - 1; k >= 0; k -= 1)
        if (elements[k].id === photo.id || elements[k].id === `${photo.id}-overlay`) elements.splice(k, 1);
      if (row) {
        row.status = 'left out';
        row.why = `clear of ${cleared.join(', ')} the photo would keep under half its height`;
        delete row.signal;
        delete row.deckElement;
      }
      warn(
        'template',
        `template "${T.id}": the photo is left out (clear of ${cleared.join(', ')} it keeps under half its height) (PR-6)`,
        'info',
      );
      return;
    }
    const nf = { x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) };
    if (el.image.clip) {
      const clamp = (v) => Math.max(0, Math.min(1, v));
      el.image.clip = el.image.clip.map(([x, y]) => [
        r4(clamp((orig.x + x * orig.w - nf.x) / nf.w)),
        r4(clamp((orig.y + y * orig.h - nf.y) / nf.h)),
      ]);
    }
    el.frame = nf;
    const ov = elements.find((x) => x.id === `${photo.id}-overlay`);
    if (ov) ov.frame = { ...nf };
    if (row) row.why = `inset clear of ${cleared.join(', ')} (one gutter)`;
    void ctx;
  }

  return {
    clearPhoto,
    candidate: cand,
    template: T,
    layout,
    pre,
    logo,
    background: bg,
    backgroundWhy: bgReasons[0],
    deviceIds,
    entries,
    post,
    zone,
  };
}
