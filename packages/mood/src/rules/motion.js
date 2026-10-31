// MD-MOTION: family from transition + duration; transition, build, duration, easing, stagger copied. No block -> absent.
import { collector, has, isObj, pick, ptr } from '../util.js';

export const RULE = 'MD-MOTION';

/** family from the brand's transition name and duration (ms). */
export function familyOf(transition, duration) {
  const t = typeof transition === 'string' ? transition.toLowerCase() : undefined;
  const d = typeof duration === 'number' ? duration : undefined;
  if (t === 'none') return 'calm';
  if (['wipe', 'slide', 'push'].includes(t) || (d !== undefined && d < 200)) return 'crisp';
  if (['fade', 'dissolve'].includes(t) && d !== undefined && d >= 250) return 'soft';
  return 'neutral';
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const m = brandSpec.motion;
  if (!isObj(m)) {
    c.res.patch = {};
    return c.res;
  }
  const motion = pick(m, ['transition', 'build', 'duration', 'easing', 'stagger']);
  for (const k of Object.keys(motion)) c.prov(ptr('motion', k), [ptr('motion', k)]);
  if (has(m, 'transition') || has(m, 'duration')) {
    motion.family = familyOf(m.transition, m.duration);
    c.prov(
      ptr('motion', 'family'),
      ['transition', 'duration'].filter((k) => has(m, k)).map((k) => ptr('motion', k)),
      `transition ${m.transition ?? '(not given)'}, duration ${m.duration ?? '(not given)'}`,
    );
  } else {
    c.warn(ptr('motion'), 'motion gives neither transition nor duration: no motion family');
  }
  c.res.patch = { motion };
  return c.res;
}
