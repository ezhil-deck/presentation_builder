// MD-GEOMETRY: canvas, margins, safeArea, grid, titleZone, spacing (xs..xl), density.
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-GEOMETRY';

const STEPS = ['xs', 'sm', 'md', 'lg', 'xl'];

/** D9: the quantiles xs..xl are read at. */
const AT = [0, 0.25, 0.5, 0.75, 1];

/**
 * layout.spacing -> {xs..xl} (D9). n >= 5 sorted values: xs..xl = indices round((n-1) * {0, .25, .5, .75, 1}).
 * Fewer: from sm upward (+ warning by the caller).
 */
export function spacingScale(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length >= 5) {
    const idx = AT.map((q) => Math.round((sorted.length - 1) * q));
    return { scale: Object.fromEntries(STEPS.map((s, i) => [s, sorted[idx[i]]])), short: false };
  }
  const names = STEPS.slice(1);
  return { scale: Object.fromEntries(sorted.map((v, i) => [names[i], v])), short: true };
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const layout = brandSpec.layout ?? {};
  const geometry = { canvas: { width: 1920, height: 1080 } };
  c.prov(
    ptr('geometry', 'canvas'),
    has(layout, 'canvas') ? [ptr('layout', 'canvas')] : [],
    'fixed 1920x1080 canvas (BR-NORMALIZE rejects any other input size)',
  );

  if (isObj(layout.margins)) {
    geometry.margins = clone(layout.margins);
    c.prov(ptr('geometry', 'margins'), [ptr('layout', 'margins')]);
  } else {
    c.ask(
      ptr('layout', 'margins'),
      'What are the slide margins (top, right, bottom, left, px on 1920x1080)?',
    );
  }
  for (const k of ['safeArea', 'grid', 'titleZone']) {
    if (isObj(layout[k])) {
      geometry[k] = clone(layout[k]);
      c.prov(ptr('geometry', k), [ptr('layout', k)]);
    }
  }

  const spacing = Array.isArray(layout.spacing) ? layout.spacing.filter((v) => typeof v === 'number') : [];
  if (spacing.length) {
    const { scale, short } = spacingScale(spacing);
    geometry.spacing = scale;
    c.prov(
      ptr('geometry', 'spacing'),
      [ptr('layout', 'spacing')],
      short
        ? `${spacing.length} entries, sorted, assigned from sm upward`
        : 'sorted ascending; xs..xl = indices round((n-1) x 0, .25, .5, .75, 1) (D9)',
    );
    if (short) {
      const absent = STEPS.filter((s) => !(s in scale));
      c.warn(
        ptr('layout', 'spacing'),
        `layout.spacing has ${spacing.length} entries (< 5): assigned from sm upward; absent: ${absent.join(', ')}`,
      );
    }
  } else {
    c.warn(ptr('layout', 'spacing'), 'layout.spacing not given: geometry.spacing absent');
  }

  const density = brandSpec.composition?.density;
  if (density !== undefined) {
    geometry.density = density;
    c.prov(ptr('geometry', 'density'), [ptr('composition', 'density')]);
  }

  c.res.patch = { geometry };
  return c.res;
}
