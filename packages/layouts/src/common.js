/**
 * Assembly helpers every kind module uses: a small builder that collects boxes / slots / decor zones and finishes the
 * Layout instance (schemas/layout.schema.json) with the logo box, the footer box and the margin decor zones.
 */
import {
  CANVAS,
  bottom,
  contentFrame,
  footerBand,
  footerShown,
  frame,
  hint,
  logoBox,
  overlaps,
  right,
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
    content: contentFrame(mood.geometry),
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

/** The standard content-slide title: titleBox(mood) with the hint's role (else h1). Returns the title frame. */
export function standardTitle(b, kind) {
  const f = titleBox(b.mood);
  b.title(f, titleRoleFor(b.mood, kind, 'h1'));
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
export function flowBox(b, { id, f, role, slotType, kind, n, itemLayout, direction = 'row' }) {
  b.box(id, f, {
    role,
    slot: id,
    flow: { direction, gap: 'md', columns: direction === 'column' ? 1 : n, itemLayout },
  });
  b.slot(id, slotType, id, { capacity: { minItems: 1, maxItems: MAX_ITEMS[kind] } });
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
