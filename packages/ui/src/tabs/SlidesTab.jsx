import { useEffect, useMemo, useState } from 'react';
import { brandFilesBase, outFile } from '../api.js';
import Button from '../components/Button.jsx';
import Pill from '../components/Pill.jsx';
import { DeckStyle, ScaledSlide, SlideOverlay } from '../components/SlideCanvas.jsx';
import { bySeverity, isReportV1, itemsForSlide, overlayBoxes } from '../lib/checks.js';
import { cx, pngName } from '../lib/format.js';
import { hrefFor, navigate } from '../router.js';

function counts(items) {
  const c = { fail: 0, warn: 0, info: 0 };
  for (const it of items) if (c[it.severity] !== undefined) c[it.severity] += 1;
  return c;
}

function SlideMeta({ slide, n }) {
  return (
    <span className="truncate">
      <span className="tabular-nums text-neutral-900">{String(n).padStart(2, '0')}</span>
      <span className="text-neutral-400"> · </span>
      {slide.kind ?? '—'}
      {slide.layoutId && slide.layoutId !== slide.kind ? (
        <span className="text-neutral-400"> ({slide.layoutId})</span>
      ) : null}
      {slide.surfaceId ? <span className="text-neutral-400"> · {slide.surfaceId}</span> : null}
    </span>
  );
}

function ItemCounts({ items }) {
  const c = counts(items);
  return (
    <span className="flex shrink-0 gap-1">
      {c.fail ? <Pill status="fail">{c.fail}</Pill> : null}
      {c.warn ? <Pill status="warn">{c.warn}</Pill> : null}
      {c.info ? <Pill status="info">{c.info}</Pill> : null}
    </span>
  );
}

function PngImage({ id, n }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-neutral-100 text-xs text-neutral-500">
        no {pngName(n)} (build with PNG)
      </div>
    );
  }
  return (
    <img
      src={outFile(id, `slides/${pngName(n)}`)}
      alt={`slide ${n} (exported PNG)`}
      className="block aspect-video w-full max-w-full"
      onError={() => setMissing(true)}
    />
  );
}

function Grid({ id, deck, checks, opts, png }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {deck.slides.map((slide, i) => {
        const n = i + 1;
        const items = checks ? itemsForSlide(checks, slide, n) : [];
        return (
          <a
            key={slide.id ?? i}
            href={hrefFor({ id, tab: 'slides', slide: n })}
            data-testid="slide-thumb"
            className="group block rounded border border-neutral-200 bg-white p-1 hover:border-indigo-400"
          >
            <div className="overflow-hidden bg-neutral-100">
              {png ? <PngImage id={id} n={n} /> : <ScaledSlide deck={deck} index={i} opts={opts} />}
            </div>
            <div className="flex items-center justify-between gap-2 px-1 pt-1 text-xs text-neutral-600">
              <SlideMeta slide={slide} n={n} />
              <ItemCounts items={items} />
            </div>
          </a>
        );
      })}
    </div>
  );
}

function Large({ id, deck, checks, opts, png, n }) {
  const total = deck.slides.length;
  const slide = deck.slides[n - 1];
  const [active, setActive] = useState(null);
  const items = useMemo(
    () => (checks ? itemsForSlide(checks, slide, n).sort(bySeverity) : []),
    [checks, slide, n],
  );
  const boxes = useMemo(() => overlayBoxes(slide, items), [slide, items]);

  useEffect(() => setActive(null), [n]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft' && n > 1) navigate({ id, tab: 'slides', slide: n - 1 });
      else if (e.key === 'ArrowRight' && n < total) navigate({ id, tab: 'slides', slide: n + 1 });
      else if (e.key === 'Escape') navigate({ id, tab: 'slides' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, n, total]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs text-neutral-600">
          <Button kind="ghost" onClick={() => navigate({ id, tab: 'slides' })}>
            ← All slides
          </Button>
          <Button disabled={n <= 1} onClick={() => navigate({ id, tab: 'slides', slide: n - 1 })}>
            Prev
          </Button>
          <Button disabled={n >= total} onClick={() => navigate({ id, tab: 'slides', slide: n + 1 })}>
            Next
          </Button>
          <span className="tabular-nums">
            {n} / {total}
          </span>
          <span className="text-neutral-300">|</span>
          <SlideMeta slide={slide} n={n} />
          <span className="ml-auto text-neutral-400">← → keys, Esc = grid</span>
        </div>
        <div className="border border-neutral-300 bg-neutral-100" data-testid="slide-large">
          {png ? (
            <PngImage id={id} n={n} />
          ) : (
            <ScaledSlide deck={deck} index={n - 1} opts={opts} fallbackWidth={960}>
              {(scale) => <SlideOverlay boxes={boxes} scale={scale} active={active} />}
            </ScaledSlide>
          )}
        </div>
      </div>
      <aside className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Check items on this slide <span className="tabular-nums">({items.length})</span>
        </h3>
        {!checks ? (
          <p className="text-xs text-neutral-500">checks not run for this build (rebuild)</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-neutral-500">none</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
            {items.map((it, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setActive(active === i ? null : i)}
                  className={cx(
                    'block w-full px-2 py-1.5 text-left text-xs hover:bg-neutral-50',
                    active === i && 'bg-indigo-50',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Pill status={it.severity} />
                    <span className="font-mono text-neutral-800">{it.check}</span>
                    {it.elementId ? (
                      <span className="truncate font-mono text-neutral-400">{it.elementId}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-neutral-700">{it.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** Slides tab: the deck painted live by @pb/renderer (thumbnail grid / one slide large with check overlays). */
export default function SlidesTab({ id, deck, report, slide }) {
  const [png, setPng] = useState(false);
  const opts = useMemo(() => ({ assetBase: brandFilesBase(id), fontBase: brandFilesBase(id) }), [id]);
  if (!deck) return <p className="text-sm text-neutral-500">Not built: no deck.json for this brand.</p>;
  const checks = isReportV1(report?.checks) ? report.checks : null;
  const pngs = report?.counts?.pngs ?? 0;
  const n = slide && slide <= deck.slides.length ? slide : null;
  return (
    <div>
      <DeckStyle deck={deck} fontBase={opts.fontBase} />
      <div className="mb-3 flex items-center gap-3 text-xs text-neutral-600">
        <span className="tabular-nums">{deck.slides.length} slides</span>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={png} onChange={(e) => setPng(e.target.checked)} />
          PNG (exported{pngs ? `, ${pngs}` : ', none in the last build'})
        </label>
        <span className="text-neutral-400">
          {png ? 'showing the export' : 'painted live by @pb/renderer'}
        </span>
      </div>
      {n ? (
        <Large id={id} deck={deck} checks={checks} opts={opts} png={png} n={n} />
      ) : (
        <Grid id={id} deck={deck} checks={checks} opts={opts} png={png} />
      )}
    </div>
  );
}
