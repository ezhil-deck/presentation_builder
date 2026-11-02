/**
 * The text around a chart or a table (content/2, S2.a slice 3): a graphic title (h3) and a subtitle (bodySmall, else
 * body) above it, a source line (caption) under it. Each is fitted at its role in at most two lines, the frame left
 * for the graphic shrinks by what they take (+ spacing.sm each).
 */
import { parseInline } from '../content/inline.js';
import { r2 } from '../util/stable.js';

const role = (ctx, ...names) => names.find((n) => n && ctx.mood.type?.roles?.[n]) ?? null;

/**
 * aroundGraphic(frame, {title, subtitle, source}, idBase, ctx, textElement) -> {frame, elements}: `frame` is what is
 * left for the chart / table.
 */
export function aroundGraphic(frame, { title, subtitle, source } = {}, idBase, ctx, textElement) {
  const sm = ctx.R.spacing('sm');
  const align = ctx.mood.type?.align?.body ?? 'left';
  let f = { ...frame };
  const elements = [];
  const fit = (key, roleName, text, valign) => {
    const font = roleName ? ctx.R.font(roleName) : null;
    if (!font || typeof text !== 'string' || !text) return null;
    const h = Math.min(f.h, 2 * font.size * font.lineHeight);
    const y = valign === 'bottom' ? f.y + f.h - h : f.y;
    const el = textElement({
      id: `${idBase}-${key}`,
      frame: { x: f.x, y, w: f.w, h },
      role: roleName,
      paragraphs: [{ runs: parseInline(text) }],
      align,
      valign,
      ctx,
    });
    if (!el) return null;
    const used = Math.min(h, el.text.fit.height);
    if (valign === 'bottom') el.frame.y = r2(y + h - used);
    el.frame.h = r2(used);
    elements.push(el);
    return used;
  };
  for (const [key, r, text] of [
    ['title', role(ctx, 'chartTitle', 'h3'), title],
    ['subtitle', role(ctx, 'bodySmall', 'body'), subtitle],
  ]) {
    const used = fit(key, r, text, 'top');
    if (used) f = { x: f.x, y: f.y + used + sm, w: f.w, h: Math.max(0, f.h - used - sm) };
  }
  const used = fit('source', role(ctx, 'caption', 'bodySmall'), source, 'bottom');
  if (used) f = { ...f, h: Math.max(0, f.h - used - sm) };
  return { frame: f, elements };
}
