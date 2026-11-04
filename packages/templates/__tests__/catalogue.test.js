// The catalogue template records (V1, docs/PLAN-template-library.md §2): packages/templates/data/catalogue.json, written
// by scripts/catalogue-records.mjs (puppeteer + the slide-anatomy pipeline; not run here: these tests need no browser).
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import data from '../src/data.cjs';
import { needsOf, templateById, templates, templatesOf, validateTemplate } from '../src/index.js';

const ROOT = data.REPO_ROOT;
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const file = read('packages/templates/data/catalogue.json');
const index = read('golden/catalogue/index.json');
const layouts = read('packages/layouts/data/catalogue-layouts.json');
const pinned = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'unknown-roles.json'), 'utf8')).counts;

/** Unknown E2 roles per category (an element answered as an E3 cell is not unknown: it is a structure). */
function unknownByCategory(records) {
  const out = {};
  for (const r of records) {
    out[r.category] ??= 0;
    for (const e of r.elements) if (e.role === 'unknown' && !e.structure) out[r.category] += 1;
  }
  return out;
}
/** The categories whose unknown count rose above the pin. */
const rises = (now, pin) =>
  Object.entries(now)
    .filter(([c, n]) => n > (pin[c] ?? 0))
    .map(([c, n]) => `${c}: ${n} > ${pin[c] ?? 0}`);

describe('packages/templates/data/catalogue.json', () => {
  test('one record per catalogue slide, in the index order (1,646)', () => {
    expect(file.records.map((r) => r.id)).toEqual(index.slides.map((s) => s.id));
    expect(file.records).toHaveLength(1646);
  });

  test('every record validates (schema, vocabulary terms, needs grammar)', () => {
    const bad = [];
    for (const r of file.records) {
      const v = validateTemplate(r);
      if (!v.valid) bad.push(`${r.id}: ${v.errors.slice(0, 3).join('; ')}`);
    }
    expect(bad).toEqual([]);
  });

  test('every plan record links to an existing catalogue-layouts id; the other sections link to none', () => {
    const ids = new Set(layouts.records.map((r) => r.id));
    const byCat = new Map(layouts.records.map((r) => [r.catalogue, r.id]));
    const section = new Map(index.slides.map((s) => [s.id, s.section]));
    for (const r of file.records) {
      if (section.get(r.id) === 'plan') {
        expect(ids.has(r.source.layout)).toBe(true);
        expect(r.source.layout).toBe(byCat.get(r.id));
      } else expect(r.source.layout).toBeUndefined();
    }
  });

  test('a catalogue record is a composition only: no needs, exact, unverified', () => {
    for (const r of file.records) {
      expect(r.composition).toBe(true);
      expect(needsOf(r)).toEqual([]);
      expect(r.provenance).toEqual(
        expect.objectContaining({ source: 'catalogue', exact: true, verifiedAt: null }),
      );
      expect(r.source.kind).toBe('catalogue');
      expect(r.intent.device).toBeNull(); // the catalogue draws no brand device
    }
  });

  test('no text is kept (word counts only): no slide title appears in the file', () => {
    const raw = readFileSync(join(ROOT, 'packages/templates/data/catalogue.json'), 'utf8');
    const titled = index.slides.filter((s) => s.title && s.title.length > 20);
    expect(titled.length).toBeGreaterThan(1000);
    expect(titled.filter((s) => raw.includes(s.title)).map((s) => s.id)).toEqual([]);
  });

  test('the source block names the catalogue and geometry versions it was measured from', () => {
    expect(file.source.sha256).toBe(index.source.sha256);
    const geometry = read('golden/catalogue/geometry.json');
    expect(file.source.geometryHash).toBe(
      createHash('sha256').update(JSON.stringify(geometry.slides)).digest('hex').slice(0, 16),
    );
  });

  test('size under 15 MB', () => {
    expect(statSync(join(ROOT, 'packages/templates/data/catalogue.json')).size).toBeLessThan(15e6);
  });

  test('the unknown-role count per category does not rise above the pin', () => {
    expect(rises(unknownByCategory(file.records), pinned)).toEqual([]);
  });

  test('negative: one more unknown element in a category is caught', () => {
    const r = structuredClone(file.records.find((x) => x.category === 'kpi-slide'));
    r.elements.push({ ...r.elements[1], id: 'o999', role: 'unknown', why: 'test' });
    const now = unknownByCategory([...file.records.filter((x) => x.id !== r.id), r]);
    expect(rises(now, pinned)).toEqual([`kpi-slide: ${pinned['kpi-slide'] + 1} > ${pinned['kpi-slide']}`]);
  });
});

describe('the API', () => {
  test('templates(), templatesOf(category), templateById(id)', () => {
    expect(templates().length).toBeGreaterThanOrEqual(1646);
    const kpi = templatesOf('kpi-slide');
    expect(kpi.length).toBeGreaterThan(0);
    for (const t of kpi) expect(t.category).toBe('kpi-slide');
    expect(templateById('L1-1').source.layout).toBe('cat-l1-1');
    expect(templateById('nope')).toBeNull();
  });
});
