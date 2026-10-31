import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', '__fixtures__');
export const MINI = join(FIXTURES, 'mini');
export const GOLDEN = join(__dirname, '..', '..', '..', 'golden', 'brands');

export function readMiniInput() {
  return JSON.parse(readFileSync(join(MINI, 'mini.json'), 'utf8'));
}

/**
 * A throw-away copy of the mini brand (folder named `mini`, as the id requires). `edit(input)` may change the JSON
 * in place. Returns `{ dir, cleanup }`.
 */
export function miniCopy(edit) {
  const root = mkdtempSync(join(tmpdir(), 'pb-brand-'));
  const dir = join(root, 'mini');
  cpSync(MINI, dir, { recursive: true });
  if (edit) {
    const input = readMiniInput();
    edit(input, dir);
    writeFileSync(join(dir, 'mini.json'), JSON.stringify(input, null, 2));
  }
  return { dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function tmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pb-brand-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
