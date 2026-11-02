// The Studio's state (docs/PLAN-studio.md §2.1): the brands and contents the server lists, the deck it last composed
// (kept when a compose fails), the overrides, the busy flag of the round trip. Every change asks the server to
// compose; the browser never runs a rule.
import { useCallback, useEffect, useRef, useState } from 'react';
import { studioApi } from '../api.js';
import { patchOverrides } from './lib.js';

/**
 * `initial` = {brand, content, slide} from the hash (any may be null). Returns the state and the commands:
 * selectBrand, selectContent, setSlideOverride, resetSlide, reconvert, refreshBrands, setIndex, clearError.
 */
export function useStudio(initial = {}) {
  const [brands, setBrands] = useState(null);
  const [contents, setContents] = useState(null);
  const [brandId, setBrandId] = useState(initial.brand ?? null);
  const [contentId, setContentId] = useState(initial.content ?? null);
  const [result, setResult] = useState(null); // the last good compose
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [index, setIndexState] = useState(initial.slide ? initial.slide - 1 : 0);
  const seq = useRef(0);
  const resultRef = useRef(null);
  resultRef.current = result;

  const total = result?.deck?.slides?.length ?? 0;
  const setIndex = useCallback(
    (n) => setIndexState(() => (total ? Math.max(0, Math.min(total - 1, n)) : Math.max(0, n))),
    [total],
  );

  // the lists, then the first compose
  useEffect(() => {
    let live = true;
    Promise.all([studioApi.brands(), studioApi.contents()])
      .then(([b, c]) => {
        if (!live) return;
        setBrands(b ?? []);
        setContents(c ?? []);
        setBrandId((cur) => {
          if (cur && (b ?? []).some((x) => x.id === cur)) return cur;
          return (b ?? []).find((x) => x.ok)?.id ?? b?.[0]?.id ?? null;
        });
        setContentId((cur) => {
          if (cur && (c ?? []).some((x) => x.id === cur)) return cur;
          return c?.[0]?.id ?? null;
        });
      })
      .catch((err) => live && setLoadError(err.message));
    return () => {
      live = false;
    };
  }, []);

  /** One compose round trip; a stale answer (a later call started) is dropped; a failure keeps the previous deck. */
  const compose = useCallback(async (bId, cId, overrides, { persist = false } = {}) => {
    if (!bId || !cId) return null;
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const r = await studioApi.compose(bId, cId, overrides);
      if (mine !== seq.current) return null;
      if (persist) await studioApi.saveOverrides(cId, bId, r.overrides);
      if (mine !== seq.current) return null;
      setResult(r);
      return r;
    } catch (err) {
      if (mine === seq.current) setError(err.message);
      return null;
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, []);

  // brand or content changed: compose with that pair's stored overrides
  useEffect(() => {
    if (brandId && contentId) compose(brandId, contentId);
  }, [brandId, contentId, compose]);

  // keep the slide index inside the deck
  useEffect(() => {
    if (total && index > total - 1) setIndexState(total - 1);
  }, [total, index]);

  const selectBrand = useCallback((id) => setBrandId(id), []);
  const selectContent = useCallback((id) => {
    setContentId(id);
    setIndexState(0);
  }, []);

  /** Patch this slide's overrides (by its content slide id): compose with them, then store them (ST-2). */
  const setSlideOverride = useCallback(
    (slideId, patch) => {
      const r = resultRef.current;
      if (!r || !slideId) return Promise.resolve(null);
      const next = patchOverrides(r.overrides, slideId, patch);
      return compose(r.brandId, r.contentId, next, { persist: true });
    },
    [compose],
  );

  const resetSlide = useCallback(
    (slideId) => setSlideOverride(slideId, { surface: null, layout: null, decor: null, logo: null }),
    [setSlideOverride],
  );

  const refreshBrands = useCallback(async () => {
    try {
      setBrands((await studioApi.brands()) ?? []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  /** Re-derive the brand on the server (answers / input changed), then re-compose. */
  const reconvert = useCallback(async () => {
    if (!brandId) return;
    setBusy(true);
    try {
      await studioApi.reconvert(brandId);
      await refreshBrands();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    await compose(brandId, contentId);
  }, [brandId, contentId, compose, refreshBrands]);

  return {
    brands,
    contents,
    brandId,
    contentId,
    result,
    busy,
    error,
    loadError,
    index,
    total,
    setIndex,
    selectBrand,
    selectContent,
    setSlideOverride,
    resetSlide,
    reconvert,
    refreshBrands,
    clearError: () => setError(null),
  };
}
