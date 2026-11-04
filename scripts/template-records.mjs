#!/usr/bin/env node
// Hand-authored template records (V1, docs/TEMPLATES.md): every `.slide` of every HTML file in a folder, measured by
// the same pipeline as the catalogue (scripts/catalogue-records.mjs: the slide-anatomy extractor, the pixel pass,
// anatomy.py, packages/templates/src/convert.js), written as template records with provenance `authored`.
// Authoring time only: no AI, nothing here runs in the build. Offline: requests other than file: under the folder,
// data: and about:blank are aborted.
//
//   npm run templates:authored -- <dir> <out.json>      (caffeinate -d -u -i)
//
// The folder is read with its sub-folders (a library: <dir>/<kind>/<name>.html), every slide of every file one deck.
// `.slide` may carry `data-category` (the slide kind the template was written for) and `data-basis` (the measured
// range the composition is grounded in): record `authoredCategory` and `provenance.basis` (template schema v1.1).
//
// The intent marks (data-role, data-need, data-need-optional, data-treatment, data-template, data-option) are read
// from the HTML and NEVER given to a rule: identify() names each element from what is visible, and
//   - an authored role (or treatment) that differs from the identified one becomes a question in the record (the
//     element keeps the identified role; the authored mark stands only once the owner sets verifiedAt, D13);
//   - an authored role / treatment that is not a vocabulary term is an error;
//   - a need outside the capability-key grammar (packages/vocabulary/src/capabilities.js) is an error;
//   - a need (or role) on an element that draws nothing (no object measured for it) names no element: an error.
// Any error: nothing is written, exit 1.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rawObjects } from '../.claude/skills/slide-anatomy/scripts/extract_html.mjs';
import { ROOT, furnitureOf, keepDate, rawRecord, runAnatomy, writeIfChanged } from './catalogue-records.mjs';
import { stringifyRecords } from '../packages/templates/src/convert.js';
import { authoredTemplate, validateTemplate } from '../packages/templates/src/index.js';

const VIEW = { width: 1920, height: 1080, deviceScaleFactor: 1 };

/** Runs in the page: every element carrying an intent mark, with its box (% of its slide). */
function markedElements(slide) {
  const S = slide.getBoundingClientRect();
  return [...slide.querySelectorAll('[data-role], [data-need], [data-treatment]')].map((e) => {
    const r = e.getBoundingClientRect();
    return {
      tag: e.tagName.toLowerCase(),
      cls: typeof e.className === 'string' ? e.className : '',
      role: e.dataset.role ?? null,
      need: e.dataset.need ?? null,
      needOptional: e.hasAttribute('data-need-optional'),
      treatment: e.dataset.treatment ?? null,
      bbox: [
        ((r.left - S.left) / S.width) * 100,
        ((r.top - S.top) / S.height) * 100,
        ((r.right - S.left) / S.width) * 100,
        ((r.bottom - S.top) / S.height) * 100,
      ],
    };
  });
}

async function measureFolder(dir, work) {
  const { default: puppeteer } = await import('puppeteer');
  // every .html in the folder and its sub-folders (a library groups its templates by kind: authored/<kind>/<name>.html)
  const files = readdirSync(dir, { recursive: true })
    .map((f) => String(f).split(sep).join('/'))
    .filter((f) => f.endsWith('.html'))
    .sort();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    args: ['--font-render-hinting=none'],
  });
  const out = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEW);
    await page.setRequestInterception(true);
    const base = pathToFileURL(resolve(dir)).href;
    page.on('request', (req) => {
      const url = req.url();
      if (url === 'about:blank' || url.startsWith('data:') || url.startsWith(base)) req.continue();
      else req.abort();
    });
    for (const f of files) {
      await page.goto(pathToFileURL(resolve(dir, f)).href, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await Promise.all([...document.fonts].map((x) => x.load().catch(() => null)));
        await document.fonts.ready;
      });
      const slides = await page.$$('.slide');
      for (const [k, el] of slides.entries()) {
        const attrs = await el.evaluate((s) => ({
          template: s.dataset.template ?? null,
          option: s.dataset.option ?? null,
          category: s.dataset.category ?? null,
          basis: s.dataset.basis ?? null,
        }));
        const d = join(work, `${f.replace(/\.html$/, '').replace(/\//g, '-')}-${k + 1}`);
        mkdirSync(d, { recursive: true });
        const measured = await el.evaluate(rawObjects, { marks: true });
        const marked = await el.evaluate(markedElements);
        const png = join(d, 'render.png');
        await el.screenshot({ path: png });
        out.push({ file: f, index: k, dir: d, attrs, measured, marked, png });
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}

