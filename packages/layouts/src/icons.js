/**
 * Node icons (docs/PLAN-studio.md §3.3): a node's `icon` is a concept name resolved against the brand's own icon set
 * (Mood components.icon.items, from BrandSpec E5) by name; a name the set does not have resolves to nothing (no
 * generic icon pack is added to any brand). Sizes come from the brand's icon tokens.
 */
import { LINES, lineBox, pickRole } from './geometry.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const norm = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

/** The file of the brand icon named `name` (exact name, else case / space / underscore-insensitive), or null. */
export function iconFile(mood, name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const list = mood?.components?.icon?.items ?? [];
  const hit = list.find((i) => i?.name === name) ?? list.find((i) => norm(i?.name) === norm(name));
  return typeof hit?.file === 'string' && hit.file ? hit.file : null;
}

/** Whether any of `names` resolves to a brand icon. */
export function anyIcon(mood, names) {
  return (names ?? []).some((n) => iconFile(mood, n));
}

/**
 * The icon's container (signal: components.icon.tokens container.container rounded / circle / square with
 * container.size): {shape: 'rect' | 'ellipse', size, radius?, stroke?, strokeWidth?, fill?} or null when the brand
 * draws icons bare.
 */
export function iconContainer(mood) {
  const t = mood?.components?.icon?.tokens ?? {};
  const kind = t['container.container'];
  const size = num(t['container.size']);
  if (!size || !kind || kind === 'none') return null;
  const out = { shape: kind === 'circle' ? 'ellipse' : 'rect', size };
  if (kind === 'rounded') out.radius = 'sm';
  if (t['container.border.style'] && t['container.border.style'] !== 'none') {
    const w = num(t['container.border.width']);
    if (w) {
      out.strokeWidth = w;
      out.stroke = t['container.border.color'] ?? 'border';
    }
  }
  if (t['container.fill'] && t['container.fill'] !== 'transparent') out.fill = t['container.fill'];
  else if (t['container.color'] && t['container.color'] !== 'transparent' && kind !== 'none')
    out.fill = t['container.color'];
  return out;
}

/**
 * The side of the room an icon takes in a node (signal: the icon container size, else components.icon.tokens.size,
 * else two lines of the heading role) and the glyph size inside it (tokens.size, capped to the room).
 */
export function iconSize(mood, headingRole = 'h3') {
  const t = mood?.components?.icon?.tokens ?? {};
  const c = iconContainer(mood);
  const glyph = num(t.size);
  const room = c?.size ?? glyph ?? lineBox(mood, pickRole(mood, headingRole, 'body'), LINES.heading);
  return { room, glyph: Math.min(glyph ?? room, room) };
}
