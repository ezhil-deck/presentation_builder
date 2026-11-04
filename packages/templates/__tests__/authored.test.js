// Hand-authored template records (docs/TEMPLATES.md): the five pipeline fixtures measured by scripts/template-records.mjs
// (records.json checked in next to them), and the rules every authored record is held to - unknown terms, the
// capability-key grammar, needs naming an element, an authored role the rules identify differently is a question.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredTemplate, validateTemplate } from '../src/index.js';

const FIX = join(__dirname, '..', '__fixtures__', 'authored');
const fixtures = JSON.parse(readFileSync(join(FIX, 'records.json'), 'utf8')).records;
const byId = Object.fromEntries(fixtures.map((r) => [r.id, r]));

describe('the authored fixtures (records.json)', () => {
  test('six records from five files (statement has a dark option), all valid', () => {
    expect(fixtures.map((r) => r.id).sort()).toEqual([
      'cover-cutout',
      'cover-device-band',
      'cta-contact',
      'section-colour-field',
      'statement-quote',
      'statement-quote~dark',
    ]);
    for (const r of fixtures) expect([r.id, validateTemplate(r).errors]).toEqual([r.id, []]);
  });

  test('provenance authored, exact, unverified; needs present (not a composition)', () => {
    for (const r of fixtures) {
      expect(r.provenance).toEqual(
        expect.objectContaining({ source: 'authored', exact: true, verifiedAt: null }),
      );
      expect(r.provenance.file).toMatch(/^packages\/templates\/__fixtures__\/authored\/[a-z-]+\.html$/);
      expect(r.needs.length).toBeGreaterThan(0);
      expect(r.composition).toBeUndefined();
    }
  });

  test('the needs, each naming its element', () => {
    expect(byId['cover-device-band'].needs.map((n) => n.key)).toEqual([
      'image:photo-people',
      'device:band',
      'text-zone',
      'logo:full',
    ]);
    expect(byId['cover-cutout'].needs.map((n) => n.key)).toEqual(['cutout', 'logo:mark']);
    expect(byId['statement-quote'].needs.find((n) => n.key === 'second-face').optional).toBe(true);
    for (const r of fixtures) {
      const ids = new Set(r.elements.map((e) => e.id));
      for (const n of r.needs) expect(ids.has(n.element)).toBe(true);
    }
  });

  test('the options link a template and its variant', () => {
    expect(byId['statement-quote'].options).toEqual([{ kind: 'dark', ref: 'statement-quote~dark' }]);
    expect(byId['statement-quote~dark'].options).toEqual([{ kind: 'base', ref: 'statement-quote' }]);
  });

  test('measured intent: the cut-out, the side photo, the weight run, the colour field', () => {
    expect(byId['cover-cutout'].intent.image).toEqual(
      expect.objectContaining({ treatment: 'transparent', mask: null, faces: null }),
    );
    expect(byId['cover-device-band'].intent.image).toEqual(
      expect.objectContaining({ treatment: 'side', mask: 'rect' }),
    );
    expect(byId['statement-quote'].intent.emphasis.carrier).toBe('weight-run');
    expect(byId['section-colour-field'].elements.find((e) => e.authored?.role === 'panel').role).toBe(
      'panel',
    );
  });

  test('the authored roles the rules name differently are questions, the identified role kept', () => {
    const qs = fixtures.flatMap((r) =>
      (r.questions || []).map((q) => `${r.id} ${q.element} ${q.authored} -> ${q.identified}`),
    );
    expect(qs).toEqual(['cover-device-band o3 device -> cut-shape', 'cta-contact o4 button -> card']);
    expect(byId['cover-device-band'].intent.device).toBeNull();
    expect(byId['cover-device-band'].intent.why.device).toMatch(/question until the owner verifies/);
  });
});

/* -------------------------------------------------------------------- synthetic records (no browser) */

