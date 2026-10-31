import {
  chartLayout,
  layoutChart,
  layoutTable,
  measure,
  niceTicks,
  proportionalWidths,
  resolve,
} from '../src/index.js';
import { stripeMood } from './helpers.js';

const mood = stripeMood();
const page = mood.palette.surfaces.find((s) => s.id === 'page');
const R = resolve(mood, page);
const frame = { x: 138, y: 232, w: 1644, h: 768 };
const eps = 0.01;
const inside = (r, p) =>
  r.x >= p.x - eps && r.y >= p.y - eps && r.x + r.w <= p.x + p.w + eps && r.y + r.h <= p.y + p.h + eps;

describe('niceTicks', () => {
  it('nice-rounds the scale', () => {
    expect(niceTicks(0, 41)).toEqual({ min: 0, max: 50, step: 10, ticks: [0, 10, 20, 30, 40, 50] });
    expect(niceTicks(0, 379)).toMatchObject({ max: 400, step: 100 });
    const neg = niceTicks(-3, 7).ticks;
    expect(neg).toContain(0);
    expect([...neg].sort((a, b) => a - b)).toEqual(neg);
  });
});

describe('chartLayout (the engine geometry)', () => {
  const column = {
    type: 'chart',
    chartType: 'column',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Conversions', values: [12, 19, 27, 41] },
      { name: 'Edits', values: [4, 7, 9, 12] },
    ],
    highlight: 0,
  };
  it('column: bars inside the plot, ticks ascending, highlight colours, legend on top', () => {
    const g = chartLayout(column, frame, mood, R);
    expect(g.plot.w).toBeGreaterThan(0);
    expect(g.bars).toHaveLength(8);
    for (const b of g.bars) expect(inside(b, g.plot)).toBe(true);
    const values = g.ticks.map((t) => t.value);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    const ys = g.ticks.map((t) => t.y);
    expect([...ys].sort((a, b) => b - a)).toEqual(ys); // higher value, higher on the slide
    expect(g.bars.filter((b) => b.series === 0).every((b) => b.color === '#533AFD')).toBe(true);
    expect(g.bars.filter((b) => b.series === 1).every((b) => b.color === '#E5EDF5')).toBe(true);
    expect(g.legend.position).toBe('top');
    expect(g.legend.items.map((i) => i.label)).toEqual(['Conversions', 'Edits']);
    expect(g.plot.y).toBeGreaterThan(g.legend.items[0].marker.y + g.legend.items[0].marker.h);
    // taller value -> taller bar
    const s0 = g.bars.filter((b) => b.series === 0).map((b) => b.h);
    expect([...s0].sort((a, b) => a - b)).toEqual(s0);
    expect(g.categoryLabels.map((l) => l.text)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
  it('bar: horizontal bars inside the plot, from the zero line', () => {
    const g = chartLayout({ ...column, chartType: 'bar' }, frame, mood, R);
    expect(g.orientation).toBe('horizontal');
    for (const b of g.bars) {
      expect(inside(b, g.plot)).toBe(true);
      expect(b.x).toBeCloseTo(g.plot.x, 1);
    }
    expect(g.ticks.map((t) => t.x)).toEqual([...g.ticks.map((t) => t.x)].sort((a, b) => a - b));
  });
  it('stackedBar: segments stack without gaps and stay inside the plot', () => {
    const g = chartLayout({ ...column, chartType: 'stackedBar', highlight: undefined }, frame, mood, R);
    for (const b of g.bars) expect(inside(b, g.plot)).toBe(true);
    const q1 = g.bars.filter((b) => b.category === 0);
    expect(q1[1].y + q1[1].h).toBeCloseTo(q1[0].y, 1);
  });
  it('line / area: points inside the plot, area closes to the baseline', () => {
    const block = {
      type: 'chart',
      chartType: 'area',
      categories: ['a', 'b', 'c'],
      series: [{ name: 's', values: [3, 9, 5] }],
    };
    const g = chartLayout(block, frame, mood, R);
    const p = g.plot;
    for (const pt of g.lines[0].points) {
      expect(pt.x).toBeGreaterThanOrEqual(p.x);
      expect(pt.x).toBeLessThanOrEqual(p.x + p.w);
      expect(pt.y).toBeGreaterThanOrEqual(p.y - eps);
      expect(pt.y).toBeLessThanOrEqual(p.y + p.h + eps);
    }
    expect(g.lines[0].areaPath).toMatch(/Z$/);
    expect(g.legend.position).toBe('none'); // one series: no legend
  });
  it('donut: contiguous arcs from startAngle, inner radius from charts.donut', () => {
    const block = {
      type: 'chart',
      chartType: 'donut',
      categories: ['A', 'B', 'C'],
      series: [{ name: 'S', values: [82, 10, 8] }],
    };
    const g = chartLayout(block, frame, mood, R);
    expect(g.arcs[0].start).toBe(-90);
    expect(g.arcs[2].end).toBe(270);
    for (let k = 1; k < g.arcs.length; k += 1) expect(g.arcs[k].start).toBe(g.arcs[k - 1].end);
    expect(g.innerRadius).toBeCloseTo(g.radius * 0.65, 1);
    expect(g.legend.items).toHaveLength(3);
    expect(g.arcs.map((a) => a.color)).toEqual(['#7F7DFC', '#533AFD', '#F44BCC']);
    expect(g.radius).toBeLessThanOrEqual(Math.min(g.plot.w, g.plot.h) / 2);
    expect(chartLayout({ ...block, chartType: 'pie' }, frame, mood, R).innerRadius).toBe(0);
  });
});

describe('layoutChart (the renderer geometry, F8)', () => {
  const column = {
    type: 'chart',
    chartType: 'column',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'Conversions', values: [12, 19, 27, 41] },
      { name: 'Edits', values: [4, 7, 9, 12] },
    ],
    highlight: 0,
  };
  it('column: bars, y ticks with label positions (right-anchored), category labels, legend swatches', () => {
    const g = layoutChart(column, frame, mood, R);
    const internal = chartLayout(column, frame, mood, R);
    expect(g.bars).toEqual(internal.bars);
    expect(g.ticks.x).toEqual([]);
    expect(g.ticks.y.map((t) => t.label)).toEqual(internal.ticks.map((t) => t.label));
    for (const [k, t] of g.ticks.y.entries()) {
      expect(t.pos).toBe(internal.ticks[k].y);
      expect(t.x).toBeCloseTo(internal.ticks[k].labelX + internal.ticks[k].labelWidth, 1);
    }
    expect(g.labels.map((l) => l.text)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(g.legend.map((l) => [l.text, l.shape])).toEqual([
      ['Conversions', 'circle'],
      ['Edits', 'circle'],
    ]);
    expect(g.legend[0]).toMatchObject({
      textX: internal.legend.items[0].text.x,
      textY: internal.legend.items[0].text.y,
    });
    // stripe: gridlines.show false and axes.line false -> no lines
    expect(g.lines).toEqual([]);
  });
  it('gridlines (one per tick) and the axis line when the Mood asks for them; dashed -> a dash pattern', () => {
    const m = {
      ...mood,
      charts: {
        ...mood.charts,
        gridlines: { show: true, color: 'border', style: 'dashed' },
        axes: { ...mood.charts.axes, line: true, lineColor: 'text' },
      },
    };
    const g = layoutChart(column, frame, m, resolve(m, page));
    expect(g.lines).toHaveLength(g.ticks.y.length + 1);
    expect(g.lines[0].dash).toEqual([4, 4]);
    expect(g.lines.at(-1).dash).toBeUndefined();
  });
  it("line: one points array per series; donut: arcs in renderer degrees (0 = 12 o'clock)", () => {
    const line = layoutChart(
      { type: 'chart', chartType: 'line', categories: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] },
      frame,
      mood,
      R,
    );
    expect(line.points).toHaveLength(1);
    expect(line.points[0]).toHaveLength(2);
    const donut = layoutChart(
      { type: 'chart', chartType: 'donut', categories: ['A', 'B'], series: [{ name: 'S', values: [3, 1] }] },
      frame,
      mood,
      R,
    );
    expect(donut.arcs[0]).toMatchObject({ a0: 0, a1: 270 });
    expect(donut.arcs[1]).toMatchObject({ a0: 270, a1: 360 });
    expect(donut.arcs[0].r0).toBeCloseTo(donut.arcs[0].r * 0.65, 1);
  });
});