async function main() {
  const [dirArg, outArg] = process.argv.slice(2);
  if (!dirArg || !outArg) {
    console.error('usage: node scripts/template-records.mjs <dir> <out.json>');
    process.exit(1);
  }
  const dir = resolve(dirArg);
  const outFile = resolve(outArg);
  const work = join(ROOT, 'out/_template-records', basename(dir));
  const t0 = Date.now();
  const slides = await measureFolder(dir, work);
  const errors = [];
  const raws = [];
  for (const s of slides) {
    const where = `${s.file} slide ${s.index + 1}`;
    if (s.measured.w !== 1920 || s.measured.h !== 1080)
      errors.push(`${where}: the slide is ${s.measured.w} x ${s.measured.h}, not 1920 x 1080`);
    if (!s.attrs.template) errors.push(`${where}: no data-template id`);
    const raw = rawRecord(
      {
        kind: 'html',
        file: relative(ROOT, join(dir, s.file)),
        selector: '.slide',
        index: s.index,
        exact: true,
      },
      s.measured,
      s.png,
    );
    // the convention's visible structure: a field's text carries its block and item (data-c, data-i)
    for (const o of raw.objects)
      if (o.kind === 'text' && o.marks?.f !== undefined) {
        o.block = o.marks.c;
        o.item = o.marks.i ?? null;
      }
    // every marked element must have drawn an object carrying its marks
    for (const m of s.marked) {
      const hit = raw.objects.some(
        (o) =>
          o.authored &&
          (o.authored.role ?? null) === m.role &&
          (o.authored.need ?? null) === m.need &&
          o.bbox.every((v, i) => Math.abs(v - m.bbox[i]) < 0.6 || o.kind === 'text'),
      );
      if (!hit)
        errors.push(
          `${where}: <${m.tag} class="${m.cls}"> ${m.need ? `data-need="${m.need}"` : `data-role="${m.role}"`} ` +
            'names no element: it draws nothing the measurement sees (no fill, border, image or text of its own)',
        );
    }
    raws.push(raw);
    writeIfChanged(join(s.dir, 'raw.json'), JSON.stringify(raw, null, 1));
  }
  const deckFile = join(work, 'deck.json');
  writeIfChanged(deckFile, JSON.stringify({ furniture: furnitureOf(raws) }, null, 1));
  runAnatomy(work, deckFile, 4);

  const groups = new Map();
  for (const s of slides) {
    const id = s.attrs.template ?? `${basename(s.file, '.html')}-${s.index + 1}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(s);
  }
  const records = [];
  const questions = [];
  slides.forEach((s, k) => {
    const id = s.attrs.template ?? 'unnamed';
    const recId = s.attrs.option ? `${id}~${s.attrs.option}` : id;
    const options = (groups.get(id) || [])
      .filter((o) => o !== s)
      .map((o) => ({ kind: o.attrs.option || 'base', ref: o.attrs.option ? `${id}~${o.attrs.option}` : id }));
    const record = JSON.parse(readFileSync(join(s.dir, 'record.json'), 'utf8'));
    const { template, errors: errs } = authoredTemplate({
      id: recId,
      record,
      raw: raws[k],
      file: relative(ROOT, join(dir, s.file)),
      options,
      measuredAt: '0000-00-00',
      category: s.attrs.category ?? undefined,
      basis: s.attrs.basis ?? undefined,
    });
    errors.push(...errs.map((e) => `${s.file} slide ${s.index + 1}: ${e}`));
    // every data-need written must reach the record: an element the anatomy pass hides (covered by another) names
    // nothing, and its need would be lost silently
    if (template)
      for (const m of s.marked)
        if (m.need && !template.needs.some((n) => n.key === m.need))
          errors.push(
            `${s.file} slide ${s.index + 1}: data-need="${m.need}" reaches no element of the record (the element is hidden behind another): draw it above, or on the element that shows`,
          );
    if (template) {
      records.push(template);
      for (const q of template.questions || [])
        questions.push(`${recId} ${q.element}: authored ${q.authored}, identified ${q.identified}`);
    }
  });
  if (!errors.length)
    for (const r of records) {
      const v = validateTemplate(r);
      if (!v.valid) errors.push(...v.errors.map((e) => `${r.id}: ${e}`));
    }
  if (errors.length) {
    for (const e of errors) console.error(`  ${e}`);
    console.error(`template records: ${errors.length} error(s); nothing written`);
    process.exit(1);
  }
  const measuredAt = keepDate(outFile, records);
  for (const r of records) r.provenance.measuredAt = measuredAt;
  writeFileSync(
    outFile,
    stringifyRecords(records, { generator: 'scripts/template-records.mjs', folder: relative(ROOT, dir) }),
  );
  const agree = records.reduce(
    (n, r) => n + r.elements.filter((e) => e.authored?.role && e.authored.role === e.role).length,
    0,
  );
  const authored = records.reduce((n, r) => n + r.elements.filter((e) => e.authored?.role).length, 0);
  console.log(
    `template records: ${records.length} records from ${slides.length} slides -> ${outFile} (${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );
  console.log(
    `template records: authored roles ${agree} / ${authored} agree with identify(); ${questions.length} question(s)`,
  );
  for (const q of questions) console.log(`  question: ${q}`);
  for (const r of records)
    console.log(
      `  ${r.id}: ${r.category}, ${r.elements.length} elements, needs ${r.needs.map((n) => n.key + (n.optional ? '?' : '')).join(' ') || '-'}` +
        `, device ${r.intent.device ? r.intent.device.id : '-'}, image ${r.intent.image ? `${r.intent.image.id} ${r.intent.image.treatment}` : '-'}` +
        `, emphasis ${r.intent.emphasis.carrier ?? '-'}`,
    );
  if (!existsSync(outFile)) process.exit(1);
}

if (process.argv[1] && basename(process.argv[1]) === 'template-records.mjs')
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
