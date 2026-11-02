/**
 * Assembly helpers every kind module uses: a small builder that collects boxes / slots / decor zones and finishes the
 * Layout instance (schemas/layout.schema.json) with the logo box, the footer box and the margin decor zones.
 */
import {
  CANVAS,
  LINES,
  bodyArea,
  bottom,
  contentFrame,
  footerBand,
  footerShown,
  frame,
  hint,
  lineBox,
  logoBox,
  overlaps,
  pickRole,
  right,
  role,
  round,
  safe,
  sideOf,
  space,
  titleBox,
} from './geometry.js';

/** Maximum items per flow box (P2-spec §2). */
export const MAX_ITEMS = Object.freeze({ cards: 4, kpi: 4, steps: 5, team: 4, logos: 8, timeline: 5 });

/** Flow item count: n = min(maxItems, summary.items); a missing / zero count still gets one slot (never 0 columns). */
export function flowCount(kind, summary) {
  const items = Number(summary?.items) || 0;
  return Math.max(1, Math.min(MAX_ITEMS[kind], items));
}

/** Normalised summary: missing fields → 0 / false (the engine may pass a partial one). */
export function normSummary(summary = {}) {
  return {
    kind: summary.kind ?? null,
    items: Number(summary.items) || 0,
    chars: Number(summary.chars) || 0,
    hasImage: Boolean(summary.hasImage),
    hasChart: Boolean(summary.hasChart),
    hasTable: Boolean(summary.hasTable),
    columns: Number(summary.columns) || 0,
  };
}

/**
 * The title role for a kind: composition.layoutHints[kind].titleRole when the Mood defines that role (signal:
 * BrandSpec.brandLayouts via the hint), else the layout's own role for the kind.
 */
export function titleRoleFor(mood, kind, fallback) {
  const r = hint(mood, kind).titleRole;
  return r && mood.type?.roles?.[r] ? r : fallback;
}

/** The surface the hint names for this kind, else palette.perKind[kind] (used only to pick the logo variant). */
export function surfaceIdFor(mood, kind) {
  return hint(mood, kind).surface ?? mood.palette?.perKind?.[kind] ?? null;
}

/**
 * Layout `surface` from the hint (cover / section / cta): `allow` = the hinted surface id, `prefer` = that surface's
 * palette role when it is one the schema names. No hint → undefined (the engine's surfaceFor decides).
 */
export function surfaceFromHint(mood, kind) {
  const id = hint(mood, kind).surface;
  if (!id) return undefined;
  const s = (mood.palette?.surfaces ?? []).find((x) => x.id === id);
  const out = { allow: [id] };
  if (s?.role && ['default', 'alt', 'accent', 'dark'].includes(s.role)) out.prefer = s.role;
  return out;
}

/** Logo size for a kind: hint.logo, else logo.perKind[kind]; nothing given → 'mood' (engine decides, no box). */
export function logoFor(mood, kind) {
  const h = hint(mood, kind).logo;
  if (['large', 'small', 'none'].includes(h)) return h;
  const p = mood.logo?.perKind?.[kind];
  if (['large', 'small', 'none'].includes(p)) return p;
  return 'mood';
}

/** Footer for a kind: hint.footer === false → 'hide'; true → 'show'; else 'mood' (engine applies hideOn). */
export function footerFor(mood, kind) {
  const f = hint(mood, kind).footer;
  if (f === false || f === 'hide') return 'hide';
  if (f === true || f === 'show') return 'show';
  return 'mood';
}

