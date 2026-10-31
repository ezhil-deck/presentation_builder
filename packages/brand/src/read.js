/** BR-READ: load `<dir>/<basename>.json`, apply `answers.json`, validate against the input schema. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isUnder, parsePointer, setAt, toPointer } from './pointer.js';
import { inputViolations, splitInputErrors } from './validate.js';

/**
 * The brand input cannot be used. `errors` = [{pointer, message, file?}].
 * `questions` = what the brand would need answered (once known); `needsAnswers` = true when every error is a value
 * the input does not give (a `required` key), so answers.json can fix it - D7: `pb` exits 2 then, 1 otherwise.
 */
export class BrandInputError extends Error {
  constructor(message, errors = [], extra = {}) {
    const list = errors.map((e) => `  ${e.pointer || '/'}: ${e.message}`).join('\n');
    super(list ? `${message}\n${list}` : message);
    this.name = 'BrandInputError';
    this.errors = errors;
    this.questions = [];
    this.needsAnswers = false;
    Object.assign(this, extra);
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function parseJson(file, buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new BrandInputError(`not valid JSON: ${file}`, [{ pointer: '', message: err.message }]);
  }
}

/** A required-but-missing value (D7) as a blocking question at its input pointer. */
export function requiredQuestion(pointer, neededBy = 'BR-READ') {
  return {
    id: pointer.slice(1).split('/').join('.'),
    pointer,
    question: `${pointer} is required and not given; what is it?`,
    neededBy: [neededBy],
    severity: 'blocking',
  };
}

/** Delete the key at `pointer` (its parent must be an object). */
function deleteAt(doc, pointer) {
  const tokens = parsePointer(pointer);
  let node = doc;
  for (const token of tokens.slice(0, -1)) {
    if (node === null || typeof node !== 'object') return;
    node = Array.isArray(node) ? node[Number(token)] : node[token];
  }
  if (node !== null && typeof node === 'object' && !Array.isArray(node))
    delete node[tokens[tokens.length - 1]];
}

// /a/3/b and /a/7/b -> /a/<star>/b (array indices as *): the pattern an unknown key is listed under, once.
function keyPattern(pointer) {
  return toPointer(parsePointer(pointer).map((t) => (/^\d+$/.test(t) ? '*' : t)));
}

/**
 * Read and validate a brand folder. Returns
 * `{ dir, id, file, sha256, version, input, answers, ignored }` where `input` already has answers.json applied,
 * `answers` = the answered JSON pointers (into the input) in file order and `ignored` = the D1 warnings: keys the
 * input schema does not allow, removed from `input` and listed once per key pattern. A key set by answers.json is
 * never removed (D5: answers go to the questions' input pointers, some of which the reference schema lacks).
 * Throws BrandInputError (with `errors`) when the folder, the JSON or the schema check fails (type / enum /
 * required / pattern ...).
 */
export function readInput(dir) {
  const brandDir = resolve(dir);
  if (!existsSync(brandDir) || !statSync(brandDir).isDirectory()) {
    throw new BrandInputError(`brand folder not found: ${brandDir}`);
  }
  const id = basename(brandDir);
  const file = join(brandDir, `${id}.json`);
  if (!existsSync(file)) {
    throw new BrandInputError(`brand input not found: expected ${id}.json in ${brandDir}`);
  }
  const raw = readFileSync(file);
  const input = parseJson(file, raw);
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BrandInputError(`brand input must be a JSON object: ${file}`, [
      { pointer: '', message: 'must be object' },
    ]);
  }

  const answers = [];
  const answersFile = join(brandDir, 'answers.json');
  if (existsSync(answersFile)) {
    const given = parseJson(answersFile, readFileSync(answersFile));
    if (given === null || typeof given !== 'object' || Array.isArray(given)) {
      throw new BrandInputError(`answers.json must be an object of JSON pointer -> value: ${answersFile}`);
    }
    const bad = [];
    for (const [pointer, value] of Object.entries(given)) {
      try {
        setAt(input, pointer, value);
        answers.push(pointer);
      } catch (err) {
        bad.push({ pointer, message: `answers.json: ${err.message}` });
      }
    }
    if (bad.length) throw new BrandInputError(`answers.json cannot be applied: ${answersFile}`, bad);
  }

  const violations = inputViolations(input);
  const { errors, unknown } = splitInputErrors(violations);
  if (typeof input.id === 'string' && input.id !== id) {
    errors.unshift({ pointer: '/id', message: `must equal the folder name "${id}" (is "${input.id}")` });
  }
  if (errors.length) {
    // D7: a missing required key is something answers.json can give: a question beside the error.
    const required = violations.filter((v) => v.keyword === 'required');
    throw new BrandInputError(`brand input ${id}.json is invalid (${errors.length} error(s))`, errors, {
      questions: required.map((v) => requiredQuestion(v.pointer)),
      needsAnswers: required.length === errors.length,
    });
  }

  // D1: unknown keys are ignored (removed before BR-NORMALIZE) and warned once per key pattern.
  const byPattern = new Map();
  for (const u of unknown) {
    if (answers.some((a) => isUnder(u.pointer, a))) continue;
    deleteAt(input, u.pointer);
    const pattern = keyPattern(u.pointer);
    if (!byPattern.has(pattern)) byPattern.set(pattern, []);
    byPattern.get(pattern).push(u.pointer);
  }
  const ignored = [...byPattern.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([pointer, where]) => ({
      pointer,
      message:
        'key not allowed by the input schema (D1): ignored' +
        (where.length > 1 || where[0] !== pointer ? `: ${where.length} occurrence(s), e.g. ${where[0]}` : ''),
    }));

  return { dir: brandDir, id, file, sha256: sha256(raw), version: input.version, input, answers, ignored };
}
