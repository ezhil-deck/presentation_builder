/**
 * Design-quality proposals (docs/P3-proposals.md), each behind its own `composeDeck({ proposals })` option and off by
 * default (the golden decks are composed with every proposal off). Each proposal names its brand signal; what a
 * proposal changed is recorded per slide (`effects`) for the build report.
 *   PR-4 titleClearOfDecor   cover / section / cta text keeps clear of front-layer brand-boxed decor
 *   PR-6 templateBinding     cover / section / cta / statement drawn from the authored template the brand fills
 *                            best (compose/templateBind.js; needs `brandSpec.capabilities`, docs/PLAN-template-library.md V3)
 * Approved by the owner and now rules of every build (docs/P2-spec.md §9): PR-1 fit-up (fitup.js), PR-2 avatar
 * initials and PR-3 logo chips (slots.js), approved 2026-10-31; PR-F fill room and PR-C′ recorded placement, approved
 * 2026-11-03, now rules of every build (docs/P2-spec.md §9 R-FILLROOM, R-PLACE: slots.js fill, place.js, the catalogue
 * layouts' recorded alignment in packages/layouts catalogue-defs.js).
 */
import { r2 } from '../util/stable.js';

export const PROPOSALS = Object.freeze({
  titleClearOfDecor: 'PR-4',
  templateBinding: 'PR-6',
});
export const PROPOSAL_KEYS = Object.freeze(Object.keys(PROPOSALS));

/**
 * `proposals` option → {titleClearOfDecor} booleans. Accepts an object of booleans, `true` / 'all' (every proposal),
 * or a list of keys / ids ('pr4', 'PR-4', 'titleClearOfDecor', …). Anything else → all off.
 */
export function normalizeProposals(opt) {
  const out = Object.fromEntries(PROPOSAL_KEYS.map((k) => [k, false]));
  if (!opt) return out;
  if (opt === true || opt === 'all') return Object.fromEntries(PROPOSAL_KEYS.map((k) => [k, true]));
  const list = Array.isArray(opt) ? opt : typeof opt === 'string' ? opt.split(',') : null;
  if (list) {
    for (const raw of list) {
      const key = proposalKey(raw);
      if (key === 'all') return normalizeProposals('all');
      if (key) out[key] = true;
    }
    return out;
  }
  for (const k of PROPOSAL_KEYS) out[k] = opt[k] === true;
  return out;
}

/**
 * 'pr4' | 'PR-4' | a letter id ('prx' | 'PR-X') | an option key | 'all' → the option key ('all' kept); unknown
 * (incl. the approved PR-1..3, PR-F and PR-C′, rules of every build) → null.
 */
export function proposalKey(raw) {
  const s = String(raw).trim();
  if (!s) return null;
  if (s.toLowerCase() === 'all') return 'all';
  if (PROPOSAL_KEYS.includes(s)) return s;
  const m = /^pr-?([0-9a-z])$/i.exec(s);
  if (!m) return null;
  return PROPOSAL_KEYS.find((k) => PROPOSALS[k] === `PR-${m[1].toUpperCase()}`) ?? null;
}

export const anyProposal = (p) => PROPOSAL_KEYS.some((k) => p?.[k]);

// ---------------------------------------------------------------------------------------------------------------
// PR-4 clear of brand-boxed decor

/** The kinds whose text keeps clear of front-layer brand-boxed decor. */
export const CLEAR_OF_DECOR_KINDS = new Set(['cover', 'section', 'cta']);

/** Names (decor element ids) of the Mood's decor placed by an absolute brand `box` on the front layer. */
export function frontBoxedDecor(mood) {
  return new Set(
    (mood.decor?.elements ?? [])
      .filter(
        (e) =>
          e.layer === 'front' && e.box && ['x', 'y', 'w', 'h'].every((k) => typeof e.box[k] === 'number'),
      )
      .map((e) => e.id),
  );
}

/** The content frame: the canvas inset by geometry.margins. */
export function contentFrame(mood, canvas = { width: 1920, height: 1080 }) {
  const m = mood.geometry?.margins ?? {};
  const left = m.left ?? 0;
  const right = m.right ?? 0;
  const top = m.top ?? 0;
  const bottom = m.bottom ?? 0;
  return { x: left, y: top, w: canvas.width - left - right, h: canvas.height - top - bottom };
}

/**
 * PR-4: a text box `f` that intersects decor frame `d` is narrowed to the free side (left of the decor when the decor's
 * centre is right of the content centre, else right of it), never below 50 % of the content width. Returns the new
 * frame, or null when it cannot narrow (no intersection, or the box is already at / below the floor).
 */
export function clearOfDecor(f, d, content) {
  const hit = f.x < d.x + d.w && d.x < f.x + f.w && f.y < d.y + d.h && d.y < f.y + f.h;
  if (!hit) return null;
  const floor = 0.5 * content.w;
  if (d.x + d.w / 2 > content.x + content.w / 2) {
    const w = Math.max(floor, d.x - f.x);
    return w < f.w - 1e-9 ? { ...f, w: r2(w) } : null;
  }
  const w = Math.max(floor, f.x + f.w - (d.x + d.w));
  return w < f.w - 1e-9 ? { ...f, x: r2(f.x + f.w - w), w: r2(w) } : null;
}