export function createBuilder(def, ctx) {
  const { mood } = ctx;
  const boxes = [];
  const slots = [];
  const zones = [];

  const b = {
    mood,
    kind: def.kind,
    summary: ctx.summary ?? {},
    /** px the title block grew by (a content/2 label above / subtitle under the title): the body area starts lower. */
    grow: 0,
    content: contentFrame(mood.geometry),
    /** The body area under the title block (bodyArea, moved down by what the title block grew). */
    area() {
      const a = bodyArea(mood);
      return frame(a.x, a.y + b.grow, a.w, a.h - b.grow);
    },
    box(id, f, props = {}) {
      boxes.push({ id, frame: round(f), ...props });
      return f;
    },
    slot(id, type, box, props = {}) {
      slots.push({ id, type, box, required: false, ...props });
    },
    zone(f) {
      if (f.w > 0 && f.h > 0) zones.push(f);
    },
    /** Title box + its required text slot. */
    title(f, roleName, align = {}) {
      const a = { ...align };
      if (!a.h && mood.type?.align?.title) a.h = mood.type.align.title;
      b.box('title', f, { role: 'title', slot: 'title', ...(Object.keys(a).length ? { align: a } : {}) });
      b.slot('title', 'text', 'title', { role: roleName, required: true });
    },
    /** The body-text alignment the Mood gives (type.align.body), as a box align object. */
    bodyAlign(extra = {}) {
      const h = mood.type?.align?.body;
      const a = { ...(h ? { h } : {}), ...extra };
      return Object.keys(a).length ? { align: a } : {};
    },
    finish({
      footer = footerFor(mood, def.kind),
      logo = logoFor(mood, def.kind),
      surface,
      tags = def.tags,
    } = {}) {
      // Logo reservation (engine places the actual logo at logo.position inside the safe area).
      let logoFrame = null;
      if (logo === 'large' || logo === 'small') {
        logoFrame = logoBox(mood, logo, surfaceIdFor(mood, def.kind));
        if (logoFrame) b.box('logo', logoFrame, { role: 'logo' });
      }
      // Footer band, shrunk away from a logo that sits in the same band.
      if (footerShown(mood, def.kind, footer)) {
        let f = footerBand(mood);
        if (logoFrame && overlaps(f, logoFrame)) {
          const g = space(mood, 'md');
          f =
            logoFrame.x + logoFrame.w / 2 < f.x + f.w / 2
              ? frame(right(logoFrame) + g, f.y, right(f) - right(logoFrame) - g, f.h)
              : frame(f.x, f.y, logoFrame.x - g - f.x, f.h);
        }
        const h = sideOf(mood.footer?.position);
        if (f.w > 0 && f.h > 0)
          b.box('footer', f, { role: 'footer', ...(h ? { align: { h, v: 'middle' } } : {}) });
      }
      // Margin bands are decor zones too (signal: geometry.margins), clipped to stay above the title.
      const m = mood.geometry?.margins ?? {};
      const t = titleBox(mood);
      b.zone(frame(0, 0, CANVAS.w, Math.min(m.top ?? 0, t.y)));
      b.zone(frame(CANVAS.w - (m.right ?? 0), 0, m.right ?? 0, CANVAS.h));
      b.zone(frame(0, 0, m.left ?? 0, CANVAS.h));
      // Zones are content-free: drop any that overlap a non-decor box.
      const solid = boxes.filter((x) => x.role !== 'decor').map((x) => x.frame);
      const free = zones.filter((z) => !solid.some((s) => overlaps(z, s))).map(round);
      const out = {
        schema: 'layout/1',
        id: def.id,
        kind: def.kind,
        name: def.name ?? def.id,
        version: def.version,
        tags: [...tags],
        footer,
        logo,
        decor: { allow: true, zones: free },
        boxes,
        slots,
      };
      if (surface) out.surface = surface;
      return out;
    },
  };
  return b;
}

export { bottom, right, frame, safe };

/**
 * The content/2 slide keys a layout shows (docs/S2-layouts.md §5): `summary.keys` {label, subtitle, number, cta,
 * background} of a content/2 slide (`summary.v2`), else {} - so no content/1 layout changes.
 */
export function slideKeys(summary) {
  return summary?.v2 && summary.keys ? summary.keys : {};
}

/** The eyebrow role a slide label takes: `eyebrow` when the Mood defines it, else null (the label is not shown). */
export const labelRole = (mood) => (role(mood, 'eyebrow') ? 'eyebrow' : null);

/** The role of a subtitle under a content-slide title (signal: type.roles bodyLarge, else h3 as the cover's subtitle). */
export const subtitleRole = (mood) => pickRole(mood, 'bodyLarge', 'h3');

