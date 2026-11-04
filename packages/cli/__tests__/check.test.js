import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '../src/index.js';
import { checkBuild, checkDirs, checkLines } from '../src/check.js';

const EXPECTED = join(__dirname, '..', '..', '..', 'golden', 'expected');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

/** A throw-away build folder holding a golden brand's brand-spec / mood / deck. */
function buildCopy(id) {
  const root = mkdtempSync(join(tmpdir(), 'pb-check-'));
  const out = join(root, 'out', id);
  mkdirSync(out, { recursive: true });
  for (const f of ['brand-spec.json', 'mood.json', 'deck.json']) cpSync(join(EXPECTED, id, f), join(out, f));
  return { root, out, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('pb check', () => {
  let tmp;
  afterEach(() => tmp?.cleanup());

  it('runs the checks on a build folder and writes checks.json (Report v1)', () => {
    tmp = buildCopy('hdfc-2');
    const brand = join(tmp.root, 'brand');
    mkdirSync(brand);
    const r = checkBuild(tmp.out, { brand });
    expect(r.brandDir).toBe(brand);
    expect(existsSync(join(tmp.out, 'checks.json'))).toBe(true);
    const report = readJson(tmp.out, 'checks.json');
    expect(report).toEqual(r.report);
    expect(report).toMatchObject({
      kind: 'Report',
      version: '1.0.0',
      brandId: 'hdfc-2',
      summary: { checks: 15 },
    });
    const fails = report.results.filter((x) => x.status === 'fail').map((x) => x.id);
    // the empty brand folder: every asset / logo file is missing, so assets fails too
    expect(fails).toEqual(['questions', 'assets', 'fonts']);
    const lines = checkLines(report);
    expect(lines[0]).toMatch(/^ {2}fail questions: 2 item\(s\); first: Blocking question/);
    expect(lines.every((l) => !/ pass /.test(l))).toBe(true);
  });

  it('a brand folder argument checks its out/<id> build (relative to the working directory)', () => {
    tmp = buildCopy('stripe');
    const brand = join(tmp.root, 'brands', 'stripe');
    mkdirSync(brand, { recursive: true });
    writeFileSync(join(brand, 'stripe.json'), '{}');
    const cwd = process.cwd();
    process.chdir(tmp.root);
    try {
      const dirs = checkDirs(brand);
      expect(dirs).toEqual({ outDir: join(process.cwd(), 'out', 'stripe'), brandDir: brand });
      const r = checkBuild(brand, { write: false });
      expect(r.report.results.find((x) => x.id === 'assets').status).toBe('fail'); // no asset files in that folder
      expect(existsSync(join(tmp.out, 'checks.json'))).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });

  it('refuses a folder that is neither a build nor a brand folder, and a brand folder without a build', () => {
    tmp = buildCopy('stripe');
    expect(() => checkDirs(tmp.root)).toThrow(/neither a build folder/);
    const lone = join(tmp.root, 'lone');
    mkdirSync(lone);
    writeFileSync(join(lone, 'lone.json'), '{}');
    let err;
    try {
      checkDirs(lone);
    } catch (e) {
      err = e;
    }
    expect(err.exitCode).toBe(1);
    expect(err.message).toMatch(/run pb build first/);
  });

  it('`pb check --json` prints the report; without --json one summary line', async () => {
    tmp = buildCopy('stripe');
    const brand = join(tmp.root, 'brand');
    mkdirSync(brand);
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((s) => logs.push(String(s)));
    try {
      await buildProgram().parseAsync(['node', 'pb', 'check', tmp.out, '--brand', brand, '--json']);
      expect(JSON.parse(logs.join('\n'))).toMatchObject({ kind: 'Report', brandId: 'stripe' });
      logs.length = 0;
      await buildProgram().parseAsync(['node', 'pb', 'check', tmp.out, '--brand', brand]);
      expect(logs[0]).toMatch(
        /^pb check: stripe checks: \d+ pass, \d+ warn, \d+ fail, \d+ skip; files from .* -> /,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
