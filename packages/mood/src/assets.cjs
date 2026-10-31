// JSON the engine needs at run time, loaded through require so the path is module-relative under both
// Node ESM (CJS interop) and jest (babel -> CJS) without import attributes or import.meta.
module.exports = {
  moodSchema: require('../../../schemas/mood.schema.json'),
  version: require('../package.json').version,
};
