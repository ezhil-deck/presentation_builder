import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Command } from 'commander';
import { BrandInputError, readBrand } from '@pb/brand';
import { deriveMoodResult } from '@pb/mood';
import { proposalKey } from '@pb/engine';
import { summaryLine } from '@pb/checks';
import { buildFromMood, runRender } from './build.js';
import { checkBuild, checkLines } from './check.js';
import { diffSummaryLine, runDiff } from './diff.js';
import { moodHtml } from './html.js';
import paths from './paths.cjs';

/** Exit codes (P1-rules D7): 0 ok, 1 broken input, 2 blocking questions (needs answers). */
export const EXIT = Object.freeze({ OK: 0, BROKEN: 1, QUESTIONS: 2 });

export {
  buildFromMood,
  changedSlides,
  compareSheet,
  composeContent,
  contactSheet,
  proposalsIndex,
  proposalsReport,
  runRender,
  slideTable,
} from './build.js';
export { checkBuild, checkDirs, checkLines } from './check.js';
export { diffDecks, diffMarkdown, diffOutDir, pixelDiff, runDiff } from './diff.js';

/**
 * `--proposals [list]` → the composeDeck `proposals` option: no value / 'all' → every proposal; else a comma list of
 * the open proposals (pr4 / PR-4 / titleClearOfDecor). An unknown name - including the approved PR-1..3, which are
 * rules of every build - is an error.
 */
export function parseProposalsFlag(value) {
  if (value === undefined || value === false) return undefined;
  if (value === true) return 'all';
  const names = String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!names.length) return 'all';
  const bad = names.filter((n) => proposalKey(n) === null);
  if (bad.length) {
    const err = new Error(
      `--proposals: unknown proposal(s) ${bad.join(', ')} (use all or pr4; PR-1..3 are rules of every build)`,
    );
    err.exitCode = EXIT.BROKEN;
    throw err;
  }
  return names;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A deep copy without the per-codepoint font widths (typography.faces / type.faces metrics) - the snapshot form. */
export function withoutWidths(doc) {
  const copy = JSON.parse(JSON.stringify(doc));
  for (const faces of [copy.typography?.faces, copy.type?.faces]) {
    for (const face of Object.values(faces ?? {})) if (face?.metrics) delete face.metrics.widths;
  }
  return copy;
}

/** Brand + mood questions, one per id (neededBy merged, blocking wins). */
export function mergeQuestions(...lists) {
  const out = [];
  const byId = new Map();
  for (const q of lists.flat()) {
    const prev = byId.get(q.id);
    if (!prev) {
      const copy = { ...q, neededBy: [...(q.neededBy ?? [])] };
      byId.set(q.id, copy);
      out.push(copy);
      continue;
    }
    for (const n of q.neededBy ?? []) if (!prev.neededBy.includes(n)) prev.neededBy.push(n);
    if (q.severity === 'blocking') prev.severity = 'blocking';
  }
  return out;
}

/**
 * BR-* then MD-*: brand folder -> { brandSpec, mood, questions, warnings, errors, exitCode }. Never throws for a
 * bad brand: a BrandInputError becomes `errors` (+ its questions) and exit 1, or exit 2 when only answers are
 * missing (D7); a Mood that cannot be formed is exit 2 when blocking questions explain it, else 1.
 */
