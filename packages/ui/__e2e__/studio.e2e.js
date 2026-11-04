// Browser e2e of the Studio editor (docs/P4-spec.md §8 step 4, P4.4): puppeteer drives the built UI served by
// packages/ui/server.js on a free port against a SANDBOX data root (a copy of golden/brands/stripe's input + the
// showcase + an empty content/), so the checkout's content/overrides and content/history are never touched. Every test
// asserts through the DOM and through the JSON files the server writes in the sandbox. The tests run in order on one
// page (each step builds on the last): select, drag, Fix, undo / redo, the Shortcuts overlay, Delete, inline text
// (→ "Save as a copy"), export. `npm run test:e2e` (caffeinate on a Mac). The server log is printed when a step fails.
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { SHORTCUTS } from '../src/studio/keys.js';

const REPO = resolve(__dirname, '..', '..', '..');
const BRAND = 'stripe';
const BRAND_DIR = join(REPO, 'golden', 'brands', BRAND);
const SHOWCASE = join(REPO, 'golden', 'showcase', 'showcase.md');
const DIST = join(REPO, 'packages', 'ui', 'dist', 'index.html');
const HAS_INPUT = existsSync(join(BRAND_DIR, `${BRAND}.json`)) && existsSync(SHOWCASE);
/** The sources the UI bundle is built from: a newer file than dist/index.html means the bundle is stale. */
const BUNDLE_SOURCES = [
  'packages/ui/src',
  'packages/ui/public',
  'packages/renderer/src',
  'packages/engine/src',
  'packages/layouts/src',
  'packages/mood/src',
  'packages/checks/src',
  'packages/ui/webpack.config.cjs',
  'packages/ui/tailwind.config.cjs',
];

function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(0, ...readdirSync(path).map((f) => newest(join(path, f))));
}

