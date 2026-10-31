// JSON + the schema validator the engine needs at run time, loaded through require so paths are module-relative under
// both Node ESM (CJS interop) and jest (babel -> CJS), without import attributes or import.meta (same as @pb/mood).
//
// Validator: ajv 8 (draft 2020-12), a dependency of @pb/engine (P2-spec §7 F7).
const Ajv2020 = require('ajv/dist/2020.js');

const Ctor = Ajv2020.default ?? Ajv2020;
const createAjv = () => new Ctor({ allErrors: true, allowUnionTypes: true, strict: false });

module.exports = {
  createAjv,
  contentSchema: require('../../../schemas/content.schema.json'),
  layoutSchema: require('../../../schemas/layout.schema.json'),
  deckSchema: require('../../../schemas/deck.schema.json'),
  version: require('../package.json').version,
};
