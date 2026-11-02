// The layout variant picker (docs/PLAN-studio.md §2, S1.b): the catalogue's layouts for the slide's kind as mini
// wireframes (their boxes, built for this brand's Mood by the server), the current one marked; picking one pins it on
// this slide (an override), picking the kind's default removes the pin. "Other kinds" lists the rest of the catalogue
// (a pinned layout of another kind binds what it can of the slide's content; the engine reports what it drops).
import { useEffect, useState } from 'react';
import { studioApi } from '../api.js';
import { cx } from '../lib/format.js';
import { CANVAS } from './lib.js';

const ROLE_FILL = {
  title: '#a1a1aa',
  heading: '#a1a1aa',
  subtitle: '#d4d4d8',
  eyebrow: '#d4d4d8',
};

export function Wireframe({ layout, width = 88 }) {
  const h = (width * CANVAS.height) / CANVAS.width;
  return (
    <svg
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      width={width}
      height={h}
      aria-hidden="true"
      className="block"
      data-testid="wireframe"
    >
      <rect x="0" y="0" width={CANVAS.width} height={CANVAS.height} fill="#fafafa" />
      {(layout.boxes ?? []).map((b) =>
        b.frame ? (
          <rect
            key={b.id}
            x={b.frame.x}
            y={b.frame.y}
            width={Math.max(1, b.frame.w)}
            height={Math.max(1, b.frame.h)}
            fill={ROLE_FILL[b.role] ?? '#e4e4e7'}
            stroke="#a1a1aa"
            strokeWidth="6"
            rx="8"
          />
        ) : null,
      )}
    </svg>
  );
}

function Option({ layout, current, onPick, disabled }) {
  return (
    <button
      type="button"
      data-testid="layout-option"
      data-layout={layout.id}
      aria-pressed={current}
      disabled={disabled}
      onClick={() => onPick(layout)}
      className={cx(
        'flex flex-col items-start gap-1 rounded-md p-1 text-left disabled:cursor-not-allowed',
        current ? 'bg-blue-50 ring-1 ring-inset ring-blue-600' : 'hover:bg-zinc-100',
      )}
    >
      <span className="overflow-hidden rounded-sm ring-1 ring-zinc-200">
        <Wireframe layout={layout} />
      </span>
      <span className="max-w-[88px] truncate text-[11px] text-zinc-600">
        {layout.id}
        {layout.default ? <span className="text-zinc-400"> · default</span> : null}
      </span>
    </button>
  );
}

const cache = new Map();
function loadLayouts(kind, brandId) {
  const key = `${brandId ?? ''}|${kind ?? '*'}`;
  if (!cache.has(key)) {
    const p = studioApi.layouts({ kind, brandId }).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}
/** Forget the cached layouts (tests; a reconverted brand). */
export const clearLayoutCache = () => cache.clear();

export default function LayoutPicker({ kind, brandId, currentId, pinned, onPick, disabled }) {
  const [state, setState] = useState({ mine: null, all: null, error: null });
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, mine: null, error: null }));
    loadLayouts(kind, brandId)
      .then((mine) => live && setState((s) => ({ ...s, mine: mine ?? [] })))
      .catch((err) => live && setState((s) => ({ ...s, error: err.message })));
    return () => {
      live = false;
    };
  }, [kind, brandId]);

  useEffect(() => {
    if (!more || state.all) return undefined;
    let live = true;
    loadLayouts(undefined, brandId)
      .then((all) => live && setState((s) => ({ ...s, all: all ?? [] })))
      .catch((err) => live && setState((s) => ({ ...s, error: err.message })));
    return () => {
      live = false;
    };
  }, [more, brandId, state.all]);

  const pick = (layout) => {
    if (layout.id === currentId && pinned) return;
    // the kind's default layout is what the engine picks anyway: no pin
    onPick(layout.default ? null : layout.id);
  };

  if (state.error) return <p className="text-xs text-red-700">{state.error}</p>;
  if (!state.mine) return <p className="text-xs text-zinc-400">Loading layouts…</p>;
  const mineIds = new Set(state.mine.map((l) => l.id));
  const others = (state.all ?? []).filter((l) => !mineIds.has(l.id));
  return (
    <div data-testid="layout-picker">
      <div className="flex flex-wrap gap-1">
        {state.mine.map((l) => (
          <Option key={l.id} layout={l} current={l.id === currentId} onPick={pick} disabled={disabled} />
        ))}
        {state.mine.length === 0 ? <p className="text-xs text-zinc-400">No layout for this kind.</p> : null}
      </div>
      <button
        type="button"
        className="mt-1 text-xs text-zinc-500 hover:text-zinc-900"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        {more ? 'Hide other kinds' : 'Other kinds…'}
      </button>
      {more ? (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="layout-others">
          {state.all ? (
            others.map((l) => (
              <Option
                key={l.id}
                layout={{ ...l, default: false }}
                current={l.id === currentId}
                onPick={pick}
                disabled={disabled}
              />
            ))
          ) : (
            <p className="text-xs text-zinc-400">Loading…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
