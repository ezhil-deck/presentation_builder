import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const REPO = join(__dirname, '..', '..', '..');

// ajv 8 (draft 2020-12) is a dependency of @pb/layouts (P2-spec §7 F7).
const Ajv2020 = createRequire(join(REPO, 'packages', 'layouts', 'package.json'))('ajv/dist/2020.js').default;

/** Slim copies of out/<id>/mood.json (glyph width tables removed; layouts read only avgCharWidth). */
export function loadMood(id) {
  return JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', `${id}.mood.json`), 'utf8'));
}

/** Every out/<id>/mood.json present on this machine (git-ignored run outputs; may be none). */
export function outMoods() {
  const dir = join(REPO, 'out');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'mood.json')))
    .map((d) => JSON.parse(readFileSync(join(dir, d, 'mood.json'), 'utf8')));
}

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: false });
export const validateLayout = ajv.compile(
  JSON.parse(readFileSync(join(REPO, 'schemas', 'layout.schema.json'), 'utf8')),
);

export const errorsOf = (v) => (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
