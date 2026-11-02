/**
 * Process shapes (docs/PLAN-studio.md §3.1 / §3.2, docs/S2-layouts.md §2): the 12 treatments of a `process` block,
 * each an arrangement of plain geometry inside the layout's main frame - boxes, ellipses, lines and polygons only
 * (PPTX-safe; no art). `linear` is today's steps flow (the `step-number-title-text` item layout); the other 11 are
 * computed here and stamped by the engine.
 *
 * processShape(shape, {mood, frame, n, body, icon}) -> { shape, nodes, marks } in canvas px:
 * - nodes[i] = { frame, text, head?, body?, align, valign, paint } - the node's box, the inner frame its heading +
 *   body stack in (or `head` / `body` frames side by side), and the surface role it sits on: 'card' (the brand's card
 *   component: fill, border, radius, shadow), 'accent' (accent fill, the card's radius) or null (bare text);
 * - marks[] = connectors / outlines / bands: { id, kind: 'line', x1, y1, x2, y2, stroke, weight, arrow } |
 *   { id, kind: 'ellipse' | 'rect', frame, stroke?, fill?, weight } | { id, kind: 'polygon', frame, points, paint }.
 * Colours are token refs, never literals: connectors use the brand's divider (shape.divider.color / weight, else
 * `border` / shape.borderWidth) and, when the brand defines components.arrow with a head, its colour / stroke and an
 * arrowhead; outlines use `accent`; bands use the card component (paint 'card'). The one node a shape centres on (hub
 * centre, tree root, converge target, diverge source) takes `accent`. Fractions below (column splits, the funnel's
 * 35 % tip, the venn 30 % overlap) are layout design, not brand facts.
 */
import { LINES, bottom, frame, gutter, lineBox, pickRole, right, space, spans } from './geometry.js';
import { iconSize } from './icons.js';

/** Node-count range per shape (catalogue §2 / §6: diagram 2–8 nodes; quadrant / swot 4; venn 2–3). */
export const SHAPE_RANGES = Object.freeze({
  linear: Object.freeze({ min: 2, max: 8 }),
  cycle: Object.freeze({ min: 3, max: 8 }),
  funnel: Object.freeze({ min: 3, max: 6 }),
  pyramid: Object.freeze({ min: 3, max: 6 }),
  stack: Object.freeze({ min: 2, max: 6 }),
  hub: Object.freeze({ min: 3, max: 8 }),
  ladder: Object.freeze({ min: 2, max: 6 }),
  quadrant: Object.freeze({ min: 4, max: 4 }),
  venn: Object.freeze({ min: 2, max: 3 }),
  tree: Object.freeze({ min: 3, max: 8 }),
  converge: Object.freeze({ min: 3, max: 8 }),
  diverge: Object.freeze({ min: 3, max: 8 }),
});

export const SHAPES = Object.freeze(Object.keys(SHAPE_RANGES));

