import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { deriveMood, deriveMoodResult, ENGINE_VERSION, RULES, toKind } from '../src/index.js';
import { sortKeys } from '../src/util.js';
import { load, readJson } from './fixtures.js';

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile(readJson('..', '..', '..', 'schemas', 'mood.schema.json'));

describe('deriveMood (Assembly)', () => {
  it('runs the twelve rules in the P1 order', () => {
    expect(RULES.map((r) => r.RULE)).toEqual([
      'MD-PALETTE',
      'MD-TYPE',
      'MD-GEOMETRY',
      'MD-SHAPE',
      'MD-COMPONENTS',
      'MD-CHARTS-TABLES',
      'MD-LOGO',
      'MD-FOOTER',
      'MD-DECOR',
      'MD-COMPOSITION',
      'MD-MOTION',
      'MD-VOICE',
    ]);
  });

  it.each(['stripe', 'minimal'])('%s: output validates against schemas/mood.schema.json', (name) => {
    const mood = deriveMood(load(name));
    expect(validate(mood) ? null : validate.errors).toBeNull();
  });

  it('is deterministic: same BrandSpec -> identical JSON string, keys sorted', () => {
    const a = JSON.stringify(deriveMood(load('stripe')));
    const b = JSON.stringify(deriveMood(load('stripe')));
    expect(a).toBe(b);
    const mood = JSON.parse(a);
    expect(Object.keys(mood)).toEqual([...Object.keys(mood)].sort());
    expect(Object.keys(mood.palette.surfaces[0])).toEqual([...Object.keys(mood.palette.surfaces[0])].sort());
  });

  it('id, brandId, brandHash (sha256 of canonical sorted-key JSON), engineVersion', () => {
    const spec = load('stripe');
    const mood = deriveMood(spec);
    expect(mood).toMatchObject({ schema: 'mood/1', id: 'stripe', brandId: 'stripe', name: 'Stripe' });
    const canonical = JSON.stringify(sortKeys(spec));
    expect(mood.brandHash).toBe(createHash('sha256').update(canonical).digest('hex'));
    expect(mood.engineVersion).toBe(readJson('..', 'package.json').version);
    expect(ENGINE_VERSION).toBe(mood.engineVersion);
    // key order of the input does not change the hash
    const reordered = Object.fromEntries(Object.entries(spec).reverse());
    expect(deriveMood(reordered).brandHash).toBe(mood.brandHash);
  });

  it('merges every group and keeps provenance pointers into the Mood', () => {
    const mood = deriveMood(load('stripe'));
    for (const k of [
      'palette',
      'type',
      'geometry',
      'shape',
      'components',
      'charts',
      'tables',
      'logo',
      'footer',
      'decor',
      'composition',
      'motion',
      'voice',
    ]) {
      expect(mood[k]).toBeDefined();
    }
    for (const [p, entry] of Object.entries(mood.provenance)) {
      expect(p.startsWith('/')).toBe(true);
      expect(entry.rule).toMatch(/^(MD-|ASSEMBLY)/);
      expect(Array.isArray(entry.from)).toBe(true);
    }
    expect(mood.provenance['/type/roles/h1']).toMatchObject({
      rule: 'MD-TYPE',
      from: ['/typography/roles/h1'],
    });
  });

  it('an unknown layout id is kept verbatim and warned once across all rules', () => {
    const b = load('stripe');
    b.brandLayouts.find((l) => l.id === 'stat').id = 'mosaic';
    b.logos.perLayout.mosaic = 'small';
    const { mood } = deriveMoodResult(b);
    expect(toKind('mosaic').known).toBe(false);
    expect(mood.palette.perKind.mosaic).toBe('page');
    expect(mood.composition.layoutHints.mosaic).toBeDefined();
    expect(mood.logo.perKind.mosaic).toBe('small');
    expect(mood.warnings.filter((w) => w.message.includes('"mosaic"'))).toHaveLength(1);
  });

  it('D10: stat -> kpi and imageText -> image-text across the rules', () => {
    const { mood } = deriveMoodResult(load('stripe'));
    expect(mood.palette.perKind.kpi).toBe('page');
    expect(mood.composition.layoutHints['image-text']).toBeDefined();
    expect(mood.warnings.filter((w) => /unknown layout id/.test(w.message))).toEqual([]);
  });

  it('D5: mood questions carry input pointers (where answers.json writes)', () => {
    const { questions } = deriveMoodResult(load('stripe'));
    expect(questions).toEqual([
      expect.objectContaining({ id: 'logos.heightLarge', pointer: '/brand/logoRules/heightLarge' }),
    ]);
  });

  it('questions travel beside the Mood, merged by id with every rule that needs them', () => {
    const { questions, mood } = deriveMoodResult(load('minimal'));
    expect(mood.questions).toBeUndefined();
    expect(questions.map((q) => q.id)).toContain('typography.limits.minBodySize');
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it('minimal: absent blocks stay absent', () => {
    const mood = deriveMood(load('minimal'));
    for (const k of ['components', 'decor', 'motion', 'charts', 'tables', 'composition', 'voice'])
      expect(mood[k]).toBeUndefined();
    expect(mood.footer).toEqual({ show: false });
    expect(mood.palette.surfaces.map((s) => s.role)).toEqual(['default', 'dark']);
  });

  it('throws with the error list (and questions) when the Mood would be invalid', () => {
    const b = load('minimal');
    delete b.surfaces[1].heading;
    let err;
    try {
      deriveMood(b);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/palette\/surfaces\/1/);
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.questions).toContainEqual(expect.objectContaining({ pointer: '/surfaces/1/heading' }));
  });

  it('rejects anything that is not a BrandSpec', () => {
    expect(() => deriveMood({})).toThrow(/BrandSpec/);
    expect(() => deriveMood(null)).toThrow(/BrandSpec/);
  });
});

describe('toInputPointer (D5)', () => {
  it('maps BrandSpec pointers back to the input field map; others unchanged', () => {
    const { toInputPointer } = require('../src/util.js');
    expect(toInputPointer('/typography/roles/h2/weight')).toBe('/typography/styles/h2/weight');
    expect(toInputPointer('/typography/faces/body')).toBe('/typography/fonts/body');
    expect(toInputPointer('/logos/variants/full')).toBe('/brand/logos/full');
    expect(toInputPointer('/logos/heightLarge')).toBe('/brand/logoRules/heightLarge');
    expect(toInputPointer('/components/cards/style/kind')).toBe('/cards/style/kind');
    expect(toInputPointer('/typography/limits/minBodySize')).toBe('/typography/limits/minBodySize');
    expect(toInputPointer('/surfaces/1/heading')).toBe('/surfaces/1/heading');
    expect(toInputPointer('/logosX')).toBe('/logosX');
  });
});
