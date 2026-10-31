/**
 * Shared layout geometry. Every number here traces to the Mood (the comment names the signal); the only constants
 * are the canvas and the layout-design fractions P2-spec §2 names (column splits, the cover's lower half / right third).
 * A Mood value that is absent is never replaced by an invented number: the helper falls back only where §2 says how
 * (title zone → margins.top / h1 lines), else to "no extra space" (0), and the choice is listed in the package report.
 */

/** The canvas (P2-spec §2: the one hard-coded value). */
export const CANVAS = Object.freeze({ w: 1920, h: 1080 });

/**
 * Line-count budgets a box is sized for before the fitter runs (layout design, not brand facts):
 * a title is two lines (P2-spec §2 fallback: `2 × h1.size × h1.lineHeight`); headings / subtitles / labels use the same
 * two-line budget so a wrap does not force a step-down. The fitter decides the real line count.
 */
export const LINES = Object.freeze({ title: 2, heading: 2, label: 2, one: 1 });

const ZERO_EDGES = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export const frame = (x, y, w, h) => ({ x, y, w: Math.max(0, w), h: Math.max(0, h) });
export const inset = (f, e) =>
  frame(f.x + e.left, f.y + e.top, f.w - e.left - e.right, f.h - e.top - e.bottom);
export const bottom = (f) => f.y + f.h;
export const right = (f) => f.x + f.w;

/** Spacing token in px (signal: geometry.spacing[name]); absent → 0 (no space is invented). */
export function space(mood, name) {
  const v = mood?.geometry?.spacing?.[name];
  return typeof v === 'number' ? v : 0;
}

/** Column gutter (signal: geometry.grid.gutter, else geometry.spacing.lg). */
export function gutter(mood) {
  const g = mood?.geometry?.grid?.gutter;
  return typeof g === 'number' ? g : space(mood, 'lg');
}

/** A type role, or null when the Mood does not define it. */
export function role(mood, name) {
  return mood?.type?.roles?.[name] ?? null;
}

/** The first of `names` the Mood defines (a brand-given role name wins over the layout's own choice). */
export function pickRole(mood, ...names) {
  for (const n of names) if (n && role(mood, n)) return n;
  return names[names.length - 1];
}

/** Height of `lines` lines of a role (signal: type.roles[name].size × lineHeight); unknown role → 0. */
export function lineBox(mood, name, lines = 1) {
  const r = role(mood, name);
  return r ? lines * r.size * r.lineHeight : 0;
}

/**
 * Comfortable measure for a text role (signal: type.limits.maxCharsPerLine × the role face's avgCharWidth × size),
 * capped at `maxW`. Without the limit or the metrics the measure is the whole width (nothing is narrowed by guess).
 */
export function measure(mood, roleName, maxW) {
  const chars = mood?.type?.limits?.maxCharsPerLine;
  const r = role(mood, roleName);
  const avg = r ? mood?.type?.faces?.[r.face]?.metrics?.avgCharWidth : undefined;
  if (!chars || !r || !avg) return maxW;
  return Math.min(maxW, Math.ceil(chars * avg * r.size));
}

/** Content frame = canvas inset by geometry.margins (P2-spec §2). */
export function contentFrame(geometry) {
  return inset(frame(0, 0, CANVAS.w, CANVAS.h), geometry?.margins ?? ZERO_EDGES);
}

/** Safe area = canvas inset by geometry.safeArea; absent → the canvas itself (no inset is invented). */
export function safe(mood) {
  return inset(frame(0, 0, CANVAS.w, CANVAS.h), mood?.geometry?.safeArea ?? ZERO_EDGES);
}

/**
 * Title box (P2-spec §2): x = content.x, y = titleZone.y (else margins.top), w = content.w,
 * h = titleZone.height (else 2 × h1.size × h1.lineHeight, signal type.roles.h1).
 */
export function titleBox(mood) {
  const c = contentFrame(mood.geometry);
  const tz = mood.geometry?.titleZone ?? {};
  const y = typeof tz.y === 'number' ? tz.y : c.y;
  const h = typeof tz.height === 'number' ? tz.height : lineBox(mood, 'h1', LINES.title);
  return frame(c.x, y, c.w, h);
}

/** Body area: from title bottom + spacing.lg (P2-spec §2) to the content frame's bottom. */
export function bodyArea(mood) {
  const c = contentFrame(mood.geometry);
  const t = titleBox(mood);
  const y = bottom(t) + space(mood, 'lg');
  return frame(c.x, y, c.w, bottom(c) - y);
}

