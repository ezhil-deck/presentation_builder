// The generated catalogue layout records (packages/layouts/data/catalogue-layouts.json, scripts/catalogue-layouts.mjs),
// read once on first use: module-relative under both Node ESM (CJS interop) and jest (babel -> CJS), without
// import.meta or import attributes (as packages/engine/src/assets.cjs). Importing @pb/layouts never reads the file.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const FILE = join(__dirname, '..', 'data', 'catalogue-layouts.json');
let cache = null;

module.exports = {
  FILE,
  /** The parsed file ({source, grid, bands, roles, records}), read on the first call. */
  load() {
    if (!cache) cache = JSON.parse(readFileSync(FILE, 'utf8'));
    return cache;
  },
};
