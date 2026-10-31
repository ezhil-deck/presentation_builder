import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A fresh copy of a BrandSpec fixture (tests may mutate it). */
export function load(name) {
  return JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', `${name}.brand-spec.json`), 'utf8'));
}

export function readJson(...parts) {
  return JSON.parse(readFileSync(join(__dirname, ...parts), 'utf8'));
}

export const messages = (res) => res.warnings.map((w) => w.message);
