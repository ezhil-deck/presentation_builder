import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', '__fixtures__');
export const ASSETS = join(FIXTURES, 'assets');

/** A fresh copy of the two-slide fixture deck (tests may mutate it). */
export function loadDeck() {
  return JSON.parse(readFileSync(join(FIXTURES, 'two-slides.deck.json'), 'utf8'));
}

/** schemas/deck.schema.json validator (ajv 8 / draft 2020-12, resolved from @pb/mood which depends on it). */
export function deckValidator() {
  const req = createRequire(join(__dirname, '..', '..', 'mood', 'package.json'));
  const Ajv2020 = req('ajv/dist/2020.js');
  const ajv = new (Ajv2020.default ?? Ajv2020)({ allErrors: true, allowUnionTypes: true, strict: false });
  const schema = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'schemas', 'deck.schema.json'), 'utf8'),
  );
  return ajv.compile(schema);
}

/** The outer HTML of the `<div data-element-id="id">` box (div-depth scan). */
export function elementHtml(html, id) {
  const at = html.indexOf(`data-element-id="${id}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf('<div', at);
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  return null;
}

/** Parses an inline style attribute value into {prop: value}. */
export function parseStyle(style) {
  const out = {};
  for (const decl of style.replace(/&quot;/g, '"').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** Every opening tag matching `re` (on the tag text) with its parsed style. */
export function tags(html, re) {
  return [...html.matchAll(/<[a-z]+\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((t) => re.test(t))
    .map((t) => ({ tag: t, style: parseStyle(/style="([^"]*)"/.exec(t)?.[1] ?? '') }));
}

export const count = (html, needle) => html.split(needle).length - 1;