/**
 * Lines a subtitle of `chars` characters takes at `roleName` across `w` px (the face's avgCharWidth, signal:
 * type.faces metrics), 1–2; unknown metrics → the two-line budget (LINES.heading).
 */
export function subtitleLines(mood, roleName, chars, w) {
  return Math.min(LINES.heading, estimateLines(mood, roleName, chars, w) ?? LINES.heading);
}

/**
 * Lines a text of `chars` characters takes at `roleName` across `w` px, from the face's avgCharWidth (signal:
 * type.faces metrics) with 15 % headroom (the average under-reads wide capitals / digits); null when unknown.
 */
export function estimateLines(mood, roleName, chars, w) {
  const r = role(mood, roleName);
  const avg = r ? mood?.type?.faces?.[r.face]?.metrics?.avgCharWidth : undefined;
  if (!r || !avg || !(chars > 0) || !(w > 0)) return null;
  return Math.max(1, Math.ceil((chars * avg * r.size * 1.15) / w));
}

/** The label box (eyebrow role, one line) at `y`; returns its height (0 when the Mood has no eyebrow role). */
export function labelBox(b, x, y, w) {
  const r = labelRole(b.mood);
  if (!r) return 0;
  const h = lineBox(b.mood, r, LINES.one);
  b.box('label', frame(x, y, w, h), { role: 'eyebrow', slot: 'label', ...b.bodyAlign({ v: 'bottom' }) });
  b.slot('label', 'text', 'label', { role: r });
  return h;
}

/**
 * The standard content-slide title: titleBox(mood) with the hint's role (else h1). Returns the title frame.
 * A content/2 slide's `label` puts an eyebrow line above the title and its `subtitle` a line or two under it (unless
 * the layout shows the subtitle itself: `{subtitle: false}`); the title zone grows by their height (`b.grow`,
 * `b.area()`).
 */
