// The catalogue answer key (docs/PLAN-template-library.md §1.3): identify() over the 1,077 plan slides with the marks
// hidden, compared with the map of each hidden mark. Targets 100 % (blocks, fields, header parts); the header parts
// reach it, the blocks and fields do not (docs/vocabulary.md lists every miss and its reason). The recorded result
// (fixtures/answer-key.json, written by `npm run vocabulary:docs`) holds the build to it: no new miss, no lost hit.
// The generated pages (docs/vocabulary.md, the skill's roles.md) must be current. The catalogue HTML (10.8 MB) is read
// once, here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockSlideRoles, rate, runAnswerKey } from '../src/answer-key.js';
import data from '../src/data.cjs';
import {
  DOC_FILE,
  KEY_FILE,
  ROLES_FILE,
  recordKey,
  renderRolesMd,
  renderVocabularyDoc,
} from '../../../scripts/vocabulary-docs.mjs';

const ROOT = data.REPO_ROOT;
const geometry = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/geometry.json'), 'utf8'));
let html;
let key;
let blockRoles;
beforeAll(() => {
  html = readFileSync(join(ROOT, 'golden/catalogue/rich-slide-catalogue.html'), 'utf8');
  key = runAnswerKey(geometry, html);
  blockRoles = blockSlideRoles(geometry, html);
});
const recorded = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
const total = (sec) => {
  const rows = Object.values(key[sec]);
  return { n: rows.reduce((a, r) => a + r.n, 0), hit: rows.reduce((a, r) => a + r.hit, 0) };
};

describe('the catalogue answer key', () => {
  test('every plan slide, container and field is scored', () => {
    expect(total('blocks').n).toBe(2037);
    expect(total('fields').n).toBe(10520);
    expect(total('header').n).toBe(6461);
  });

  test('header parts: 100 % (k eyebrow, t title, r rule, src source, ft footer-text, lg brand-logo)', () => {
    expect(rate(total('header'))).toBe(100);
    expect(key.misses.header).toEqual([]);
  });

  test('blocks and fields: no new miss and no lost hit against the recorded answer key', () => {
    const now = recordKey(key);
    for (const sec of ['blocks', 'fields', 'header']) {
      for (const [mark, r] of Object.entries(now[sec]))
        expect([mark, r.hit, r.resolved]).toEqual([
          mark,
          recorded[sec][mark].hit,
          recorded[sec][mark].resolved,
        ]);
      expect(now[`${sec}Misses`]).toEqual(recorded[`${sec}Misses`]);
    }
    // roadmap accepts timeline or process: which record resolved to which is recorded too
    expect(now.resolved).toEqual(recorded.resolved);
  });

  test('the recorded hit rates (stated in docs/vocabulary.md and DECISIONS.md)', () => {
    expect(`${total('blocks').hit}/${total('blocks').n}`).toBe('2012/2037');
    expect(`${total('fields').hit}/${total('fields').n}`).toBe('10490/10520');
  });

  // The targets the plan sets and V0 does not reach: these fail until they are met (then jest reports them).
  test.failing('target: E3 block type 100 %', () => {
    expect(rate(total('blocks'))).toBe(100);
  });
  test.failing('target: E2 field role 100 %', () => {
    expect(rate(total('fields'))).toBe(100);
  });

  test('a removed rule shows in the key (negative test: without heading.item the headings are lost)', () => {
    const off = (rule) => (rule.id === 'heading.item' ? { ...rule, when: [{ kind: ['nothing'] }] } : rule);
    const k = runAnswerKey(geometry, html, { transform: off });
    expect(k.fields.heading.hit).toBeLessThan(key.fields.heading.hit / 2);
    expect(k.misses.fields.length).toBeGreaterThan(key.misses.fields.length);
  });
});

describe('the generated pages are current', () => {
  test('docs/vocabulary.md', () => {
    const anatomyRoles = {};
    for (const f of ['cover-panel-diagonal', 'cover-serif-cutout']) {
      const rec = JSON.parse(
        readFileSync(join(ROOT, '.claude/skills/slide-anatomy/examples', `${f}.record.json`), 'utf8'),
      );
      anatomyRoles[f] = rec.L1_elements.map((e) => `${e.id} ${e.role}`).join(', ');
    }
    expect(readFileSync(DOC_FILE, 'utf8')).toBe(renderVocabularyDoc({ key, blockRoles, anatomyRoles }));
  });

  test("the slide-anatomy skill's roles.md (generated section; heading and Known limits kept)", () => {
    const current = readFileSync(ROLES_FILE, 'utf8');
    expect(current).toBe(renderRolesMd(current));
    expect(current.startsWith('# L1 roles')).toBe(true);
    expect(current).toContain('## Known limits');
  });
});
