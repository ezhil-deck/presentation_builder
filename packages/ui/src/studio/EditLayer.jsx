// The edit layer over the canvas (docs/P4-spec.md §2; P4.1): the selection outlined in the UI accent with 8 handles,
// the entered group, snap guide lines and the overflow outlines. Painted in canvas px inside the scaled slide, so every
// stroke and handle is counter-scaled to look the same on screen at any zoom. Only the handles take the pointer; a
// click on the slide reaches the painted element underneath (its `data-element-id`). P4.3: a selected flow node is
// outlined (dashed) with a drag handle - dropped on another node of the flow it is one move command - and an image in
// focal mode gets a crosshair dragged inside its frame (FocalLayer). P4.4: a multi-selection gets its bounding box
// (dashed) with 4 corner handles (it scales from a corner; locked elements stay out of the box); snap guides carry the
// distance to the element they line up with, and an equal-spacing snap shows its two equal gaps with their size.
import { useEffect, useRef, useState } from 'react';
import { findElement } from '../lib/checks.js';
import { focalFromFrame, frameFromFocal, nodeAtPoint, nodeBoxes, shownCrop } from './dataEdit.js';
import { CORNERS, bounds, overflowing } from './edit.js';
import { matchKey } from './keys.js';

export const UI_ACCENT = '#2563eb';
const OVERFLOW = '#dc2626';
/** Distance guides (a magenta that reads on any brand surface, as design tools use). */
const GAP = '#db2777';
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

function handleAt(dir, f) {
  const x = dir.includes('w') ? f.x : dir.includes('e') ? f.x + f.w : f.x + f.w / 2;
  const y = dir.includes('n') ? f.y : dir.includes('s') ? f.y + f.h : f.y + f.h / 2;
  return { x, y };
}

/** Red outlines on the slide's overflowing texts (shown whether or not edit mode is on). */
export function OverflowOutlines({ slide, scale }) {
  const k = 1 / (scale || 1);
  const list = overflowing(slide);
  if (!list.length) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {list.map((el) => (
        <div
          key={el.id}
          data-testid="overflow-outline"
          data-element={el.id}
          title={`${el.id} overflows its box`}
          style={{
            position: 'absolute',
            left: el.frame.x,
            top: el.frame.y,
            width: el.frame.w,
            height: el.frame.h,
            outline: `${2 * k}px solid ${OVERFLOW}`,
            outlineOffset: 0,
          }}
        />
      ))}
    </div>
  );
}

/** The canvas point (canvas px) of a pointer event over a layer laid on the scaled slide. */
function canvasPoint(root, e, scale) {
  const rect = root?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  return { x: (e.clientX - rect.left) / (scale || 1), y: (e.clientY - rect.top) / (scale || 1) };
}

/**
 * The selected flow node: its painted bounds dashed, a handle at its top-left corner; dragging the handle onto
 * another node of the same flow (that node outlined) and releasing = `onMove(to)`.
 */
