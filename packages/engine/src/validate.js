import assets from './assets.cjs';

const ajv = assets.createAjv();
// a clone without $schema (the 2020-12 Ajv class is already draft 2020-12)
const strip = (schema) => {
  const copy = JSON.parse(JSON.stringify(schema));
  delete copy.$schema;
  return copy;
};
const content = strip(assets.contentSchema);
const layout = strip(assets.layoutSchema);
const deck = strip(assets.deckSchema);
ajv.addSchema(content);
const validators = {
  content: ajv.compile({ $ref: content.$id }),
  block: ajv.compile({ $ref: `${content.$id}#/properties/slides/items/properties/blocks/items` }),
  layout: ajv.compile(layout),
  deck: ajv.compile(deck),
};

function run(name, value) {
  const fn = validators[name];
  if (fn(value)) return [];
  return (fn.errors ?? []).map((e) => ({
    pointer: e.instancePath ?? e.dataPath ?? '',
    message: `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
  }));
}

/** Validate against schemas/content.schema.json -> [{pointer, message}] (empty when valid). */
export const validateContent = (doc) => run('content', doc);
/** Validate one Content block (the `blocks[]` item schema). */
export const validateBlock = (block) => run('block', block);
/** Validate a Layout instance against schemas/layout.schema.json. */
export const validateLayout = (doc) => run('layout', doc);
/** Validate a Deck against schemas/deck.schema.json. */
export const validateDeck = (doc) => run('deck', doc);
