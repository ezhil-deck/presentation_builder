/**
 * Collects the names the five schemas (+ the input format, + the template record since V1) give things: every `enum` and every string `const`, by
 * JSON pointer path. maps.json maps each path's values to one vocabulary term, or excludes the path with its reason;
 * __tests__/maps.test.js collects the paths afresh from the schema files, so a schema that gains a name without a map
 * fails (D11, docs/PLAN-template-library.md §8).
 */

/** The schema files, by the short name maps.json uses. Paths are relative to the repository root. */
export const SCHEMA_FILES = Object.freeze({
  deck: 'schemas/deck.schema.json',
  layout: 'schemas/layout.schema.json',
  content: 'schemas/content.schema.json',
  mood: 'schemas/mood.schema.json',
  brand: 'schemas/brand-spec.schema.json',
  input: 'schemas/input/brand-presentation-spec.schema.json',
  template: 'schemas/template.schema.json',
});

/** Every `enum` (its string values) and string `const` of a parsed schema: [{path: '#/...', values: [...]}]. */
export function collectEnums(schema) {
  const out = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((x, i) => walk(x, `${path}/${i}`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.enum)) {
      const values = node.enum.filter((v) => typeof v === 'string');
      if (values.length) out.push({ path, values });
    }
    if (typeof node.const === 'string') out.push({ path: `${path}/const`, values: [node.const] });
    for (const [k, v] of Object.entries(node)) if (k !== 'enum' && k !== 'const') walk(v, `${path}/${k}`);
  };
  walk(schema, '#');
  return out;
}

/** The property names of the object at a JSON pointer path (`#/properties/components/properties`). */
export function keysAt(schema, path) {
  let node = schema;
  for (const part of path.replace(/^#\/?/, '').split('/').filter(Boolean)) {
    node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) return null;
  }
  return node && typeof node === 'object' ? Object.keys(node) : null;
}