export function deriveBrand(brandDir, options = {}) {
  let brandSpec = null;
  let mood = null;
  let brandQuestions = [];
  let moodQuestions = [];
  const warnings = [];
  const errors = [];
  let exitCode = EXIT.OK;

  try {
    brandSpec = readBrand(brandDir, options);
    brandQuestions = brandSpec.questions;
    for (const w of brandSpec.warnings ?? []) warnings.push({ source: 'brand', ...w });
  } catch (err) {
    if (!(err instanceof BrandInputError)) throw err;
    errors.push(...err.errors.map((e) => ({ source: 'brand', ...e })));
    if (!err.errors.length) errors.push({ source: 'brand', pointer: '', message: err.message });
    brandQuestions = err.questions ?? [];
    exitCode = err.needsAnswers ? EXIT.QUESTIONS : EXIT.BROKEN;
  }

  if (brandSpec) {
    try {
      const result = deriveMoodResult(brandSpec);
      mood = result.mood;
      moodQuestions = result.questions;
      for (const w of result.warnings) warnings.push({ source: 'mood', ...w });
    } catch (err) {
      if (!Array.isArray(err.errors)) throw err;
      moodQuestions = err.questions ?? [];
      errors.push(...err.errors.map((e) => ({ source: 'mood', pointer: e.pointer, message: e.message })));
      exitCode = moodQuestions.some((q) => q.severity === 'blocking') ? EXIT.QUESTIONS : EXIT.BROKEN;
    }
  }

  const questions = mergeQuestions(brandQuestions, moodQuestions);
  if (exitCode === EXIT.OK && questions.some((q) => q.severity === 'blocking')) exitCode = EXIT.QUESTIONS;
  return { brandSpec, mood, questions, warnings, errors, exitCode };
}

function brandIdOf(brandDir) {
  return resolve(brandDir).split(/[\\/]/).filter(Boolean).pop();
}

function report(id, result) {
  const blocking = result.questions.filter((q) => q.severity === 'blocking').length;
  const status = ['ok', 'broken', 'questions'][result.exitCode];
  return {
    kind: 'MoodReport',
    brandId: id,
    status,
    exitCode: result.exitCode,
    counts: {
      errors: result.errors.length,
      warnings: result.warnings.length,
      questions: result.questions.length,
      blocking,
    },
    errors: result.errors,
    warnings: result.warnings,
  };
}

/**
 * `pb mood <brand-dir>`: write brand-spec.json, mood.json, questions.json, report.json (+ mood.html) to
 * `out` (default out/<id>); `snapshot` also writes golden/expected/<id>/{mood,brand-spec}.json without metrics.widths.
 * Returns { outDir, files, exitCode, questions, warnings, errors, ms, snapshotDir? }.
 */
export function runMood(brandDir, { out, snapshot = false, html = false, expectedDir, cacheDir } = {}) {
  const started = Date.now();
  const result = deriveBrand(brandDir, cacheDir === undefined ? {} : { cacheDir });
  const id = result.brandSpec?.id ?? brandIdOf(brandDir);
  const outDir = resolve(out ?? join('out', id));
  mkdirSync(outDir, { recursive: true });

  const files = {};
  if (result.brandSpec) files['brand-spec.json'] = result.brandSpec;
  if (result.mood) files['mood.json'] = result.mood;
  files['questions.json'] = result.questions;
  files['report.json'] = report(id, result);
  for (const [name, value] of Object.entries(files)) writeJson(join(outDir, name), value);
  const written = Object.keys(files);

  if (html && result.mood) {
    writeFileSync(
      join(outDir, 'mood.html'),
      moodHtml({
        mood: result.mood,
        brandDir: resolve(brandDir),
        outDir,
        questions: result.questions,
        warnings: result.warnings,
        unreferencedAssets: result.brandSpec?.unreferencedAssets ?? [],
      }),
    );
    written.push('mood.html');
  }

  let snapshotDir;
  if (snapshot && result.mood && result.brandSpec) {
    snapshotDir = join(expectedDir ?? paths.GOLDEN_EXPECTED, id);
    mkdirSync(snapshotDir, { recursive: true });
    writeJson(join(snapshotDir, 'mood.json'), withoutWidths(result.mood));
    writeJson(join(snapshotDir, 'brand-spec.json'), withoutWidths(result.brandSpec));
  }

  return {
    id,
    outDir,
    files: written,
    exitCode: result.exitCode,
    questions: result.questions,
    warnings: result.warnings,
    errors: result.errors,
    ms: Date.now() - started,
    ...(snapshotDir ? { snapshotDir } : {}),
  };
}

/**
 * `pb build <brand-dir>` (P2-spec §6 / §7 F9): the same reader + deriveMood, then content (default the showcase) →
 * composeDeck with the layout catalogue → out/<id>/{brand-spec,mood,deck,questions}.json, mood.html, deck.html,
 * report.json; `pdf` →
 * deck.pdf, `png` → slides/NN.png + sheet.png; `snapshot` → golden/expected/<id>/deck.json. Throws (with
 * `exitCode`) when the brand cannot be read or derived.
 */
