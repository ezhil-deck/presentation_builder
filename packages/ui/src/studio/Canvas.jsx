// The canvas (docs/PLAN-studio.md §2): the slide at the largest size that fits (min(w / 1920, h / 1080)) or at 50 /
// 100 %, centred on a neutral background, a thin caption under it; guides (margins, title zone, check outlines) off by
// default; one wheel gesture = one slide in fit mode; `G` shows the deck as a 4-up grid instead. Overflowing texts are
// outlined in red; in edit mode (docs/P4-spec.md §2) the edit layer paints the selection, handles and snap guides and
// a pointer down on the slide goes to the editor; a text being edited inline gets its overlay (InlineEditor.jsx).
// The caption carries a warn badge when the slide has check findings (a click opens the panel's Checks). P4.3: a
// table cell edited inline (the inline editor laid over the cell), an image in focal mode (FocalLayer), a selected
// flow node's outline + reorder handle, and an image file dropped on the slide (edit mode). P4.4: a click on the
// empty canvas around the slide clears the selection.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Slide } from '@pb/renderer/components';
import { ScaledSlide, SlideOverlay } from '../components/SlideCanvas.jsx';
import { findElement, overlayBoxes } from '../lib/checks.js';
import { cx } from '../lib/format.js';
import { cellElement, flowNodeOf, imageTarget } from './dataEdit.js';
import { pickTarget } from './edit.js';
import EditLayer, { FocalLayer, OverflowOutlines } from './EditLayer.jsx';
import InlineEditor from './InlineEditor.jsx';
import { CANVAS, caption, countSeverities, fitScale, zoomScale } from './lib.js';

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

/** One slide painted at a fixed scale; `children(scale)` paint over it (canvas px); `slideProps` go on the box. */
export function FixedSlide({ deck, index, opts, scale, children, slideProps }) {
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
        {...slideProps}
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
  editing = false,
  editor = null,
  contentSlide = null,
  onInlineCommit,
  onInlineCancel,
  onShowChecks,
  onSelect,
  onStep,
  focalId = null,
  onFocalCommit,
  onFocalDone,
  onCellCommit,
  onCellCancel,
  onNodeMove,
  onDropFile,
}) {
  const ref = useRef(null);
  const size = useSize(ref);
  const wheel = useRef({ locked: false, timer: null });
  const slide = deck?.slides?.[index];
  const captionH = 32;
  const fit = fitScale(size.w, size.h - captionH, { pad: 24, canvas: deck?.canvas ?? CANVAS });
  const scale = zoomScale(zoom, fit);
  const inlineEl = editing && editor?.inline ? findElement(slide?.elements, editor.inline) : null;
  const cellTable = editing && editor?.cell ? findElement(slide?.elements, editor.cell.id) : null;
  const cellEl = cellTable ? cellElement(cellTable, editor.cell.r, editor.cell.c) : null;
  const focalEl = editing && focalId ? findElement(slide?.elements, focalId) : null;
  const focalTarget = focalEl && contentSlide ? imageTarget(focalEl, contentSlide) : null;
  const one = editing && editor?.selected?.length === 1 ? editor.selected[0] : null;
  const node = one && contentSlide && !inlineEl && !cellEl ? flowNodeOf(one, contentSlide) : null;
  const [dropping, setDropping] = useState(false);
  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const findings = countSeverities(items ?? []);
  const flagged = findings.fail + findings.warn;
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
      onMouseDown={(e) => {
        // edit mode: a click on the empty canvas around the slide clears the selection (P4.4)
        if (!editing || !editor?.clear || e.button !== 0) return;
        if (e.target.closest?.('[data-testid="canvas-slide"], button, a, input')) return;
        editor.clear();
      }}
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
          <div
            className={cx(
              'shadow-sm shadow-zinc-900/10 ring-1 ring-zinc-200',
              editing && 'cursor-default',
              dropping && 'ring-2 ring-blue-500',
            )}
            data-testid="canvas-slide"
            data-editing={editing ? 'true' : 'false'}
            onDragOver={(e) => {
              if (!editing || !onDropFile || !hasFiles(e)) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              if (!editing || !onDropFile) return;
              const file = e.dataTransfer?.files?.[0];
              if (!file) return;
              e.preventDefault();
              setDropping(false);
              const id = pickTarget(e.target, null);
              onDropFile(file, id ? findElement(slide?.elements, id) : null);
            }}
          >
            <FixedSlide
              deck={deck}
              index={index}
              opts={opts}
              scale={scale}
              slideProps={
                editing && editor
                  ? {
                      onMouseDown: (e) => editor.onSlideMouseDown(e, scale),
                      onDoubleClick: (e) => editor.onSlideDoubleClick(e, scale),
                    }
                  : undefined
              }
            >
              {(s) => (
                <>
                  {guides ? <Guides geometry={geometry} scale={s} /> : null}
                  <OverflowOutlines slide={slide} scale={s} />
                  <SlideOverlay boxes={boxes} scale={s} />
                  {editing && editor ? (
                    <EditLayer
                      slide={slide}
                      selected={inlineEl || cellEl || focalEl ? [] : editor.selected}
                      group={editor.group}
                      guides={editor.guides}
                      tip={editor.tip}
                      scale={s}
                      canvas={deck.canvas}
                      onHandleMouseDown={editor.onHandleMouseDown}
                      node={focalEl ? null : node}
                      onNodeMove={onNodeMove}
                    />
                  ) : null}
                  {focalEl && focalTarget ? (
                    <FocalLayer
                      key={`${slide.id}:${focalEl.id}`}
                      el={focalEl}
                      focal={
                        focalTarget.focalIn === 'content'
                          ? focalTarget.focal
                          : (editor.overrideOf?.(focalEl.id)?.focal ?? null)
                      }
                      size={deck.assets?.[focalEl.image?.asset]}
                      scale={s}
                      onCommit={(f) => onFocalCommit?.(focalEl, focalTarget, f)}
                      onDone={() => onFocalDone?.()}
                    />
                  ) : null}
                  {cellEl ? (
                    <InlineEditor
                      key={`${slide.id}:${cellEl.id}`}
                      el={cellEl}
                      deck={deck}
                      scale={s}
                      slide={contentSlide}
                      navigate
                      hide={`.slide [data-element-id="${cellTable.id}"] .pb-cell[data-row="${editor.cell.r}"][data-col="${editor.cell.c}"]`}
                      onCommit={(paragraphs, move) => onCellCommit?.(cellTable, cellEl, paragraphs, move)}
                      onCancel={() => onCellCancel?.()}
                    />
                  ) : null}
                  {inlineEl ? (
                    <InlineEditor
                      key={`${slide.id}:${inlineEl.id}`}
                      el={inlineEl}
                      deck={deck}
                      scale={s}
                      slide={contentSlide}
                      onCommit={(paragraphs) => onInlineCommit?.(inlineEl, paragraphs)}
                      onCancel={() => onInlineCancel?.()}
                    />
                  ) : null}
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
            {flagged ? (
              <button
                type="button"
                data-testid="caption-findings"
                title={`${flagged} check finding${flagged > 1 ? 's' : ''} on this slide: open the Checks`}
                onClick={() => onShowChecks?.()}
                className={cx(
                  'inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium tabular-nums ring-1 ring-inset',
                  findings.fail
                    ? 'bg-red-50 text-red-700 ring-red-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200',
                )}
              >
                <span
                  className={cx('h-1.5 w-1.5 rounded-full', findings.fail ? 'bg-red-600' : 'bg-amber-500')}
                />
                {flagged} {flagged > 1 ? 'findings' : 'finding'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
