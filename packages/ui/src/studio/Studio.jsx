// The Studio (docs/PLAN-studio.md §2, S1): one screen - top bar, filmstrip, canvas, brand panel. The slide is the
// centre; the brand is a panel beside it; checks, questions, report, diff and the mood are drawers over the canvas.
// Every brand / surface / layout / decor / logo change asks the server to compose and swaps the deck in.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, brandFilesBase, studioApi } from '../api.js';
import ChecksTable, { ChecksSummary } from '../components/ChecksTable.jsx';
import { DeckStyle } from '../components/SlideCanvas.jsx';
import { isReportV1, itemsForSlide } from '../lib/checks.js';
import { studioHref } from '../router.js';
import DiffTab from '../tabs/DiffTab.jsx';
import MoodTab from '../tabs/MoodTab.jsx';
import QuestionsTab from '../tabs/QuestionsTab.jsx';
import ReportTab from '../tabs/ReportTab.jsx';
import BrandPanel from './BrandPanel.jsx';
import Canvas from './Canvas.jsx';
import Drawer from './Drawer.jsx';
import Filmstrip from './Filmstrip.jsx';
import { clearLayoutCache } from './LayoutPicker.jsx';
import { navTarget, typingTarget } from './lib.js';
import TopBar from './TopBar.jsx';
import { Icon } from './ui.jsx';
import { useStudio } from './useStudio.js';
import { parseHash } from '../router.js';

const DRAWER_TITLE = {
  questions: 'Questions',
  report: 'Report',
  diff: 'Diff',
  checks: 'Checks',
  mood: 'Mood',
};

