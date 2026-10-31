import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import pngjs from 'pngjs';
import { buildProgram } from '../src/index.js';
import { diffDecks, diffOutDir, pixelDiff, runDiff } from '../src/diff.js';

const { PNG } = pngjs;

const text = (id, x, size, words = 'Hello') => ({
  id,
  type: 'text',
  frame: { x, y: 100, w: 400, h: 100 },
  text: {
    paragraphs: [{ runs: [{ text: words }] }],
    font: { family: 'A', size, weight: 400, lineHeight: 1.2, color: '#111111' },
    fit: { requestedSize: 32, appliedSize: size, overflow: false, steps: 0 },
    lines: [{ paragraph: 0, x: 0, y: 30, width: 100, runs: [] }],
  },
});

const deckOf = (slides, extra = {}) => ({
  schema: 'deck/1',
  id: 'd',
  engineVersion: '0.3.0',
  canvas: { width: 1920, height: 1080 },
  fonts: [{ family: 'A', files: [{ file: 'a.woff2' }] }],
  assets: { x: { file: 'x.png' } },
  slides,
  ...extra,
});

const slide = (id, elements, extra = {}) => ({
  id,
  kind: 'text',
  surfaceId: 'light',
  background: { type: 'solid', color: '#FFFFFF' },
  elements,
  ...extra,
});

/** A 10 × 10 PNG, white, with `dots` pixels painted black. */
function png(file, dots = 0, size = 10) {
  const img = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i += 1) {
    const v = i < dots ? 0 : 255;
    img.data.set([v, v, v, 255], i * 4);
  }
  writeFileSync(file, PNG.sync.write(img));
}

describe('pb diff: JSON', () => {
  it('identical decks → identical, no slide entries', () => {
    const a = deckOf([slide('s1', [text('t', 100, 32)])]);
    const d = diffDecks(a, JSON.parse(JSON.stringify(a)));
    expect(d).toMatchObject({ kind: 'DeckDiff', identical: true, slides: [], deck: [] });
    expect(d.summary).toMatchObject({ slidesChanged: 0, elements: { added: 0, removed: 0, changed: 0 } });
  });

  it('elements added / removed / changed (frame and text.fit summarised), slide keys, deck-level changes', () => {
    const a = deckOf([slide('s1', [text('t', 100, 32), text('gone', 0, 20)]), slide('s2', [])]);
    const b = deckOf(
      [slide('s1', [text('t', 120, 28, 'Hello there'), text('new', 0, 20)], { surfaceId: 'dark' })],
      {
        engineVersion: '0.4.0',
        fonts: [{ family: 'B', files: [{ file: 'b.woff2' }] }],
        assets: { x: { file: 'x2.png' }, y: { file: 'y.png' } },
      },
    );
    const d = diffDecks(a, b);
    expect(d.identical).toBe(false);
    expect(d.summary).toMatchObject({
      slidesChanged: 2,
      slidesRemoved: 1,
      elements: { added: 1, removed: 1, changed: 1 },
    });
    const s1 = d.slides[0];
    expect(s1).toMatchObject({
      index: 1,
      status: 'changed',
      elements: { added: ['new'], removed: ['gone'] },
    });
    expect(s1.slide).toEqual([{ key: 'surfaceId', change: 'changed', before: 'light', after: 'dark' }]);
    const [frame, txt] = s1.elements.changed[0].changes;
    expect(frame).toEqual({ key: 'frame', change: 'changed', fields: { x: { before: 100, after: 120 } } });
    expect(txt).toMatchObject({
      key: 'text',
      fit: { appliedSize: { before: 32, after: 28 } },
      font: { size: { before: 32, after: 28 } },
      content: { before: 'Hello', after: 'Hello there' },
    });
    expect(d.slides[1]).toMatchObject({ index: 2, status: 'removed', id: 's2' });
    const byKey = Object.fromEntries(d.deck.map((c) => [c.key, c]));
    expect(byKey.engineVersion).toMatchObject({ before: '0.3.0', after: '0.4.0' });
    expect(byKey.fonts).toMatchObject({ added: ['B'], removed: ['A'], changed: [] });
    expect(byKey.assets).toMatchObject({
      added: [{ id: 'y', file: 'y.png' }],
      changed: [{ id: 'x', file: 'x2.png' }],
    });
  });
});

