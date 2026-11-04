// The export writer without Chrome: the <base> injection, the cleanup on failure / timeout with a fake browser, the
// bounded close (kill as the last resort) and withBrowser's lock.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireBrowserLock, closeBrowser, injectBase, withBrowser, withPage } from '../src/index.js';

const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>t</title>' +
  '<style>@font-face{font-family:X;src:url(assets/x.ttf)}</style></head>' +
  '<body><img src="assets/a.png"></body></html>';

describe('injectBase', () => {
  it('puts <base href="file://…/basePath/"> first in the head, after <meta charset>, before every URL', () => {
    const out = injectBase(HTML, '/tmp/brand dir/a&b');
    const tag = '<base href="file:///tmp/brand%20dir/a&amp;b/">';
    expect(out).toBe(HTML.replace('<meta charset="utf-8">', `<meta charset="utf-8">${tag}`));
    expect(out.indexOf(tag)).toBeLessThan(out.indexOf('@font-face'));
    expect(out.indexOf(tag)).toBeLessThan(out.indexOf('<img'));
  });

  it('a trailing slash is not doubled; a head without <meta charset> takes the base first', () => {
    expect(injectBase('<html><head><title>x</title></head></html>', '/a/b/')).toBe(
      '<html><head><base href="file:///a/b/"><title>x</title></head></html>',
    );
  });

  it('a document with its own <base> is unchanged; one without <head> gets the base after the doctype', () => {
    const own = '<html><head><base href="http://x/"></head><body></body></html>';
    expect(injectBase(own, '/a')).toBe(own);
    expect(injectBase('<!doctype html><p>x</p>', '/a')).toBe(
      '<!doctype html><base href="file:///a/"><p>x</p>',
    );
    // '<base' in the body is text, not a base element of the document
    expect(injectBase('<head></head><body><pre><base</pre></body>', '/a')).toBe(
      '<head><base href="file:///a/"></head><body><pre><base</pre></body>',
    );
  });
});

/** A puppeteer-shaped fake: records calls; `evaluate` / `close` behaviour configurable. */
function fakeBrowser({ evaluate = async () => null, close = async () => {} } = {}) {
  const calls = [];
  const page = {
    setViewport: async () => calls.push('setViewport'),
    goto: async (url) => {
      calls.push('goto');
      page.url = url;
      page.fileExisted = existsSync(fileURLToPath(url));
    },
    evaluate: (...a) => {
      calls.push('evaluate');
      return evaluate(...a);
    },
    close: async () => calls.push('page.close'),
  };
  const browser = {
    calls,
    page,
    newPage: async () => page,
    close: () => {
      calls.push('browser.close');
      return close();
    },
    process: () => ({ pid: 999999 }),
  };
  return browser;
}

describe('withPage (fake browser)', () => {
  let lockDir;
  beforeEach(() => {
    lockDir = mkdtempSync(join(tmpdir(), 'pb-lock-test-'));
  });
  afterEach(() => rmSync(lockDir, { recursive: true, force: true }));
  const lock = () => ({ dir: lockDir, timeoutMs: 2000 });
  const lockPath = () => join(lockDir, 'pb-chrome.lock');

  it('a failing fn(page) still removes the temp file, closes the own browser and releases the lock', async () => {
    const b = fakeBrowser();
    let heldDuring = null;
    await expect(
      withPage(HTML, { basePath: '/x', launch: async () => b, lock: lock() }, async () => {
        heldDuring = existsSync(lockPath());
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(heldDuring).toBe(true);
    expect(b.page.fileExisted).toBe(true);
    const file = fileURLToPath(b.page.url);
    expect(file.startsWith(tmpdir())).toBe(true); // a temp dir, never basePath
    expect(existsSync(file)).toBe(false);
    expect(b.calls).toEqual(['setViewport', 'goto', 'evaluate', 'page.close', 'browser.close']);
    expect(existsSync(lockPath())).toBe(false);
  });

  it('a stuck document.fonts.ready fails after the fonts timeout and cleans up', async () => {
    const b = fakeBrowser({ evaluate: () => new Promise(() => {}) });
    const fn = jest.fn();
    await expect(
      withPage(HTML, { launch: async () => b, lock: lock(), timeouts: { fonts: 50 } }, fn),
    ).rejects.toThrow('document.fonts.ready timed out after 50 ms');
    expect(fn).not.toHaveBeenCalled();
    expect(existsSync(fileURLToPath(b.page.url))).toBe(false);
    expect(b.calls.slice(-2)).toEqual(['page.close', 'browser.close']);
    expect(existsSync(lockPath())).toBe(false);
  });

  it('a passed browser is used as is: no lock taken, not closed', async () => {
    const release = await acquireBrowserLock({ dir: lockDir }); // held elsewhere: an own launch would wait
    try {
      const b = fakeBrowser();
      const r = await withPage(HTML, { browser: b, lock: { dir: lockDir, timeoutMs: 50 } }, async () => 42);
      expect(r).toBe(42);
      expect(b.calls).not.toContain('browser.close');
    } finally {
      release();
    }
  });

  it('an own launch waits for the lock (negative: times out while another holder has it)', async () => {
    const release = await acquireBrowserLock({ dir: lockDir });
    try {
      const launch = jest.fn(async () => fakeBrowser());
      await expect(
        withPage(HTML, { launch, lock: { dir: lockDir, timeoutMs: 100 } }, async () => 1),
      ).rejects.toThrow(/still held after 100 ms/);
      expect(launch).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});

describe('closeBrowser', () => {
  afterEach(() => jest.restoreAllMocks());

  it('closes normally', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    expect(await closeBrowser(fakeBrowser())).toBe('closed');
    expect(kill).not.toHaveBeenCalled();
  });

  it('a hanging close() is cut off and Chrome is killed by pid', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    const b = fakeBrowser({ close: () => new Promise(() => {}) });
    expect(await closeBrowser(b, { timeoutMs: 30 })).toBe('killed');
    expect(kill).toHaveBeenCalledWith(999999, 'SIGKILL');
  });

  it('a throwing close() also kills; no process left is "gone", never a throw', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    const b = fakeBrowser({ close: () => Promise.reject(new Error('disconnected')) });
    expect(await closeBrowser(b)).toBe('killed');
    expect(kill).toHaveBeenCalledTimes(1);
    const gone = { close: () => Promise.reject(new Error('x')), process: () => null };
    expect(await closeBrowser(gone)).toBe('gone');
  });
});

describe('withBrowser', () => {
  it('holds the lock while fn runs, closes the browser and releases after a failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-lock-test-'));
    try {
      const b = fakeBrowser();
      await expect(
        withBrowser(
          async () => {
            expect(existsSync(join(dir, 'pb-chrome.lock'))).toBe(true);
            throw new Error('render failed');
          },
          { launch: async () => b, lock: { dir } },
        ),
      ).rejects.toThrow('render failed');
      expect(b.calls).toEqual(['browser.close']);
      expect(existsSync(join(dir, 'pb-chrome.lock'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
