import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import paths from './paths.cjs';
import { escapeToken } from './pointer.js';

let ajv = null;
const compiled = new Map();

function instance() {
  if (!ajv) {
    ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
  }
  return ajv;
}

function validator(file) {
  if (!compiled.has(file)) {
    compiled.set(file, instance().compile(JSON.parse(readFileSync(file, 'utf8'))));
  }
  return compiled.get(file);
}

/**
 * ajv errors -> [{pointer, message, keyword}], the pointer naming the offending key where ajv knows it.
 * Duplicates (same pointer + message, e.g. from several schema branches) are listed once.
 */
export function toErrorList(errors) {
  const seen = new Set();
  const list = (errors ?? []).map((e) => {
    let pointer = e.instancePath;
    let message = e.message;
    if (e.keyword === 'required') {
      pointer += `/${escapeToken(e.params.missingProperty)}`;
      message = 'is required';
    } else if (e.keyword === 'additionalProperties') {
      pointer += `/${escapeToken(e.params.additionalProperty)}`;
      message = 'is not allowed by the schema';
    } else if (e.keyword === 'enum') {
      message = `${e.message}: ${e.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
    }
    return { pointer, message, keyword: e.keyword };
  });
  return list.filter((e) => {
    const key = `${e.pointer}\u0000${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const strip = (list) => list.map(({ pointer, message }) => ({ pointer, message }));

function check(file, value) {
  const validate = validator(file);
  return validate(value) ? [] : toErrorList(validate.errors);
}

/**
 * Every violation of `input` against schemas/input/brand-presentation-spec.schema.json, as
 * [{pointer, message, keyword}] ([] when valid). See splitInputErrors() for the D1 policy.
 */
export function inputViolations(input) {
  return check(paths.INPUT_SCHEMA_FILE, input);
}

/**
 * D1 (P1-rules §D): an `additionalProperties` violation (an unknown key) is a warning - the key is ignored -, every
 * other violation (`type`, `enum`, `required`, `pattern`, ...) stays an error.
 * Returns `{ errors: [{pointer, message}], unknown: [{pointer, message}] }`.
 */
export function splitInputErrors(violations) {
  const unknown = violations.filter((e) => e.keyword === 'additionalProperties');
  const errors = violations.filter((e) => e.keyword !== 'additionalProperties');
  return { errors: strip(errors), unknown: strip(unknown) };
}

/** Errors (not unknown keys, D1) of `input` against the input schema ([] when valid). */
export function validateInput(input) {
  return splitInputErrors(inputViolations(input)).errors;
}

/** Violations of `spec` against schemas/brand-spec.schema.json, with the ajv keyword ([] when valid). */
export function brandSpecViolations(spec) {
  return check(paths.BRANDSPEC_SCHEMA_FILE, spec);
}

/** Errors of `spec` against schemas/brand-spec.schema.json ([] when valid). */
export function validateBrandSpec(spec) {
  return strip(brandSpecViolations(spec));
}
