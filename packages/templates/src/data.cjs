// The template record files (packages/templates/data/*.json) and the schema, read once on first use: module-relative
// under both Node ESM (CJS interop) and jest (babel -> CJS), as packages/vocabulary/src/data.cjs.
const { readdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const DATA = join(__dirname, '..', 'data');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCHEMA_FILE = join(REPO_ROOT, 'schemas', 'template.schema.json');
let files = null;
let schema = null;

module.exports = {
  DATA,
  REPO_ROOT,
  SCHEMA_FILE,
  /** {file: parsed} for every .json in data/ (catalogue.json first, then the authored files by name). */
  files: () => {
    if (!files) {
      files = {};
      const names = readdirSync(DATA)
        .filter((f) => f.endsWith('.json'))
        .sort((a, b) => (a === 'catalogue.json' ? -1 : b === 'catalogue.json' ? 1 : a < b ? -1 : 1));
      for (const f of names) files[f] = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    }
    return files;
  },
  /** {file: parsed} for every .json in data/ except catalogue.json (the hand-authored records), by name. */
  authoredFiles: () => {
    if (files) {
      const out = {};
      for (const [f, v] of Object.entries(files)) if (f !== 'catalogue.json') out[f] = v;
      return out;
    }
    const out = {};
    const names = readdirSync(DATA)
      .filter((f) => f.endsWith('.json') && f !== 'catalogue.json')
      .sort();
    for (const f of names) out[f] = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    return out;
  },
  schema: () => {
    if (!schema) schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
    return schema;
  },
};
