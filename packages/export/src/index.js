import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireBrowserLock } from './lock.js';

export { acquireBrowserLock };

/**
 * Writers of the renderer's HTML (P2-spec §5): PDF and PNG via puppeteer; PPTX (native, editable boxes) is P5.
 *
 * Both take the HTML from `renderDeckToHtml` and a `basePath`: the directory the HTML's relative asset / font URLs
 * resolve against. The HTML is written to a fresh temporary directory (never into `basePath`: a killed run cannot
 * leave a file next to the caller's assets) with `<base href="file://<basePath>/">` injected at the top of its head,
 * so relative URLs still resolve against `basePath`; the directory is removed afterwards. It is opened with
 * `page.goto(file://…)` - `waitUntil: 'networkidle0'`, 30 s -, then `document.fonts.ready` + image decoding (15 s), at
 * a 1920x1080 viewport. Without `basePath` no base is injected (URLs must then be absolute).
 * Chrome is launched with `--allow-file-access-from-files` (web fonts from file:// pages) and
 * `--font-render-hinting=none` (stable glyph placement), a 60 s protocol timeout (a stuck Chrome fails instead of
 * hanging), under the cross-process Chrome lock (`./lock.js`: one Chrome launched by this package at a time, e.g.
 * across jest workers). Pass `{browser}` to reuse a launched puppeteer browser (no lock taken: its owner holds it, see
 * `withBrowser`). Puppeteer is imported lazily so importing this package stays cheap.
 */

const VIEWPORT = { width: 1920, height: 1080 };
export const TIMEOUTS = Object.freeze({ goto: 30000, fonts: 15000, close: 10000, protocol: 60000 });
export const CHROME_ARGS = Object.freeze(['--allow-file-access-from-files', '--font-render-hinting=none']);

async function launch({ protocolTimeout = TIMEOUTS.protocol } = {}) {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({ headless: true, args: [...CHROME_ARGS], protocolTimeout });
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * `html` with `<base href="file:///…/basePath/">` as the first element of its head (after `<meta charset>` when that
 * opens the head), so every later relative URL - `<link>`, `<img>`, `@font-face` in `<style>` - resolves against
 * `basePath`. A document that already has a `<base>` is returned unchanged; without a `<head>` the tag goes after the
 * doctype (or first).
 */
export function injectBase(html, basePath) {
  const headEnd = html.search(/<\/head>/i);
  if (/<base[\s>]/i.test(headEnd >= 0 ? html.slice(0, headEnd) : html)) return html;
  let href = pathToFileURL(resolve(basePath)).href;
  if (!href.endsWith('/')) href += '/';
  const tag = `<base href="${escapeAttr(href)}">`;
  const head = /<head(?:\s[^>]*)?>(\s*<meta\s+charset=[^>]*>)?/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return html.slice(0, at) + tag + html.slice(at);
}

/** `promise`, or a rejection naming `what` after `ms` (the timer never keeps the process alive). */
function within(promise, ms, what) {
  let timer;
  const t = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`${what} timed out after ${ms} ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

/**
 * Closes a puppeteer browser within `timeoutMs`; when `close()` fails or hangs, kills the Chrome process (SIGKILL)
 * as the last resort. Never throws. Returns 'closed' | 'killed' | 'gone'.
 */
export async function closeBrowser(browser, { timeoutMs = TIMEOUTS.close } = {}) {
  try {
    await within(
      Promise.resolve().then(() => browser.close()),
      timeoutMs,
      'browser.close()',
    );
    return 'closed';
  } catch {
    const pid = browser.process?.()?.pid;
    if (!pid) return 'gone';
    try {
      process.kill(pid, 'SIGKILL');
      return 'killed';
    } catch {
      return 'gone';
    }
  }
}

/**
 * Takes the Chrome lock, launches Chrome, runs `fn(browser)`, then closes Chrome (bounded, killed as the last resort)
 * and releases the lock. The one place this repo's tools launch Chrome for a render (the CLI's `renderOutputs` and its
 * sheets use it). Options: `lock` (acquireBrowserLock options), `launch` (a function returning a browser: tests),
 * `protocolTimeout`.
 */
export async function withBrowser(fn, { lock, launch: launchFn = launch, protocolTimeout } = {}) {
  const release = await acquireBrowserLock(lock);
  let browser = null;
  try {
    browser = await launchFn({ protocolTimeout });
    return await fn(browser);
  } finally {
    if (browser) await closeBrowser(browser);
    release();
  }
}

/**
 * Writes `html` (+ base) into a temporary directory, opens it, runs `fn(page)`, then cleans up (page, own browser,
 * the directory) - on success, on failure and on a timeout alike. An own browser (no `browser` option) is launched
 * through `withBrowser`, so it holds the Chrome lock for the whole call. `timeouts` overrides `TIMEOUTS` (tests);
 * `launch` replaces the puppeteer launch (tests). Exported for tests and for callers that need the page itself.
 */
export async function withPage(
  html,
  { basePath, browser, scale = 1, timeouts, launch: launchFn, lock } = {},
  fn,
) {
  const t = { ...TIMEOUTS, ...timeouts };
  if (!browser) {
    return withBrowser((b) => withPage(html, { basePath, browser: b, scale, timeouts }, fn), {
      lock,
      launch: launchFn,
      protocolTimeout: t.protocol,
    });
  }
  const tmpDir = mkdtempSync(join(tmpdir(), 'pb-export-'));
  const file = join(tmpDir, 'deck.html');
  let page = null;
  try {
    writeFileSync(file, basePath ? injectBase(html, basePath) : html);
    page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0', timeout: t.goto });
    await within(
      page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
        );
      }),
      t.fonts,
      'document.fonts.ready',
    );
    return await fn(page);
  } finally {
    if (page) await within(page.close(), t.close, 'page.close()').catch(() => {});
    rmSync(tmpDir, { recursive: true, force: true });
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
