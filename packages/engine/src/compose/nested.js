/**
 * Nested KPIs (content/2 `kpis` with `nested: true`, S2.a slice 3; catalogue tam_sam_som_block): three shapes, largest
 * first, sharing their bottom edge and centred, at 100 / 70 / 42 % of the room (design ratios of the reference
 * TAM-SAM-SOM). Each ring shows its KPI's value (stat, else the largest of h1 / h2 / h3 in which every value fits its
 * band) and heading (the KPI label role) in the band its inner shape
 * leaves free (the innermost: centred inside it). Fills from the chart's sequential ramp (palette.chart.sequential:
 * lightest outside), else the categorical chart colours; text in the colour that reads on each fill. KPIs with a
 * body: each KPI's heading + body in the list column beside the rings, after a swatch of its ring's fill.
 */
import { parseInline } from '../content/inline.js';
import { measure } from '../fit/metrics.js';
import { r2 } from '../util/stable.js';

/** The size of each ring relative to the outermost. */
export const NESTED_RATIOS = Object.freeze([1, 0.7, 0.42]);

const rf = (f) => ({ x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) });

/** The three ring fills: the sequential ramp's lightest, middle and darkest, else chart.0–2. */
function ringFills(ctx) {
  const seq = ctx.mood.palette?.chart?.sequential ?? [];
  if (seq.length >= 3) return [0, 1, 2].map((k) => ctx.R.color(seq[Math.round((k * (seq.length - 1)) / 2)]));
  return [0, 1, 2].map((k) => ctx.R.color(`chart.${k}`));
}

