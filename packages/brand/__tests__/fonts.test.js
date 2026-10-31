import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { faceMetrics, fontMetrics, pickInstance, resolveFaceFiles } from '../src/fonts.js';
import { GOLDEN, MINI, tmpDir } from './helpers.js';

const { buildTinyFont } = require('../__fixtures__/tiny-font.cjs');

describe('BR-METRICS', () => {
  let tmp;
  beforeEach(() => {
    tmp = tmpDir();
  });
  afterEach(() => tmp.cleanup());

  it('reads per-em metrics and Latin-1 advances from a font file', () => {
    const file = join(tmp.dir, 'tiny.ttf');
    writeFileSync(
      file,
      buildTinyFont({ unitsPerEm: 2000, advances: { upper: 1400, lower: 1000, space: 500 } }),
    );
    const { metrics, warning } = fontMetrics(file, { cacheDir: null });
    expect(warning).toBeUndefined();
    expect(metrics).toMatchObject({
      unitsPerEm: 2000,
      ascent: 0.4,
      descent: -0.1,
      lineGap: 0,
      capHeight: 0.35,
      xHeight: 0.25,
    });
    expect(metrics.widths['32']).toBe(0.25);
    expect(metrics.widths['65']).toBe(0.7); // A
    expect(metrics.widths['97']).toBe(0.5); // a
    expect(metrics.widths['48']).toBe(0.275); // 0 (default 550 units / 2000)
    expect(metrics.widths['127']).toBeUndefined(); // not in the font
    expect(metrics.widths['233']).toBeUndefined(); // é not in the font
    expect(Object.keys(metrics.widths)).toHaveLength(1 + 10 + 26 + 26);
    expect(metrics.avgCharWidth).toBe(0.5);
    expect(metrics.instance).toBeUndefined(); // static font
  });

  it('caches by file sha256 under the cache folder', () => {
    const file = join(tmp.dir, 'tiny.ttf');
    const bytes = buildTinyFont();
    writeFileSync(file, bytes);
    const cacheDir = join(tmp.dir, 'cache');
    const first = fontMetrics(file, { cacheDir, weight: 400 });
    const files = readdirSync(cacheDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.json$/);
    const cached = JSON.parse(readFileSync(join(cacheDir, files[0]), 'utf8'));
    expect(cached.instances.w400.metrics).toEqual(first.metrics);
    // A second read comes from the cache: prove it by editing the cached value.
    cached.instances.w400.metrics.ascent = 123;
    writeFileSync(join(cacheDir, files[0]), JSON.stringify(cached));
    expect(fontMetrics(file, { cacheDir, weight: 400 }).metrics.ascent).toBe(123);
  });

  it('faceMetrics measures the first normal-style file and names it', () => {
    const face = { files: [{ file: 'assets/fonts/Tiny-Regular.ttf', style: 'normal' }], weights: [400] };
    const { metrics, warnings } = faceMetrics(MINI, face, { cacheDir: null });
    expect(warnings).toEqual([]);
    expect(metrics.file).toBe('assets/fonts/Tiny-Regular.ttf');
    expect(metrics.capHeight).toBe(0.7);
  });

  it('faceMetrics warns (no metrics) when the face has only italic files', () => {
    const face = { files: [{ file: 'assets/fonts/Tiny-Regular.ttf', style: 'italic' }] };
    const { metrics, warnings } = faceMetrics(MINI, face, { cacheDir: null });
    expect(metrics).toBeUndefined();
    expect(warnings[0]).toMatch(/no normal-style font file/);
  });

  it('faceMetrics warns when the file is not a font', () => {
    const face = { files: [{ file: 'assets/logo.svg', style: 'normal' }] };
    const { metrics, warnings } = faceMetrics(MINI, face, { cacheDir: null });
    expect(metrics).toBeUndefined();
    expect(warnings[0]).toMatch(/could not be read/);
  });
});

describe('pickInstance (variable fonts)', () => {
  const font = {
    fvar: {
      axis: [
        { axisTag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125 },
        { axisTag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 },
      ],
      instance: [
        { nameID: 300, coord: [100, 300] },
        { nameID: 700, coord: [100, 700] },
      ],
    },
  };

  it('no weight -> the default instance', () => {
    expect(pickInstance(font, undefined)).toEqual({ wght: 400, name: 'default' });
  });

  it('the named/default instance closest to the weight, ties to the lighter', () => {
    expect(pickInstance(font, 320).wght).toBe(300);
    expect(pickInstance(font, 500).wght).toBe(400);
    expect(pickInstance(font, 550).wght).toBe(400); // 150 from 400 and from 700
    expect(pickInstance(font, 900).wght).toBe(700);
  });

  it('a font without a wght axis has no instance', () => {
    expect(pickInstance({ fvar: { axis: [{ axisTag: 'wdth' }] } }, 400)).toBeNull();
    expect(pickInstance({}, 400)).toBeNull();
  });
});

