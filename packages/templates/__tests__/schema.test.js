// D11 for the template record: every enum of schemas/template.schema.json is the vocabulary's own list (role = E2,
// category = E3 slide kinds, primitive = E1, treatment / image treatment / mask = E4, structure = E3 non-kinds), and
// every enum value maps to exactly one term in packages/vocabulary/data/maps.json (source system `template`) or its
// path / value is excluded there with a reason - collected afresh from the schema, as the vocabulary's maps test does.
import { collectEnums, maps, termFor, terms } from '@pb/vocabulary';
import data from '../src/data.cjs';

const schema = data.schema();
const list = (ns, group) =>
  terms(ns)
    .filter((t) => !group || t.group === group)
    .map((t) => t.term);
const kinds = list('E3', 'kind');

describe('the enums are the vocabulary', () => {
  test('role = E2, category = E3 slide kinds + unknown, primitive = E1', () => {
    expect(schema.$defs.role.enum).toEqual(list('E2'));
    expect(schema.$defs.category.enum).toEqual([...kinds, 'unknown']);
    expect(schema.$defs.primitive.enum).toEqual(list('E1'));
  });
  test('treatment = E4, image treatment and mask = their E4 groups, structure = E3 non-kinds', () => {
    expect(schema.$defs.treatment.enum).toEqual(list('E4'));
    expect(schema.$defs.imageTreatment.enum).toEqual(list('E4', 'image-treatment'));
    expect(schema.$defs.mask.enum).toEqual(list('E4', 'mask'));
    expect(schema.$defs.structure.enum).toEqual(list('E3').filter((t) => !kinds.includes(t)));
  });
});

/** Every enum value of a schema that maps to no single term (or is excluded): [path: value]. */
function unmapped(s) {
  const m = maps();
  const owner = {};
  for (const [name, src] of Object.entries(m.sources)) for (const at of src.at) owner[at] = name;
  const out = [];
  for (const e of collectEnums(s)) {
    const key = `template:${e.path}`;
    if (m.excluded[key]) continue;
    const name = owner[key];
    if (!name) {
      out.push(`${e.path}: (no map)`);
      continue;
    }
    for (const v of e.values) {
      if ((m.sources[name].excludedValues || {})[v]) continue;
      const hit = termFor('*', key, v);
      if (!hit || Array.isArray(hit)) out.push(`${e.path}: ${v}`);
    }
  }
  return out;
}

describe('maps.json: every enum value of template.schema.json maps to exactly one term', () => {
  test('nothing unmapped', () => {
    expect(collectEnums(schema).length).toBeGreaterThan(10);
    expect(unmapped(schema)).toEqual([]);
  });

  test('negative: a name added to the schema without a map fails, by name', () => {
    const changed = structuredClone(schema);
    changed.$defs.role.enum.push('hologram');
    changed.properties.intent.properties.emphasis.properties.carrier.enum.push('sparkle');
    expect(unmapped(changed)).toEqual([
      '#/properties/intent/properties/emphasis/properties/carrier: sparkle',
      '#/$defs/role: hologram',
    ]);
  });
});
