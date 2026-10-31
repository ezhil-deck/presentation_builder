import { useEffect, useState } from 'react';

export const TABS = ['slides', 'checks', 'questions', 'mood', 'diff', 'report'];

/**
 * The hash routes (P3-spec §C.2): `#/` brands, `#/b/<id>` brand (slides tab), `#/b/<id>/<tab>`,
 * `#/b/<id>/slides/<n>` (slide n, 1-based, large).
 */
export function parseHash(hash) {
  const path = String(hash ?? '')
    .replace(/^#/, '')
    .replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  if (parts[0] !== 'b' || !parts[1]) return { page: 'brands' };
  const id = parts[1];
  const tab = TABS.includes(parts[2]) ? parts[2] : 'slides';
  const route = { page: 'brand', id, tab, slide: null };
  if (tab === 'slides' && parts[3]) {
    const n = Number(parts[3]);
    if (Number.isInteger(n) && n >= 1) route.slide = n;
  }
  return route;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function hrefFor({ id, tab, slide } = {}) {
  if (!id) return '#/';
  const base = `#/b/${encodeURIComponent(id)}`;
  if (tab === 'slides' && slide) return `${base}/slides/${slide}`;
  if (!tab || tab === 'slides') return base;
  return `${base}/${tab}`;
}

export function navigate(target) {
  window.location.hash = hrefFor(target).slice(1);
}

const currentHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(currentHash()));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(currentHash()));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
