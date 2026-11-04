/**
 * Fit-up (rule, approved 2026-10-31 from proposal PR-1; docs/P2-spec.md §9): the main text of a text / bullets /
 * agenda / two-column / image-text / quote slide that fills less than 45 % of its box steps UP the brand's own role
 * ladder (type.roles body → bodyLarge → h3 → h2, only roles the Mood defines, each with its own lineHeight) while it
 * still fits and stays ≤ 60 % of the box; never beyond h2. Signal: the brand's role ladder. Recorded in
 * `text.fit.upSteps` / `upRole`; titles, subtitles, eyebrows, attributions and flow items never grow.
 */
import { layoutText } from '../fit/lines.js';
import { fitTextFont } from '../fit/text.js';
import { r2 } from '../util/stable.js';

/** The slide kinds whose main text slot may grow (the catalogue kind; comparison → two-column). */
export const FIT_UP_KINDS = new Set(['text', 'bullets', 'agenda', 'two-column', 'image-text', 'quote']);
/** Layout box roles that are a slide's main text (titles, subtitles, eyebrows, attributions never grow). */
export const FIT_UP_BOX_ROLES = new Set(['body', 'list', 'quote']);
/** The brand role ladder fit-up climbs, in order; never beyond h2. */
export const FIT_UP_LADDER = Object.freeze(['body', 'bodyLarge', 'h3', 'h2']);
/** Grow only when the fitted block fills less than this share of its box … */
export const FIT_UP_BELOW = 0.45;
/** … and only while it stays within this share. */
export const FIT_UP_MAX = 0.6;

/**
 * The sizes fit-up may step to from `size`: the ladder roles the Mood defines (type.roles), larger than `size` and no
 * larger than h2's size, ascending, one per size (the first role in ladder order names it). Each step carries its
 * role's own lineHeight.
 */
export function fitUpLadder(mood, size) {
  const roles = mood.type?.roles ?? {};
  const cap = typeof roles.h2?.size === 'number' ? roles.h2.size : Infinity;
  const seen = new Set();
  return FIT_UP_LADDER.filter((r) => typeof roles[r]?.size === 'number')
    .map((r) => ({ role: r, size: roles[r].size, lineHeight: roles[r].lineHeight }))
    .filter((c) => c.size > size + 1e-9 && c.size <= cap + 1e-9)
    .sort((a, b) => a.size - b.size)
    .filter((c) => (seen.has(c.size) ? false : (seen.add(c.size), true)));
}

const bulletsOpt = (mood) =>
  typeof mood.type?.bullets?.indent === 'number' ? { indent: mood.type.bullets.indent } : undefined;

/**
 * How far one fitted text element may climb: null when it is not short (block ≥ 45 % of its box, or it overflowed /
 * stepped down); else the accepted ladder steps (a prefix of the ladder: each fits and stays ≤ 60 % of the box).
 */
export function fitUpSteps(el, font, mood) {
  const f = el.text?.fit;
  if (!f || f.overflow || f.steps > 0 || !(el.frame.h > 0)) return null;
  if (!(f.height < FIT_UP_BELOW * el.frame.h)) return null;
  const accepted = [];
  for (const c of fitUpLadder(mood, f.appliedSize)) {
    const lh = typeof c.lineHeight === 'number' ? c.lineHeight : font.lineHeight;
    const res = layoutText(
      el.text.paragraphs,
      el.frame,
      { ...font, size: c.size, lineHeight: lh },
      { align: el.text.align, valign: el.text.valign, bullets: bulletsOpt(mood), warnings: [] },
    );
    if (res.overflow || res.height > FIT_UP_MAX * el.frame.h + 1e-9) break;
    accepted.push({ ...c, lineHeight: lh, height: res.height });
  }
  return accepted.length ? accepted : null;
}

/**
 * Fit-up over one slide's main text elements (`mains`: text elements of FIT_UP_BOX_ROLES slots). They share one size
 * (two-column: both bodies), so the slide grows to the largest step every one of them accepts. Elements are updated
 * in place: size + the target role's lineHeight; `text.fit.requestedSize` stays the role's size, `upSteps` /
 * `upRole` record the step. Returns one record per element grown (for the build report).
 */
export function applyFitUp(mains, ctx) {
  if (!mains.length) return [];
  const plans = [];
  for (const el of mains) {
    const font = ctx.R.font(el.text.font.role);
    if (!font) return [];
    const steps = fitUpSteps(el, font, ctx.mood);
    if (!steps) return [];
    plans.push({ el, font, steps });
  }
  const size = Math.min(...plans.map((p) => p.steps[p.steps.length - 1].size));
  const effects = [];
  for (const { el, font, steps } of plans) {
    // the largest step of this element's ladder at most the shared size (elements in different roles - a catalogue
    // layout's list and paragraph - climb different ladders: one may have no step at exactly that size)
    let k = -1;
    steps.forEach((s, i) => {
      if (s.size <= size + 1e-9) k = i;
    });
    if (k < 0) continue;
    const step = steps[k];
    const before = {
      size: el.text.fit.appliedSize,
      lineHeight: el.text.font.lineHeight,
      height: el.text.fit.height,
    };
    const color = el.text.font.color;
    const { text } = fitTextFont(
      el.text.paragraphs,
      el.frame,
      { ...font, size: step.size, lineHeight: step.lineHeight },
      { align: el.text.align, valign: el.text.valign, size: step.size, bullets: bulletsOpt(ctx.mood) },
    );
    text.font.color = color;
    text.fit.requestedSize = font.size;
    text.fit.upSteps = k + 1;
    text.fit.upRole = step.role;
    el.text = text;
    effects.push({
      element: el.id,
      role: font.role,
      from: before.size,
      to: step.size,
      lineHeight: { from: before.lineHeight, to: text.font.lineHeight },
      upRole: step.role,
      upSteps: k + 1,
      fill: { from: r2(before.height / el.frame.h), to: r2(text.fit.height / el.frame.h) },
    });
  }
  return effects;
}
