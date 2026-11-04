// The catalogue in `pb build` (docs/PLAN-catalogue.md C3 / C4): the default build composes on the catalogue and always
// writes report.catalogue; `--before` adds the changed slides and index.html; `--no-catalogue` composes with the 68 only
// and is refused with --snapshot (the golden decks are the catalogue decks since C4).
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram, catalogueReport, runBuild } from '../src/index.js';

const fixture = join(__dirname, '..', '..', 'brand', '__fixtures__', 'mini');
const review = join(__dirname, '..', '..', '..', 'golden', 'showcase', 'catalogue-review.md');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

describe('the catalogue in pb build (C3 / C4)', () => {
  let root;
  let brand;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pb-catalogue-'));
    brand = join(root, 'mini');
    cpSync(fixture, brand, { recursive: true });
    const input = readJson(brand, 'mini.json');
    for (const style of Object.values(input.typography.styles)) style.weight ??= 400;
    writeFileSync(join(brand, 'mini.json'), JSON.stringify(input));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('counts the matches per slide', () => {
    const log = [
      { slide: 's1', index: 1, match: 'none' },
      { slide: 's2', index: 2, match: 'family' },
      { slide: 's3', index: 3, match: 'combination' },
    ];
    expect(catalogueReport(log).counts).toEqual({ family: 1, combination: 1, none: 1 });
    // changed slides are slides drawn differently: a slide whose warnings alone differ is not one (C4's notes)
    const before = {
      slides: [
        { id: 's1', layoutId: 'a' },
        { id: 's2', layoutId: 'b' },
      ],
    };
    const deck = {
      slides: [
        { id: 's1', layoutId: 'a', warnings: [{ check: 'catalogue' }] },
        { id: 's2', layoutId: 'cat-l1-1' },
      ],
    };
    expect(catalogueReport(log, { deck, before, beforeFile: 'b' }).changedSlides).toEqual([2]);
  });

  it('writes report.catalogue against the build with the 68 only and the slide index; the plain build has none', async () => {
    // C4: `catalogue: false` is the build before C4 (the 68 only): its catalogue rows name no catalogue layout
    const plain = await runBuild(brand, {
      out: join(root, 'plain'),
      content: review,
      cacheDir: null,
      catalogue: false,
    });
    expect(plain.report.catalogue.counts).toEqual({ family: 0, combination: 0, none: 41 });
    expect(plain.report.catalogue.slides.some((r) => r.layoutId.startsWith('cat-') || r.catalogue)).toBe(
      false,
    );
    expect(plain.deck.slides.some((s) => s.source)).toBe(false);
    expect(plain.files).not.toContain('index.html');
    // the default build (no option) composes on the catalogue; --before compares it with the plain one
    const after = await runBuild(brand, {
      out: join(root, 'after'),
      content: review,
      cacheDir: null,
      before: join(root, 'plain'),
    });
    const k = after.report.catalogue;
    expect(k.counts.family).toBe(40);
    expect(k.slides).toHaveLength(41);
    expect(k.changedSlides.length).toBeGreaterThan(0);
    expect(after.deck.slides[1].source).toEqual({ catalogue: 'L1-3' });
    expect(readFileSync(join(root, 'after', 'index.html'), 'utf8')).toContain('cat-l1-3');
    // without --before: the report section, no index.html
    const alone = await runBuild(brand, { out: join(root, 'alone'), content: review, cacheDir: null });
    expect(alone.report.catalogue.counts.family).toBe(40);
    expect(alone.report.catalogue.changedSlides).toBeUndefined();
    expect(alone.files).not.toContain('index.html');
    expect(JSON.stringify(alone.deck)).toBe(JSON.stringify(after.deck));
  });

  it('snapshots the catalogue deck (no refusal since C4)', async () => {
    const r = await runBuild(brand, {
      out: join(root, 'snap'),
      content: review,
      cacheDir: null,
      snapshot: true,
      expectedDir: join(root, 'expected'),
    });
    expect(readJson(root, 'expected', 'mini', 'deck.json').slides[1].layoutId).toBe('cat-l1-3');
    expect(r.snapshotDir).toBe(join(root, 'expected', 'mini'));
  });

  it('refuses --no-catalogue with --snapshot (negative)', async () => {
    const errors = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((m) => errors.push(m));
    const program = buildProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'pb',
      'build',
      brand,
      '--no-catalogue',
      '--snapshot',
      '--out',
      join(root, 'x'),
    ]);
    spy.mockRestore();
    expect(errors.join('\n')).toMatch(/--no-catalogue cannot be combined with --snapshot/);
    expect(existsSync(join(root, 'x'))).toBe(false);
    process.exitCode = 0;
  });
});
