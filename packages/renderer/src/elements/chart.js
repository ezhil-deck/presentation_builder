import { applyCase } from './lines.js';
import { cssColor, fontFamily, h, num, warn } from '../util.js';
import { elementProps } from './common.js';

/**
 * Chart element: inline SVG drawn ONLY from `chart.geometry` (the engine's layout, P2-spec §3.4) - the renderer
 * computes no layout. No geometry -> a grey outlined box with `data-warning="no geometry"`.
 *
 * Geometry shape supported (every key optional; all coordinates in px relative to the element frame's top-left):
 *
 *   geometry = {
 *     plot:   {x, y, w, h},                       // plot area; not painted (kept as data-plot for the editor)
 *     lines:  [{x1, y1, x2, y2, color, width, dash?: [..]}],   // gridlines / axis lines, as the engine placed them
 *     bars:   [{x, y, w, h, series, category?, color?, radius?}],
 *             // fill: bar.color ?? chart.series[series].color; corner radius: bar.radius ?? chart.style.barRadius
 *     points: [[{x, y, r?}, ...], ...],           // one array per series (index = series index)
 *             // line: polyline, stroke chart.series[i].color, width chart.style.lineWidth (flagged if absent)
 *             // area: same polyline closed down to the plot bottom (plot.y + plot.h) and filled with the colour
 *             // scatter: one circle per point of radius `r` (flagged if absent)
 *     arcs:   [{cx, cy, r, r0, a0, a1, color, series?, category?}],
 *             // pie / donut sectors: degrees, 0 = 12 o'clock, clockwise; r0 = inner radius (0 or absent = pie)
 *     ticks:  {x: [{pos, label, x?, y?}], y: [{pos, label, x?, y?}]},
 *             // label baseline at (x, y) with the axis' anchor when given; otherwise (renderer fallback)
 *             //  x ticks: centred on `pos`, hanging from plot bottom + 0.5 × font size;
 *             //  y ticks: right-aligned at plot.x − 0.5 × font size, vertically centred on `pos`
 *     labels: [{x, y, text, anchor?: 'start'|'middle'|'end', color?, size?, weight?}],   // baseline at y
 *     legend: [{x, y, text, color, size?, shape?, textX?, textY?}],
 *             // swatch: side `size ?? font.size`, top-left at (x, y), filled `color`; `shape` 'square' (default) |
 *             //  'circle' | 'line' (a bar of 1/4 side through the middle);
 *             // text: at (textX, textY) (baseline, the engine's placement) when given; otherwise (renderer
 *             //  fallback) left-aligned at x + 1.5 × side, vertically centred on the swatch
 *   }
 *
 * Text uses `chart.style.font` = {family, size, weight, color, letterSpacing?, case?} (literals; flagged if absent).
 */

const ANCHOR = {
  left: 'start',
  start: 'start',
  center: 'middle',
  middle: 'middle',
  right: 'end',
  end: 'end',
};

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** SVG path of a pie / donut sector (degrees, 0 = top, clockwise). */
export function arcPath({ cx, cy, r, r0 = 0, a0, a1 }) {
  const sweep = a1 - a0;
  if (sweep >= 360) {
    // Full ring: two half arcs (a single 360° arc collapses).
    const half = (rr, dir) =>
      `M${num(cx)},${num(cy - rr)} A${num(rr)},${num(rr)} 0 1 ${dir} ${num(cx)},${num(cy + rr)} A${num(rr)},${num(rr)} 0 1 ${dir} ${num(cx)},${num(cy - rr)} Z`;
    return r0 > 0 ? `${half(r, 1)} ${half(r0, 0)}` : half(r, 1);
  }
  const large = sweep > 180 ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, r, a0);
  const [ox1, oy1] = polar(cx, cy, r, a1);
  if (!(r0 > 0)) {
    return `M${num(cx)},${num(cy)} L${num(ox0)},${num(oy0)} A${num(r)},${num(r)} 0 ${large} 1 ${num(ox1)},${num(oy1)} Z`;
  }
  const [ix1, iy1] = polar(cx, cy, r0, a1);
  const [ix0, iy0] = polar(cx, cy, r0, a0);
  return (
    `M${num(ox0)},${num(oy0)} A${num(r)},${num(r)} 0 ${large} 1 ${num(ox1)},${num(oy1)} ` +
    `L${num(ix1)},${num(iy1)} A${num(r0)},${num(r0)} 0 ${large} 0 ${num(ix0)},${num(iy0)} Z`
  );
}