/** n equal columns across `f` (P2-spec §2: colW = (w − gutter×(n−1)) / n). */
export function columns(f, n, gap) {
  const count = Math.max(1, n);
  const w = (f.w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => frame(f.x + i * (w + gap), f.y, w, f.h));
}

/**
 * Grid-aligned spans: `parts` in grid columns (two-column 6+6, image-text 5+7 — P2-spec §2). Each span is
 * parts[i]/Σparts of (w + gutter) − gutter, so with Σparts = grid.columns the edges land on grid lines.
 */
export function spans(f, parts, gap) {
  const total = parts.reduce((a, b) => a + b, 0);
  const out = [];
  let x = f.x;
  for (const p of parts) {
    const w = (p / total) * (f.w + gap) - gap;
    out.push(frame(x, f.y, w, f.h));
    x += w + gap;
  }
  return out;
}

/** rows × cols cells across `f`, row-major, `gap` between cells. */
export function grid(f, rows, cols, gap) {
  const r = Math.max(1, rows);
  const k = Math.max(1, cols);
  const w = (f.w - gap * (k - 1)) / k;
  const h = (f.h - gap * (r - 1)) / r;
  const out = [];
  for (let i = 0; i < r; i += 1)
    for (let j = 0; j < k; j += 1) out.push(frame(f.x + j * (w + gap), f.y + i * (h + gap), w, h));
  return out;
}

/** Horizontal side of a position string like 'bottom-right' (signal: the Mood's position); none given → null. */
export function sideOf(position) {
  if (typeof position !== 'string') return null;
  if (position.includes('right')) return 'right';
  if (position.includes('center')) return 'center';
  if (position.includes('left')) return 'left';
  return null;
}

/**
 * Footer band (P2-spec §2): the bottom margin, y = 1080 − margins.bottom … 1080, clipped to the safe area so footer
 * text never leaves it; x / w = the content frame. Items align per mood.footer.position.
 */
export function footerBand(mood) {
  const c = contentFrame(mood.geometry);
  const s = safe(mood);
  const y = CANVAS.h - (mood.geometry?.margins?.bottom ?? 0);
  return frame(c.x, y, c.w, bottom(s) - y);
}

/** Which kinds hide the footer: the layout's own 'hide', mood.footer.show false, or mood.footer.hideOn. */
export function footerShown(mood, kind, layoutFooter) {
  if (layoutFooter === 'hide') return false;
  if (!mood.footer?.show) return false;
  return !(mood.footer.hideOn ?? []).includes(kind);
}

/** The layout hint the BrandSpec gives this kind (composition.layoutHints[kind]), or {}. */
export function hint(mood, kind) {
  return mood?.composition?.layoutHints?.[kind] ?? {};
}

/**
 * Logo box: at mood.logo.position inside the safe area, height = logo.height[size]; width = height × the aspect of the
 * variant this surface uses (logo.perSurface[surface] → logo.variants[v].width/height), else square. null when the Mood
 * gives no position or no height for that size (no reservation is invented; the engine still places the logo).
 */
export function logoBox(mood, size, surfaceId) {
  const pos = mood.logo?.position;
  if (!pos || size === 'none') return null;
  const s = safe(mood);
  const top = pos.startsWith('top');
  const h = mood.logo?.height?.[size];
  if (!(typeof h === 'number' && h > 0)) return null;
  const vid = (surfaceId && mood.logo?.perSurface?.[surfaceId]) || 'full';
  const v = mood.logo?.variants?.[vid] ?? mood.logo?.variants?.full;
  const w = Math.min(s.w, v?.width && v?.height ? (h * v.width) / v.height : h);
  const side = sideOf(pos) ?? 'left';
  const x = side === 'right' ? right(s) - w : side === 'center' ? s.x + (s.w - w) / 2 : s.x;
  const y = top ? s.y : bottom(s) - h;
  return frame(x, y, w, h);
}

export const overlaps = (a, b) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
export const contains = (outer, f, eps = 0.5) =>
  f.x >= outer.x - eps &&
  f.y >= outer.y - eps &&
  right(f) <= right(outer) + eps &&
  bottom(f) <= bottom(outer) + eps;

/** Round a frame to 0.01 px so instances are stable JSON. */
export const round = (f) => ({
  x: Math.round(f.x * 100) / 100,
  y: Math.round(f.y * 100) / 100,
  w: Math.round(f.w * 100) / 100,
  h: Math.round(f.h * 100) / 100,
});
