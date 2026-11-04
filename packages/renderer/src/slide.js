import { Background } from './elements/background.js';
import { ChartElement } from './elements/chart.js';
import { elementProps } from './elements/common.js';
import { GroupElement } from './elements/group.js';
import { ImageElement } from './elements/image.js';
import { ShapeElement } from './elements/shape.js';
import { TableElement } from './elements/table.js';
import { TextElement } from './elements/text.js';
import { h } from './util.js';

/**
 * One Deck element -> React element, placed relative to `origin` (slide (0,0) or the parent group's frame). An element
 * the editor hid (`hidden: true`, kept in the deck JSON) is not painted.
 */
export function renderElement(el, ctx, origin = { x: 0, y: 0 }) {
  if (el.hidden) return null;
  switch (el.type) {
    case 'text':
      return TextElement(el, ctx, origin);
    case 'image':
      return ImageElement(el, ctx, origin);
    case 'shape':
    case 'line':
      return ShapeElement(el, ctx, origin);
    case 'chart':
      return ChartElement(el, ctx, origin);
    case 'table':
      return TableElement(el, ctx, origin);
    case 'group':
      return GroupElement(el, ctx, origin, renderElement);
    default:
      return h('div', elementProps(el, origin, { warning: `unknown element type "${el.type}"` }));
  }
}

/**
 * One slide: `<div class="pb-slot"><section class="slide" data-index>` at the canvas size, the background layer,
 * then the elements in Deck order (stacking by `z`).
 */
export function Slide({ deck, index, opts = {} }) {
  const slide = deck.slides[index];
  const ctx = { deck, opts, slideIndex: index };
  const attrs = { className: 'slide', 'data-index': index, 'data-slide-id': slide.id };
  if (slide.kind) attrs['data-kind'] = slide.kind;
  if (slide.layoutId) attrs['data-layout'] = slide.layoutId;
  if (slide.surfaceId) attrs['data-surface'] = slide.surfaceId;
  return h(
    'div',
    { className: 'pb-slot' },
    h(
      'section',
      attrs,
      Background(slide.background, ctx),
      ...(slide.elements ?? []).map((el) => renderElement(el, ctx)),
    ),
  );
}
