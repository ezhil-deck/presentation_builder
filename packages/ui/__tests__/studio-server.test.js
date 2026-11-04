// The Studio API (docs/PLAN-studio.md §2.1) against the real stripe brand input (golden/brands/stripe, git-ignored):
// compose needs the font metrics, so without the input the suite is skipped (as packages/cli/__tests__/golden.test.js).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from '../server/index.js';
import {
  HISTORY_LIMIT,
  applyOverrides,
  contentErrors,
  markdownTitle,
  normalizeHistory,
  normalizeOverrides,
} from '../server/studio.js';

const REPO = resolve(__dirname, '..', '..', '..');
const STRIPE = join(REPO, 'golden', 'brands', 'stripe');
const SHOWCASE = join(REPO, 'golden', 'showcase', 'showcase.md');
const HAS_INPUT = existsSync(join(STRIPE, 'stripe.json')) && existsSync(SHOWCASE);

describe('studio helpers (no brand input needed)', () => {
  it('normalizeOverrides keeps surface / layout / decor:false / logo:false and drops defaults', () => {
    expect(
      normalizeOverrides({
        slides: {
          s2: { surface: 'navy', decor: true, logo: false },
          s3: {},
          s4: { layout: 'text', decor: false },
        },
      }),
    ).toEqual({ slides: { s2: { surface: 'navy', logo: false }, s4: { layout: 'text', decor: false } } });
    expect(normalizeOverrides(undefined)).toEqual({ slides: {} });
  });

  it('normalizeOverrides rejects unknown keys, bad types and layouts outside the catalogue (negative)', () => {
    expect(() => normalizeOverrides({ slides: { s1: { colour: 'red' } } })).toThrow(/unknown override/);
    expect(() => normalizeOverrides({ slides: { s1: { decor: 'no' } } })).toThrow(/boolean/);
    expect(() => normalizeOverrides({ slides: { s1: { layout: 'nope' } } })).toThrow(/catalogue/);
    expect(() => normalizeOverrides({ slides: [] })).toThrow(/object/);
  });

  it('applyOverrides sets the keys on the content slide; an unknown surface is reported, not applied', () => {
    const content = {
      schema: 'content/1',
      slides: [
        { id: 's1', blocks: [] },
        { id: 's2', blocks: [] },
      ],
    };
    const mood = { palette: { surfaces: [{ id: 'page' }, { id: 'navy' }] } };
    const r = applyOverrides(
      content,
      {
        slides: {
          s2: { surface: 'navy', layout: 'text', decor: false, logo: false },
          s1: { surface: 'pink' },
          s9: {},
        },
      },
      mood,
    );
    expect(r.content.slides[1]).toEqual({
      id: 's2',
      blocks: [],
      surface: 'navy',
      layout: 'text',
      decor: false,
      logo: false,
    });
    expect(r.content.slides[0]).toEqual({ id: 's1', blocks: [] });
    expect(content.slides[1]).toEqual({ id: 's2', blocks: [] }); // the parsed content is not mutated
    expect(r.notes.map((n) => n.message)).toEqual([
      'override for unknown slide "s9" ignored',
      'surface "pink" is not one of this brand\'s surfaces: ignored',
    ]);
  });

  it('normalizeOverrides carries element overrides (P4.1) and refuses bad ones with 400 (negative)', () => {
    expect(
      normalizeOverrides({ slides: {}, elements: { 's4-title': { color: '#ff0000', hidden: false } } }),
    ).toEqual({ slides: {}, elements: { 's4-title': { color: '#FF0000' } } });
    expect(normalizeOverrides({ slides: {}, elements: { a: { locked: false } } })).toEqual({ slides: {} });
    expect(() => normalizeOverrides({ elements: { a: { color: 'red' } } })).toThrow(/#RRGGBB/);
    expect(() => normalizeOverrides({ elements: { a: { frame: { x: 0 } } } })).toThrow(/frame/);
    let status;
    try {
      normalizeOverrides({ elements: { a: { size: 1 } } });
    } catch (err) {
      status = err.status;
    }
    expect(status).toBe(400);
  });

  it('normalizeHistory keeps the last 200 commands (cursor moved with the trim) and refuses bad patches', () => {
    const cmd = (i) => ({
      type: 'elements',
      args: { elements: { a: { hidden: true } } },
      inverse: {},
      label: `${i}`,
    });
    const h = normalizeHistory({ commands: Array.from({ length: 205 }, (_, i) => cmd(i)), cursor: 203 });
    expect(h.commands).toHaveLength(HISTORY_LIMIT);
    expect(h.commands[0].label).toBe('5');
    expect(h.cursor).toBe(198);
    expect(normalizeHistory(undefined)).toEqual({ commands: [], cursor: 0 });
    expect(normalizeHistory({ commands: [cmd(0)], cursor: 9 }).cursor).toBe(1);
    expect(() => normalizeHistory({ commands: [{ args: {} }] })).toThrow(/type/);
    expect(() => normalizeHistory({ commands: [{ type: 'x', args: { decks: {} } }] })).toThrow(
      /unknown patch key/,
    );
    expect(() => normalizeHistory({ commands: {} })).toThrow(/array/);
  });

  it('P4.2: hidden is a slide override (true kept, false dropped); a log may carry content patches', () => {
    expect(normalizeOverrides({ slides: { s2: { hidden: true }, s3: { hidden: false } } })).toEqual({
      slides: { s2: { hidden: true } },
    });
    expect(() => normalizeOverrides({ slides: { s2: { hidden: 'yes' } } })).toThrow(/boolean/);
    const cmd = {
      type: 'moveSlide',
      args: { content: { order: ['s2', 's1'] } },
      inverse: { content: { order: ['s1', 's2'], slides: { s3: null } } },
    };
    expect(normalizeHistory({ commands: [cmd], cursor: 1 }).commands[0]).toEqual(cmd);
    expect(() => normalizeHistory({ commands: [{ type: 'x', args: { content: { order: [1] } } }] })).toThrow(
      /order/,
    );
    expect(() => normalizeHistory({ commands: [{ type: 'x', args: { content: { blocks: {} } } }] })).toThrow(
      /unknown key/,
    );
  });

  it('contentErrors: the content schema, plus unique slide ids (negative)', () => {
    const ok = { schema: 'content/2', slides: [{ id: 's1', title: 'A', blocks: [] }] };
    expect(contentErrors(ok)).toEqual([]);
    expect(contentErrors({ schema: 'content/2', slides: [] })[0].pointer).toBe('/slides');
    expect(contentErrors({ ...ok, slides: [...ok.slides, ...ok.slides] })).toEqual([
      { pointer: '/slides/1/id', message: 'duplicate slide id "s1"' },
    ]);
    expect(contentErrors(null)[0].message).toMatch(/object/);
    expect(
      contentErrors({ schema: 'content/2', slides: [{ id: 's1', blocks: [{ type: 'points' }] }] }).length,
    ).toBeGreaterThan(0);
  });

  it('markdownTitle reads the front matter title, else the first heading', () => {
    expect(markdownTitle('---\ntitle: "Q3 review"\n---\n# A', 'x')).toBe('Q3 review');
    expect(markdownTitle('# First slide\n', 'x')).toBe('First slide');
    expect(markdownTitle('', 'fallback')).toBe('fallback');
  });
});

const describeInput = HAS_INPUT ? describe : describe.skip;

describeInput('the Studio API on golden/brands/stripe', () => {
  let root;
  let server;
  let base;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'pb-studio-'));
    mkdirSync(join(root, 'golden', 'brands'), { recursive: true });
    mkdirSync(join(root, 'golden', 'showcase'), { recursive: true });
    symlinkSync(STRIPE, join(root, 'golden', 'brands', 'stripe'));
    writeFileSync(join(root, 'golden', 'showcase', 'showcase.md'), readFileSync(SHOWCASE));
    // a brand the reader cannot derive: listed with ok: false
    mkdirSync(join(root, 'golden', 'brands', 'broken'), { recursive: true });
    writeFileSync(join(root, 'golden', 'brands', 'broken', 'broken.json'), '{"id":"broken"}\n');
    mkdirSync(join(root, 'content'), { recursive: true });
    writeFileSync(join(root, 'content', 'README.md'), '# not a deck\n');
    writeFileSync(
      join(root, 'content', 'pitch.md'),
      '---\ntitle: Pitch\n---\n# Hello\n<!-- kind: cover -->\nWorld\n',
    );
    mkdirSync(join(root, 'golden', 'expected', 'stripe'), { recursive: true });
    writeFileSync(
      join(root, 'golden', 'expected', 'stripe', 'deck.json'),
      readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json')),
    );
    server = createServer({
      repoRoot: root,
      apiOnly: true,
      loadDiff: async () => ({ diffDecks: (a, b) => ({ identical: a.id === b.id, ids: [a.id, b.id] }) }),
    });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((ok) => server.close(ok));
    rmSync(root, { recursive: true, force: true });
  });

  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.json() };
  };
  const send = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('GET /api/studio/brands: every brand with logo url, colours, surfaces, fonts, ok and blocking questions', async () => {
    const { status, body } = await get('/api/studio/brands');
    expect(status).toBe(200);
    expect(body.map((b) => b.id)).toEqual(['broken', 'stripe']);
    const stripe = body[1];
    expect(stripe).toMatchObject({ id: 'stripe', ok: true, fonts: { heading: 'Sohne', body: 'Sohne' } });
    expect(stripe.logo).toBe('/files/brands/stripe/assets/logo.svg');
    expect(stripe.colours).toEqual(['#533AFD', '#0D1738', '#533AFD']);
    expect(stripe.surfaces.map((s) => s.id)).toEqual(expect.arrayContaining(['page', 'navy']));
    expect(stripe.surfaces[0]).toEqual(
      expect.objectContaining({ bg: expect.any(String), text: expect.any(String) }),
    );
    expect(stripe.questions).toEqual({ blocking: expect.any(Number), total: expect.any(Number) });
    expect(body[0]).toMatchObject({ id: 'broken', ok: false, logo: null, colours: [] });
    // the logo url is served
    const logo = await fetch(base + stripe.logo);
    expect(logo.status).toBe(200);
  });

  it('keeps the derived brand in memory; a changed input re-derives, a touched identical input does not', () => {
    const first = server.studio.brand('stripe');
    expect(server.studio.brand('stripe')).toBe(first);
    const file = join(root, 'golden', 'brands', 'broken', 'broken.json');
    const before = server.studio.brand('broken');
    const t = new Date(Date.now() + 5000);
    utimesSync(file, t, t); // touched, same bytes
    expect(server.studio.brand('broken').derivedAt).toBe(before.derivedAt);
    writeFileSync(file, '{"id":"broken","name":"Broken 2"}\n');
    expect(server.studio.brand('broken')).not.toBe(before);
    expect(server.studio.brand('stripe', { force: true })).not.toBe(first);
  });

  it('GET /api/studio/contents: the showcase first, then content/*.md (README skipped)', async () => {
    const { body } = await get('/api/studio/contents');
    // Markdown decks are imports (P4.2): listed read-only
    expect(body).toEqual([
      {
        id: 'showcase',
        title: 'Showcase deck v2',
        file: 'golden/showcase/showcase.md',
        source: 'markdown',
        readOnly: true,
      },
      { id: 'pitch', title: 'Pitch', file: 'content/pitch.md', source: 'markdown', readOnly: true },
    ]);
  });

  it('POST /api/studio/compose: deck + warnings + checks (Report v1) + report, fast when warm', async () => {
    await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' });
    const { status, body } = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
    });
    expect(status).toBe(200);
    expect(body.deck.schema).toBe('deck/1');
    expect(body.deck.slides).toHaveLength(38); // showcase v2 (golden since 2026-11-02)
    expect(body.checks).toMatchObject({ kind: 'Report', version: expect.stringMatching(/^1\./) });
    expect(body.checks.summary.checks).toBeGreaterThan(0);
    expect(Array.isArray(body.checks.results)).toBe(true);
    expect(body.report.slides).toHaveLength(38);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.overrides).toEqual({ slides: {} });
    // 8–12 ms alone (38 slides); the bound tolerates the parallel jest workers sharing the CPU
    expect(body.ms.total).toBeLessThan(400);
  });

  it('compose applies surface / layout / decor / logo overrides to that slide only', async () => {
    const plain = (await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' }))
      .body.deck;
    const s4 = plain.slides[3];
    const other = s4.surfaceId === 'navy' ? 'page' : 'navy';
    const overrides = {
      slides: { s4: { surface: other, layout: 'bullets' }, s3: { decor: false }, s1: { logo: false } },
    };
    const { status, body } = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
      overrides,
    });
    expect(status).toBe(200);
    const d = body.deck;
    expect(d.slides[3]).toMatchObject({ surfaceId: other, layoutId: 'bullets' });
    expect(d.slides[2].elements.some((e) => e.role === 'decor')).toBe(false);
    expect(plain.slides[2].elements.some((e) => e.role === 'decor')).toBe(true);
    expect(d.slides[0].elements.some((e) => e.role === 'logo')).toBe(false);
    expect(d.slides[1].layoutId).toBe(plain.slides[1].layoutId);
  });

  it('compose: bad overrides -> 400, unknown brand / content -> 404, a brand without a Mood -> 422', async () => {
    const bad = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
      overrides: { slides: { s1: { layout: 'nope' } } },
    });
    expect(bad.status).toBe(400);
    expect(
      (await send('POST', '/api/studio/compose', { brandId: 'ghost', contentId: 'showcase' })).status,
    ).toBe(404);
    expect(
      (await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'ghost' })).status,
    ).toBe(404);
    expect(
      (await send('POST', '/api/studio/compose', { brandId: 'broken', contentId: 'showcase' })).status,
    ).toBe(422);
  });

  it('PUT / GET /api/studio/overrides/:content/:brand persist to content/overrides/ and compose reads them', async () => {
    const put = await send('PUT', '/api/studio/overrides/showcase/stripe', {
      slides: { s5: { surface: 'navy', decor: true } },
    });
    expect(put).toEqual({ status: 200, body: { slides: { s5: { surface: 'navy' } } } });
    const file = join(root, 'content', 'overrides', 'showcase.stripe.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ slides: { s5: { surface: 'navy' } } });
    expect(await get('/api/studio/overrides/showcase/stripe')).toEqual({
      status: 200,
      body: { slides: { s5: { surface: 'navy' } } },
    });
    // compose without `overrides` uses the stored file
    const { body } = await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' });
    expect(body.overrides).toEqual({ slides: { s5: { surface: 'navy' } } });
    expect(body.deck.slides[4].surfaceId).toBe('navy');
    expect((await get('/api/studio/overrides/pitch/stripe')).body).toEqual({ slides: {} });
    expect(
      (await send('PUT', '/api/studio/overrides/showcase/stripe', { slides: { s1: { x: 1 } } })).status,
    ).toBe(400);
    expect((await send('PUT', '/api/studio/overrides/ghost/stripe', { slides: {} })).status).toBe(404);
    await send('PUT', '/api/studio/overrides/showcase/stripe', { slides: {} });
  });

  it('compose applies element overrides after compose: frame (text re-fitted), colour, hidden; checks see the painted deck', async () => {
    const plain = (await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' }))
      .body;
    const title = plain.deck.slides[3].elements.find((e) => e.slot === 'title' && e.type === 'text');
    const frame = { ...title.frame, w: 360 };
    const { status, body } = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
      overrides: {
        slides: {},
        elements: {
          [title.id]: { frame, color: '#123456' },
          's2-title': { hidden: true },
          ghost: { locked: true },
        },
      },
    });
    expect(status).toBe(200);
    const t = body.deck.slides[3].elements.find((e) => e.id === title.id);
    expect(t.frame).toEqual(frame);
    expect(t.text.lines.length).toBeGreaterThan(title.text.lines.length);
    expect(t.text.font.color).toBe('#123456');
    expect(body.overrides.elements[title.id]).toEqual({ frame, color: '#123456' });
    // hidden: kept in the deck JSON, not seen by the checks
    expect(body.deck.slides[1].elements.find((e) => e.id === 's2-title').hidden).toBe(true);
    const contrastItems = body.checks.results.find((r) => r.id === 'contrast').items;
    expect(contrastItems.some((it) => it.elementId === 's2-title')).toBe(false);
    expect(body.warnings.some((w) => w.elementId === 'ghost' && /unknown element/.test(w.message))).toBe(
      true,
    );
    expect(body.report.counts.elementOverrides).toBe(3);
    // an invalid element override -> 400
    const bad = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
      overrides: { slides: {}, elements: { [title.id]: { color: 'teal' } } },
    });
    expect(bad.status).toBe(400);
  });

  it('a re-fit that still overflows reports the overflow (warning + the overflow check item with its fix)', async () => {
    const plain = (await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' }))
      .body;
    const title = plain.deck.slides[3].elements.find((e) => e.slot === 'title' && e.type === 'text');
    const { body } = await send('POST', '/api/studio/compose', {
      brandId: 'stripe',
      contentId: 'showcase',
      overrides: { slides: {}, elements: { [title.id]: { frame: { ...title.frame, w: 90, h: 24 } } } },
    });
    const t = body.deck.slides[3].elements.find((e) => e.id === title.id);
    expect(t.text.fit.overflow).toBe(true);
    expect(body.warnings.filter((w) => w.check === 'overflow' && w.elementId === title.id)).toHaveLength(1);
    const item = body.checks.results
      .find((r) => r.id === 'overflow')
      .items.find((it) => it.elementId === title.id);
    expect(item.fix).toEqual({ command: 'refit' });
    // the fix for it: drop the frame override
    const fix = await send('POST', '/api/studio/fix', {
      brandId: 'stripe',
      contentId: 'showcase',
      item,
      overrides: { slides: {}, elements: { [title.id]: { frame: { ...title.frame, w: 90, h: 24 } } } },
    });
    expect(fix.status).toBe(200);
    expect(fix.body.elements).toEqual({ [title.id]: null });
  });

  it('POST /api/studio/fix: move-inside / reset as element overrides; bad items -> 400', async () => {
    const plain = (await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' }))
      .body;
    const title = plain.deck.slides[3].elements.find((e) => e.slot === 'title' && e.type === 'text');
    const overrides = { slides: {}, elements: { [title.id]: { frame: { ...title.frame, x: 0 } } } };
    const composed = (
      await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase', overrides })
    ).body;
    const item = composed.checks.results
      .find((r) => r.id === 'margins')
      .items.find((it) => it.elementId === title.id);
    expect(item.fix).toEqual({ command: 'move-inside' });
    const r = await send('POST', '/api/studio/fix', {
      brandId: 'stripe',
      contentId: 'showcase',
      item,
      overrides,
    });
    expect(r.status).toBe(200);
    expect(r.body.elements[title.id].frame.x).toBe(138);
    const reset = await send('POST', '/api/studio/fix', {
      brandId: 'stripe',
      contentId: 'showcase',
      item: { elementId: title.id, fix: { command: 'reset' } },
      overrides,
    });
    expect(reset.body.elements).toEqual({ [title.id]: null });
    const bad = await send('POST', '/api/studio/fix', {
      brandId: 'stripe',
      contentId: 'showcase',
      item: { elementId: 'ghost', fix: { command: 'reset' } },
    });
    expect(bad.status).toBe(400);
    expect((await send('POST', '/api/studio/fix', { brandId: 'stripe', contentId: 'showcase' })).status).toBe(
      400,
    );
  });

  it('PUT overrides stores element overrides beside the slide overrides (same file, `elements` key)', async () => {
    const value = { slides: { s5: { surface: 'navy' } }, elements: { 's4-title': { locked: true } } };
    const put = await send('PUT', '/api/studio/overrides/showcase/stripe', value);
    expect(put).toEqual({ status: 200, body: value });
    const file = join(root, 'content', 'overrides', 'showcase.stripe.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(value);
    const { body } = await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' });
    expect(body.deck.slides[3].elements.find((e) => e.id === 's4-title').locked).toBe(true);
    await send('PUT', '/api/studio/overrides/showcase/stripe', { slides: {} });
  });

  it('GET / PUT /api/studio/history/:content/:brand persist the command log to content/history/', async () => {
    expect(await get('/api/studio/history/showcase/stripe')).toEqual({
      status: 200,
      body: { commands: [], cursor: 0 },
    });
    const value = {
      commands: [
        {
          type: 'elements',
          label: 'Move',
          slideId: 's4',
          args: { elements: { 's4-title': { locked: true } } },
          inverse: { elements: { 's4-title': null } },
        },
      ],
      cursor: 1,
    };
    const put = await send('PUT', '/api/studio/history/showcase/stripe', value);
    expect(put).toEqual({ status: 200, body: value });
    const file = join(root, 'content', 'history', 'showcase.stripe.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(value);
    expect((await get('/api/studio/history/showcase/stripe')).body).toEqual(value);
    expect((await send('PUT', '/api/studio/history/showcase/stripe', { commands: [{}] })).status).toBe(400);
    expect((await send('PUT', '/api/studio/history/ghost/stripe', value)).status).toBe(404);
    // content/history is not listed as a deck folder
    expect((await get('/api/studio/contents')).body.map((c) => c.id)).toEqual(['showcase', 'pitch']);
  });

  it("GET /api/studio/layouts?kind= lists the kind's layouts with their boxes (role + frame); no kind = all", async () => {
    const { body } = await get('/api/studio/layouts?kind=bullets&brandId=stripe');
    // S2.a slice 2: the kind's default first, then its variants (two columns of points, main + aside layouts)
    expect(body.map((l) => l.id)[0]).toBe('bullets');
    expect(body.map((l) => l.id)).toEqual(expect.arrayContaining(['bullets-columns', 'steps-aside-right']));
    expect(body[0].default).toBe(true);
    expect(body[0].boxes.length).toBeGreaterThan(0);
    expect(body[0].boxes[0]).toEqual(
      expect.objectContaining({
        role: expect.any(String),
        frame: expect.objectContaining({ x: expect.any(Number) }),
      }),
    );
    const all = await get('/api/studio/layouts');
    expect(all.body.length).toBe(68); // 18 v1 kinds + 11 process shapes + 21 main + aside + kpi-hero + bullets-columns + slice 3 (compare ×2, quotes ×2, image ×2, kpi-nested)
    expect((await get('/api/studio/layouts?kind=nope')).body).toEqual([]);
  });

  it('GET /api/studio/covers: one cover deck per brand (null with the reason when it cannot be derived)', async () => {
    const { body } = await get('/api/studio/covers?contentId=showcase');
    expect(body.map((c) => c.brandId)).toEqual(['broken', 'stripe']);
    expect(body[0].deck).toBeNull();
    expect(body[0].error).toMatch(/no Mood/);
    expect(body[1].deck.slides).toHaveLength(1);
    expect(body[1].deck.slides[0].kind).toBe('cover');
  });

  it('POST /api/studio/brands/:id/reconvert re-derives; GET /api/studio/brands/:id carries questions + mood', async () => {
    const before = server.studio.brand('stripe');
    const { status, body } = await send('POST', '/api/studio/brands/stripe/reconvert', {});
    expect(status).toBe(200);
    expect(server.studio.brand('stripe')).not.toBe(before);
    expect(body.mood.schema ?? body.mood.kind).toBeTruthy();
    expect(Array.isArray(body.questionsList)).toBe(true);
  });

  it('POST /api/studio/diff compares the live showcase deck with the golden snapshot', async () => {
    const { status, body } = await send('POST', '/api/studio/diff', {
      brandId: 'stripe',
      contentId: 'showcase',
    });
    expect(status).toBe(200);
    expect(body.ids).toHaveLength(2);
    expect((await send('POST', '/api/studio/diff', { brandId: 'stripe', contentId: 'pitch' })).status).toBe(
      404,
    );
  });

  it('exportDeck writes deck / checks / overrides to out/<id>/studio/<content>/ and renders through runRender', async () => {
    const calls = [];
    const r = await server.studio.exportDeck({
      brandId: 'stripe',
      contentId: 'pitch',
      pdf: true,
      render: async (deckFile, opts) => {
        calls.push({ deckFile, opts });
        return { files: ['deck.html', 'deck.pdf'] };
      },
    });
    expect(r.outDir).toBe('out/stripe/studio/pitch');
    expect(r.files).toEqual(['deck.json', 'checks.json', 'overrides.json', 'deck.html', 'deck.pdf']);
    expect(r.urls['deck.pdf']).toBe('/files/out/stripe/studio/pitch/deck.pdf');
    expect(calls[0].opts).toMatchObject({
      pdf: true,
      png: false,
      base: join(root, 'golden', 'brands', 'stripe'),
    });
    const deck = JSON.parse(
      readFileSync(join(root, 'out', 'stripe', 'studio', 'pitch', 'deck.json'), 'utf8'),
    );
    expect(deck.slides[0].kind).toBe('cover');
  });
  // ---- P4.2: the content documents (GET / PUT / import), read-only Markdown decks ----

  it('GET /api/studio/content/:id: a Markdown deck is its parse, placeholders as written, read-only', async () => {
    const { status, body } = await get('/api/studio/content/showcase');
    expect(status).toBe(200);
    expect(body).toMatchObject({ schema: 'content/2', source: 'markdown', readOnly: true });
    expect(body.slides[0].title).toBe('{brand.name}');
    expect(body.slides).toHaveLength(38);
    expect((await get('/api/studio/content/ghost')).status).toBe(404);
    // read-only: a PUT answers 409 and writes nothing
    const put = await send('PUT', '/api/studio/content/showcase?brandId=stripe', body);
    expect(put.status).toBe(409);
    expect(put.body.error).toMatch(/read-only/);
  });

  it('POST /api/studio/content/import: a Markdown deck as content/<id>.content.json, listed as json, with its overrides', async () => {
    await send('PUT', '/api/studio/overrides/showcase/stripe', { slides: { s3: { surface: 'navy' } } });
    const r = await send('POST', '/api/studio/content/import', {
      from: 'showcase',
      id: 'review-copy',
      title: 'Review copy',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: 'review-copy',
      title: 'Review copy',
      file: 'content/review-copy.content.json',
      source: 'json',
      readOnly: false,
    });
    expect(r.body.content.slides[0].title).toBe('{brand.name}');
    const file = join(root, 'content', 'review-copy.content.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(r.body.content);
    expect(
      JSON.parse(readFileSync(join(root, 'content', 'overrides', 'review-copy.stripe.json'), 'utf8')),
    ).toEqual({
      slides: { s3: { surface: 'navy' } },
    });
    const list = (await get('/api/studio/contents')).body;
    expect(list.at(-1)).toEqual({
      id: 'review-copy',
      title: 'Review copy',
      file: 'content/review-copy.content.json',
      source: 'json',
      readOnly: false,
    });
    expect((await get('/api/studio/content/review-copy')).body).toMatchObject({
      source: 'json',
      readOnly: false,
    });
    // the copy composes as the original (same elements; the brand name resolved at compose time)
    const a = await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'showcase' });
    const b = await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'review-copy' });
    expect(b.body.deck.slides.map((x) => x.elements)).toEqual(a.body.deck.slides.map((x) => x.elements));
    expect(b.body.checks.results.map((x) => x.id)).toContain('placeholder');
    // a taken id, a bad id, an unknown source
    expect(
      (await send('POST', '/api/studio/content/import', { from: 'showcase', id: 'review-copy' })).status,
    ).toBe(409);
    expect(
      (await send('POST', '/api/studio/content/import', { from: 'showcase', id: 'Bad Name' })).status,
    ).toBe(400);
    expect((await send('POST', '/api/studio/content/import', { from: 'ghost', id: 'x' })).status).toBe(404);
  });

  it('PUT /api/studio/content/:id validates (400 with the errors), writes, and answers the deck composed for brandId', async () => {
    const doc = (await get('/api/studio/content/review-copy')).body;
    delete doc.source;
    delete doc.readOnly;
    doc.slides[3] = { ...doc.slides[3], title: 'A **new** title' };
    const r = await send('PUT', '/api/studio/content/review-copy?brandId=stripe', doc);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ brandId: 'stripe', contentId: 'review-copy', saved: true });
    const title = r.body.deck.slides[3].elements.find((e) => e.id === 's4-title');
    expect(title.text.paragraphs[0].runs).toEqual([
      { text: 'A ' },
      { text: 'new', bold: true },
      { text: ' title' },
    ]);
    expect(title.source).toEqual({ path: '/title' });
    expect(Array.isArray(r.body.checks.results)).toBe(true);
    const stored = JSON.parse(readFileSync(join(root, 'content', 'review-copy.content.json'), 'utf8'));
    expect(stored.slides[3].title).toBe('A **new** title');
    // invalid: 400 with the schema errors, nothing written
    const bad = await send('PUT', '/api/studio/content/review-copy?brandId=stripe', {
      ...doc,
      slides: [{ id: 's1', blocks: [{ type: 'points' }] }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBeGreaterThan(0);
    expect(bad.body.errors[0]).toEqual(expect.objectContaining({ pointer: expect.any(String) }));
    const dup = await send('PUT', '/api/studio/content/review-copy', {
      ...doc,
      slides: [doc.slides[0], doc.slides[0]],
    });
    expect(dup.status).toBe(400);
    expect(dup.body.errors).toEqual([{ pointer: '/slides/1/id', message: 'duplicate slide id "s1"' }]);
    expect(JSON.parse(readFileSync(join(root, 'content', 'review-copy.content.json'), 'utf8'))).toEqual(
      stored,
    );
    // without brandId: written, no deck
    expect((await send('PUT', '/api/studio/content/review-copy', doc)).body).toEqual({
      contentId: 'review-copy',
      saved: true,
    });
  });

  it('a JSON document drops a block with an unresolvable placeholder; the sources point at the stored blocks', async () => {
    const doc = {
      schema: 'content/2',
      title: 'Placeholders',
      slides: [
        {
          id: 's1',
          kind: 'text',
          title: 'Hello',
          blocks: [
            { type: 'image', items: [{ src: '{brand.imagery.samples[99]}' }] },
            { type: 'paragraph', text: 'Body text' },
          ],
        },
      ],
    };
    writeFileSync(join(root, 'content', 'ph.content.json'), JSON.stringify(doc));
    const r = await send('POST', '/api/studio/compose', { brandId: 'stripe', contentId: 'ph' });
    expect(r.status).toBe(200);
    const body = r.body.deck.slides[0].elements.find((e) => e.id === 's1-body');
    expect(body.source).toEqual({ path: '/blocks/1/text' });
    expect(r.body.warnings.map((w) => w.message)).toContain(
      'image block dropped: unresolvable placeholder {brand.imagery.samples[99]}',
    );
  });

  it('GET /api/studio/layouts carries the label, tags and default of each layout (the slide-kind picker)', async () => {
    const { body } = await get('/api/studio/layouts?brandId=stripe');
    const cycle = body.find((l) => l.id === 'process-cycle');
    expect(cycle).toMatchObject({ kind: 'steps', label: 'Cycle', default: false });
    expect(cycle.tags).toContain('process');
    expect(body.find((l) => l.id === 'steps')).toMatchObject({ default: true, label: 'Steps' });
  });

  it('an export leaves out the slides hidden in the filmstrip', async () => {
    await send('PUT', '/api/studio/overrides/review-copy/stripe', {
      slides: { s2: { hidden: true }, s3: { surface: 'navy' } },
    });
    await server.studio.exportDeck({
      brandId: 'stripe',
      contentId: 'review-copy',
      render: async () => ({ files: [] }),
    });
    const deck = JSON.parse(
      readFileSync(join(root, 'out', 'stripe', 'studio', 'review-copy', 'deck.json'), 'utf8'),
    );
    expect(deck.slides.map((x) => x.id)).not.toContain('s2');
    expect(deck.slides).toHaveLength(37);
  });
});
