// The cross-process Chrome lock (packages/export/src/lock.js): serialisation in one process and across processes,
// stale takeover (old, dead holder), release, timeout - and, as the negative, what overlaps without it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireBrowserLock } from '../src/lock.js';

const LOCK_JS = join(__dirname, '..', 'src', 'lock.js');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

let dir;
const lockDir = () => join(dir, 'pb-chrome.lock');
const owner = () => JSON.parse(readFileSync(join(lockDir(), 'owner.json'), 'utf8'));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pb-lock-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Two "Chrome launches" (start, work 80 ms, end) at once; returns the most that ran at the same time. */
async function twoLaunches(withLock) {
  let active = 0;
  let most = 0;
  const launch = async () => {
    const release = withLock ? await acquireBrowserLock({ dir, timeoutMs: 5000 }) : () => {};
    try {
      active += 1;
      most = Math.max(most, active);
      await sleep(80);
      active -= 1;
    } finally {
      release();
    }
  };
  await Promise.all([launch(), launch()]);
  return most;
}

describe('acquireBrowserLock', () => {
  it('writes pid + time inside the lock directory; release removes it (twice is harmless)', async () => {
    const release = await acquireBrowserLock({ dir });
    expect(owner()).toMatchObject({ pid: process.pid, token: expect.any(String) });
    expect(Math.abs(owner().time - Date.now())).toBeLessThan(5000);
    release();
    expect(existsSync(lockDir())).toBe(false);
    release();
  });

  it('two acquirers in one process serialise: the second gets the lock only after the first releases', async () => {
    const order = [];
    const first = await acquireBrowserLock({ dir });
    const second = acquireBrowserLock({ dir, timeoutMs: 5000 }).then((release) => {
      order.push('second acquired');
      return release;
    });
    await sleep(150);
    order.push('first releases');
    first();
    const release2 = await second;
    expect(order).toEqual(['first releases', 'second acquired']);
    release2();
  });

  it('serialises across processes', async () => {
    const script =
      `import { acquireBrowserLock } from ${JSON.stringify(pathToFileURL(LOCK_JS).href)};` +
      `const r = await acquireBrowserLock({ dir: ${JSON.stringify(dir)} });` +
      `process.stdout.write('held\\n'); setTimeout(() => { r(); process.stdout.write('released\\n'); }, 300);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script]);
    let text = '';
    await new Promise((ok, fail) => {
      child.stdout.on('data', (d) => {
        text += d;
        if (text.includes('held')) ok();
      });
      child.on('error', fail);
      child.on('exit', (code) => (text.includes('held') ? null : fail(new Error(`child exited ${code}`))));
    });
    const asked = Date.now();
    const release = await acquireBrowserLock({ dir, timeoutMs: 5000 });
    const waited = Date.now() - asked;
    expect(text).toContain('released');
    expect(waited).toBeGreaterThan(100);
    release();
    await new Promise((ok) => (child.exitCode !== null ? ok() : child.on('exit', ok)));
  });

  it('a lock older than 5 minutes is taken over', async () => {
    mkdirSync(lockDir());
    const old = { pid: process.pid, time: Date.now() - 6 * 60 * 1000, token: 'old' };
    writeFileSync(join(lockDir(), 'owner.json'), JSON.stringify(old));
    const release = await acquireBrowserLock({ dir, timeoutMs: 1000 });
    expect(owner().token).not.toBe('old');
    expect(owner().pid).toBe(process.pid);
    release();
    expect(existsSync(lockDir())).toBe(false);
  });

  it('a lock whose holder process is gone is taken over at once (a killed worker never released it)', async () => {
    const dead = spawnSync(process.execPath, ['-e', '0']).pid;
    mkdirSync(lockDir());
    writeFileSync(
      join(lockDir(), 'owner.json'),
      JSON.stringify({ pid: dead, time: Date.now(), token: 'dead' }),
    );
    const asked = Date.now();
    const release = await acquireBrowserLock({ dir, timeoutMs: 1000 });
    expect(Date.now() - asked).toBeLessThan(500);
    expect(owner().token).not.toBe('dead');
    release();
  });

  it('a live, fresh lock is not taken over: the acquirer times out naming the holder', async () => {
    const release = await acquireBrowserLock({ dir });
    await expect(acquireBrowserLock({ dir, timeoutMs: 120 })).rejects.toThrow(
      new RegExp(`still held after 120 ms \\(pid ${process.pid} since `),
    );
    expect(existsSync(lockDir())).toBe(true);
    release();
  });

  it("release after a takeover leaves the new holder's lock alone", async () => {
    const stale = await acquireBrowserLock({ dir });
    // age the lock: the next acquirer takes it over
    const o = owner();
    writeFileSync(join(lockDir(), 'owner.json'), JSON.stringify({ ...o, time: Date.now() - 10 * 60 * 1000 }));
    const fresh = await acquireBrowserLock({ dir, timeoutMs: 1000 });
    const token = owner().token;
    stale();
    expect(owner().token).toBe(token);
    fresh();
    expect(existsSync(lockDir())).toBe(false);
  });

  it('negative: without the lock two launches overlap; with it they never do', async () => {
    expect(await twoLaunches(false)).toBe(2);
    expect(await twoLaunches(true)).toBe(1);
  });
});
