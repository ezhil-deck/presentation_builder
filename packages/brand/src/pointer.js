/** RFC 6901 JSON pointer helpers. */

export function escapeToken(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapeToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function toPointer(tokens) {
  return tokens.map((t) => `/${escapeToken(t)}`).join('');
}

export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`not a JSON pointer: "${pointer}"`);
  return pointer.slice(1).split('/').map(unescapeToken);
}

/** Value at `pointer` in `doc`, or undefined. */
export function getAt(doc, pointer) {
  let node = doc;
  for (const token of parsePointer(pointer)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(token)] : node[token];
  }
  return node;
}

/**
 * Set `value` at `pointer` in `doc` (mutates), creating missing parent objects. An array index may be a number or
 * `-` (append). The root itself cannot be replaced.
 */
export function setAt(doc, pointer, value) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) throw new Error('cannot set the document root');
  let node = doc;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const key = Array.isArray(node) ? Number(token) : token;
    if (node[key] === null || typeof node[key] !== 'object') {
      node[key] = /^\d+$/.test(tokens[i + 1]) ? [] : {};
    }
    node = node[key];
  }
  const last = tokens[tokens.length - 1];
  if (Array.isArray(node)) {
    if (last === '-') node.push(value);
    else node[Number(last)] = value;
  } else {
    node[last] = value;
  }
}

/** True when `pointer` equals `base` or lies under it. */
export function isUnder(pointer, base) {
  return pointer === base || pointer.startsWith(`${base}/`);
}
