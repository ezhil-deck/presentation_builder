/**
 * @pb/checks (P3-spec §A): `runChecks({ brandSpec, mood, deck, files? }) → Report v1`. Pure and deterministic (sorted
 * keys, items in slide order then element id); browser-safe (no node:fs here: `filesFrom` lives in ./files.js).
 * A check that cannot read its signal is `skip` with the reason, never a guessed threshold. Checks warn; only contract
 * failures fail (invalid deck, missing files, unanswered blocking questions).
 */
import * as schema from './checks/schema.js';
import * as questions from './checks/questions.js';
import * as assets from './checks/assets.js';
import * as fonts from './checks/fonts.js';
import * as overflow from './checks/overflow.js';
import * as minSize from './checks/min-size.js';
import * as margins from './checks/margins.js';
import * as contrast from './checks/contrast.js';
import * as textOverlap from './checks/text-overlap.js';
import * as logo from './checks/logo.js';
import * as decor from './checks/decor.js';
import * as variety from './checks/variety.js';
import * as emptySpace from './checks/empty-space.js';
import * as compose from './checks/compose.js';
import * as placeholder from './checks/placeholder.js';
import * as typeLadder from './checks/type-ladder.js';
import { sortItems, sortKeys } from './util.js';

export const REPORT_VERSION = '1.0.0';

/**
 * The 14 checks of P3-spec §A.2, in report order, and the info report `type-ladder` (text sizes per slide and the type
 * ratios, 2026-11-03; info items only, never a warn).
 */
export const CHECKS = Object.freeze([
  schema,
  questions,
  assets,
  fonts,
  overflow,
  minSize,
  margins,
  contrast,
  textOverlap,
  logo,
  decor,
  variety,
  emptySpace,
  compose,
  typeLadder,
]);

/**
 * The editor's checks (docs/P4-spec.md §3, P4.2), run after CHECKS when `runChecks` gets `editor: true` (the Studio):
 * `placeholder` lists the slides still showing the slide-kind picker's placeholder copy. A deck built from Markdown
 * by the CLI never carries that copy, so its report keeps CHECKS.
 */
export const EDITOR_CHECKS = Object.freeze([placeholder]);

/** One check → its result (P3-spec §A.1); a check that throws is a `fail` naming the error (never silent). */
export function runCheck(check, ctx) {
  let out;
  try {
    out = check.run(ctx);
  } catch (err) {
    out = {
      status: 'fail',
      items: [{ severity: 'fail', message: `check "${check.id}" crashed: ${err.message}` }],
    };
  }
  const items = sortItems(out.items ?? []);
  const res = {
    id: check.id,
    title: check.title,
    status: out.status,
    signal: check.signal ?? null,
    count: items.length,
    items,
  };
  if (out.status === 'skip') res.reason = out.reason ?? 'signal absent';
  return res;
}

/** Report summary: result counts by status and item counts by severity. */
export function summarize(results) {
  const summary = {
    checks: results.length,
    pass: 0,
    warn: 0,
    fail: 0,
    skip: 0,
    items: { fail: 0, warn: 0, info: 0 },
  };
  for (const r of results) {
    summary[r.status] += 1;
    for (const it of r.items) summary.items[it.severity] += 1;
  }
  return summary;
}

/** The one-line summary `pb build` / `pb check` print: "checks: 12 pass, 2 warn, 0 fail, 1 skip". */
export function summaryLine(report) {
  const s = report.summary;
  return `checks: ${s.pass} pass, ${s.warn} warn, ${s.fail} fail, ${s.skip} skip`;
}

/**
 * runChecks({ brandSpec, mood, deck, files?, editor? }) → Report v1. `files` = `{ exists(relPath) → boolean }` resolved
 * against the brand folder (see `filesFrom` in ./files.js); without it, file checks are not run. `editor` adds
 * EDITOR_CHECKS (the Studio).
 */
export function runChecks({ brandSpec, mood, deck, files, editor = false } = {}) {
  const ctx = { brandSpec, mood, deck, files };
  const results = (editor ? [...CHECKS, ...EDITOR_CHECKS] : CHECKS).map((c) => runCheck(c, ctx));
  return sortKeys({
    kind: 'Report',
    version: REPORT_VERSION,
    brandId: brandSpec?.id ?? deck?.source?.brandId ?? mood?.brandId ?? null,
    deckId: deck?.id ?? null,
    engineVersion: deck?.engineVersion ?? null,
    summary: summarize(results),
    results,
  });
}
