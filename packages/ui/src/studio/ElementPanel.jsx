// The panel's Element group (docs/P4-spec.md §2; P4.1), shown in edit mode: the selected element's slot / role / type,
// its frame as numbers (Enter or leaving the field commits), lock / hide, reset element / reset slide, and align /
// distribute / match size (with 1 selected: align to the content frame). Every action is one command. P4.3: an image
// grows an Image section (DataPanel.jsx), a chart / table a Data tab, a flow node (or one of its texts) its node
// fields with add / remove / reorder. P4.4: a multi-selection with locked elements says so (they are left out of
// nudge / align / distribute / match / resize); the slide's hidden elements are listed with Show (they cannot be
// selected: they are not painted).
import { useEffect, useState } from 'react';
import { getPointer } from '../../../engine/src/content/source.js';
import { cx } from '../lib/format.js';
import { ChartData, ImageSection, NodeSection, TableData } from './DataPanel.jsx';
import { flowNodeOf, imageTarget } from './dataEdit.js';
import { GroupHeader, Row, Toggle } from './ui.jsx';

const ALIGN = [
  ['left', 'Left'],
  ['center', 'Centre'],
  ['right', 'Right'],
  ['top', 'Top'],
  ['middle', 'Middle'],
  ['bottom', 'Bottom'],
];

function SmallButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
      {...props}
    >
      {children}
    </button>
  );
}

/** One frame number: edited locally, committed on Enter / blur when it changed. */
function FrameField({ label, value, onCommit, disabled }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && Math.abs(n - value) >= 0.005) onCommit(n);
    else setText(String(value));
  };
  return (
    <label className="flex min-w-0 items-center gap-1">
      <span className="w-3 text-xs text-zinc-500">{label}</span>
      <input
        aria-label={`Frame ${label}`}
        type="number"
        step="1"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(String(value));
            e.currentTarget.blur();
          }
        }}
        className="h-7 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1.5 text-xs tabular-nums"
      />
    </label>
  );
}