export function ChartElement(el, ctx, origin) {
  const chart = el.chart ?? {};
  const g = chart.geometry;
  const { w, h: hh } = el.frame;
  if (!g) {
    return h(
      'div',
      elementProps(el, origin, {
        extraStyle: { boxSizing: 'border-box', border: '1px dashed #9E9E9E' },
        warning: 'no geometry',
        attrs: { 'data-chart-type': chart.chartType },
      }),
    );
  }
  const warnings = [];
  const font = chart.style?.font ?? {};
  if (!chart.style?.font) warnings.push('no chart font');
  const series = chart.series ?? [];
  const seriesColor = (i) => cssColor(series[i]?.color);
  const textAttrs = (extra = {}) => {
    const a = {
      fontFamily: fontFamily(ctx, font.family),
      fontSize: font.size,
      fontWeight: font.weight,
      fill: cssColor(font.color),
    };
    if (font.letterSpacing) a.letterSpacing = `${num(font.letterSpacing)}em`;
    return { ...a, ...extra };
  };
  const label = (text) => applyCase(String(text ?? ''), font.case);
  const nodes = [];

  (g.lines ?? []).forEach((l, i) =>
    nodes.push(
      h('line', {
        key: `ln${i}`,
        className: 'pb-chart-line',
        x1: num(l.x1),
        y1: num(l.y1),
        x2: num(l.x2),
        y2: num(l.y2),
        stroke: cssColor(l.color),
        strokeWidth: num(l.width ?? 1),
        strokeDasharray: l.dash?.length ? l.dash.map(num).join(' ') : undefined,
      }),
    ),
  );

  (g.bars ?? []).forEach((b, i) => {
    const fill = cssColor(b.color) ?? seriesColor(b.series);
    if (!fill) warnings.push(`bar ${i} without colour`);
    const r = b.radius ?? chart.style?.barRadius;
    nodes.push(
      h('rect', {
        key: `b${i}`,
        className: 'pb-bar',
        'data-series': b.series,
        x: num(b.x),
        y: num(b.y),
        width: num(b.w),
        height: num(b.h),
        rx: r ? num(r) : undefined,
        fill,
      }),
    );
  });

  (g.points ?? []).forEach((pts, si) => {
    if (!Array.isArray(pts) || !pts.length) return;
    const color = seriesColor(si);
    if (!color) warnings.push(`series ${si} without colour`);
    if (chart.chartType === 'scatter') {
      pts.forEach((p, k) => {
        if (typeof p.r !== 'number') warnings.push(`scatter point ${si}.${k} without r`);
        nodes.push(
          h('circle', {
            key: `p${si}-${k}`,
            className: 'pb-point',
            cx: num(p.x),
            cy: num(p.y),
            r: num(p.r ?? 0),
            fill: color,
          }),
        );
      });
      return;
    }
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${num(p.x)},${num(p.y)}`).join(' ');
    if (chart.chartType === 'area') {
      if (!g.plot) warnings.push('area without plot');
      const bottom = g.plot ? g.plot.y + g.plot.h : pts[0].y;
      const area = `${d} L${num(pts[pts.length - 1].x)},${num(bottom)} L${num(pts[0].x)},${num(bottom)} Z`;
      const op = chart.style?.areaOpacity;
      nodes.push(
        h('path', {
          key: `a${si}`,
          className: 'pb-area',
          d: area,
          fill: color,
          fillOpacity: typeof op === 'number' ? num(op) : undefined,
        }),
      );
    }
    if (typeof chart.style?.lineWidth !== 'number') warnings.push('no lineWidth');
    nodes.push(
      h('path', {
        key: `s${si}`,
        className: 'pb-series',
        'data-series': si,
        d,
        fill: 'none',
        stroke: color,
        strokeWidth: chart.style?.lineWidth != null ? num(chart.style.lineWidth) : undefined,
        strokeLinejoin: 'round',
        strokeLinecap: 'round',
      }),
    );
  });

  (g.arcs ?? []).forEach((a, i) => {
    const fill = cssColor(a.color) ?? seriesColor(a.series ?? 0);
    nodes.push(h('path', { key: `arc${i}`, className: 'pb-arc', d: arcPath(a), fill, fillRule: 'evenodd' }));
  });

  const size = font.size ?? 0;
  const plot = g.plot;
  (g.ticks?.x ?? []).forEach((t, i) => {
    const given = typeof t.x === 'number' && typeof t.y === 'number';
    if (!given && !plot) return void warnings.push('x tick without position or plot');
    nodes.push(
      h(
        'text',
        textAttrs({
          key: `tx${i}`,
          className: 'pb-tick-x',
          x: num(given ? t.x : t.pos),
          y: num(given ? t.y : plot.y + plot.h + 0.5 * size),
          textAnchor: 'middle',
          dominantBaseline: given ? undefined : 'hanging',
        }),
        label(t.label),
      ),
    );
  });
  (g.ticks?.y ?? []).forEach((t, i) => {
    const given = typeof t.x === 'number' && typeof t.y === 'number';
    if (!given && !plot) return void warnings.push('y tick without position or plot');
    nodes.push(
      h(
        'text',
        textAttrs({
          key: `ty${i}`,
          className: 'pb-tick-y',
          x: num(given ? t.x : plot.x - 0.5 * size),
          y: num(given ? t.y : t.pos),
          textAnchor: 'end',
          dominantBaseline: given ? undefined : 'central',
        }),
        label(t.label),
      ),
    );
  });

  (g.labels ?? []).forEach((l, i) =>
    nodes.push(
      h(
        'text',
        textAttrs({
          key: `lb${i}`,
          className: 'pb-label',
          x: num(l.x),
          y: num(l.y),
          textAnchor: ANCHOR[l.anchor] ?? 'start',
          ...(l.color ? { fill: cssColor(l.color) } : {}),
          ...(l.size ? { fontSize: l.size } : {}),
          ...(l.weight ? { fontWeight: l.weight } : {}),
        }),
        label(l.text),
      ),
    ),
  );

  (g.legend ?? []).forEach((item, i) => {
    const side = item.size ?? size;
    const fill = cssColor(item.color);
    let swatch;
    if (item.shape === 'circle') {
      swatch = h('circle', {
        key: `lg${i}`,
        className: 'pb-legend-swatch',
        cx: num(item.x + side / 2),
        cy: num(item.y + side / 2),
        r: num(side / 2),
        fill,
      });
    } else {
      const line = item.shape === 'line';
      swatch = h('rect', {
        key: `lg${i}`,
        className: 'pb-legend-swatch',
        x: num(item.x),
        y: num(line ? item.y + (side * 3) / 8 : item.y),
        width: num(side),
        height: num(line ? side / 4 : side),
        fill,
      });
    }
    const placed = typeof item.textX === 'number' && typeof item.textY === 'number';
    nodes.push(
      swatch,
      h(
        'text',
        textAttrs({
          key: `lt${i}`,
          className: 'pb-legend-text',
          x: num(placed ? item.textX : item.x + 1.5 * side),
          y: num(placed ? item.textY : item.y + side / 2),
          dominantBaseline: placed ? undefined : 'central',
        }),
        label(item.text),
      ),
    );
  });

  const attrs = { 'data-chart-type': chart.chartType };
  if (plot) attrs['data-plot'] = [plot.x, plot.y, plot.w, plot.h].map(num).join(',');
  return h(
    'div',
    elementProps(el, origin, { warning: warn([...new Set(warnings)]), attrs }),
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: num(Math.max(w, 1)),
        height: num(Math.max(hh, 1)),
        style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },
      },
      ...nodes,
    ),
  );
}
