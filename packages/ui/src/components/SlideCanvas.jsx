import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Slide, baseCss, fontFaceCss } from '@pb/renderer/components';
import { SEVERITY_COLOR } from '../lib/checks.js';

const canvasOf = (deck) => deck?.canvas ?? { width: 1920, height: 1080 };

/** The deck's stylesheet (@font-face + the renderer's base CSS), injected once per deck. */
export function DeckStyle({ deck, fontBase }) {
  const css = useMemo(
    () => [fontFaceCss(deck, { fontBase }), baseCss(canvasOf(deck))].filter(Boolean).join('\n'),
    [deck, fontBase],
  );
  return <style data-pb-deck={deck?.id}>{css}</style>;
}

/** The element's content width, kept current with ResizeObserver (fallback width before the first layout). */
export function useWidth(ref, fallback) {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
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
  return width;
}

/**
 * Overlay boxes on the canvas (canvas px, inside the scaled box): one outlined rectangle per check item that names
 * an element, coloured by severity, labelled with the check id. `scale` keeps borders and labels readable.
 */
export function SlideOverlay({ boxes, scale = 1, active }) {
  if (!boxes?.length) return null;
  const k = 1 / (scale || 1);
  return (
    <div className="pb-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {boxes.map((b) => {
        const color = SEVERITY_COLOR[b.severity] ?? SEVERITY_COLOR.info;
        const on = active == null || active === b.item;
        return (
          <div
            key={b.key}
            data-testid="overlay-box"
            data-severity={b.severity}
            data-element={b.elementId}
            title={b.message}
            style={{
              position: 'absolute',
              left: b.frame.x,
              top: b.frame.y,
              width: b.frame.w,
              height: b.frame.h,
              border: `${2 * k}px ${b.severity === 'info' ? 'dashed' : 'solid'} ${color}`,
              background: on ? `${color}14` : 'transparent',
              opacity: on ? 1 : 0.35,
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: -2 * k,
                top: -18 * k,
                padding: `0 ${4 * k}px`,
                fontSize: 11 * k,
                lineHeight: `${16 * k}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: '#fff',
                background: color,
                whiteSpace: 'nowrap',
              }}
            >
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One slide painted live by the renderer inside a canvas-sized box scaled (transform: scale) to the container
 * width. `children` render on the canvas, above the slide (overlays).
 */
export function ScaledSlide({ deck, index, opts, fallbackWidth = 320, children, className }) {
  const ref = useRef(null);
  const width = useWidth(ref, fallbackWidth);
  const { width: W, height: H } = canvasOf(deck);
  const scale = width / W;
  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', width: '100%', height: H * scale, overflow: 'hidden' }}
    >
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
