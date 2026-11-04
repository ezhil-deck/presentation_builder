// The brand panel (docs/PLAN-studio.md §2), 320 px, stacked groups:
// Brand (logo, name, surfaces as swatch tiles - a click sets this slide's surface -, type, the deck's rhythm, Mood),
// Element in edit mode (docs/P4-spec.md §2: ElementPanel.jsx), Slide (kind, layout variant picker - collapsed to a
// "Layout: <id>" row -, surface, decor on / off, logo on / off) and Checks (this slide's items; hovering one outlines
// its element on the canvas; an item with a supported fix command gets a Fix button; the deck-level items under
// "Deck"). The Checks group sits above the Slide group when the slide has warn / fail items (P4.2, the owner's review:
// the Fix buttons in sight), with its count either way. Locked while a compose runs. P4.3: the Type section switches
// the deck's font pair when the brand defines alternatives (Mood type.pairs; a deck-level override), else says the
// brand defines one pair; the Element group carries the image / chart / table / flow-node editing (ElementPanel.jsx).
import { useState } from 'react';
import Pill from '../components/Pill.jsx';
import { bySeverity } from '../lib/checks.js';
import { cx } from '../lib/format.js';
import { FIX_COMMANDS } from './edit.js';
import ElementPanel from './ElementPanel.jsx';
import LayoutPicker, { layoutLabel } from './LayoutPicker.jsx';
import { countSeverities, hasRole, overrideOf, splitItems } from './lib.js';
import { GroupHeader, Icon, LogoChip, Row, Toggle } from './ui.jsx';

const hasElement = (els, id) => (els ?? []).some((e) => e.id === id || hasElement(e.children, id));

function SurfaceTile({ surface, selected, pinned, onPick }) {
  return (
    <button
      type="button"
      data-testid="surface-tile"
      data-surface={surface.id}
      aria-pressed={selected}
      title={`${surface.id}: background ${surface.bg}, text ${surface.text}, accent ${surface.accent}`}
      onClick={() => onPick(surface.id)}
      className="group flex min-w-0 flex-col gap-1 text-left disabled:cursor-not-allowed"
    >
      <span
        className="relative flex h-12 w-full items-end justify-between rounded-md px-2 pb-1.5"
        style={{
          background: surface.bg,
          boxShadow: selected ? '0 0 0 2px #2563eb' : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
        }}
      >
        <span
          style={{ color: surface.heading ?? surface.text, fontSize: 15, fontWeight: 600, lineHeight: 1 }}
        >
          Aa
        </span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: surface.accent }} />
      </span>
      <span className="flex items-center gap-1 truncate text-[11px] text-zinc-600">
        <span className="truncate">{surface.id}</span>
        {pinned ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" title="set on this slide" />
        ) : null}
      </span>
    </button>
  );
}

function TypeSample({ label, family, sample, size }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-zinc-500">{label}</span>
        <span className="truncate text-xs text-zinc-700">{family ?? '—'}</span>
      </div>
      {family ? (
        <div
          className="truncate text-zinc-900"
          style={{ fontFamily: `"${family}", ui-sans-serif, system-ui`, fontSize: size, lineHeight: 1.3 }}
        >
          {sample}
        </div>
      ) : null}
    </div>
  );
}

/** The deck's rhythm: one cell per slide in its surface's background; the current slide marked; a click selects. */
function RhythmStrip({ deck, surfaces, index, onSelect }) {
  const bg = Object.fromEntries((surfaces ?? []).map((s) => [s.id, s.bg]));
  return (
    <div className="flex h-5 gap-px" data-testid="rhythm">
      {(deck?.slides ?? []).map((s, i) => (
        <button
          type="button"
          key={s.id ?? i}
          title={`${i + 1} · ${s.surfaceId ?? '—'}`}
          aria-label={`Slide ${i + 1} surface ${s.surfaceId ?? 'none'}`}
          onClick={() => onSelect(i)}
          className="min-w-0 flex-1 rounded-[2px]"
          style={{
            background: bg[s.surfaceId] ?? '#e4e4e7',
            boxShadow: i === index ? '0 0 0 1.5px #2563eb' : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
          }}
        />
      ))}
    </div>
  );
}

