// The review UI's local server (P3-spec §C.1): a JSON API over the build folders (out/<id>/) and brand inputs
// (golden/brands/<id>/), static files under /files/out and /files/brands, and - in serve mode - the built UI
// (packages/ui/dist/). node:http only. Every path the API returns is repo-relative; no absolute path leaves it.
import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StudioError, createStudio } from './studio.js';

export const MIME = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
});

/** The JSON files of out/<id>/ the API serves by name (`review` falls back to `{}`). */
const OUT_JSON = Object.freeze({
  'brand-spec': 'brand-spec.json',
  mood: 'mood.json',
  deck: 'deck.json',
  report: 'report.json',
  questions: 'questions.json',
  checks: 'checks.json',
  review: 'review.json',
});

const LOG_LINES = 200;
const BODY_LIMIT = 1024 * 1024;
const BRAND_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mimeOf = (file) => MIME[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function readJson(file) {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** True when `target` is `root` itself or a path inside it (after resolution). */
function inside(root, target) {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': MIME.json,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

function sendFile(res, file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    throw new HttpError(404, 'not found');
  }
  if (!st.isFile()) throw new HttpError(404, 'not found');
  res.writeHead(200, {
    'Content-Type': mimeOf(file),
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
    'Last-Modified': st.mtime.toUTCString(),
  });
  if (res.req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        fail(new HttpError(413, 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return ok({});
      try {
        ok(JSON.parse(text));
      } catch {
        fail(new HttpError(400, 'body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

/** The quick facts of a build report the brands table shows (checks summary only for Report v1). */
function reportFacts(report) {
  const checks = report?.checks;
  const v1 = typeof checks?.version === 'string' && checks.version.startsWith('1.');
  return {
    report: v1 ? (checks.summary ?? null) : null,
    checksVersion: checks?.version ?? null,
    counts: report?.counts ?? null,
    engineVersion: report?.engineVersion ?? null,
  };
}

/**
 * The server for one repository layout. Options:
 * - `repoRoot` (required): the folder holding out/, golden/brands/, golden/expected/ and packages/cli/bin/pb.js;
 * - `distDir`: the built UI to serve (default `<repoRoot>/packages/ui/dist`); `apiOnly` serves the API + files only;
 * - `spawn`: child_process.spawn replacement (tests); `loadDiff`: () => Promise<module with diffDecks> (tests);
 * - `nodeBin`: the node executable for builds (default process.execPath);
 * - `studio`: the Studio (server/studio.js) to serve under /api/studio/ (default createStudio for this repo; `cacheDir`
 *   is passed to it).
 * Returns an http.Server (not listening) with `.studio`.
 */
export function createServer(options = {}) {
  const { repoRoot, apiOnly = false, spawn = nodeSpawn, nodeBin = process.execPath } = options;
  if (!repoRoot) throw new Error('createServer: repoRoot is required');
  const root = resolve(repoRoot);
  const distDir = resolve(options.distDir ?? join(root, 'packages', 'ui', 'dist'));
  const outRoot = join(root, 'out');
  const brandsRoot = join(root, 'golden', 'brands');
  const expectedRoot = join(root, 'golden', 'expected');
  const loadDiff =
    options.loadDiff ?? (() => import(pathToFileURL(join(root, 'packages', 'cli', 'src', 'diff.js')).href));
  const builds = new Map();
  const studio = options.studio ?? createStudio({ root, cacheDir: options.cacheDir, loadDiff });

  const outDir = (id) => join(outRoot, id);
  const brandDir = (id) => join(brandsRoot, id);

  function brandIds() {
    const list = (dir) => {
      try {
        return readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && BRAND_ID.test(d.name) && !d.name.startsWith('_'))
          .map((d) => d.name);
      } catch {
        return [];
      }
    };
    return [...new Set([...list(outRoot), ...list(brandsRoot)])].sort();
  }

  function brandEntry(id) {
    const out = outDir(id);
    const inputFile = join(brandDir(id), `${id}.json`);
    const input = existsSync(inputFile);
    const deckFile = join(out, 'deck.json');
    const built = existsSync(deckFile);
    const spec = readJson(join(out, 'brand-spec.json'));
    const report = readJson(join(out, 'report.json'));
    const questions = readJson(join(out, 'questions.json'));
    const review = readJson(join(out, 'review.json'));
    const answersFile = join(brandDir(id), 'answers.json');
    const reportFile = join(out, 'report.json');
    const builtAt = existsSync(reportFile) ? statSync(reportFile).mtime.toISOString() : null;
    const buildHash = spec?.input?.sha256 ?? null;
    const inputHash = input ? sha256(readFileSync(inputFile)) : null;
    const deckHash = built ? sha256(readFileSync(deckFile)) : null;
    const qs = Array.isArray(questions) ? questions : [];
    return {
      id,
      name: spec?.name ?? null,
      out: built,
      input,
      ...reportFacts(report),
      stale: Boolean(input && built && inputHash !== buildHash),
      answersNewer: Boolean(
        builtAt && existsSync(answersFile) && statSync(answersFile).mtime.toISOString() > builtAt,
      ),
      builtAt,
      deckHash,
      questions: {
        blocking: qs.filter((q) => q.severity === 'blocking').length,
        optional: qs.filter((q) => q.severity !== 'blocking').length,
      },
      signedOff: Boolean(review?.signedOff),
      signedOffDate: review?.signedOff ? (review.date ?? null) : null,
      reviewStale: Boolean(review?.signedOff && deckHash && review.deckHash !== deckHash),
      building: Boolean(builds.get(id)?.running),
    };
  }

  function requireBrand(id) {
    if (!BRAND_ID.test(id) || id.startsWith('_')) throw new HttpError(400, `bad brand id "${id}"`);
    if (!isDir(outDir(id)) && !isDir(brandDir(id))) throw new HttpError(404, `unknown brand "${id}"`);
  }

  function buildState(id) {
    const b = builds.get(id);
    if (!b) return { running: false, log: [], exitCode: null, png: false, startedAt: null, finishedAt: null };
    return {
      running: b.running,
      log: b.log.slice(),
      exitCode: b.exitCode,
      png: b.png,
      startedAt: b.startedAt,
      finishedAt: b.finishedAt,
    };
  }

  function startBuild(id, png) {
    if (builds.get(id)?.running) throw new HttpError(409, `a build of "${id}" is already running`);
    if (!existsSync(join(brandDir(id), `${id}.json`))) {
      throw new HttpError(404, `no brand input golden/brands/${id}/${id}.json`);
    }
    const args = ['packages/cli/bin/pb.js', 'build', `golden/brands/${id}`];
    if (png) args.push('--png');
    const b = {
      running: true,
      log: [`$ node ${args.join(' ')}`],
      exitCode: null,
      png,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    builds.set(id, b);
    const push = (text) => {
      for (const line of String(text).split(/\r?\n/)) {
        if (line === '') continue;
        b.log.push(line);
      }
      if (b.log.length > LOG_LINES) b.log.splice(0, b.log.length - LOG_LINES);
    };
    const finish = (code) => {
      if (!b.running) return;
      b.running = false;
      b.exitCode = code;
      b.finishedAt = new Date().toISOString();
      push(`exit ${code}`);
    };
    let child;
    try {
      child = spawn(nodeBin, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      push(`spawn failed: ${err.message}`);
      finish(-1);
      return buildState(id);
    }
    child.stdout?.on('data', push);
    child.stderr?.on('data', push);
    child.on('error', (err) => {
      push(`spawn failed: ${err.message}`);
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
    return buildState(id);
  }

  function mergeAnswers(id, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'answers must be an object of JSON pointer -> value');
    }
    for (const pointer of Object.keys(body)) {
      if (pointer !== '' && !pointer.startsWith('/'))
        throw new HttpError(400, `"${pointer}" is not a JSON pointer`);
    }
    if (!existsSync(join(brandDir(id), `${id}.json`))) {
      throw new HttpError(404, `no brand input golden/brands/${id}/${id}.json`);
    }
    const file = join(brandDir(id), 'answers.json');
    const current = readJson(file);
    if (
      current === null ||
      (current !== undefined && (typeof current !== 'object' || Array.isArray(current)))
    ) {
      throw new HttpError(409, `golden/brands/${id}/answers.json is not an object of JSON pointer -> value`);
    }
    const merged = { ...(current ?? {}), ...body };
    writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
    return merged;
  }

  function writeReview(id, body) {
    if (!body || typeof body !== 'object' || typeof body.signedOff !== 'boolean') {
      throw new HttpError(400, 'review needs { signedOff: boolean, notes?: string }');
    }
    if (body.notes !== undefined && typeof body.notes !== 'string')
      throw new HttpError(400, 'notes must be a string');
    const deckFile = join(outDir(id), 'deck.json');
    if (!existsSync(deckFile)) throw new HttpError(404, `no build: out/${id}/deck.json is missing`);
    const bytes = readFileSync(deckFile);
    let engineVersion = null;
    try {
      engineVersion = JSON.parse(bytes.toString('utf8')).engineVersion ?? null;
    } catch {
      engineVersion = null;
    }
    const review = {
      signedOff: body.signedOff,
      notes: body.notes ?? '',
      date: new Date().toISOString(),
      engineVersion,
      deckHash: sha256(bytes),
    };
    writeFileSync(join(outDir(id), 'review.json'), `${JSON.stringify(review, null, 2)}\n`);
    return review;
  }

  async function diff(id) {
    const current = join(outDir(id), 'deck.json');
    const golden = join(expectedRoot, id, 'deck.json');
    if (!existsSync(current)) throw new HttpError(404, `out/${id}/deck.json is missing`);
    if (!existsSync(golden)) throw new HttpError(404, `golden/expected/${id}/deck.json is missing`);
    let diffDecks;
    try {
      diffDecks = (await loadDiff())?.diffDecks;
    } catch {
      diffDecks = undefined;
    }
    if (typeof diffDecks !== 'function') throw new HttpError(501, 'diff not available');
    // a = the golden snapshot (before), b = this build (after).
    const a = JSON.parse(readFileSync(golden, 'utf8'));
    const b = JSON.parse(readFileSync(current, 'utf8'));
    return diffDecks(a, b);
  }

  /** A static file under one of the two file roots; anything resolving outside it -> 403. */
  function serveRootFile(res, base, rest) {
    let rel;
    try {
      rel = decodeURIComponent(rest);
    } catch {
      throw new HttpError(400, 'bad path encoding');
    }
    if (rel.includes('\0')) throw new HttpError(400, 'bad path');
    const target = resolve(base, `.${sep}${rel}`);
    if (!inside(base, target) || target === base) throw new HttpError(403, 'forbidden');
    sendFile(res, target);
  }

  function serveDist(res, pathname) {
    if (!existsSync(join(distDir, 'index.html'))) {
      throw new HttpError(503, 'the UI is not built: run npm run build:ui (or use npm run dev:ui)');
    }
    if (pathname === '/' || pathname === '/index.html') return sendFile(res, join(distDir, 'index.html'));
    serveRootFile(res, distDir, pathname.slice(1));
  }

  /** The Studio API (docs/PLAN-studio.md §2.1): brands, contents, compose, covers, layouts, overrides, diff, export. */
  async function studioRoute(req, res, pathname) {
    const method = req.method;
    const read = method === 'GET' || method === 'HEAD';
    const query = new URLSearchParams(req.url.split('?')[1] ?? '');
    const parts = pathname
      .slice('/api/studio/'.length)
      .split('/')
      .filter(Boolean)
      .map((p) => {
        try {
          return decodeURIComponent(p);
        } catch {
          throw new HttpError(400, 'bad path encoding');
        }
      });
    const [what, a, b] = parts;
    const only = (ok) => {
      if (!ok) throw new HttpError(405, 'method not allowed');
    };
    if (what === 'brands' && !a) {
      only(read);
      return sendJson(res, 200, studio.brands());
    }
    if (what === 'brands' && a && !b) {
      only(read);
      return sendJson(res, 200, studio.brandDetail(a));
    }
    if (what === 'brands' && a && b === 'reconvert') {
      only(method === 'POST');
      studio.brand(a, { force: true });
      return sendJson(res, 200, studio.brandDetail(a));
    }
    if (what === 'contents' && !a) {
      only(read);
      return sendJson(res, 200, studio.contents());
    }
    if (what === 'compose' && !a) {
      only(method === 'POST');
      const body = await readBody(req);
      return sendJson(
        res,
        200,
        studio.compose({ brandId: body.brandId, contentId: body.contentId, overrides: body.overrides }),
      );
    }
    if (what === 'covers' && !a) {
      only(read);
      return sendJson(res, 200, studio.covers(query.get('contentId') ?? 'showcase'));
    }
    if (what === 'layouts' && !a) {
      only(read);
      return sendJson(
        res,
        200,
        studio.layouts({ kind: query.get('kind') || undefined, brandId: query.get('brandId') || undefined }),
      );
    }
    if (what === 'overrides' && a && b && parts.length === 3) {
      if (read) return sendJson(res, 200, studio.readOverrides(a, b));
      only(method === 'PUT');
      return sendJson(res, 200, studio.writeOverrides(a, b, await readBody(req)));
    }
    if (what === 'diff' && !a) {
      only(method === 'POST');
      const body = await readBody(req);
      return sendJson(res, 200, await studio.diff(body));
    }
    if (what === 'export' && !a) {
      only(method === 'POST');
      const body = await readBody(req);
      return sendJson(
        res,
        200,
        await studio.exportDeck({
          brandId: body.brandId,
          contentId: body.contentId,
          pdf: Boolean(body.pdf),
          png: Boolean(body.png),
        }),
      );
    }
    throw new HttpError(404, 'not found');
  }

  async function route(req, res) {
    const method = req.method;
    // The raw path (no WHATWG normalisation of "..", so traversal attempts are seen and refused).
    const pathname = req.url.split('?')[0].split('#')[0];
    const read = method === 'GET' || method === 'HEAD';

    if (pathname.startsWith('/files/')) {
      if (!read) throw new HttpError(405, 'method not allowed');
      if (pathname.startsWith('/files/out/'))
        return serveRootFile(res, outRoot, pathname.slice('/files/out/'.length));
      if (pathname.startsWith('/files/brands/')) {
        return serveRootFile(res, brandsRoot, pathname.slice('/files/brands/'.length));
      }
      // out/<id>/mood.html references the brand folder relative to itself (../../golden/brands/<id>/...): the same root
      if (pathname.startsWith('/files/golden/brands/')) {
        return serveRootFile(res, brandsRoot, pathname.slice('/files/golden/brands/'.length));
      }
      throw new HttpError(404, 'not found');
    }

    if (pathname === '/api/brands' || pathname === '/api/brands/') {
      if (!read) throw new HttpError(405, 'method not allowed');
      return sendJson(res, 200, brandIds().map(brandEntry));
    }

    const m = /^\/api\/brands\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
    if (m) {
      let id;
      try {
        id = decodeURIComponent(m[1]);
      } catch {
        throw new HttpError(400, 'bad brand id');
      }
      const what = m[2];
      requireBrand(id);
      if (!what) {
        if (!read) throw new HttpError(405, 'method not allowed');
        return sendJson(res, 200, brandEntry(id));
      }
      if (what === 'build') {
        if (read) return sendJson(res, 200, buildState(id));
        if (method !== 'POST') throw new HttpError(405, 'method not allowed');
        const body = await readBody(req);
        return sendJson(res, 202, startBuild(id, Boolean(body?.png)));
      }
      if (what === 'answers') {
        if (read) {
          const answers = readJson(join(brandDir(id), 'answers.json'));
          if (answers === null)
            throw new HttpError(409, `golden/brands/${id}/answers.json is not valid JSON`);
          return sendJson(res, 200, answers ?? {});
        }
        if (method !== 'POST') throw new HttpError(405, 'method not allowed');
        return sendJson(res, 200, mergeAnswers(id, await readBody(req)));
      }
      if (what === 'review' && method === 'POST') {
        return sendJson(res, 200, writeReview(id, await readBody(req)));
      }
      if (!read) throw new HttpError(405, 'method not allowed');
      if (what === 'diff') return sendJson(res, 200, await diff(id));
      const file = OUT_JSON[what];
      if (!file) throw new HttpError(404, `unknown resource "${what}"`);
      const value = readJson(join(outDir(id), file));
      if (value === undefined) {
        if (what === 'review') return sendJson(res, 200, {});
        throw new HttpError(404, `out/${id}/${file} is missing`);
      }
      if (value === null) throw new HttpError(500, `out/${id}/${file} is not valid JSON`);
      return sendJson(res, 200, value);
    }

    if (pathname.startsWith('/api/studio/')) return studioRoute(req, res, pathname);
    if (pathname.startsWith('/api/')) throw new HttpError(404, 'not found');
    if (apiOnly) throw new HttpError(404, 'not found (API-only server: the UI is served by webpack in dev)');
    if (!read) throw new HttpError(405, 'method not allowed');
    return serveDist(res, pathname);
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      const status = err instanceof HttpError || err instanceof StudioError ? err.status : 500;
      if (res.headersSent) return res.destroy();
      sendJson(res, status, { error: err.message });
    });
  });
  server.studio = studio;
  return server;
}

/** createServer(options) listening on `port` (default 8100) at `host` (default localhost). Resolves the server. */
export function startServer({ port = 8100, host = 'localhost', ...options } = {}) {
  const server = createServer(options);
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      // derive every brand once, after the port is open (the Studio's brand cache, ~20 ms per brand)
      setImmediate(() => {
        try {
          server.studio.warm();
        } catch (err) {
          console.error(`studio: warm-up failed: ${err.message}`);
        }
      });
      ok(server);
    });
  });
}
