import { createHash } from 'node:crypto';

/** Deep copy with object keys sorted (arrays keep their order); undefined values dropped. */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

export const stableStringify = (value) => JSON.stringify(sortKeys(value));
export const sha1 = (text) => createHash('sha1').update(text).digest('hex');

/** Round to 2 decimals (all geometry the engine writes), -0 -> 0. */
export function r2(n) {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}
