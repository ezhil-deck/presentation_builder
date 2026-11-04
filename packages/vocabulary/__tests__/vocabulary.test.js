// The vocabulary itself (docs/PLAN-template-library.md §1.2): entry shape, closed namespaces, every rule written in the
// predicate set, every confusable a real term, mapsFrom equal to maps.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PREDICATES, chains, maps, termEntry, termFor, terms, vocabulary } from '../src/index.js';
import data from '../src/data.cjs';

const schema = (f) => JSON.parse(readFileSync(join(data.REPO_ROOT, f), 'utf8'));
const names = (ns, group) =>
  terms(ns)
    .filter((t) => !group || t.group === group)
    .map((t) => t.term);

/** The architect's E2 inventory (V0 task) plus the terms V0 added with a rule and a fixture. */
const E2_INVENTORY = [
  ...[
    'title',
    'subtitle',
    'eyebrow',
    'heading',
    'body',
    'description',
    'bullet',
    'paragraph',
    'label',
    'big-number',
    'caption',
  ],
  ...[
    'source',
    'legal',
    'date',
    'authors',
    'contact',
    'page-number',
    'footer-text',
    'attribution',
    'placeholder',
    'decor-word',
  ],
  ...[
    'brand-logo',
    'partner-logo',
    'logo-item',
    'avatar',
    'icon',
    'picture',
    'hero-image',
    'cutout',
    'background-art',
  ],
  ...['illustration', 'watermark', 'sticker', 'badge'],
  ...[
    'panel',
    'card',
    'band',
    'cut-shape',
    'rule',
    'divider',
    'connector',
    'marker',
    'frame',
    'device',
    'decor',
    'chart-exhibit',
  ],
  ...['table-exhibit', 'diagram'],
  ...['chip', 'callout', 'quote-mark', 'button', 'pager', 'tabs'],
  'unknown',
];
const E2_ADDED = ['background'];
// renamed so a bare term is unique across the four namespaces (coordinator, 2026-11-04): chart -> chart-exhibit,
// table -> table-exhibit; the inventory's E2 group is dropped (a deck group is the E1 primitive group).

