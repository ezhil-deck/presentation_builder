// D11 (docs/PLAN-template-library.md §8): every name the five schemas (+ the input format) give a thing maps to one
// vocabulary term. The enums are collected from the schema files at test time, so a schema that gains a name without
// a map fails here, by name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_FILES, collectEnums, confusables, keysAt, maps, termEntry, termFor } from '../src/index.js';
import data from '../src/data.cjs';

const schemas = Object.fromEntries(
  Object.entries(SCHEMA_FILES).map(([k, f]) => [
    k,
    JSON.parse(readFileSync(join(data.REPO_ROOT, f), 'utf8')),
  ]),
);
const m = maps();
const owner = {};
for (const [name, s] of Object.entries(m.sources)) for (const at of s.at) owner[at] = name;

describe('maps.json against the schema files', () => {
  const collected = [];
  for (const [k, s] of Object.entries(schemas))
    for (const e of collectEnums(s)) collected.push({ key: `${k}:${e.path}`, values: e.values });

  test('the collector finds the enums of all six files', () => {
    expect(new Set(collected.map((c) => c.key.split(':')[0]))).toEqual(new Set(Object.keys(SCHEMA_FILES)));
    expect(collected.length).toBeGreaterThan(200);
  });

  test('every enum path is mapped or excluded with a reason', () => {
    const unclassified = collected
      .filter((c) => !owner[c.key] && !m.excluded[c.key])
      .map((c) => `${c.key} ${JSON.stringify(c.values)}`);
    expect(unclassified).toEqual([]);
  });

  test('every value of a mapped path maps to exactly one term (or is excluded by name)', () => {
    const unmapped = [];
    for (const c of collected) {
      const name = owner[c.key];
      if (!name) continue;
      for (const v of c.values)
        if (!m.sources[name].values[v] && !(m.sources[name].excludedValues || {})[v])
          unmapped.push(`${c.key}: ${v}`);
    }
    expect(unmapped).toEqual([]);
  });

  test('every `components` key maps to a term', () => {
    const unmapped = [];
    for (const s of Object.values(m.keys))
      for (const at of s.at) {
        const [k, path] = at.split(':');
        const keys = keysAt(schemas[k], path);
        expect(keys).not.toBeNull();
        for (const key of keys) if (!s.values[key]) unmapped.push(`${at}: ${key}`);
      }
    expect(unmapped).toEqual([]);
  });

  test('no stale path: every mapped or excluded path exists in its schema', () => {
    const keys = new Set(collected.map((c) => c.key));
    expect(Object.keys(owner).filter((k) => !keys.has(k))).toEqual([]);
    expect(Object.keys(m.excluded).filter((k) => !keys.has(k))).toEqual([]);
  });

  test('every mapped term exists in the vocabulary', () => {
    const missing = [];
    const check = (h, where) => {
      for (const x of [h].flat())
        if (!x.none && !termEntry(x.namespace, x.term)) missing.push(`${where} -> ${x.namespace}:${x.term}`);
    };
    for (const [n, s] of Object.entries({ ...m.sources, ...m.keys }))
      for (const [k, h] of Object.entries(s.values)) check(h, `${n}.${k}`);
    for (const sec of ['containerTypes', 'fields', 'header'])
      for (const [k, h] of Object.entries(m.catalogue[sec])) check(h, `catalogue.${sec}.${k}`);
    for (const sec of ['roles', 'categories'])
      for (const [k, h] of Object.entries(m.anatomy[sec])) check(h, `anatomy.${sec}.${k}`);
    expect(missing).toEqual([]);
  });

  test('a schema gaining a name without a map fails (negative test)', () => {
    const changed = JSON.parse(JSON.stringify(schemas.layout));
    changed.properties.boxes.items.properties.role.enum.push('hologram');
    const owned = collectEnums(changed).flatMap((e) =>
      owner[`layout:${e.path}`]
        ? e.values
            .filter((v) => !m.sources[owner[`layout:${e.path}`]].values[v])
            .map((v) => `${e.path}: ${v}`)
        : [],
    );
    expect(owned).toEqual(['#/properties/boxes/items/properties/role: hologram']);
  });
});

describe('termFor', () => {
  test('by source name, by schema path, restricted by namespace', () => {
    expect(termFor('E2', 'layout.box.role', 'divider')).toEqual({ namespace: 'E2', term: 'divider' });
    expect(termFor('*', 'layout:#/properties/boxes/items/properties/role', 'list')).toEqual({
      namespace: 'E3',
      term: 'points',
    });
    expect(termFor('E2', 'layout.box.role', 'list')).toBeNull();
    expect(termFor('E4', 'content.image.treatment', 'device')).toEqual({
      namespace: 'E4',
      term: 'device-frame',
    });
    expect(termFor(null, 'brand.components', 'logoWall')).toEqual({ namespace: 'E3', term: 'logos' });
    expect(termFor(null, 'brand.decor.type', 'word')).toEqual({ namespace: 'E2', term: 'decor-word' });
    expect(termFor('E3', 'layout.kind', 'chart')).toEqual({ namespace: 'E3', term: 'chart-slide' });
    expect(termFor(null, 'layout.box.role', 'nonsense')).toBeNull();
  });

  test('the catalogue and anatomy maps', () => {
    expect(termFor(null, 'catalogue.containerTypes', 'roadmap')).toEqual([
      { namespace: 'E3', term: 'timeline' },
      { namespace: 'E3', term: 'process' },
    ]);
    expect(termFor('E2', 'catalogue.fields', 'point')).toEqual({ namespace: 'E2', term: 'label' });
    expect(termFor(null, 'catalogue.containerTypes', 'title')).toEqual({ none: true });
    expect(termFor('E2', 'catalogue.fields', 'value')).toEqual({ namespace: 'E2', term: 'big-number' });
    expect(termFor('E3', 'catalogue.fields', 'row')).toEqual({ namespace: 'E3', term: 'cell' });
    expect(termFor('E2', 'anatomy.roles', 'logo')).toEqual({ namespace: 'E2', term: 'brand-logo' });
    expect(termFor('E2', 'anatomy.roles', 'chart-or-diagram')).toHaveLength(3);
    expect(termFor('E3', 'anatomy.categories', 'section-break')).toEqual({
      namespace: 'E3',
      term: 'section-slide',
    });
  });
});

describe('confusables', () => {
  test('own notBut entries and the terms naming it back, with the deciding test', () => {
    const panel = confusables('panel', 'E2');
    expect(panel.map((c) => c.term)).toEqual(expect.arrayContaining(['card', 'band', 'callout']));
    for (const c of panel) expect(c.test).toBeTruthy();
    expect(confusables('E2:rule').map((c) => c.term)).toEqual(
      expect.arrayContaining(['divider', 'band', 'connector']),
    );
  });

  test('a term name shared by namespaces answers for each unless one is named', () => {
    const all = confusables('timeline').map((c) => c.term);
    expect(all).toEqual(expect.arrayContaining(['process', 'items']));
    expect(confusables('timeline', 'E3').length).toBeGreaterThan(0);
  });
});