export function standardTitle(b, kind, { subtitle = true, role: titleRole } = {}) {
  const keys = slideKeys(b.summary);
  const t = titleBox(b.mood);
  const sm = space(b.mood, 'sm');
  let y = t.y;
  if (keys.label) {
    const h = labelBox(b, t.x, y, t.w);
    if (h) y += h + sm;
  }
  const f = frame(t.x, y, t.w, t.h);
  b.title(f, titleRole ?? titleRoleFor(b.mood, kind, 'h1'));
  y = bottom(f);
  if (keys.subtitle && subtitle) {
    const r = subtitleRole(b.mood);
    const h = lineBox(b.mood, r, subtitleLines(b.mood, r, Number(b.summary.subtitleChars) || 0, t.w));
    b.box('title-subtitle', frame(t.x, y + sm, t.w, h), {
      role: 'subtitle',
      slot: 'subtitle',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('subtitle', 'text', 'title-subtitle', { role: r });
    y += sm + h;
  }
  b.grow = y - bottom(t);
  return f;
}

/** Zone to the right of a text column narrowed by the measure (content-free by construction). */
export function sideZone(b, textFrame, area, gap) {
  const x = right(textFrame) + gap;
  b.zone(frame(x, area.y, right(area) - x, area.h));
}

/**
 * A flow box for repeated items (P2-spec §2): `flow: {direction, gap:'md', columns:n, itemLayout}` + its slot with
 * capacity {minItems:1, maxItems}. `columns` = n for rows / grids, 1 for a column flow.
 */
export function flowBox(b, { id, f, role, slotType, kind, n, itemLayout, direction = 'row', maxItems }) {
  b.box(id, f, {
    role,
    slot: id,
    flow: { direction, gap: 'md', columns: direction === 'column' ? 1 : n, itemLayout },
  });
  b.slot(id, slotType, id, { capacity: { minItems: 1, maxItems: maxItems ?? MAX_ITEMS[kind] } });
}

/** Item frames a flow box will hold (gap = spacing.md, the flow's gap token), for lines drawn across items. */
export function flowCells(f, n, gap, direction = 'row') {
  const out = [];
  if (direction === 'column') {
    const h = (f.h - gap * (n - 1)) / n;
    for (let i = 0; i < n; i += 1) out.push(frame(f.x, f.y + i * (h + gap), f.w, h));
  } else {
    const w = (f.w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i += 1) out.push(frame(f.x + i * (w + gap), f.y, w, f.h));
  }
  return out;
}

/**
 * The content/2 blocks a summary describes (`summary.blocks`: [{type, nodes, shape?, title?, ordered?, fields[],
 * icons[]}], set by the engine for content/2 slides only, `summary.v2`); [] for a content/1 slide, so no v1 layout
 * changes for content/1 decks.
 */
export function v2Blocks(summary) {
  return summary?.v2 && Array.isArray(summary.blocks) ? summary.blocks : [];
}

/** The first content/2 block of `type`, or null. */
export function v2Block(summary, type) {
  return v2Blocks(summary).find((x) => x.type === type) ?? null;
}

/** Node count of a summary block (0 when unknown). */
export const nodesOf = (block) => Number(block?.nodes) || 0;

/** Main blocks of a main + aside slide, most graphic first (PLAN-studio §3.2: the main slot). */
export const MAIN_ORDER = Object.freeze(['process', 'chart', 'table', 'image', 'items', 'kpis', 'points']);
/** Blocks that may sit in the aside slot (PLAN-studio §3.2). */
export const ASIDE_TYPES = Object.freeze(['points', 'items', 'paragraph', 'kpis']);

/**
 * A two-block content/2 slide split into {main, aside, asideFirst} (main = the block earliest in MAIN_ORDER, the
 * first one on a tie), or null when the slide is not one main + one aside block.
 */
export function mainAside(summary) {
  const blocks = v2Blocks(summary);
  if (blocks.length !== 2) return null;
  const rank = (x) => {
    const i = MAIN_ORDER.indexOf(x.type);
    return i < 0 ? Infinity : i;
  };
  const mi = rank(blocks[1]) < rank(blocks[0]) ? 1 : 0;
  const main = blocks[mi];
  const aside = blocks[1 - mi];
  if (!MAIN_ORDER.includes(main.type) || !ASIDE_TYPES.includes(aside.type)) return null;
  return { main, aside, asideFirst: mi === 1 };
}

/** Main blocks a three-block slide can take (PLAN-studio §3.2: the graphic mains; docs/S2-layouts.md §8). */
export const MAIN3_TYPES = Object.freeze(['process', 'chart', 'table', 'image']);

/**
 * A three-block content/2 slide split into {main, asides: [first, second] (in written order)}: the main is the block
 * earliest in MAIN_ORDER (a process, chart, table or image), the other two are aside blocks (points / items /
 * paragraph / kpis), not two paragraphs (one body box would take both). null otherwise.
 */
export function mainAsides(summary) {
  const blocks = v2Blocks(summary);
  if (blocks.length !== 3) return null;
  const rank = (x) => {
    const i = MAIN_ORDER.indexOf(x.type);
    return i < 0 ? Infinity : i;
  };
  let mi = 0;
  blocks.forEach((x, i) => {
    if (rank(x) < rank(blocks[mi])) mi = i;
  });
  const main = blocks[mi];
  const asides = blocks.filter((_, i) => i !== mi);
  if (!MAIN3_TYPES.includes(main.type) || !asides.every((a) => ASIDE_TYPES.includes(a.type))) return null;
  if (asides.every((a) => a.type === 'paragraph')) return null;
  return { main, asides };
}

/**
 * Item card fields for an `items` summary block (docs/S2-layouts.md §3): `item-card` is used when any item carries
 * an icon, an image or a label; a sequence number is drawn when no item's icon resolves to the brand set and the
 * brand's steps marker carries a number (components.steps.tokens.marker *-number). null → the v1 `card-title-text`.
 */
export function itemCardFields(mood, block, iconFileFn) {
  if (!block) return null;
  const f = new Set(block.fields ?? []);
  if (!f.has('icon') && !f.has('image') && !f.has('label')) return null;
  const icon = (block.icons ?? []).some((n) => iconFileFn(mood, n));
  const marker = String(mood?.components?.steps?.tokens?.marker ?? '');
  return {
    image: f.has('image'),
    icon,
    label: f.has('label'),
    number: !icon && marker.includes('number'),
  };
}
