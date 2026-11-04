// The Studio's state (docs/PLAN-studio.md §2.1, docs/P4-spec.md §1 / §5): the brands and contents the server lists,
// the deck it last composed (kept when a compose fails), the overrides, the content document, the busy flag of the
// round trip, and the editor's command log. Every change is a command (a patch of the overrides and / or of the
// content, with its inverse): an overrides command -> compose -> PUT overrides -> PUT history; a content command
// (P4.2: text, slides) -> the document changed here -> PUT history -> PUT content (debounced, the answer is the
// re-composed deck). A Markdown deck is read-only: its first edit asks for a copy under content/ and continues
// there. The browser never runs a rule.
import { useCallback, useEffect, useRef, useState } from 'react';
import { studioApi } from '../api.js';
import { CONTENT_DEBOUNCE_MS, applyContentPatch, contentInverse, contentNoop } from './contentEdit.js';
import { applyPatch, cleanOverrides, elementIds, isNoop, makeCommand, pushCommand } from './edit.js';
import { patchOverrides } from './lib.js';

const EMPTY_HISTORY = Object.freeze({ commands: [], cursor: 0 });
const overridesPart = (patch) => {
  const out = {};
  if (patch?.slides) out.slides = patch.slides;
  if (patch?.elements) out.elements = patch.elements;
  if (patch && 'fontPair' in patch) out.fontPair = patch.fontPair;
  return out;
};
const hasOverrides = (patch) => Boolean(patch?.slides || patch?.elements || (patch && 'fontPair' in patch));
/** A content document as the client keeps it: the JSON without the server's `source` / `readOnly` marks. */
const docOf = (contentId, body) => {
  if (!body) return null;
  const { source, readOnly, ...content } = body;
  return { contentId, content, source: source ?? 'json', readOnly: Boolean(readOnly) };
};

