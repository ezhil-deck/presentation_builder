// An uploaded image exported end to end (docs/P4-spec.md §6, P4.4): a sandbox (golden/brands/stripe + the showcase +
// an empty content/), a content document with an `image` block whose item is an image uploaded through the assets API
// (content/assets/<deck>/<sha12>-<name>), then exportDeck with PNG + PDF through the real puppeteer render. The rule
// (docs/STUDIO.md "Uploads and export"): an uploaded asset is named from the brand folder - the export base, as for
// every brand asset - as ../../../content/assets/…; file:// pages (deck.html, the PDF, the PNGs) resolve it in the
// checkout, the server serves it where a page under /files/ (an exported deck.html) or the Studio (/files/brands/<id>/)
// resolves it. Needs golden/brands/stripe (git-ignored) and Chrome (puppeteer); skipped with the reason otherwise.
// Run under `caffeinate -d -u -i` on a Mac (display sleep hangs puppeteer).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { withBrowser } from '@pb/export';
import puppeteer from 'puppeteer';
import { createServer } from '../server/index.js';
import { createStudio } from '../server/studio.js';

const REPO = resolve(__dirname, '..', '..', '..');
const STRIPE = join(REPO, 'golden', 'brands', 'stripe');
const SHOWCASE = join(REPO, 'golden', 'showcase', 'showcase.md');
const HAS_INPUT = existsSync(join(STRIPE, 'stripe.json')) && existsSync(SHOWCASE);
let chrome = null;
try {
  chrome = process.env.PUPPETEER_SKIP ? null : puppeteer.executablePath();
} catch {
  chrome = null;
}
const HAS_CHROME = Boolean(chrome && existsSync(chrome));
const SKIP = !HAS_INPUT
  ? 'golden/brands/stripe is not present (git-ignored brand input)'
  : !HAS_CHROME
    ? 'no Chrome for puppeteer (PUPPETEER_SKIP set or the browser is not installed)'
    : null;

