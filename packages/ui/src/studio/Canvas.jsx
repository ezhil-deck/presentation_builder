// The canvas (docs/PLAN-studio.md §2): the slide at the largest size that fits (min(w / 1920, h / 1080)) or at 50 /
// 100 %, centred on a neutral background, a thin caption under it; guides (margins, title zone, check outlines) off by
// default; one wheel gesture = one slide in fit mode; `G` shows the deck as a 4-up grid instead.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Slide } from '@pb/renderer/components';
import { ScaledSlide, SlideOverlay } from '../components/SlideCanvas.jsx';
import { overlayBoxes } from '../lib/checks.js';
import { cx } from '../lib/format.js';
import { CANVAS, caption, fitScale, zoomScale } from './lib.js';

/** The element's content box size, kept current (fallback before the first layout / in jsdom). */
export function useSize(ref, fallback = { w: 960, h: 600 }) {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** One slide painted at a fixed scale; `children(scale)` paint over it (canvas px). */
export function FixedSlide({ deck, index, opts, scale, children }) {
  const { width: W, height: H } = deck?.canvas ?? CANVAS;
  return (
    <div style={{ position: 'relative', width: W * scale, height: H * scale, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          '--pb-scale': 1,
        }}
      >
        <Slide deck={deck} index={index} opts={opts} />
        {typeof children === 'function' ? children(scale) : children}
      </div>
    </div>
  );
}

/** Margins and the title zone of the brand's geometry, as hairlines (counter-scaled to stay 1 px on screen). */
export function Guides({ geometry, scale }) {
  const m = geometry?.margins;
  if (!m) return null;
  const k = 1 / (scale || 1);
  const tz = geometry.titleZone;
  const line = `${k}px dashed rgba(37, 99, 235, 0.9)`;
  return (
    <div data-testid="guides" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        data-testid="guide-margins"
        style={{
          position: 'absolute',
          left: m.left,
          top: m.top,
          width: CANVAS.width - m.left - m.right,
          height: CANVAS.height - m.top - m.bottom,
          border: line,
          boxSizing: 'border-box',
        }}
      />
      {tz && typeof tz.y === 'number' && typeof tz.height === 'number' ? (
        <div
          data-testid="guide-title-zone"
          style={{
            position: 'absolute',
            left: m.left,
            top: tz.y,
            width: CANVAS.width - m.left - m.right,
            height: tz.height,
            background: 'rgba(37, 99, 235, 0.08)',
            borderBottom: line,
            boxSizing: 'border-box',
          }}
        />
      ) : null}
    </div>
  );
}

/** The deck as a 4-up grid in the canvas area; a click selects the slide (and leaves the grid). */
function DeckGrid({ deck, opts, index, accent, onSelect }) {
  return (
    <div className="h-full overflow-auto p-6" data-testid="deck-grid">
      <div className="grid grid-cols-4 gap-4">
        {deck.slides.map((s, i) => (
          <button
            key={s.id ?? i}
            type="button"
            onClick={() => onSelect(i)}
            className="group text-left"
            aria-label={`Slide ${i + 1}`}
          >
            <div
              className="overflow-hidden rounded-sm bg-white"
              style={{ boxShadow: i === index ? `0 0 0 2px ${accent ?? '#2563eb'}` : '0 0 0 1px #d4d4d8' }}
            >
              <ScaledSlide deck={deck} index={i} opts={opts} fallbackWidth={240} />
            </div>
            <div className="mt-1 flex gap-2 text-xs text-zinc-500">
              <span className="tabular-nums text-zinc-700">{String(i + 1).padStart(2, '0')}</span>
              <span className="truncate">{s.requestedKind ?? s.kind}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Canvas({
  deck,
  index,
  opts,
  zoom = 'fit',
  guides = false,
  geometry,
  items,
  hoverItem,
  grid = false,
  accent,
  busy = false,
  onSelect,
  onStep,
}) {
  const ref = useRef(null);
  const size = useSize(ref);
  const wheel = useRef({ locked: false, timer: null });
  const slide = deck?.slides?.[index];
  const captionH = 32;
  const fit = fitScale(size.w, size.h - captionH, { pad: 24, canvas: deck?.canvas ?? CANVAS });
  const scale = zoomScale(zoom, fit);
  const boxes = useMemo(() => {
    if (!slide) return [];
    if (hoverItem) return overlayBoxes(slide, [hoverItem]);
    return guides ? overlayBoxes(slide, items ?? []) : [];
  }, [slide, items, hoverItem, guides]);

  // one wheel gesture = one slide (fit mode only: at 50 / 100 % the wheel scrolls the canvas)
  const onWheel = (e) => {
    if (zoom !== 'fit' || grid || !onStep) return;
    const w = wheel.current;
    const unlockLater = () => {
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        w.locked = false;
      }, 220);
    };
    if (w.locked) return unlockLater();
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(d) < 4) return undefined;
    w.locked = true;
    unlockLater();
    onStep(d > 0 ? 1 : -1);
    return undefined;
  };

  return (
    <div
      ref={ref}
      data-testid="canvas"
      data-busy={busy ? 'true' : 'false'}
      onWheel={onWheel}
      className={cx(
        'relative h-full min-h-0 w-full min-w-0 bg-zinc-100 transition-opacity',
        zoom === 'fit' || grid ? 'overflow-hidden' : 'overflow-auto',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      {!deck ? null : grid ? (
        <DeckGrid deck={deck} opts={opts} index={index} accent={accent} onSelect={onSelect} />
      ) : slide ? (
        <div
          className={cx(
            'flex min-h-full min-w-full flex-col items-center',
            zoom === 'fit' ? 'justify-center' : 'p-6',
          )}
          style={zoom === 'fit' ? undefined : { width: 'max-content' }}
        >
          <div className="shadow-sm shadow-zinc-900/10 ring-1 ring-zinc-200" data-testid="canvas-slide">
            <FixedSlide deck={deck} index={index} opts={opts} scale={scale}>
              {(s) => (
                <>
                  {guides ? <Guides geometry={geometry} scale={s} /> : null}
                  <SlideOverlay boxes={boxes} scale={s} />
                </>
              )}
            </FixedSlide>
          </div>
          <div
            className="mt-2 flex h-6 items-center gap-2 text-xs text-zinc-500"
            data-testid="canvas-caption"
          >
            <span>{caption(slide)}</span>
            <span className="tabular-nums text-zinc-400">{Math.round(scale * 100)}%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
