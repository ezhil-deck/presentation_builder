/**
 * Content/2 image treatments inside an image slot (S2.a slice 3; catalogue §2: image 175 presets - full-bleed,
 * collage, device mockup): a collage of 2–4 images on the brand's grid gutter with the card radius, one image in a
 * device frame (a rounded rect in the surface's border colour, the image inset as its screen), and captions under the
 * images in the caption role. The `background` treatment is the slide background (compose/keys.js); a single image
 * without caption is the plain image element (as content/1).
 */
import { parseInline } from '../content/inline.js';
import { r2 } from '../util/stable.js';

const rf = (f) => ({ x: r2(f.x), y: r2(f.y), w: r2(f.w), h: r2(f.h) });

/** Whether a box is the whole canvas (the full-bleed image layout puts the caption in its own `image-caption` box). */
const fullBleed = (f) => f.x <= 0 && f.y <= 0 && f.w >= 1920 && f.h >= 1080;

/** The caption role: caption, else bodySmall. */
const captionRole = (mood) => (mood.type?.roles?.caption ? 'caption' : 'bodySmall');

/** One caption line's height (the caption role's line box), 0 without the role. */
function captionHeight(ctx) {
  const f = ctx.R.font(captionRole(ctx.mood));
  return f ? f.size * f.lineHeight : 0;
}

function captionEl(text, frame, id, ctx, textElement) {
  return textElement({
    id,
    frame,
    role: captionRole(ctx.mood),
    paragraphs: [{ runs: parseInline(text) }],
    align: ctx.mood.type?.align?.body ?? 'left',
    valign: 'top',
    ctx,
  });
}

/** The radius images take in a collage / as a device screen: the card component's radius token, else none. */
function cardRadius(ctx) {
  const r = ctx.R.radius(ctx.mood.components?.card?.tokens?.radius);
  return typeof r === 'number' && r > 0 ? r : undefined;
}

/** The cells of a 2–4 image collage in `f` (gap g): 2 side by side; 3 = one tall left + two stacked right; 4 = 2 × 2. */
export function collageCells(f, n, g) {
  const half = (f.w - g) / 2;
  const halfH = (f.h - g) / 2;
  if (n <= 1) return [f];
  if (n === 2)
    return [
      { x: f.x, y: f.y, w: half, h: f.h },
      { x: f.x + half + g, y: f.y, w: half, h: f.h },
    ];
  if (n === 3)
    return [
      { x: f.x, y: f.y, w: half, h: f.h },
      { x: f.x + half + g, y: f.y, w: half, h: halfH },
      { x: f.x + half + g, y: f.y + halfH + g, w: half, h: halfH },
    ];
  return [0, 1, 2, 3].map((k) => ({
    x: f.x + (k % 2) * (half + g),
    y: f.y + Math.floor(k / 2) * (halfH + g),
    w: half,
    h: halfH,
  }));
}

/**
 * mediaElements(block, binding, ctx, {imageEl, textElement}) -> the elements of a lowered content/2 image block in its
 * slot (block: {src, alt, caption?, items?: [{src, alt, caption}], treatment?}).
 */
