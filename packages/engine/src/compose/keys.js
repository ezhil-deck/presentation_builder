/**
 * Content/2 slide keys drawn by the composer (docs/S2-layouts.md §5, S2.a slice 3): the `background` image under the
 * brand's text-over-image overlay, the label and subtitle that follow the title's text, and the `cta` key as the
 * brand's button. The layouts reserve the boxes (packages/layouts common.js standardTitle, cover / section / cta);
 * this module paints what needs the fitted text.
 */
import { parseInline } from '../content/inline.js';
import { r2 } from '../util/stable.js';
import { MIN_LITERAL_CONTRAST, contrastRatio } from './resolve.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The brand's text-over-image rule (decor.imagery.textOverImage): {color, opacity} or null (no overlay). */
export function overlayRule(mood, R) {
  const t = mood.decor?.imagery?.textOverImage;
  if (!t || !(t.opacity > 0) || !t.overlay || t.overlay === 'transparent') return null;
  const color = R.color(t.overlay);
  return color ? { color: color.slice(0, 7), opacity: Math.min(1, t.opacity) } : null;
}

/**
 * A content image as the slide background (the `background` key, or an image block with treatment background): the
 * image covers the slide, the surface bg under it, the brand's overlay colour at its opacity on top (one even layer:
 * the text may sit anywhere on the slide). No overlay rule → the image alone and an info.
 */
export function imageBackground(src, surface, ctx) {
  const out = { type: 'image', asset: ctx.assets.add(src), fit: 'cover' };
  const bg = ctx.R.color(surface?.bg);
  if (bg) out.color = bg;
  const rule = overlayRule(ctx.mood, ctx.R);
  if (rule) {
    out.overlay = rule.color;
    out.overlayOpacity = rule.opacity;
  } else {
    ctx.warn(
      'background',
      'background image without an overlay: the brand gives no text-over-image rule (decor.imagery.textOverImage)',
      'info',
    );
  }
  return out;
}

/**
 * Text on a background image: a text colour below 3:1 on the overlay colour takes the brand surface text colour that
 * contrasts most with it (as for text on a content image, compose/index.js textOverImage).
 */
export function textOnBackground(elements, background, ctx) {
  if (background?.type !== 'image' || !background.overlay) return;
  const on = background.overlay.slice(0, 7);
  const best = (ctx.mood.palette?.surfaces ?? [])
    .map((sf) => ctx.R.color(sf.text) ?? null)
    .filter(Boolean)
    .sort((a, b) => contrastRatio(b.slice(0, 7), on) - contrastRatio(a.slice(0, 7), on))[0];
  for (const el of elements) {
    if (el.type !== 'text' || el.z !== 30) continue;
    const c = el.text.font.color;
    if (!c || contrastRatio(c.slice(0, 7), on) >= MIN_LITERAL_CONTRAST) continue;
    if (best && contrastRatio(best.slice(0, 7), on) > contrastRatio(c.slice(0, 7), on)) {
      ctx.warn(
        'contrast',
        `"${el.id}" colour ${c} on the background overlay ${on}: used the brand surface text colour ${best}`,
        'info',
      );
      el.text.font.color = best;
      for (const p of el.text.paragraphs ?? []) if (p.bullet?.color) p.bullet.color = best;
    }
  }
}

/** The top / bottom of a fitted text element's block (its valign inside the frame). */
function textBlock(el) {
  const h = el.text.fit.height;
  const free = Math.max(0, el.frame.h - h);
  const dy = el.text.valign === 'bottom' ? free : el.text.valign === 'middle' ? free / 2 : 0;
  return { top: el.frame.y + dy, bottom: el.frame.y + dy + h };
}

/**
 * A text element's frame starts at `top` (when that is below its current top) with its lines where they were on the
 * canvas: the frame shrinks from the top to the text block, every line's frame-relative baseline moves up by the same
 * amount and the text becomes top-aligned. So a label hugging a bottom- or middle-aligned title no longer sits inside
 * the title's box (the text-overlap check compares boxes) and a later re-fit lays the text out where it is.
 */
export function trimTop(el, top) {
  const delta = r2(top - el.frame.y);
  if (!(delta > 0) || delta >= el.frame.h) return;
  el.frame.y = r2(el.frame.y + delta);
  el.frame.h = r2(el.frame.h - delta);
  for (const line of el.text?.lines ?? []) line.y = r2(line.y - delta);
  // the frame now starts at the text block: top alignment keeps frame, alignment and lines consistent for a re-fit
  if (el.text) el.text.valign = 'top';
}

/**
 * The label sits one spacing.sm above the title's first line and a subtitle under a top-aligned title one
 * spacing.sm under its last line (content/2 slides: the layout reserves both boxes for the longest title; the fitted
 * title may take fewer lines). Only ever moves them towards the title.
 */
