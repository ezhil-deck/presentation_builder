// The slide-kind picker (docs/P4-spec.md §3, P4.2): the catalogue's layout families grouped as the catalogue tags them
// (cover / section / text / lists / process / data / media / people / closing), each with its mini wireframe (built for
// this brand's Mood by the server) and the block types its new slide starts with. Picking one inserts a slide with that
// block skeleton and placeholder copy (packages/engine/src/content/placeholders.js, which the `placeholder` check reads).
import { useEffect, useMemo, useRef, useState } from 'react';
import { slideSkeleton } from '../../../engine/src/content/placeholders.js';
import { Wireframe, loadLayouts } from './LayoutPicker.jsx';
import { Icon } from './ui.jsx';

/** The picker's groups, in order. */
export const GROUPS = Object.freeze([
  ['cover', 'Cover'],
  ['section', 'Section'],
  ['text', 'Text'],
  ['lists', 'Lists'],
  ['process', 'Process'],
  ['data', 'Data'],
  ['media', 'Media'],
  ['people', 'People'],
  ['closing', 'Closing'],
]);

/** Catalogue tags -> group, most telling first (a layout takes the group of its first matching tag). */
const TAG_GROUP = [
  ['closing', 'closing'],
  ['divider', 'section'],
  ['process', 'process'],
  ['data', 'data'],
  ['chart', 'data'],
  ['table', 'data'],
  ['kpis', 'data'],
  ['hero', 'cover'],
  ['image', 'media'],
  ['people', 'people'],
  ['quote', 'people'],
  ['logos', 'people'],
  ['list', 'lists'],
  ['cards', 'lists'],
  ['items', 'lists'],
  ['points', 'lists'],
  ['compare', 'lists'],
  ['text', 'text'],
];
const KIND_GROUP = {
  cover: 'cover',
  section: 'section',
  cta: 'closing',
  text: 'text',
  agenda: 'lists',
  bullets: 'lists',
  cards: 'lists',
  'two-column': 'lists',
  steps: 'process',
  timeline: 'process',
  kpi: 'data',
  chart: 'data',
  table: 'data',
  image: 'media',
  'image-text': 'media',
  quote: 'people',
  team: 'people',
  logos: 'people',
};

/** The group of a layout (its tags, else its kind). */
export function groupOf(layout) {
  const tags = layout?.tags ?? [];
  for (const [tag, group] of TAG_GROUP) if (tags.includes(tag)) return group;
  return KIND_GROUP[layout?.kind] ?? 'text';
}

/** What a new slide of this layout starts with: its slide keys and block types (the skeleton). */
export function skeletonParts(layout) {
  const sk = slideSkeleton(layout);
  const keys = ['label', 'number', 'title', 'subtitle', 'cta'].filter((k) => sk[k] !== undefined);
  return { keys, blocks: (sk.blocks ?? []).map((b) => b.type) };
}

function Family({ layout, onPick }) {
  const parts = skeletonParts(layout);
  return (
    <button
      type="button"
      data-testid="kind-option"
      data-layout={layout.id}
      onClick={() => onPick(layout)}
      className="flex w-[132px] flex-col items-start gap-1 rounded-md p-1.5 text-left hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
    >
      <span className="overflow-hidden rounded-sm ring-1 ring-zinc-200">
        <Wireframe layout={layout} width={120} />
      </span>
      <span className="w-full truncate text-[12px] text-zinc-800">{layout.label ?? layout.id}</span>
      <span className="w-full truncate text-[11px] text-zinc-500" data-testid="kind-blocks">
        {parts.blocks.length ? parts.blocks.join(' + ') : parts.keys.join(', ')}
      </span>
    </button>
  );
}

/**
 * `brandId` = the brand the wireframes are built for; `onPick(layout)` (layout = {id, kind, label, tags, default,
 * boxes}); `onClose()`; `title` = what the picker does ("Add after slide 4").
 */
export default function SlideKindPicker({ brandId, title = 'New slide', onPick, onClose, style }) {
  const [state, setState] = useState({ all: null, error: null });
  const ref = useRef(null);

  useEffect(() => {
    let live = true;
    loadLayouts(undefined, brandId)
      .then((all) => live && setState({ all: all ?? [], error: null }))
      .catch((err) => live && setState({ all: null, error: err.message }));
    return () => {
      live = false;
    };
  }, [brandId]);

  // closes on an outside click or Escape
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const by = new Map(GROUPS.map(([id]) => [id, []]));
    for (const l of state.all ?? []) by.get(groupOf(l))?.push(l);
    return GROUPS.map(([id, label]) => ({ id, label, layouts: by.get(id) })).filter((g) => g.layouts.length);
  }, [state.all]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Slide kinds"
      data-testid="kind-picker"
      className="fixed z-50 flex max-h-[78vh] w-[600px] flex-col rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-900/15"
      style={style}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 px-3">
        <span className="text-[13px] font-medium text-zinc-900">{title}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-900"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.error ? <p className="p-2 text-xs text-red-700">{state.error}</p> : null}
        {!state.all && !state.error ? <p className="p-2 text-xs text-zinc-400">Loading layouts…</p> : null}
        {groups.map((g) => (
          <section key={g.id} className="mb-2" data-testid="kind-group" data-group={g.id}>
            <h4 className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {g.label}
            </h4>
            <div className="flex flex-wrap gap-1">
              {g.layouts.map((l) => (
                <Family key={l.id} layout={l} onPick={onPick} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="shrink-0 border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500">
        A new slide starts with placeholder copy; the Checks list it until it is replaced.
      </p>
    </div>
  );
}
