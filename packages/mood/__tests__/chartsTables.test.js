import { paletteOf, rule } from '../src/rules/chartsTables.js';
import { load } from './fixtures.js';

describe('MD-CHARTS-TABLES', () => {
  it('stripe: charts copied, palette resolved, highlightMode -> highlight, kpi moved out', () => {
    const res = rule(load('stripe'));
    const { charts, tables } = res.patch;
    expect(charts.palette).toBe('categorical');
    expect(res.provenance['/charts/palette'].note).toMatch(/"chart" -> categorical/);
    expect(charts.highlight).toEqual({ highlight: 'accent', others: 'chartMuted' });
    expect(charts.highlightMode).toBeUndefined();
    expect(charts.kpi).toBeUndefined();
    expect(charts.bar).toEqual({ radius: 1, gap: 0.47, orientation: 'vertical' });
    expect(charts.gridlines.show).toBe(false);
    expect(tables).toMatchObject({ radius: 6, maxRows: 6, maxCols: 5, header: { font: 'caption' } });
  });

  it('paletteOf', () => {
    expect(paletteOf('chartSequential')).toBe('sequential');
    expect(paletteOf('mono')).toBe('mono');
    expect(paletteOf('chart')).toBe('categorical');
    expect(paletteOf(undefined)).toBe('categorical');
  });

  it('absent blocks -> empty patch', () => {
    expect(rule(load('minimal')).patch).toEqual({});
  });
});