describe('pb diff: pixels + files', () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pb-diff-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const folder = (name, deck) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'slides'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck));
    return dir;
  };

  it('pixelmatch per slide PNG on both sides: masks, the changed share, > 0.1 % listed', () => {
    const a = folder('a', deckOf([slide('s1', [])]));
    const b = folder('b', deckOf([slide('s1', [])]));
    png(join(a, 'slides', '01.png'));
    png(join(b, 'slides', '01.png'), 1); // 1 of 100 px = 1 %
    png(join(a, 'slides', '02.png'));
    png(join(b, 'slides', '02.png')); // identical
    png(join(a, 'slides', '03.png')); // only in A
    png(join(b, 'slides', '04.png'), 0, 12); // only in B
    const out = join(root, 'out');
    const p = pixelDiff(a, b, out);
    expect(p.compared).toBe(2);
    expect(p.changed).toEqual([{ n: 1, file: '01.png', share: 0.01, pixels: 1, width: 10, height: 10 }]);
    expect(p.onlyA).toEqual(['03.png']);
    expect(p.onlyB).toEqual(['04.png']);
    expect(existsSync(join(out, '01.png'))).toBe(true);
    expect(existsSync(join(out, '02.png'))).toBe(true);
  });

  it('a size mismatch is a changed slide without a mask', () => {
    const a = folder('a', deckOf([slide('s1', [])]));
    const b = folder('b', deckOf([slide('s1', [])]));
    png(join(a, 'slides', '01.png'));
    png(join(b, 'slides', '01.png'), 0, 12);
    const p = pixelDiff(a, b, join(root, 'out'));
    expect(p.changed).toEqual([expect.objectContaining({ n: 1, sizeDiffers: true, share: 1 })]);
    expect(existsSync(join(root, 'out', '01.png'))).toBe(false);
  });

  it('runDiff writes diff.json + DIFF.md (default <dirB>/diff); no sheet without changed slides', async () => {
    const a = folder('a', deckOf([slide('s1', [text('t', 100, 32)])]));
    const b = folder('b', deckOf([slide('s1', [text('t', 100, 30)])]));
    png(join(a, 'slides', '01.png'));
    png(join(b, 'slides', '01.png'));
    const r = await runDiff(a, b, { expectedDir: join(root, 'golden') });
    expect(r.outDir).toBe(join(b, 'diff'));
    expect(r.files).toEqual(['diff.json', 'DIFF.md', '01.png']);
    const json = JSON.parse(readFileSync(join(b, 'diff', 'diff.json'), 'utf8'));
    expect(json).toMatchObject({ kind: 'DeckDiff', identical: false, pixels: { compared: 1, changed: [] } });
    const md = readFileSync(join(b, 'diff', 'DIFF.md'), 'utf8');
    expect(md).toMatch(/\*\*1 slide\(s\) differ\*\*/);
    expect(md).toMatch(/`t`: text \(fit\.appliedSize 32 → 30, font\.size 32 → 30\)/);
    expect(md).toMatch(/1 slide PNG\(s\) compared .* 0 changed by more than 0\.1 %/);
  });

  it('never writes into a golden snapshot folder', () => {
    const golden = join(root, 'golden');
    const g = join(golden, 'x');
    expect(diffOutDir(join(root, 'a'), g, undefined, { expectedDir: golden })).toMatchObject({
      outDir: join(root, 'a', 'diff'),
      note: expect.stringMatching(/golden snapshot/),
    });
    expect(() => diffOutDir(join(root, 'a'), g, join(g, 'diff'), { expectedDir: golden })).toThrow(
      /inside golden\/expected/,
    );
    expect(() => diffOutDir(join(golden, 'y'), g, undefined, { expectedDir: golden })).toThrow(/give --out/);
  });

  it('`pb diff` prints one summary line', async () => {
    const deck = deckOf([slide('s1', [text('t', 100, 32)])]);
    const a = folder('a', deck);
    const b = folder('b', deck);
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((s) => logs.push(String(s)));
    try {
      await buildProgram().parseAsync(['node', 'pb', 'diff', a, b, '--out', join(root, 'o')]);
    } finally {
      spy.mockRestore();
    }
    expect(logs).toHaveLength(1);
    expect(logs[0]).toBe(
      `pb diff: ${a} vs ${b}: identical (1 slides); pixels: none (no PNGs on both sides) -> ${relative(process.cwd(), join(root, 'o'))}`,
    );
    expect(existsSync(join(root, 'o', 'DIFF.md'))).toBe(true);
  });
});