/** Whether `n` nodes can be drawn as `shape` (unknown shape → false). */
export function shapeFits(shape, n) {
  const r = SHAPE_RANGES[shape];
  return Boolean(r) && n >= r.min && n <= r.max;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Whether the brand draws a card background (components.card present and not the flat variant). */
export function cardDrawn(mood) {
  const c = mood?.components?.card;
  return Boolean(c) && c.variant !== 'flat';
}

/** Card padding when the card is drawn (components.card.tokens.padding, else spacing.md), else 0. */
export function cardPadding(mood) {
  if (!cardDrawn(mood)) return 0;
  const t = mood.components.card.tokens ?? {};
  return num(t.padding) ?? num(t['padding.0']) ?? space(mood, 'md');
}

/** The type roles a shape node uses: heading h3 (as steps), body the body role. */
export function nodeRoles(mood) {
  return { heading: pickRole(mood, 'h3', 'body'), body: pickRole(mood, 'body') };
}

/** Connector look: the brand's divider (colour, weight); components.arrow with a head adds an arrowhead. */
export function connector(mood) {
  const a = mood?.components?.arrow?.tokens;
  const weight = mood?.shape?.divider?.weight ?? mood?.shape?.borderWidth ?? 0;
  const stroke = mood?.shape?.divider?.color ?? 'border';
  if (a && a.head && a.head !== 'none') {
    return { stroke: a.color ?? stroke, weight: num(a.stroke) ?? weight, arrow: true };
  }
  return { stroke, weight, arrow: false };
}

/** Height a node's text needs: heading (2 lines) + body (2 lines: diagram body ≤ 60 chars) + icon, plus the card padding. */
export function nodeNeed(mood, { body = true, icon = false, bodyLines = 2 } = {}) {
  const r = nodeRoles(mood);
  const sm = space(mood, 'sm');
  let h = lineBox(mood, r.heading, LINES.heading);
  if (body) h += sm + lineBox(mood, r.body, bodyLines);
  if (icon) h += iconSize(mood, r.heading).room + sm;
  // a bare node (flat card) still gets spacing.md around it: the accent node is always painted
  return h + 2 * (cardPadding(mood) || space(mood, 'md'));
}

const inset = (f, p) => frame(f.x + p, f.y + p, f.w - 2 * p, f.h - 2 * p);
const centre = (f) => [f.x + f.w / 2, f.y + f.h / 2];
const hit = (a, b, g) =>
  a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;

/** The point where a ray from the centre of `f` towards (dx, dy) leaves `f`, pushed `extra` px further. */
function exitPoint(f, dx, dy, extra) {
  const [cx, cy] = centre(f);
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tx = ux ? f.w / 2 / Math.abs(ux) : Infinity;
  const ty = uy ? f.h / 2 / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty) + extra;
  return [cx + ux * t, cy + uy * t];
}

/** A line mark between two frames, clipped to their edges (spacing.sm clear); null when they touch. */
function link(id, a, b, look, gap, arrow = look.arrow) {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  const [x1, y1] = exitPoint(a, bx - ax, by - ay, gap);
  const [x2, y2] = exitPoint(b, ax - bx, ay - by, gap);
  // the clipped segment must still point from a to b
  if ((x2 - x1) * (bx - ax) + (y2 - y1) * (by - ay) <= 0) return null;
  return line(id, x1, y1, x2, y2, look, arrow);
}

function line(id, x1, y1, x2, y2, look, arrow = false) {
  return { id, kind: 'line', x1, y1, x2, y2, stroke: look.stroke, weight: look.weight, arrow };
}

/** A node: the box, the inner text frame (card padding when painted), alignment and paint. */
function node(f, mood, paint = 'card', extra = {}) {
  const p = paint ? cardPadding(mood) || (paint === 'accent' ? space(mood, 'md') : 0) : 0;
  return { frame: f, text: inset(f, p), align: 'left', valign: 'top', paint, ...extra };
}

