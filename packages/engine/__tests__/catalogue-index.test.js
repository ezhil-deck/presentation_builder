// The Rich Slide Catalogue index (golden/catalogue/index.json, written by `npm run catalogue:index` from the owner's
// reference HTML): the counts the catalogue states hold in what the extractor read, and the extractor rejects
// off-model figures instead of guessing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCatalogue, parseFigure } from '../../../scripts/catalogue-index.mjs';
import { ROOT } from './helpers.js';

const index = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/index.json'), 'utf8'));
const slides = index.slides;
const bySection = (sec) => slides.filter((s) => s.section === sec);

describe('catalogue index', () => {
  test('1,646 slides, 258 / 20 / 191 / 100 / 1077 per section', () => {
    expect(slides).toHaveLength(1646);
    expect(index.sections).toEqual({
      blocks: 258,
      common: 20,
      presets: 191,
      shapes: 100,
      plan: 1077,
      total: 1646,
    });
    for (const [sec, n] of Object.entries({ blocks: 258, common: 20, presets: 191, shapes: 100, plan: 1077 }))
      expect(bySection(sec)).toHaveLength(n);
  });

  test('every id is unique and carries its section prefix', () => {
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length);
    const pattern = {
      blocks: /^B\d+$/,
      common: /^C\d+$/,
      presets: /^P\d+$/,
      shapes: /^S\d+$/,
      plan: /^L\d+-\d+$/,
    };
    for (const s of slides) expect(s.id).toMatch(pattern[s.section]);
    for (const s of bySection('plan')) expect(s.id.startsWith(`L${s.plan}-`)).toBe(true);
  });

  test('each plan has the layouts and families its heading states', () => {
    expect(index.plans).toHaveLength(35);
    for (const p of index.plans) {
      const own = slides.filter((s) => s.plan === p.n);
      expect({ n: p.n, layouts: own.length }).toEqual({ n: p.n, layouts: p.layouts });
      expect({ n: p.n, families: new Set(own.map((s) => s.family)).size }).toEqual({
        n: p.n,
        families: p.families,
      });
    }
    expect(index.plans.reduce((sum, p) => sum + p.layouts, 0)).toBe(1077);
  });

  test('every plan slide has a container with fields (the title-only slide is its own container)', () => {
    for (const s of bySection('plan')) {
      const filled = s.fields.some((c) => Object.keys(c.fields).length > 0);
      // L35-1 (Plan 35 · Title only) marks the slide title itself as the container: data-type="title", no data-f.
      if (!filled)
        expect({ id: s.id, fields: s.fields, title: Boolean(s.title) }).toEqual({
          id: 'L35-1',
          fields: [{ c: 1, type: 'title', fields: {} }],
          title: true,
        });
      for (const c of s.fields) expect(typeof c.type).toBe('string');
    }
  });

  test('preset counts sum to 1,321; the intro states 1,323 (P117 and P120 say 1 preset, the section index says 2)', () => {
    const presets = bySection('presets');
    const sum = presets.reduce((total, s) => total + s.presetCount, 0);
    expect(sum).toBe(1321);
    expect(1323 - sum).toBe(2);
    expect(presets.filter((s) => ['P117', 'P120'].includes(s.id)).map((s) => s.presetCount)).toEqual([1, 1]);
    for (const s of presets) expect(s.code).toMatch(/^\S+$/);
  });

  test('common, shape and preset slides have a shape; shape slides a shape code', () => {
    for (const s of [...bySection('common'), ...bySection('shapes'), ...bySection('presets')])
      expect(typeof s.shape === 'string' && s.shape.length > 0).toBe(true);
    for (const s of bySection('shapes')) expect(s.code).toMatch(/^(t·)?[FHLRT]\d+(·b)?$/);
    expect(new Set(bySection('shapes').map((s) => s.code)).size).toBe(100);
  });
});

describe('catalogue extractor', () => {
  const fig = (attrs) =>
    `<section class="sec" data-sec="blocks"><figure ${attrs}><div class="fr"><div class="slide dark" data-rot="2">` +
    '<div class="k">Kicker &amp; co</div><div class="t">A <span>Two&#8209;Part</span>&nbsp;title</div></div></div>' +
    '<figcaption><b>B9 · Name</b><span>variant of B1</span><br><span class="shape" style="margin-left:0">full</span>' +
    '<p>What it is.</p></figcaption></figure></section>';

  test('reads a well-formed figure', () => {
    const {
      slides: [s],
    } = parseCatalogue(fig('class="it" id="B9" data-sec="blocks"'));
    expect(s).toMatchObject({
      id: 'B9',
      section: 'blocks',
      name: 'Name',
      spec: 'variant of B1',
      variantOf: 'B1',
      shape: 'full',
      kicker: 'Kicker & co',
      title: 'A Two‑Part title',
      dark: true,
      rot: 2,
    });
  });

  test('rejects a figure without an id', () => {
    expect(() => parseCatalogue(fig('class="it" data-sec="blocks"'))).toThrow(/has no id/);
    expect(() => parseFigure('class="it" data-sec="blocks"', '<figcaption><b>x</b></figcaption>')).toThrow(
      /has no id/,
    );
  });

  test('rejects an id outside its section and a duplicate id', () => {
    expect(() => parseCatalogue(fig('class="it" id="P9" data-sec="blocks"'))).toThrow(
      /does not match section/,
    );
    const one = fig('class="it" id="B9" data-sec="blocks"');
    expect(() => parseCatalogue(one + one)).toThrow(/duplicate id B9/);
  });
});