/** Poll `fn` until it returns a truthy value (its value), or fail after `ms` with `what`. */
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what} (last: ${String(last)})`);
    await new Promise((ok) => setTimeout(ok, 50));
  }
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

const describeE2e = HAS_INPUT ? describe : describe.skip;

describeE2e('the Studio in a browser (puppeteer, sandbox data root)', () => {
  let root;
  let child;
  const log = [];
  let base;
  let browser;
  let page;
  let scale;
  const overridesFile = () => join(root, 'content', 'overrides', `showcase.${BRAND}.json`);

  /** Run a step; on failure print the server log (the last 80 lines) before failing. */
  const logged = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      console.log(`--- server log (last 80 lines) ---\n${log.slice(-80).join('\n')}`);
      throw err;
    }
  };

  // the canvas's slide (the filmstrip paints the same ids in its thumbnails first)
  const ON_CANVAS = '[data-testid="canvas-slide"] .slide';
  const box = (id) =>
    page.$eval(`${ON_CANVAS} [data-element-id="${id}"]`, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, left: el.style.left };
    });
  const painted = (id) => page.$(`${ON_CANVAS} [data-element-id="${id}"]`);
  const settled = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-testid="canvas"]')?.dataset.busy === 'false' &&
        document.querySelector('[data-testid="save-state"]')?.textContent === 'Saved',
      { timeout: 15000 },
    );
  const count = (testId) => page.$$eval(`[data-testid="${testId}"]`, (els) => els.length);
  const titleOverride = () => readJson(overridesFile())?.elements?.['s1-title'] ?? null;

  beforeAll(async () => {
    const t0 = Date.now();
    // the UI bundle: built once when a source is newer than it (else reused)
    if (!existsSync(DIST) || BUNDLE_SOURCES.some((p) => newest(join(REPO, p)) > statSync(DIST).mtimeMs)) {
      const b = spawnSync('npm', ['run', 'build:ui'], { cwd: REPO, encoding: 'utf8' });
      if (b.status !== 0) throw new Error(`npm run build:ui failed:\n${b.stdout}\n${b.stderr}`);
    }
    // the sandbox: the brand input (json + assets + answers), the showcase, an empty content/
    root = mkdtempSync(join(tmpdir(), 'pb-e2e-'));
    const brand = join(root, 'golden', 'brands', BRAND);
    mkdirSync(brand, { recursive: true });
    cpSync(join(BRAND_DIR, `${BRAND}.json`), join(brand, `${BRAND}.json`));
    cpSync(join(BRAND_DIR, 'assets'), join(brand, 'assets'), { recursive: true });
    if (existsSync(join(BRAND_DIR, 'answers.json')))
      cpSync(join(BRAND_DIR, 'answers.json'), join(brand, 'answers.json'));
    mkdirSync(join(root, 'golden', 'showcase'), { recursive: true });
    writeFileSync(join(root, 'golden', 'showcase', 'showcase.md'), readFileSync(SHOWCASE));
    mkdirSync(join(root, 'content'), { recursive: true });
    // the server on a free port (--port 0: it prints the one it got)
    child = spawn(
      process.execPath,
      ['packages/ui/server.js', '--root', root, '--port', '0', '--host', '127.0.0.1'],
      { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const onData = (d) => log.push(...String(d).split('\n').filter(Boolean));
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const port = await until(
      () => log.map((l) => /on http:\/\/127\.0\.0\.1:(\d+)\//.exec(l)?.[1]).find(Boolean),
      'the server to listen',
      20000,
    );
    base = `http://127.0.0.1:${port}`;
    browser = await puppeteer.launch({ headless: true, args: ['--font-render-hinting=none'] });
    page = await browser.newPage();
    page.on('pageerror', (err) => log.push(`[page error] ${err.message}`));
    page.on('console', (m) => m.type() === 'error' && log.push(`[console] ${m.text()}`));
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(`${base}/#/studio/${BRAND}/showcase/1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.slide [data-element-id="s1-title"]', { timeout: 20000 });
    await settled();
    scale = await page.$eval('[data-testid="canvas-slide"] div div', (el) =>
      parseFloat(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? '1'),
    );
    log.push(`[e2e] ready in ${Date.now() - t0} ms (canvas scale ${scale})`);
  }, 240000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (child) child.kill();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it(
    'select: E enters edit mode, a click selects the title (outline + 8 handles, the panel shows it)',
    logged(async () => {
      await page.keyboard.press('e');
      await page.waitForSelector('[data-testid="edit-layer"]');
      const t = await box('s1-title');
      await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
      await page.waitForSelector('[data-testid="selection-outline"][data-element="s1-title"]');
      expect(await count('resize-handle')).toBe(8);
      expect(await page.$eval('[data-testid="element-id"]', (el) => el.textContent)).toBe('s1-title');
    }),
  );

  it(
    'drag: the title moved 60 px left (Alt: no snapping) - one command, the override saved, painted there',
    logged(async () => {
      const t = await box('s1-title');
      const x = t.x + t.w / 2;
      const y = t.y + t.h / 2;
      await page.keyboard.down('Alt');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 20, y, { steps: 2 });
      await page.mouse.move(x - 60 * scale, y, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
      const o = await until(() => titleOverride()?.frame, 'the frame override in content/overrides');
      expect(o.x).toBeCloseTo(78, 0);
      expect(o.y).toBeCloseTo(821.28, 1);
      await settled();
      expect(parseFloat((await box('s1-title')).left)).toBeCloseTo(o.x, 1);
      const h = await until(
        () => readJson(join(root, 'content', 'history', `showcase.${BRAND}.json`)),
        'the history',
      );
      expect(h.commands.map((c) => c.label)).toEqual(['Move']);
    }),
  );

  it(
    'Fix: the title outside the margins is a check item with a Fix button; the fix moves it back inside',
    logged(async () => {
      // the canvas caption's findings badge opens the panel's Checks
      await page.waitForSelector('[data-testid="caption-findings"]');
      await page.click('[data-testid="caption-findings"]');
      await page.waitForSelector('[data-testid="panel-check-item"] [data-testid="fix-button"]');
      const clicked = await page.$$eval('[data-testid="panel-check-item"]', (els) => {
        const item = els.find((e) => /margins/.test(e.textContent) && /s1-title/.test(e.textContent));
        item?.querySelector('[data-testid="fix-button"]')?.click();
        return Boolean(item);
      });
      expect(clicked).toBe(true);
      const o = await until(
        () => (titleOverride()?.frame?.x === 138 ? titleOverride() : null),
        'the fixed frame (x 138)',
      );
      expect(o.frame.x).toBe(138);
      await settled();
      expect(parseFloat((await box('s1-title')).left)).toBe(138);
    }),
  );

  it(
    'undo / redo: ⌘Z twice restores the frame (no override left), ⇧⌘Z re-applies the move',
    logged(async () => {
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await until(() => titleOverride()?.frame?.x < 100, 'the fix undone');
      await settled();
      await page.keyboard.down('Control');
      await page.keyboard.press('z');
      await page.keyboard.up('Control');
      await until(() => titleOverride() === null, 'the move undone');
      await settled();
      expect(parseFloat((await box('s1-title')).left)).toBe(138);
      await page.keyboard.down('Control');
      await page.keyboard.down('Shift');
      await page.keyboard.press('Z');
      await page.keyboard.up('Shift');
      await page.keyboard.up('Control');
      const o = await until(() => titleOverride()?.frame, 'the move redone');
      expect(o.x).toBeCloseTo(78, 0);
      await settled();
      const h = readJson(join(root, 'content', 'history', `showcase.${BRAND}.json`));
      expect(h.cursor).toBe(1);
      expect(h.commands).toHaveLength(2);
    }),
  );

  it(
    '? opens the Shortcuts overlay listing every entry of the keyboard map; Esc closes it',
    logged(async () => {
      await page.keyboard.press('?');
      await page.waitForSelector('[data-testid="shortcuts-overlay"]');
      expect(await count('shortcut-row')).toBe(SHORTCUTS.length);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-testid="shortcuts-overlay"]'));
      // Esc went to the overlay only: edit mode is still on
      expect(await count('edit-layer')).toBe(1);
    }),
  );

  it(
    'Delete hides the selected subtitle (one command); it is no longer painted nor selected',
    logged(async () => {
      const s = await box('s1-subtitle');
      await page.mouse.click(s.x + s.w / 2, s.y + s.h / 2);
      await page.waitForSelector('[data-testid="selection-outline"][data-element="s1-subtitle"]');
      await page.keyboard.press('Delete');
      await until(
        () => readJson(overridesFile())?.elements?.['s1-subtitle']?.hidden === true,
        'the hidden override',
      );
      await settled();
      expect(await painted('s1-subtitle')).toBeNull();
      expect(await count('selection-outline')).toBe(0);
      expect(await count('hidden-item')).toBe(1);
    }),
  );

  it(
    'inline text: double-click the title, type, ⌘↵ - the Markdown deck asks for a copy; the copy holds the text',
    logged(async () => {
      const t = await box('s1-title');
      await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2, { clickCount: 2 });
      await page.waitForSelector('[data-testid="inline-editor"]');
      await page.$eval('[data-testid="inline-editor"]', (el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await page.keyboard.type('Hello from e2e');
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      await page.waitForSelector('[data-testid="copy-dialog"]');
      await page.$eval('#copy-name', (el) => el.select());
      await page.keyboard.type('showcase-e2e');
      await page.click('[data-testid="copy-dialog"] button[type="submit"]');
      const file = join(root, 'content', 'showcase-e2e.content.json');
      const doc = await until(() => {
        const d = readJson(file);
        return d && JSON.stringify(d.slides[0]).includes('Hello from e2e') ? d : null;
      }, 'the copy with the edited title');
      expect(doc.slides[0].title).toBe('Hello from e2e');
      // the checkout's showcase stays as it was; the Studio is on the copy, painting the new text
      expect(readFileSync(join(root, 'golden', 'showcase', 'showcase.md'), 'utf8')).toBe(
        readFileSync(SHOWCASE, 'utf8'),
      );
      await page.waitForFunction(() => window.location.hash.startsWith('#/studio/stripe/showcase-e2e/1'));
      await settled();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="canvas-slide"] .slide [data-element-id="s1-title"]')
            ?.textContent.includes('Hello from e2e'),
        { timeout: 15000 },
      );
      // the overrides came along with the copy (the hidden subtitle, the moved title)
      const o = readJson(join(root, 'content', 'overrides', `showcase-e2e.${BRAND}.json`));
      expect(o.elements['s1-subtitle']).toEqual({ hidden: true });
    }),
  );

  it(
    'export: POST /api/studio/export with png writes the slide PNGs into the sandbox out/',
    logged(async () => {
      const res = await fetch(`${base}/api/studio/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: BRAND, contentId: 'showcase-e2e', png: true }),
      });
      const body = await res.json();
      expect([res.status, body.error]).toEqual([200, undefined]);
      expect(body.files).toContain('slides/01.png');
      const png = join(root, 'out', BRAND, 'studio', 'showcase-e2e', 'slides', '01.png');
      expect(existsSync(png)).toBe(true);
      expect(statSync(png).size).toBeGreaterThan(10000);
      const deck = readJson(join(root, 'out', BRAND, 'studio', 'showcase-e2e', 'deck.json'));
      expect(JSON.stringify(deck.slides[0])).toContain('Hello from e2e');
      expect(deck.slides[0].elements.find((e) => e.id === 's1-subtitle')?.hidden).toBe(true);
    }),
  );
});
