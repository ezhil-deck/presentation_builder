/**
 * `pb build` / `pb render` (P2-spec §6, §7 F9 / F10): brand folder → Mood → Content → Deck → deck.json, deck.html,
 * report.json (+ deck.pdf, slides/NN.png, sheet.png). The HTML references the brand's assets and fonts by paths
 * relative to the output folder, so the same file works opened from disk and through the exporters.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeDeck, parseMarkdownResult, PROPOSALS } from '@pb/engine';
import { catalogue } from '@pb/layouts';
import { renderDeckToHtml } from '@pb/renderer';
import { runChecks } from '@pb/checks';
import { filesFrom } from '@pb/checks/files';
import paths from './paths.cjs';
import { moodHtml } from './html.js';

export const SHOWCASE = join(paths.REPO_ROOT, 'golden', 'showcase', 'showcase.md');
export const ENGINE_VERSION = '0.4.0';

/** The relative URL prefix from `fromDir` to `toDir` ('' when they are the same folder), with forward slashes. */
export function relBase(fromDir, toDir) {
  const rel = relative(resolve(fromDir), resolve(toDir)).split(sep).join('/');
  return rel ? `${rel}/` : '';
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const r2 = (v) => Math.round(v * 100) / 100;

/** Per-slide rows of the build report: index, kind, layout, surface, applied text sizes, overflow. */
export function slideTable(deck) {
  return deck.slides.map((s, i) => {
    const sizes = [];
    let overflow = 0;
    const walk = (els) => {
      for (const el of els) {
        if (el.text?.fit) {
          const f = el.text.fit;
          sizes.push({
            element: el.id,
            role: el.text.font?.role,
            requested: f.requestedSize,
            applied: f.appliedSize,
          });
          if (f.overflow) overflow += 1;
        }
        if (el.type === 'table') {
          const st = el.table?.style ?? {};
          for (const [part, f] of [
            ['header', st.header?.font],
            ['cells', st.font],
          ]) {
            if (f) sizes.push({ element: `${el.id}:${part}`, role: f.role, applied: f.size });
          }
          if ((el.warnings ?? []).some((w) => w.check === 'overflow')) overflow += 1;
        }
        if (el.type === 'chart' && el.chart?.style?.font) {
          const f = el.chart.style.font;
          sizes.push({ element: el.id, role: f.role, applied: f.size });
        }
        if (el.children) walk(el.children);
      }
    };
    walk(s.elements);
    const row = {
      index: i + 1,
      id: s.id,
      kind: s.kind,
      layoutId: s.layoutId ?? null,
      surfaceId: s.surfaceId ?? null,
      sizes,
      overflow,
      warnings: (s.warnings ?? []).length,
    };
    if (s.requestedKind) row.requestedKind = s.requestedKind;
    return row;
  });
}

/** Every warning that is an overflow (text or table), one line each. */
export function overflowList(deck) {
  return (deck.warnings ?? [])
    .filter((w) => w.check === 'overflow')
    .map((w) => ({ slide: w.slide, elementId: w.elementId, message: w.message }));
}

/** PDF page count (page objects in the file). */
export function pdfPageCount(file) {
  const s = readFileSync(file).toString('latin1');
  return (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * A full-page PNG of the HTML file `htmlFile` at `width` × `height` (deviceScaleFactor 1), in `browser` or in a Chrome
 * of its own launched through `@pb/export` `withBrowser` (the cross-process Chrome lock, bounded close).
 */
export async function screenshotPage(htmlFile, outFile, { width, height }, browser) {
  const shoot = async (b) => {
    const page = await b.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.screenshot({ path: resolve(outFile), type: 'png', fullPage: true });
    } finally {
      await page.close().catch(() => {});
    }
  };
  if (browser) return shoot(browser);
  const { withBrowser } = await import('@pb/export');
  return withBrowser(shoot);
}

/**
 * F10: a contact sheet of slide PNGs — 4 per row, 480 px wide thumbnails (270 px tall), each captioned with its
 * slide index (+ kind / layout when given) — screenshotted with puppeteer to `outFile`.
 */
export async function contactSheet(pngFiles, outFile, { captions = [], title = '', browser } = {}) {
  const cols = 4;
  const thumbW = 480;
  const thumbH = 270;
  const gap = 16;
  const capH = 28;
  const rows = Math.ceil(pngFiles.length / cols);
  const width = cols * thumbW + (cols + 1) * gap;
  const head = title ? 40 : 0;
  const height = head + rows * (thumbH + capH + gap) + gap;
  const dir = dirname(resolve(outFile));
  const cells = pngFiles
    .map((f, i) => {
      const src = relBase(dir, dirname(f)) + f.split(/[\\/]/).pop();
      const cap = captions[i] ?? String(i + 1);
      return `<figure><img src="${escapeHtml(src)}"><figcaption>${escapeHtml(cap)}</figcaption></figure>`;
    })
    .join('');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    `html,body{margin:0;background:#E9E9EC;font:14px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#222}` +
    `h1{font-size:18px;margin:0;padding:${gap}px ${gap}px 0;height:${head - gap}px}` +
    `main{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:${gap}px;padding:${gap}px}` +
    `figure{margin:0}img{display:block;width:${thumbW}px;height:${thumbH}px;box-shadow:0 0 0 1px #BBB}` +
    `figcaption{height:${capH}px;line-height:${capH}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` +
    `</style></head><body>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}<main>${cells}</main></body></html>`;
  const tmp = join(dir, `.pb-sheet-${process.pid}.html`);
  writeFileSync(tmp, html);
  try {
    await screenshotPage(tmp, outFile, { width, height }, browser);
  } finally {
    rmSync(tmp, { force: true });
  }
  return { file: resolve(outFile), width, height };
}

/**
 * deck → deck.html (+ deck.pdf, slides/NN.png, sheet.png) in `outDir`; asset / font URLs relative to `outDir` from
 * `baseDir` (the folder the deck's asset paths are relative to). Returns { files, pdfPages?, pngs? }.
 */
export async function renderOutputs(deck, { outDir, baseDir, pdf = false, png = false }) {
  const base = relBase(outDir, baseDir);
  const html = renderDeckToHtml(deck, { assetBase: base, fontBase: base });
  writeFileSync(join(outDir, 'deck.html'), html);
  const files = ['deck.html'];
  const result = { files };
  if (!pdf && !png) return result;
  const { exportPdf, exportPng, withBrowser } = await import('@pb/export');
  // one Chrome for the PDF, the PNGs and the sheet, under the cross-process Chrome lock (@pb/export withBrowser)
  await withBrowser(async (browser) => {
    if (pdf) {
      await exportPdf(html, join(outDir, 'deck.pdf'), { basePath: outDir, browser });
      files.push('deck.pdf');
      result.pdfPages = pdfPageCount(join(outDir, 'deck.pdf'));
    }
    if (png) {
      const slidesDir = join(outDir, 'slides');
      if (existsSync(slidesDir)) {
        for (const f of readdirSync(slidesDir)) if (/^\d+\.png$/.test(f)) rmSync(join(slidesDir, f));
      }
      const { files: pngs } = await exportPng(html, slidesDir, { basePath: outDir, browser });
      files.push(...pngs.map((f) => `slides/${f.split(/[\\/]/).pop()}`));
      const captions = deck.slides.map(
        (s, i) => `${i + 1} · ${s.requestedKind ?? s.kind}${s.layoutId ? ` · ${s.layoutId}` : ''}`,
      );
      await contactSheet(pngs, join(outDir, 'sheet.png'), {
        captions,
        title: `${deck.source?.brandId ?? deck.id} — ${deck.title ?? ''}`,
        browser,
      });
      files.push('sheet.png');
      result.pngs = pngs.length;
    }
  });
  return result;
}

/**
 * Content (default the showcase) + the derived brand → { contentFile, parsed: {content, warnings}, deck, warnings }.
 * Pure: no files written (the golden test composes through here).
 */
export function composeContent({ brandSpec, mood }, opts = {}) {
  const contentFile = resolve(opts.content ?? SHOWCASE);
  const parsed = parseMarkdownResult(readFileSync(contentFile, 'utf8'), { brandSpec });
  const composed = composeDeck({
    content: parsed.content,
    mood,
    brandSpec,
    catalogue,
    engineVersion: ENGINE_VERSION,
    ...(opts.proposals ? { proposals: opts.proposals } : {}),
    // the catalogue layouts are the default (C4); `catalogue: false` composes with the 68 only
    ...(opts.catalogue === false ? { options: { catalogue: false } } : {}),
  });
  const { deck, warnings } = composed;
  return {
    contentFile,
    parsed,
    deck,
    warnings,
    ...(composed.proposals ? { proposals: composed.proposals } : {}),
    ...(composed.catalogue ? { catalogueLog: composed.catalogue } : {}),
  };
}

/**
 * The build report's `catalogue` section (every build since C4, docs/PLAN-catalogue.md): the match counts
 * (exact family / same combination / none), one row per slide ({slide, index, layoutId, catalogue, key, slideKey,
 * match}) and, with a `before` deck, the slides drawn differently from it (slide warnings left out: C4's catalogue
 * note on every fallback slide changes no drawing).
 */
export function catalogueReport(log, { deck, before, beforeFile } = {}) {
  const counts = { family: 0, combination: 0, none: 0 };
  for (const r of log) counts[r.match] += 1;
  const out = { counts, slides: log };
  if (before) {
    const drawn = (d) => ({
      ...d,
      slides: (d?.slides ?? []).map((s) => {
        const rest = { ...s };
        delete rest.warnings;
        return rest;
      }),
    });
    out.before = beforeFile;
    out.changedSlides = changedSlides(drawn(before), drawn(deck));
  }
  return out;
}

/**
 * `index.html` in a build folder built with `--before` (C3 / C4): one row per slide - index, kind, the layout and catalogue slide used,
 * how it matched, the catalogue key and the slide's own key - with links to compare.png / sheet.png.
 */
export function catalogueSlidesIndex(outDir, { title, report, deck }) {
  const link = (f) => (existsSync(join(outDir, f)) ? `<a href="${escapeHtml(f)}">${escapeHtml(f)}</a>` : '—');
  const changed = new Set(report.changedSlides ?? []);
  const rows = report.slides
    .map((r) => {
      const s = deck.slides[r.index - 1];
      return (
        `<tr class="${r.match}"><td class="n">${r.index}</td><td>${escapeHtml(s?.requestedKind ?? s?.kind ?? '')}</td>` +
        `<td>${escapeHtml(r.layoutId ?? '')}</td><td>${escapeHtml(r.catalogue ?? '—')}</td>` +
        `<td>${escapeHtml(r.match)}</td><td>${changed.has(r.index) ? 'yes' : ''}</td>` +
        `<td><code>${escapeHtml(r.key ?? '—')}</code></td><td><code>${escapeHtml(r.slideKey ?? '—')}</code></td></tr>`
      );
    })
    .join('');
  const c = report.counts;
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escapeHtml(title)}</title><style>` +
    'body{margin:0;padding:24px;font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#222;background:#F6F6F8}' +
    'table{border-collapse:collapse;background:#fff}th,td{padding:6px 10px;border-bottom:1px solid #E2E2E6;text-align:left;vertical-align:top}' +
    'thead th{font-weight:600;color:#555}td.n{font-variant-numeric:tabular-nums}code{font-size:12px}' +
    'tr.family td:nth-child(5){color:#0A7A3E;font-weight:600}tr.combination td:nth-child(5){color:#8A5A00;font-weight:600}' +
    `</style></head><body><h1>${escapeHtml(title)}</h1>` +
    `<p>Catalogue layouts (docs/PLAN-catalogue.md C3): ${c.family} exact family, ${c.combination} same combination, ` +
    `${c.none} none. Before / after: ${link('compare.png')} · contact sheet: ${link('sheet.png')}` +
    `${report.before ? ` · before: <code>${escapeHtml(report.before)}</code>` : ''}</p>` +
    '<table><thead><tr><th>#</th><th>kind</th><th>layout</th><th>catalogue</th><th>match</th><th>changed</th>' +
    `<th>catalogue key</th><th>slide key</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  writeFileSync(join(outDir, 'index.html'), html);
  return join(outDir, 'index.html');
}

/** The 1-based indices of the slides whose JSON differs between two decks (a slide only one deck has counts). */
export function changedSlides(before, after) {
  const n = Math.max(before?.slides?.length ?? 0, after?.slides?.length ?? 0);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (JSON.stringify(before?.slides?.[i]) !== JSON.stringify(after?.slides?.[i])) out.push(i + 1);
  }
  return out;
}

