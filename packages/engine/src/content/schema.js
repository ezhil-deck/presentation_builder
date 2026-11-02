/** Validators for the content/2 parts of schemas/content.schema.json (one block / one slide of a content/2 document). */
import assets from '../assets.cjs';
import { BLOCK_TYPES } from './blocks.js';

const ajv = assets.createAjv();
const schema = JSON.parse(JSON.stringify(assets.contentSchema));
delete schema.$schema;
ajv.addSchema(schema);
const compile = (def) => ajv.compile({ $ref: `${schema.$id}#/$defs/${def}` });
const compiled = { blockV2: compile('blockV2'), slideV2: compile('slideV2') };
// per block type, so an error names the field of that type, not every oneOf branch
for (const type of BLOCK_TYPES) compiled[type] = compile(type);

function run(name, value) {
  const fn = compiled[name];
  if (fn(value)) return [];
  return (fn.errors ?? []).map((e) => ({
    pointer: e.instancePath ?? '',
    message: `${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
  }));
}

/** One content/2 block -> [{pointer, message}] (empty when valid); a known type is checked against its own definition. */
export const validateBlockV2 = (block) =>
  run(BLOCK_TYPES.includes(block?.type) ? block.type : 'blockV2', block);
/** One content/2 slide -> [{pointer, message}] (empty when valid). */
export const validateSlideV2 = (slide) => run('slideV2', slide);
/** The content/2 JSON-schema `$id`. */
export const CONTENT_SCHEMA_ID = schema.$id;
