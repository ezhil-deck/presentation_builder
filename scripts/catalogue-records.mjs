#!/usr/bin/env node
// The catalogue template records (V1, docs/PLAN-template-library.md §2): every one of the Rich Slide Catalogue's 1,646
// slides measured by the slide-anatomy pipeline and written in the vocabulary as a template record
// (schemas/template.schema.json) -> packages/templates/data/catalogue.json. Authoring time only: no AI, nothing here
// runs in the build.
//
//   npm run templates:catalogue     (caffeinate -d -u -i: display sleep hangs puppeteer on the owner's machine)
//
// 1. Measure (one page load per worker, as scripts/catalogue-geometry.mjs; requests other than about:blank / data:
//    aborted): each slide alone in #host at 1920 x 1080 -> the raw object list (the slide-anatomy extractor,
//    extract_html.mjs rawObjects, with the catalogue's marks) + render.png in out/_catalogue-records/<id>/
//    (git-ignored).
// 2. The visible structure the answer key also reads (packages/vocabulary/src/catalogue.js): a text of a marked field
//    carries its block and item (`data-c`, `data-i`; never `data-f` / `data-type`) and the field's visible measures
//    (blockCover, blockDataLabels, cells, subTexts); an unmarked text repeated at the head of a container's items (the
//    geometry's numeral: same tag class and size) is `itemHead`. Furniture = the objects repeated at one spot on 40 %
//    of the slides or more (anatomy's signature, as batch.py does for a deck).
// 3. The pixel pass and anatomy (slide-anatomy records_batch.py: extract_image.py --raw, anatomy.analyse) -> record.json.
// 4. The template record (packages/templates/src/convert.js): roles, category, zones, margins, edges, rhythm, hierarchy,
//    balance, intent; no needs (a catalogue record is a composition only); no text (word counts only).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { readCataloguePage, shellHtml, VIEWPORT } from './catalogue-geometry.mjs';
import { finishObjects, rawObjects } from '../.claude/skills/slide-anatomy/scripts/extract_html.mjs';
import {
  catalogueFurniture,
  readCatalogueText,
  slideSubjects,
} from '../packages/vocabulary/src/catalogue.js';
import { vocabulary } from '../packages/vocabulary/src/index.js';
import { compilePattern } from '../packages/vocabulary/src/identify.js';
import { canonical, stringifyRecords, toTemplate } from '../packages/templates/src/convert.js';

export const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
export const SKILL_SCRIPTS = join(ROOT, '.claude/skills/slide-anatomy/scripts');
const PAGES = Number(process.env.PB_PAGES || 4);

/* --------------------------------------------------------------------------------------------- shared helpers */

/** anatomy.py signature(): kind | text (a page number as #, digit runs as #) | x % | y %. */
export function signature(o) {
  const pagenum = compilePattern(vocabulary().patterns.pagenum);
  const tx = o.text || '';
  const t = pagenum.test(tx || 'x') ? '#' : tx.replace(/\d+/g, '#').slice(0, 24);
  return `${o.kind}|${t}|${Math.round(o.bbox[0])}|${Math.round(o.bbox[1])}`;
}

/** The furniture of a set of slides (anatomy's rule, batch.py): an object under 9 % of the slide repeated at one spot
 * on >= 40 % of them (and at least 3). */
export function furnitureOf(raws) {
  const n = raws.length;
  const count = new Map();
  for (const raw of raws) {
    const seen = new Set();
    for (const o of raw.objects) {
      const b = o.bbox;
      if ((b[2] - b[0]) * (b[3] - b[1]) >= 900) continue;
      seen.add(signature(o));
    }
    for (const s of seen) count.set(s, (count.get(s) || 0) + 1);
  }
  return [...count]
    .filter(([, k]) => n >= 4 && k >= Math.max(3, 0.4 * n))
    .map(([s]) => s)
    .sort();
}

/** The raw.json of one measured slide. */
export function rawRecord(source, measured, renderFile) {
  return {
    source,
    slide: { w: measured.w, h: measured.h, unit: 'css px', aspect: +(measured.w / measured.h).toFixed(3) },
    render: renderFile,
    objects: finishObjects(measured.objs),
  };
}

