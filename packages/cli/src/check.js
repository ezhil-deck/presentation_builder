/**
 * `pb check <out-dir | brand-dir> [--brand <dir>] [--json]` (P3-spec §A.3): the checks (@pb/checks, Report v1) on an
 * existing build folder out/<id>/ — its brand-spec.json, mood.json and deck.json — written to `checks.json` there.
 * File checks use the brand folder when one can be found: `--brand <dir>`, the brand folder given as the argument, or
 * golden/brands/<deck.source.brandId>; else they are not run (the report says so).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { runChecks } from '@pb/checks';
import { filesFrom } from '@pb/checks/files';
import paths from './paths.cjs';

function usage(message) {
  const err = new Error(`pb check: ${message}`);
  err.exitCode = 1;
  return err;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The build folder and the brand folder `pb check` reads: `dir` is a build folder (holds deck.json) or a brand folder
 * (holds <id>.json; its build is out/<id> under the working directory). Returns { outDir, brandDir | null }.
 */
export function checkDirs(dir, { brand } = {}) {
  const abs = resolve(dir);
  let outDir;
  let brandDir = null;
  if (existsSync(join(abs, 'deck.json'))) outDir = abs;
  else if (existsSync(join(abs, `${basename(abs)}.json`))) {
    brandDir = abs;
    outDir = resolve('out', basename(abs));
    if (!existsSync(join(outDir, 'deck.json'))) {
      throw usage(`${dir} is a brand folder, but ${outDir}/deck.json is missing: run pb build first`);
    }
  } else throw usage(`${dir} is neither a build folder (deck.json) nor a brand folder (<id>.json)`);
  if (brand) {
    brandDir = resolve(brand);
    if (!existsSync(brandDir)) throw usage(`--brand ${brand} does not exist`);
  }
  if (!brandDir) {
    const id = readJson(join(outDir, 'deck.json')).source?.brandId;
    const guess = id ? join(paths.GOLDEN_BRANDS, id) : null;
    if (guess && existsSync(guess)) brandDir = guess;
  }
  return { outDir, brandDir };
}

/**
 * Run the checks on a build folder → { outDir, brandDir, file, report }; writes `checks.json` into the build folder
 * unless `write` is false.
 */
export function checkBuild(dir, { brand, write = true } = {}) {
  const { outDir, brandDir } = checkDirs(dir, { brand });
  const opt = (name) => (existsSync(join(outDir, name)) ? readJson(join(outDir, name)) : undefined);
  const deck = readJson(join(outDir, 'deck.json'));
  const report = runChecks({
    brandSpec: opt('brand-spec.json'),
    mood: opt('mood.json'),
    deck,
    files: brandDir ? filesFrom(brandDir) : undefined,
  });
  const file = join(outDir, 'checks.json');
  if (write) writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return { outDir, brandDir, file, report };
}

/** The report's non-pass results, one line each: status, id, item count, first finding (or the skip reason). */
export function checkLines(report) {
  return report.results
    .filter((r) => r.status !== 'pass')
    .map((r) => {
      if (r.status === 'skip') return `  skip ${r.id}: ${r.reason}`;
      const first = r.items.find((i) => i.severity === r.status) ?? r.items[0];
      const where = first?.index ? ` (slide ${first.index})` : '';
      return `  ${r.status} ${r.id}: ${r.count} item(s); first${where}: ${first?.message ?? ''}`;
    });
}
