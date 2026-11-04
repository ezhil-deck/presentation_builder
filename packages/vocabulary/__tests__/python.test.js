// Two evaluators, one rule set: the Python evaluator the slide-anatomy skill runs
// (.claude/skills/slide-anatomy/scripts/vocabulary_rules.py) must answer every fixture as the JS evaluator does, and
// anatomy.py (its role pass and category now run through it) must reproduce the roles of the two analysed examples.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PREDICATES, identify } from '../src/index.js';
import data from '../src/data.cjs';

const SCRIPTS = join(data.REPO_ROOT, '.claude', 'skills', 'slide-anatomy', 'scripts');
const FIX = join(__dirname, 'fixtures');
const fixtures = JSON.parse(readFileSync(join(FIX, 'terms.json'), 'utf8'));
const { pairs, ambiguous } = JSON.parse(readFileSync(join(FIX, 'confusables.json'), 'utf8'));

const cases = [];
for (const [ns, list] of Object.entries(fixtures))
  for (const [term, fx] of Object.entries(list))
    for (const which of ['positive', 'negative'])
      cases.push({ name: `${ns} ${term} ${which}`, ...fx[which] });
for (const pr of pairs)
  for (const which of ['a', 'b']) cases.push({ name: `${pr.pair.join('/')} ${which}`, ...pr[which] });
cases.push({ name: 'ambiguous', ...ambiguous.case });

let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pb-vocabulary-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the Python evaluator gives the JS answers', () => {
  test(`all ${cases.length} fixture cases`, () => {
    const file = join(dir, 'cases.json');
    writeFileSync(file, JSON.stringify(cases));
    const py = JSON.parse(
      execFileSync('python3', [join(SCRIPTS, 'vocabulary_rules.py'), '--cases', file], { encoding: 'utf8' }),
    );
    const js = cases.map((c) =>
      identify(
        structuredClone(c.subject),
        { ...c.context, others: structuredClone(c.others) },
        { scope: c.scope },
      ),
    );
    const diff = cases
      .map((c, k) => ({
        name: c.name,
        js: `${js[k].namespace}:${js[k].term}:${js[k].rule}`,
        py: `${py[k].namespace}:${py[k].term}:${py[k].rule}`,
      }))
      .filter((d) => d.js !== d.py);
    expect(diff).toEqual([]);
  });
});

describe('one predicate set', () => {
  test('the Python evaluator implements exactly the JS predicates', () => {
    const code = `import sys; sys.path.insert(0, ${JSON.stringify(SCRIPTS)}); import vocabulary_rules as V, json; print(json.dumps(sorted(V.PREDICATES)))`;
    const py = JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
    expect(py).toEqual(Object.keys(PREDICATES).sort());
  });
});

describe('anatomy.py through the vocabulary', () => {
  test('reproduces the roles and categories of the two analysed examples (raw rebuilt from each record)', () => {
    const code = `
import json, sys, glob, os, copy
sys.path.insert(0, ${JSON.stringify(SCRIPTS)})
import anatomy
out = {}
for f in sorted(glob.glob(${JSON.stringify(join(SCRIPTS, '..', 'examples'))} + "/*.record.json")):
    rec = json.load(open(f))
    objs = []
    for e in rec["L1_elements"]:
        o = {k: e[k] for k in e if k not in ("role", "why", "rule", "areaPct", "ground", "contrast", "furniture")}
        o.setdefault("bleed", []); o.setdefault("z", 0)
        if o["kind"] == "text":
            o.setdefault("lines", 1); o.setdefault("align", "left"); o.setdefault("sizePctH", 0)
        objs.append(o)
    raw = {"source": rec["source"], "slide": rec["slide"], "objects": objs}
    fur = [anatomy.signature(o) for o, e in zip(objs, rec["L1_elements"]) if e.get("furniture")]
    b = anatomy.analyse(raw, None, {"furniture": fur}, rec.get("page"), rec.get("pages"))
    out[os.path.basename(f)] = {"want": [[e["id"], e.get("role")] for e in rec["L1_elements"]],
                                "got": [[e["id"], e.get("role")] for e in b["L1_elements"]],
                                "category": [rec["category"]["name"], b["category"]["name"], b["category"]["term"]]}
print(json.dumps(out))
`;
    const out = JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
    expect(Object.keys(out)).toHaveLength(2);
    for (const r of Object.values(out)) {
      // a painted-over object keeps its QA role in the record; the rebuilt raw has no z order to repaint it
      const want = r.want.filter(([, role]) => role !== 'hidden');
      const got = r.got.filter(([id]) => want.some(([w]) => w === id));
      expect(got).toEqual(want);
      expect(r.category[1]).toBe(r.category[0]);
      expect(r.category[2]).toBe('cover-slide');
    }
  });
});