/** Runs the pixel pass + anatomy over every folder of `dir` (python3, the slide-anatomy skill). */
export function runAnatomy(dir, deckFile, workers = 8, only = null) {
  const r = spawnSync(
    'python3',
    [
      join(SKILL_SCRIPTS, 'records_batch.py'),
      dir,
      '--deck',
      deckFile,
      '--workers',
      String(workers),
      ...(only ? ['--only', [...only].join(',')] : []),
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error(`records_batch.py failed (exit ${r.status})`);
}

/** Writes a file only when its content changes (its time then tells the anatomy pass what is stale). */
export function writeIfChanged(file, body) {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== body) writeFileSync(file, body);
}

/** sha256 of a file, hex. */
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The date to record: kept from the previous output while its records did not change (no churn on a re-run).
 * `records` carry any placeholder date. */
export function keepDate(outFile, records) {
  const today = new Date().toISOString().slice(0, 10);
  if (!existsSync(outFile)) return today;
  try {
    const prev = JSON.parse(readFileSync(outFile, 'utf8')).records;
    const at = prev?.[0]?.provenance?.measuredAt;
    const norm = (rs) =>
      stringifyRecords(rs.map((r) => ({ ...r, provenance: { ...r.provenance, measuredAt: '0000-00-00' } })));
    return at && norm(prev) === norm(records) ? at : today;
  } catch {
    return today; // an unreadable previous file: a new date
  }
}

/* --------------------------------------------------------------------------------------------- the catalogue */

/** Adds the visible structure of the catalogue convention to one slide's raw objects (see the header, step 2). */
export function enrichCatalogue(objects, id, geometry, text, furniture) {
  const g = geometry.slides[id];
  if (g.section === 'plan') {
    const { elements, answers } = slideSubjects(id, geometry, text, furniture);
    const byField = new Map();
    answers.forEach((a, k) => {
      if (a.field) byField.set(`${a.c}.${a.field}.${a.i ?? ''}`, elements[k]);
    });
    for (const o of objects) {
      const m = o.marks;
      if (o.kind !== 'text' || !m || m.f === undefined) continue;
      const s = byField.get(`${m.c}.${m.f}.${m.i ?? ''}`);
      o.block = m.c;
      o.item = m.i ?? null;
      if (!s) continue;
      for (const k of ['blockCover', 'blockDataLabels', 'cells', 'subTexts'])
        if (s[k] !== undefined) o[k] = s[k];
    }
  }
  for (const c of g.containers || []) {
    if (!c.numeral) continue;
    const E = c.extent || c.box;
    const ext = [E.x / 19.2, E.y / 10.8, (E.x + E.w) / 19.2, (E.y + E.h) / 10.8];
    for (const o of objects) {
      if (o.kind !== 'text' || o.marks?.f !== undefined) continue;
      const b = o.bbox;
      const inside =
        b[0] >= ext[0] - 0.5 && b[1] >= ext[1] - 0.5 && b[2] <= ext[2] + 0.5 && b[3] <= ext[3] + 0.5;
      if (inside && (o.cls || '') === (c.numeral.class || '') && Math.abs(o.pt - c.numeral.fontSize) < 0.5)
        o.itemHead = true;
    }
  }
  return objects;
}

async function measureCatalogue(figures, shell, outDir, onProgress) {
  const { default: puppeteer } = await import('puppeteer');
  // one browser per worker: element screenshots of several pages in one browser hang (a page in the background)
  const browsers = [];
  const results = new Array(figures.length);
  let next = 0;
  let done = 0;
  try {
    const open = async () => {
      const browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 60000,
        args: ['--allow-file-access-from-files', '--font-render-hinting=none'],
      });
      browsers.push(browser);
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url === 'about:blank' || url.startsWith('data:')) req.continue();
        else req.abort();
      });
      await page.setContent(shell, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
        await document.fonts.ready;
      });
      return page;
    };
    const pages = await Promise.all(Array.from({ length: PAGES }, open));
    await Promise.all(
      pages.map(async (page) => {
        while (next < figures.length) {
          const i = next;
          next += 1;
          const { id, html } = figures[i];
          await page.evaluate(async (h) => {
            document.getElementById('host').innerHTML = h;
            await document.fonts.ready;
          }, html);
          const el = await page.$('#host > .slide');
          const dir = join(outDir, id);
          mkdirSync(dir, { recursive: true });
          if (process.env.PB_TRACE) console.log(`measuring ${id}`);
          const measured = await el.evaluate(rawObjects, { marks: true });
          const png = join(dir, 'render.png');
          await el.screenshot({ path: png });
          results[i] = { id, dir, measured, png };
          done += 1;
          onProgress(done);
        }
      }),
    );
  } finally {
    await Promise.all(browsers.map((b) => b.close()));
  }
  return results;
}

