/**
 * The JS evaluator of the vocabulary's identification rules (docs/PLAN-template-library.md §1.2). The Python evaluator
 * (.claude/skills/slide-anatomy/scripts/vocabulary_rules.py) runs the same rules; __tests__/python.test.js holds them
 * to the same answers.
 *
 * A chain (vocabulary.json `chains`) is one question asked of one kind of subject: `element` (what an object on the
 * slide is for: E2 roles, plus the E3 cell of a table row), `block` (which E3 block type a marked container is), `kind`
 * (which E3 slide kind a slide is), `structure` (E3 composition structures), `primitive` (E1) and one chain per E4
 * facet. The rules of a chain run in their `order`; each rule runs over every subject still unassigned (record order,
 * or top-down with `each: "top"`) and the first rule that holds for a subject decides it - so "the largest free text"
 * is the largest text no earlier rule took, as anatomy.py's role pass did. A subject no rule decides is `unknown`
 * (returned, never a guess). A chain's `none` test, when it holds, answers `none` (nothing to identify).
 */
import data from './data.cjs';
import { prepare, test } from './predicates.js';

let compiled = null;

/**
 * The vocabulary's regex patterns for JS. They are written once (vocabulary.json `patterns`) in the subset Python's
 * `re` and JS share; `\w` becomes the Unicode letter / digit / underscore class Python means by it.
 */
export function compilePattern(src) {
  let out = '';
  let inClass = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      if (n === 'w') out += inClass ? '\\p{L}\\p{N}_' : '[\\p{L}\\p{N}_]';
      else out += c + n;
      i += 1;
      continue;
    }
    if (c === '[' && !inClass) inClass = true;
    else if (c === ']' && inClass) inClass = false;
    out += c;
  }
  return new RegExp(out, 'iu');
}

function compile() {
  if (compiled) return compiled;
  const v = data.vocabulary();
  const patterns = {};
  for (const [name, src] of Object.entries(v.patterns)) patterns[name] = compilePattern(src);
  const chains = {};
  for (const [scope, chain] of Object.entries(v.chains)) chains[scope] = { ...chain, rules: [] };
  for (const entry of v.terms)
    for (const rule of entry.identify) {
      if (!chains[rule.scope])
        throw new Error(`vocabulary: rule ${rule.id} names an unknown chain "${rule.scope}"`);
      chains[rule.scope].rules.push({ ...rule, term: entry.term, namespace: entry.namespace });
    }
  for (const chain of Object.values(chains)) chain.rules.sort((a, b) => a.order - b.order);
  compiled = { patterns, chains };
  return compiled;
}

/** The ordered rules of a chain (each carries its term and namespace). */
export function rulesOf(scope) {
  const chain = compile().chains[scope];
  if (!chain) throw new Error(`vocabulary: unknown chain "${scope}"`);
  return chain.rules;
}

/** The chains (scope -> {subject, namespace, none?, rules}). */
export function chains() {
  return compile().chains;
}

const UNKNOWN = (scope) => ({
  namespace: null,
  term: 'unknown',
  rule: null,
  why: `no rule of the ${scope} chain holds`,
});

/**
 * Identifies every subject of one pass (one slide's objects, or one slide's blocks ...). `subjects` are records (see
 * predicates.js; they are prepared in place: derived fields are added). `context` = { aspect, bodyPctH, ... } plus
 * anything a rule reads with `{ctx: name}`. Options: `scope` (default 'element'); `skip` = rule ids left out;
 * `transform(rule) -> rule` rewrites a rule for this call only (the negative tests remove a deciding predicate). Returns one result per subject, in order: {namespace, term, rule, why}, {term: 'unknown'},
 * {none: true, why} or {hidden: true} (a subject flagged hidden is painted over: never identified).
 */
export function identifyAll(subjects, context = {}, { scope = 'element', skip = [], transform = null } = {}) {
  const { patterns, chains: all } = compile();
  const chain = all[scope];
  if (!chain) throw new Error(`vocabulary: unknown chain "${scope}"`);
  const visible = subjects.filter((s) => !s.hidden);
  prepare(visible, context);
  const ctx = { ...context, patterns };
  const assigned = new Map();
  let startFree = new Set();
  const pass = { subjects: visible, termOf: (o) => assigned.get(o) || null, free: (o) => startFree.has(o) };
  const results = new Map();
  if (chain.none)
    for (const s of visible)
      if (chain.none.when.every((p) => test(p, s, ctx, pass)))
        results.set(s, { none: true, why: chain.none.why });
  for (const original of chain.rules) {
    if (skip.includes(original.id)) continue;
    const rule = transform ? transform(original) : original;
    startFree = new Set(visible.filter((o) => !assigned.has(o) && !results.has(o)));
    let order = visible;
    if (rule.each === 'top') order = [...visible].sort((a, b) => a.bbox[1] - b.bbox[1]);
    for (const s of order) {
      if (assigned.has(s) || results.has(s)) continue;
      if (rule.when.every((p) => test(p, s, ctx, pass))) {
        const hit = { namespace: rule.namespace, term: rule.term, rule: rule.id, why: rule.why };
        if (rule.label) hit.label = rule.label;
        assigned.set(s, hit);
      }
    }
  }
  return subjects.map((s) =>
    s.hidden ? { hidden: true } : results.get(s) || assigned.get(s) || UNKNOWN(scope),
  );
}

/**
 * Identifies one subject. `context.others` = the other subjects of its slide (the relational rules read them; they
 * are identified in the same pass, and only the subject's own result is returned).
 */
export function identify(subject, context = {}, options = {}) {
  const { others = [], ...ctx } = context;
  return identifyAll([subject, ...others], ctx, options)[0];
}