const MAGENTA = [255, 0, 255];
const CYAN = [0, 255, 255];
/** The uploaded image: 62 × 48, the left half magenta, the right half cyan (a size no brand asset has). */
function twoColourPng() {
  const img = new PNG({ width: 62, height: 48 });
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 62; x += 1) {
      const c = x < 31 ? MAGENTA : CYAN;
      const i = (y * 62 + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

/** A w × h region of a PNG (from x, y) and a solid PNG of the same size: the pixelmatch difference count. */
function regionDiff(png, x, y, w, h, colour) {
  const region = new PNG({ width: w, height: h });
  PNG.bitblt(png, region, x, y, w, h, 0, 0);
  const solid = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i += 1) {
    solid.data.set([...colour, 255], i * 4);
  }
  return pixelmatch(region.data, solid.data, null, w, h, { threshold: 0.1 });
}

if (SKIP) {
  test.skip(`uploaded-asset export end to end - skipped: ${SKIP}`, () => {});
} else {
  describe('an uploaded image exported end to end (real render: PNG, PDF, HTML)', () => {
    let root;
    let studio;
    let server;
    let base;
    let up;
    let slideIndex;
    let elementId;
    let exported;

    beforeAll(async () => {
      root = mkdtempSync(join(tmpdir(), 'pb-studio-export-'));
      mkdirSync(join(root, 'golden', 'brands'), { recursive: true });
      mkdirSync(join(root, 'golden', 'showcase'), { recursive: true });
      symlinkSync(STRIPE, join(root, 'golden', 'brands', 'stripe'));
      writeFileSync(join(root, 'golden', 'showcase', 'showcase.md'), readFileSync(SHOWCASE));
      mkdirSync(join(root, 'content'), { recursive: true });
      studio = createStudio({ root });
      server = createServer({ repoRoot: root, codeRoot: REPO, apiOnly: true, studio });
      await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
      base = `http://127.0.0.1:${server.address().port}`;
      studio.importContent({ from: 'showcase', id: 'deck' });
      // the upload through the API (as the Studio sends it: base64 JSON)
      const res = await fetch(`${base}/api/studio/assets/deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Two Colour.png',
          data: `data:image/png;base64,${twoColourPng().toString('base64')}`,
        }),
      });
      expect(res.status).toBe(200);
      up = await res.json();
      // the document: the cover + the first slide with an image block, its first item the upload
      const doc = studio.readContent('deck');
      delete doc.source;
      delete doc.readOnly;
      const at = doc.slides.findIndex((s) =>
        s.blocks?.some((b) => b.type === 'image' && b.treatment !== 'background'),
      );
      const slides = [doc.slides[0], doc.slides[at]];
      const bi = slides[1].blocks.findIndex((b) => b.type === 'image');
      slides[1].blocks[bi].items[0] = { src: up.file, alt: 'two colours' };
      const r = studio.writeContent('deck', { ...doc, slides }, { brandId: 'stripe' });
      slideIndex = 1;
      const el = r.deck.slides[1].elements.find(
        (e) => e.type === 'image' && e.source?.path === `/blocks/${bi}/items/0/src`,
      );
      elementId = el.id;
      exported = await studio.exportDeck({ brandId: 'stripe', contentId: 'deck', png: true, pdf: true });
    }, 180000);

    afterAll(async () => {
      if (server) await new Promise((ok) => server.close(ok));
      if (root) rmSync(root, { recursive: true, force: true });
    });

    const outDir = () => join(root, exported.outDir);
    const deckJson = () => JSON.parse(readFileSync(join(outDir(), 'deck.json'), 'utf8'));

    it('the upload is saved under content/assets/<deck>/ and the deck names it from the brand folder', () => {
      expect(up.file).toMatch(/^content\/assets\/deck\/[0-9a-f]{12}-two-colour\.png$/);
      expect(up).toMatchObject({ width: 62, height: 48, mime: 'image/png' });
      const el = deckJson().slides[slideIndex].elements.find((e) => e.id === elementId);
      expect(deckJson().assets[el.image.asset]).toMatchObject({ file: `../../../${up.file}`, width: 62 });
      expect(exported.files).toEqual(expect.arrayContaining(['deck.html', 'deck.pdf', 'slides/02.png']));
    });

    it("the exported PNG of the slide shows the uploaded image's pixels in the element's frame", () => {
      const el = deckJson().slides[slideIndex].elements.find((e) => e.id === elementId);
      const png = PNG.sync.read(readFileSync(join(outDir(), 'slides', '02.png')));
      expect([png.width, png.height]).toEqual([1920, 1080]);
      const f = el.frame;
      const cy = Math.round(f.y + f.h / 2) - 8;
      // the left quarter is magenta, the right quarter cyan (a cover crop keeps the halves left and right)
      expect(regionDiff(png, Math.round(f.x + f.w * 0.25) - 8, cy, 16, 16, MAGENTA)).toBe(0);
      expect(regionDiff(png, Math.round(f.x + f.w * 0.75) - 8, cy, 16, 16, CYAN)).toBe(0);
      // negative: the cover slide (no upload) has no magenta there
      const cover = PNG.sync.read(readFileSync(join(outDir(), 'slides', '01.png')));
      expect(regionDiff(cover, Math.round(f.x + f.w * 0.25) - 8, cy, 16, 16, MAGENTA)).toBe(256);
    });

    it('the PDF embeds the image, from the same URL the HTML names (file:// against the export folder)', async () => {
      const pdf = readFileSync(join(outDir(), 'deck.pdf'), 'latin1');
      const widths = [...pdf.matchAll(/\/Subtype \/Image\s*\/Width (\d+)/g)].map((m) => Number(m[1]));
      expect(widths).toContain(62);
      // the deck.html the PDF and the PNGs are printed from: its <img> resolves to the uploaded file
      const html = readFileSync(join(outDir(), 'deck.html'), 'utf8');
      const src = /<img[^>]+src="([^"]*two-colour\.png)"/.exec(html)?.[1];
      expect(src).toBe(`../../../../golden/brands/stripe/../../../${up.file}`);
      const file = fileURLToPath(new URL(src, pathToFileURL(join(outDir(), 'deck.html'))));
      expect(file).toBe(join(root, up.file));
      expect(readFileSync(file)).toEqual(readFileSync(join(root, up.file)));
      // and Chrome loads it from there (print media, as the PDF is made); Chrome through @pb/export (the
      // cross-process Chrome lock, bounded close)
      const sizes = await withBrowser(async (browser) => {
        const page = await browser.newPage();
        await page.emulateMediaType('print');
        await page.goto(pathToFileURL(join(outDir(), 'deck.html')).href, { waitUntil: 'networkidle0' });
        return page.$$eval('img', (imgs) =>
          imgs.filter((i) => i.src.includes('two-colour')).map((i) => [i.complete, i.naturalWidth]),
        );
      });
      expect(sizes).toEqual([[true, 62]]);
    }, 60000);

    it('the server serves the image where the exported deck.html and the Studio resolve it', async () => {
      const page = `${base}/files/out/stripe/studio/deck/deck.html`;
      const html = await (await fetch(page)).text();
      const src = /<img[^>]+src="([^"]*two-colour\.png)"/.exec(html)[1];
      for (const url of [
        new URL(src, page),
        new URL(`../../../${up.file}`, `${base}/files/brands/stripe/`),
      ]) {
        const res = await fetch(url);
        expect([url.pathname, res.status]).toEqual([url.pathname, 200]);
        expect(res.headers.get('content-type')).toMatch(/image\/png/);
        expect(Buffer.from(await res.arrayBuffer())).toEqual(readFileSync(join(root, up.file)));
      }
      // negative: nothing outside content/assets through that route
      const out = await fetch(
        `${base}/files/content/assets/..%2F..%2Fgolden%2Fbrands%2Fstripe%2Fstripe.json`,
      );
      expect(out.status).toBeGreaterThanOrEqual(400);
      // a raw ".." (fetch would normalise it away before sending)
      const raw = await new Promise((ok, fail) => {
        http
          .get(
            {
              host: '127.0.0.1',
              port: server.address().port,
              path: '/files/content/assets/../../golden/brands/stripe/stripe.json',
            },
            (res) => {
              res.resume();
              ok(res.statusCode);
            },
          )
          .on('error', fail);
      });
      expect(raw).toBe(403);
    });

    it('a missing upload is a finding of the assets check, not a silent blank (negative)', () => {
      const abs = join(root, up.file);
      renameSync(abs, `${abs}.gone`);
      try {
        const r = studio.compose({ brandId: 'stripe', contentId: 'deck' });
        const items = r.checks.results.find((x) => x.id === 'assets')?.items ?? [];
        expect(items.some((it) => /two-colour\.png/.test(it.message))).toBe(true);
      } finally {
        renameSync(`${abs}.gone`, abs);
      }
      const ok = studio.compose({ brandId: 'stripe', contentId: 'deck' });
      const again = ok.checks.results.find((x) => x.id === 'assets')?.items ?? [];
      expect(again.filter((it) => /two-colour\.png/.test(it.message))).toEqual([]);
    });
  });
}
