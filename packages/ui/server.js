#!/usr/bin/env node
// The review UI server (P3-spec §C.1). `node packages/ui/server.js [--port 8100] [--host localhost] [--api-only]`.
// Serve mode (default): the built UI (packages/ui/dist/) + the API + files on one port.
// --api-only: the API + files only (dev: webpack-dev-server on 8100 proxies /api and /files to it, port 8101).
// --root <dir>: the data root (golden/brands/, golden/showcase/, content/, out/) - default this checkout; the browser
// e2e tests run the Studio on a sandbox copy so the checkout's content/ is never touched (P4.4). The UI, the CLI and
// the font metrics cache stay this checkout's.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server/index.js';

function parseArgs(argv) {
  const opts = { port: 8100, host: 'localhost', apiOnly: false, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--api-only') opts.apiOnly = true;
    else if (a === '--port') opts.port = Number(argv[(i += 1)]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice('--port='.length));
    else if (a === '--host') opts.host = argv[(i += 1)];
    else if (a === '--root') opts.root = argv[(i += 1)];
    else if (a.startsWith('--root=')) opts.root = a.slice('--root='.length);
    else if (a.startsWith('--host=')) opts.host = a.slice('--host='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        'usage: node packages/ui/server.js [--port 8100] [--host localhost] [--api-only] [--root <data dir>]',
      );
      process.exit(0);
    } else {
      console.error(`server: unknown argument "${a}"`);
      process.exit(1);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    console.error('server: --port must be an integer 0..65535');
    process.exit(1);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const codeRoot = fileURLToPath(new URL('../..', import.meta.url));
const { root, ...serverOpts } = opts;
const repoRoot = root ? resolve(root) : codeRoot;

startServer({ ...serverOpts, repoRoot, codeRoot })
  .then((server) => {
    const { port } = server.address();
    const what = opts.apiOnly ? 'API' : 'UI + API';
    console.log(`pb ui: ${what} on http://${opts.host}:${port}/${root ? ` (data root ${repoRoot})` : ''}`);
  })
  .catch((err) => {
    console.error(`server: ${err.message}`);
    process.exit(1);
  });
