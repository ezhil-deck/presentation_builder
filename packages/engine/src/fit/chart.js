/**
 * Chart geometry (P2-spec §3.4): plot frame after axis / legend room measured with the chartLabel role, nice-rounded
 * ticks, bar rects, line points, arc angles, legend boxes, label positions. Every coordinate is relative to the chart
 * element's frame; label `y` values are baselines (same half-leading formula as text). PPTX-native and HTML charts
 * read this one geometry.
 */
import { deckFont } from '../compose/resolve.js';
import { r2 } from '../util/stable.js';
import { measure, ruleWidth } from './metrics.js';

export const CARTESIAN = new Set(['column', 'bar', 'stackedBar', 'line', 'area', 'scatter']);
export const RADIAL = new Set(['pie', 'donut']);

function niceNum(x, round) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}
const clean = (v) => Number(v.toFixed(10));

/** Nice-rounded scale covering [min, max] with about `maxTicks` ticks -> {min, max, step, ticks}. */
export function niceTicks(min, max, maxTicks = 5) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) hi = lo === 0 ? 1 : lo + Math.abs(lo);
  const range = niceNum(hi - lo, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const nmin = clean(Math.floor(lo / step) * step);
  const nmax = clean(Math.ceil(hi / step) * step);
  const ticks = [];
  for (let v = nmin; v <= nmax + step / 2; v += step) ticks.push(clean(v));
  return { min: nmin, max: nmax, step, ticks };
}

/** Number label with the block's unit: a one-character symbol is appended, a word follows a space. */
export function formatValue(v, unit) {
  const n = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  if (!unit) return n;
  return unit.length === 1 && !/[A-Za-z]/.test(unit) ? `${n}${unit}` : `${n} ${unit}`;
}

/** Colours per series (and per category for single-series highlight / pie / donut). */
export function chartColors(block, mood, R) {
  const series = block.series ?? [];
  const pal = (i) => R.color(`chart.${i}`);
  const hl = block.highlight;
  const hlColor = () => R.color(mood.charts?.highlight?.highlight ?? 'chartHighlight');
  const otherColor = () => R.color(mood.charts?.highlight?.others ?? 'chartMuted');
  const cats = block.categories?.length ?? Math.max(0, ...series.map((s) => s.values.length));
  if (RADIAL.has(block.chartType)) {
    return {
      series: series.map((_, i) => pal(i)),
      categories: Array.from({ length: cats }, (_, k) => pal(k)),
    };
  }
  if (Number.isInteger(hl) && series.length > 1) {
    return { series: series.map((_, i) => (i === hl ? hlColor() : otherColor())), categories: null };
  }
  if (Number.isInteger(hl) && series.length === 1) {
    return {
      series: [pal(0)],
      categories: Array.from({ length: cats }, (_, k) => (k === hl ? hlColor() : otherColor())),
    };
  }
  return { series: series.map((_, i) => pal(i)), categories: null };
}

function labelFont(mood, R) {
  return R.font('chartLabel') ?? R.font(mood.charts?.font ?? 'caption');
}

/**
 * chartLayout(block, frame, mood, R, {warnings}) -> the engine's own geometry (relative to frame):
 * { plot, orientation, scale, ticks[], categoryLabels[], bars[], lines[], arcs[], center, radius, innerRadius,
 *   legend: {position, items[]}, centerLabel, font }. layoutChart() turns it into the renderer's shape.
 */
