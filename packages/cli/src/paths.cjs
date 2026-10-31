// Repository paths, module-relative under both Node ESM (CJS interop) and jest (babel -> CJS), without import.meta.
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

module.exports = {
  REPO_ROOT,
  GOLDEN_BRANDS: join(REPO_ROOT, 'golden', 'brands'),
  GOLDEN_EXPECTED: join(REPO_ROOT, 'golden', 'expected'),
};
