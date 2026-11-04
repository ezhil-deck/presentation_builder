// The PDF / PNG writers through a real Chrome (puppeteer). The fixture folder is copied to a temporary directory and
// that copy is the export's basePath, so even a run killed mid-export cannot leave a file in the repo; the writer
// itself never writes into basePath (its temporary HTML lives in its own temp dir, with a <base> to basePath).
// Run under `caffeinate -d -u -i` on a Mac (display sleep hangs puppeteer).
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDeckToHtml } from '../../renderer/src/index.js';
import { exportPdf, exportPng, exportPptx, withPage } from '../src/index.js';

const FIXTURES = join(__dirname, '..', '..', 'renderer', '__fixtures__');
const deck = JSON.parse(readFileSync(join(FIXTURES, 'two-slides.deck.json'), 'utf8'));
// Relative URLs, resolved against basePath = (a copy of) the fixture folder.
const html = renderDeckToHtml(deck, { assetBase: 'assets/', fontBase: 'assets/' });

jest.setTimeout(120000);

let out;
let base;
const repoFixtures = readdirSync(FIXTURES).sort();
beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'pb-export-test-'));
  base = mkdtempSync(join(tmpdir(), 'pb-export-base-'));
  cpSync(FIXTURES, base, { recursive: true });
});
afterAll(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(base, { recursive: true, force: true });
});

/** Pages in a PDF: `/Type /Page` objects (not `/Pages`), cross-checked with the page tree `/Count`. */
function pdfPages(buf) {
  const s = buf.toString('latin1');
  const pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return { pages, maxCount: Math.max(0, ...counts) };
}

/** Width / height from a PNG's IHDR chunk. */
function pngSize(buf) {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Runs `fn` while watching `dir` (recursive); resolves to `event:name` for every entry changed meanwhile. */
async function watching(dir, fn) {
  const seen = [];
  const w = watch(dir, { recursive: true }, (event, name) => seen.push(`${event}:${name}`));
  try {
    await fn();
    await new Promise((ok) => setTimeout(ok, 300)); // FSEvents latency
  } finally {
    w.close();
  }
  return seen;
}

describe('@pb/export', () => {
  it('exportPdf writes one page per slide', async () => {
    const file = join(out, 'deck.pdf');
    const res = await exportPdf(html, file, { basePath: base });
    expect(res.file).toBe(file);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdfPages(buf)).toEqual({ pages: 2, maxCount: 2 });
    // no temporary HTML next to the assets
    expect(readdirSync(base).filter((f) => f.startsWith('.pb-export-'))).toEqual([]);
  });

  it('exportPng writes NN.png per slide at 1920x1080', async () => {
    const dir = join(out, 'slides');
    const { files } = await exportPng(html, dir, { basePath: base, scale: 1 });
    expect(files.map((f) => f.slice(dir.length + 1))).toEqual(['01.png', '02.png']);
    for (const f of files) expect(pngSize(readFileSync(f))).toEqual({ width: 1920, height: 1080 });
  });

  it('nothing is written into basePath while an export runs (watched), and the repo fixtures are untouched', async () => {
    const before = readdirSync(base, { recursive: true }).sort();
    const seen = await watching(base, async () => {
      await exportPdf(html, join(out, 'watched.pdf'), { basePath: base });
      await exportPng(html, join(out, 'watched'), { basePath: base });
    });
    // no entry that was not there before (FSEvents may still report the copy's own files: those are not new)
    expect(seen.filter((e) => !before.includes(e.slice(e.indexOf(':') + 1)))).toEqual([]);
    expect(readdirSync(base, { recursive: true }).sort()).toEqual(before);
    expect(readdirSync(FIXTURES).sort()).toEqual(repoFixtures);
    // negative: the watch does see a file written into the folder
    const caught = await watching(base, async () => writeFileSync(join(base, '.probe'), 'x'));
    rmSync(join(base, '.probe'));
    expect(caught.some((e) => e.endsWith('.probe'))).toBe(true);
  });

  it('relative image and font URLs resolve against basePath through the injected <base>', async () => {
    // the @font-face URLs as written (relative), resolved against the document base and read back (sync XHR: file://
    // reads are allowed by --allow-file-access-from-files). The fixture font is a 700-byte stub Chrome's font
    // sanitiser rejects (FontFace status 'error' with the HTML in the folder too), so the font is proven by its URL
    // resolving to the file, the image by painting at its natural size.
    const probe = () => {
      const faces = [...document.styleSheets]
        .flatMap((s) => [...s.cssRules])
        .filter((r) => r instanceof CSSFontFaceRule)
        .map((r) => /url\("?([^")]+)"?\)/.exec(r.style.getPropertyValue('src'))[1]);
      const read = (rel) => {
        const x = new XMLHttpRequest();
        x.open('GET', new URL(rel, document.baseURI).href, false);
        try {
          x.send();
          return x.responseText.length;
        } catch {
          return -1;
        }
      };
      return {
        base: document.baseURI,
        images: [...document.images].map((i) => [i.getAttribute('src'), i.complete, i.naturalWidth]),
        fonts: faces.map((rel) => [rel, read(rel)]),
      };
    };
    const r = await withPage(html, { basePath: base }, (page) => page.evaluate(probe));
    expect(r.base).toBe(`file://${base}/`);
    expect(r.images).toEqual([['assets/photo.png', true, 8]]);
    const size = readFileSync(join(base, 'assets', 'fonts', 'Tiny-Regular.ttf'), 'latin1').length;
    expect(r.fonts).toEqual([
      ['assets/fonts/Tiny-Regular.ttf', size],
      ['assets/fonts/Tiny-Regular.ttf', size],
    ]);
    // negative: without basePath the same relative URLs resolve against the temp folder and nothing loads
    const n = await withPage(html, {}, (page) => page.evaluate(probe));
    expect(n.images).toEqual([['assets/photo.png', true, 0]]);
    expect(n.fonts.map(([, len]) => len)).toEqual([-1, -1]);
  });

  it('exportPptx is a stub until P5', async () => {
    await expect(exportPptx({})).rejects.toThrow('not implemented (P5)');
  });
});