function Notice({ kind = 'info', children, onClose }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={
        kind === 'error'
          ? 'flex items-start gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow-sm'
          : 'flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm'
      }
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-900"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export default function Studio({ route = {} }) {
  const s = useStudio({ brand: route.brand, content: route.content, slide: route.slide });
  const [zoom, setZoom] = useState('fit');
  const [guides, setGuides] = useState(false);
  const [grid, setGrid] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [hoverItem, setHoverItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const deck = s.result?.deck ?? null;
  const shownId = s.result?.brandId ?? s.brandId;
  const brand = s.brands?.find((b) => b.id === shownId) ?? null;
  const opts = useMemo(
    () => ({ assetBase: brandFilesBase(shownId ?? ''), fontBase: brandFilesBase(shownId ?? '') }),
    [shownId],
  );
  const checks = isReportV1(s.result?.checks) ? s.result.checks : null;
  const slide = deck?.slides?.[s.index];
  const slideItems = useMemo(
    () => (checks && slide ? itemsForSlide(checks, slide, s.index + 1) : []),
    [checks, slide, s.index],
  );
  const { setIndex, index, total, busy } = s;

  useEffect(() => setHoverItem(null), [index, deck]);

  // the hash mirrors brand / content / slide (replaceState: no history entry per slide)
  useEffect(() => {
    if (!s.brandId || !s.contentId) return;
    const h = studioHref({ brand: s.brandId, content: s.contentId, slide: index + 1 });
    if (typeof window !== 'undefined' && window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [s.brandId, s.contentId, index]);

  // links into the Studio (report / checks / diff rows): follow them
  const { selectBrand, selectContent } = s;
  useEffect(() => {
    const onHash = () => {
      const r = parseHash(window.location.hash);
      if (r.page !== 'studio') return;
      if (r.brand) selectBrand(r.brand);
      if (r.content) selectContent(r.content);
      if (r.slide) setIndex(r.slide - 1);
      setDrawer(null);
      setGrid(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [selectBrand, selectContent, setIndex]);

  const step = useCallback(
    (d) => {
      if (busy) return;
      setIndex(index + d);
    },
    [busy, index, setIndex],
  );

  // keys: ← → ↑ ↓ PageUp / PageDown (Cmd = first / last), Home / End, G grid, Esc closes
  useEffect(() => {
    const onKey = (e) => {
      if (typingTarget(e.target)) return;
      if (e.key === 'Escape') {
        if (drawer) setDrawer(null);
        else if (grid) setGrid(false);
        return;
      }
      if (drawer) return;
      if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setGrid((g) => !g);
        return;
      }
      const n = navTarget(e, index, total);
      if (n === null) return;
      e.preventDefault();
      if (!busy) setIndex(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, grid, index, total, busy, setIndex]);

  // the brand detail (questions + live Mood) for the drawers that need it
  useEffect(() => {
    if (!shownId || (drawer !== 'questions' && drawer !== 'mood')) return undefined;
    let live = true;
    studioApi
      .brand(shownId)
      .then((d) => live && setDetail(d))
      .catch((err) => live && setNotice({ kind: 'error', text: err.message }));
    return () => {
      live = false;
    };
  }, [drawer, shownId, s.brands]);

  const reconvert = async () => {
    clearLayoutCache();
    await s.reconvert();
  };

  const onExport = async ({ pdf, png, cli }) => {
    if (!shownId) return;
    setExporting(true);
    setNotice(null);
    try {
      if (cli) {
        await api.build(shownId, true);
        setNotice({
          kind: 'info',
          text: `pb build ${shownId} --png started (showcase, without the Studio overrides) → out/${shownId}/; follow it in the review console.`,
        });
      } else {
        const r = await studioApi.exportDeck(shownId, s.contentId, { pdf, png });
        setNotice({ kind: 'info', text: `Exported to ${r.outDir}`, links: r.urls });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: `Export failed: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const slideHref = (n) => studioHref({ brand: shownId, content: s.contentId, slide: n });

  let empty = null;
  if (s.loadError) empty = `Could not load the Studio: ${s.loadError}`;
  else if (!s.brands) empty = 'Loading brands…';
  else if (!s.brands.length) empty = 'No brand inputs under golden/brands/.';
  else if (!deck && !s.error) empty = 'Composing…';
  else if (!deck && s.error) empty = s.error;

  return (
    <div
      className="pb-ui pb-studio flex h-screen flex-col overflow-hidden bg-zinc-50 text-[13px] text-zinc-900"
      data-testid="studio"
    >
      {deck ? <DeckStyle deck={deck} fontBase={opts.fontBase} /> : null}
      <TopBar
        brands={s.brands}
        brandId={shownId}
        contents={s.contents}
        contentId={s.contentId}
        index={index}
        total={total}
        zoom={zoom}
        guides={guides}
        grid={grid}
        busy={busy}
        exporting={exporting}
        onBrand={s.selectBrand}
        onContent={s.selectContent}
        onStep={step}
        onZoom={setZoom}
        onGuides={setGuides}
        onGrid={setGrid}
        onExport={onExport}
        onDrawer={setDrawer}
        onReconvert={reconvert}
      />
      <div className="flex min-h-0 flex-1">
        <Filmstrip
          deck={deck}
          index={index}
          opts={opts}
          accent={brand?.accent}
          overrides={s.result?.overrides}
          onSelect={(i) => !busy && setIndex(i)}
        />
        <main className="relative min-w-0 flex-1">
          {empty ? (
            <div
              className="flex h-full items-center justify-center bg-zinc-100 text-zinc-500"
              data-testid="studio-empty"
            >
              {empty}
            </div>
          ) : (
            <Canvas
              deck={deck}
              index={index}
              opts={opts}
              zoom={zoom}
              guides={guides}
              geometry={brand?.geometry}
              items={slideItems}
              hoverItem={hoverItem}
              grid={grid}
              accent={brand?.accent}
              busy={busy}
              onSelect={(i) => {
                setIndex(i);
                setGrid(false);
              }}
              onStep={step}
            />
          )}
          <div className="pointer-events-none absolute left-4 right-4 top-3 z-20 flex flex-col items-center gap-2">
            {deck && s.error ? (
              <div className="pointer-events-auto w-full max-w-xl">
                <Notice kind="error" onClose={s.clearError}>
                  Compose failed: {s.error}. The previous deck is still shown.
                </Notice>
              </div>
            ) : null}
            {notice ? (
              <div className="pointer-events-auto w-full max-w-xl">
                <Notice kind={notice.kind} onClose={() => setNotice(null)}>
                  {notice.text}
                  {notice.links ? (
                    <span className="mt-1 flex flex-wrap gap-x-3">
                      {Object.entries(notice.links).map(([name, url]) => (
                        <a
                          key={name}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          {name}
                        </a>
                      ))}
                    </span>
                  ) : null}
                </Notice>
              </div>
            ) : null}
          </div>
          {drawer ? (
            <Drawer
              title={DRAWER_TITLE[drawer]}
              subtitle={`${brand?.name ?? shownId ?? ''} · ${s.contents?.find((c) => c.id === s.contentId)?.title ?? ''}`}
              onClose={() => setDrawer(null)}
            >
              {drawer === 'questions' ? (
                detail?.id === shownId ? (
                  <QuestionsTab
                    id={shownId}
                    questions={detail.questionsList}
                    building={busy}
                    canBuild
                    onRebuild={reconvert}
                  />
                ) : (
                  <p className="text-zinc-500">Loading…</p>
                )
              ) : null}
              {drawer === 'report' ? (
                <ReportTab id={shownId} report={s.result?.report} slideHref={slideHref} />
              ) : null}
              {drawer === 'diff' ? (
                <DiffTab
                  id={shownId}
                  version={deck?.id}
                  load={() => studioApi.diff(shownId, s.contentId)}
                  label={`golden/expected/${shownId}/deck.json → the live deck`}
                  slideHref={slideHref}
                />
              ) : null}
              {drawer === 'checks' ? (
                checks ? (
                  <div className="space-y-3">
                    <ChecksSummary summary={checks.summary} />
                    <ChecksTable id={shownId} checks={checks} slideHref={slideHref} />
                  </div>
                ) : (
                  <p className="text-zinc-500">No checks for this deck.</p>
                )
              ) : null}
              {drawer === 'mood' ? (
                detail?.id === shownId ? (
                  <MoodTab id={shownId} mood={detail.mood} />
                ) : (
                  <p className="text-zinc-500">Loading…</p>
                )
              ) : null}
            </Drawer>
          ) : null}
        </main>
        <BrandPanel
          brand={brand}
          deck={deck}
          index={index}
          checks={checks}
          overrides={s.result?.overrides}
          busy={busy}
          onOverride={s.setSlideOverride}
          onReset={s.resetSlide}
          onSelect={(i) => !busy && setIndex(i)}
          onHoverItem={setHoverItem}
          onOpenMood={() => setDrawer('mood')}
          onOpenChecks={() => setDrawer('checks')}
        />
      </div>
    </div>
  );
}
