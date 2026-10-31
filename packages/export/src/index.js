import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Writers of the renderer's HTML (P2-spec §5): PDF and PNG via puppeteer; PPTX (native, editable boxes) is P5.
 *
 * Both take the HTML from `renderDeckToHtml` and a `basePath`: the directory the HTML's relative asset / font URLs
 * resolve against. The HTML is written there under a temporary name (`.pb-export-<pid>-<n>.html`, removed
 * afterwards) and opened with `page.goto(file://…)` - `waitUntil: 'networkidle0'`, then `document.fonts.ready` -
 * at a 1920x1080 viewport. Without `basePath` a temporary directory is used (URLs must then be absolute).
 * Chrome is launched with `--allow-file-access-from-files` (web fonts from file:// pages) and
 * `--font-render-hinting=none` (stable glyph placement). Pass `{browser}` to reuse a launched puppeteer browser.
 * Puppeteer is imported lazily so importing this package stays cheap.
 */

const VIEWPORT = { width: 1920, height: 1080 };
let seq = 0;

async function launch() {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--font-render-hinting=none'],
  });
}

/** Writes `html` into `basePath`, opens it, runs `fn(page)`, then cleans up (file, page, own browser). */
async function withPage(html, { basePath, browser, scale = 1 } = {}, fn) {
  let tmpDir = null;
  const dir = basePath ? resolve(basePath) : (tmpDir = mkdtempSync(join(tmpdir(), 'pb-export-')));
  seq += 1;
  const file = join(dir, `.pb-export-${process.pid}-${seq}.html`);
  writeFileSync(file, html);
  const own = !browser;
  const b = browser ?? (await launch());
  let page = null;
  try {
    page = await b.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
      );
    });
    return await fn(page);
  } finally {
    if (page) await page.close().catch(() => {});
    if (own) await b.close();
    rmSync(file, { force: true });
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * HTML -> one PDF, one slide per page (the HTML's `@page {size: 1920px 1080px; margin: 0}`), print media,
 * backgrounds printed. Returns `{ file }`.
 */
export async function exportPdf(html, outFile, { basePath, browser } = {}) {
  if (typeof html !== 'string' || !outFile) throw new TypeError('exportPdf(html, outFile, {basePath})');
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  await withPage(html, { basePath, browser }, async (page) => {
    await page.emulateMediaType('print');
    await page.pdf({ path: resolve(outFile), printBackground: true, preferCSSPageSize: true });
  });
  return { file: resolve(outFile) };
}

/**
 * HTML -> one PNG per `section.slide`, `outDir/NN.png` (01, 02, ...), 1920x1080 × `scale` (device pixel ratio).
 * The on-screen fit-to-viewport scale is switched off (`html.pb-export`). Returns `{ files }`.
 */
export async function exportPng(html, outDir, { basePath, scale = 1, browser } = {}) {
  if (typeof html !== 'string' || !outDir) throw new TypeError('exportPng(html, outDir, {basePath, scale})');
  mkdirSync(resolve(outDir), { recursive: true });
  return withPage(html, { basePath, browser, scale }, async (page) => {
    await page.evaluate(() => document.documentElement.classList.add('pb-export'));
    const slides = await page.$$('section.slide');
    const files = [];
    for (let i = 0; i < slides.length; i += 1) {
      const file = join(resolve(outDir), `${String(i + 1).padStart(2, '0')}.png`);
      await slides[i].screenshot({ path: file, type: 'png' });
      files.push(file);
    }
    return { files };
  });
}

// eslint-disable-next-line no-unused-vars
export async function exportPptx(deck, { outFile } = {}) {
  throw new Error('exportPptx() is not implemented (P5)');
}