/** Centres of `n` points on the ellipse inscribed in `area` (start at the top, clockwise). */
function ringCentres(area, n, bw, bh, start = -Math.PI / 2) {
  const [cx, cy] = centre(area);
  const rx = Math.max(0, (area.w - bw) / 2);
  const ry = Math.max(0, (area.h - bh) / 2);
  return Array.from({ length: n }, (_, i) => {
    const t = start + (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });
}

/**
 * The largest boxes (w0 × h0 scaled down: width 100 → 30 % in 2 % steps, height 100 → 50 % in 5 % steps, by area) that sit on a ring in `area`
 * without touching (gap g), with an optional box (hubScale × the ring box) in the centre. Two start angles are tried
 * (a node at the top, or the nodes turned half a step so none sits straight above / below the centre); the first of
 * equal areas wins, so the search is deterministic.
 */
function ringBoxes(area, n, w0, h0, g, { hubScale = 0 } = {}) {
  const starts = [-Math.PI / 2, -Math.PI / 2 + Math.PI / n];
  let best = null;
  let bestArea = -1;
  let last = null;
  for (const start of starts) {
    for (let hs = 1; hs >= 0.5 - 1e-9; hs -= 0.05) {
      for (let ws = 1; ws >= 0.3 - 1e-9; ws -= 0.02) {
        const bw = w0 * ws;
        const bh = h0 * hs;
        if (bw * bh <= bestArea) break;
        const boxes = ringCentres(area, n, bw, bh, start).map(([x, y]) =>
          frame(x - bw / 2, y - bh / 2, bw, bh),
        );
        if (hubScale) {
          const hw = bw * hubScale;
          const [cx, cy] = centre(area);
          boxes.unshift(frame(cx - hw / 2, cy - bh / 2, hw, bh));
        }
        last = boxes;
        let ok = true;
        for (let i = 0; i < boxes.length && ok; i += 1)
          for (let j = i + 1; j < boxes.length && ok; j += 1) if (hit(boxes[i], boxes[j], g)) ok = false;
        if (ok) {
          best = boxes;
          bestArea = bw * bh;
          break;
        }
      }
    }
  }
  return best ?? last;
}

/** Equal rows of `n` boxes stacked in `f` (gap g), each at most `maxH`, the block centred vertically. */
function rows(f, n, g, maxH) {
  const h = Math.max(0, Math.min(maxH, (f.h - g * (n - 1)) / n));
  const total = h * n + g * (n - 1);
  const y0 = f.y + (f.h - total) / 2;
  return Array.from({ length: n }, (_, i) => frame(f.x, y0 + i * (h + g), f.w, h));
}

const BUILDERS = {
  cycle(ctx) {
    const { F, n, g, need, mood, look } = ctx;
    const boxes = ringBoxes(F, n, (F.w - 2 * g) / 3, Math.min(need, F.h / 2), ctx.room);
    const nodes = boxes.map((f) => node(f, mood));
    const marks = [];
    for (let i = 0; i < n; i += 1) {
      const m = link(`link-${i}`, boxes[i], boxes[(i + 1) % n], look, ctx.sm);
      if (m) marks.push(m);
    }
    return { nodes, marks };
  },

  hub(ctx) {
    const { F, n, g, need, mood, look } = ctx;
    // the hub (node 0) in the middle third; the spokes in the outer thirds (first half left, the rest right), each
    // column's rows centred vertically; a spoke line from the hub to every spoke
    const [left, mid, rightCol] = spans(F, [4, 4, 4], ctx.room);
    const m = n - 1;
    const nl = Math.ceil(m / 2);
    const hubH = Math.min(need, F.h);
    const hub = frame(mid.x, F.y + (F.h - hubH) / 2, mid.w, hubH);
    const spokes = [...rows(left, nl, g, need), ...rows(rightCol, m - nl, g, need)];
    const nodes = [node(hub, mood, 'accent'), ...spokes.map((f) => node(f, mood))];
    // spoke lines fan out from the middle of the hub's side to the near side of each spoke (inside the gap column)
    const [hx, hy] = centre(hub);
    const marks = spokes.map((f, i) => {
      const [, sy] = centre(f);
      return f.x < hx
        ? line(`spoke-${i}`, hub.x - ctx.sm, hy, right(f) + ctx.sm, sy, look)
        : line(`spoke-${i}`, right(hub) + ctx.sm, hy, f.x - ctx.sm, sy, look);
    });
    return { nodes, marks };
  },

  tree(ctx) {
    const { F, n, g, need, mood, look } = ctx;
    const m = n - 1;
    const vgap = space(mood, 'xl') || 2 * space(mood, 'lg');
    const childW = (F.w - g * (m - 1)) / m;
    const rootW = Math.min(F.w, Math.max(childW, (F.w - 2 * g) / 3));
    const rootH = Math.min(need, (F.h - vgap) / 2);
    const childH = Math.min(need, F.h - rootH - vgap);
    const top = F.y + Math.max(0, (F.h - rootH - vgap - childH) / 2);
    const root = frame(F.x + (F.w - rootW) / 2, top, rootW, rootH);
    const cy = top + rootH + vgap;
    const kids = Array.from({ length: m }, (_, i) => frame(F.x + i * (childW + g), cy, childW, childH));
    const midY = bottom(root) + vgap / 2;
    const [rx] = centre(root);
    const marks = [line('trunk', rx, bottom(root) + ctx.sm, rx, midY, look)];
    const xs = kids.map((k) => centre(k)[0]);
    if (m > 1) marks.push(line('bar', Math.min(...xs), midY, Math.max(...xs), midY, look));
    kids.forEach((k, i) =>
      marks.push(line(`branch-${i}`, xs[i], midY, xs[i], k.y - ctx.sm, look, look.arrow)),
    );
    return { nodes: [node(root, mood, 'accent'), ...kids.map((k) => node(k, mood))], marks };
  },

  converge(ctx) {
    return flowInOut(ctx, 'in');
  },

  diverge(ctx) {
    return flowInOut(ctx, 'out');
  },

  quadrant(ctx) {
    const { F, mood, look } = ctx;
    const G = 2 * space(mood, 'lg');
    const w = (F.w - G) / 2;
    const h = (F.h - G) / 2;
    const boxes = [0, 1, 2, 3].map((i) =>
      frame(F.x + (i % 2) * (w + G), F.y + Math.floor(i / 2) * (h + G), w, h),
    );
    const cx = F.x + w + G / 2;
    const cy = F.y + h + G / 2;
    return {
      nodes: boxes.map((f) => node(f, mood)),
      marks: [line('axis-x', F.x, cy, right(F), cy, look), line('axis-y', cx, F.y, cx, bottom(F), look)],
    };
  },

  venn(ctx) {
    const { F, n, mood } = ctx;
    const overlap = 0.3;
    const D = Math.min(F.h, F.w / (n - (n - 1) * overlap));
    const R = D / 2;
    const step = D * (1 - overlap);
    const total = D + step * (n - 1);
    const x0 = F.x + (F.w - total) / 2;
    const cy = F.y + F.h / 2;
    const cxs = Array.from({ length: n }, (_, i) => x0 + R + i * step);
    const sm = ctx.sm;
    const weight = mood?.shape?.divider?.weight ?? mood?.shape?.borderWidth ?? 0;
    const marks = cxs.map((cx, i) => ({
      id: `circle-${i}`,
      kind: 'ellipse',
      frame: frame(cx - R, cy - R, D, D),
      stroke: 'accent',
      weight,
    }));
    const nodes = cxs.map((cx, i) => {
      const l = i === 0 ? cx - 0.75 * R : cxs[i - 1] + R + sm;
      const r = i === n - 1 ? cx + 0.75 * R : cxs[i + 1] - R - sm;
      const h = 1.2 * R;
      const f = frame(l, cy - h / 2, r - l, h);
      return { frame: f, text: f, align: 'center', valign: 'middle', paint: null };
    });
    return { nodes, marks };
  },

  funnel(ctx) {
    return bands(ctx, 'funnel');
  },

  pyramid(ctx) {
    return bands(ctx, 'pyramid');
  },

  stack(ctx) {
    const { F, n, mood } = ctx;
    const r = nodeRoles(mood);
    const p = cardPadding(mood);
    const rowNeed = 2 * p + Math.max(lineBox(mood, r.heading, LINES.heading), lineBox(mood, r.body, 3));
    const boxes = rows(F, n, ctx.sm, rowNeed * 1.5);
    const g = gutter(mood);
    const nodes = boxes.map((f) => {
      const inner = inset(f, p || space(mood, 'md'));
      const [head, body] = spans(inner, [4, 8], g);
      return { ...node(f, mood), head, body: ctx.body ? body : undefined, valign: 'middle' };
    });
    return { nodes, marks: [] };
  },

  ladder(ctx) {
    const { F, n, g, need, mood } = ctx;
    const w = (F.w - g * (n - 1)) / n;
    // narrow steps (five or more) wrap the body to a third line
    const hMin = Math.min(
      n >= 5 ? nodeNeed(mood, { body: ctx.body, icon: ctx.icon, bodyLines: 3 }) : need,
      F.h * 0.6,
    );
    const nodes = Array.from({ length: n }, (_, i) => {
      const h = n > 1 ? hMin + ((F.h - hMin) * i) / (n - 1) : F.h;
      return node(frame(F.x + i * (w + g), bottom(F) - h, w, h), mood);
    });
    return { nodes, marks: [] };
  },
};

/** converge (n − 1 inputs → the last node) / diverge (the first node → n − 1 outputs): 5 + 2 + 5 grid spans. */
function flowInOut(ctx, dir) {
  const { F, n, g, need, mood, look } = ctx;
  const [left, mid, rightCol] = spans(F, [5, 2, 5], g);
  const many = rows(dir === 'in' ? left : rightCol, n - 1, ctx.sm, need);
  const oneH = Math.min(F.h, need);
  const oneCol = dir === 'in' ? rightCol : left;
  const one = frame(oneCol.x, F.y + (F.h - oneH) / 2, oneCol.w, oneH);
  const xm = mid.x + mid.w / 2;
  const cys = many.map((f) => centre(f)[1]);
  const [, cy1] = centre(one);
  const sm = ctx.sm;
  const marks = [];
  if (dir === 'in') {
    many.forEach((f, i) => marks.push(line(`in-${i}`, right(f) + sm, cys[i], xm, cys[i], look)));
    marks.push(line('bus', xm, Math.min(...cys, cy1), xm, Math.max(...cys, cy1), look));
    marks.push(line('out', xm, cy1, one.x - sm, cy1, look, look.arrow));
    return { nodes: [...many.map((f) => node(f, mood)), node(one, mood, 'accent')], marks };
  }
  marks.push(line('in', right(one) + sm, cy1, xm, cy1, look));
  marks.push(line('bus', xm, Math.min(...cys, cy1), xm, Math.max(...cys, cy1), look));
  many.forEach((f, i) => marks.push(line(`out-${i}`, xm, cys[i], f.x - sm, cys[i], look, look.arrow)));
  return { nodes: [node(one, mood, 'accent'), ...many.map((f) => node(f, mood))], marks };
}

/**
 * funnel / pyramid: n bands (trapezoids, paint 'card') stacked in the left 5 of 12 columns, each node's heading +
 * body in the right 7 columns, vertically centred on its band. Funnel narrows downwards to a 35 % tip; pyramid widens
 * from a point.
 */
function bands(ctx, kind) {
  const { F, n, mood } = ctx;
  const [col, textCol] = spans(F, [5, 7], gutter(mood));
  const bh = (col.h - ctx.sm * (n - 1)) / n;
  const tip = 0.35;
  const width = (i) => (kind === 'funnel' ? col.w * (1 - ((1 - tip) * i) / n) : col.w * (i / n));
  const marks = [];
  const nodes = [];
  for (let i = 0; i < n; i += 1) {
    const y = col.y + i * (bh + ctx.sm);
    const top = width(i);
    const bot = width(i + 1);
    const lt = (col.w - top) / 2;
    const lb = (col.w - bot) / 2;
    marks.push({
      id: `band-${i}`,
      kind: 'polygon',
      frame: frame(col.x, y, col.w, bh),
      points: [
        [lt, 0],
        [lt + top, 0],
        [lb + bot, bh],
        [lb, bh],
      ],
      paint: 'card',
    });
    const f = frame(textCol.x, y, textCol.w, bh);
    nodes.push({ frame: f, text: f, align: 'left', valign: 'middle', paint: null });
  }
  return { nodes, marks };
}

/**
 * The arrangement of `n` nodes as `shape` inside `frame` (canvas px). `body` / `icon`: whether the nodes carry a body
 * / an icon (the room each node needs). Returns null for `linear` (the steps item flow draws it), an unknown shape or
 * a node count outside the shape's range (the caller falls back to linear and warns).
 */
export function processShape(shape, { mood, frame: F, n, body = true, icon = false } = {}) {
  if (shape === 'linear' || !BUILDERS[shape] || !shapeFits(shape, n)) return null;
  const ctx = {
    mood,
    F,
    n,
    body,
    icon,
    g: gutter(mood),
    sm: space(mood, 'sm'),
    // room between linked boxes: spacing.xl (else 2 × spacing.lg), so every connector stays visible
    room: Math.max(gutter(mood), space(mood, 'xl') || 2 * space(mood, 'lg')),
    need: nodeNeed(mood, { body, icon }),
    look: connector(mood),
  };
  const out = BUILDERS[shape](ctx);
  return { shape, nodes: out.nodes, marks: out.marks };
}
