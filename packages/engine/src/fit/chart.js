/**
 * Chart geometry (P2-spec §3.4): plot frame after axis / legend room measured with the chartLabel role, nice-rounded
 * ticks, bar rects, line points, arc angles, legend boxes, label positions. Every coordinate is relative to the chart
 * element's frame; label `y` values are baselines (same half-leading formula as text). PPTX-native and HTML charts
 * read this one geometry.
 */
import { deckFont } from '../compose/resolve.js';
import { r2 } from '../util/stable.js';
import { measure, ruleWidth } from './metrics.js';

export const CARTESIAN = new Set(['column', 'bar', 'stackedBar', 'line', 'area', 'scatter', 'waterfall']);
export const RADIAL = new Set(['pie', 'donut']);
/**
 * Chart forms drawn from plain boxes and shapes (S2.a slice 3): funnel (centred bars narrowing), waterfall (floating
 * bars + connectors), radar (polygons on an n-spoke grid), gauge (a half-ring arc + the value). The deck schema's
 * `chartType` enum (schemas/deck.schema.json) names the native types only, so each form reports the native type it
 * reads as (`chartType`) and its own name in `chart.form`; HTML paints the geometry either way.
 */
export const FORMS = Object.freeze({ funnel: 'bar', waterfall: 'column', radar: 'line', gauge: 'donut' });

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
  // content/2 chart text: legend labels (else the series names), axis titles
  const txt = block.text ?? {};
  const single = type === 'funnel' || type === 'gauge';
  if (single && series.length > 1) warn(`${type} chart shows the first series only (${series.length} given)`);

  // legend
  const legendCfg = mood.charts?.legend ?? {};
  const legendLabels = radial ? categories : series.map((s, i) => txt.legend?.[i] ?? s.name);
  const legendColors = radial ? colors.categories : colors.series;
  const wantLegend = !single && (radial || series.length > 1);
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
  const env = { font, size, m, L, baselineIn, centerBaseline, pad, gapMd, W, H, top, bottom, right, warn };
  if (type === 'funnel') return funnelLayout(block, geometry, env, colors, categories, mood);
  if (type === 'radar') return radarLayout(block, geometry, env, colors, categories, mood, R);
  if (type === 'gauge') return gaugeLayout(block, geometry, env, mood, R);
  for (const [k, t] of Object.entries({ xAxis: txt.xAxis, yAxis: txt.yAxis }))
    if (t && (radial || !CARTESIAN.has(type))) warn(`chart.text.${k} not drawn: a ${type} chart has no axes`);

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
  const waterfall = type === 'waterfall';
  const axesOn = mood.charts?.axes?.show !== false;
  // axis titles (content/2 chart.text): the y title one label line above the plot, the x title one line under the
  // category labels (chart label role)
  const axisTitles = [];
  if (axesOn && txt.yAxis) {
    axisTitles.push({ text: txt.yAxis, x: 0, y: baselineIn(top), anchor: 'start' });
    top += L + pad;
  }
  let xTitleTop = null;
  if (axesOn && txt.xAxis) {
    xTitleTop = bottom - L;
    bottom = xTitleTop - pad;
  }
  // waterfall: the first value is the starting level, each next one a change (a bar floating from the running total
  // before it to the total after it); a last value equal to the running total is the closing total (drawn from 0)
  const running = [];
  const levels = new Set();
  if (waterfall) {
    let c = 0;
    for (let k = 0; k < nCats; k += 1) {
      const v = Number(series[0]?.values[k]) || 0;
      if (k === 0 || (k === nCats - 1 && nCats > 2 && Math.abs(v - c) < 1e-9)) {
        running.push([0, v]);
        levels.add(k);
        c = v;
      } else {
        running.push([c, c + v]);
        c += v;
      }
    }
    if (series.length > 1) warn(`waterfall chart shows the first series only (${series.length} given)`);
  }
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < nCats; k += 1) {
    if (waterfall) {
      hi = Math.max(hi, ...running[k]);
      lo = Math.min(lo, ...running[k]);
    } else if (stacked) {
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
  if (waterfall) {
    // increases / decreases in the brand's delta colours (components.kpi.tokens deltaColors.up / down), else the
    // series colour; a highlighted category keeps its highlight colour
    const t = mood.components?.kpi?.tokens ?? {};
    const up = R.color(t['deltaColors.up']);
    const down = R.color(t['deltaColors.down']);
    const gapRatio = typeof mood.charts?.bar?.gap === 'number' ? mood.charts.bar.gap : 0;
    const barW = band * (1 - gapRatio);
    const bars = [];
    const connectors = [];
    for (let k = 0; k < nCats; k += 1) {
      const [from, to] = running[k];
      const v = to - from;
      const a = valuePos(Math.min(from, to));
      const b = valuePos(Math.max(from, to));
      const x0 = r2(plot.x + k * band + (band - barW) / 2);
      const y0 = r2(b);
      const delta = v >= 0 ? (up ?? colors.series[0]) : (down ?? colors.series[0]);
      const color = colors.categories?.[k] ?? (levels.has(k) ? colors.series[0] : delta);
      bars.push({
        series: 0,
        category: k,
        value: series[0]?.values[k] ?? 0,
        color,
        x: x0,
        y: y0,
        w: r2(r2(x0 + barW) - x0),
        h: r2(r2(a) - y0),
      });
      if (k < nCats - 1) {
        const y = r2(valuePos(to));
        connectors.push({
          x1: r2(x0 + barW),
          y1: y,
          x2: r2(plot.x + (k + 1) * band + (band - barW) / 2),
          y2: y,
        });
      }
    }
    geometry.bars = bars;
    geometry.connectors = connectors;
  } else if (type === 'column' || type === 'bar' || stacked) {
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
  if (xTitleTop !== null)
    axisTitles.push({ text: txt.xAxis, x: plot.x + plot.w / 2, y: baselineIn(xTitleTop), anchor: 'middle' });
  if (axisTitles.length) geometry.axisTitles = axisTitles.map((t) => ({ ...t, x: r2(t.x), y: r2(t.y) }));
  return geometry;
}

/** The colour of category k of a single-series chart (a highlight → highlight / others, else the series colour). */
const catColor = (colors, k) => colors.categories?.[k] ?? colors.series[0];

/**
 * Funnel: one centred bar per category, its width proportional to the value (the widest = the plot width), bands
 * of equal height with the brand's bar gap (charts.bar.gap); the category name right-aligned left of the plot and
 * the value after each bar.
 */
function funnelLayout(block, geometry, env, colors, categories, mood) {
  const { font, pad, top, bottom, right, centerBaseline } = env;
  const values = (block.series?.[0]?.values ?? []).map((v) => Math.max(0, Number(v) || 0));
  const n = values.length;
  const labelsW = categories.map((t) => measure(t, font));
  const valueText = values.map((v, k) => formatValue(block.series[0].values[k], block.unit));
  const valueW = valueText.map((t) => measure(t, font));
  const left = Math.max(0, ...labelsW) + pad;
  const rightRoom = Math.max(0, ...valueW) + pad;
  const plot = { x: left, y: top, w: Math.max(0, right - left - rightRoom), h: Math.max(0, bottom - top) };
  if (plot.w <= 0 || plot.h <= 0) env.warn('chart frame too small for the funnel and its labels');
  const max = Math.max(0, ...values) || 1;
  const band = plot.h / Math.max(1, n);
  const gapRatio = typeof mood.charts?.bar?.gap === 'number' ? mood.charts.bar.gap : 0;
  const barH = band * (1 - gapRatio);
  const bars = [];
  const labels = [];
  values.forEach((v, k) => {
    const w = (v / max) * plot.w;
    const x = plot.x + (plot.w - w) / 2;
    const y = plot.y + k * band + (band - barH) / 2;
    const x0 = r2(x);
    const y0 = r2(y);
    bars.push({
      series: 0,
      category: k,
      value: block.series[0].values[k],
      color: catColor(colors, k),
      x: x0,
      y: y0,
      w: r2(r2(x + w) - x0),
      h: r2(r2(y + barH) - y0),
    });
    const mid = centerBaseline(plot.y + (k + 0.5) * band);
    labels.push({
      text: categories[k] ?? '',
      x: r2(plot.x - pad - labelsW[k]),
      y: r2(mid),
      width: r2(labelsW[k]),
    });
    labels.push({ text: valueText[k], x: r2(x + w + pad), y: r2(mid), width: r2(valueW[k]) });
  });
  geometry.plot = { x: r2(plot.x), y: r2(plot.y), w: r2(plot.w), h: r2(plot.h) };
  geometry.bars = bars;
  geometry.formLabels = labels;
  return geometry;
}

/** Engine angle (degrees, 0 = 3 o'clock, clockwise) → point on a circle. */
const onCircle = (cx, cy, r, deg) => [
  cx + r * Math.cos((deg * Math.PI) / 180),
  cy + r * Math.sin((deg * Math.PI) / 180),
];

/**
 * Radar: n spokes (one per category, the first at 12 o'clock, clockwise), a grid polygon per tick of a nice scale
 * from 0, one polygon per series (its points on the spokes at value / scale max), the category labels outside the
 * spoke ends. Grid and spokes in the gridline colour (charts.gridlines.color, else border), series stroked in their
 * colour at charts.line.width and filled at charts.line.areaOpacity when > 0.
 */
function radarLayout(block, geometry, env, colors, categories, mood, R) {
  const { font, pad, top, bottom, right, L, centerBaseline } = env;
  const series = block.series ?? [];
  const n = categories.length;
  if (n < 3) env.warn(`radar chart needs at least 3 categories (has ${n})`);
  const hi = Math.max(0, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
  const scale = niceTicks(0, hi, 5);
  const labelW = categories.map((t) => measure(t, font));
  const roomX = Math.max(0, ...labelW) + pad;
  const roomY = L + pad;
  const plot = { x: 0, y: top, w: right, h: bottom - top };
  const radius = Math.max(0, Math.min(plot.w / 2 - roomX, plot.h / 2 - roomY));
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const angle = (k) => -90 + (k * 360) / Math.max(1, n);
  const grid = R.color(mood.charts?.gridlines?.color ?? 'border');
  const width = ruleWidth(mood);
  const lw = typeof mood.charts?.line?.width === 'number' ? mood.charts.line.width : width;
  const pt = ([x, y]) => [r2(x), r2(y)];
  const polygons = [];
  for (const t of scale.ticks) {
    if (t <= 0) continue;
    const r = (t / scale.max) * radius;
    polygons.push({
      kind: 'grid',
      points: categories.map((_, k) => pt(onCircle(cx, cy, r, angle(k)))),
      stroke: grid,
      width,
    });
  }
  const opacity = mood.charts?.line?.areaOpacity;
  series.forEach((s, i) => {
    const points = categories.map((_, k) =>
      pt(onCircle(cx, cy, ((Number(s.values[k]) || 0) / scale.max) * radius, angle(k))),
    );
    const poly = { kind: 'series', series: i, points, stroke: colors.series[i], width: lw };
    if (typeof opacity === 'number' && opacity > 0) {
      poly.fill = colors.series[i];
      poly.fillOpacity = opacity;
    }
    polygons.push(poly);
  });
  const spokes = categories.map((_, k) => {
    const [x, y] = onCircle(cx, cy, radius, angle(k));
    return { x1: r2(cx), y1: r2(cy), x2: r2(x), y2: r2(y), color: grid, width };
  });
  const labels = categories.map((t, k) => {
    const a = angle(k);
    const [x, y] = onCircle(cx, cy, radius + pad, a);
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    const lx = c > 0.15 ? x : c < -0.15 ? x - labelW[k] : x - labelW[k] / 2;
    const ly = s < -0.9 ? y - L / 2 : s > 0.9 ? y + L / 2 : y;
    return { text: t, x: r2(lx), y: r2(centerBaseline(ly)), width: r2(labelW[k]) };
  });
  geometry.plot = { x: r2(plot.x), y: r2(plot.y), w: r2(plot.w), h: r2(plot.h) };
  geometry.center = { x: r2(cx), y: r2(cy) };
  geometry.radius = r2(radius);
  geometry.scale = scale;
  geometry.polygons = polygons;
  geometry.spokes = spokes;
  geometry.formLabels = labels;
  return geometry;
}

/**
 * Gauge: values[0] on a half ring from 9 to 3 o'clock; the scale maximum is values[1], else 100 for a % unit, else
 * the nice ceiling of the value (info). The track in the chart's muted colour (palette.chart.muted, else border), the
 * value arc in the highlight colour (charts.highlight.highlight, else chart.0); ring thickness from
 * charts.donut.innerRadius (none → a filled half disc, info). `valueBox` = where the composer sets the value (stat
 * role): inside the ring, or under a filled half disc. The scale ends are labelled under the arc ends.
 */
function gaugeLayout(block, geometry, env, mood, R) {
  const { font, pad, top, bottom, right, L, baselineIn } = env;
  const vals = block.series?.[0]?.values ?? [];
  const value = Number(vals[0]) || 0;
  let max = Number(vals[1]);
  if (!(max > 0)) {
    max = block.unit === '%' ? 100 : niceTicks(0, Math.max(value, 1), 5).max;
    env.warn(`gauge has no scale maximum (values[1]): ${formatValue(max, block.unit)} used`);
  }
  const ir = mood.charts?.donut?.innerRadius;
  const ratio = typeof ir === 'number' ? (ir <= 1 ? ir : null) : null;
  if (typeof ir !== 'number')
    env.warn('charts.donut.innerRadius not given: gauge drawn as a filled half disc');
  const statRole = mood.type?.roles?.stat;
  const statL = statRole ? statRole.size * statRole.lineHeight : L;
  const below = (ratio ? 0 : statL + pad) + L + pad; // value (filled disc only) + the scale end labels
  const plot = { x: 0, y: top, w: right, h: bottom - top };
  const radius = Math.max(0, Math.min(plot.w / 2, plot.h - below));
  const inner = ratio ? radius * ratio : typeof ir === 'number' && ir > 1 ? Math.min(ir, radius) : 0;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + (plot.h - radius - below) / 2 + radius;
  const share = Math.max(0, Math.min(1, value / max));
  const track = R.color(mood.palette?.chart?.muted ? 'chartMuted' : 'border');
  const fill = R.color(mood.charts?.highlight?.highlight ?? 'chart.0') ?? R.color('chart.0');
  geometry.center = { x: r2(cx), y: r2(cy) };
  geometry.radius = r2(radius);
  geometry.innerRadius = r2(inner);
  // renderer angles: 0 = 12 o'clock, clockwise
  geometry.gaugeArcs = [
    { a0: -90, a1: 90, color: track, kind: 'track' },
    { a0: -90, a1: r2(-90 + 180 * share), color: fill, kind: 'value', value, max },
  ];
  const lo = formatValue(0, block.unit);
  const hiT = formatValue(max, block.unit);
  const ly = baselineIn(cy + (ratio ? pad : statL + pad * 2));
  geometry.formLabels = [
    {
      text: lo,
      x: r2(cx - radius + (radius - inner) / 2 - measure(lo, font) / 2),
      y: r2(ly),
      width: r2(measure(lo, font)),
    },
    {
      text: hiT,
      x: r2(cx + radius - (radius - inner) / 2 - measure(hiT, font) / 2),
      y: r2(ly),
      width: r2(measure(hiT, font)),
    },
  ];
  const vb = ratio
    ? {
        x: cx - inner * 0.8,
        y: cy - Math.min(statL, inner * 0.7),
        w: inner * 1.6,
        h: Math.min(statL, inner * 0.7),
      }
    : { x: cx - radius, y: cy + pad, w: 2 * radius, h: statL };
  geometry.valueBox = { x: r2(vb.x), y: r2(vb.y), w: r2(vb.w), h: r2(vb.h) };
  geometry.valueText = formatValue(value, block.unit);
  geometry.plot = { x: r2(cx - radius), y: r2(cy - radius), w: r2(2 * radius), h: r2(radius) };
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

  if (g.formLabels) {
    // the drawn forms (funnel, radar, gauge): their own marks + labels, no axes
    if (g.bars) out.bars = g.bars;
    if (g.polygons) out.polygons = g.polygons;
    if (g.spokes) out.lines = g.spokes;
    if (g.gaugeArcs) {
      out.arcs = g.gaugeArcs.map((a) => ({
        cx: g.center.x,
        cy: g.center.y,
        r: g.radius,
        r0: g.innerRadius,
        a0: a.a0,
        a1: a.a1,
        color: a.color,
        kind: a.kind,
      }));
      out.valueBox = g.valueBox;
      out.valueText = g.valueText;
    }
    if (g.scale) out.scale = g.scale;
    for (const l of g.formLabels) label(l.text, l.x, l.y);
    out.labels = labels;
    return out;
  }

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
  if (g.connectors?.length) {
    // waterfall connectors: from each bar's end level to the next bar (the axis line colour, else border)
    const color = R.color(c.axes?.lineColor ?? c.axes?.color ?? 'border');
    for (const l of g.connectors) lines.push({ ...l, color, width });
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
    for (const t of g.axisTitles ?? []) label(t.text, t.x, t.y, t.anchor);
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
  const form = FORMS[block.chartType];
  const chart = {
    chartType: form ?? block.chartType,
    series: (block.series ?? []).map((s, i) => ({
      name: block.text?.legend?.[i] ?? s.name,
      values: s.values,
      ...(colors.series[i] ? { color: colors.series[i] } : {}),
    })),
    style,
    geometry,
  };
  if (form) chart.form = block.chartType;
  if (block.categories) chart.categories = block.categories;
  if (block.unit !== undefined) chart.unit = block.unit;
  if (block.highlight !== undefined) chart.highlight = block.highlight;
  return chart;
}
