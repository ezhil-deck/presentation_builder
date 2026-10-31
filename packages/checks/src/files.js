/**
 * `filesFrom(brandDir)` (P3-spec §A): the node implementation of the checks' `files` interface — `exists(relPath)`
 * resolved against the brand folder. Kept out of ./index.js so @pb/checks stays browser-safe.
 */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';

export function filesFrom(brandDir) {
  const root = resolve(brandDir);
  return {
    root,
    exists(relPath) {
      if (typeof relPath !== 'string' || !relPath || isAbsolute(relPath)) return false;
      const p = join(root, normalize(relPath));
      if (p !== root && !p.startsWith(`${root}/`) && !p.startsWith(`${root}\\`)) return false;
      return existsSync(p) && statSync(p).isFile();
    },
  };
}
