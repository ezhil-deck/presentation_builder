import { paintLayer } from '../paint.js';
import { h, warn } from '../util.js';
import { elementProps } from './common.js';
import { renderLines } from './lines.js';

/**
 * Text element: its box (painted with `el.style` if it has a fill / stroke / shadow) holding one span per fitted
 * line (see lines.js for the placement formula and the `text.font` fields read). No `text.lines` -> nothing is
 * painted and the box carries `data-warning="no fitted lines"`: the renderer never wraps text itself.
 */
export function TextElement(el, ctx, origin) {
  const text = el.text ?? {};
  const font = text.font ?? {};
  const hasLines = Array.isArray(text.lines) && text.lines.length > 0;
  const hasText = (text.paragraphs ?? []).some((p) => (p.runs ?? []).some((r) => r.text));
  const { nodes, warning } = hasLines
    ? renderLines(ctx, { lines: text.lines, paragraphs: text.paragraphs ?? [], font })
    : { nodes: [], warning: undefined };
  const attrs = {};
  if (text.fit?.overflow) attrs['data-overflow'] = 'true';
  return h(
    'div',
    elementProps(el, origin, {
      warning: warn(warning, !hasLines && hasText && 'no fitted lines'),
      attrs,
    }),
    paintLayer(el.style),
    ...nodes,
  );
}
