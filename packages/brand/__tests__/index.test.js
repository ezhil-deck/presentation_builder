import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrandInputError, readBrand, validateBrandSpec } from '../src/index.js';
import { MINI, miniCopy } from './helpers.js';

const opts = { cacheDir: null };

/** readBrand() on an edited copy of mini; returns the spec or the thrown error. */
function readEdited(edit, after) {
  const copy = miniCopy(edit);
  try {
    if (after) after(copy.dir);
    try {
      return { spec: readBrand(copy.dir, opts) };
    } catch (error) {
      return { error };
    }
  } finally {
    copy.cleanup();
  }
}

const pointers = (error) => error.errors.map((e) => e.pointer);

describe('readBrand (BR-READ + assembly)', () => {
  it('reads the mini fixture into a schema-valid BrandSpec with no questions', () => {
    const spec = readBrand(MINI, opts);
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(spec.schema).toBe('brand-spec/1');
    expect(spec.id).toBe('mini');
    expect(spec.name).toBe('Mini');
    expect(spec.questions).toEqual([]);
    expect(spec.input).toEqual({
      file: 'mini.json',
      version: '1.4.0',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(spec.logos.variants.full).toEqual({
      file: 'assets/logo.svg',
      mime: 'image/svg+xml',
      width: 240,
      height: 64,
    });
    expect(spec.logos.variants.monoLight).toMatchObject({ mime: 'image/png', width: 3, height: 2 });
    expect(spec.decor.elements[0]).toMatchObject({ mime: 'image/svg+xml', width: 200, height: 120 });
    expect(spec.provenance['/logos/variants/full/width']).toEqual({
      source: 'derived',
      from: 'BR-ASSET',
      signal: 'assets/logo.svg',
    });
  });

  it('resolves font files and metrics (BR-FONTFILES, BR-METRICS)', () => {
    const { heading, body } = readBrand(MINI, opts).typography.faces;
    expect(heading.files).toEqual([
      { file: 'assets/fonts/Tiny-Regular.ttf', format: 'ttf', weight: '400', style: 'normal' },
    ]);
    expect(heading.variable).toBe(false);
    expect(heading.metrics).toMatchObject({
      unitsPerEm: 1000,
      ascent: 0.8,
      capHeight: 0.7,
      avgCharWidth: 0.5,
      file: 'assets/fonts/Tiny-Regular.ttf',
    });
    expect(heading.metrics.widths['65']).toBe(0.6);
    expect(body.files).toHaveLength(1);
  });

  it('is deterministic', () => {
    expect(readBrand(MINI, opts)).toEqual(readBrand(MINI, opts));
  });

  it('the input sha256 is of the input file', () => {
    const a = readBrand(MINI, opts).input.sha256;
    const b = readEdited((input) => {
      input.brand.tagline = 'changed';
    }).spec.input.sha256;
    expect(a).not.toBe(b);
  });

  it('throws on a folder without <id>.json', () => {
    expect(() => readBrand(join(__dirname))).toThrow(/brand input not found/);
    expect(() => readBrand(join(__dirname, 'nope'))).toThrow(BrandInputError);
  });

  it('missing font file -> blocking question (no throw)', () => {
    const { spec } = readEdited(null, (dir) => rmSync(join(dir, 'assets', 'fonts', 'Tiny-Regular.ttf')));
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(spec.typography.faces.heading.files).toEqual([]);
    expect(spec.typography.faces.heading.metrics).toBeUndefined();
    const blocking = spec.questions.filter((q) => q.severity === 'blocking');
    expect(blocking.map((q) => [q.id, q.pointer])).toEqual([
      ['typography.faces.heading.files', '/typography/fonts/heading/url'],
      ['typography.faces.body.files', '/typography/fonts/body/files'],
    ]);
  });

  it('bad colour -> BrandInputError with the pointer', () => {
    const { error } = readEdited((input) => {
      input.colors.primary = 'navy';
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(pointers(error)).toContain('/colors/primary');
  });

  it('bad surface colour -> BrandInputError with the pointer', () => {
    const { error } = readEdited((input) => {
      input.surfaces[1].bg = '#12345';
    });
    expect(pointers(error)).toEqual(['/surfaces/1/bg']);
  });

  it('missing required key -> BrandInputError naming the missing key', () => {
    const { error } = readEdited((input) => {
      delete input.brand.name;
      delete input.typography.styles.h1;
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.errors).toEqual(
      expect.arrayContaining([
        { pointer: '/brand/name', message: 'is required' },
        { pointer: '/typography/styles/h1', message: 'is required' },
      ]),
    );
  });

  it('id other than the folder name -> error at /id', () => {
    const { error } = readEdited((input) => {
      input.id = 'other';
    });
    expect(pointers(error)).toEqual(['/id']);
  });

  it('canvas not 1920x1080 -> error', () => {
    const { error } = readEdited((input) => {
      input.layout.width = 1280;
      input.layout.height = 720;
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.errors).toEqual([
      { pointer: '/layout/width', message: expect.stringMatching(/must be 1920/) },
      { pointer: '/layout/height', message: expect.stringMatching(/must be 1080/) },
    ]);
  });

  it('canvas size not given -> error', () => {
    const { error } = readEdited((input) => {
      delete input.layout.width;
    });
    expect(error.errors).toEqual([{ pointer: '/layout/width', message: 'is required and must be 1920' }]);
  });

  it('missing referenced file (logo, decor) -> error {pointer, file}', () => {
    const { error } = readEdited((input) => {
      input.brand.logos.full = 'assets/missing-logo.svg';
      input.assets.elements[0].file = 'assets/decor/none.svg';
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.errors).toEqual([
      {
        pointer: '/brand/logos/full',
        file: 'assets/missing-logo.svg',
        message: 'file not found: assets/missing-logo.svg',
      },
      {
        pointer: '/assets/elements/0/file',
        file: 'assets/decor/none.svg',
        message: 'file not found: assets/decor/none.svg',
      },
    ]);
    expect(Array.isArray(error.questions)).toBe(true);
  });

  it('missing logos.full -> blocking question with the other variants as options', () => {
    const { spec } = readEdited((input) => {
      delete input.brand.logos.full;
    });
    expect(spec.questions).toEqual([
      expect.objectContaining({
        id: 'logos.variants.full',
        severity: 'blocking',
        options: [{ variant: 'monoLight', file: 'assets/logo-white.png' }],
      }),
    ]);
  });

  it('a value the BrandSpec schema cannot hold -> BrandInputError (never coerced)', () => {
    // An answer outside the input schema is kept (D5) but must still fit the BrandSpec: logos.heightLarge is a number.
    const { error } = readEdited(null, (dir) =>
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({ '/brand/logoRules/heightLarge': 'big' })),
    );
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.message).toMatch(/BrandSpec is invalid/);
    expect(pointers(error)).toEqual(['/logos/heightLarge']);
  });

  it('D2: input enums the BrandSpec mirrors read cleanly (severity warning, policy, icons, decor, case)', () => {
    const { spec, error } = readEdited((input) => {
      input.rules[0].severity = 'warning';
      input.gradients = { policy: 'accents-only' };
      input.icons = { style: 'line' };
      input.typography.styles.caption.case = 'sentence';
      input.typography.bullets.nested = ['-', '·'];
      input.layout.shadowScale = { card: { x: 0, y: 2, blur: 8, spread: 0, color: '#000000', opacity: 0.1 } };
      input.assets.elements.push({ id: 'rule', type: 'rule', placement: 'under-title', color: 'accent' });
      input.backgrounds.variants.glow = { type: 'linear-gradient', surface: 'ink', overlay: 'accent' };
    });
    expect(error).toBeUndefined();
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(spec.rules[0].severity).toBe('warning');
    expect(spec.decor.elements[2]).toEqual({
      id: 'rule',
      type: 'rule',
      placement: 'under-title',
      color: 'accent',
    });
  });

  it('D2 negative: a value outside the mirrored enum is still an error', () => {
    const { error } = readEdited((input) => {
      input.rules[0].severity = 'fatal';
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(pointers(error)).toEqual(['/rules/0/severity']);
  });

  it('D1: an unknown input key is a warning (ignored, listed once); the read succeeds', () => {
    const { spec } = readEdited((input) => {
      input.icons = { style: 'line', library: 'lucide' };
      input.surfaces[0].glow = '#FFFFFF';
      input.surfaces[1].glow = '#000000';
    });
    expect(validateBrandSpec(spec)).toEqual([]);
    expect(spec.components.icons).toEqual({ style: 'line' });
    expect(spec.surfaces[0].glow).toBeUndefined();
    const d1 = spec.warnings.filter((w) => /input schema \(D1\)/.test(w.message));
    expect(d1.map((w) => w.pointer)).toEqual(['/icons/library', '/surfaces/*/glow']);
    expect(d1[1].message).toMatch(/2 occurrence\(s\)/);
  });

  it('D1 negative: type / enum / required / pattern violations stay errors', () => {
    const { error } = readEdited((input) => {
      input.icons = { style: 'sketchy', library: 'lucide' }; // enum (error) + unknown key (warning)
      input.layout.grid.columns = 'twelve'; // type
      input.colors.accent = '#ZZZZZZ'; // pattern
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(pointers(error).sort()).toEqual(['/colors/accent', '/icons/style', '/layout/grid/columns']);
  });

  it('D5: an answer at an input pointer the reference schema lacks is kept (logos.heightLarge)', () => {
    const { spec } = readEdited(null, (dir) =>
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({ '/brand/logoRules/heightLarge': 96 })),
    );
    expect(spec.logos.heightLarge).toBe(96);
    expect(spec.provenance['/logos/heightLarge']).toEqual({
      source: 'answered',
      from: '/brand/logoRules/heightLarge',
    });
    expect(spec.warnings.map((w) => w.pointer)).not.toContain('/brand/logoRules/heightLarge');
  });

  it('D7: required-but-missing -> BrandInputError with questions at the input pointers, needsAnswers', () => {
    const { error } = readEdited((input) => {
      delete input.colors.primary;
      delete input.layout.width;
    });
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.needsAnswers).toBe(true);
    expect(error.questions).toEqual(
      expect.arrayContaining([expect.objectContaining({ pointer: '/colors/primary', severity: 'blocking' })]),
    );
    const { error: canvas } = readEdited((input) => {
      delete input.layout.width;
    });
    expect(canvas.needsAnswers).toBe(true);
    expect(canvas.questions).toContainEqual(expect.objectContaining({ pointer: '/layout/width' }));
  });

  it('D7 negative: a wrong value or a missing file is broken input (needsAnswers false)', () => {
    const wrong = readEdited((input) => {
      delete input.colors.primary;
      input.colors.accent = 'red';
    }).error;
    expect(wrong.needsAnswers).toBe(false);
    const file = readEdited((input) => {
      input.brand.logos.full = 'assets/missing-logo.svg';
    }).error;
    expect(file.needsAnswers).toBe(false);
  });

  it('answers.json is applied before validation and marked answered', () => {
    const { spec } = readEdited(null, (dir) =>
      writeFileSync(
        join(dir, 'answers.json'),
        JSON.stringify({ '/layout/margins/top': 100, '/brand/logoRules/minHeight': 18 }),
      ),
    );
    expect(spec.layout.margins.top).toBe(100);
    expect(spec.logos.minHeight).toBe(18);
    expect(spec.provenance['/layout/margins/top']).toEqual({
      source: 'answered',
      from: '/layout/margins/top',
    });
    expect(spec.provenance['/logos/minHeight']).toEqual({
      source: 'answered',
      from: '/brand/logoRules/minHeight',
    });
    expect(spec.provenance['/layout/margins/left'].source).toBe('given');
  });

  it('an answer that breaks the input is reported at its pointer', () => {
    const { error } = readEdited(null, (dir) =>
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({ '/colors/primary': 'blue' })),
    );
    expect(pointers(error)).toEqual(['/colors/primary']);
  });

  it('answers.json that is not a pointer map -> BrandInputError', () => {
    const { error } = readEdited(null, (dir) =>
      writeFileSync(join(dir, 'answers.json'), JSON.stringify({ 'colors/primary': '#000000' })),
    );
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.errors[0].message).toMatch(/not a JSON pointer/);
  });

  describe('E3: animated / video element files (BR-ASSET)', () => {
    it('mini glow keeps animated + anchor as given; the still file gets mime + size', () => {
      const glow = readBrand(MINI, opts).decor.elements[1];
      expect(glow).toMatchObject({
        id: 'glow',
        file: 'assets/decor/glow.svg',
        animated: 'assets/decor/glow-anim.webp',
        anchor: 'fixed',
        mime: 'image/svg+xml',
        width: 160,
        height: 160,
      });
    });

    it('a missing animated file -> error at its pointer', () => {
      const { error } = readEdited((input) => {
        input.assets.elements[1].animated = 'assets/decor/none.webp';
      });
      expect(error).toBeInstanceOf(BrandInputError);
      expect(error.errors).toEqual([
        {
          pointer: '/assets/elements/1/animated',
          file: 'assets/decor/none.webp',
          message: 'file not found: assets/decor/none.webp',
        },
      ]);
    });

    it('video (set by answers.json) is checked like file: present -> kept, missing -> error', () => {
      const ok = readEdited(null, (dir) => {
        writeFileSync(join(dir, 'assets', 'decor', 'glow.mp4'), 'mp4');
        writeFileSync(
          join(dir, 'answers.json'),
          JSON.stringify({ '/assets/elements/1/video': 'assets/decor/glow.mp4' }),
        );
      });
      expect(ok.error).toBeUndefined();
      expect(validateBrandSpec(ok.spec)).toEqual([]);
      expect(ok.spec.decor.elements[1].video).toBe('assets/decor/glow.mp4');
      const missing = readEdited(null, (dir) =>
        writeFileSync(
          join(dir, 'answers.json'),
          JSON.stringify({ '/assets/elements/1/video': 'assets/decor/none.mp4' }),
        ),
      );
      expect(missing.error).toBeInstanceOf(BrandInputError);
      expect(pointers(missing.error)).toEqual(['/assets/elements/1/video']);
    });
  });

  describe('E5 BR-ICONS: an icon folder is an icon set', () => {
    it('mini assets/icons/: a.svg with its -white variant (not a separate icon)', () => {
      const spec = readBrand(MINI, opts);
      expect(spec.components.icons.files).toEqual([
        {
          file: 'assets/icons/a.svg',
          name: 'a',
          mime: 'image/svg+xml',
          width: 24,
          height: 24,
          variants: { white: 'assets/icons/a-white.svg' },
        },
      ]);
      expect(spec.provenance['/components/icons/files']).toEqual({
        source: 'derived',
        from: 'BR-ICONS',
        signal: '/icons/customPath',
      });
    });

    it('-light / -dark pair with their base; an unpaired suffix, sub-folders and non-images', () => {
      const { spec } = readEdited(null, (dir) => {
        const icons = join(dir, 'assets', 'icons');
        const svg = '<svg viewBox="0 0 8 8"></svg>';
        for (const f of ['b.svg', 'b-dark.svg', 'b-light.svg', 'c-light.svg', 'a-white.png'])
          writeFileSync(join(icons, f), svg);
        writeFileSync(join(icons, 'notes.txt'), 'not an icon');
        mkdirSync(join(icons, 'sub'));
        writeFileSync(join(icons, 'sub', 'd.svg'), svg);
      });
      const files = spec.components.icons.files;
      expect(files.map((f) => [f.name, f.variants])).toEqual([
        ['a', { white: 'assets/icons/a-white.svg' }],
        ['a-white', {}], // a-white.png has no a.png: an icon of its own
        ['b', { dark: 'assets/icons/b-dark.svg', light: 'assets/icons/b-light.svg' }],
        ['c-light', {}],
        ['sub/d', {}],
      ]);
      expect(validateBrandSpec(spec)).toEqual([]);
    });

    it('negative: customPath naming a file is no icon set; a missing folder is an error', () => {
      const file = readEdited((input) => {
        input.icons.customPath = 'assets/icons/a.svg';
      }).spec;
      expect(file.components.icons.files).toBeUndefined();
      const { error } = readEdited((input) => {
        input.icons.customPath = 'assets/none/';
      });
      expect(pointers(error)).toEqual(['/icons/customPath']);
    });
  });

  describe('E6: unreferenced assets', () => {
    const SUMMARY = /asset files? (is|are) not referenced by the brand JSON/;

    it('mini: the stray file is listed with its size and summarised in one warning', () => {
      const spec = readBrand(MINI, opts);
      expect(spec.unreferencedAssets).toEqual([{ file: 'assets/decor/stray.svg', size: 97 }]);
      expect(spec.warnings.filter((w) => SUMMARY.test(w.message))).toEqual([
        {
          pointer: '/unreferencedAssets',
          message: '1 asset file is not referenced by the brand JSON: assets/decor/stray.svg',
        },
      ]);
    });

    it('negative: a referenced file, font files and dot files are never listed', () => {
      const { spec } = readEdited(
        (input) => {
          input.assets.elements[1].file = 'assets/decor/stray.svg';
        },
        (dir) => {
          writeFileSync(join(dir, 'assets', 'fonts', 'Other.woff2'), 'font');
          writeFileSync(join(dir, 'assets', 'fonts', 'manifest.json'), '{}');
          writeFileSync(join(dir, 'assets', 'Extra.otf'), 'font');
          writeFileSync(join(dir, 'assets', '.DS_Store'), 'x');
        },
      );
      expect(spec.unreferencedAssets).toEqual([{ file: 'assets/decor/glow.svg', size: expect.any(Number) }]);
      const none = readEdited((input) => {
        input.assets.elements.push({ id: 'stray', type: 'shape', file: 'assets/decor/stray.svg' });
      }).spec;
      expect(none.unreferencedAssets).toEqual([]);
      expect(none.warnings.filter((w) => SUMMARY.test(w.message))).toEqual([]);
    });

    it('files inside a referenced folder (the icon set) are referenced; the warning names the first 5', () => {
      const { spec } = readEdited(null, (dir) => {
        writeFileSync(join(dir, 'assets', 'icons', 'readme.txt'), 'x');
        for (const n of [1, 2, 3, 4, 5]) writeFileSync(join(dir, 'assets', `s${n}.png`), 'x');
      });
      expect(spec.unreferencedAssets.map((a) => a.file)).toEqual([
        'assets/decor/stray.svg',
        'assets/s1.png',
        'assets/s2.png',
        'assets/s3.png',
        'assets/s4.png',
        'assets/s5.png',
      ]);
      const [w] = spec.warnings.filter((x) => SUMMARY.test(x.message));
      expect(w.message).toBe(
        '6 asset files are not referenced by the brand JSON: assets/decor/stray.svg, assets/s1.png, ' +
          'assets/s2.png, assets/s3.png, assets/s4.png, …',
      );
    });
  });

  it('invalid JSON -> BrandInputError', () => {
    const { error } = readEdited(null, (dir) => writeFileSync(join(dir, 'mini.json'), '{ "id": '));
    expect(error).toBeInstanceOf(BrandInputError);
    expect(error.message).toMatch(/not valid JSON/);
  });
});
