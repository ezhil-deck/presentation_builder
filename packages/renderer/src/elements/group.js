import { h } from '../util.js';
import { elementProps } from './common.js';

/**
 * Group element: a box at the group frame holding its `children`. Children frames are slide-absolute (like every
 * Deck element), so they are placed relative to the group frame's origin; the group's rotation / opacity apply
 * to all of them.
 */
export function GroupElement(el, ctx, origin, renderElement) {
  return h(
    'div',
    elementProps(el, origin),
    ...(el.children ?? []).map((child) => renderElement(child, ctx, { x: el.frame.x, y: el.frame.y })),
  );
}
