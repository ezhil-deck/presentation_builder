/** fitText: step a role down to fit.min until the text fits its frame (P2-spec §3.4). */
import { deckFont, resolve } from '../compose/resolve.js';
import { r2 } from '../util/stable.js';
import { layoutText } from './lines.js';

/** The step a role may take: fit.step; without one, a single jump to fit.min. */
function stepOf(font) {
  const min = font.fit?.min ?? font.size;
  const step = font.fit?.step ?? font.size - min;
  return { min, step: step > 0 ? step : 0 };
}

/**
 * fitTextFont(paragraphs, frame, font, {align, valign, bullets, size, allowBelowMin}) -> {text, warnings}
 * `size` forces one size (shared sizing: no stepping). `text` is the deck element's `text` object; `text.fit.height`
 * is the laid-out block height (px).
 */
export function fitTextFont(paragraphs, frame, font, opts = {}) {
  const requested = font.size;
  const { min, step } = stepOf(font);
  let size = opts.size ?? requested;
  const layoutWarnings = [];
  const run = (s) => layoutText(paragraphs, frame, { ...font, size: s }, { ...opts, warnings: [] });
  let res = run(size);
  // a forced (shared) size counts the steps it stands for
  let steps = opts.size !== undefined && step > 0 ? Math.round((requested - size) / step) : 0;
  if (opts.size === undefined && step > 0) {
    // F1: step by fit.step; when the next step would pass fit.min, fit.min is the last size (the floor is reachable)
    while (res.overflow && size > min + 1e-9) {
      size = Math.max(min, r2(size - step));
      steps += 1;
      res = run(size);
    }
    if (opts.allowBelowMin) {
      while (res.overflow && r2(size - step) >= 1) {
        size = r2(size - step);
        steps += 1;
        res = run(size);
      }
    }
  }
  // the final layout once more, collecting its warnings (long words at the applied size only)
  res = layoutText(paragraphs, frame, { ...font, size }, { ...opts, warnings: layoutWarnings });
  const text = {
    paragraphs,
    font: deckFont({ ...font, size }),
    align: opts.align ?? 'left',
    valign: opts.valign ?? 'top',
    fit: {
      requestedSize: requested,
      appliedSize: size,
      overflow: res.overflow,
      steps,
      height: r2(res.height),
    },
    lines: res.lines,
    autofit: true,
  };
  const warnings = [...layoutWarnings];
  if (res.overflow) {
    warnings.push({
      check: 'overflow',
      severity: 'warn',
      message: `text overflows its ${r2(frame.w)}×${r2(frame.h)} frame at ${size}px (role ${font.role ?? '?'}, fit.min ${min})`,
      fix: { command: 'fitText', args: { allowBelowMin: true } },
    });
  }
  return { text, warnings };
}

/**
 * fitText(paragraphs, frame, role, mood, surface, opts) -> {text, warnings}: start at role.size; while overflow and
 * size > fit.min, size = max(fit.min, size − step) (F1); overflow left -> an `overflow` warning with the one-click `fitText` fix.
 * `role` is a role name (resolved on `surface`) or an already resolved font.
 */
export function fitText(paragraphs, frame, role, mood, surface, opts = {}) {
  const R = opts.resolver ?? resolve(mood, surface, { warn: opts.warn });
  const font = typeof role === 'string' ? R.font(role) : role;
  if (!font) throw new Error(`fitText(): no type role "${role}" in the Mood`);
  return fitTextFont(paragraphs, frame, font, opts);
}