describe('layoutTable', () => {
  const block = {
    type: 'table',
    header: ['Phase', 'Goal', 'Weeks', 'Status'],
    rows: [
      ['P0', 'Foundations', '1', 'In progress'],
      ['P1', 'Brand to mood', '2', 'Planned'],
      ['P2', 'Engine and renderer', '3', 'Planned'],
    ],
    align: ['left', 'left', 'right', 'left'],
  };
  it('colWidths sum to the frame width, never below the header, rows ≥ minHeight', () => {
    const g = layoutTable(block, frame, mood, R);
    expect(g.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(frame.w, 6);
    const pad = mood.tables.rows.padding;
    const hf = { ...R.font(mood.tables.header.font), weight: mood.tables.header.weight };
    block.header.forEach((h, c) => {
      expect(g.colWidths[c]).toBeGreaterThanOrEqual(measure(h, hf) + pad * 2 - 0.01);
    });
    expect(g.colWidths[1]).toBeGreaterThan(g.colWidths[2]); // "Engine and renderer" is the widest column
    expect(g.rowHeights).toHaveLength(4);
    for (const h of g.rowHeights) expect(h).toBeGreaterThanOrEqual(mood.tables.rows.minHeight);
    expect(g.cells[0][0]).toMatchObject({ header: true, size: hf.size, text: 'Phase' });
    expect(g.cells[1][0].bold).toBe(true); // tables.firstColumn.bold
    expect(g.cells[1][2].align).toBe('right');
    expect(g.overflow).toBe(false);
  });
  it('steps down and reports overflow when the rows cannot fit', () => {
    const warnings = [];
    const g = layoutTable(block, { ...frame, h: 60 }, mood, R, { warnings });
    expect(g.overflow).toBe(true);
    expect(g.cellFont.size).toBe(R.font(mood.tables.rows.font).fit.min);
    expect(warnings).toContainEqual(expect.objectContaining({ check: 'overflow' }));
  });
  it('a header cell follows its column alignment when the content gives it, else tables.align.header', () => {
    const m = structuredClone(mood);
    m.tables.align = { header: 'right', text: 'left', number: 'right' };
    const Rm = resolve(m, page);
    const g = layoutTable(block, frame, m, Rm);
    expect(g.cells[0].map((c) => c.align)).toEqual(['left', 'left', 'right', 'left']);
    const { align, ...noAlign } = block;
    const h = layoutTable(noAlign, frame, m, Rm);
    expect(align).toBeDefined();
    expect(h.cells[0].map((c) => c.align)).toEqual(['right', 'right', 'right', 'right']);
    expect(h.cells[1].map((c) => c.align)).toEqual(['left', 'left', 'right', 'left']); // Weeks is numeric
  });
  it('header text is judged against an opaque header fill ending in 00 (#000000), only #RRGGBB00 is transparent', () => {
    const m = structuredClone(mood);
    m.tables.header = { ...m.tables.header, fill: '#000000', text: '#FFFFFF' };
    const Rm = resolve(m, page); // page bg is white: judged against it, white text would be replaced
    expect(layoutTable(block, frame, m, Rm).headerFont.color).toBe('#FFFFFF');
    m.tables.header.fill = '#00000000'; // transparent -> the surface bg decides
    const t = layoutTable(block, frame, m, resolve(m, page)).headerFont.color;
    expect(t).not.toBe('#FFFFFF');
  });
  it('proportionalWidths keeps minimums and the total', () => {
    expect(proportionalWidths([100, 300], [150, 50], 400)).toEqual([150, 250]);
    expect(proportionalWidths([100, 300], [10, 10], 800)).toEqual([200, 600]);
  });
});