export async function runBuild(brandDir, options = {}) {
  const started = Date.now();
  const result = deriveBrand(brandDir, options.cacheDir === undefined ? {} : { cacheDir: options.cacheDir });
  if (!result.mood) {
    const err = new Error(
      `pb build: ${brandIdOf(brandDir)} cannot be derived:\n${result.errors
        .map((e) => `  ${e.pointer || '/'}: ${e.message}`)
        .join('\n')}`,
    );
    err.exitCode = result.exitCode;
    err.questions = result.questions;
    throw err;
  }
  return buildFromMood(result, brandDir, { ...options, started });
}

export function buildProgram() {
  const program = new Command();
  program.name('pb').description('presentation_builder: brand input -> mood -> presentation');

  program
    .command('mood')
    .description(
      'read a brand folder and derive its Mood into out/<id>/ (exit 0 ok, 2 blocking questions, 1 broken input)',
    )
    .argument('<brand-dir>', 'brand folder holding <id>.json')
    .option('--out <dir>', 'output folder (default: out/<id>)')
    .option('--snapshot', 'also write golden/expected/<id>/{mood,brand-spec}.json (without metrics.widths)')
    .option(
      '--html',
      'also write mood.html (surfaces, type ladder in the brand fonts, components, logos, ...)',
    )
    .action((brandDir, opts) => {
      const r = runMood(brandDir, { out: opts.out, snapshot: opts.snapshot, html: opts.html });
      const rel = relative(process.cwd(), r.outDir) || '.';
      const blocking = r.questions.filter((q) => q.severity === 'blocking');
      const status = ['ok', 'broken input', 'needs answers'][r.exitCode];
      console.log(`pb mood: ${r.id} ${status} in ${r.ms} ms; wrote ${r.files.join(', ')} to ${rel}`);
      console.log(
        `pb mood: ${r.errors.length} error(s), ${blocking.length} blocking question(s), ` +
          `${r.questions.length - blocking.length} optional, ${r.warnings.length} warning(s)`,
      );
      for (const e of r.errors) console.log(`  error ${e.pointer || '/'}: ${e.message}`);
      for (const q of blocking) console.log(`  question ${q.pointer}: ${q.question}`);
      if (r.snapshotDir) console.log(`pb mood: snapshot ${relative(process.cwd(), r.snapshotDir)}`);
      process.exitCode = r.exitCode;
    });

  program
    .command('build')
    .description('build a brand folder (<id>/<id>.json + assets) and a content file into out/<id>/')
    .argument('<brand-dir>', 'brand folder holding <id>.json')
    .option('--content <md>', 'content markdown (default: golden/showcase/showcase.md)')
    .option('--out <dir>', 'output folder (default: out/<id>)')
    .option('--pdf', 'also write deck.pdf')
    .option('--png', 'also write slides/NN.png and the contact sheet sheet.png')
    .option('--snapshot', 'also write golden/expected/<id>/deck.json')
    .option(
      '--proposals [list]',
      'open design proposals (docs/P3-proposals.md): all, or a comma list (pr4) (default off)',
    )
    .option(
      '--before <dir>',
      'with --proposals: the build without proposals to compare with (default out/<id>)',
    )
    .action(async (brandDir, opts) => {
      let built;
      try {
        const proposals = parseProposalsFlag(opts.proposals);
        if (proposals && opts.snapshot) {
          const err = new Error(
            'pb build: --proposals cannot be combined with --snapshot (golden decks are proposal-free)',
          );
          err.exitCode = EXIT.BROKEN;
          throw err;
        }
        built = await runBuild(brandDir, {
          out: opts.out,
          content: opts.content,
          pdf: opts.pdf,
          png: opts.png,
          snapshot: opts.snapshot,
          ...(proposals ? { proposals, before: opts.before } : {}),
        });
      } catch (err) {
        if (err.exitCode === undefined) throw err;
        console.error(err.message);
        process.exitCode = err.exitCode;
        return;
      }
      const { id, outDir, report, exitCode } = built;
      const rel = relative(process.cwd(), outDir) || '.';
      const c = report.counts;
      console.log(
        `pb build: ${id} ${c.slides} slides, ${c.overflow} overflow, ${c.warnings} warning(s)` +
          `${c.pdfPages !== undefined ? `, pdf ${c.pdfPages} pages` : ''} in ${built.ms} ms -> ${rel}`,
      );
      for (const o of report.overflow)
        console.log(`  overflow ${o.slide} ${o.elementId ?? ''}: ${o.message}`);
      console.log(`pb build: ${summaryLine(report.checks)}`);
      if (report.proposals) {
        const p = report.proposals;
        const per = Object.entries(p.byProposal)
          .filter(([, e]) => e.on)
          .map(([id, e]) => `${id} ${e.count}`)
          .join(', ');
        console.log(
          `pb build: proposals ${per}${p.changedSlides ? `; ${p.changedSlides.length} slide(s) differ from ${p.before}` : ''}`,
        );
      }
      if (built.snapshotDir) console.log(`pb build: snapshot ${relative(process.cwd(), built.snapshotDir)}`);
      process.exitCode = exitCode;
    });

  program
    .command('render')
    .description('render an existing deck.json to deck.html (+ --pdf / --png) next to it')
    .argument('<deck.json>', 'a Deck (schemas/deck.schema.json)')
    .option('--out <dir>', "output folder (default: the deck's folder)")
    .option(
      '--base <dir>',
      "folder the deck's asset paths are relative to (default: golden/brands/<brandId>)",
    )
    .option('--pdf', 'write deck.pdf')
    .option('--png', 'write slides/NN.png and sheet.png')
    .action(async (deckFile, opts) => {
      const r = await runRender(deckFile, { out: opts.out, base: opts.base, pdf: opts.pdf, png: opts.png });
      const rel = relative(process.cwd(), r.outDir) || '.';
      console.log(`pb render: wrote ${r.files.join(', ')} to ${rel} in ${r.ms} ms`);
    });

  program
    .command('check')
    .description(
      'run the checks on a build folder out/<id>/ (or a brand folder: its out/<id>) -> checks.json',
    )
    .argument('<dir>', 'a build folder (deck.json) or a brand folder (<id>.json)')
    .option(
      '--brand <dir>',
      'brand folder for the file checks (default: golden/brands/<brandId> when present)',
    )
    .option('--json', 'print the report (Report v1) as JSON')
    .action((dir, opts) => {
      let r;
      try {
        r = checkBuild(dir, { brand: opts.brand });
      } catch (err) {
        if (err.exitCode === undefined) throw err;
        console.error(err.message);
        process.exitCode = err.exitCode;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(r.report, null, 2));
        return;
      }
      const rel = (p) => relative(process.cwd(), p) || '.';
      const files = r.brandDir ? `files from ${rel(r.brandDir)}` : 'files not checked (no brand folder)';
      console.log(
        `pb check: ${r.report.brandId ?? '?'} ${summaryLine(r.report)}; ${files} -> ${rel(r.file)}`,
      );
      for (const line of checkLines(r.report)) console.log(line);
    });

  program
    .command('diff')
    .description('compare two build folders: deck JSON diff + slide PNG pixel diff -> diff.json, DIFF.md')
    .argument('<dirA>', 'before: a build folder (deck.json [+ slides/NN.png])')
    .argument('<dirB>', 'after: a build folder or a golden snapshot folder')
    .option('--out <dir>', 'output folder (default: <dirB>/diff)')
    .action(async (dirA, dirB, opts) => {
      let r;
      try {
        r = await runDiff(dirA, dirB, { out: opts.out });
      } catch (err) {
        if (err.exitCode === undefined) throw err;
        console.error(err.message);
        process.exitCode = err.exitCode;
        return;
      }
      const rel = relative(process.cwd(), r.outDir) || '.';
      console.log(`pb diff: ${dirA} vs ${dirB}: ${diffSummaryLine(r)} -> ${rel}`);
      if (r.note) console.log(`pb diff: ${r.note}`);
    });

  return program;
}