async function main() {
  const t0 = Date.now();
  const src = join(ROOT, 'golden/catalogue/rich-slide-catalogue.html');
  const outDir = join(ROOT, 'out/_catalogue-records');
  const outFile = join(ROOT, 'packages/templates/data/catalogue.json');
  const rawHtml = readFileSync(src, 'utf8');
  const index = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/index.json'), 'utf8'));
  const geometry = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/geometry.json'), 'utf8'));
  const layouts = JSON.parse(
    readFileSync(join(ROOT, 'packages/layouts/data/catalogue-layouts.json'), 'utf8'),
  );
  const catalogueSha = sha256(rawHtml);
  if (index.source.sha256 !== catalogueSha || geometry.source.sha256 !== catalogueSha)
    throw new Error('catalogue: index.json / geometry.json were read from another version of the HTML');
  const geometryHash = sha256(JSON.stringify(geometry.slides)).slice(0, 16);
  const layoutOf = new Map(layouts.records.map((r) => [r.catalogue, r.id]));

  const skipMeasure = process.argv.includes('--reuse');
  const page = readCataloguePage(rawHtml);
  // --only id,id: measure and convert those slides only, print them, write nothing to packages/ (a dry run)
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
  if (only) {
    page.figures = page.figures.filter((f) => only.has(f.id));
    index.slides = index.slides.filter((s) => only.has(s.id));
  }
  let measuredList;
  if (!skipMeasure) {
    measuredList = await measureCatalogue(page.figures, shellHtml(page), outDir, (n) => {
      if (n % 200 === 0 || n === page.figures.length)
        console.log(
          `catalogue records: measured ${n} / ${page.figures.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
        );
    });
  }
  const tMeasure = Date.now();

  // the visible structure, the furniture, raw.json per slide
  const text = readCatalogueText(rawHtml, geometry.rootDataset.brand);
  const answerFurniture = catalogueFurniture(geometry, text);
  const raws = [];
  for (const [k, f] of page.figures.entries()) {
    const dir = join(outDir, f.id);
    let raw;
    if (skipMeasure) raw = JSON.parse(readFileSync(join(dir, 'raw.json'), 'utf8'));
    else {
      const m = measuredList[k];
      raw = rawRecord(
        {
          kind: 'html',
          file: 'golden/catalogue/rich-slide-catalogue.html',
          selector: `figure#${f.id} .slide`,
          index: 0,
          exact: true,
        },
        m.measured,
        m.png,
      );
      enrichCatalogue(raw.objects, f.id, geometry, text, answerFurniture);
    }
    raws.push(raw);
  }
  // the furniture is a property of the whole set: a dry run reads the full run's deck.json when there is one
  const furniture =
    only && existsSync(join(outDir, 'deck.json'))
      ? JSON.parse(readFileSync(join(outDir, 'deck.json'), 'utf8')).furniture
      : furnitureOf(raws);
  const deckFile = join(outDir, only ? 'deck-only.json' : 'deck.json');
  writeIfChanged(deckFile, JSON.stringify({ furniture }, null, 1));
  if (!skipMeasure)
    page.figures.forEach((f, k) => {
      const file = join(outDir, f.id, 'raw.json');
      // keep raw.json's time when nothing changed, so the anatomy pass skips it
      writeIfChanged(file, JSON.stringify(raws[k], null, 1));
    });
  console.log(`catalogue records: furniture signatures ${furniture.length}`);

  runAnatomy(outDir, deckFile, 8, only);
  const tAnatomy = Date.now();

  const records = [];
  const failures = [];
  for (const [k, s] of index.slides.entries()) {
    const dir = join(outDir, s.id);
    try {
      const rec = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
      records.push(
        toTemplate({
          id: s.id,
          record: rec,
          raw: raws[k],
          source: {
            kind: 'catalogue',
            ref: s.id,
            ...(layoutOf.has(s.id) ? { layout: layoutOf.get(s.id) } : {}),
          },
          shapeCode: s.section === 'shapes' ? s.code : null,
          composition: true,
          provenance: { source: 'catalogue', measuredAt: 'x', exact: true, verifiedAt: null },
        }),
      );
    } catch (e) {
      failures.push(`${s.id}: ${e.message}`);
    }
  }
  if (failures.length) {
    for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
    throw new Error(`catalogue records: ${failures.length} slide(s) failed`);
  }
  if (only) {
    for (const r of records) console.log(JSON.stringify(canonical(r)));
    return;
  }
  const measuredAt = keepDate(outFile, records);
  for (const r of records) r.provenance.measuredAt = measuredAt;
  const fileSource = {
    catalogue: 'golden/catalogue/rich-slide-catalogue.html',
    generator: 'scripts/catalogue-records.mjs',
    geometryHash,
    sha256: catalogueSha,
  };
  mkdirSync(dirname(outFile), { recursive: true });
  const out = stringifyRecords(records, fileSource);
  writeFileSync(outFile, out);

  // the report
  const tally = (fn) => {
    const t = {};
    for (const r of records) for (const k of [fn(r)].flat()) t[k] = (t[k] ?? 0) + 1;
    return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  };
  console.log(
    `catalogue records: ${records.length} records -> ${outFile} (${(statSync(outFile).size / 1e6).toFixed(2)} MB)`,
  );
  console.log(`catalogue records: categories ${JSON.stringify(tally((r) => r.category))}`);
  console.log(
    `catalogue records: time measure ${((tMeasure - t0) / 1000).toFixed(0)} s, anatomy ${((tAnatomy - tMeasure) / 1000).toFixed(0)} s, ` +
      `convert ${((Date.now() - tAnatomy) / 1000).toFixed(0)} s`,
  );
}

if (process.argv[1] && basename(process.argv[1]) === 'catalogue-records.mjs')
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
