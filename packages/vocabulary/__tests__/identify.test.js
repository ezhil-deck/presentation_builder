// identify(): one positive and one negative fixture per term, a fixture pair per confusable pair with the deciding
// test asserted, an ambiguous fixture that must answer `unknown`, and the negative test: removing a pair's deciding
// predicate from its rule makes the pair test fail (so the fixtures really rest on that predicate).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { identify, identifyAll, terms } from '../src/index.js';

const FIX = join(__dirname, 'fixtures');
const fixtures = JSON.parse(readFileSync(join(FIX, 'terms.json'), 'utf8'));
const { pairs, ambiguous } = JSON.parse(readFileSync(join(FIX, 'confusables.json'), 'utf8'));
const run = (c, options = {}) =>
  identify(
    structuredClone(c.subject),
    { ...c.context, others: structuredClone(c.others) },
    { scope: c.scope, ...options },
  );
const is = (r, ns, term) => r.namespace === ns && r.term === term;
const split = (k) => k.split(':');

describe('one positive and one negative fixture per term', () => {
  test('every term has both', () => {
    for (const ns of ['E1', 'E2', 'E3', 'E4'])
      for (const t of terms(ns)) {
        expect(fixtures[ns]).toHaveProperty([t.term]);
        expect(fixtures[ns][t.term].positive).toBeTruthy();
        expect(fixtures[ns][t.term].negative).toBeTruthy();
      }
  });

  for (const [ns, list] of Object.entries(fixtures))
    for (const [term, { positive, negative }] of Object.entries(list)) {
      test(`${ns} ${term}`, () => {
        const p = run(positive);
        const n = run(negative);
        if (term === 'unknown') {
          expect(p.term).toBe('unknown');
          expect(n.term).not.toBe('unknown');
        } else {
          expect(`${p.namespace}:${p.term}`).toBe(`${ns}:${term}`);
          expect(is(n, ns, term)).toBe(false);
        }
      });
    }
});

describe('confusable pairs: the deciding test separates them', () => {
  const pairHolds = (pr, options) => {
    const [na, ta] = split(pr.pair[0]);
    const [nb, tb] = split(pr.pair[1]);
    return is(run(pr.a, options), na, ta) && is(run(pr.b, options), nb, tb);
  };
  /** The rule with the deciding predicate removed (wherever it sits: top level, inside `any` or `not`). */
  const without = (pr) => (rule) => {
    if (rule.id !== pr.rule) return rule;
    const hits = (p) => {
      const [k, a] = Object.entries(p)[0];
      return k === pr.predicate || (Array.isArray(a) && a[0] === pr.predicate) || a === pr.predicate;
    };
    const strip = (list) =>
      list
        .filter((p) => !hits(p))
        .map((p) => {
          const [k, a] = Object.entries(p)[0];
          if (k === 'any') return { any: a.map(strip) };
          if (k === 'not' && hits(a)) return null;
          return p;
        })
        .filter(Boolean);
    const when = strip(rule.when);
    expect(JSON.stringify(when)).not.toBe(JSON.stringify(rule.when)); // the predicate was there
    return { ...rule, when };
  };

  for (const pr of pairs) {
    test(`${pr.pair.join(' / ')}: ${pr.deciding}`, () => {
      expect(pairHolds(pr)).toBe(true);
    });
    test(`${pr.pair.join(' / ')}: without \`${pr.predicate}\` in ${pr.rule} the pair fails (negative)`, () => {
      expect(pairHolds(pr, { transform: without(pr) })).toBe(false);
    });
  }

  test('the pairs the plan names are all here', () => {
    const want = [
      'E2:band/E2:panel',
      'E2:panel/E2:card',
      'E2:divider/E2:rule',
      'E2:connector/E2:divider',
      'E2:partner-logo/E2:brand-logo',
      'E2:logo-item/E2:brand-logo',
      'E2:eyebrow/E2:label',
      'E2:caption/E2:label',
      'E2:big-number/E2:heading',
      'E2:description/E2:paragraph',
      'E2:body/E2:description',
      'E2:device/E2:decor',
      'E2:sticker/E2:badge',
      'E2:cutout/E2:hero-image',
      'E2:hero-image/E2:picture',
      'E3:timeline/E3:process',
      'E3:compare/E3:items',
      'E3:kpis/E3:items',
    ];
    expect(pairs.map((p) => p.pair.join('/'))).toEqual(want);
  });
});

describe('unknown, none, hidden', () => {
  test('an ambiguous subject is unknown, never a guess', () => {
    const r = run(ambiguous.case);
    expect(r.term).toBe('unknown');
    expect(r.namespace).toBeNull();
  });

  test('a block holding no field is none (the title container)', () => {
    expect(identifyAll([{ kind: 'block', fields: 0 }], {}, { scope: 'block' })[0]).toMatchObject({
      none: true,
    });
  });

  test('a hidden (painted-over) subject is not identified', () => {
    const r = identifyAll(
      [{ kind: 'text', text: 'Title', sizePctH: 6, bbox: [5, 5, 50, 12], hidden: true }],
      { bodyPctH: 2 },
    );
    expect(r[0]).toEqual({ hidden: true });
  });

  test('one title per slide: the rank is taken once, when the rule starts', () => {
    const subjects = [
      { kind: 'text', text: 'Largest headline text', sizePctH: 7, bbox: [5, 20, 60, 30] },
      { kind: 'text', text: 'Second line under it', sizePctH: 3, bbox: [40, 70, 60, 74] },
    ];
    const r = identifyAll(subjects, { bodyPctH: 2 });
    expect(r.filter((x) => x.term === 'title')).toHaveLength(1);
  });

  test('the why and the rule id come back with every answer', () => {
    const r = identify(
      { kind: 'text', text: 'Source: annual report', sizePctH: 1.5, bbox: [5, 92, 40, 94] },
      { bodyPctH: 2.5 },
    );
    expect(r).toMatchObject({ namespace: 'E2', term: 'source', rule: 'source.wording' });
    expect(r.why).toMatch(/Source/);
  });
});
