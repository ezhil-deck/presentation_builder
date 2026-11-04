import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A cross-process lock (one holder at a time across processes, e.g. jest workers): `mkdirSync` of `<dir>/<name>.lock`
 * is atomic, so whoever creates the directory holds the lock; the others retry with backoff until `timeoutMs`.
 * `owner.json` inside names the holder (`pid`, `time`, a random `token`). A lock is taken over when it is stale: older
 * than `staleMs` (default 5 minutes), or its holder's pid is no longer alive (a killed worker never released it).
 * The takeover renames the stale directory away (atomic, one renamer wins) and checks it moved the lock it judged
 * stale; a live lock moved by a lost race is put back. `release()` removes the directory only while this holder still
 * owns it (after a takeover it leaves the new holder's lock alone); locks still held at process exit are released.
 * Not re-entrant: a holder that acquires again waits for itself (and times out).
 */

const STALE_MS = 5 * 60 * 1000;
const held = new Map(); // lockDir -> token

function onExit() {
  for (const [lockDir, token] of held) {
    if (ownerOf(lockDir)?.token === token) rmSync(lockDir, { recursive: true, force: true });
  }
}
let exitHooked = false;

function ownerOf(lockDir) {
  try {
    return JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

/** Why the lock at `lockDir` may be taken over ('old' / 'dead'), or null while it is live. */
function staleReason(lockDir, staleMs, now) {
  const owner = ownerOf(lockDir);
  let time = owner?.time;
  if (!Number.isFinite(time)) {
    // created but owner.json not written yet (or unreadable): judge by the directory's age
    try {
      time = statSync(lockDir).mtimeMs;
    } catch {
      return null; // gone meanwhile: the next mkdir decides
    }
  }
  if (now - time > staleMs) return 'old';
  if (owner && !pidAlive(owner.pid)) return 'dead';
  return null;
}

function takeOver(lockDir, staleMs) {
  const before = ownerOf(lockDir);
  const aside = `${lockDir}.stale-${process.pid}-${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lockDir, aside);
  } catch {
    return; // someone else moved or released it
  }
  const moved = ownerOf(aside);
  const same = before ? moved?.token === before.token : !moved;
  if (!same && staleReason(aside, staleMs, Date.now()) === null) {
    // lost a race: this is a fresh, live lock - put it back unless a newer one is already there
    try {
      renameSync(aside, lockDir);
      return;
    } catch {
      /* lockDir exists again: drop the moved one below */
    }
  }
  rmSync(aside, { recursive: true, force: true });
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Waits for the lock and returns its `release()` function. Throws after `timeoutMs` without the lock, naming the
 * holder. Options: `dir` (default the OS temp dir), `name` (default 'pb-chrome'), `timeoutMs` (default 90 s),
 * `staleMs` (default 5 min), `pollMs` (first retry delay, doubled up to 1 s, with jitter).
 */
export async function acquireBrowserLock({
  dir = tmpdir(),
  name = 'pb-chrome',
  timeoutMs = 90000,
  staleMs = STALE_MS,
  pollMs = 25,
} = {}) {
  const lockDir = join(dir, `${name}.lock`);
  const token = randomBytes(8).toString('hex');
  const started = Date.now();
  let wait = pollMs;
  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        join(lockDir, 'owner.json'),
        JSON.stringify({ pid: process.pid, time: Date.now(), token }),
      );
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    if (staleReason(lockDir, staleMs, Date.now())) {
      takeOver(lockDir, staleMs);
      continue;
    }
    if (Date.now() - started >= timeoutMs) {
      const owner = ownerOf(lockDir);
      throw new Error(
        `acquireBrowserLock: ${lockDir} still held after ${timeoutMs} ms` +
          (owner ? ` (pid ${owner.pid} since ${new Date(owner.time).toISOString()})` : ''),
      );
    }
    await sleep(wait + Math.floor(Math.random() * wait));
    wait = Math.min(wait * 2, 1000);
  }
  held.set(lockDir, token);
  if (!exitHooked) {
    process.once('exit', onExit);
    exitHooked = true;
  }
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    held.delete(lockDir);
    if (ownerOf(lockDir)?.token === token) rmSync(lockDir, { recursive: true, force: true });
  };
}
