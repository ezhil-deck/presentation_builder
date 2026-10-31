import { brandQuestions } from '../src/questions.js';

const face = (family) => ({
  family,
  files: [{ file: `assets/${family}.ttf`, style: 'normal' }],
  metrics: { unitsPerEm: 1000 },
});
const role = (size) => ({ face: 'heading', size });

function complete() {
  return {
    colors: { primary: '#000000' },
    surfaces: [
      { id: 'page', bg: '#FFFFFF', text: '#000000' },
      { id: 'ink', bg: '#000000', text: '#FFFFFF' },
    ],
    typography: {
      faces: { heading: face('H'), body: face('B') },
      roles: {
        display: role(96),
        h1: role(64),
        h2: role(48),
        h3: role(36),
        body: role(28),
        caption: role(20),
      },
      sizeUnits: 'slide',
    },
    layout: { margins: { top: 80, right: 80, bottom: 80, left: 80 }, footer: { show: true } },
    logos: { variants: { full: { file: 'assets/logo.svg' } } },
    backgrounds: { default: { type: 'solid', surface: 'page' } },
  };
}

const ids = (qs) => qs.map((q) => q.id);

describe('BR-QUESTIONS', () => {
  it('a complete brand has no questions', () => {
    expect(brandQuestions(complete())).toEqual({ questions: [], warnings: [] });
  });

  it('missing primary colour / usable surface -> blocking', () => {
    const spec = complete();
    delete spec.colors.primary;
    spec.surfaces = [{ id: 'x', bg: '#FFFFFF' }];
    const { questions } = brandQuestions(spec);
    expect(questions).toEqual([
      expect.objectContaining({
        id: 'colors.primary',
        pointer: '/colors/primary',
        severity: 'blocking',
        neededBy: ['MD-PALETTE'],
      }),
      expect.objectContaining({ id: 'surfaces', pointer: '/surfaces', severity: 'blocking' }),
    ]);
  });

  it('a face with no file on disk -> blocking question at the input pointer', () => {
    const spec = complete();
    spec.typography.faces.heading.files = [];
    delete spec.typography.faces.heading.metrics;
    const fonts = {
      heading: { fromPointer: '/typography/fonts/heading/url', missing: [{ file: 'assets/fonts/H.woff2' }] },
    };
    const { questions } = brandQuestions(spec, { fonts });
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      id: 'typography.faces.heading.files',
      pointer: '/typography/fonts/heading/url',
      severity: 'blocking',
      neededBy: ['BR-FONTFILES', 'BR-METRICS'],
    });
    expect(questions[0].question).toMatch(/missing assets\/fonts\/H\.woff2/);
  });

  it('any face without files is asked about, not only heading/body', () => {
    const spec = complete();
    spec.typography.faces.data = { family: 'Lato', files: [] };
    expect(ids(brandQuestions(spec).questions)).toEqual(['typography.faces.data.files']);
  });

  it('missing heading/body face -> blocking', () => {
    const spec = complete();
    delete spec.typography.faces.body;
    expect(brandQuestions(spec).questions[0]).toMatchObject({
      id: 'typography.faces.body',
      pointer: '/typography/fonts/body',
      severity: 'blocking',
    });
  });

  it('a face with files whose metrics could not be read -> blocking', () => {
    const spec = complete();
    delete spec.typography.faces.body.metrics;
    expect(brandQuestions(spec).questions[0]).toMatchObject({
      id: 'typography.faces.body.metrics',
      severity: 'blocking',
      neededBy: ['BR-METRICS'],
    });
  });

  it('each missing required role -> blocking', () => {
    const spec = complete();
    delete spec.typography.roles.h3;
    delete spec.typography.roles.caption;
    delete spec.typography.roles.eyebrow; // not required
    const { questions } = brandQuestions(spec);
    expect(ids(questions)).toEqual(['typography.roles.h3', 'typography.roles.caption']);
    expect(questions[0]).toMatchObject({
      pointer: '/typography/styles/h3',
      severity: 'blocking',
      neededBy: ['MD-TYPE'],
    });
  });

  it('missing margins -> blocking (MD-GEOMETRY)', () => {
    const spec = complete();
    delete spec.layout.margins;
    expect(brandQuestions(spec).questions).toEqual([
      expect.objectContaining({
        id: 'layout.margins',
        pointer: '/layout/margins',
        severity: 'blocking',
        neededBy: ['MD-GEOMETRY'],
      }),
    ]);
  });

  it('missing full logo -> blocking, the other variants as options', () => {
    const spec = complete();
    spec.logos.variants = { monoLight: { file: 'assets/white.svg' } };
    const [q] = brandQuestions(spec).questions;
    expect(q).toMatchObject({
      id: 'logos.variants.full',
      pointer: '/brand/logos/full',
      severity: 'blocking',
      neededBy: ['MD-LOGO'],
    });
    expect(q.options).toEqual([{ variant: 'monoLight', file: 'assets/white.svg' }]);
    delete spec.logos;
    expect(brandQuestions(spec).questions[0].options).toBeUndefined();
  });

  it('missing footer -> optional question + warning', () => {
    const spec = complete();
    delete spec.layout.footer;
    const { questions, warnings } = brandQuestions(spec);
    expect(questions).toEqual([
      expect.objectContaining({ id: 'layout.footer', severity: 'optional', neededBy: ['MD-FOOTER'] }),
    ]);
    expect(warnings).toEqual([
      { pointer: '/layout/footer', message: expect.stringMatching(/hides the footer/) },
    ]);
  });

  it('missing default background -> optional question with the surfaces as options + warning', () => {
    const spec = complete();
    delete spec.backgrounds;
    const { questions, warnings } = brandQuestions(spec);
    expect(questions).toEqual([
      expect.objectContaining({
        id: 'backgrounds.default',
        severity: 'optional',
        options: ['page', 'ink'],
        neededBy: ['MD-PALETTE'],
      }),
    ]);
    expect(warnings[0].message).toMatch(/surfaces\[0\]/);
  });
});

describe('BR-QUESTIONS: slideScale (D3)', () => {
  it('site units without slideScale -> blocking question naming the unscaled roles', () => {
    const spec = complete();
    spec.typography.sizeUnits = 'site';
    const { questions } = brandQuestions(spec);
    expect(questions).toEqual([
      expect.objectContaining({
        id: 'typography.slideScale',
        pointer: '/typography/slideScale',
        severity: 'blocking',
      }),
    ]);
    expect(questions[0].question).toMatch(/display, h1, h2, h3, body, caption/);
  });

  it('legacy (no sizeUnits) asks only when a size <= 40 needs scaling', () => {
    const spec = complete();
    delete spec.typography.sizeUnits;
    expect(ids(brandQuestions(spec).questions)).toEqual(['typography.slideScale']);
    for (const r of Object.values(spec.typography.roles)) r.size = 48;
    expect(brandQuestions(spec).questions).toEqual([]);
  });

  it('a given slideScale needs no question', () => {
    const spec = complete();
    spec.typography.sizeUnits = 'site';
    spec.typography.slideScale = 1.5;
    expect(brandQuestions(spec).questions).toEqual([]);
  });
});