/** The Element / Data tabs of a chart or a table. */
function Tabs({ tab, onTab }) {
  return (
    <div className="mb-1 flex gap-1 rounded-md bg-zinc-100 p-0.5" role="tablist" aria-label="Element tabs">
      {[
        ['element', 'Element'],
        ['data', 'Data'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          className={cx(
            'h-6 flex-1 rounded text-xs',
            tab === id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function ElementPanel({
  selected,
  group,
  overrides,
  slideOverridden,
  onAlign,
  onDistribute,
  onMatch,
  onFrame,
  onToggle,
  onResetElements,
  onResetSlide,
  hidden = [],
  onShowHidden = () => {},
  contentSlide = null,
  data = null,
  focalId = null,
  onFocal = () => {},
  tableCell = null,
  onTableCell = () => {},
  busy = false,
}) {
  const [tabState, setTab] = useState('element');
  const one = selected.length === 1 ? selected[0] : null;
  const many = selected.length > 1;
  const overridden = selected.some((el) => overrides?.[el.id]);
  const allLocked = selected.length > 0 && selected.every((el) => el.locked);
  const allHidden = selected.length > 0 && selected.every((el) => el.hidden);
  const lockedN = many ? selected.filter((el) => el.locked).length : 0;
  const movableN = selected.length - selected.filter((el) => el.locked).length;
  const f = one?.frame;
  // P4.3: what the one selected element edits in the content
  const graphic =
    data && contentSlide && (one?.type === 'chart' || one?.type === 'table') && one.source?.path
      ? getPointer(contentSlide, one.source.path)
      : null;
  const block = graphic?.type === one?.type ? graphic : null;
  const image = data && contentSlide && one ? imageTarget(one, contentSlide) : null;
  const node = data && contentSlide && one ? flowNodeOf(one, contentSlide) : null;
  const tab = block ? tabState : 'element';
  // a cell being edited on the canvas opens the table's Data tab on it
  useEffect(() => {
    if (tableCell && block?.type === 'table') setTab('data');
  }, [tableCell, block?.type]);
  if (block && tab === 'data') {
    return (
      <section className="space-y-1 border-b border-zinc-200 px-4 pb-4 pt-2" data-testid="element-group">
        <GroupHeader>Element</GroupHeader>
        <Tabs tab={tab} onTab={setTab} />
        {block.type === 'chart' ? (
          <ChartData block={block} blockPath={one.source.path} data={data} />
        ) : (
          <TableData
            block={block}
            blockPath={one.source.path}
            data={data}
            selectedCell={tableCell}
            onSelectCell={onTableCell}
          />
        )}
      </section>
    );
  }
  return (
    <section className="space-y-1 border-b border-zinc-200 px-4 pb-4 pt-2" data-testid="element-group">
      <GroupHeader
        right={
          slideOverridden ? (
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-900"
              onClick={onResetSlide}
            >
              Reset slide
            </button>
          ) : null
        }
      >
        Element {selected.length > 1 ? <span className="tabular-nums">({selected.length})</span> : null}
      </GroupHeader>
      {!selected.length ? (
        <p className="text-xs text-zinc-400" data-testid="element-empty">
          Click an element on the slide; Shift adds, Tab cycles, Esc clears.
          {group ? ' Inside a group: Esc leaves it.' : ''}
        </p>
      ) : null}
      {block ? <Tabs tab={tab} onTab={setTab} /> : null}
      <fieldset
        disabled={busy}
        className="m-0 min-w-0 space-y-1 border-0 p-0"
        data-testid="element-overrides"
      >
        {one ? (
          <>
            <Row label="Element">
              <span className="truncate font-mono text-[11px] text-zinc-700" data-testid="element-id">
                {one.id}
              </span>
            </Row>
            <Row label="Type">
              <span className="truncate text-zinc-900">
                {[one.type, one.role, one.slot ? `slot ${one.slot}` : null].filter(Boolean).join(' · ')}
              </span>
            </Row>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 py-1">
              {['x', 'y', 'w', 'h'].map((k) => (
                <FrameField
                  key={k}
                  label={k.toUpperCase()}
                  value={f[k]}
                  disabled={one.locked}
                  onCommit={(v) => onFrame(one.id, { ...f, [k]: v })}
                />
              ))}
            </div>
          </>
        ) : null}
        {many ? (
          <p className="text-xs text-zinc-500" data-testid="element-many">
            {selected.length} elements selected
          </p>
        ) : null}
        {lockedN ? (
          <p className="text-xs text-amber-700" data-testid="element-locked">
            {lockedN} locked: not moved, nudged, aligned, distributed, matched or resized
          </p>
        ) : null}
        {selected.length ? (
          <>
            <Row label="Lock">
              <Toggle label="Lock" checked={allLocked} onChange={() => onToggle('locked')} />
            </Row>
            <Row label="Hide">
              <Toggle label="Hide" checked={allHidden} onChange={() => onToggle('hidden')} />
            </Row>
            <div className="pt-1">
              <div className="mb-1 text-zinc-500">{many ? 'Align' : 'Align to content'}</div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Align">
                {ALIGN.map(([how, label]) => (
                  <SmallButton
                    key={how}
                    aria-label={`Align ${label.toLowerCase()}`}
                    onClick={() => onAlign(how)}
                  >
                    {label}
                  </SmallButton>
                ))}
              </div>
            </div>
            {many ? (
              <div className="flex flex-wrap gap-1 pt-1">
                <SmallButton disabled={movableN < 3} onClick={() => onDistribute('x')}>
                  Distribute H
                </SmallButton>
                <SmallButton disabled={movableN < 3} onClick={() => onDistribute('y')}>
                  Distribute V
                </SmallButton>
                <SmallButton disabled={movableN < 2} onClick={() => onMatch('w')}>
                  Match width
                </SmallButton>
                <SmallButton disabled={movableN < 2} onClick={() => onMatch('h')}>
                  Match height
                </SmallButton>
              </div>
            ) : null}
            <div className="flex justify-end pt-2">
              <SmallButton disabled={!overridden} onClick={onResetElements}>
                Reset element
              </SmallButton>
            </div>
          </>
        ) : null}
        {hidden.length ? (
          <div className="pt-2" data-testid="element-hidden">
            <div className="mb-1 flex items-center justify-between text-zinc-500">
              <span>
                Hidden on this slide <span className="tabular-nums">({hidden.length})</span>
              </span>
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-zinc-900"
                onClick={() => onShowHidden()}
              >
                Show all
              </button>
            </div>
            <ul className="space-y-0.5">
              {hidden.map((el) => (
                <li key={el.id} className="flex items-center justify-between gap-2" data-testid="hidden-item">
                  <span className="truncate font-mono text-[11px] text-zinc-500">{el.id}</span>
                  <button
                    type="button"
                    aria-label={`Show ${el.id}`}
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => onShowHidden([el.id])}
                  >
                    Show
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </fieldset>
      {one ? (
        <>
          {image ? (
            <ImageSection
              el={one}
              target={image}
              override={overrides?.[one.id]}
              data={data}
              focalOn={focalId === one.id}
              onFocal={onFocal}
              busy={busy}
            />
          ) : null}
          {node ? <NodeSection info={node} data={data} /> : null}
        </>
      ) : null}
    </section>
  );
}
