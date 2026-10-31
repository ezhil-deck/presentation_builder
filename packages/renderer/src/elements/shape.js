import { paintCss, svgGradient, svgPaint } from '../paint.js';
import { cssColor, h, num, svgId, warn } from '../util.js';
import { elementProps } from './common.js';

/**
 * Shapes, painted with the element `style` (fill colour or gradient, stroke {color, width, dash}, radius,
 * opacity, shadow):
 * - `shape.kind` 'rect' | 'ellipse' -> a div (ellipse = 50% radius);
 * - 'line' (also element `type: 'line'`), 'polygon', 'path' -> inline SVG in the frame's own px coordinates
 *   (overflow visible, so a 0-height horizontal line still shows):
 *   - line: from `shape.points[0]` to `shape.points[1]` when given, else from (0,0) to
 *     (`lineProps.x2` ?? w, `lineProps.y2` ?? h) - all relative to the frame's top-left;
 *     `lineProps.arrowStart/arrowEnd` -> arrowheads 4 stroke-widths long (renderer convention);
 *   - polygon: `shape.points` [[x,y], ...] relative to the frame;
 *   - path: `shape.path` (SVG path data) relative to the frame.
 *   A shadow on an SVG shape is a CSS `drop-shadow` of the same offset / blur / colour.
 */
export function ShapeElement(el, ctx, origin) {
  const kind = el.type === 'line' ? 'line' : el.shape?.kind;
  const st = el.style ?? {};
  if (kind === 'rect' || kind === 'ellipse') {
    return h(
      'div',
      elementProps(el, origin, {
        extraStyle: paintCss(st, { ellipse: kind === 'ellipse' }),
        attrs: { 'data-shape': kind },
      }),
    );
  }
  if (kind !== 'line' && kind !== 'polygon' && kind !== 'path') {
    return h('div', elementProps(el, origin, { warning: `unknown shape kind "${kind}"` }));
  }

  const { w, h: hh } = el.frame;
  const warnings = [];
  const gradId = svgId(ctx, el, 'fill');
  const defs = [];
  if (st.fill && typeof st.fill === 'object') defs.push(svgGradient(gradId, st.fill, w, hh));
  const paint = svgPaint(st, gradId);
  let node;
  if (kind === 'line') {
    const pts = el.shape?.points;
    const [x1, y1, x2, y2] =
      Array.isArray(pts) && pts.length >= 2
        ? [pts[0][0], pts[0][1], pts[1][0], pts[1][1]]
        : [0, 0, el.lineProps?.x2 ?? w, el.lineProps?.y2 ?? hh];
    if (!paint.stroke) warnings.push('line without stroke');
    const lp = el.lineProps ?? {};
    const markers = {};
    for (const end of ['Start', 'End']) {
      if (!lp[`arrow${end}`]) continue;
      const id = svgId(ctx, el, `arrow${end}`);
      defs.push(
        h(
          'marker',
          {
            key: id,
            id,
            viewBox: '0 0 10 10',
            refX: 10,
            refY: 5,
            markerWidth: 4,
            markerHeight: 4,
            markerUnits: 'strokeWidth',
            orient: 'auto-start-reverse',
          },
          h('path', { d: 'M0,0 L10,5 L0,10 z', fill: paint.stroke ?? 'none' }),
        ),
      );
      markers[`marker${end}`] = `url(#${id})`;
    }
    node = h('line', {
      x1: num(x1),
      y1: num(y1),
      x2: num(x2),
      y2: num(y2),
      ...paint,
      fill: undefined,
      ...markers,
    });
  } else if (kind === 'polygon') {
    const pts = (el.shape?.points ?? []).map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    if (!pts) warnings.push('polygon without points');
    node = h('polygon', { points: pts, ...paint });
  } else {
    if (!el.shape?.path) warnings.push('path without data');
    node = h('path', { d: el.shape?.path ?? '', ...paint });
  }
  const svgStyle = { position: 'absolute', left: 0, top: 0, overflow: 'visible' };
  if (st.shadow) {
    const s = st.shadow;
    svgStyle.filter = `drop-shadow(${num(s.x ?? 0)}px ${num(s.y ?? 0)}px ${num(s.blur ?? 0)}px ${cssColor(s.color ?? '#000000', s.opacity)})`;
  }
  return h(
    'div',
    elementProps(el, origin, { warning: warn(warnings), attrs: { 'data-shape': kind } }),
    h(
      'svg',
      // No viewBox (a 0-height viewBox disables rendering): user units are px of the frame; min 1px box.
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: num(Math.max(w, 1)),
        height: num(Math.max(hh, 1)),
        style: svgStyle,
      },
      defs.length ? h('defs', null, ...defs) : null,
      node,
    ),
  );
}
