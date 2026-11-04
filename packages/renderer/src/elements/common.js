import { boxStyle, num } from '../util.js';

/**
 * Props of an element's outer box: absolute at its frame (relative to `origin`, the parent's frame origin - the
 * slide's (0,0) or a group's frame), `z-index` = `el.z`, `opacity` = `el.style.opacity`, data attributes for the
 * editor / tests (`data-element-id`, `data-type`, `data-role`, `data-slot`: the editor selects an element by its id),
 * and `data-warning` when the renderer had to flag something.
 */
export function elementProps(el, origin, { extraStyle = {}, warning, attrs = {} } = {}) {
  const style = boxStyle(el.frame, origin, extraStyle);
  if (typeof el.z === 'number') style.zIndex = el.z;
  if (typeof el.style?.opacity === 'number' && el.style.opacity < 1) style.opacity = num(el.style.opacity);
  const props = {
    key: el.id,
    className: `pb-el pb-${el.type}`,
    'data-element-id': el.id,
    'data-type': el.type,
    style,
    ...attrs,
  };
  if (el.role) props['data-role'] = el.role;
  if (el.slot) props['data-slot'] = el.slot;
  if (warning) props['data-warning'] = warning;
  return props;
}
