import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { moodHtml } from '../src/html.js';
import { buildProgram, EXIT, mergeQuestions, runBuild, runMood, withoutWidths } from '../src/index.js';

const fixture = join(__dirname, '..', '..', 'brand', '__fixtures__', 'mini');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

/** A throw-away copy of the mini brand, `edit(input)` applied. */
function miniCopy(edit) {
  const root = mkdtempSync(join(tmpdir(), 'pb-cli-'));
  const dir = join(root, 'mini');
  cpSync(fixture, dir, { recursive: true });
  if (edit) {
    const input = readJson(dir, 'mini.json');
    edit(input);
    writeFileSync(join(dir, 'mini.json'), JSON.stringify(input));
  }
  return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** mini with a weight on every style: the Mood needs weight + lineHeight (MD-TYPE), so this copy derives clean. */
const complete = (input) => {
  for (const style of Object.values(input.typography.styles)) style.weight ??= 400;
};

describe('@pb/cli', () => {
  let out;
  let ok;
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'pb-cli-out-'));
    ok = miniCopy(complete);
  });
  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
    ok.cleanup();
  });

  it('exports buildProgram() with mood, build, render, check and diff commands', () => {
    const program = buildProgram();
    expect(program.name()).toBe('pb');
    expect(program.commands.map((c) => c.name())).toEqual(['mood', 'build', 'render', 'check', 'diff']);
  });

  it('runBuild() reads, derives the Mood, composes the showcase: JSON files, deck.html and the report table', async () => {
    const r = await runBuild(ok.dir, { out, cacheDir: null });
    expect(r.files).toEqual([
      'brand-spec.json',
      'mood.json',
      'deck.json',
      'questions.json',
      'mood.html',
      'deck.html',
      'report.json',
    ]);
    for (const f of r.files) expect(existsSync(join(out, f))).toBe(true);
    const deck = readJson(out, 'deck.json');
    expect(deck.schema).toBe('deck/1');
    expect(deck.source.brandId).toBe('mini');
    expect(deck.slides).toHaveLength(24);
    const report = readJson(out, 'report.json');
    expect(report).toMatchObject({ kind: 'BuildReport', brandId: 'mini', counts: { slides: 24 } });
    expect(report.slides[0]).toMatchObject({ index: 1, kind: 'cover', layoutId: 'cover' });
    expect(report.slides[0].sizes[0]).toMatchObject({
      requested: expect.any(Number),
      applied: expect.any(Number),
    });
    expect(report.warnings.some((w) => w.source === 'compose')).toBe(true);
    // a Mood without table roles: the table is a reported error, never a crash
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ source: 'compose', check: 'table', severity: 'error' }),
    );
    const html = readFileSync(join(out, 'deck.html'), 'utf8');
    expect(html).toMatch(/^<!doctype html>/);
    expect((html.match(/<section class="slide"/g) ?? []).length).toBe(24);
    expect(r.exitCode).toBe(EXIT.OK);
  });

  it('runBuild() --png --pdf: slides/NN.png per slide, one PDF page per slide, sheet.png 4 per row at 480 px', async () => {
    const r = await runBuild(ok.dir, { out, png: true, pdf: true, cacheDir: null });
    expect(r.report.counts).toMatchObject({ slides: 24, pngs: 24, pdfPages: 24 });
    expect(existsSync(join(out, 'slides', '24.png'))).toBe(true);
    const sheet = readFileSync(join(out, 'sheet.png'));
    expect(sheet.readUInt32BE(16)).toBe(4 * 480 + 5 * 16); // width: 4 thumbnails + gaps
    expect(sheet.readUInt32BE(20)).toBeGreaterThan(6 * 270); // 6 rows of thumbnails
  }, 120000);

  it('runBuild() --snapshot writes deck.json into the expected folder, byte-identical on a second run', async () => {
    const expectedDir = join(out, 'expected');
    await runBuild(ok.dir, { out, snapshot: true, expectedDir, cacheDir: null });
    const first = readFileSync(join(expectedDir, 'mini', 'deck.json'), 'utf8');
    await runBuild(ok.dir, { out, snapshot: true, expectedDir, cacheDir: null });
    expect(readFileSync(join(expectedDir, 'mini', 'deck.json'), 'utf8')).toBe(first);
  });

  it('runMood() ok: brand-spec, mood, questions (array), report, mood.html; exit 0', () => {
    const r = runMood(ok.dir, { out, html: true, cacheDir: null });
    expect(r.exitCode).toBe(EXIT.OK);
    expect(r.files).toEqual(['brand-spec.json', 'mood.json', 'questions.json', 'report.json', 'mood.html']);
    expect(Array.isArray(readJson(out, 'questions.json'))).toBe(true);
    const report = readJson(out, 'report.json');
    expect(report).toMatchObject({ brandId: 'mini', status: 'ok', exitCode: 0 });
    expect(report.warnings.every((w) => ['brand', 'mood'].includes(w.source))).toBe(true);
    const html = readFileSync(join(out, 'mood.html'), 'utf8');
    expect(html).toMatch(/^<!doctype html>/);
    // files are referenced relative to the out folder (the page works from disk and through the review UI)
    const base = relative(out, ok.dir).split(sep).join('/');
    expect(html).toMatch(
      new RegExp(`@font-face \\{ font-family: 'pb-heading'; src: url\\('${base}/[^']*Tiny-Regular\\.ttf'\\)`),
    );
    expect(html).toMatch(/Type ladder/);
    expect(html).toContain(`<img src="${base}/assets/logo.svg"`);
    expect(html).not.toMatch(/https?:\/\/|file:\/\//);
  });

  it('mood.html lists unused decor elements under their own sub-heading (E2)', () => {
    const decor = (elements) => moodHtml({ mood: { decor: { elements } }, brandDir: '/brand' });
    const placed = { id: 'band', type: 'shape', allowedOn: ['section'] };
    const dead = { id: 'ghost', type: 'shape', allowedOn: [], unused: true };
    const both = decor([placed, dead]);
    const head = both.indexOf('<h3>Unused (no allowed layouts)</h3>');
    expect(head).toBeGreaterThan(both.indexOf('<b>band</b>'));
    expect(both.indexOf('<b>ghost</b>')).toBeGreaterThan(head);
    expect(decor([placed])).not.toMatch(/Unused \(no allowed layouts\)/);
    expect(decor([dead])).toMatch(/no placeable decor elements/);
  });

  it('E4: a wanted element with no allowedOn -> optional question in questions.json; an answer places it', () => {
    // mini's `corner` is frequency "often" and gives no allowedOn.
    const r = runMood(ok.dir, { out, cacheDir: null });
    expect(r.exitCode).toBe(EXIT.OK);
    const question = {
      id: 'decor.corner.allowedOn',
      pointer: '/assets/elements/0/allowedOn',
      question: 'Which layouts may corner appear on?',
      neededBy: ['MD-DECOR'],
      severity: 'optional',
      options: expect.arrayContaining(['cover', 'section', 'image-text']),
    };
    expect(readJson(out, 'questions.json')).toContainEqual(question);
    const before = readJson(out, 'mood.json').decor.elements[0];
    expect(before).toMatchObject({ id: 'corner', allowedOn: [], unused: true });
    expect(readJson(out, 'report.json').warnings.map((w) => w.message)).not.toContain(
      'decor element "corner" has no allowed layouts (allowedOn missing or empty)',
    );

    writeFileSync(
      join(ok.dir, 'answers.json'),
      JSON.stringify({ '/assets/elements/0/allowedOn': ['section', 'image-text'] }),
    );
    const answered = runMood(ok.dir, { out, cacheDir: null });
    expect(answered.exitCode).toBe(EXIT.OK);
    expect(readJson(out, 'questions.json').map((q) => q.id)).not.toContain('decor.corner.allowedOn');
    const after = readJson(out, 'mood.json').decor.elements[0];
    expect(after.allowedOn).toEqual(['section', 'image-text']);
    expect(after.unused).toBeUndefined();
    expect(readJson(out, 'brand-spec.json').provenance['/decor/elements/0/allowedOn/0']).toEqual({
      source: 'answered',
      from: '/assets/elements/0/allowedOn',
    });
  });

  it('E3/E5/E6 in mood.html: animated badge, icon grid (white variant on a dark chip), unreferenced assets', () => {
    runMood(ok.dir, { out, html: true, cacheDir: null });
    const html = readFileSync(join(out, 'mood.html'), 'utf8');
    expect(html).toMatch(/<b>glow<\/b> <span class="badge">animated<\/span>/);
    expect(html).not.toMatch(/<b>corner<\/b> <span class="badge">/);
    expect(html).toMatch(/<h3>Icon set \(1\)<\/h3>/);
    expect(html).toMatch(/<span class="icon-chip on-dark" title="white"><img src="[^"]*a-white\.svg"/);
    expect(html).toMatch(/<h2>Unreferenced assets \(1\)<\/h2>/);
    expect(html).toMatch(/<code>assets\/decor\/stray\.svg<\/code>/);
    const mood = readJson(out, 'mood.json');
    expect(mood.components.icon.items).toEqual([
      { name: 'a', file: 'assets/icons/a.svg', variants: { white: 'assets/icons/a-white.svg' } },
    ]);
    expect(mood.decor.elements[1]).toMatchObject({
      animated: 'assets/decor/glow-anim.webp',
      anchor: 'fixed',
    });
  });

  it('mood.html negative: no icon set, no unreferenced files, no animated element', () => {
    const html = moodHtml({
      mood: { decor: { elements: [{ id: 'band', type: 'shape', allowedOn: ['section'] }] } },
      brandDir: '/brand',
    });
    expect(html).not.toMatch(/class="badge"/);
    expect(html).not.toMatch(/Icon set/);
    expect(html).toMatch(/<h2>Unreferenced assets \(0\)<\/h2>\n<p class="muted">none/);
  });

  it('runMood() is deterministic', () => {
    const a = runMood(ok.dir, { out, cacheDir: null });
    const first = readFileSync(join(out, 'mood.json'), 'utf8');
    runMood(ok.dir, { out, cacheDir: null });
    expect(readFileSync(join(out, 'mood.json'), 'utf8')).toBe(first);
    expect(a.exitCode).toBe(EXIT.OK);
  });

  it('--snapshot writes mood.json + brand-spec.json without metrics.widths', () => {
    const expectedDir = join(out, 'expected');
    const r = runMood(fixture, { out: join(out, 'run'), snapshot: true, expectedDir, cacheDir: null });
    const mood = readJson(expectedDir, 'mini', 'mood.json');
    const spec = readJson(expectedDir, 'mini', 'brand-spec.json');
    expect(r.snapshotDir).toBe(join(expectedDir, 'mini'));
    expect(mood.type.faces.heading.metrics.widths).toBeUndefined();
    expect(mood.type.faces.heading.metrics.unitsPerEm).toBe(1000);
    expect(spec.typography.faces.heading.metrics.widths).toBeUndefined();
    // the full files in out/ keep the widths
    expect(readJson(out, 'run', 'mood.json').type.faces.heading.metrics.widths['65']).toBe(0.6);
  });

  it('the mini fixture as is (styles without weight) -> blocking MD-TYPE questions, exit 2', () => {
    const r = runMood(fixture, { out, cacheDir: null });
    expect(r.exitCode).toBe(EXIT.QUESTIONS);
    expect(r.questions).toContainEqual(
      expect.objectContaining({ pointer: '/typography/styles/h2/weight', severity: 'blocking' }),
    );
  });

  it('D7: required-but-missing -> questions.json + report.json, exit 2', () => {
    const copy = miniCopy((input) => {
      delete input.colors.primary;
    });
    try {
      const r = runMood(copy.dir, { out, cacheDir: null });
      expect(r.exitCode).toBe(EXIT.QUESTIONS);
      expect(r.files).toEqual(['questions.json', 'report.json']);
      expect(readJson(out, 'questions.json')).toContainEqual(
        expect.objectContaining({ pointer: '/colors/primary', severity: 'blocking' }),
      );
      expect(readJson(out, 'report.json')).toMatchObject({ status: 'questions', exitCode: 2 });
    } finally {
      copy.cleanup();
    }
  });

  it('a blocking question on a readable brand (font file missing) -> Mood written, exit 2', () => {
    const copy = miniCopy(complete);
    try {
      rmSync(join(copy.dir, 'assets', 'fonts', 'Tiny-Regular.ttf'));
      const r = runMood(copy.dir, { out, cacheDir: null });
      expect(r.exitCode).toBe(EXIT.QUESTIONS);
      expect(r.files).toContain('mood.json');
      expect(r.questions.filter((q) => q.severity === 'blocking').map((q) => q.id)).toEqual([
        'typography.faces.heading.files',
        'typography.faces.body.files',
      ]);
    } finally {
      copy.cleanup();
    }
  });

  it('broken input (wrong value / missing logo file) -> exit 1, never 2', () => {
    for (const edit of [
      (input) => {
        input.colors.primary = 'navy';
      },
      (input) => {
        input.brand.logos.full = 'assets/none.svg';
      },
    ]) {
      const copy = miniCopy(edit);
      try {
        const r = runMood(copy.dir, { out, cacheDir: null });
        expect(r.exitCode).toBe(EXIT.BROKEN);
        expect(r.errors.length).toBeGreaterThan(0);
        expect(readJson(out, 'report.json').status).toBe('broken');
      } finally {
        copy.cleanup();
      }
    }
  });

  it('runBuild() on a brand that cannot be read rejects with the exit code', async () => {
    const copy = miniCopy((input) => {
      input.colors.primary = 'navy';
    });
    try {
      await expect(runBuild(copy.dir, { out, cacheDir: null })).rejects.toEqual(
        expect.objectContaining({ exitCode: EXIT.BROKEN }),
      );
    } finally {
      copy.cleanup();
    }
  });

  it('mergeQuestions: one per id, neededBy merged, blocking wins', () => {
    const merged = mergeQuestions(
      [{ id: 'a', pointer: '/a', neededBy: ['BR-X'], severity: 'optional' }],
      [{ id: 'a', pointer: '/a', neededBy: ['MD-Y'], severity: 'blocking' }],
    );
    expect(merged).toEqual([{ id: 'a', pointer: '/a', neededBy: ['BR-X', 'MD-Y'], severity: 'blocking' }]);
  });

  it('withoutWidths strips only widths and does not mutate', () => {
    const doc = { type: { faces: { h: { metrics: { widths: { 65: 1 }, unitsPerEm: 1000 } } } } };
    expect(withoutWidths(doc)).toEqual({ type: { faces: { h: { metrics: { unitsPerEm: 1000 } } } } });
    expect(doc.type.faces.h.metrics.widths).toBeDefined();
  });
});