/**
 * `initial` = {brand, content, slide} from the hash (any may be null). Returns the state and the commands:
 * selectBrand, selectContent, setSlideOverride, resetSlide, run (a patch as a command), edit (a content command
 * built from the current document and deck), undo, redo, preview, clearPreview, reconvert, refreshBrands, setIndex,
 * focusSlide, saveCopy / cancelCopy (the read-only deck's "Save as a copy"), clearError.
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
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [historyKey, setHistoryKey] = useState(null); // `${contentId}|${brandId}` once its log is loaded
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const [preview, setPreview] = useState(null); // a compose with a gesture's temporary overrides (not committed)
  const [doc, setDoc] = useState(null); // {contentId, content, source, readOnly}
  const [copyRequest, setCopyRequest] = useState(null); // a read-only deck's edit waiting for "Save as a copy"
  const seq = useRef(0);
  const previewSeq = useRef(0);
  const resultRef = useRef(null);
  resultRef.current = result;
  const historyRef = useRef(history);
  historyRef.current = history;
  const docRef = useRef(doc);
  docRef.current = doc;
  const put = useRef({ timer: null, job: null, waiters: [] }); // the debounced content PUT
  const pending = useRef(null); // {contentId, build}: an edit to replay on the copy once it is loaded
  const wantSlide = useRef(null); // {id, deck}: a slide to show once a newer deck than `deck` arrives

  const total = result?.deck?.slides?.length ?? 0;
  const setIndex = useCallback(
    (n) => setIndexState(() => (total ? Math.max(0, Math.min(total - 1, n)) : Math.max(0, n))),
    [total],
  );

  /** Show slide `id` once the next deck arrives (a command's slide: added, duplicated, moved, undone). */
  const focusSlide = useCallback((id) => {
    wantSlide.current = id ? { id, deck: resultRef.current?.deck ?? null } : null;
  }, []);
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

  /** Send the waiting content PUT now (its answer is the re-composed deck). Resolves with it (null on failure). */
  const flush = useCallback(async () => {
    const p = put.current;
    if (!p.timer) return p.job;
    clearTimeout(p.timer);
    p.timer = null;
    const { bId, cId, content } = p;
    const waiters = p.waiters;
    p.waiters = [];
    const mine = ++seq.current;
    setBusy(true);
    setError(null);
    const job = (async () => {
      try {
        const r = await studioApi.saveContent(cId, bId, content);
        if (mine === seq.current) {
          previewSeq.current += 1;
          setPreview(null);
          setResult(r);
        }
        if (!put.current.timer) setSaveState('saved');
        return r;
      } catch (err) {
        if (mine === seq.current) setError(err.message);
        setSaveState('error');
        return null;
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    })();
    p.job = job;
    const r = await job;
    if (put.current.job === job) put.current.job = null;
    waiters.forEach((w) => w(r));
    return r;
  }, []);

  /** Queue the content PUT (CONTENT_DEBOUNCE_MS; `now` sends it at once). Resolves with the composed answer. */
  const queuePut = useCallback(
    (bId, cId, content, { now = false } = {}) => {
      const p = put.current;
      Object.assign(p, { bId, cId, content });
      clearTimeout(p.timer);
      const done = new Promise((ok) => p.waiters.push(ok));
      p.timer = setTimeout(flush, now ? 0 : CONTENT_DEBOUNCE_MS);
      if (now) flush();
      return done;
    },
    [flush],
  );
  useEffect(() => () => clearTimeout(put.current.timer), []);

  /** One compose round trip; a stale answer (a later call started) is dropped; a failure keeps the previous deck. */
  const compose = useCallback(
    async (bId, cId, overrides, { persist = false } = {}) => {
      if (!bId || !cId) return null;
      // the server composes the stored document: a waiting content PUT goes first
      if (put.current.timer) await flush();
      else if (put.current.job) await put.current.job;
      const mine = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const r = await studioApi.compose(bId, cId, overrides);
        if (mine !== seq.current) return null;
        if (persist) await studioApi.saveOverrides(cId, bId, r.overrides);
        if (mine !== seq.current) return null;
        previewSeq.current += 1;
        setPreview(null);
        setResult(r);
        return r;
      } catch (err) {
        if (mine === seq.current) setError(err.message);
        return null;
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [flush],
  );

  // brand or content changed: compose with that pair's stored overrides, and load its command log
  useEffect(() => {
    if (brandId && contentId) compose(brandId, contentId);
  }, [brandId, contentId, compose]);
  useEffect(() => {
    if (!brandId || !contentId) return undefined;
    let live = true;
    setHistory(EMPTY_HISTORY);
    setHistoryKey(null);
    studioApi
      .history(contentId, brandId)
      .then((h) => {
        if (!live) return;
        setHistory(h?.commands ? h : EMPTY_HISTORY);
        setHistoryKey(`${contentId}|${brandId}`);
      })
      .catch(() => {
        if (!live) return;
        setHistory(EMPTY_HISTORY);
        setHistoryKey(`${contentId}|${brandId}`);
      });
    return () => {
      live = false;
    };
  }, [brandId, contentId]);
  // the content document (a copy just made is already in hand)
  useEffect(() => {
    if (!contentId) return undefined;
    if (docRef.current?.contentId === contentId) return undefined;
    let live = true;
    setDoc(null);
    studioApi
      .content(contentId)
      .then((body) => live && setDoc(docOf(contentId, body)))
      .catch(() => live && setDoc(null));
    return () => {
      live = false;
    };
  }, [contentId]);

  /** Store the log; the top bar shows the saved state. */
  const storeHistory = useCallback(async (bId, cId, h, { settle = true } = {}) => {
    // the next command (a burst of grid edits) pushes onto this log even before the next render
    historyRef.current = h;
    setHistory(h);
    try {
      await studioApi.saveHistory(cId, bId, h);
      if (settle) setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  /**
   * A content command (P4.2): the document changed here at once (optimistic), the overrides part (a duplicated
   * slide's overrides) stored, the log stored, then the debounced PUT whose answer is the re-composed deck.
   */
  const runContent = useCallback(
    async (patch, meta, { now = false } = {}) => {
      const r = resultRef.current;
      const d = docRef.current;
      if (!r || !d || d.contentId !== r.contentId || d.readOnly) return null;
      const ov = overridesPart(patch);
      if (contentNoop(d.content, patch.content) && isNoop(r.overrides, ov)) return null;
      const cmd = makeCommand(r.overrides, ov, meta);
      cmd.args = patch;
      cmd.inverse = { ...cmd.inverse, content: contentInverse(d.content, patch.content) };
      if (!hasOverrides(patch)) {
        delete cmd.inverse.slides;
        delete cmd.inverse.elements;
        delete cmd.inverse.fontPair;
      }
      const next = applyContentPatch(d.content, patch.content);
      // the next content command builds on this document even before the next render
      docRef.current = { ...d, content: next };
      setDoc(docRef.current);
      setSaveState('saving');
      if (hasOverrides(patch)) {
        const o = applyPatch(r.overrides, ov);
        try {
          await studioApi.saveOverrides(r.contentId, r.brandId, o);
          setResult((cur) => (cur ? { ...cur, overrides: o } : cur));
        } catch (err) {
          setError(err.message);
        }
      }
      await storeHistory(r.brandId, r.contentId, pushCommand(historyRef.current, cmd), { settle: false });
      return queuePut(r.brandId, r.contentId, next, { now });
    },
    [queuePut, storeHistory],
  );

  /**
   * One command: the patch applied to the current overrides, composed, stored (overrides, then the log). A failed
   * compose keeps the previous deck and logs nothing. A patch with `content` is a content command (runContent).
   * Returns the compose result (null when nothing ran).
   */
  const run = useCallback(
    async (patch, meta = {}, opts = {}) => {
      if (patch?.content) return runContent(patch, meta, opts);
      const r = resultRef.current;
      if (!r || isNoop(r.overrides, patch)) return null;
      const cmd = makeCommand(r.overrides, patch, meta);
      const next = applyPatch(r.overrides, patch);
      setSaveState('saving');
      const res = await compose(r.brandId, r.contentId, next, { persist: true });
      if (!res) {
        setSaveState((st) => (st === 'saving' ? 'saved' : st));
        return null;
      }
      await storeHistory(r.brandId, r.contentId, pushCommand(historyRef.current, cmd));
      return res;
    },
    [compose, storeHistory, runContent],
  );

  /**
   * A content command built from the current document and deck: `build(content, deck, overrides)` -> {patch, meta}
   * | null. A waiting PUT is sent first (the deck's sources then match the document). On a read-only deck (Markdown)
   * the edit waits for "Save as a copy" and is built again on the copy.
   */
  const edit = useCallback(
    async (build, { now = false } = {}) => {
      if (put.current.timer) await flush();
      else if (put.current.job) await put.current.job;
      const r = resultRef.current;
      const d = docRef.current;
      if (!r || !d || d.contentId !== r.contentId) return null;
      if (d.readOnly) {
        setCopyRequest({ from: r.contentId, build, now });
        return null;
      }
      const built = build(d.content, r.deck, cleanOverrides(r.overrides));
      if (!built?.patch) return null;
      if (built.focus) focusSlide(built.focus);
      return run(built.patch, built.meta, { now });
    },
    [flush, run, focusSlide],
  );

  /** Undo (-1) or redo (+1) one command of the log: its inverse / args applied, composed and stored. */
  const step = useCallback(
    async (dir) => {
      if (put.current.timer) await flush();
      const r = resultRef.current;
      const h = historyRef.current;
      const cmd = dir < 0 ? h.commands[h.cursor - 1] : h.commands[h.cursor];
      if (!r || !cmd) return null;
      const p = dir < 0 ? cmd.inverse : cmd.args;
      const moved = { ...h, cursor: h.cursor + (dir < 0 ? -1 : 1) };
      if (cmd.slideId) focusSlide(cmd.slideId);
      setSaveState('saving');
      if (p?.content) {
        const d = docRef.current;
        if (!d || d.readOnly || d.contentId !== r.contentId) {
          setSaveState('saved');
          return null;
        }
        const next = applyContentPatch(d.content, p.content);
        docRef.current = { ...d, content: next };
        setDoc(docRef.current);
        if (hasOverrides(p)) {
          const o = applyPatch(r.overrides, overridesPart(p));
          await studioApi.saveOverrides(r.contentId, r.brandId, o).catch((err) => setError(err.message));
        }
        await storeHistory(r.brandId, r.contentId, moved, { settle: false });
        const res = await queuePut(r.brandId, r.contentId, next, { now: true });
        return res ? cmd : null;
      }
      const next = applyPatch(r.overrides, p);
      const res = await compose(r.brandId, r.contentId, next, { persist: true });
      if (!res) {
        setSaveState((st) => (st === 'saving' ? 'saved' : st));
        return null;
      }
      await storeHistory(r.brandId, r.contentId, moved);
      return cmd;
    },
    [compose, storeHistory, flush, queuePut, focusSlide],
  );
  const undo = useCallback(() => step(-1), [step]);
  const redo = useCallback(() => step(1), [step]);

  /**
   * A gesture's live preview: the overrides with `patch` composed without the busy state and without storing (text
   * re-fitted while a handle is dragged). A later preview or any compose drops an earlier answer.
   */
  const previewPatch = useCallback(async (patch) => {
    const r = resultRef.current;
    if (!r) return;
    const mine = ++previewSeq.current;
    try {
      const p = await studioApi.compose(r.brandId, r.contentId, applyPatch(r.overrides, patch));
      if (mine === previewSeq.current) setPreview(p);
    } catch {
      /* a failed preview leaves the canvas as it is */
    }
  }, []);
  const clearPreview = useCallback(() => {
    previewSeq.current += 1;
    setPreview(null);
  }, []);

  // keep the slide index inside the deck; show the slide a command asked for once a newer deck is in
  useEffect(() => {
    const want = wantSlide.current;
    if (want && result?.deck && result.deck !== want.deck) {
      wantSlide.current = null;
      const at = result.deck.slides.findIndex((x) => x.id === want.id);
      if (at >= 0) {
        setIndexState(at);
        return;
      }
    }
    if (total && index > total - 1) setIndexState(total - 1);
  }, [total, index, result]);

  const selectBrand = useCallback((id) => setBrandId(id), []);
  const selectContent = useCallback((id) => {
    setContentId(id);
    setIndexState(0);
  }, []);

  /**
   * "Save as a copy" (a read-only Markdown deck): the deck imported as content/<name>.content.json (with its
   * overrides and log), the Studio switched to it on the same slide, and the waiting edit made there.
   */
  const saveCopy = useCallback(
    async (name) => {
      const req = copyRequest;
      const r = resultRef.current;
      if (!req || !r) return null;
      const entry = await studioApi.importContent(req.from, name, name);
      setContents((await studioApi.contents()) ?? []);
      pending.current = { contentId: entry.id, build: req.build, now: req.now };
      setCopyRequest(null);
      setDoc(docOf(entry.id, { ...entry.content, source: 'json', readOnly: false }));
      setContentId(entry.id);
      return entry;
    },
    [copyRequest],
  );
  const cancelCopy = useCallback(() => setCopyRequest(null), []);

  // the waiting edit, once the copy's deck, document and log are in
  useEffect(() => {
    const p = pending.current;
    if (!p || result?.contentId !== p.contentId || doc?.contentId !== p.contentId) return;
    if (historyKey !== `${p.contentId}|${brandId}`) return;
    pending.current = null;
    const built = p.build(doc.content, result.deck, cleanOverrides(result.overrides));
    if (built?.patch) {
      if (built.focus) focusSlide(built.focus);
      run(built.patch, built.meta, { now: p.now });
    }
  }, [result, doc, historyKey, brandId, run, focusSlide]);

  /**
   * Patch this slide's overrides (by its content slide id) as a command (ST-2). A layout change drops the element
   * overrides of the slide (ED-3: the boxes change); `slide` = the deck slide (its elements).
   */
  const setSlideOverride = useCallback(
    (slideId, patch, slide) => {
      const r = resultRef.current;
      if (!r || !slideId) return Promise.resolve(null);
      const entry = patchOverrides(r.overrides, slideId, patch).slides[slideId] ?? null;
      const p = { slides: { [slideId]: entry } };
      if (patch.layout !== undefined && slide) {
        const own = elementIds(slide).filter((id) => r.overrides?.elements?.[id]);
        if (own.length) p.elements = Object.fromEntries(own.map((id) => [id, null]));
      }
      return run(p, { type: 'slide', label: `Slide ${Object.keys(patch).join(', ')}`, slideId: slide?.id });
    },
    [run],
  );

  /** Reset slide: its slide overrides and every element override of its elements dropped (one command). */
  const resetSlide = useCallback(
    (slideId, slide) => {
      const r = resultRef.current;
      if (!r || !slideId) return Promise.resolve(null);
      const p = { slides: { [slideId]: null } };
      const own = slide ? elementIds(slide).filter((id) => r.overrides?.elements?.[id]) : [];
      if (own.length) p.elements = Object.fromEntries(own.map((id) => [id, null]));
      return run(p, { type: 'reset-slide', label: 'Reset slide', slideId: slide?.id });
    },
    [run],
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
    focusSlide,
    selectBrand,
    selectContent,
    setSlideOverride,
    resetSlide,
    overrides: cleanOverrides(result?.overrides),
    doc,
    readOnly: Boolean(doc?.readOnly),
    copyRequest,
    saveCopy,
    cancelCopy,
    history,
    saveState,
    canUndo: history.cursor > 0,
    canRedo: history.cursor < history.commands.length,
    run,
    edit,
    flush,
    undo,
    redo,
    preview,
    previewPatch,
    clearPreview,
    reconvert,
    refreshBrands,
    clearError: () => setError(null),
  };
}
