import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from '../server/index.js';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = join(REPO, 'golden', 'expected', 'stripe');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const REPORT_V1 = {
  kind: 'Report',
  version: '1.0.0',
  brandId: 'stripe',
  summary: { checks: 2, pass: 1, warn: 1, fail: 0, skip: 0, items: { fail: 0, warn: 1, info: 0 } },
  results: [],
};

/** A temp repo: out/stripe (golden snapshot + report + questions + a PNG), golden/brands/{stripe,fresh,inputonly}. */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'pb-ui-server-'));
  const out = join(root, 'out', 'stripe');
  mkdirSync(join(out, 'slides'), { recursive: true });
  for (const f of ['deck.json', 'brand-spec.json', 'mood.json']) copyFileSync(join(GOLDEN, f), join(out, f));
  writeJson(join(out, 'report.json'), {
    kind: 'BuildReport',
    brandId: 'stripe',
    engineVersion: '0.3.0',
    counts: { slides: 24, overflow: 0 },
    checks: REPORT_V1,
  });
  writeJson(join(out, 'questions.json'), [
    { id: 'a', pointer: '/x', question: 'x?', severity: 'blocking', neededBy: [] },
    { id: 'b', pointer: '/y', question: 'y?', severity: 'optional', neededBy: [] },
  ]);
  writeFileSync(join(out, 'slides', '01.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  mkdirSync(join(root, 'out', '_layouts'), { recursive: true });

  // stripe: a tiny fake input whose hash is not the build's -> stale.
  const brand = join(root, 'golden', 'brands', 'stripe');
  mkdirSync(join(brand, 'assets'), { recursive: true });
  writeJson(join(brand, 'stripe.json'), { id: 'stripe', name: 'Stripe (fixture)' });
  writeFileSync(join(brand, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

  // fresh: built from exactly this input -> not stale.
  const freshInput = Buffer.from('{"id":"fresh"}\n');
  mkdirSync(join(root, 'golden', 'brands', 'fresh'), { recursive: true });
  writeFileSync(join(root, 'golden', 'brands', 'fresh', 'fresh.json'), freshInput);
  mkdirSync(join(root, 'out', 'fresh'), { recursive: true });
  copyFileSync(join(GOLDEN, 'deck.json'), join(root, 'out', 'fresh', 'deck.json'));
  writeJson(join(root, 'out', 'fresh', 'brand-spec.json'), { input: { sha256: sha256(freshInput) } });
  writeJson(join(root, 'out', 'fresh', 'report.json'), { kind: 'BuildReport', checks: { version: '0.0.0' } });

  mkdirSync(join(root, 'golden', 'brands', 'inputonly'), { recursive: true });
  writeJson(join(root, 'golden', 'brands', 'inputonly', 'inputonly.json'), { id: 'inputonly' });
  mkdirSync(join(root, 'golden', 'expected', 'stripe'), { recursive: true });
  copyFileSync(join(GOLDEN, 'deck.json'), join(root, 'golden', 'expected', 'stripe', 'deck.json'));
  writeFileSync(join(root, 'secret.txt'), 'outside the file roots');
  return root;
}

/** A fake child process: the test decides when it closes. */
function fakeSpawn() {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    calls.push({ cmd, args, opts, child });
    return child;
  };
  return { spawn, calls };
}

let root;
let server;
let base;
let spawner;

beforeEach(async () => {
  root = makeRepo();
  spawner = fakeSpawn();
  server = createServer({
    repoRoot: root,
    apiOnly: true,
    spawn: spawner.spawn,
    loadDiff: async () => ({
      diffDecks: (a, b) => ({
        identical: JSON.stringify(a) === JSON.stringify(b),
        titles: [a.title, b.title],
      }),
    }),
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((ok) => server.close(ok));
  rmSync(root, { recursive: true, force: true });
});

const getJson = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};
const postJson = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

/** A raw GET (no client-side normalisation of "..": fetch would resolve it before sending). */
function rawGet(path) {
  const { port } = server.address();
  return new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => ok(res.statusCode));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('GET /api/brands', () => {
  it('lists out/ and golden/brands/ folders (not _folders) with build facts and stale', async () => {
    const { status, body } = await getJson('/api/brands');
    expect(status).toBe(200);
    expect(body.map((b) => b.id)).toEqual(['fresh', 'inputonly', 'stripe']);
    const byId = Object.fromEntries(body.map((b) => [b.id, b]));
    expect(byId.stripe).toMatchObject({ out: true, input: true, stale: true, signedOff: false });
    expect(byId.stripe.report).toEqual(REPORT_V1.summary);
    expect(byId.stripe.questions).toEqual({ blocking: 1, optional: 1 });
    expect(byId.fresh).toMatchObject({ out: true, input: true, stale: false, report: null });
    expect(byId.inputonly).toMatchObject({ out: false, input: true, stale: false, report: null });
    expect(JSON.stringify(body)).not.toContain(root);
  });
});

describe('JSON files of a build', () => {
  it('serves deck / report / questions, 404 for an absent file, {} for an absent review', async () => {
    const deck = await getJson('/api/brands/stripe/deck');
    expect(deck.status).toBe(200);
    expect(deck.body.slides.length).toBeGreaterThan(0);
    expect((await getJson('/api/brands/stripe/report')).body.checks.version).toBe('1.0.0');
    expect((await getJson('/api/brands/stripe/checks')).status).toBe(404);
    expect(await getJson('/api/brands/stripe/review')).toEqual({ status: 200, body: {} });
    expect((await getJson('/api/brands/nope/deck')).status).toBe(404);
    expect((await getJson('/api/brands/stripe/whatever')).status).toBe(404);
  });

  it('diff calls diffDecks(golden, build); 404 without a snapshot; 501 when the module is missing', async () => {
    const deckFile = join(root, 'out', 'stripe', 'deck.json');
    const deck = JSON.parse(readFileSync(deckFile, 'utf8'));
    writeJson(deckFile, { ...deck, title: 'changed' });
    expect(await getJson('/api/brands/stripe/diff')).toEqual({
      status: 200,
      body: { identical: false, titles: [deck.title ?? null, 'changed'] },
    });
    expect((await getJson('/api/brands/fresh/diff')).status).toBe(404);
    const bare = createServer({ repoRoot: root, apiOnly: true });
    await new Promise((ok) => bare.listen(0, '127.0.0.1', ok));
    const res = await fetch(`http://127.0.0.1:${bare.address().port}/api/brands/stripe/diff`);
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: 'diff not available' });
    await new Promise((ok) => bare.close(ok));
  });
});

describe('static files', () => {
  it('serves files under out/ and golden/brands/ with their MIME type (HEAD too)', async () => {
    const png = await fetch(`${base}/files/out/stripe/slides/01.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await png.arrayBuffer())).toHaveLength(4);
    const head = await fetch(`${base}/files/out/stripe/slides/01.png`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('4');
    // mood.html's relative links (../../golden/brands/<id>/...) resolve to /files/golden/brands/: the same root
    expect((await fetch(`${base}/files/golden/brands/stripe/assets/logo.svg`)).status).toBe(200);
    expect(await rawGet('/files/golden/brands/../../secret.txt')).toBe(403);
    const svg = await fetch(`${base}/files/brands/stripe/assets/logo.svg`);
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    expect((await fetch(`${base}/files/out/stripe/slides/99.png`)).status).toBe(404);
  });

  it('refuses paths that resolve outside the two roots (403)', async () => {
    expect(await rawGet('/files/out/../secret.txt')).toBe(403);
    expect(await rawGet('/files/brands/../../secret.txt')).toBe(403);
    expect(await rawGet('/files/out/stripe/..%2F..%2Fsecret.txt')).toBe(403);
    expect(await rawGet('/files/brands/%2e%2e/%2e%2e/secret.txt')).toBe(403);
    expect(await rawGet('/files/other/secret.txt')).toBe(404);
  });

  it('API-only mode does not serve the UI', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
  });
});

describe('POST /answers and /review', () => {
  it('merges answers into golden/brands/<id>/answers.json and returns them', async () => {
    const file = join(root, 'golden', 'brands', 'stripe', 'answers.json');
    writeJson(file, { '/a': 1, '/b': 'keep' });
    const res = await postJson('/api/brands/stripe/answers', { '/a': 2, '/c': { x: true } });
    expect(res).toEqual({ status: 200, body: { '/a': 2, '/b': 'keep', '/c': { x: true } } });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(res.body);
    expect((await getJson('/api/brands/stripe/answers')).body).toEqual(res.body);
    expect((await postJson('/api/brands/stripe/answers', ['/a'])).status).toBe(400);
    expect((await postJson('/api/brands/stripe/answers', { 'no-slash': 1 })).status).toBe(400);
  });

  it('writes out/<id>/review.json with date, engineVersion and the deck hash', async () => {
    const res = await postJson('/api/brands/stripe/review', { signedOff: true, notes: 'ok to send' });
    expect(res.status).toBe(200);
    const deckBytes = readFileSync(join(root, 'out', 'stripe', 'deck.json'));
    expect(res.body).toMatchObject({
      signedOff: true,
      notes: 'ok to send',
      engineVersion: JSON.parse(deckBytes).engineVersion,
      deckHash: sha256(deckBytes),
    });
    expect(Number.isNaN(Date.parse(res.body.date))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, 'out', 'stripe', 'review.json'), 'utf8'))).toEqual(res.body);
    const listed = (await getJson('/api/brands')).body.find((b) => b.id === 'stripe');
    expect(listed).toMatchObject({ signedOff: true, signedOffDate: res.body.date, reviewStale: false });
    expect((await postJson('/api/brands/stripe/review', { signedOff: 'yes' })).status).toBe(400);
    expect((await postJson('/api/brands/inputonly/review', { signedOff: true })).status).toBe(404);
  });
});

describe('builds', () => {
  it('spawns pb build in the repo root, 409 while running, keeps the log and exit code', async () => {
    const first = await postJson('/api/brands/stripe/build', { png: true });
    expect(first.status).toBe(202);
    expect(first.body.running).toBe(true);
    expect(spawner.calls).toHaveLength(1);
    const call = spawner.calls[0];
    expect(call.args).toEqual(['packages/cli/bin/pb.js', 'build', 'golden/brands/stripe', '--png']);
    expect(call.opts.cwd).toBe(resolve(root));

    expect((await postJson('/api/brands/stripe/build', {})).status).toBe(409);
    expect(spawner.calls).toHaveLength(1);
    // another brand may build at the same time
    expect((await postJson('/api/brands/fresh/build', {})).status).toBe(202);

    call.child.stdout.emit('data', Buffer.from('composing\nwriting deck.json\n'));
    call.child.emit('close', 0);
    const state = await getJson('/api/brands/stripe/build');
    expect(state.body).toMatchObject({ running: false, exitCode: 0, png: true });
    expect(state.body.log).toEqual(expect.arrayContaining(['composing', 'writing deck.json', 'exit 0']));
    expect((await postJson('/api/brands/stripe/build', {})).status).toBe(202);
  });

  it('keeps only the last 200 log lines', async () => {
    await postJson('/api/brands/stripe/build', {});
    const { child } = spawner.calls[0];
    child.stdout.emit('data', Array.from({ length: 450 }, (_, i) => `line ${i}`).join('\n'));
    const { body } = await getJson('/api/brands/stripe/build');
    expect(body.log).toHaveLength(200);
    expect(body.log.at(-1)).toBe('line 449');
  });

  it('404 for a brand without an input folder', async () => {
    rmSync(join(root, 'golden', 'brands', 'fresh'), { recursive: true });
    expect((await postJson('/api/brands/fresh/build', {})).status).toBe(404);
    expect(existsSync(join(root, 'out', 'fresh'))).toBe(true);
  });
});
