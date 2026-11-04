// The Studio server's P4.3 parts (docs/P4-spec.md §3, §6): the image upload (content/assets/<deck>/, images only,
// ≤ 20 MB), uploaded images in a composed deck (named from the brand folder, sized for a focal crop), charts / tables
// laid out again for a frame override, and the deck-level font pair. Against golden/brands/stripe (git-ignored: the
// suite is skipped without it, as studio-server.test.js); the font pair with a fixture Mood that has a pair (no
// golden brand defines one).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deriveBrand } from '@pb/cli';
import { PNG } from 'pngjs';
import { createServer } from '../server/index.js';
import { imageSize } from '../server/imageSize.js';
import { ASSET_LIMIT, createStudio, normalizeHistory, normalizeOverrides } from '../server/studio.js';

const REPO = resolve(__dirname, '..', '..', '..');
const STRIPE = join(REPO, 'golden', 'brands', 'stripe');
const SHOWCASE = join(REPO, 'golden', 'showcase', 'showcase.md');
const HAS_INPUT = existsSync(join(STRIPE, 'stripe.json')) && existsSync(SHOWCASE);
const describeInput = HAS_INPUT ? describe : describe.skip;

const png = (width, height) => PNG.sync.write(new PNG({ width, height }));

describe('P4.3 helpers (no brand input needed)', () => {
  it('normalizeOverrides keeps a font pair id; a bad one is 400 (negative)', () => {
    expect(normalizeOverrides({ slides: {}, fontPair: 'serif' })).toEqual({ slides: {}, fontPair: 'serif' });
    expect(normalizeOverrides({ slides: {}, fontPair: null })).toEqual({ slides: {} });
    expect(() => normalizeOverrides({ slides: {}, fontPair: 3 })).toThrow(/fontPair/);
    expect(() => normalizeOverrides({ slides: {}, elements: { a: { fit: 'tile' } } })).toThrow(/fit/);
  });

  it('a command log may carry a font pair patch (an id or null); anything else is refused (negative)', () => {
    const h = normalizeHistory({
      commands: [{ type: 'fontPair', args: { fontPair: 'serif' }, inverse: { fontPair: null } }],
    });
    expect(h.commands[0].args).toEqual({ fontPair: 'serif' });
    expect(() =>
      normalizeHistory({ commands: [{ type: 'fontPair', args: { fontPair: 1 }, inverse: {} }] }),
    ).toThrow(/fontPair/);
  });

  it('imageSize reads PNG / GIF / JPEG / WebP / SVG headers; another type or a renamed file is null', () => {
    expect(imageSize(png(400, 300), 'png')).toEqual({ width: 400, height: 300 });
    const gif = Buffer.from('GIF89a\x10\x00\x20\x00', 'latin1');
    expect(imageSize(gif, 'gif')).toEqual({ width: 16, height: 32 });
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40,
      0x03,
    ]);
    expect(imageSize(jpeg, 'jpg')).toEqual({ width: 64, height: 48 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'latin1');
    webp.write('WEBPVP8X', 8, 'latin1');
    webp.writeUIntLE(99, 24, 3);
    webp.writeUIntLE(49, 27, 3);
    expect(imageSize(webp, 'webp')).toEqual({ width: 100, height: 50 });
    expect(imageSize(Buffer.from('<svg viewBox="0 0 120 60"></svg>'), 'svg')).toEqual({
      width: 120,
      height: 60,
    });
    expect(imageSize(Buffer.from('<svg width="10px" height="20"/>'), 'svg')).toEqual({
      width: 10,
      height: 20,
    });
    // negative: an executable named .png, an unknown type
    expect(imageSize(Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'), 'png')).toBeNull();
    expect(imageSize(png(4, 4), 'exe')).toBeNull();
  });
});

describeInput('P4.3 on the Studio API (golden/brands/stripe)', () => {
  let root;
  let server;
  let base;
  let studio;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pb-studio-p43-'));
    mkdirSync(join(root, 'golden', 'brands'), { recursive: true });
    mkdirSync(join(root, 'golden', 'showcase'), { recursive: true });
    symlinkSync(STRIPE, join(root, 'golden', 'brands', 'stripe'));
    writeFileSync(join(root, 'golden', 'showcase', 'showcase.md'), readFileSync(SHOWCASE));
    mkdirSync(join(root, 'content'), { recursive: true });
    studio = createStudio({ root });
    server = createServer({ repoRoot: root, apiOnly: true, studio });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
    studio.importContent({ from: 'showcase', id: 'deck' });
  });

  afterAll(async () => {
    await new Promise((ok) => server.close(ok));
    rmSync(root, { recursive: true, force: true });
  });

  const send = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const doc = () => {
    const d = studio.readContent('deck');
    delete d.source;
    delete d.readOnly;
    return d;
  };

  it('POST /api/studio/assets/:deck saves an image under content/assets/<deck>/ and answers its size', async () => {
    const bytes = png(400, 300);
    const r = await send('POST', '/api/studio/assets/deck', {
      name: 'Team Photo.PNG',
      data: `data:image/png;base64,${bytes.toString('base64')}`,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ width: 400, height: 300, size: bytes.length, mime: 'image/png' });
    expect(r.body.file).toMatch(/^content\/assets\/deck\/[0-9a-f]{12}-team-photo\.png$/);
    expect(readFileSync(join(root, r.body.file))).toEqual(bytes);
    // served where the deck (named from the brand folder) resolves it in the browser
    const res = await fetch(`${base}/${r.body.file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/png/);
  });

  it('refuses an .exe, an executable named .png, an empty file and a Markdown deck (negative)', async () => {
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00', 'latin1').toString('base64');
    const a = await send('POST', '/api/studio/assets/deck', { name: 'setup.exe', data: exe });
    expect(a.status).toBe(400);
    expect(a.body.error).toMatch(/not an image/);
    const b = await send('POST', '/api/studio/assets/deck', { name: 'photo.png', data: exe });
    expect(b.status).toBe(400);
    expect(b.body.error).toMatch(/not a readable png/);
    expect((await send('POST', '/api/studio/assets/deck', { name: 'x.png', data: '' })).status).toBe(400);
    const md = await send('POST', '/api/studio/assets/showcase', { name: 'x.png', data: exe });
    expect(md.status).toBe(409);
    expect((await send('POST', '/api/studio/assets/ghost', { name: 'x.png', data: exe })).status).toBe(404);
    expect(existsSync(join(root, 'content', 'assets', 'showcase'))).toBe(false);
  });

  it('refuses an image over 20 MB with 413 (negative)', async () => {
    const big = Buffer.alloc(ASSET_LIMIT + 1);
    png(10, 10).copy(big, 0);
    const r = await send('POST', '/api/studio/assets/deck', {
      name: 'huge.png',
      data: big.toString('base64'),
    });
    expect(r.status).toBe(413);
    expect(r.body.error).toMatch(/up to 20 MB/);
  });

  it('a composed deck names an uploaded image from the brand folder, with its size; a focal point crops it', () => {
    const up = studio.uploadAsset('deck', { name: 'wide.png', data: png(800, 200) });
    const d = doc();
    const at = d.slides.findIndex((s) => s.blocks?.[0]?.type === 'compare');
    d.slides[at].blocks[0].columns[0].image = up.file;
    const img = d.slides.findIndex((s) =>
      s.blocks?.some((b) => b.type === 'image' && b.treatment !== 'background'),
    );
    const bi = d.slides[img].blocks.findIndex((b) => b.type === 'image');
    d.slides[img].blocks[bi].items[0] = { src: up.file, focal: { x: 0.1, y: 0.5 } };
    const r = studio.writeContent('deck', d, { brandId: 'stripe' });
    const cmp = r.deck.slides[at].elements.find((e) => e.id.endsWith('-compare-0-image'));
    expect(cmp.source.path).toBe('/blocks/0/columns/0/image');
    expect(r.deck.assets[cmp.image.asset]).toMatchObject({
      file: `../../../${up.file}`,
      width: 800,
      height: 200,
    });
    // the asset check finds the uploaded files (they are the deck's, not missing brand files)
    const assets = r.checks.results.find((x) => x.id === 'assets');
    expect((assets?.items ?? []).filter((it) => /content\/assets/.test(it.message))).toEqual([]);
    const photo = r.deck.slides[img].elements.find(
      (e) => e.type === 'image' && e.source?.path?.endsWith('/src'),
    );
    expect(photo.image.focal).toEqual({ x: 0.1, y: 0.5 });
    expect(photo.image.crop.x).toBe(0); // the focal point is near the left edge: the crop starts there
    expect(photo.image.crop.w).toBeLessThan(1);
  });

  it('compose lays a resized chart / table out again (no "moved, not resized" note)', () => {
    const r0 = studio.compose({ brandId: 'stripe', contentId: 'deck', checks: false });
    const chart = r0.deck.slides.flatMap((s) => s.elements).find((e) => e.type === 'chart');
    const table = r0.deck.slides.flatMap((s) => s.elements).find((e) => e.type === 'table');
    const r = studio.compose({
      brandId: 'stripe',
      contentId: 'deck',
      checks: false,
      overrides: {
        slides: {},
        elements: {
          [chart.id]: { frame: { ...chart.frame, w: 800, h: 450 } },
          [table.id]: { frame: { ...table.frame, w: 1000 } },
        },
      },
    });
    const els = r.deck.slides.flatMap((s) => s.elements);
    const c = els.find((e) => e.id === chart.id);
    const t = els.find((e) => e.id === table.id);
    expect(c.frame).toMatchObject({ w: 800, h: 450 });
    expect(c.chart.geometry.plot.w).toBeLessThan(800);
    expect(t.frame.w).toBe(1000);
    expect(Math.round(t.table.colWidths.reduce((a, b) => a + b, 0))).toBe(1000);
    expect(r.warnings.some((w) => /not resized/.test(w.message))).toBe(false);
  });

  it('the font pair: one of the brand pairs swaps the faces before compose; an unknown one keeps the brand pair', async () => {
    // a fixture Mood with a pair (stripe's mono face as headings), the brand's input otherwise as derived
    const paired = createStudio({
      root,
      derive: (dir, opts) => {
        const d = deriveBrand(dir, opts);
        if (d.mood) d.mood.type.pairs = [{ id: 'mono-heads', heading: 'mono', body: 'body' }];
        return d;
      },
    });
    const summary = paired.brandSummary('stripe');
    expect(summary.fontPairs).toEqual([
      expect.objectContaining({ id: 'mono-heads', heading: 'mono', body: 'body' }),
    ]);
    expect(studio.brandSummary('stripe').fontPairs).toEqual([]); // the brand defines one pair
    const mono = summary.fontPairs[0].headingFamily;
    const plain = paired.compose({ brandId: 'stripe', contentId: 'deck', checks: false });
    const title = (r) => r.deck.slides[1].elements.find((e) => e.id === 's2-title');
    expect(title(plain).text.font.family).not.toBe(mono);
    const r = paired.compose({
      brandId: 'stripe',
      contentId: 'deck',
      checks: false,
      overrides: { slides: {}, fontPair: 'mono-heads' },
    });
    expect(title(r).text.font.family).toBe(mono);
    expect(r.overrides.fontPair).toBe('mono-heads');
    expect(r.deck.fonts.some((f) => f.family === mono)).toBe(true);
    const bad = paired.compose({
      brandId: 'stripe',
      contentId: 'deck',
      checks: false,
      overrides: { slides: {}, fontPair: 'ghost' },
    });
    expect(title(bad).text.font.family).toBe(title(plain).text.font.family);
    expect(bad.warnings.some((w) => /no font pair "ghost"/.test(w.message))).toBe(true);
  });
});
