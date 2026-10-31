// MD-CHARTS-TABLES: charts.* and tables.* copied (role refs kept as the brand names them); charts.palette resolved.
import { clone, collector, isObj, ptr } from '../util.js';

export const RULE = 'MD-CHARTS-TABLES';

/** charts.palette -> categorical | sequential | mono. */
export function paletteOf(value) {
  if (typeof value === 'string' && /sequential/i.test(value)) return 'sequential';
  if (typeof value === 'string' && /^mono(chrome)?$/i.test(value)) return 'mono';
  return 'categorical';
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const patch = {};

  if (isObj(brandSpec.charts)) {
    const charts = clone(brandSpec.charts);
    delete charts.kpi; // MD-COMPONENTS: components.kpi
    if (isObj(charts.highlightMode)) {
      charts.highlight = charts.highlightMode;
      delete charts.highlightMode;
      c.prov(ptr('charts', 'highlight'), [ptr('charts', 'highlightMode')], 'highlightMode -> highlight');
    }
    charts.palette = paletteOf(brandSpec.charts.palette);
    c.prov(ptr('charts'), [ptr('charts')], 'copied as given (kpi -> components.kpi)');
    c.prov(
      ptr('charts', 'palette'),
      brandSpec.charts.palette !== undefined ? [ptr('charts', 'palette')] : [],
      brandSpec.charts.palette !== undefined
        ? `charts.palette "${brandSpec.charts.palette}" -> ${charts.palette}`
        : 'charts.palette not given: categorical (P1 rule)',
    );
    patch.charts = charts;
  }

  if (isObj(brandSpec.tables)) {
    patch.tables = clone(brandSpec.tables);
    c.prov(ptr('tables'), [ptr('tables')], 'copied as given');
  }

  c.res.patch = patch;
  return c.res;
}
