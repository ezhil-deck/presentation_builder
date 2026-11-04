import { readBrand, validateBrandSpec } from '../src/index.js';
import { familyOf, isOffered, parsePolygonPoints, termOf, unverifiedFields } from '../src/capabilities.js';
import { claimsCopy } from './claimsFixture.js';
import { MINI, miniCopy } from './helpers.js';

const opts = { cacheDir: null };

function readEdited(edit, copyFn = miniCopy) {
  const copy = copyFn(edit);
  try {
    return readBrand(copy.dir, opts);
  } finally {
    copy.cleanup();
  }
}

const keys = (spec) => spec.capabilities.map((c) => c.key);
const cap = (spec, key) => spec.capabilities.find((c) => c.key === key);

describe('BR-CAPABILITIES on the mini fixture', () => {
  const spec = readBrand(MINI, opts);

  it('derives exactly the capabilities the mini JSON gives, in family order', () => {
    expect(keys(spec)).toEqual([
      'device:corner',
      'device:glow',
      'colour-field:page',
      'colour-field:ink',
      'type-ladder',
      'logo:full',
      'logo:monoLight',
      'component:chip',
      'component:icon',
      'angle',
      'composition',
      'motion',
    ]);
    expect(validateBrandSpec(spec)).toEqual([]);
  });

  it('names each in the vocabulary (decor type map, brand-logo, background, the components map)', () => {
    expect(cap(spec, 'device:corner').term).toBe('E2:decor'); // type shape, frequency often: decor, not a device
    expect(cap(spec, 'device:glow').term).toBe('E2:illustration');
    expect(cap(spec, 'logo:full').term).toBe('E2:brand-logo');
    expect(cap(spec, 'colour-field:ink').term).toBe('E2:background');
    expect(cap(spec, 'component:chip').term).toBe('E2:chip');
    expect(cap(spec, 'angle').term).toBeNull(); // not an element: a brand rule
    expect(cap(spec, 'angle').measured).toEqual({ angles: [31], count: 1 });
    expect(cap(spec, 'angle').given.byAngle).toEqual({ 31: ['corner'] });
    expect(cap(spec, 'type-ladder').term).toBeNull(); // not an element: a brand rule, never 'unknown'
    for (const k of ['type-ladder', 'angle', 'composition', 'motion'])
      expect(cap(spec, k).why).toMatch(/^not an element: a brand rule/);
    expect(spec.capabilities.filter((c) => c.term === 'unknown')).toEqual([]); // every mini element has a term
  });

  it('measures the device SVG through its box: area share, bbox and the slant angle', () => {
    const g = cap(spec, 'device:corner').measured.geometry;
    expect(g.frame).toBe('canvas');
    expect(g.shapes).toBe(1);
    expect(g.areaShare).toBeCloseTo(0.5, 2); // a right triangle over its box
    expect(g.angles).toEqual([31]); // atan(120 / 200) = 30.96 -> 31 (0.5 steps)
    expect(g.bbox).toEqual({ x: 89.58, y: 0, w: 10.42, h: 11.11 });
    expect(g.polygons).toEqual([
      [
        [89.58, 0],
        [100, 0],
        [100, 11.11],
      ],
    ]);
    expect(cap(spec, 'device:corner').measured.box).toEqual({ x: 89.58, y: 0, w: 10.42, h: 11.11 });
  });

  it('measures logos (luminance of the opaque pixels, SVG and PNG) and the type ladder', () => {
    expect(cap(spec, 'logo:full').measured).toMatchObject({ width: 240, height: 64, meanLuminance: 0.012 });
    expect(cap(spec, 'logo:monoLight').measured.meanLuminance).toBe(1);
    const t = cap(spec, 'type-ladder').measured;
    expect(t.sizes).toEqual({ display: 96, h1: 64, h2: 48, h3: 36, body: 28, caption: 20 });
    expect(t.titleToBody).toBe(2.286);
    expect(t.steps[0]).toEqual({ from: 'display', to: 'h1', ratio: 1.5 });
  });

  it('every capability is given (no inferred provenance) and has its provenance entry', () => {
    spec.capabilities.forEach((c, i) => {
      expect(c.status).toBe('given');
      expect(spec.provenance[`/capabilities/${i}`]).toEqual({
        source: 'derived',
        from: 'BR-CAPABILITIES',
        signal: c.from.join(' + '),
      });
    });
  });

  it('no second face, no weight contrast: one family at 400 only (absent, not a question)', () => {
    expect(cap(spec, 'second-face')).toBeUndefined();
    expect(cap(spec, 'weight-contrast')).toBeUndefined();
    expect(spec.questions).toEqual([]);
  });
});

