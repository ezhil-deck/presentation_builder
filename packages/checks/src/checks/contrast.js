/**
 * Check 8 `contrast` (P3-spec §A.2, P3-D2): every text element against the colour behind it — the nearest shape
 * painted before it (lower z, or the same z earlier in the element order) with a solid or gradient fill whose frame
 * contains the text frame, else the slide background: solid colour, gradient (worst stop), or an image background's
 * `overlay` (the overlay colour; an image without overlay is not measured: info item). A content image behind the text
 * is not measured either. Translucent fills (style.opacity or #RRGGBBAA) are blended over what lies beneath them; over
 * an image the fill colour itself is the backdrop. Threshold: WCAG AA — 4.5:1 below 24 px regular / 18.66 px bold,
 * 3:1 at or above — unless the brand's `accessibility.minContrastBody` / `minContrastLarge` give their own. Below →
 * warn with the fix `snap-colour`. The ratio is the engine's `contrastRatio` (WCAG).
 */
import { contrastRatio } from '@pb/engine';
import { contains, flatElements, fmt, hasText, isFrame, makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'contrast';
export const title = 'Text contrasts with what is behind it';
export const signal =
  'slide backgrounds and fills (from mood.palette.surfaces), brandSpec.accessibility.minContrastBody / minContrastLarge';

/** WCAG AA large text: 24 px (18 pt) regular, 18.66 px (14 pt) bold. */
export const LARGE_PX = 24;
export const LARGE_BOLD_PX = 18.66;
/** WCAG AA minimum ratios (P3-D2: the published standard when the brand gives none). */
export const WCAG_BODY = 4.5;
export const WCAG_LARGE = 3;

const HEX = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

const channels = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/** `top` at `alpha` over `below` (#RRGGBB each), as the browser composites it. */
export function blend(top, alpha, below) {
  const a = channels(top);
  const b = channels(below);
  return toHex(a.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

/** Alpha of a fill: #RRGGBBAA's alpha × style.opacity (1 when neither is given). */
function alphaOf(color, opacity) {
  const m = HEX.exec(color);
  const a = m?.[2] ? parseInt(m[2], 16) / 255 : 1;
  return a * (typeof opacity === 'number' ? opacity : 1);
}

/** The minimum ratios: the brand's accessibility block wins, else WCAG AA. */
export function thresholds(brandSpec) {
  const a = brandSpec?.accessibility ?? {};
  return {
    body: typeof a.minContrastBody === 'number' ? a.minContrastBody : WCAG_BODY,
    large: typeof a.minContrastLarge === 'number' ? a.minContrastLarge : WCAG_LARGE,
    source: {
      body: typeof a.minContrastBody === 'number' ? 'accessibility.minContrastBody' : 'WCAG AA',
      large: typeof a.minContrastLarge === 'number' ? 'accessibility.minContrastLarge' : 'WCAG AA',
    },
  };
}

/** Whether text of `size` px and `weight` is WCAG "large". */
export const isLarge = (size, weight) => size >= LARGE_PX || (weight >= 700 && size >= LARGE_BOLD_PX);

/** The colours of a slide background, or { unknown } with a reason. */
function backgroundColours(bg) {
  if (!bg) return { unknown: 'no background' };
  if (bg.type === 'solid' && HEX.test(bg.color ?? '')) return { colours: [bg.color.slice(0, 7)] };
  if (bg.type === 'gradient' && bg.gradient?.stops?.length) {
    return { colours: bg.gradient.stops.map((s) => s.color).filter((c) => HEX.test(c)) };
  }
  if (bg.type === 'image') {
    if (HEX.test(bg.overlay ?? '')) return { colours: [bg.overlay.slice(0, 7)], overlay: true };
    return { unknown: 'image background' };
  }
  return { unknown: `background type ${bg.type ?? '?'}` };
}

/**
 * The colours behind `el` (worst case over gradients), or { unknown }. "Behind" = painted before it (the deck's element
 * order is its paint order: z, then insertion) with a lower or equal z, and a frame that contains the text frame.
 */
export function behind(slide, el, all) {
  const z = el.z ?? 0;
  const at0 = all.indexOf(el);
  const below = all
    .map((o, k) => ({ o, k }))
    .filter(({ o, k }) => k < at0 && (o.z ?? 0) <= z && isFrame(o.frame) && contains(o.frame, el.frame))
    .filter(({ o }) => (o.type === 'shape' && o.style?.fill) || (o.type === 'image' && o.role !== 'decor'))
    .sort((a, b) => (b.o.z ?? 0) - (a.o.z ?? 0) || b.k - a.k)
    .map(({ o }) => o);
  const at = (k) => {
    if (k >= below.length) return backgroundColours(slide.background);
    const o = below[k];
    if (o.type === 'image') return { unknown: `image "${o.id}" behind the text` };
    const fill = o.style.fill;
    const stops = (typeof fill === 'string' ? [fill] : (fill?.stops ?? []).map((s) => s.color)).filter(
      (c) => typeof c === 'string' && HEX.test(c),
    );
    if (!stops.length) return at(k + 1);
    const out = [];
    let under;
    for (const c of stops) {
      const alpha = alphaOf(c, o.style.opacity);
      if (alpha >= 1) {
        out.push(c.slice(0, 7));
        continue;
      }
      under ??= at(k + 1);
      if (!under.unknown) {
        for (const u of under.colours) out.push(blend(c.slice(0, 7), alpha, u));
      } else if (alpha > 0) {
        // over an unmeasurable layer (an image) the overlay colour itself is the backdrop, as for an image background
        out.push(c.slice(0, 7));
      }
    }
    if (!out.length) return under ?? at(k + 1);
    return { colours: [...new Set(out)], element: o.id };
  };
  return at(0);
}

export function run({ deck, brandSpec }) {
  if (!deck) return skip('no deck');
  const t = thresholds(brandSpec);
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    const all = flatElements(slide);
    for (const el of all) {
      if (el.type !== 'text' || !el.text?.font || !isFrame(el.frame) || !hasText(el)) continue;
      const font = el.text.font;
      const textColours = [
        ...new Set(
          [
            font.color,
            ...(el.text.paragraphs ?? []).flatMap((p) => (p.runs ?? []).map((r) => r.color)),
          ].filter((c) => typeof c === 'string' && HEX.test(c)),
        ),
      ];
      if (!textColours.length) continue;
      const back = behind(slide, el, all);
      if (back.unknown) {
        items.push(
          makeItem('info', `text "${el.id}" not measured: ${back.unknown}`, {
            slide,
            index,
            el,
            data: { skipped: back.unknown },
          }),
        );
        continue;
      }
      const size = el.text.fit?.appliedSize ?? font.size;
      const large = isLarge(size, font.weight ?? 400);
      const min = large ? t.large : t.body;
      let worst = null;
      for (const fg of textColours) {
        for (const bg of back.colours) {
          const ratio = contrastRatio(fg.slice(0, 7), bg);
          if (!worst || ratio < worst.ratio) worst = { fg: fg.slice(0, 7), bg, ratio };
        }
      }
      if (worst.ratio < min - 1e-9) {
        const shown = Math.floor(worst.ratio * 100) / 100;
        items.push(
          makeItem(
            'warn',
            `${worst.fg} on ${worst.bg} is ${shown}:1 (needs ${fmt(min)}:1 at ${fmt(size)} px${large ? ' large' : ''})`,
            {
              slide,
              index,
              el,
              data: {
                color: worst.fg,
                background: worst.bg,
                ratio: shown,
                min,
                minSource: large ? t.source.large : t.source.body,
                size,
                ...(back.element ? { behind: back.element } : {}),
              },
              fix: { command: 'snap-colour', args: { role: font.role ?? null } },
            },
          ),
        );
      }
    }
  }
  return result(items);
}
