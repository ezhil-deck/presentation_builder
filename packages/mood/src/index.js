// BrandSpec -> Mood: the rules of docs/P1-rules.md section B, run in order and merged (Assembly).
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import assets from './assets.cjs';
import { deepMerge, sortKeys } from './util.js';
import * as palette from './rules/palette.js';
import * as type from './rules/type.js';
import * as geometry from './rules/geometry.js';
import * as shape from './rules/shape.js';
import * as components from './rules/components.js';
import * as chartsTables from './rules/chartsTables.js';
import * as logo from './rules/logo.js';
import * as footer from './rules/footer.js';
import * as decor from './rules/decor.js';
import * as composition from './rules/composition.js';
import * as motion from './rules/motion.js';
import * as voice from './rules/voice.js';

export { toKind, KIND_MAP, KINDS } from './kindMap.js';
export { applyFontPair, basePair, fontPairList } from './fontPair.js';

export const ENGINE_VERSION = assets.version;
/** Kept for callers of the P0 stub. */
export const MOOD_VERSION = ENGINE_VERSION;

/** The rule modules in Assembly order. */
export const RULES = [
  palette,
  type,
  geometry,
  shape,
  components,
  chartsTables,
  logo,
  footer,
  decor,
  composition,
  motion,
  voice,
];

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const validateMood = ajv.compile(assets.moodSchema);

/** sha256 of the canonical (sorted-key, no whitespace) JSON of a value. */
export function canonicalHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(sortKeys(value)))
    .digest('hex');
}

/** Validate a Mood against schemas/mood.schema.json -> [{pointer, message}] (empty when valid). */
export function moodErrors(mood) {
  if (validateMood(mood)) return [];
  return validateMood.errors.map((e) => ({
    pointer: e.instancePath || '/',
    message: e.message,
    params: e.params,
  }));
}

function assertBrandSpec(brandSpec) {
  if (!brandSpec || typeof brandSpec !== 'object' || brandSpec.schema !== 'brand-spec/1') {
    throw new Error('deriveMood() expects a BrandSpec (schema "brand-spec/1")');
  }
}

/**
 * Run every rule, merge, validate. Returns { mood, questions, warnings }:
 * the Mood schema has no questions field, so the questions travel beside it (pb mood writes questions.json).
 */
export function deriveMoodResult(brandSpec) {
  assertBrandSpec(brandSpec);
  let merged = {};
  const provenance = {};
  const warnings = [];
  const seenWarnings = new Set();
  const questions = [];
  const byId = new Map();

  for (const mod of RULES) {
    const r = mod.rule(brandSpec);
    merged = deepMerge(merged, r.patch);
    Object.assign(provenance, r.provenance);
    for (const w of r.warnings) {
      // One warning per message: an unknown layout id named by several rules is warned once.
      if (seenWarnings.has(w.message)) continue;
      seenWarnings.add(w.message);
      warnings.push(w);
    }
    for (const q of r.questions) {
      const prev = byId.get(q.id);
      if (prev) {
        for (const n of q.neededBy) if (!prev.neededBy.includes(n)) prev.neededBy.push(n);
        if (q.severity === 'blocking') prev.severity = 'blocking';
      } else {
        const copy = { ...q, neededBy: [...q.neededBy] };
        byId.set(q.id, copy);
        questions.push(copy);
      }
    }
  }

  const mood = sortKeys({
    schema: 'mood/1',
    id: brandSpec.id,
    brandId: brandSpec.id,
    name: brandSpec.name,
    brandHash: canonicalHash(brandSpec),
    engineVersion: ENGINE_VERSION,
    ...merged,
    provenance: { ...provenance, '/name': { rule: 'ASSEMBLY', from: ['/name'] } },
    warnings,
  });

  const errors = moodErrors(mood);
  if (errors.length) {
    const err = new Error(
      `derived Mood for "${brandSpec.id}" is invalid against schemas/mood.schema.json:\n${errors
        .map((e) => `  ${e.pointer} ${e.message}`)
        .join('\n')}${questions.length ? `\nopen questions: ${questions.map((q) => q.id).join(', ')}` : ''}`,
    );
    err.errors = errors;
    err.questions = questions;
    throw err;
  }
  return { mood, questions, warnings };
}

/** BrandSpec -> Mood (schema mood/1), deterministic, keys sorted. Throws when the result fails the Mood schema. */
export function deriveMood(brandSpec) {
  return deriveMoodResult(brandSpec).mood;
}
