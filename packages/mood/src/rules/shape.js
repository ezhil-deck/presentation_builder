// MD-SHAPE: radius scale (canonical steps + every brand step under its own name, G3), shape language, border width,
// shadows, divider.
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-SHAPE';

/** Mood radius step <- brand radiusScale names, in preference order (the brand's own same-named step first). */
const RADIUS_FROM = { none: ['none'], sm: ['sm', 'xs'], md: ['md'], lg: ['lg'], pill: ['pill', 'full'] };
/** The named steps the shape language is judged on (pill/full and brand-custom names excluded). */
const LANGUAGE_STEPS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'];

export function languageOf(max) {
  if (max <= 2) return 'sharp';
  if (max <= 16) return 'soft';
  return 'round';
}

const NUM = /^(-?\d*\.?\d+)(px)?$/;

/** CSS box-shadow string ("x y blur spread color") or {x,y,blur,spread,color[,opacity]} -> Mood shadow, or null. */
export function parseShadow(value) {
  if (isObj(value)) {
    const out = {};
    for (const k of ['x', 'y', 'blur', 'spread']) if (typeof value[k] === 'number') out[k] = value[k];
    if (typeof value.color === 'string') out.color = value.color;
    if (typeof value.opacity === 'number') out.opacity = value.opacity;
    return ['x', 'y', 'blur'].every((k) => k in out) ? out : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || /\binset\b/.test(s) || /,(?![^(]*\))/.test(s)) return null; // inset or several shadows: not one Mood shadow
  const colorMatch = s.match(/(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))/);
  const rest = colorMatch ? s.replace(colorMatch[0], ' ') : s;
  const nums = rest.trim().split(/\s+/).filter(Boolean);
  if (nums.length < 2 || nums.length > 4 || !nums.every((n) => NUM.test(n))) return null;
  const [x, y, blur = 0, spread = 0] = nums.map((n) => Number(NUM.exec(n)[1]));
  const out = { x, y, blur, spread };
  if (colorMatch) out.color = colorMatch[0].replace(/\s+/g, '');
  return out;
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const layout = brandSpec.layout ?? {};
  const scale = layout.radiusScale;
  const shape = {};

  if (isObj(scale)) {
    const radius = {};
    for (const [step, names] of Object.entries(RADIUS_FROM)) {
      const name = names.find((n) => typeof scale[n] === 'number');
      if (name === undefined) continue;
      if (step === 'none' && scale[name] !== 0) {
        c.warn(ptr('layout', 'radiusScale', 'none'), `radiusScale.none is ${scale[name]}, not 0: dropped`);
        continue;
      }
      radius[step] = scale[name];
      c.prov(
        ptr('shape', 'radius', step),
        [ptr('layout', 'radiusScale', name)],
        name === step ? undefined : `brand step "${name}"`,
      );
    }
    // G3: every other named step of the brand's scale (xs, xl, full, tile, button, ...) kept verbatim under its name
    for (const [name, v] of Object.entries(scale)) {
      if (has(RADIUS_FROM, name) || typeof v !== 'number') continue;
      radius[name] = v;
      c.prov(
        ptr('shape', 'radius', name),
        [ptr('layout', 'radiusScale', name)],
        'brand step kept under its own name',
      );
    }
    if (Object.keys(radius).length) shape.radius = radius;

    const named = LANGUAGE_STEPS.filter((n) => typeof scale[n] === 'number');
    if (named.length) {
      const max = Math.max(...named.map((n) => scale[n]));
      shape.language = languageOf(max);
      c.prov(
        ptr('shape', 'language'),
        named.map((n) => ptr('layout', 'radiusScale', n)),
        `largest named radius ${max} (${named.join(', ')}; pill/full excluded): <=2 sharp, <=16 soft, else round`,
      );
    } else {
      c.warn(
        ptr('layout', 'radiusScale'),
        'radiusScale has no named step (none/xs/sm/md/lg/xl): shape.language absent',
      );
    }
  } else {
    c.ask(ptr('layout', 'radiusScale'), 'What corner radii does the brand use (radiusScale)?', {
      severity: 'optional',
    });
  }

  const bw = brandSpec.components?.cards?.style?.border?.width;
  if (typeof bw === 'number') {
    shape.borderWidth = bw;
    c.prov(ptr('shape', 'borderWidth'), [ptr('components', 'cards', 'style', 'border', 'width')]);
  }

  if (isObj(layout.shadowScale)) {
    const shadow = {};
    for (const [k, v] of Object.entries(layout.shadowScale)) {
      const parsed = parseShadow(v);
      if (!parsed) {
        c.warn(
          ptr('layout', 'shadowScale', k),
          `shadow "${k}" could not be read as one x/y/blur/spread/colour shadow: dropped`,
        );
        continue;
      }
      shadow[k] = parsed;
      c.prov(
        ptr('shape', 'shadow', k),
        [ptr('layout', 'shadowScale', k)],
        'parsed to {x,y,blur,spread,color}',
      );
    }
    if (Object.keys(shadow).length) shape.shadow = shadow;
  }

  const div = brandSpec.components?.divider;
  if (isObj(div)) {
    const out = clone(div);
    const from = [ptr('components', 'divider')];
    const notes = [];
    if (!has(out, 'weight') && typeof div.thickness === 'number') {
      out.weight = div.thickness;
      delete out.thickness;
      notes.push('thickness -> weight');
    }
    if (has(div, 'style') && !['line', 'none', 'accent-bar'].includes(div.style)) {
      out.lineStyle = div.style;
      if (['solid', 'dashed', 'dotted'].includes(div.style) && out.weight !== 0) {
        out.style = 'line';
        notes.push(`style "${div.style}" is a line style -> line (kept as lineStyle)`);
      } else {
        delete out.style;
        c.warn(
          ptr('components', 'divider', 'style'),
          `divider style "${div.style}" is not line/none/accent-bar: kept as lineStyle only`,
        );
      }
    }
    shape.divider = out;
    c.prov(ptr('shape', 'divider'), from, notes.join('; ') || undefined);
  }

  c.res.patch = { shape };
  return c.res;
}
