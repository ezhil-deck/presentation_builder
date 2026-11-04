import { BrandInputError, readBrand, validateBrandSpec } from '../src/index.js';
import { BAND_SVG, claimsCopy, pngBuffer, writeFile } from './claimsFixture.js';

const opts = { cacheDir: null };

function read(edit) {
  const copy = claimsCopy(edit);
  try {
    try {
      return { spec: readBrand(copy.dir, opts) };
    } catch (error) {
      return { error };
    }
  } finally {
    copy.cleanup();
  }
}

const claimQuestions = (spec) => spec.questions.filter((q) => q.id.startsWith('claim.')).map((q) => q.id);
const claim = (spec, id) => spec.claims.find((c) => c.id === id);

describe('BR-CLAIMS on the claims fixture', () => {
  const { spec, error } = read();

  it('reads into a schema-valid BrandSpec', () => {
    expect(error).toBeUndefined();
    expect(validateBrandSpec(spec)).toEqual([]);
  });

  it('every claim the fixture makes is checked and passes: no claim question', () => {
    expect(claimQuestions(spec)).toEqual([]);
    expect(spec.claims.map((c) => c.id).sort()).toEqual(
      [
        'photoArea.title',
        'logoBox.title',
        'sample.0',
        'logoTone.monoLight',
        'logoTone.monoDark',
        'decorAspect.corner',
        'decorColours.corner',
        'decorAspect.glow',
        'decorColours.glow',
        'decorAspect.band',
        'decorColours.band',
        'backgroundSurface.cover',
        'mask.slant',
        'mask.blob',
      ].sort(),
    );
    for (const c of spec.claims) expect([c.id, c.pass]).toEqual([c.id, true]);
  });

  it('records the measured numbers next to the claimed ones', () => {
    const p = claim(spec, 'photoArea.title');
    expect(p.file).toBe('assets/decor/band.svg');
    expect(p.measured.vertexInsidePx).toBeLessThanOrEqual(1);
    expect(p.measured.edgeMaxDistancePx).toBeLessThan(1);
    expect(p.measured.nearestEdge).toEqual([
      [1000, 0],
      [700, 1080],
    ]);
    const l = claim(spec, 'logoBox.title');
    expect(l.measured.lockup).toEqual({ x: 1400, y: 80, w: 400, h: 120 });
    expect(l.measured.fill).toBe(1);
    expect(l.measured.borderColour).toBe('#1A1A2E');
    expect(claim(spec, 'sample.0').measured).toEqual({
      width: 60,
      height: 40,
      aspect: 1.5,
      scaleW: 1,
      scaleH: 1,
    });
    expect(claim(spec, 'logoTone.monoLight').measured.meanLuminance).toBe(1);
    expect(claim(spec, 'backgroundSurface.cover').measured.share).toBeGreaterThan(0.9);
  });

  it('provenance /claims/<i> names the rule, the pointer and the file', () => {
    const i = spec.claims.findIndex((c) => c.id === 'photoArea.title');
    expect(spec.provenance[`/claims/${i}`]).toEqual({
      source: 'derived',
      from: 'BR-CLAIMS',
      signal: '/brandLayouts/0/composition/photoArea + assets/decor/band.svg',
    });
  });
});