export function chartLayout(block, frame, mood, R, opts = {}) {
  const warn = (message) => opts.warnings?.push({ check: 'chart', severity: 'warn', message });
  const font = labelFont(mood, R);
  if (!font) throw new Error('layoutChart(): the Mood has no chartLabel role');
  const size = font.size;
  const m = font.metrics;
  const L = font.lineHeight * size;
  const baselineIn = (top) => top + (L - (m.ascent - m.descent) * size) / 2 + m.ascent * size;
  const dataLabels = mood.charts?.dataLabels?.show === true;
  const centerBaseline = (cy) => cy + ((m.ascent + m.descent) / 2) * size;
  const pad = R.spacing('sm');
  const gapMd = R.spacing('md');
  const W = frame.w;
  const H = frame.h;
  const type = block.chartType;
  const series = block.series ?? [];
  const nCats = block.categories?.length ?? Math.max(0, ...series.map((s) => s.values.length));
  const categories = block.categories ?? Array.from({ length: nCats }, (_, k) => String(k + 1));
  const colors = chartColors(block, mood, R);
  const radial = RADIAL.has(type);

  // legend
  const legendCfg = mood.charts?.legend ?? {};
  const legendLabels = radial ? categories : series.map((s) => s.name);
  const legendColors = radial ? colors.categories : colors.series;
  const wantLegend = radial || series.length > 1;
  let position = legendCfg.position ?? 'top';
  if (legendCfg.position === undefined && wantLegend)
    warn('charts.legend.position not given: legend placed on top');
  if (!wantLegend || legendCfg.position === 'none' || legendCfg.show === false) position = 'none';
  const marker = Math.min(size, L) * 0.75;
  const markerShape =
    legendCfg.marker === 'square' ? 'square' : legendCfg.marker === 'line' ? 'line' : 'circle';
  const legendItems = [];
  let top = 0;
  let bottom = H;
  let right = W;
  if (position !== 'none') {
    const itemW = legendLabels.map((t) => marker + pad + measure(t, font));
    if (position === 'right') {
      const colW = Math.max(...itemW);
      const x0 = W - colW;
      legendLabels.forEach((t, k) => {
        const rowTop = k * L;
        legendItems.push({ label: t, color: legendColors[k], x0, rowTop, w: itemW[k] });
      });
      right = x0 - gapMd;
    } else {
      const rows = [[]];
      let x = 0;
      legendLabels.forEach((t, k) => {
        if (x > 0 && x + itemW[k] > W) {
          rows.push([]);
          x = 0;
        }
        rows[rows.length - 1].push({ label: t, color: legendColors[k], x0: x, w: itemW[k] });
        x += itemW[k] + gapMd;
      });
      const h = rows.length * L;
      const y0 = position === 'bottom' ? H - h : 0;
      rows.forEach((row, ri) => row.forEach((it) => legendItems.push({ ...it, rowTop: y0 + ri * L })));
      if (position === 'bottom') bottom = H - h - gapMd;
      else top = h + gapMd;
    }
  }
  const legend = {
    position,
    items: legendItems.map((it) => ({
      label: it.label,
      color: it.color,
      marker: {
        shape: markerShape,
        x: r2(it.x0),
        y: r2(it.rowTop + (L - marker) / 2),
        w: r2(marker),
        h: r2(marker),
      },
      text: { x: r2(it.x0 + marker + pad), y: r2(baselineIn(it.rowTop)), width: r2(measure(it.label, font)) },
    })),
  };

  const geometry = { legend, font: deckFont(font) };

  if (radial) {
    const values = (series[0]?.values ?? []).map((v) => Math.max(0, v));
    if (series.length > 1) warn(`${type} chart shows the first series only (${series.length} given)`);
    const total = values.reduce((a, b) => a + b, 0);
    const plot = { x: 0, y: top, w: right, h: bottom - top };
    const pieCfg = mood.charts?.pie ?? {};
    const outside = pieCfg.labels === 'outside' || mood.charts?.dataLabels?.show === true;
    const pctLabels = values.map((v) => formatValue(total ? Math.round((v / total) * 1000) / 10 : 0, '%'));
    const labelRoomX = outside ? Math.max(0, ...pctLabels.map((t) => measure(t, font))) + pad : 0;
    const labelRoomY = outside ? L + pad : 0;
    const radius = Math.max(0, Math.min(plot.w / 2 - labelRoomX, plot.h / 2 - labelRoomY));
    let inner = 0;
    if (type === 'donut') {
      const ir = mood.charts?.donut?.innerRadius;
      if (typeof ir === 'number') inner = ir <= 1 ? radius * ir : ir;
      else warn('charts.donut.innerRadius not given: donut drawn as a pie');
    }
    const start = typeof pieCfg.startAngle === 'number' ? pieCfg.startAngle : -90;
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    let a = start;
    geometry.arcs = values.map((v, k) => {
      const sweep = total ? (v / total) * 360 : 0;
      const arc = {
        category: categories[k],
        value: series[0].values[k],
        percent: total ? Math.round((v / total) * 1000) / 10 : 0,
        start: r2(a),
        end: r2(a + sweep),
        color: colors.categories[k],
      };
      if (outside) {
        const mid = ((a + sweep / 2) * Math.PI) / 180;
        const ax = cx + Math.cos(mid) * (radius + pad);
        const ay = cy + Math.sin(mid) * (radius + pad);
        const w = measure(pctLabels[k], font);
        arc.label = {
          text: pctLabels[k],
          x: r2(Math.cos(mid) >= 0 ? ax : ax - w),
          y: r2(centerBaseline(ay)),
          width: r2(w),
        };
      }
      a += sweep;
      return arc;
    });
    geometry.plot = { x: r2(plot.x), y: r2(plot.y), w: r2(plot.w), h: r2(plot.h) };
    geometry.center = { x: r2(cx), y: r2(cy) };
    geometry.radius = r2(radius);
    geometry.innerRadius = r2(inner);
    if (pieCfg.gap !== undefined) geometry.gap = pieCfg.gap;
    if (type === 'donut' && mood.charts?.donut?.centerLabel && series[0]?.name) {
      const w = measure(series[0].name, font);
      geometry.centerLabel = {
        text: series[0].name,
        x: r2(cx - w / 2),
        y: r2(centerBaseline(cy)),
        width: r2(w),
      };
    }
    return geometry;
  }

  // cartesian
  const horizontal = type === 'bar';
  const stacked = type === 'stackedBar';
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < nCats; k += 1) {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[k] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    } else {
      for (const s of series) {
        const v = s.values[k];
        if (typeof v === 'number') {
          hi = Math.max(hi, v);
          lo = Math.min(lo, v);
        }
      }
    }
  }
  const scale = niceTicks(lo, hi, 5);
  const tickLabels = scale.ticks.map((t) => formatValue(t, block.unit));
  const tickW = tickLabels.map((t) => measure(t, font));
  const catW = categories.map((t) => measure(t, font));
  const axesShow = mood.charts?.axes?.show !== false;

  let plot;
  // data labels sit outside the bars: one label line above the plot (vertical) / the widest label right of it
  const valueW = dataLabels
    ? Math.max(0, ...series.flatMap((s) => s.values.map((v) => measure(formatValue(v, block.unit), font))))
    : 0;
  if (horizontal) {
    const left = axesShow ? Math.max(0, ...catW) + pad : 0;
    const bottomRoom = axesShow ? L + pad : 0;
    const rightRoom = dataLabels ? valueW + pad : 0;
    plot = { x: left, y: top, w: right - left - rightRoom, h: bottom - top - bottomRoom };
  } else {
    const left = axesShow ? Math.max(0, ...tickW) + pad : 0;
    const bottomRoom = axesShow ? L + pad : 0;
    const topRoom = dataLabels ? L + pad : 0;
    plot = { x: left, y: top + topRoom, w: right - left, h: bottom - top - bottomRoom - topRoom };
  }
  if (plot.w <= 0 || plot.h <= 0) warn('chart frame too small for its axes and legend');
  const span = scale.max - scale.min || 1;
  const valuePos = (v) =>
    horizontal
      ? plot.x + ((v - scale.min) / span) * plot.w
      : plot.y + plot.h - ((v - scale.min) / span) * plot.h;
  const band = (horizontal ? plot.h : plot.w) / Math.max(1, nCats);

  geometry.orientation = horizontal ? 'horizontal' : 'vertical';
  geometry.scale = scale;
  geometry.ticks = scale.ticks.map((v, k) => {
    const p = valuePos(v);
    if (horizontal) {
      return {
        value: v,
        label: tickLabels[k],
        x: r2(p),
        labelX: r2(p - tickW[k] / 2),
        labelY: r2(baselineIn(plot.y + plot.h + pad)),
        labelWidth: r2(tickW[k]),
      };
    }
    return {
      value: v,
      label: tickLabels[k],
      y: r2(p),
      labelX: r2(plot.x - pad - tickW[k]),
      labelY: r2(centerBaseline(p)),
      labelWidth: r2(tickW[k]),
    };
  });
  geometry.categoryLabels = categories.map((t, k) => {
    const c = (k + 0.5) * band;
    if (horizontal)
      return {
        text: t,
        x: r2(plot.x - pad - catW[k]),
        y: r2(centerBaseline(plot.y + c)),
        width: r2(catW[k]),
      };
    if (catW[k] > band) warn(`category label "${t}" is wider than its ${r2(band)}px band`);
    return {
      text: t,
      x: r2(plot.x + c - catW[k] / 2),
      y: r2(baselineIn(plot.y + plot.h + pad)),
      width: r2(catW[k]),
    };
  });

  const colorOf = (i, k) => colors.categories?.[k] ?? colors.series[i];
  if (type === 'column' || type === 'bar' || stacked) {
    const gapRatio = typeof mood.charts?.bar?.gap === 'number' ? mood.charts.bar.gap : 0;
    const groupW = band * (1 - gapRatio);
    const barW = stacked ? groupW : groupW / Math.max(1, series.length);
    const bars = [];
    for (let k = 0; k < nCats; k += 1) {
      let pos = 0;
      let neg = 0;
      series.forEach((s, i) => {
        const v = s.values[k];
        if (typeof v !== 'number') return;
        let from;
        let to;
        if (stacked) {
          from = v >= 0 ? pos : neg;
          to = from + v;
          if (v >= 0) pos = to;
          else neg = to;
        } else {
          from = 0;
          to = v;
        }
        const a = valuePos(Math.min(from, to));
        const b = valuePos(Math.max(from, to));
        const off = k * band + (band - groupW) / 2 + (stacked ? 0 : i * barW);
        const rect = horizontal
          ? { x: a, y: plot.y + off, w: b - a, h: barW }
          : { x: plot.x + off, y: b, w: barW, h: a - b };
        const x0 = r2(rect.x);
        const y0 = r2(rect.y);
        // round the edges, then derive the size, so a bar never pokes out of the plot by a rounding step
        bars.push({
          series: i,
          category: k,
          value: v,
          color: colorOf(i, k),
          x: x0,
          y: y0,
          w: r2(r2(rect.x + rect.w) - x0),
          h: r2(r2(rect.y + rect.h) - y0),
        });
      });
    }
    geometry.bars = bars;
  } else {
    const base = valuePos(Math.max(scale.min, Math.min(0, scale.max)));
    geometry.lines = series.map((s, i) => {
      const points = s.values.map((v, k) => ({
        x: r2(plot.x + (k + 0.5) * band),
        y: r2(valuePos(v)),
        value: v,
      }));
      const path = points.map((p, k) => `${k ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
      const line = { series: i, color: colors.series[i], points, path };
      if (type === 'area' && points.length) {
        line.areaPath = `${path} L${points[points.length - 1].x} ${r2(base)} L${points[0].x} ${r2(base)} Z`;
      }
      return line;
    });
  }
  geometry.plot = {
    x: r2(plot.x),
    y: r2(plot.y),
    w: r2(r2(plot.x + plot.w) - r2(plot.x)),
    h: r2(r2(plot.y + plot.h) - r2(plot.y)),
  };
  return geometry;
}

const DASH = { dashed: 4, dotted: 1 };

/**
 * layoutChart(block, frame, mood, R, {warnings}) -> chart.geometry in the renderer's documented shape
 * (packages/renderer/src/elements/chart.js; P2-spec §7 F8), every coordinate relative to the chart frame:
 * { plot, orientation?, scale?, lines[] (gridlines + axis line), bars[], points[][] (line / area series), arcs[]
 *   (degrees, 0 = 12 o'clock, clockwise), ticks: {x[], y[]} (label baseline x / y + anchor), labels[] (category,
 *   data, pie and centre labels: baseline x / y + anchor), legend[] ({x, y, size, shape, color, text, textX, textY}) }.
 * Gridlines: charts.gridlines.show (colour gridlines.color, dashed / dotted → a dash of 4 / 1 × the width); axis line:
 * charts.axes.line (colour axes.lineColor, else axes.color); widths ruleWidth (shape.divider.weight, else borderWidth, else 1). Label colour (the chart
 * font's colour): charts.axes.labelColor, else the chart label role's colour on the surface.
 */
export function layoutChart(block, frame, mood, R, opts = {}) {
  const g = chartLayout(block, frame, mood, R, opts);
  const c = mood.charts ?? {};
  const out = { plot: g.plot, font: g.font };
  const labelColor = c.axes?.labelColor ? R.color(c.axes.labelColor) : undefined;
  if (labelColor) out.font = { ...out.font, color: labelColor };
  const labels = [];
  const label = (text, x, y, anchor = 'start') => labels.push({ text, x: r2(x), y: r2(y), anchor });
  const width = ruleWidth(mood);

  out.legend = (g.legend?.items ?? []).map((it) => ({
    text: it.label,
    color: it.color,
    shape: it.marker.shape,
    x: it.marker.x,
    y: it.marker.y,
    size: it.marker.w,
    textX: it.text.x,
    textY: it.text.y,
  }));

  if (g.arcs) {
    out.arcs = g.arcs.map((a) => ({
      cx: g.center.x,
      cy: g.center.y,
      r: g.radius,
      r0: g.innerRadius,
      // engine angles: 0 = 3 o'clock, clockwise (screen y down); renderer: 0 = 12 o'clock, clockwise
      a0: r2(a.start + 90),
      a1: r2(a.end + 90),
      color: a.color,
      category: a.category,
      value: a.value,
      percent: a.percent,
    }));
    for (const a of g.arcs) if (a.label) label(a.label.text, a.label.x, a.label.y);
    if (g.centerLabel) label(g.centerLabel.text, g.centerLabel.x, g.centerLabel.y);
    out.labels = labels;
    return out;
  }

  out.orientation = g.orientation;
  out.scale = g.scale;
  const horizontal = g.orientation === 'horizontal';
  const p = g.plot;
  const lines = [];
  const grid = c.gridlines;
  if (grid?.show === true) {
    const color = R.color(grid.color ?? 'border');
    const dash = DASH[grid.style] ? [DASH[grid.style] * width, DASH[grid.style] * width] : undefined;
    for (const t of g.ticks) {
      if (horizontal) lines.push({ x1: t.x, y1: p.y, x2: t.x, y2: r2(p.y + p.h), color, width, dash });
      else lines.push({ x1: p.x, y1: t.y, x2: r2(p.x + p.w), y2: t.y, color, width, dash });
    }
  }
  if (c.axes?.line === true && c.axes?.show !== false) {
    const color = R.color(c.axes.lineColor ?? c.axes.color ?? 'border');
    const zero = g.ticks.find((t) => t.value === 0) ?? g.ticks[0];
    if (horizontal) lines.push({ x1: zero.x, y1: p.y, x2: zero.x, y2: r2(p.y + p.h), color, width });
    else lines.push({ x1: p.x, y1: zero.y, x2: r2(p.x + p.w), y2: zero.y, color, width });
  }
  out.lines = lines.map((l) => {
    if (l.dash) return l;
    const solid = { ...l };
    delete solid.dash;
    return solid;
  });

  const axesShow = c.axes?.show !== false;
  out.ticks = { x: [], y: [] };
  if (axesShow) {
    for (const t of g.ticks) {
      if (horizontal) {
        out.ticks.x.push({
          pos: t.x,
          label: t.label,
          x: r2(t.labelX + t.labelWidth / 2),
          y: t.labelY,
          value: t.value,
        });
      } else {
        out.ticks.y.push({
          pos: t.y,
          label: t.label,
          x: r2(t.labelX + t.labelWidth),
          y: t.labelY,
          value: t.value,
        });
      }
    }
    for (const l of g.categoryLabels) label(l.text, l.x, l.y);
  }
  if (g.bars) out.bars = g.bars;
  if (g.lines) out.points = g.lines.map((ln) => ln.points);
  if (c.dataLabels?.show === true) {
    // value labels outside the marks (charts.dataLabels.show): centred above a column / point, after a bar
    const f = labelFont(mood, R);
    const m = f.metrics;
    const gap = R.spacing('sm') / 2;
    const above = (y) => y - gap + m.descent * f.size;
    const middle = (y) => y + ((m.ascent + m.descent) / 2) * f.size;
    for (const b of g.bars ?? []) {
      const text = formatValue(b.value, block.unit);
      const w = measure(text, f);
      if (horizontal) label(text, b.x + b.w + gap, middle(b.y + b.h / 2));
      else label(text, b.x + b.w / 2 - w / 2, above(b.y));
    }
    for (const pts of out.points ?? []) {
      for (const pt of pts) {
        const text = formatValue(pt.value, block.unit);
        label(text, pt.x - measure(text, f) / 2, above(pt.y));
      }
    }
  }
  out.labels = labels;
  return out;
}

/** The deck `chart` object: data + series colours + resolved style + geometry. */
export function chartElement(block, frame, mood, R, opts = {}) {
  const geometry = layoutChart(block, frame, mood, R, opts);
  const colors = chartColors(block, mood, R);
  const c = mood.charts ?? {};
  const style = { font: geometry.font };
  delete geometry.font;
  if (c.gridlines)
    style.gridlines = { ...c.gridlines, ...(c.gridlines.color ? { color: R.color(c.gridlines.color) } : {}) };
  if (c.axes) style.axes = { ...c.axes, ...(c.axes.color ? { color: R.color(c.axes.color) } : {}) };
  if (c.dataLabels) style.dataLabels = { ...c.dataLabels };
  if (c.legend) style.legend = { ...c.legend };
  if (typeof c.bar?.radius === 'number') style.barRadius = c.bar.radius;
  if (typeof c.bar?.gap === 'number') style.barGap = c.bar.gap;
  if (typeof c.line?.width === 'number') style.lineWidth = c.line.width;
  if (c.line?.smooth !== undefined) style.smooth = c.line.smooth;
  if (c.line?.areaOpacity !== undefined) style.areaOpacity = c.line.areaOpacity;
  const chart = {
    chartType: block.chartType,
    series: (block.series ?? []).map((s, i) => ({
      name: s.name,
      values: s.values,
      ...(colors.series[i] ? { color: colors.series[i] } : {}),
    })),
    style,
    geometry,
  };
  if (block.categories) chart.categories = block.categories;
  if (block.unit !== undefined) chart.unit = block.unit;
  if (block.highlight !== undefined) chart.highlight = block.highlight;
  return chart;
}
