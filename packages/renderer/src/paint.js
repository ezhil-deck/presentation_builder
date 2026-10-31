import { cssColor, h, num, px } from './util.js';

/**
 * Painting of the Deck `style` object (fill, stroke, radius, opacity, shadow) and of gradients, shared by shapes,
 * text boxes, tables and backgrounds. Every value is the literal the engine resolved; nothing is filled in here.
 *
 * Gradient: `{type:'linear'|'radial', angle, stops:[{color, at}]}` - `at` in 0..1 (values > 1 are read as percent),
 * `angle` in CSS degrees (0 = towards the top, clockwise; absent = the CSS default, towards the bottom).
 * Radial = a circle from the centre to the farthest corner (the same in CSS and SVG).
 */

const pct = (at) => num((at > 1 ? at : at * 100) ?? 0);

export function cssGradient(g) {
  const stops = (g?.stops ?? []).map((s) => `${cssColor(s.color)} ${pct(s.at)}%`).join(', ');
  if (g?.type === 'radial') return `radial-gradient(circle farthest-corner at 50% 50%, ${stops})`;
  return typeof g?.angle === 'number'
    ? `linear-gradient(${num(g.angle)}deg, ${stops})`
    : `linear-gradient(${stops})`;
}

/** CSS box-shadow from a Deck shadow (`opacity` multiplies the colour's alpha). */
export function cssShadow(s) {
  if (!s) return undefined;
  const color = cssColor(s.color ?? '#000000', s.opacity);
  return `${px(s.x ?? 0)} ${px(s.y ?? 0)} ${px(s.blur ?? 0)} ${px(s.spread ?? 0)} ${color}`;
}

/** CSS for a div painted with a Deck style. `ellipse` makes the radius 50%. */
export function paintCss(style = {}, { ellipse = false } = {}) {
  const css = {};
  const fill = style.fill;
  if (typeof fill === 'string') css.backgroundColor = cssColor(fill);
  else if (fill && typeof fill === 'object') css.backgroundImage = cssGradient(fill);
  if (style.stroke?.color && style.stroke.width) {
    const dashed = Array.isArray(style.stroke.dash) && style.stroke.dash.length > 0;
    css.border = `${px(style.stroke.width)} ${dashed ? 'dashed' : 'solid'} ${cssColor(style.stroke.color)}`;
    css.boxSizing = 'border-box';
  }
  if (ellipse) css.borderRadius = '50%';
  else if (typeof style.radius === 'number' && style.radius > 0) css.borderRadius = px(style.radius);
  if (style.shadow) css.boxShadow = cssShadow(style.shadow);
  return css;
}

/** True when a style paints anything (fill, stroke or shadow). */
export function paints(style) {
  return Boolean(style && (style.fill || (style.stroke?.color && style.stroke.width) || style.shadow));
}

/**
 * A full-size layer (inset 0) painted with `style`, placed under a box's content so that a border never shifts the
 * absolutely positioned lines inside the box.
 */
export function paintLayer(style, key = 'paint') {
  if (!paints(style)) return null;
  return h('div', {
    key,
    className: 'pb-paint',
    style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', ...paintCss(style) },
  });
}

/**
 * SVG gradient definition for a gradient fill in a `w`x`h` user space (matches the CSS gradient line exactly:
 * length |w·sin a| + |h·cos a| through the centre).
 */
export function svgGradient(id, g, w, h2) {
  const stops = (g.stops ?? []).map((s, i) =>
    h('stop', { key: i, offset: `${pct(s.at)}%`, stopColor: cssColor(s.color) }),
  );
  if (g.type === 'radial') {
    return h(
      'radialGradient',
      {
        id,
        gradientUnits: 'userSpaceOnUse',
        cx: num(w / 2),
        cy: num(h2 / 2),
        r: num(Math.hypot(w / 2, h2 / 2)),
      },
      stops,
    );
  }
  const a = ((typeof g.angle === 'number' ? g.angle : 180) * Math.PI) / 180;
  const len = Math.abs(w * Math.sin(a)) + Math.abs(h2 * Math.cos(a));
  const dx = (Math.sin(a) * len) / 2;
  const dy = (-Math.cos(a) * len) / 2;
  return h(
    'linearGradient',
    {
      id,
      gradientUnits: 'userSpaceOnUse',
      x1: num(w / 2 - dx),
      y1: num(h2 / 2 - dy),
      x2: num(w / 2 + dx),
      y2: num(h2 / 2 + dy),
    },
    stops,
  );
}

/** SVG paint attributes (fill/stroke) for a style; a gradient fill refers to `gradientId`. */
export function svgPaint(style = {}, gradientId) {
  const attrs = {};
  const fill = style.fill;
  if (typeof fill === 'string') {
    attrs.fill = cssColor(fill);
  } else if (fill && typeof fill === 'object') attrs.fill = `url(#${gradientId})`;
  else attrs.fill = 'none';
  if (style.stroke?.color && style.stroke.width) {
    attrs.stroke = cssColor(style.stroke.color);
    attrs.strokeWidth = num(style.stroke.width);
    if (Array.isArray(style.stroke.dash) && style.stroke.dash.length) {
      attrs.strokeDasharray = style.stroke.dash.map(num).join(' ');
    }
  }
  return attrs;
}