describe('BR-CAPABILITIES status and absence', () => {
  it('an inferred: true provenance without verifiedAt makes the capability offered', () => {
    const spec = readEdited((input) => {
      input.backgrounds.variants.ink.provenance = { source: 'a model read it', inferred: true };
    });
    expect(cap(spec, 'colour-field:ink').status).toBe('offered');
    expect(cap(spec, 'colour-field:page').status).toBe('given');
    expect(unverifiedFields(spec)).toEqual([
      '/backgrounds/variants/ink/surface',
      '/backgrounds/variants/ink/type',
    ]);
  });

  it("the owner's verifiedAt lifts an inferred value back to given", () => {
    const spec = readEdited((input) => {
      input.backgrounds.variants.ink.provenance = {
        source: 'a model read it',
        inferred: true,
        verifiedAt: '2026-11-04',
      };
    });
    expect(cap(spec, 'colour-field:ink').status).toBe('given');
    expect(unverifiedFields(spec)).toEqual([]);
  });

  it('a brand with no decor has no device:* or angle keys and no error', () => {
    const spec = readEdited((input) => {
      delete input.assets.elements;
    });
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(keys(spec).filter((k) => k.startsWith('device:') || k === 'angle')).toEqual([]);
    expect(spec.questions).toEqual([]);
  });

  it('isOffered reads only provenance under the capability pointers', () => {
    const prov = {
      '/a/b': { source: 'given', inputProvenance: { inferred: true } },
      '/c': { source: 'given' },
    };
    expect(isOffered(prov, ['/a'])).toBe(true);
    expect(isOffered(prov, ['/c'])).toBe(false);
    expect(isOffered(prov, ['/ab'])).toBe(false);
  });
});

describe('BR-CAPABILITIES on the claims fixture (composition, imagery, masks, weights)', () => {
  const spec = readEdited((input) => {
    input.typography.fonts.body.weights = [300, 700];
    input.typography.fonts.heading.family = 'Other';
    input.imagery.samples[0].tags = ['hero', 'cutout'];
    input.layouts[0].titleAlign = 'right';
    input.layouts[0].textMaxWidth = 0.42;
  }, claimsCopy);

  it('adds the composition, imagery, mask and type keys', () => {
    for (const k of [
      'device:band',
      'photo-area',
      'text-zone',
      'image:photo-people',
      'cutout',
      'mask:slant',
      'mask:blob',
      'second-face',
      'weight-contrast',
      'logo:monoDark',
    ])
      expect(keys(spec)).toContain(k);
  });

  it('the device named by a composition is E2:device; its photo area is a zone in %', () => {
    expect(cap(spec, 'device:band').term).toBe('E2:device');
    expect(cap(spec, 'device:band').given.namedBy).toEqual(['title']);
    const p = cap(spec, 'photo-area');
    expect(p.term).toBe('E3:zone');
    expect(p.given.layouts[0].polygon).toEqual([
      [0, 0],
      [52.08, 0],
      [36.46, 100],
      [0, 100],
    ]);
    expect(p.from).toEqual(['/brandLayouts/0/composition/photoArea']);
  });

  it("text-zone from the composition layout's titleAlign / textMaxWidth", () => {
    expect(cap(spec, 'text-zone').given.layouts).toEqual([
      { id: 'title', titleAlign: 'right', maxWidthPct: 42 },
    ]);
  });

  it('records the composition logo box on logo:<variant>', () => {
    expect(cap(spec, 'logo:monoLight').given.placements).toEqual([
      { layout: 'title', box: { x: 72.92, y: 7.41, w: 20.83, h: 11.11 } },
    ]);
  });

  it('measures masks and weights', () => {
    expect(cap(spec, 'mask:slant').term).toBe('E4:polygon');
    expect(cap(spec, 'mask:slant').measured.polygon).toHaveLength(4);
    expect(cap(spec, 'mask:blob').term).toBe('E4:svg');
    expect(cap(spec, 'mask:blob').measured.areaShare).toBeCloseTo(0.5, 2);
    expect(cap(spec, 'weight-contrast').measured.spread).toBe(400);
    expect(cap(spec, 'second-face').measured.families).toBe(2);
    expect(cap(spec, 'image:photo-people')).toMatchObject({
      term: 'E2:picture',
      measured: { count: 1, aspects: [1.5] },
    });
  });
});

describe('helpers', () => {
  it('termOf maps through the vocabulary, unknown otherwise', () => {
    expect(termOf('brand.decor.type', 'rule')).toBe('E2:rule');
    expect(termOf('brand.decor.type', 'nonsense')).toBe('unknown');
    expect(termOf('brand.decor.type', undefined)).toBe('unknown');
  });

  it('familyOf groups keys', () => {
    expect(familyOf('device:x')).toBe('devices');
    expect(familyOf('photo-area')).toBe('photo-areas');
    expect(familyOf('mask:x')).toBe('imagery');
    expect(familyOf('angle')).toBe('shape');
    expect(familyOf('weight-contrast')).toBe('type');
    expect(familyOf('motion')).toBe('composition');
  });

  it('parsePolygonPoints needs 3+ finite x,y pairs', () => {
    expect(parsePolygonPoints('0,0 10,0 10,10')).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(parsePolygonPoints('0,0 10,0')).toBeNull();
    expect(parsePolygonPoints('0,0 a,0 10,10')).toBeNull();
  });
});