/** A minimal anatomy record + raw objects: a background, a title, and a band the author marks as the device. */
function synthetic({ role = 'device', need = 'device:band', needOptional = false } = {}) {
  const record = {
    category: { term: 'cover-slide', why: 'test' },
    L1_elements: [
      {
        id: 'o1',
        role: 'background',
        rule: 'background.fill',
        kind: 'shape',
        bbox: [0, 0, 100, 100],
        areaPct: 100,
        z: 0,
      },
      {
        id: 'o2',
        role: 'title',
        rule: 'title.largest',
        kind: 'text',
        bbox: [10, 40, 60, 50],
        z: 1,
        sizePctH: 8,
        weight: '700',
        lines: 1,
        align: 'left',
      },
      {
        id: 'o3',
        role: 'band',
        rule: 'band.strip',
        kind: 'shape',
        bbox: [70, 0, 80, 100],
        z: 2,
        areaPct: 10,
        bleed: ['top', 'bottom'],
      },
    ],
    L2_composition: {
      margins: { left: 10, top: 40, right: 20, bottom: 50, open: ['bottom'] },
      zones: { text: [10, 40, 60, 50], visual: null, split: null, textAreaPct: 5, visualAreaPct: 0 },
      edges: [],
      mainEdge: null,
      rhythm: null,
    },
    L3_balance: {
      typeScale: {
        sizesPctH: [8],
        ratios: [],
        titleToBody: null,
        titleWords: 3,
        titleLines: 1,
        emphasisRuns: [],
      },
      weight: null,
      ink: null,
      busy3x3: null,
    },
  };
  const raw = {
    objects: [
      { id: 'o1', kind: 'shape', tag: 'slide', fill: '#eeeeee' },
      { id: 'o2', kind: 'text', text: 'Dolor sit amet', weight: '700' },
      {
        id: 'o3',
        kind: 'shape',
        fill: '#555555',
        authored: { role, need, ...(needOptional ? { needOptional } : {}) },
      },
    ],
  };
  return authoredTemplate({ id: 'synthetic', record, raw, file: 'synthetic.html', measuredAt: '2026-11-04' });
}

describe('authored records: the rules', () => {
  test('a conflicting authored role yields a question; the element keeps the identified role', () => {
    const { template, errors } = synthetic();
    expect(errors).toEqual([]);
    expect(template.elements.find((e) => e.id === 'o3').role).toBe('band');
    expect(template.questions).toEqual([
      expect.objectContaining({ element: 'o3', authored: 'device', identified: 'band' }),
    ]);
    expect(template.needs).toEqual([
      { key: 'device:band', role: 'device', optional: false, why: 'data-need on o3', element: 'o3' },
    ]);
    expect(validateTemplate(template)).toEqual({ valid: true, errors: [] });
  });

  test('an agreeing authored role yields no question (negative of the above)', () => {
    const { template } = synthetic({ role: 'band', need: 'colour-field:accent' });
    expect(template.questions).toBeUndefined();
  });

  test('a role outside the vocabulary fails (record) and is an unknown-term error (authored mark)', () => {
    const { template } = synthetic();
    const bad = structuredClone(template);
    bad.elements[1].role = 'hologram';
    expect(validateTemplate(bad).valid).toBe(false);
    expect(validateTemplate(bad).errors.join(' ')).toMatch(/hologram/);
    const { errors } = synthetic({ role: 'hologram' });
    expect(errors).toEqual([
      expect.stringMatching(/data-role "hologram" is not an E2 term \(an unknown term\)/),
    ]);
  });

  test('a need outside the grammar fails', () => {
    const { errors, template } = synthetic({ need: 'sparkle:gold' });
    expect(errors).toEqual([expect.stringMatching(/"sparkle" is not a capability kind/)]);
    expect(validateTemplate(template).valid).toBe(false);
    for (const key of [
      'device',
      'image:dog',
      'logo:',
      'component:wombat',
      'component:cover-slide',
      'overlay:',
      'motion:x',
    ])
      expect([key, synthetic({ need: key }).errors]).toEqual([key, [expect.any(String)]]);
    for (const key of [
      'photo-area',
      'device:cover-bands',
      'image:abstract',
      'logo:monoLight',
      'logo:icon',
      'logo:reverse',
      'component:chip',
      'component:quotes',
      'component:process',
      'component:stack',
      'type-ladder',
      'angle',
      'composition',
      'motion',
    ])
      expect([key, synthetic({ need: key }).errors]).toEqual([key, []]);
  });

  test('a need naming no element fails', () => {
    const { template } = synthetic();
    const bad = structuredClone(template);
    bad.needs[0].element = 'o99';
    expect(validateTemplate(bad).errors).toEqual([
      expect.stringMatching(/names no element of the record \(o99\)/),
    ]);
    delete bad.needs[0].element;
    expect(validateTemplate(bad).valid).toBe(false);
  });
});