export function hugTitle(elements, ctx) {
  const title = elements.find((e) => e.slot === 'title' && e.type === 'text');
  if (!title?.text?.fit) return;
  const sm = ctx.R.spacing('sm');
  const t = textBlock(title);
  const label = elements.find((e) => e.slot === 'label' && e.type === 'text');
  if (label && label.frame.y + label.frame.h <= title.frame.y + 0.5) {
    const y = r2(t.top - sm - label.frame.h);
    if (y > label.frame.y) {
      label.frame.y = y;
      trimTop(title, t.top);
    }
  }
  // a quote's label sits above the quote's first line the same way
  const qLabel = elements.find((e) => e.slot === 'quote-label' && e.type === 'text');
  const quote = elements.find((e) => e.slot === 'quote' && e.type === 'text' && e.text?.fit);
  if (qLabel && quote && qLabel.frame.y + qLabel.frame.h <= quote.frame.y + 0.5) {
    const y = r2(textBlock(quote).top - sm - qLabel.frame.h);
    if (y > qLabel.frame.y) {
      qLabel.frame.y = y;
      trimTop(quote, textBlock(quote).top);
    }
  }
  const sub = elements.find(
    (e) => e.slot === 'subtitle' && e.layoutBox === 'title-subtitle' && e.type === 'text',
  );
  if (sub && title.text.valign === 'top' && sub.frame.y >= title.frame.y + title.frame.h - 0.5) {
    const y = r2(t.bottom + sm);
    if (y < sub.frame.y) sub.frame.y = y;
  }
}

/**
 * The `cta` key as the brand's button (components.button): the rect (fill, border, radius, shadow) hugging the text
 * plus padding.0 / padding.1, the text in the button's font role (tokens.font, else the slot role) and text colour, a
 * one-character `icon.glyph` on its `icon.side`; aligned in the action box. No button component → the text in the
 * body role.
 */
export function buttonElements(binding, ctx, { textElement, rectEl, textOn }) {
  const box = binding.box;
  const id = `${ctx.slideId}-${binding.slot.id}`;
  const comp = ctx.mood.components?.button;
  let text = String(binding.blocks[0].text ?? '');
  const tag = (el) =>
    Object.assign(el, { role: box.role ?? 'body', slot: binding.slot.id, layoutBox: box.id });
  if (!comp) {
    const el = textElement({
      id,
      frame: box.frame,
      role: 'body',
      paragraphs: [{ runs: parseInline(text) }],
      align: box.align?.h ?? 'left',
      valign: box.align?.v ?? 'middle',
      ctx,
    });
    return el ? [tag(el)] : [];
  }
  const t = comp.tokens ?? {};
  const role =
    typeof t.font === 'string' && ctx.mood.type?.roles?.[t.font] ? t.font : (binding.slot.role ?? 'body');
  const glyph = typeof t['icon.glyph'] === 'string' ? t['icon.glyph'] : '';
  if (glyph && [...glyph].length === 1 && !/\p{L}/u.test(glyph))
    text = t['icon.side'] === 'left' ? `${glyph} ${text}` : `${text} ${glyph}`;
  const padV = num(t['padding.0']) ?? num(t.padding) ?? 0;
  const padH = num(t['padding.1']) ?? padV;
  const f = box.frame;
  const inner = {
    x: f.x + padH,
    y: f.y + padV,
    w: Math.max(0, f.w - 2 * padH),
    h: Math.max(0, f.h - 2 * padV),
  };
  const fill = ctx.R.color(t.fill);
  const color = t.text !== undefined ? ctx.R.color(t.text) : fill ? textOn(fill, ctx) : undefined;
  const make = (frame, size) =>
    textElement({
      id,
      frame,
      role,
      paragraphs: [{ runs: parseInline(text) }],
      align: 'left',
      valign: 'middle',
      size,
      color,
      ctx,
    });
  const first = make(inner);
  if (!first) return [];
  const lineW = Math.ceil(Math.max(0, ...first.text.lines.map((l) => l.width)));
  const w = Math.min(f.w, lineW + 2 * padH);
  const h = Math.min(f.h, first.text.fit.height + 2 * padV);
  const align = box.align?.h ?? 'left';
  const x = align === 'center' ? f.x + (f.w - w) / 2 : align === 'right' ? f.x + f.w - w : f.x;
  const rect = { x, y: f.y + (f.h - h) / 2, w, h };
  const out = [];
  const bg = rectEl(`${id}-button`, rect, t, ctx);
  if (bg) {
    bg.name = 'button';
    out.push(tag(bg));
  }
  const el = make(
    { x: rect.x + padH, y: rect.y + padV, w: Math.max(0, w - 2 * padH), h: Math.max(0, h - 2 * padV) },
    first.text.fit.appliedSize,
  );
  out.push(tag(el ?? first));
  return out;
}