/**
 * The build report's `proposals` section: the options, the slides that differ from the `before` deck (when given),
 * per open proposal the slides it changed and what it did.
 */
export function proposalsReport(proposals, { deck, before, beforeFile } = {}) {
  const byProposal = {};
  for (const [key, id] of Object.entries(PROPOSALS)) {
    const effects = proposals.effects.filter((e) => e.key === key);
    const slides = [...new Set(effects.map((e) => e.index))].sort((a, b) => a - b);
    const entry = { key, on: proposals.options[key] === true, slides, count: slides.length };
    const strip = (e) => {
      const rest = { ...e };
      delete rest.proposal;
      delete rest.key;
      return rest;
    };
    entry.effects = effects.map(strip);
    byProposal[id] = entry;
  }
  const out = { options: proposals.options, byProposal };
  if (before) {
    out.before = beforeFile;
    out.changedSlides = changedSlides(before, deck);
  }
  return out;
}

/**
 * Proposal review sheet: one row per changed slide, the before PNG (left) and the after PNG (right), each 640 px wide,
 * captioned with the slide index / kind and the proposals that changed it; screenshotted with puppeteer.
 */
export async function compareSheet(rows, outFile, { title = '', browser } = {}) {
  const thumbW = 640;
  const thumbH = 360;
  const gap = 16;
  const capH = 28;
  const width = 2 * thumbW + 3 * gap;
  const head = 40;
  const dir = dirname(resolve(outFile));
  const src = (f) => relBase(dir, dirname(f)) + f.split(/[\\/]/).pop();
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<section><div class="cap">${escapeHtml(r.caption)}</div><div class="pair">` +
            `<figure><img src="${escapeHtml(src(r.before))}"><figcaption>before</figcaption></figure>` +
            `<figure><img src="${escapeHtml(src(r.after))}"><figcaption>after</figcaption></figure></div></section>`,
        )
        .join('')
    : '<p class="none">No slide differs.</p>';
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    `html,body{margin:0;background:#E9E9EC;font:14px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#222;width:${width}px}` +
    `h1{font-size:18px;margin:0;padding:${gap}px ${gap}px 0;height:${head - gap}px}` +
    `section{padding:0 ${gap}px ${gap}px}.cap{height:${capH}px;line-height:${capH}px;font-weight:600}` +
    `.pair{display:grid;grid-template-columns:repeat(2,${thumbW}px);gap:${gap}px}figure{margin:0}` +
    `img{display:block;width:${thumbW}px;height:${thumbH}px;box-shadow:0 0 0 1px #BBB}` +
    `figcaption{color:#666;font-size:12px;padding-top:4px}.none{padding:0 ${gap}px ${gap}px}` +
    `</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
  const tmp = join(dir, `.pb-compare-${process.pid}.html`);
  writeFileSync(tmp, html);
  try {
    await screenshotPage(tmp, outFile, { width, height: 400 }, browser);
  } finally {
    rmSync(tmp, { force: true });
  }
  return { file: resolve(outFile), width, rows: rows.length };
}

/**
 * `index.html` in `rootDir` (e.g. out/_proposals): one row per sub-folder whose report.json has a `proposals`
 * section — the brand, its changed-slide count, the slides per proposal and links to compare.png / sheet.png.
 */
export function proposalsIndex(rootDir) {
  const rows = readdirSync(rootDir)
    .filter((id) => existsSync(join(rootDir, id, 'report.json')))
    .sort()
    .map((id) => {
      const report = JSON.parse(readFileSync(join(rootDir, id, 'report.json'), 'utf8'));
      return report.proposals ? { id, p: report.proposals } : null;
    })
    .filter(Boolean);
  const ids = Object.values(PROPOSALS);
  const link = (id, f) =>
    existsSync(join(rootDir, id, f)) ? `<a href="${escapeHtml(`${id}/${f}`)}">${escapeHtml(f)}</a>` : '—';
  const tr = rows
    .map(({ id, p }) => {
      const changed = p.changedSlides ? String(p.changedSlides.length) : '?';
      const cells = ids
        .map((k) => {
          const e = p.byProposal?.[k];
          const t = e ? `${e.count}${e.slides.length ? ` (${e.slides.join(', ')})` : ''}` : '—';
          return `<td>${escapeHtml(t)}</td>`;
        })
        .join('');
      return (
        `<tr><th>${escapeHtml(id)}</th><td class="n">${escapeHtml(changed)}</td>${cells}` +
        `<td>${link(id, 'compare.png')}</td><td>${link(id, 'sheet.png')}</td></tr>`
      );
    })
    .join('');
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Proposals review</title><style>' +
    'body{margin:0;padding:24px;font:14px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#222;background:#F6F6F8}' +
    'table{border-collapse:collapse;background:#fff}th,td{padding:8px 12px;border-bottom:1px solid #E2E2E6;text-align:left;vertical-align:top}' +
    'thead th{font-weight:600;color:#555}td.n{font-variant-numeric:tabular-nums;font-weight:600}' +
    '</style></head><body><h1>Proposals review (docs/P3-proposals.md)</h1>' +
    '<p>Changed slides: slides whose deck JSON differs from the build without proposals (out/&lt;id&gt;/deck.json). ' +
    'Per proposal: slides it changed (count, indices).</p><table><thead><tr><th>brand</th><th>changed</th>' +
    `${ids.map((k) => `<th>${k}</th>`).join('')}<th>compare</th><th>sheet</th></tr></thead><tbody>${tr}</tbody></table>` +
    '</body></html>';
  writeFileSync(join(rootDir, 'index.html'), html);
  return { file: join(rootDir, 'index.html'), brands: rows.length };
}

/**
 * The build after the Mood: content (default the showcase) → compose → outputs → report. `derived` is
 * deriveBrand()'s result (with a Mood). Returns { outDir, files, report, deck, exitCode, snapshotDir? }.
 */
export async function buildFromMood(derived, brandDir, opts = {}) {
  const started = opts.started ?? Date.now();
  const { brandSpec, mood } = derived;
  const { contentFile, parsed, deck, warnings, proposals, catalogueLog } = composeContent(derived, opts);

  const outDir = resolve(opts.out ?? join('out', brandSpec.id));
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, 'brand-spec.json'), brandSpec);
  writeJson(join(outDir, 'mood.json'), mood);
  writeJson(join(outDir, 'deck.json'), deck);
  // the Mood review page + the questions, so a build folder is complete on its own (the review UI reads them)
  writeJson(join(outDir, 'questions.json'), derived.questions ?? []);
  writeFileSync(
    join(outDir, 'mood.html'),
    moodHtml({
      mood,
      brandDir: resolve(brandDir),
      outDir,
      questions: derived.questions ?? [],
      warnings: derived.warnings ?? [],
      unreferencedAssets: brandSpec.unreferencedAssets ?? [],
    }),
  );
  const files = ['brand-spec.json', 'mood.json', 'deck.json', 'questions.json', 'mood.html'];
  const composeMs = Date.now() - started;
  const rendered = await renderOutputs(deck, {
    outDir,
    baseDir: resolve(brandDir),
    pdf: opts.pdf,
    png: opts.png,
  });
  files.push(...rendered.files);

  const overflow = overflowList(deck);
  const allWarnings = [
    ...derived.warnings,
    ...parsed.warnings.map((w) => ({ source: 'content', ...w })),
    ...warnings.map((w) => ({ source: 'compose', ...w })),
  ];
  const report = {
    kind: 'BuildReport',
    brandId: brandSpec.id,
    deckId: deck.id,
    content: relative(paths.REPO_ROOT, contentFile).split(sep).join('/'),
    engineVersion: ENGINE_VERSION,
    counts: {
      slides: deck.slides.length,
      overflow: overflow.length,
      warnings: allWarnings.length,
      questions: derived.questions.length,
      ...(rendered.pdfPages !== undefined ? { pdfPages: rendered.pdfPages } : {}),
      ...(rendered.pngs !== undefined ? { pngs: rendered.pngs } : {}),
    },
    ms: { compose: composeMs, total: Date.now() - started },
    slides: slideTable(deck),
    overflow,
    warnings: allWarnings,
    checks: runChecks({ brandSpec, mood, deck, files: filesFrom(brandDir) }),
  };
  if (proposals) {
    // the build without proposals to compare with (default out/<id>, the plain `pb build` folder)
    const beforeDir = resolve(opts.before ?? join('out', brandSpec.id));
    const beforeFile = join(beforeDir, 'deck.json');
    const before =
      beforeDir !== outDir && existsSync(beforeFile) ? JSON.parse(readFileSync(beforeFile, 'utf8')) : null;
    report.proposals = proposalsReport(proposals, {
      deck,
      before,
      beforeFile: before ? relative(paths.REPO_ROOT, beforeFile).split(sep).join('/') : undefined,
    });
    if (before && opts.png) {
      const pad = (n) => `${String(n).padStart(2, '0')}.png`;
      const byIndex = new Map();
      for (const e of proposals.effects) {
        const set = byIndex.get(e.index) ?? new Set();
        set.add(e.proposal);
        byIndex.set(e.index, set);
      }
      const rows = report.proposals.changedSlides
        .filter(
          (n) => existsSync(join(beforeDir, 'slides', pad(n))) && existsSync(join(outDir, 'slides', pad(n))),
        )
        .map((n) => {
          const s = deck.slides[n - 1];
          const which = [...(byIndex.get(n) ?? [])].sort();
          return {
            before: join(beforeDir, 'slides', pad(n)),
            after: join(outDir, 'slides', pad(n)),
            caption: `${n} · ${s?.requestedKind ?? s?.kind ?? '?'} — ${which.length ? which.join(', ') : 'no proposal recorded'}`,
          };
        });
      await compareSheet(rows, join(outDir, 'compare.png'), {
        title: `${brandSpec.id} — proposals ${Object.entries(proposals.options)
          .filter(([, v]) => v)
          .map(([k]) => PROPOSALS[k])
          .join(', ')}: ${rows.length} changed slide(s) (before left, after right)`,
      });
      files.push('compare.png');
    }
  }
  if (catalogueLog) {
    // always written (C4); with `--before <dir>` (and no proposals, which compare themselves) against that build:
    // the changed slides, compare.png (with --png) and index.html
    const beforeDir = opts.before && !proposals ? resolve(opts.before) : null;
    const beforeFile = beforeDir ? join(beforeDir, 'deck.json') : null;
    const before =
      beforeDir && beforeDir !== outDir && existsSync(beforeFile)
        ? JSON.parse(readFileSync(beforeFile, 'utf8'))
        : null;
    report.catalogue = catalogueReport(catalogueLog, {
      deck,
      before,
      beforeFile: before ? relative(paths.REPO_ROOT, beforeFile).split(sep).join('/') : undefined,
    });
    if (before && opts.png) {
      const pad = (n) => `${String(n).padStart(2, '0')}.png`;
      const rows = report.catalogue.changedSlides
        .filter(
          (n) => existsSync(join(beforeDir, 'slides', pad(n))) && existsSync(join(outDir, 'slides', pad(n))),
        )
        .map((n) => {
          const s = deck.slides[n - 1];
          const r = catalogueLog[n - 1];
          return {
            before: join(beforeDir, 'slides', pad(n)),
            after: join(outDir, 'slides', pad(n)),
            caption: `${n} · ${s?.requestedKind ?? s?.kind ?? '?'} · ${r?.catalogue ?? r?.layoutId ?? '?'} (${r?.match ?? 'none'}) — ${r?.key ?? r?.slideKey ?? ''}`,
          };
        });
      const c = report.catalogue.counts;
      await compareSheet(rows, join(outDir, 'compare.png'), {
        title: `${brandSpec.id} — catalogue layouts: ${c.family} exact family, ${c.combination} same combination, ${c.none} none; ${rows.length} changed slide(s) (before left, after right)`,
      });
      files.push('compare.png');
    }
    if (beforeDir) {
      catalogueSlidesIndex(outDir, {
        title: `${brandSpec.id} — ${deck.title ?? relative(paths.REPO_ROOT, contentFile)} — catalogue layouts`,
        report: report.catalogue,
        deck,
      });
      files.push('index.html');
    }
  }
  writeJson(join(outDir, 'report.json'), report);
  files.push('report.json');
  if (proposals && opts.png && existsSync(join(outDir, 'compare.png'))) proposalsIndex(dirname(outDir));

  let snapshotDir;
  if (opts.snapshot) {
    snapshotDir = join(opts.expectedDir ?? paths.GOLDEN_EXPECTED, brandSpec.id);
    mkdirSync(snapshotDir, { recursive: true });
    writeJson(join(snapshotDir, 'deck.json'), deck);
  }
  return {
    id: brandSpec.id,
    outDir,
    files,
    report,
    deck,
    exitCode: derived.exitCode,
    ms: r2(Date.now() - started),
    ...(snapshotDir ? { snapshotDir } : {}),
  };
}

/**
 * `pb render <deck.json>`: an existing deck → deck.html (+ deck.pdf / slides / sheet.png) next to it (or `--out`).
 * Asset paths in the deck are relative to `base` (default: the brand folder golden/brands/<brandId> when it
 * exists, else the deck's folder).
 */
export async function runRender(deckFile, { out, base, pdf = false, png = false } = {}) {
  const started = Date.now();
  const deck = JSON.parse(readFileSync(deckFile, 'utf8'));
  const outDir = resolve(out ?? dirname(deckFile));
  mkdirSync(outDir, { recursive: true });
  const brandDir = deck.source?.brandId ? join(paths.GOLDEN_BRANDS, deck.source.brandId) : null;
  const baseDir = resolve(base ?? (brandDir && existsSync(brandDir) ? brandDir : dirname(deckFile)));
  const rendered = await renderOutputs(deck, { outDir, baseDir, pdf, png });
  return { outDir, ...rendered, ms: Date.now() - started };
}