describe('vocabulary.json', () => {
  const v = vocabulary();

  test('every entry has the one shape', () => {
    for (const t of v.terms) {
      expect(
        Object.keys(t)
          .filter((k) => k !== 'group')
          .sort(),
      ).toEqual(
        ['definition', 'examples', 'identify', 'mapsFrom', 'namespace', 'notBut', 'signal', 'term'].sort(),
      );
      expect(['E1', 'E2', 'E3', 'E4']).toContain(t.namespace);
      expect(typeof t.definition).toBe('string');
      expect(Object.keys(t.mapsFrom).sort()).toEqual([
        'anatomy',
        'brand',
        'catalogue',
        'content',
        'deck',
        'layout',
      ]);
      expect(Object.keys(t.examples).sort()).toEqual(['negative', 'positive']);
      for (const nb of t.notBut) expect(Object.keys(nb).sort()).toEqual(['term', 'test']);
    }
  });

  test('a term is unique in its namespace; a rule id is unique', () => {
    const keys = v.terms.map((t) => `${t.namespace}:${t.term}`);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = v.terms.flatMap((t) => t.identify.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('E1 is closed: the deck element types', () => {
    expect(names('E1').sort()).toEqual(
      schema('schemas/deck.schema.json').$defs.element.properties.type.enum.slice().sort(),
    );
  });

  test('E2 is the inventory plus the added terms (each with a rule and a fixture)', () => {
    expect(names('E2').sort()).toEqual([...E2_INVENTORY, ...E2_ADDED].sort());
    for (const t of E2_ADDED) expect(termEntry('E2', t).identify.length).toBeGreaterThan(0);
  });

  test('E3 blocks are the 14 content/2 block types (closed; image / chart / table / paragraph carry -block)', () => {
    const enumv = schema('schemas/content.schema.json').$defs.blockV2.properties.type.enum;
    expect(names('E3', 'block').sort()).toEqual(
      enumv.map((b) => termFor('E3', 'content.v2.block.type', b).term).sort(),
    );
    expect(names('E3', 'block')).toHaveLength(14);
  });

  test('a bare term names one thing: no term appears in two namespaces', () => {
    const seen = {};
    for (const t of v.terms) (seen[t.term] ??= []).push(t.namespace);
    expect(Object.entries(seen).filter(([, ns]) => ns.length > 1)).toEqual([]);
  });

  test('negative: a duplicate across namespaces is caught by the same check', () => {
    const terms2 = [...v.terms, { term: 'band', namespace: 'E3' }];
    const seen = {};
    for (const t of terms2) (seen[t.term] ??= []).push(t.namespace);
    expect(Object.entries(seen).filter(([, ns]) => ns.length > 1)).toEqual([['band', ['E2', 'E3']]]);
  });

  test('E3 slide kinds = the layout kinds + back-cover + legal', () => {
    const kinds = schema('schemas/layout.schema.json').$defs.kind.enum;
    expect(names('E3', 'kind').sort()).toEqual(
      [...kinds, 'back-cover', 'legal'].map((k) => `${k}-slide`).sort(),
    );
  });

  test('E3 composition structures', () => {
    expect(names('E3', 'composition').sort()).toEqual([
      'band-zone',
      'cell',
      'column',
      'gap-group',
      'grid',
      'header',
      'item',
      'stack',
      'zone',
    ]);
  });

  test('every term but unknown has a rule; every rule runs in a known chain on known predicates and patterns', () => {
    const scopes = Object.keys(chains());
    const check = (p) => {
      const [k, a] = Object.entries(p)[0];
      expect(Object.keys(PREDICATES)).toContain(k);
      if (k === 'text' || k === 'notText') expect(v.patterns).toHaveProperty(a);
      if (k === 'match') expect(v.patterns).toHaveProperty(a[1]);
      if (k === 'belowText') expect(v.patterns).toHaveProperty(a.pattern);
      if (k === 'any') a.forEach((g) => g.forEach(check));
      if (k === 'not') check(a);
    };
    for (const t of v.terms) {
      if (t.term !== 'unknown') expect(t.identify.length).toBeGreaterThan(0);
      for (const r of t.identify) {
        expect(scopes).toContain(r.scope);
        expect(typeof r.order).toBe('number');
        expect(r.why).toBeTruthy();
        r.when.forEach(check);
      }
    }
  });

  test('every confusable names a real term', () => {
    for (const t of v.terms)
      for (const nb of t.notBut) {
        const [ns, term] = nb.term.includes(':') ? nb.term.split(':') : [t.namespace, nb.term];
        expect(termEntry(ns, term)).not.toBeNull();
      }
  });

  test('mapsFrom lists exactly what maps.json maps to the term', () => {
    const m = maps();
    const want = new Map(v.terms.map((t) => [`${t.namespace}:${t.term}`, new Set()]));
    const add = (hit, label) => {
      for (const h of [hit].flat()) if (!h.none) want.get(`${h.namespace}:${h.term}`).add(label);
    };
    for (const [n, s] of Object.entries(m.sources))
      for (const [k, h] of Object.entries(s.values)) add(h, `${n}: ${k}`);
    for (const [n, s] of Object.entries(m.keys))
      for (const [k, h] of Object.entries(s.values)) add(h, `${n}: ${k}`);
    for (const [k, h] of Object.entries(m.catalogue.containerTypes)) add(h, `data-type: ${k}`);
    for (const [k, h] of Object.entries(m.catalogue.fields)) add(h, `data-f: ${k}`);
    for (const [k, h] of Object.entries(m.catalogue.header)) add(h, `header: .${k}`);
    for (const [k, h] of Object.entries(m.anatomy.roles)) add(h, `role: ${k}`);
    for (const [k, h] of Object.entries(m.anatomy.categories)) add(h, `category: ${k}`);
    for (const t of v.terms)
      expect(new Set(Object.values(t.mapsFrom).flat())).toEqual(want.get(`${t.namespace}:${t.term}`));
  });

  test('the predicate set is documented', () => {
    for (const [name, p] of Object.entries(PREDICATES)) {
      expect(p.doc).toBeTruthy();
      expect(p.args).toBeTruthy();
      expect(typeof p.fn).toBe('function');
      expect(name).toMatch(/^[a-zA-Z]+$/);
    }
  });
});
