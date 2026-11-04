/**
 * @pb/vocabulary - the element / component vocabulary (docs/PLAN-template-library.md §1, V0): one term per thing in
 * four namespaces (E1 primitive, E2 role, E3 structure, E4 treatment), an ordered identification rule set per term,
 * and the map from every name the schemas give a thing to its term. The human page is docs/vocabulary.md, generated
 * from data/vocabulary.json by scripts/vocabulary-docs.mjs.
 */
import data from './data.cjs';

export { identify, identifyAll, rulesOf, chains, compilePattern } from './identify.js';
export { PREDICATES, prepare, words, readsBefore } from './predicates.js';
export { SCHEMA_FILES, collectEnums, keysAt } from './enums.js';

export const NAMESPACES = Object.freeze({
  E1: 'primitive: what is drawn',
  E2: 'role: what a thing is for on the slide',
  E3: 'structure: what things form together',
  E4: 'treatment: how a thing is finished',
});

/** The parsed vocabulary ({version, patterns, chains, terms}). */
export const vocabulary = () => data.vocabulary();
/** The parsed maps ({sources, keys, excluded, catalogue, anatomy}). */
export const maps = () => data.maps();

/** Every term entry, or those of one namespace. */
export function terms(namespace) {
  const all = data.vocabulary().terms;
  return namespace ? all.filter((t) => t.namespace === namespace) : all;
}

/** One term entry by namespace and term (or `'E2:panel'`), or null. */
export function termEntry(namespace, term) {
  if (term === undefined && namespace.includes(':')) [namespace, term] = namespace.split(':');
  return data.vocabulary().terms.find((t) => t.namespace === namespace && t.term === term) || null;
}

/**
 * The term a schema (or catalogue / anatomy) name maps to: `termFor(namespace, source, name)`. `source` is a source
 * name of maps.json (`layout.box.role`, `brand.components`, `catalogue.fields`, `anatomy.categories` ...) or a schema
 * path key (`layout:#/properties/boxes/items/properties/role`). `namespace` ('E1' .. 'E4') restricts the answer (null
 * or '*' for any). Returns {namespace, term}, {none: true} (a catalogue title container), or null when the name is not
 * mapped (or maps into another namespace). An anatomy role split into several terms returns its list.
 */
export function termFor(namespace, source, name) {
  const m = data.maps();
  let hit;
  if (m.sources[source]) hit = m.sources[source].values[name];
  else if (m.keys[source]) hit = m.keys[source].values[name];
  else if (source.startsWith('catalogue.')) hit = m.catalogue[source.slice('catalogue.'.length)]?.[name];
  else if (source.startsWith('anatomy.')) hit = m.anatomy[source.slice('anatomy.'.length)]?.[name];
  else {
    const owner =
      Object.values(m.sources).find((s) => s.at.includes(source)) ||
      Object.values(m.keys).find((s) => s.at.includes(source));
    hit = owner?.values[name];
  }
  if (!hit) return null;
  const ok = (h) => h.none || !namespace || namespace === '*' || h.namespace === namespace;
  if (Array.isArray(hit)) {
    const list = hit.filter(ok);
    return list.length ? (list.length === 1 ? list[0] : list) : null;
  }
  return ok(hit) ? hit : null;
}

/**
 * The confusables of a term: its `notBut` entries, plus every term whose `notBut` names it back, each with the
 * deciding test. `term` = 'panel' (any namespace) or 'E2:panel'.
 */
export function confusables(term, namespace) {
  if (namespace === undefined && term.includes(':')) [namespace, term] = term.split(':');
  const all = data.vocabulary().terms;
  const own = all.filter((t) => t.term === term && (!namespace || t.namespace === namespace));
  const out = [];
  const key = (ns, t) => `${ns}:${t}`;
  const seen = new Set();
  const ref = (from, name) => (name.includes(':') ? name.split(':') : [from.namespace, name]);
  for (const t of own)
    for (const nb of t.notBut) {
      const [ns, name] = ref(t, nb.term);
      if (seen.has(key(ns, name))) continue;
      seen.add(key(ns, name));
      out.push({ namespace: ns, term: name, test: nb.test, from: key(t.namespace, t.term) });
    }
  for (const t of all)
    for (const nb of t.notBut) {
      const [ns, name] = ref(t, nb.term);
      if (name !== term || (namespace && ns !== namespace) || seen.has(key(t.namespace, t.term))) continue;
      if (own.some((o) => o === t)) continue;
      seen.add(key(t.namespace, t.term));
      out.push({ namespace: t.namespace, term: t.term, test: nb.test, from: key(t.namespace, t.term) });
    }
  return out;
}
