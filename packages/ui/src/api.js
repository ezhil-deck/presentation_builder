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

export async function postJson(url, body, method = 'POST') {
  const res = await fetch(url, {
    method,
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

/** The Studio API (docs/PLAN-studio.md §2.1): compose runs on the server, the browser paints what it returns. */
export const studioApi = {
  brands: () => getJson('/api/studio/brands'),
  brand: (id) => getJson(`/api/studio/brands/${enc(id)}`),
  reconvert: (id) => postJson(`/api/studio/brands/${enc(id)}/reconvert`, {}),
  contents: () => getJson('/api/studio/contents'),
  compose: (brandId, contentId, overrides) =>
    postJson('/api/studio/compose', { brandId, contentId, ...(overrides ? { overrides } : {}) }),
  covers: (contentId) => getJson(`/api/studio/covers?contentId=${enc(contentId)}`),
  layouts: ({ kind, brandId } = {}) => {
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    if (brandId) q.set('brandId', brandId);
    const s = q.toString();
    return getJson(`/api/studio/layouts${s ? `?${s}` : ''}`);
  },
  overrides: (contentId, brandId) => getJson(`/api/studio/overrides/${enc(contentId)}/${enc(brandId)}`),
  saveOverrides: (contentId, brandId, overrides) =>
    postJson(`/api/studio/overrides/${enc(contentId)}/${enc(brandId)}`, overrides, 'PUT'),
  diff: async (brandId, contentId) => {
    try {
      return { status: 200, data: await postJson('/api/studio/diff', { brandId, contentId }), error: null };
    } catch (err) {
      return { status: err.status ?? 0, data: null, error: err.message };
    }
  },
  exportDeck: (brandId, contentId, { pdf = false, png = false } = {}) =>
    postJson('/api/studio/export', { brandId, contentId, pdf, png }),
};

/** URL bases the renderer resolves deck assets / fonts against (files of the brand folder). */
export const brandFilesBase = (id) => `/files/brands/${enc(id)}/`;
export const outFile = (id, rel) => `/files/out/${enc(id)}/${rel}`;