export function mediaElements(block, binding, ctx, { imageEl, textElement }) {
  const box = binding.box;
  const frame = box.frame;
  const id = `${ctx.slideId}-${binding.slot.id}`;
  const items = block.items ?? [block];
  const sm = ctx.R.spacing('sm');
  const out = [];
  const tag = (els) => {
    for (const e of els) {
      e.role ??= box.role ?? 'image';
      e.slot ??= binding.slot.id;
      e.layoutBox ??= box.id;
    }
    return els;
  };
  // full bleed: the image layout shows the caption in its own box (bound by bindSlots)
  const withCaptions = !fullBleed(frame) && items.some((it) => it.caption);
  const capH = withCaptions ? captionHeight(ctx) : 0;

  if (block.treatment === 'device') {
    if (items.length > 1)
      ctx.warn('image', `a device frame shows one image (${items.length} given): the first is shown`, 'info');
    return tag(
      deviceElements(items[0], { ...frame, h: frame.h - (capH ? capH + sm : 0) }, id, binding, ctx, imageEl, {
        caption: withCaptions ? items[0].caption : undefined,
        capH,
        textElement,
      }),
    );
  }

  if (items.length > 1) {
    const g = ctx.mood.geometry?.grid?.gutter ?? ctx.R.spacing('lg');
    const radius = cardRadius(ctx);
    collageCells(frame, items.length, g).forEach((cell, k) => {
      const it = items[k];
      const f = capH ? { ...cell, h: Math.max(0, cell.h - capH - sm) } : cell;
      const el = imageEl(`${id}-${k}`, f, it, binding, ctx);
      if (radius) el.style = { radius };
      out.push(el);
      if (capH && it.caption) {
        const c = captionEl(
          it.caption,
          { x: cell.x, y: f.y + f.h + sm, w: cell.w, h: capH },
          `${id}-${k}-caption`,
          ctx,
          textElement,
        );
        if (c) out.push(c);
      }
    });
    return tag(out);
  }

  if (capH && block.caption) {
    const f = { ...frame, h: Math.max(0, frame.h - capH - sm) };
    out.push(imageEl(id, f, block, binding, ctx));
    const c = captionEl(
      block.caption,
      { x: frame.x, y: f.y + f.h + sm, w: frame.w, h: capH },
      `${id}-caption`,
      ctx,
      textElement,
    );
    if (c) out.push(c);
    return tag(out);
  }
  return [imageEl(id, frame, block, binding, ctx)];
}

/**
 * A device frame: the screen keeps the image's aspect (its file, else decor.imagery.crop.defaultRatio, else the box),
 * the bezel is spacing.sm or 2.5 % of the box's shorter side (the larger), the body a rect of the surface `border`
 * colour with a radius of two bezels, the screen inset by one bezel with a radius of half a bezel; centred in `f`.
 */
function deviceElements(it, f, id, binding, ctx, imageEl, { caption, capH, textElement }) {
  const info = ctx.assets.info(it.src);
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(
    String(ctx.mood.decor?.imagery?.crop?.defaultRatio ?? ''),
  );
  const aspect =
    info?.width && info?.height ? info.width / info.height : m ? Number(m[1]) / Number(m[2]) : f.w / f.h;
  const bezel = Math.max(ctx.R.spacing('sm'), 0.025 * Math.min(f.w, f.h));
  // the largest body (screen + 2 bezels) of the screen's aspect that fits f
  let sw = f.w - 2 * bezel;
  let sh = sw / aspect;
  if (sh + 2 * bezel > f.h) {
    sh = f.h - 2 * bezel;
    sw = sh * aspect;
  }
  const body = {
    x: f.x + (f.w - sw - 2 * bezel) / 2,
    y: f.y + (f.h - sh - 2 * bezel) / 2,
    w: sw + 2 * bezel,
    h: sh + 2 * bezel,
  };
  const out = [];
  const color = ctx.R.color('border');
  if (color)
    out.push({
      id: `${id}-device`,
      type: 'shape',
      name: 'device frame',
      frame: rf(body),
      z: 20,
      shape: { kind: 'rect' },
      style: { fill: color, radius: r2(2 * bezel) },
    });
  const screen = imageEl(id, { x: body.x + bezel, y: body.y + bezel, w: sw, h: sh }, it, binding, ctx);
  delete screen.image.mask;
  // the surface bg behind the screen (a transparent image on a dark frame still reads)
  const bg = ctx.R.color('bg');
  screen.style = { radius: r2(bezel / 2), ...(bg ? { fill: bg } : {}) };
  out.push(screen);
  if (caption) {
    const c = captionEl(
      caption,
      { x: body.x, y: body.y + body.h + ctx.R.spacing('sm'), w: body.w, h: capH },
      `${id}-caption`,
      ctx,
      textElement,
    );
    if (c) out.push(c);
  }
  return out;
}
