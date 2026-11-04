// The filmstrip (docs/PLAN-studio.md §2): the live slides scaled (ST-3: the renderer, never PNGs), number + kind label,
// the selected slide ringed in the brand's accent (the only place the brand colours the chrome), a red count of the
// slide's overflowing texts (docs/P4-spec.md §4). Slides (P4.2, §3): drag a row to reorder (the rows shift, the drop
// moves the slide), a right-click menu (add after, duplicate, delete, hide / show), a `+` between rows and "New slide"
// at the top open the slide-kind picker; with the focus in the strip ⌘D duplicates, Delete / Backspace deletes and
// ⌘↑ / ⌘↓ move the slide. Every change is an undoable command (the Studio runs them). A click selects.
import { memo, useEffect, useRef, useState } from 'react';
import { ScaledSlide } from '../components/SlideCanvas.jsx';
import { cx } from '../lib/format.js';
import { overflowing } from './edit.js';
import { matchKey } from './keys.js';
import { MenuItem, MenuSeparator } from './ui.jsx';

const DRAG_PX = 4;

const hasElementOverride = (els, elements) =>
  (els ?? []).some((e) => elements[e.id] || hasElementOverride(e.children, elements));

const Thumb = memo(function Thumb({
  deck,
  index,
  opts,
  selected,
  accent,
  overridden,
  hidden,
  shift,
  dragging,
  onSelect,
  onDown,
  onMenu,
  onAddAfter,
}) {
  const slide = deck.slides[index];
  const overflow = overflowing(slide).length;
  return (
    <li
      className="group relative"
      data-testid="film-row"
      data-index={index}
      style={
        shift || dragging
          ? {
              transform: `translateY(${shift}px)`,
              transition: dragging ? 'none' : 'transform 120ms ease',
              zIndex: dragging ? 2 : undefined,
              position: 'relative',
            }
          : undefined
      }
    >
      <button
        type="button"
        data-testid="film-thumb"
        data-selected={selected ? 'true' : 'false'}
        data-hidden={hidden ? 'true' : undefined}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Slide ${index + 1}, ${slide.requestedKind ?? slide.kind}${hidden ? ', hidden' : ''}`}
        onClick={() => onSelect(index)}
        onMouseDown={(e) => onDown(e, index)}
        onContextMenu={(e) => onMenu(e, index)}
        className={cx(
          'flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100',
          dragging && 'bg-white shadow-lg shadow-zinc-900/15',
        )}
      >
        <span
          className={cx(
            'w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums',
            selected ? 'text-zinc-900' : 'text-zinc-400',
          )}
        >
          {index + 1}
        </span>
        <span className={cx('min-w-0 flex-1', hidden && 'opacity-40')}>
          <span
            className="block overflow-hidden rounded-sm bg-white"
            style={{ boxShadow: selected ? `0 0 0 2px ${accent ?? '#2563eb'}` : '0 0 0 1px #e4e4e7' }}
          >
            <ScaledSlide deck={deck} index={index} opts={opts} fallbackWidth={136} />
          </span>
          <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="truncate">{slide.requestedKind ?? slide.kind}</span>
            {hidden ? <span className="shrink-0 text-zinc-400">· hidden</span> : null}
            {overridden ? (
              <span
                title="this slide has overrides"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
              />
            ) : null}
            {overflow ? (
              <span
                data-testid="film-overflow"
                title={`${overflow} text${overflow > 1 ? 's' : ''} overflow${overflow > 1 ? '' : 's'} its box`}
                className="ml-auto rounded bg-red-50 px-1 text-[10px] font-medium tabular-nums text-red-700 ring-1 ring-inset ring-red-200"
              >
                {overflow}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {onAddAfter ? (
        <button
          type="button"
          data-testid="film-add-after"
          aria-label={`Add a slide after slide ${index + 1}`}
          title="Add a slide here"
          onClick={(e) => onAddAfter(e, index)}
          className="absolute -bottom-2 left-1/2 z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-blue-600 text-[12px] leading-none text-white opacity-0 shadow-sm focus:opacity-100 group-hover:opacity-100"
        >
          +
        </button>
      ) : null}
    </li>
  );
});

/**
 * `onAdd(afterIndex, anchor)` opens the slide-kind picker; `onDuplicate(i)`, `onDelete(i)`, `onMove(i, to)`,
 * `onToggleHidden(i)` are the slide commands (absent: read-only strip).
 */
export default function Filmstrip({
  deck,
  index,
  opts,
  accent,
  overrides,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onToggleHidden,
  disabled = false,
}) {
  const elements = overrides?.elements ?? {};
  const ref = useRef(null);
  const [drag, setDrag] = useState(null); // {from, to, dy, h}
  const [menu, setMenu] = useState(null); // {i, x, y}
  const gesture = useRef(null);
  const swallowClick = useRef(false);
  const live = useRef({});
  live.current = { onMove, disabled };

  useEffect(() => {
    const el = ref.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [index, deck]);

  // a row drag follows the pointer on the window; the drop is one move command
  useEffect(() => {
    const onMoveEv = (e) => {
      const g = gesture.current;
      if (!g) return;
      const dy = e.clientY - g.y0;
      if (!g.active && Math.abs(dy) < DRAG_PX) return;
      g.active = true;
      const y = g.rects[g.from].top + g.rects[g.from].height / 2 + dy;
      let to = 0;
      g.rects.forEach((r, i) => {
        if (i !== g.from && r.top + r.height / 2 < y) to += 1;
      });
      g.to = to;
      setDrag({ from: g.from, to, dy, h: g.rects[g.from].height || 0 });
    };
    const onUp = () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      setDrag(null);
      if (!g.active) return;
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      if (g.to !== undefined && g.to !== g.from) live.current.onMove?.(g.from, g.to);
    };
    window.addEventListener('mousemove', onMoveEv);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMoveEv);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // the context menu closes on an outside click or Escape
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && e.target.closest?.('[data-testid="film-menu"]')) return;
      setMenu(null);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close, true);
    };
  }, [menu]);

  if (!deck) return <nav className="h-full w-[180px] shrink-0 border-r border-zinc-200 bg-white" />;
  const slides = overrides?.slides ?? {};
  const editable = Boolean(onMove) && !disabled;

  const onDown = (e, i) => {
    if (e.button !== 0 || !editable) return;
    const rows = [...(ref.current?.querySelectorAll('[data-testid="film-row"]') ?? [])];
    const rects = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return { top: b.top, height: b.height };
    });
    gesture.current = { from: i, y0: e.clientY, rects, active: false };
  };
  const onMenu = (e, i) => {
    if (!onDuplicate) return;
    e.preventDefault();
    onSelect(i);
    setMenu({ i, x: e.clientX, y: e.clientY });
  };
  const shiftOf = (i) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < i && i <= drag.to) return -drag.h;
    if (drag.to <= i && i < drag.from) return drag.h;
    return 0;
  };
  const onKeyDown = (e) => {
    if (!editable) return;
    // keys.js, scope `filmstrip`
    const action = matchKey(e, 'filmstrip');
    let done = true;
    if (action === 'duplicate-slide') onDuplicate?.(index);
    else if (action === 'delete-slide') onDelete?.(index);
    else if (action === 'move-slide-up') onMove?.(index, index - 1);
    else if (action === 'move-slide-down') onMove?.(index, index + 1);
    else done = false;
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const hiddenOf = (s) => slides[s.contentSlideId ?? s.id]?.hidden === true;

  return (
    <nav
      aria-label="Slides"
      data-testid="filmstrip"
      onKeyDown={onKeyDown}
      className="flex h-full w-[180px] shrink-0 flex-col border-r border-zinc-200 bg-white"
    >
      {onAdd ? (
        <div className="shrink-0 border-b border-zinc-200 p-2">
          <button
            type="button"
            data-testid="film-new"
            disabled={disabled}
            onClick={(e) => onAdd(index, e.currentTarget.getBoundingClientRect())}
            className="flex h-8 w-full items-center justify-center gap-1 rounded-md border border-zinc-200 text-[13px] text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            <span className="text-[15px] leading-none">+</span> New slide
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto py-2" ref={ref}>
        <ol
          className="m-0 list-none space-y-0.5 p-0"
          onClickCapture={(e) => {
            if (swallowClick.current) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          {deck.slides.map((s, i) => (
            <Thumb
              key={s.id ?? i}
              deck={deck}
              index={i}
              opts={opts}
              selected={i === index}
              accent={accent}
              overridden={
                Boolean(slides[s.contentSlideId ?? s.id]) || hasElementOverride(s.elements, elements)
              }
              hidden={hiddenOf(s)}
              shift={shiftOf(i)}
              dragging={drag?.from === i}
              onSelect={onSelect}
              onDown={onDown}
              onMenu={onMenu}
              onAddAfter={
                onAdd && !disabled ? (e, k) => onAdd(k, e.currentTarget.getBoundingClientRect()) : null
              }
            />
          ))}
        </ol>
      </div>
      {menu ? (
        <div
          role="menu"
          data-testid="film-menu"
          className="fixed z-50 w-52 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-900/10"
          style={{ left: menu.x, top: menu.y }}
        >
          <MenuItem
            onClick={(e) => {
              setMenu(null);
              onAdd?.(menu.i, e.currentTarget.getBoundingClientRect());
            }}
          >
            Add slide after…
          </MenuItem>
          <MenuItem
            hint="⌘D"
            onClick={() => {
              setMenu(null);
              onDuplicate?.(menu.i);
            }}
          >
            Duplicate
          </MenuItem>
          <MenuItem
            hint="⌫"
            disabled={deck.slides.length < 2}
            onClick={() => {
              setMenu(null);
              onDelete?.(menu.i);
            }}
          >
            Delete
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              setMenu(null);
              onToggleHidden?.(menu.i);
            }}
          >
            {hiddenOf(deck.slides[menu.i]) ? 'Show' : 'Hide'}
          </MenuItem>
        </div>
      ) : null}
    </nav>
  );
}
