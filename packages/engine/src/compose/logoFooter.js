/** Logo + footer (P2-spec §3.5). */
import { layoutText } from '../fit/lines.js';
import { measure } from '../fit/metrics.js';
import { r2 } from '../util/stable.js';
import { deckFont } from './resolve.js';

const SIZES = new Set(['large', 'small', 'none']);
const CANVAS = { w: 1920, h: 1080 };

/** large | small | none: layout.logo (unless 'mood') -> logo.perKind[kind] -> layoutHints[kind].logo -> none. */
export function logoSize(kinds, layout, mood) {
  if (layout?.logo && layout.logo !== 'mood') return layout.logo;
  for (const k of kinds) {
    const v = mood.logo?.perKind?.[k];
    if (SIZES.has(v)) return v;
  }
  for (const k of kinds) {
    const v = mood.composition?.layoutHints?.[k]?.logo;
    if (SIZES.has(v)) return v;
  }
  return 'none';
}

/** The variant + box size for a logo of `size` on `surface`. */
export function logoBox(size, surface, mood, assets, warn) {
  const variantId = mood.logo?.perSurface?.[surface.id] ?? surface.logoVariant;
  const variant = variantId ? mood.logo?.variants?.[variantId] : undefined;
  if (!variant?.file) {
    warn('logo', `no logo variant for surface "${surface.id}" (logo.perSurface / surface.logoVariant)`);
    return null;
  }
  let h = mood.logo?.height?.[size];
  if (typeof h !== 'number') {
    const other = size === 'large' ? 'small' : 'large';
    h = mood.logo?.height?.[other];
    if (typeof h === 'number')
      warn('logo', `logo.height.${size} not given: used logo.height.${other} (${h})`, 'info');
    else {
      // F2: no invented size
      warn('logo', `logo.height not given (neither ${size} nor ${other}): logo not placed`);
      return null;
    }
  }
  const info = assets.info(variant.file);
  const vw = variant.width ?? info?.width;
  const vh = variant.height ?? info?.height;
  if (!(h > 0) || !(vw > 0) || !(vh > 0)) {
    warn('logo', `logo variant "${variantId}" has no size: not placed`);
    return null;
  }
  return { variantId, file: variant.file, w: (h * vw) / vh, h };
}

/** "bottom-left" | "top-right" | "top-center" | ... -> {v, h} */
export function parsePosition(position) {
  const p = String(position ?? '');
  const v = p.includes('top') ? 'top' : p.includes('middle') ? 'middle' : 'bottom';
  const h = p.includes('right') ? 'right' : p.includes('center') ? 'center' : 'left';
  return { v, h };
}

export function placeLogo({ kinds, surface, layout, mood, assets, warn, slideId, brandName }) {
  const size = logoSize(kinds, layout, mood);
  if (size === 'none') return null;
  const box = logoBox(size, surface, mood, assets, warn);
  if (!box) return null;
  const safe = mood.geometry?.safeArea ?? mood.geometry?.margins ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const pos = parsePosition(mood.logo?.position);
  const x =
    pos.h === 'right'
      ? CANVAS.w - safe.right - box.w
      : pos.h === 'center'
        ? (CANVAS.w - box.w) / 2
        : safe.left;
  const y =
    pos.v === 'top' ? safe.top : pos.v === 'middle' ? (CANVAS.h - box.h) / 2 : CANVAS.h - safe.bottom - box.h;
  return {
    size,
    element: {
      id: `${slideId}-logo`,
      type: 'image',
      role: 'logo',
      name: `logo (${box.variantId}, ${size})`,
      frame: { x: r2(x), y: r2(y), w: r2(box.w), h: r2(box.h) },
      z: 40,
      image: { asset: assets.add(box.file), fit: 'contain', alt: brandName ? `${brandName} logo` : 'logo' },
    },
  };
}

/** Whether the footer shows on this slide. */
export function footerShown(kinds, layout, mood) {
  const f = mood.footer;
  if (!f?.show) return false;
  if (layout?.footer === 'hide') return false;
  if (kinds.some((k) => (f.hideOn ?? []).includes(k))) return false;
  if (kinds.some((k) => mood.composition?.layoutHints?.[k]?.footer === false)) return false;
  return true;
}

