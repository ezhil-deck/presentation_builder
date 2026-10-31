// Small helpers shared by the rule modules.

/** JSON pointer from path parts (RFC 6901 escaping). */
export function ptr(...parts) {
  return `/${parts.map((p) => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

export function isObj(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function has(obj, key) {
  return isObj(obj) && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Empty rule result. Every rule returns this shape. */
export function newResult() {
  return { patch: {}, provenance: {}, warnings: [], questions: [] };
}

/**
 * BrandSpec pointer -> the input pointer where an answer goes (D5: answers.json keys are input pointers).
 * The inverse of BR-NORMALIZE's field map; a pointer the map does not rename is the same in both.
 */
const TO_INPUT = [
  ['/typography/roles', '/typography/styles'],
  ['/typography/faces', '/typography/fonts'],
  ['/logos/variants', '/brand/logos'],
  ['/logos', '/brand/logoRules'],
  ['/colors/named', '/colors/custom'],
  ['/colors/gradients', '/gradients'],
  ['/components/cards', '/cards'],
  ['/components/icons', '/icons'],
  ['/imagery/masks', '/masks'],
  ['/backgrounds/rhythm', '/backgrounds/rhythm/sequence'],
  ['/decor', '/assets'],
  ['/brandLayouts', '/layouts'],
  ['/layout/canvas', '/layout'],
  ['/name', '/brand/name'],
  ['/tagline', '/brand/tagline'],
];

export function toInputPointer(pointer) {
  for (const [from, to] of TO_INPUT) {
    if (pointer === from || pointer.startsWith(`${from}/`)) return to + pointer.slice(from.length);
  }
  return pointer;
}

/** A collector bound to one rule id, so rule code stays short. */
export function collector(rule) {
  const res = newResult();
  return {
    res,
    prov(moodPointer, from, note) {
      const entry = { rule, from: [...new Set(from)] };
      if (note) entry.note = note;
      res.provenance[moodPointer] = entry;
    },
    warn(pointer, message) {
      res.warnings.push({ rule, pointer, message });
    },
    /**
     * `pointer` is the BrandSpec pointer of the missing value; the question carries the input pointer (D5).
     * `id` defaults to the pointer's tokens joined by dots.
     */
    ask(pointer, question, { severity = 'blocking', options, id } = {}) {
      const q = {
        id: id ?? pointer.slice(1).split('/').join('.'),
        pointer: toInputPointer(pointer),
        question,
        neededBy: [rule],
        severity,
      };
      if (options) q.options = options;
      res.questions.push(q);
    },
  };
}

/**
 * Flatten a free-form brand block into component tokens (string | number | boolean values only).
 * Nested objects and arrays become dotted keys ("border.width", "padding.0"): lossless, no interpretation.
 */
export function flattenTokens(value, prefix = '', out = {}, skipped = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenTokens(v, prefix ? `${prefix}.${i}` : String(i), out, skipped));
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) flattenTokens(v, prefix ? `${prefix}.${k}` : k, out, skipped);
  } else if (['string', 'number', 'boolean'].includes(typeof value)) {
    out[prefix] = value;
  } else if (value !== undefined) {
    skipped.push(prefix);
  }
  return out;
}

/** Recursively sort object keys (arrays keep their order). */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObj(value)) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

/** Deep merge of plain objects; b wins on leaves; arrays are replaced. */
export function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return clone(b);
  const out = { ...a };
  for (const [k, v] of Object.entries(b))
    out[k] = has(out, k) && isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : clone(v);
  return out;
}

/** Copy only the keys present in src. */
export function pick(src, keys) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of keys) if (has(src, k)) out[k] = clone(src[k]);
  return out;
}