function CheckItem({ item, onHover, onFix }) {
  const fixable = onFix && item.elementId && FIX_COMMANDS.includes(item.fix?.command);
  return (
    <li
      data-testid="panel-check-item"
      onMouseEnter={() => onHover(item)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(item)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      className="rounded-md px-2 py-1.5 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
    >
      <div className="flex items-center gap-1.5">
        <Pill status={item.severity} />
        <span className="truncate font-mono text-[11px] text-zinc-700">{item.check}</span>
        {fixable ? (
          <button
            type="button"
            data-testid="fix-button"
            title={`Fix: ${item.fix.command}`}
            onClick={(e) => {
              e.stopPropagation();
              onFix(item);
            }}
            className="ml-auto h-6 shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-xs text-blue-700 hover:bg-blue-50"
          >
            Fix
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs leading-snug text-zinc-700">{item.message}</p>
    </li>
  );
}

function Counts({ items }) {
  const c = countSeverities(items);
  if (!c.fail && !c.warn && !c.info) return <span className="text-xs text-zinc-400">none</span>;
  return (
    <span className="flex gap-1">
      {c.fail ? <Pill status="fail">{c.fail}</Pill> : null}
      {c.warn ? <Pill status="warn">{c.warn}</Pill> : null}
      {c.info ? <Pill status="info">{c.info}</Pill> : null}
    </span>
  );
}

export default function BrandPanel({
  brand,
  deck,
  index,
  checks,
  overrides,
  busy,
  onOverride,
  onReset,
  onSelect,
  onHoverItem,
  onOpenMood,
  onOpenChecks,
  onFix,
  editing = false,
  editor = null,
  checksOpen: checksOpenProp,
  onChecksOpen,
  contentSlide = null,
  data = null,
  focalId = null,
  onFocal,
  tableCell = null,
  onTableCell,
  fontPair = null,
  onFontPair,
}) {
  const [checksOpenOwn, setChecksOpenOwn] = useState(false);
  const checksOpen = checksOpenProp ?? checksOpenOwn;
  const setChecksOpen = onChecksOpen ?? setChecksOpenOwn;
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const slide = deck?.slides?.[index];
  const sid = slide?.contentSlideId ?? slide?.id;
  const o = overrideOf(overrides, slide);
  const ownElements = (overrides?.elements ? Object.keys(overrides.elements) : []).filter(
    (id) => slide && hasElement(slide.elements, id),
  );
  const pinned = Object.keys(o).length > 0 || ownElements.length > 0;
  const { mine, deck: deckItems } = splitItems(checks, slide, index + 1);
  mine.sort(bySeverity);
  deckItems.sort(bySeverity);
  const set = (patch) => onOverride(sid, patch);
  const hasDecor = hasRole(slide, 'decor');
  const hasLogo = hasRole(slide, 'logo');
  const counts = countSeverities(mine);
  const flagged = counts.fail + counts.warn > 0;
  const pairs = brand?.fontPairs ?? [];
  const activePair = fontPair ? (pairs.find((p) => p.id === fontPair) ?? null) : null;

  // Checks: above the Slide group when this slide has warn / fail items (the Fix buttons in sight)
  const checksGroup = (
    <section
      className={cx('px-4 pb-4 pt-2', flagged && 'border-b border-zinc-200')}
      data-testid="checks-group"
      data-placement={flagged ? 'top' : 'bottom'}
    >
      <div className="flex h-8 items-center justify-between">
        <button
          type="button"
          aria-expanded={checksOpen}
          onClick={() => setChecksOpen(!checksOpen)}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900"
        >
          <Icon name={checksOpen ? 'down' : 'right'} className="h-3.5 w-3.5" />
          Checks{' '}
          <span className="tabular-nums" data-testid="checks-count">
            ({mine.length})
          </span>
        </button>
        <Counts items={mine} />
      </div>
      {checksOpen ? (
        <div className="mt-1 space-y-2">
          {mine.length ? (
            <ul className="space-y-0.5">
              {mine.map((it, i) => (
                <CheckItem key={`${it.check}-${i}`} item={it} onHover={onHoverItem} onFix={onFix} />
              ))}
            </ul>
          ) : (
            <p className="px-2 text-xs text-zinc-400">No check item on this slide.</p>
          )}
          <div className="flex h-8 items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Deck <span className="tabular-nums">({deckItems.length})</span>
            </span>
            <button type="button" className="text-xs text-blue-700 hover:underline" onClick={onOpenChecks}>
              All checks
            </button>
          </div>
          {deckItems.length ? (
            <ul className={cx('space-y-0.5')}>
              {deckItems.map((it, i) => (
                <CheckItem key={`${it.check}-d${i}`} item={it} onHover={onHoverItem} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  return (
    <aside
      aria-label="Brand panel"
      aria-busy={busy}
      className="h-full w-[320px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-zinc-200 bg-white"
    >
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0" data-testid="panel-fieldset">
        {/* Brand */}
        <section className="space-y-3 border-b border-zinc-200 px-4 pb-4 pt-2">
          <GroupHeader
            right={
              <button type="button" className="text-xs text-blue-700 hover:underline" onClick={onOpenMood}>
                Mood
              </button>
            }
          >
            Brand
          </GroupHeader>
          <div className="flex items-center gap-3">
            <LogoChip brand={brand} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-zinc-900">{brand?.name ?? '—'}</div>
              <div className="truncate font-mono text-[11px] text-zinc-400">{brand?.id}</div>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-zinc-500">Surfaces</span>
              {o.surface ? (
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  onClick={() => set({ surface: null })}
                >
                  Auto
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(brand?.surfaces ?? []).map((s) => (
                <SurfaceTile
                  key={s.id}
                  surface={s}
                  selected={slide?.surfaceId === s.id}
                  pinned={o.surface === s.id}
                  onPick={(id) => {
                    if (id !== o.surface) set({ surface: id });
                  }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2" data-testid="type-section">
            <div className="flex min-h-7 items-center justify-between gap-2">
              <span className="text-zinc-500">Type</span>
              {pairs.length ? (
                <select
                  aria-label="Font pair"
                  value={activePair?.id ?? ''}
                  onChange={(e) => onFontPair?.(e.target.value || null)}
                  className="h-7 min-w-0 max-w-[190px] rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
                >
                  <option value="">
                    Brand pair ({brand?.fonts?.heading ?? '—'} / {brand?.fonts?.body ?? '—'})
                  </option>
                  {pairs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-zinc-400" data-testid="font-pair-one">
                  This brand defines one pair
                </span>
              )}
            </div>
            <TypeSample
              label="Heading"
              family={activePair?.headingFamily ?? brand?.fonts?.heading}
              sample={brand?.name ?? 'Heading'}
              size={20}
            />
            <TypeSample
              label="Body"
              family={activePair?.bodyFamily ?? brand?.fonts?.body}
              sample="Body text reads comfortably at the brand's size."
              size={13}
            />
          </div>
          <div>
            <div className="mb-1.5 text-zinc-500">Rhythm</div>
            <RhythmStrip deck={deck} surfaces={brand?.surfaces} index={index} onSelect={onSelect} />
          </div>
        </section>
      </fieldset>

      {/* the Element group stays usable while a compose runs: its content edits queue (useStudio.edit); the
          overrides controls inside it are locked (ElementPanel `busy`) */}
      {editing && editor ? (
        <ElementPanel
          busy={busy}
          selected={editor.selected}
          group={editor.group}
          overrides={overrides?.elements}
          slideOverridden={pinned}
          onAlign={editor.align}
          onDistribute={editor.distribute}
          onMatch={editor.match}
          onFrame={editor.setFrame}
          onToggle={editor.toggle}
          onResetElements={editor.resetElements}
          hidden={editor.hiddenElements}
          onShowHidden={editor.showHidden}
          onResetSlide={() => onReset(sid)}
          contentSlide={contentSlide}
          data={data}
          focalId={focalId}
          onFocal={onFocal}
          tableCell={tableCell}
          onTableCell={onTableCell}
        />
      ) : null}

      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0" data-testid="panel-fieldset-slide">
        {flagged ? checksGroup : null}

        {/* Slide */}
        <section className="space-y-1 border-b border-zinc-200 px-4 pb-4 pt-2" data-testid="slide-group">
          <GroupHeader
            right={
              pinned ? (
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  onClick={() => onReset(sid)}
                >
                  Reset slide
                </button>
              ) : null
            }
          >
            Slide <span className="tabular-nums">{slide ? index + 1 : ''}</span>
          </GroupHeader>
          <Row label="Kind">
            <span className="truncate text-zinc-900">
              {slide ? (slide.requestedKind ?? slide.kind) : '—'}
            </span>
          </Row>
          <div className="py-1">
            <button
              type="button"
              data-testid="layout-toggle"
              aria-expanded={layoutsOpen}
              onClick={() => setLayoutsOpen(!layoutsOpen)}
              className="flex h-8 w-full items-center justify-between gap-2 rounded-md text-left hover:bg-zinc-50"
            >
              <span className="text-zinc-500">Layout</span>
              <span className="flex min-w-0 items-center gap-1 truncate text-xs text-zinc-700">
                <span className="truncate">
                  Layout: {layoutLabel(slide)}
                  {o.layout ? <span className="text-blue-700"> · pinned</span> : null}
                </span>
                <Icon name={layoutsOpen ? 'down' : 'right'} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              </span>
            </button>
            {slide && layoutsOpen ? (
              <LayoutPicker
                kind={slide.kind}
                brandId={brand?.id}
                currentId={slide.layoutId}
                currentLabel={layoutLabel(slide)}
                pinned={Boolean(o.layout)}
                disabled={busy}
                onPick={(id) => set({ layout: id })}
              />
            ) : null}
          </div>
          <Row label="Surface">
            <select
              aria-label="Surface"
              value={o.surface ?? ''}
              onChange={(e) => set({ surface: e.target.value || null })}
              className="h-8 min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-2 text-[13px]"
            >
              <option value="">Auto{slide?.surfaceId && !o.surface ? ` (${slide.surfaceId})` : ''}</option>
              {(brand?.surfaces ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Decor">
            <span className="text-xs text-zinc-400">
              {!hasDecor && o.decor !== false ? 'none on this slide' : null}
            </span>
            <Toggle
              label="Decor"
              checked={o.decor !== false && hasDecor}
              disabled={!hasDecor && o.decor !== false}
              onChange={(on) => set({ decor: on ? null : false })}
            />
          </Row>
          <Row label="Logo">
            <span className="text-xs text-zinc-400">
              {!hasLogo && o.logo !== false ? 'the brand places none here' : null}
            </span>
            <Toggle
              label="Logo"
              checked={o.logo !== false && hasLogo}
              disabled={!hasLogo && o.logo !== false}
              onChange={(on) => set({ logo: on ? null : false })}
            />
          </Row>
        </section>

        {flagged ? null : checksGroup}
      </fieldset>
    </aside>
  );
}