function NodeOutline({ slide, info, scale, onMove }) {
  const k = 1 / (scale || 1);
  const rootRef = useRef(null);
  const [drag, setDragState] = useState(null); // {x, y, to}
  const dragRef = useRef(null);
  const setDrag = (d) => {
    dragRef.current = d;
    setDragState(d);
  };
  const boxes = nodeBoxes(slide?.elements, info.blockPath, info.container);
  const b = boxes.get(info.k);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return undefined;
    const follow = (e) => {
      const p = canvasPoint(rootRef.current, e, scale);
      const to = nodeAtPoint(slide?.elements, info.blockPath, info.container, p.x, p.y);
      dragRef.current = { ...p, to };
      setDragState(dragRef.current);
    };
    const drop = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragState(null);
      if (d && d.to !== null && d.to !== undefined && d.to !== info.k) onMove(d.to);
    };
    window.addEventListener('mousemove', follow);
    window.addEventListener('mouseup', drop);
    return () => {
      window.removeEventListener('mousemove', follow);
      window.removeEventListener('mouseup', drop);
    };
  }, [dragging, scale, slide, info, onMove]);
  if (!b) return null;
  const target = drag && drag.to !== null && drag.to !== info.k ? boxes.get(drag.to) : null;
  const hs = 16 * k;
  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        data-testid="node-outline"
        data-node={info.k}
        style={{
          position: 'absolute',
          left: b.x - 4 * k,
          top: b.y - 4 * k,
          width: b.w + 8 * k,
          height: b.h + 8 * k,
          outline: `${1 * k}px dashed ${UI_ACCENT}`,
        }}
      />
      {target ? (
        <div
          data-testid="node-drop-target"
          data-node={drag.to}
          style={{
            position: 'absolute',
            left: target.x - 4 * k,
            top: target.y - 4 * k,
            width: target.w + 8 * k,
            height: target.h + 8 * k,
            outline: `${2 * k}px solid ${UI_ACCENT}`,
            background: 'rgba(37, 99, 235, 0.08)',
          }}
        />
      ) : null}
      <div
        role="button"
        aria-label={`Drag to reorder node ${info.k + 1}`}
        title="Drag onto another node to reorder"
        data-testid="node-handle"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          setDrag({ ...canvasPoint(rootRef.current, e, scale), to: info.k });
        }}
        style={{
          position: 'absolute',
          left: b.x - 4 * k - hs / 2,
          top: b.y - 4 * k - hs / 2,
          width: hs,
          height: hs,
          borderRadius: 3 * k,
          background: UI_ACCENT,
          color: '#fff',
          fontSize: 11 * k,
          lineHeight: `${hs}px`,
          textAlign: 'center',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          cursor: drag ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          zIndex: 7,
        }}
      >
        ⠿
      </div>
      {drag ? (
        <div
          style={{
            position: 'absolute',
            left: drag.x - 6 * k,
            top: drag.y - 6 * k,
            width: 12 * k,
            height: 12 * k,
            borderRadius: '50%',
            background: UI_ACCENT,
            opacity: 0.6,
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Focal mode on an image (P4.3): a crosshair at the focal point (where it shows in the frame, through the part of
 * the image the frame shows); press and drag inside the frame to move it, release = `onCommit({x, y})` (fractions
 * 0–1 of the image).
 */
export function FocalLayer({ el, focal, size, scale, onCommit, onDone }) {
  const k = 1 / (scale || 1);
  const ref = useRef(null);
  // what the frame shows of the image: its crop, else the centred cover the renderer paints (`size` = the asset's)
  const crop = shownCrop(el, size);
  const shown = focal ? frameFromFocal(focal, crop) : { x: 0.5, y: 0.5 };
  const [point, setPoint] = useState(null); // frame fractions while dragging
  const at = point ?? shown;
  const fromEvent = (e) => {
    const rect = ref.current?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    const w = el.frame.w * (scale || 1);
    const h = el.frame.h * (scale || 1);
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / (w || 1))),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / (h || 1))),
    };
  };
  useEffect(() => {
    if (!point) return undefined;
    const onMove = (e) => setPoint(fromEvent(e));
    const onUp = (e) => {
      const p = fromEvent(e);
      setPoint(null);
      onCommit(focalFromFrame(p.x, p.y, crop));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point !== null]);
  useEffect(() => {
    const onKey = (e) => {
      if (matchKey(e, 'edit') === 'escape') {
        e.stopPropagation();
        onDone();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);
  const cx = at.x * el.frame.w;
  const cy = at.y * el.frame.h;
  const line = (style) => ({
    position: 'absolute',
    background: '#fff',
    boxShadow: `0 0 0 ${k}px ${UI_ACCENT}`,
    ...style,
  });
  return (
    <div
      ref={ref}
      data-testid="focal-layer"
      data-element={el.id}
      title="Drag to set the focal point · Esc done"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        setPoint(fromEvent(e));
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: el.frame.x,
        top: el.frame.y,
        width: el.frame.w,
        height: el.frame.h,
        outline: `${2 * k}px solid ${UI_ACCENT}`,
        background: 'rgba(0, 0, 0, 0.12)',
        cursor: 'crosshair',
        zIndex: 6,
        overflow: 'hidden',
      }}
    >
      <div style={line({ left: cx - k / 2, top: 0, width: k, height: el.frame.h })} />
      <div style={line({ top: cy - k / 2, left: 0, height: k, width: el.frame.w })} />
      <div
        data-testid="focal-point"
        data-x={(point ? focalFromFrame(at.x, at.y, crop) : (focal ?? { x: 0.5 })).x}
        style={{
          position: 'absolute',
          left: cx - 10 * k,
          top: cy - 10 * k,
          width: 20 * k,
          height: 20 * k,
          borderRadius: '50%',
          border: `${2 * k}px solid #fff`,
          boxShadow: `0 0 0 ${1.5 * k}px ${UI_ACCENT}`,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

/** A distance between two boxes along `axis` (a gap guide): a line with end ticks and its size in canvas px. */
function GapGuide({ g, k }) {
  const len = g.to - g.from;
  const horizontal = g.axis === 'x';
  const tick = 6 * k;
  const line = horizontal
    ? { left: g.from, top: g.at - k / 2, width: len, height: k }
    : { left: g.at - k / 2, top: g.from, width: k, height: len };
  const ends = horizontal
    ? [
        { left: g.from - k / 2, top: g.at - tick / 2, width: k, height: tick },
        { left: g.to - k / 2, top: g.at - tick / 2, width: k, height: tick },
      ]
    : [
        { left: g.at - tick / 2, top: g.from - k / 2, width: tick, height: k },
        { left: g.at - tick / 2, top: g.to - k / 2, width: tick, height: k },
      ];
  const mid = horizontal ? { x: g.from + len / 2, y: g.at } : { x: g.at, y: g.from + len / 2 };
  return (
    <div data-testid="snap-gap" data-axis={g.axis} data-from={g.from} data-to={g.to}>
      {[line, ...ends].map((st, i) => (
        <div key={i} style={{ position: 'absolute', background: GAP, ...st }} />
      ))}
      <div
        data-testid="snap-label"
        style={{
          position: 'absolute',
          left: mid.x,
          top: mid.y,
          transform: horizontal ? `translate(-50%, ${-20 * k}px)` : `translate(${6 * k}px, -50%)`,
          fontSize: 11 * k,
          lineHeight: 1.3,
          padding: `${1 * k}px ${4 * k}px`,
          borderRadius: 3 * k,
          background: GAP,
          color: '#fff',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        {Math.round(g.label)}
      </div>
    </div>
  );
}

export default function EditLayer({
  slide,
  selected,
  group,
  guides,
  tip,
  scale,
  canvas,
  onHandleMouseDown,
  node = null,
  onNodeMove,
}) {
  const k = 1 / (scale || 1);
  const W = canvas?.width ?? 1920;
  const H = canvas?.height ?? 1080;
  const groupEl = group ? slide?.elements?.find((e) => e.id === group) : null;
  const one = selected.length === 1 ? selected[0] : null;
  // several selected: the box of the unlocked ones, scaled from its corners
  const movable = selected.length > 1 ? selected.filter((el) => !el.locked) : [];
  const box = movable.length ? bounds(movable.map((el) => el.frame)) : null;
  const hs = 8 * k;
  const handle = (dir, f) => {
    const p = handleAt(dir, f);
    return (
      <div
        key={dir}
        data-testid="resize-handle"
        data-dir={dir}
        onMouseDown={(e) => onHandleMouseDown(e, dir, scale)}
        style={{
          position: 'absolute',
          left: p.x - hs / 2,
          top: p.y - hs / 2,
          width: hs,
          height: hs,
          background: '#fff',
          border: `${1.5 * k}px solid ${UI_ACCENT}`,
          borderRadius: 1.5 * k,
          boxSizing: 'border-box',
          cursor: CURSOR[dir],
          pointerEvents: 'auto',
        }}
      />
    );
  };
  const tipEl = tip ? findElement(slide?.elements, tip.id) : null;
  return (
    <div data-testid="edit-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {tipEl ? (
        <div
          role="tooltip"
          data-testid="inline-tip"
          data-element={tipEl.id}
          style={{
            position: 'absolute',
            left: tipEl.frame.x,
            top: Math.max(0, tipEl.frame.y - 30 * k),
            fontSize: 12 * k,
            lineHeight: 1.4,
            padding: `${3 * k}px ${8 * k}px`,
            borderRadius: 4 * k,
            background: '#18181b',
            color: '#ffffff',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            whiteSpace: 'nowrap',
            zIndex: 6,
          }}
        >
          {tip.text}
        </div>
      ) : null}
      {groupEl ? (
        <div
          data-testid="group-outline"
          style={{
            position: 'absolute',
            left: groupEl.frame.x,
            top: groupEl.frame.y,
            width: groupEl.frame.w,
            height: groupEl.frame.h,
            outline: `${1 * k}px dashed ${UI_ACCENT}`,
          }}
        />
      ) : null}
      {selected.map((el) => (
        <div
          key={el.id}
          data-testid="selection-outline"
          data-element={el.id}
          data-locked={el.locked ? 'true' : undefined}
          data-hidden={el.hidden ? 'true' : undefined}
          style={{
            position: 'absolute',
            left: el.frame.x,
            top: el.frame.y,
            width: el.frame.w,
            height: el.frame.h,
            outline: `${1.5 * k}px ${el.hidden ? 'dashed' : 'solid'} ${UI_ACCENT}`,
            background: el.hidden ? 'rgba(37, 99, 235, 0.06)' : undefined,
          }}
        />
      ))}
      {one && !one.locked ? HANDLES.map((dir) => handle(dir, one.frame)) : null}
      {box ? (
        <>
          <div
            data-testid="selection-box"
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              outline: `${1 * k}px dashed ${UI_ACCENT}`,
            }}
          />
          {CORNERS.map((dir) => handle(dir, box))}
        </>
      ) : null}
      {node && onNodeMove ? (
        <NodeOutline slide={slide} info={node} scale={scale} onMove={(to) => onNodeMove(node, to)} />
      ) : null}
      {(guides ?? []).map((g, i) =>
        g.type === 'gap' ? (
          <GapGuide key={`gap-${g.axis}-${g.from}-${g.to}-${i}`} g={g} k={k} />
        ) : (
          <div
            key={`${g.axis}-${g.v}-${i}`}
            data-testid="snap-guide"
            style={
              g.axis === 'x'
                ? {
                    position: 'absolute',
                    left: g.v - k / 2,
                    top: 0,
                    width: k,
                    height: H,
                    background: UI_ACCENT,
                  }
                : {
                    position: 'absolute',
                    top: g.v - k / 2,
                    left: 0,
                    height: k,
                    width: W,
                    background: UI_ACCENT,
                  }
            }
          />
        ),
      )}
    </div>
  );
}