/**
 * Footer items in the bottom margin band (y = 1080 − margins.bottom … 1080), between the left and right margins,
 * grouped at footer.position (left / right / center), in footer.items order, spacing.md apart.
 */
export function footerElements({ kinds, layout, mood, R, assets, warn, slideId, number, total, meta, said }) {
  const f = mood.footer;
  if (!footerShown(kinds, layout, mood)) return [];
  const margins = mood.geometry.margins;
  const bandY = CANVAS.h - margins.bottom;
  const bandH = margins.bottom;
  // footer.role names a type role; when the Mood does not define it, the Mood's own `footer` role is used (warned)
  const known = !f.role || Boolean(mood.type?.roles?.[f.role]);
  let font = known ? R.font(f.role ?? 'footer') : null;
  if (!known) {
    font = R.font('footer');
    if (font && !said?.has('footer-role')) {
      said?.add('footer-role');
      warn('footer', `footer.role "${f.role}" is not a type role: used the "footer" role`, 'info');
    }
  }
  const gap = R.spacing('md');
  const parts = [];
  for (const item of f.items ?? []) {
    if (item === 'logo') {
      const box = logoBox('small', R.surface, mood, assets, warn);
      if (box) parts.push({ item, w: box.w, h: box.h, box });
    } else {
      let text;
      if (item === 'pageNumber') {
        text = String(f.pageNumberFormat ?? '{n}')
          .replace(/\{n\}/g, String(number))
          .replace(/\{total\}/g, String(total));
      } else if (item === 'text') text = f.text;
      else if (item === 'date') {
        text = meta?.date;
        if (!text) warn('footer', 'footer item "date" needs content.meta.date: skipped', 'info');
      }
      if (!text) continue;
      if (!font) continue;
      parts.push({ item, text, w: measure(text, font) });
    }
  }
  if (!parts.length) return [];
  const totalW = parts.reduce((a, p) => a + p.w, 0) + gap * (parts.length - 1);
  const pos = parsePosition(f.position);
  let x =
    pos.h === 'right'
      ? CANVAS.w - margins.right - totalW
      : pos.h === 'center'
        ? (CANVAS.w - totalW) / 2
        : margins.left;
  const out = [];
  if (f.band?.show) {
    const h = typeof f.band.height === 'number' ? f.band.height : bandH;
    const fill = R.color(f.band.bg);
    out.push({
      id: `${slideId}-footer-band`,
      type: 'shape',
      role: 'footer',
      frame: { x: 0, y: CANVAS.h - h, w: CANVAS.w, h },
      z: 50,
      shape: { kind: 'rect' },
      ...(fill ? { style: { fill } } : {}),
    });
  }
  for (const p of parts) {
    if (p.item === 'logo') {
      out.push({
        id: `${slideId}-footer-logo`,
        type: 'image',
        role: 'footer',
        name: `logo (${p.box.variantId}, small)`,
        frame: { x: r2(x), y: r2(bandY + (bandH - p.h) / 2), w: r2(p.w), h: r2(p.h) },
        z: 50,
        image: { asset: assets.add(p.box.file), fit: 'contain', alt: 'logo' },
      });
    } else {
      const frame = { x: r2(x), y: bandY, w: r2(Math.ceil(p.w) + 1), h: bandH };
      const paragraphs = [{ runs: [{ text: p.text }] }];
      const res = layoutText(paragraphs, frame, font, { align: 'left', valign: 'middle' });
      out.push({
        id: `${slideId}-footer-${p.item}`,
        type: 'text',
        role: 'footer',
        frame,
        z: 50,
        text: {
          paragraphs,
          font: deckFont(font),
          align: 'left',
          valign: 'middle',
          fit: {
            requestedSize: font.size,
            appliedSize: font.size,
            overflow: res.overflow,
            steps: 0,
            height: r2(res.height),
          },
          lines: res.lines,
          autofit: true,
        },
      });
    }
    x += p.w + gap;
  }
  return out;
}