describe('BR-CLAIMS negative tests: each wrong claim is exactly its one optional question', () => {
  const cases = [
    [
      'a photoArea overlapping the band',
      (input) => {
        input.layouts[0].composition.photoArea = [
          [0, 0],
          [1150, 0],
          [850, 1080],
          [0, 1080],
        ];
      },
      'claim.photoArea.title',
      '/layouts/0/composition/photoArea',
    ],
    [
      'a logo box over an empty region',
      (input) => {
        input.layouts[0].composition.logo.box = { x: 200, y: 600, w: 400, h: 120 };
      },
      'claim.logoBox.title',
      '/layouts/0/composition/logo',
    ],
    [
      'a logo box naming a variant the brand does not have',
      (input) => {
        input.layouts[0].composition.logo.variant = 'monoMissing';
      },
      'claim.logoBox.title',
      '/layouts/0/composition/logo',
    ],
    [
      'a wrong sample w / h',
      (input) => {
        input.imagery.samples[0].w = 80;
      },
      'claim.sample.0',
      '/imagery/samples/0',
    ],
    [
      'a dark monoLight',
      (input) => {
        input.brand.logos.monoLight = 'assets/logo-dark.png';
      },
      'claim.logoTone.monoLight',
      '/brand/logos/monoLight',
    ],
    [
      'a decor box aspect 20 % off its viewBox',
      (input) => {
        input.assets.elements[0].box.w = 240; // corner.svg viewBox 100 x 60 = 1.667; box 240 x 120 = 2
      },
      'claim.decorAspect.corner',
      '/assets/elements/0/box',
    ],
    [
      'a decor SVG painting a colour the brand does not have',
      (input, dir) => {
        writeFile(dir, 'assets/decor/band.svg', BAND_SVG.replace('#E94560', '#00FF00'));
      },
      'claim.decorColours.band',
      '/assets/elements/2/file',
    ],
    [
      'an image background without its surface colour field',
      (input, dir) => {
        writeFile(
          dir,
          'assets/cover.png',
          pngBuffer(
            192,
            108,
            [240, 240, 240, 255],
            [{ x: 140, y: 8, w: 40, h: 12, rgba: [20, 20, 20, 255] }],
          ),
        );
      },
      'claim.backgroundSurface.cover',
      '/backgrounds/variants/cover/surface',
    ],
    [
      'an svg mask whose file draws nothing',
      (input, dir) => {
        writeFile(
          dir,
          'assets/masks/blob.svg',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
        );
      },
      'claim.mask.blob',
      '/masks/options/blob',
    ],
    [
      'a polygon mask whose points do not parse',
      (input) => {
        input.masks.options.slant.points = '20,0 100';
      },
      'claim.mask.slant',
      '/masks/options/slant',
    ],
  ];

  it.each(cases)('%s', (name, edit, id, pointer) => {
    const { spec, error } = read(edit);
    expect(error).toBeUndefined();
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(claimQuestions(spec)).toEqual([id]);
    const q = spec.questions.find((x) => x.id === id);
    expect(q).toMatchObject({ pointer, severity: 'optional', neededBy: ['BR-CLAIMS'] });
    expect(spec.questions.filter((x) => x.severity === 'blocking')).toEqual([]);
    expect(claim(spec, id.slice('claim.'.length)).pass).toBe(false);
  });

  it('a mask naming a missing file stays a BR-ASSET error (D6), not a claim', () => {
    const { error } = read((input) => {
      input.masks.options.blob.file = 'assets/masks/missing.svg';
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.errors.map((e) => e.pointer)).toEqual(['/masks/options/blob/file']);
  });

  it('a claim the JSON does not make is not checked (no entry)', () => {
    const { spec } = read((input) => {
      delete input.layouts[0].composition.logo;
      delete input.imagery.samples[0].w;
      delete input.imagery.samples[0].h;
      delete input.imagery.samples[0].aspect;
    });
    expect(claim(spec, 'logoBox.title')).toBeUndefined();
    expect(claim(spec, 'sample.0')).toBeUndefined();
  });

  it('a format it cannot decode is a skipped claim (pass null), not a question', () => {
    const { spec } = read((input, dir) => {
      writeFile(dir, 'assets/cover.webp', Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '));
      input.backgrounds.variants.cover.image = 'assets/cover.webp';
    });
    const c = claim(spec, 'backgroundSurface.cover');
    expect(c.pass).toBeNull();
    expect(c.why).toMatch(/format not decoded/);
    expect(claimQuestions(spec)).not.toContain('claim.backgroundSurface.cover');
  });

  it('reverse makes no tone claim (it may be dark, for a coloured ground); its luminance is a capability measurement', () => {
    const { spec } = read((input) => {
      input.brand.logos.reverse = 'assets/logo-dark.png';
    });
    expect(claim(spec, 'logoTone.reverse')).toBeUndefined();
    expect(claimQuestions(spec)).toEqual([]);
    expect(spec.capabilities.find((x) => x.key === 'logo:reverse').measured.meanLuminance).toBeLessThan(0.05);
  });

  it('a colorable decor element makes no colour claim', () => {
    const { spec } = read((input, dir) => {
      writeFile(dir, 'assets/decor/band.svg', BAND_SVG.replace('#E94560', '#00FF00'));
      input.assets.elements[2].colorable = true;
    });
    expect(claim(spec, 'decorColours.band')).toBeUndefined();
    expect(claimQuestions(spec)).toEqual([]);
  });
});
