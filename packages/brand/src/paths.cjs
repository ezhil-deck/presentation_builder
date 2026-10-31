// Repository paths, module-relative under both Node ESM (CJS interop) and jest (babel -> CJS), without
// import.meta (does not parse under babel's CJS output) or import attributes.
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

module.exports = {
  REPO_ROOT,
  INPUT_SCHEMA_FILE: join(REPO_ROOT, 'schemas', 'input', 'brand-presentation-spec.schema.json'),
  BRANDSPEC_SCHEMA_FILE: join(REPO_ROOT, 'schemas', 'brand-spec.schema.json'),
  FONT_METRICS_CACHE_DIR: join(REPO_ROOT, '.cache', 'fontmetrics'),
};
