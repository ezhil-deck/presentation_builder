import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDeckToHtml } from '../../renderer/src/index.js';
import { exportPdf, exportPng, exportPptx } from '../src/index.js';

const FIXTURES = join(__dirname, '..', '..', 'renderer', '__fixtures__');
const deck = JSON.parse(readFileSync(join(FIXTURES, 'two-slides.deck.json'), 'utf8'));
// Relative URLs, resolved against basePath = the fixture folder.
const html = renderDeckToHtml(deck, { assetBase: 'assets/', fontBase: 'assets/' });

jest.setTimeout(120000);

let out;
beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'pb-export-test-'));
});
afterAll(() => rmSync(out, { recursive: true, force: true }));

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

describe('@pb/export', () => {
  it('exportPdf writes one page per slide', async () => {
    const file = join(out, 'deck.pdf');
    const res = await exportPdf(html, file, { basePath: FIXTURES });
    expect(res.file).toBe(file);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdfPages(buf)).toEqual({ pages: 2, maxCount: 2 });
    // the temporary HTML next to the assets is removed
    expect(readdirSync(FIXTURES).filter((f) => f.startsWith('.pb-export-'))).toEqual([]);
  });

  it('exportPng writes NN.png per slide at 1920x1080', async () => {
    const dir = join(out, 'slides');
    const { files } = await exportPng(html, dir, { basePath: FIXTURES, scale: 1 });
    expect(files.map((f) => f.slice(dir.length + 1))).toEqual(['01.png', '02.png']);
    for (const f of files) expect(pngSize(readFileSync(f))).toEqual({ width: 1920, height: 1080 });
  });

  it('exportPptx is a stub until P5', async () => {
    await expect(exportPptx({})).rejects.toThrow('not implemented (P5)');
  });
});