export function nestedElements(binding, ctx, { textElement, textOn }) {
  const block = binding.blocks[0];
  const items = (block.items ?? []).slice(0, NESTED_RATIOS.length);
  const box = binding.box;
  const f = box.frame;
  const kind = box.flow?.nested === 'rect' ? 'rect' : 'ellipse';
  const id = `${ctx.slideId}-${binding.slot.id}`;
  const sm = ctx.R.spacing('sm');
  const md = ctx.R.spacing('md');
  const fills = ringFills(ctx);
  const radius = kind === 'rect' ? ctx.R.radius(ctx.mood.components?.card?.tokens?.radius) : undefined;
  const labelRole = ctx.mood.type?.roles?.[ctx.mood.components?.kpi?.tokens?.labelStyle]
    ? ctx.mood.components.kpi.tokens.labelStyle
    : 'statLabel';
  // outer shape: a circle as large as the room allows, or the room itself for rects
  const D = Math.min(f.w, f.h);
  const outer = kind === 'ellipse' ? { w: D, h: D } : { w: f.w, h: f.h };
  const bottomY = f.y + (f.h + outer.h) / 2;
  const cx = f.x + f.w / 2;
  const rings = NESTED_RATIOS.map((k) => {
    const w = outer.w * k;
    const h = outer.h * k;
    return { x: cx - w / 2, y: bottomY - h, w, h };
  });
  const out = [];
  rings.forEach((r, k) => {
    if (!items[k]) return;
    const style = {};
    if (fills[k]) style.fill = fills[k];
    if (radius) style.radius = radius;
    out.push({
      id: `${id}-${k}-ring`,
      type: 'shape',
      name: 'nested ring',
      frame: rf(r),
      z: 20,
      shape: { kind },
      style,
    });
  });
  const texts = [];
  rings.forEach((r, k) => {
    const it = items[k];
    if (!it) return;
    const next = rings[k + 1];
    // the band the inner ring leaves at the top (innermost: the middle of the shape), inset to the chord
    const band =
      next && items[k + 1]
        ? { x: r.x + r.w * 0.2, y: r.y + sm, w: r.w * 0.6, h: next.y - r.y - 2 * sm }
        : { x: r.x + r.w * 0.15, y: r.y + r.h * 0.2, w: r.w * 0.7, h: r.h * 0.6 };
    const color = fills[k] ? textOn(fills[k], ctx) : undefined;
    texts.push({ k, it, band, color });
  });
  // the value role: stat, else the first of h1 / h2 / h3 (largest first) in which every value fits its band on one
  // line (the stat role of most brands does not step down)
  const ladder = ['stat', 'h1', 'h2', 'h3']
    .map((r) => ctx.R.font(r) && r)
    .filter(Boolean)
    .sort((a, b) => ctx.R.font(b).size - ctx.R.font(a).size);
  const ladderFrom = ladder.indexOf('stat') >= 0 ? ladder.slice(ladder.indexOf('stat')) : ladder;
  const valueRole =
    ladderFrom.find((r) =>
      texts.every((t) => measure(String(t.it.value ?? ''), ctx.R.font(r)) <= t.band.w + 0.5),
    ) ??
    ladderFrom[ladderFrom.length - 1] ??
    'stat';
  // one shared size per part across the rings (values, headings)
  const parts = (t, sizes) => {
    const els = [];
    const applied = {};
    let y = t.band.y;
    const spec = [
      ['value', valueRole, t.it.value],
      ['label', labelRole, t.it.label ?? t.it.heading],
    ].filter(([, , v]) => v);
    spec.forEach(([key, role, value], i) => {
      const last = i === spec.length - 1;
      const el = textElement({
        id: `${id}-${t.k}-${key}`,
        frame: { x: t.band.x, y, w: t.band.w, h: Math.max(0, t.band.y + t.band.h - y) },
        role,
        paragraphs: [{ runs: parseInline(String(value)) }],
        align: 'center',
        valign: 'top',
        size: sizes?.[key],
        color: t.color,
        ctx,
      });
      if (!el) return;
      applied[key] = el.text.fit.appliedSize;
      if (!last) {
        el.frame.h = r2(el.text.fit.height);
        y += el.text.fit.height + sm / 2;
      } else el.frame.h = r2(Math.min(el.frame.h, el.text.fit.height));
      els.push(el);
    });
    // centre the stack in its band
    const used = els.length ? els[els.length - 1].frame.y + els[els.length - 1].frame.h - t.band.y : 0;
    const dy = Math.max(0, (t.band.h - used) / 2);
    for (const el of els) el.frame.y = r2(el.frame.y + dy);
    return { els, applied };
  };
  const shared = {};
  for (const t of texts)
    for (const [key, v] of Object.entries(parts(t).applied))
      shared[key] = Math.min(shared[key] ?? Infinity, v);
  for (const t of texts) out.push(...parts(t, shared).els);

  // the list column: a swatch of the ring's fill, the heading and the body of each KPI
  const list = box.flow?.list;
  if (list && items.some((it) => it.body)) {
    const head = ctx.R.font('h3');
    const sw = head ? head.size : md;
    const rowH = (list.h - md * (items.length - 1)) / items.length;
    items.forEach((it, k) => {
      const y = list.y + k * (rowH + md);
      if (fills[k])
        out.push({
          id: `${id}-${k}-swatch`,
          type: 'shape',
          name: 'nested swatch',
          frame: rf({ x: list.x, y: y + (head ? (head.size * head.lineHeight - sw) / 2 : 0), w: sw, h: sw }),
          z: 20,
          shape: { kind },
          style: { fill: fills[k] },
        });
      const tx = list.x + sw + md;
      const h3 = textElement({
        id: `${id}-${k}-heading`,
        frame: { x: tx, y, w: list.w - sw - md, h: head ? 2 * head.size * head.lineHeight : rowH / 3 },
        role: 'h3',
        paragraphs: [{ runs: parseInline(String(it.label ?? it.heading ?? '')) }],
        align: 'left',
        valign: 'top',
        ctx,
      });
      if (!h3) return;
      h3.frame.h = r2(h3.text.fit.height);
      out.push(h3);
      if (it.body) {
        const by = y + h3.frame.h + sm;
        const el = textElement({
          id: `${id}-${k}-body`,
          frame: { x: tx, y: by, w: list.w - sw - md, h: Math.max(0, y + rowH - by) },
          role: ctx.mood.type?.roles?.bodySmall ? 'bodySmall' : 'body',
          paragraphs: [{ runs: parseInline(it.body) }],
          align: 'left',
          valign: 'top',
          ctx,
        });
        if (el) out.push(el);
      }
    });
  }
  for (const el of out) {
    el.role ??= box.role ?? 'kpis';
    el.slot ??= binding.slot.id;
    el.layoutBox ??= box.id;
  }
  return out;
}
