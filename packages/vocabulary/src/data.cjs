// The vocabulary data files (packages/vocabulary/data/vocabulary.json, maps.json), read once on first use:
// module-relative under both Node ESM (CJS interop) and jest (babel -> CJS), without import.meta or import attributes
// (as packages/layouts/src/catalogue-data.cjs).
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const DATA = join(__dirname, '..', 'data');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const cache = {};
const load = (name) => {
  if (!cache[name]) cache[name] = JSON.parse(readFileSync(join(DATA, name), 'utf8'));
  return cache[name];
};

module.exports = {
  DATA,
  REPO_ROOT,
  VOCABULARY_FILE: join(DATA, 'vocabulary.json'),
  MAPS_FILE: join(DATA, 'maps.json'),
  vocabulary: () => load('vocabulary.json'),
  maps: () => load('maps.json'),
};