const sohne = join(GOLDEN, 'stripe', 'assets', 'fonts', 'Sohne-var.woff2');
(existsSync(sohne) ? describe : describe.skip)('BR-METRICS on a real variable WOFF2 (golden stripe)', () => {
  it('measures the named instance closest to the first listed weight', () => {
    const regular = fontMetrics(sohne, { cacheDir: null }).metrics;
    const kraeftig = fontMetrics(sohne, { cacheDir: null, weight: 425 }).metrics;
    expect(regular.unitsPerEm).toBe(1000);
    expect(regular.instance.name).toBe('default');
    expect(kraeftig.instance).toEqual({ wght: 435.5, name: 'Kräftig' });
    expect(kraeftig.widths['65']).toBeGreaterThan(regular.widths['65']); // heavier A is wider
    expect(Object.keys(regular.widths).length).toBeGreaterThan(150);
  });
});

describe('BR-FONTFILES', () => {
  let tmp;
  beforeEach(() => {
    tmp = tmpDir();
  });
  afterEach(() => tmp.cleanup());

  it('source file: url, with its weight and style', () => {
    const r = resolveFaceFiles(MINI, 'heading', {
      family: 'Tiny',
      source: 'file',
      url: 'assets/fonts/Tiny-Regular.ttf',
      weight: 400,
    });
    expect(r.files).toEqual([
      { file: 'assets/fonts/Tiny-Regular.ttf', format: 'ttf', weight: '400', style: 'normal' },
    ]);
    expect(r.variable).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.fromPointer).toBe('/typography/fonts/heading/url');
  });

  it('source file: files[] win over url; a range weight makes the face variable', () => {
    const r = resolveFaceFiles(MINI, 'body', {
      family: 'Tiny',
      source: 'file',
      url: 'assets/fonts/none.ttf',
      files: [{ url: 'assets/fonts/Tiny-Regular.ttf', weight: '100 900', style: 'normal' }],
    });
    expect(r.files).toHaveLength(1);
    expect(r.files[0].weight).toBe('100 900');
    expect(r.variable).toBe(true);
  });

  it('a listed file that is not on disk is reported missing, not resolved', () => {
    const r = resolveFaceFiles(MINI, 'heading', {
      family: 'X',
      source: 'file',
      url: 'assets/fonts/Nope.woff2',
    });
    expect(r.files).toEqual([]);
    expect(r.missing).toEqual([
      { file: 'assets/fonts/Nope.woff2', pointer: '/typography/fonts/heading/url' },
    ]);
  });

  it('a file outside the brand folder is not accepted', () => {
    const r = resolveFaceFiles(MINI, 'heading', { family: 'X', source: 'file', url: '../tiny-font.cjs' });
    expect(r.files).toEqual([]);
    expect(r.missing).toHaveLength(1);
  });

  it('source google: the prefetched files (spaces removed from the family), normal first', () => {
    const dir = join(tmp.dir, 'assets', 'fonts', 'google');
    mkdirSync(dir, { recursive: true });
    for (const n of [
      'InterTight-italic-100-900-latin.woff2',
      'InterTight-normal-100-900-latin.woff2',
      'Inter-normal-100-900-latin.woff2',
    ]) {
      writeFileSync(join(dir, n), '');
    }
    const r = resolveFaceFiles(tmp.dir, 'heading', { family: 'Inter Tight', source: 'google' });
    expect(r.files).toEqual([
      {
        file: 'assets/fonts/google/InterTight-normal-100-900-latin.woff2',
        format: 'woff2',
        weight: '100 900',
        style: 'normal',
      },
      {
        file: 'assets/fonts/google/InterTight-italic-100-900-latin.woff2',
        format: 'woff2',
        weight: '100 900',
        style: 'italic',
      },
    ]);
    expect(r.variable).toBe(true);
  });

  it('source google: a static file is not variable; none on disk -> missing', () => {
    const dir = join(tmp.dir, 'assets', 'fonts', 'google');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Anton-normal-400-400-latin.woff2'), '');
    const anton = resolveFaceFiles(tmp.dir, 'heading', { family: 'Anton', source: 'google' });
    expect(anton.files).toEqual([
      {
        file: 'assets/fonts/google/Anton-normal-400-400-latin.woff2',
        format: 'woff2',
        weight: '400',
        style: 'normal',
      },
    ]);
    expect(anton.variable).toBe(false);
    const lato = resolveFaceFiles(tmp.dir, 'data', { family: 'Lato', source: 'google' });
    expect(lato.files).toEqual([]);
    expect(lato.missing[0].pointer).toBe('/typography/fonts/data/family');
  });

  it('source system: no files', () => {
    const r = resolveFaceFiles(MINI, 'body', {
      family: 'Arial',
      source: 'system',
      url: 'assets/fonts/Tiny-Regular.ttf',
    });
    expect(r.files).toEqual([]);
    expect(r.missing).toEqual([]);
  });
});
