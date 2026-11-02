// The filmstrip (docs/PLAN-studio.md §2): the live slides scaled (ST-3: the renderer, never PNGs), number + kind label,
// the selected slide ringed in the brand's accent (the only place the brand colours the chrome). Keyboard
// navigation lives in the Studio (window keys); a click selects.
import { memo, useEffect, useRef } from 'react';
import { ScaledSlide } from '../components/SlideCanvas.jsx';
import { cx } from '../lib/format.js';

const Thumb = memo(function Thumb({ deck, index, opts, selected, accent, overridden, onSelect }) {
  const slide = deck.slides[index];
  return (
    <li>
      <button
        type="button"
        data-testid="film-thumb"
        data-selected={selected ? 'true' : 'false'}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Slide ${index + 1}, ${slide.requestedKind ?? slide.kind}`}
        onClick={() => onSelect(index)}
        className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100"
      >
        <span
          className={cx(
            'w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums',
            selected ? 'text-zinc-900' : 'text-zinc-400',
          )}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block overflow-hidden rounded-sm bg-white"
            style={{ boxShadow: selected ? `0 0 0 2px ${accent ?? '#2563eb'}` : '0 0 0 1px #e4e4e7' }}
          >
            <ScaledSlide deck={deck} index={index} opts={opts} fallbackWidth={136} />
          </span>
          <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
            <span className="truncate">{slide.requestedKind ?? slide.kind}</span>
            {overridden ? (
              <span
                title="this slide has overrides"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
              />
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
});

export default function Filmstrip({ deck, index, opts, accent, overrides, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [index, deck]);
  if (!deck) return <nav className="h-full w-[180px] shrink-0 border-r border-zinc-200 bg-white" />;
  const slides = overrides?.slides ?? {};
  return (
    <nav
      aria-label="Slides"
      className="h-full w-[180px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-white py-2"
      ref={ref}
    >
      <ol className="m-0 list-none p-0">
        {deck.slides.map((s, i) => (
          <Thumb
            key={s.id ?? i}
            deck={deck}
            index={i}
            opts={opts}
            selected={i === index}
            accent={accent}
            overridden={Boolean(slides[s.contentSlideId ?? s.id])}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </nav>
  );
}
