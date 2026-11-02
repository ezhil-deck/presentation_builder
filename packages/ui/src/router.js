import { useEffect, useState } from 'react';

export const TABS = ['slides', 'checks', 'questions', 'mood', 'diff', 'report'];

/**
 * The hash routes: `#/` and `#/studio/<brand>/<content>/<n>` the Studio (docs/PLAN-studio.md §2; slide n 1-based);
 * the P3 review console (P3-spec §C.2): `#/review` brands, `#/b/<id>` brand (slides tab), `#/b/<id>/<tab>`,
 * `#/b/<id>/slides/<n>` (slide n, 1-based, large).
 */
export function parseHash(hash) {
  const path = String(hash ?? '')
    .replace(/^#/, '')
    .replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  if (parts[0] === 'review') return { page: 'brands' };
  if (parts[0] !== 'b' || !parts[1]) {
    const studio = parts[0] === 'studio';
    const n = Number(studio ? parts[3] : NaN);
    return {
      page: 'studio',
      brand: (studio && parts[1]) || null,
      content: (studio && parts[2]) || null,
      slide: Number.isInteger(n) && n >= 1 ? n : null,
    };
  }
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
  if (!id) return '#/review';
  const base = `#/b/${encodeURIComponent(id)}`;
  if (tab === 'slides' && slide) return `${base}/slides/${slide}`;
  if (!tab || tab === 'slides') return base;
  return `${base}/${tab}`;
}

/** The Studio's hash for a brand / content / 1-based slide (each part optional from the right). */
export function studioHref({ brand, content, slide } = {}) {
  const parts = ['studio', brand, content, slide].filter((p) => p !== null && p !== undefined && p !== '');
  if (parts.length === 1) return '#/';
  return `#/${parts.map((p) => encodeURIComponent(String(p))).join('/')}`;
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
