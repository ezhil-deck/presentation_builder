// Thin fetch helpers for the local API (P3-spec §C.1). Every call is relative, so dev (webpack proxy) and serve
// mode (one port) behave the same.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function parse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  return body;
}

/** GET a JSON resource; `null` when it is absent (404). */
export async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  return parse(res);
}

/** GET that keeps the error (status + message) instead of throwing - for optional views (diff). */
export async function getJsonResult(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    return { status: res.status, data: await parse(res), error: null };
  } catch (err) {
    return { status: err.status ?? 0, data: null, error: err.message };
  }
}

export async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return parse(res);
}

const enc = encodeURIComponent;

export const api = {
  brands: () => getJson('/api/brands'),
  brand: (id) => getJson(`/api/brands/${enc(id)}`),
  file: (id, name) => getJson(`/api/brands/${enc(id)}/${name}`),
  diff: (id) => getJsonResult(`/api/brands/${enc(id)}/diff`),
  answers: (id) => getJson(`/api/brands/${enc(id)}/answers`),
  saveAnswers: (id, answers) => postJson(`/api/brands/${enc(id)}/answers`, answers),
  saveReview: (id, review) => postJson(`/api/brands/${enc(id)}/review`, review),
  build: (id, png) => postJson(`/api/brands/${enc(id)}/build`, { png: Boolean(png) }),
  buildState: (id) => getJson(`/api/brands/${enc(id)}/build`),
};

/** URL bases the renderer resolves deck assets / fonts against (files of the brand folder). */
export const brandFilesBase = (id) => `/files/brands/${enc(id)}/`;
export const outFile = (id, rel) => `/files/out/${enc(id)}/${rel}`;
