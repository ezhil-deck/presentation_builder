// The Element group's content sections (docs/P4-spec.md §2, P4.3): an image's file / fit / focal point / alt text /
// caption, a chart's and a table's Data tab, and a flow node's fields with add / remove / reorder. Every change is
// one command through `data` (Studio.jsx): content commands (setField, a block replaced) or an element override (an
// image's fit). Fields commit on Enter or when they lose focus; Esc puts the value back.
import { useEffect, useRef, useState } from 'react';
import { cellText } from '../../../engine/src/content/lower.js';
import { cx } from '../lib/format.js';
import {
  CELL_TYPES,
  CHART_TYPES,
  NODE_FIELDS,
  NODE_REQUIRED,
  cellType,
  chartEdit,
  chartGrid,
  highlightsSeries,
  nodeLimit,
  tableColumns,
  tableEdit,
} from './dataEdit.js';
import { matchKey } from './keys.js';
import { Row, Toggle } from './ui.jsx';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

export function SmallButton({ children, className, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A text field committed on Enter / blur when it changed (Esc restores); `multiline` = one value per line. */
export function Field({
  label,
  value,
  onCommit,
  multiline = false,
  placeholder,
  testId,
  required = false,
  inputProps = {},
}) {
  const shown = multiline ? (value ?? []).join('\n') : String(value ?? '');
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text === shown) return;
    // a field the content requires is never emptied (the value is put back)
    if (required && text.trim() === '') {
      setText(shown);
      return;
    }
    onCommit(multiline ? text.split('\n').filter((l) => l.trim() !== '') : text);
  };
  const common = {
    'aria-label': label,
    'data-testid': testId,
    value: text,
    placeholder,
    onChange: (e) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setText(shown);
        e.currentTarget.blur();
      }
      if (e.key === 'Enter' && !(multiline && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    className:
      'w-full min-w-0 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-900 placeholder:text-zinc-400',
    ...inputProps,
  };
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[11px] text-zinc-500">{label}</span>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
    </label>
  );
}

/** The file picker behind a button (images only). */
export function FilePick({ label, onFile, disabled, testId }) {
  const ref = useRef(null);
  return (
    <>
      <SmallButton disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </SmallButton>
      <input
        ref={ref}
        type="file"
        accept={IMAGE_ACCEPT}
        data-testid={testId}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}

const baseName = (src) =>
  String(src ?? '')
    .split('/')
    .pop();

// ---------------------------------------------------------------------------------------------------- image

/** An image: Replace, fit (cover / contain - an element override), focal point, alt text, caption. */
export function ImageSection({ el, target, override, data, focalOn, onFocal, busy = false }) {
  const fit = override?.fit ?? el.image?.fit ?? 'cover';
  const focal = target.focalIn === 'content' ? target.focal : override?.focal;
  return (
    <div className="space-y-1.5 border-t border-zinc-100 pt-2" data-testid="image-section">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Image</div>
      <Row label="File">
        <span className="truncate font-mono text-[11px] text-zinc-700" title={target.src}>
          {baseName(target.src)}
        </span>
        <FilePick label="Replace…" testId="image-file" onFile={(f) => data.replaceImage(el, f)} />
      </Row>
      <Row label="Fit">
        <select
          aria-label="Image fit"
          disabled={busy}
          value={fit === 'contain' ? 'contain' : 'cover'}
          onChange={(e) => data.setFit(el, e.target.value)}
          className="h-7 rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
        </select>
      </Row>
      {target.canFocal ? (
        <Row label="Focal">
          <span className="truncate text-xs tabular-nums text-zinc-600" data-testid="focal-value">
            {focal ? `x ${Number(focal.x).toFixed(2)} · y ${Number(focal.y).toFixed(2)}` : 'centre'}
          </span>
          <SmallButton
            aria-pressed={focalOn}
            className={focalOn ? 'border-blue-300 bg-blue-50 text-blue-700' : undefined}
            title={
              fit === 'contain'
                ? 'A contain image shows the whole file: the focal point applies to cover'
                : ''
            }
            onClick={() => onFocal(focalOn ? null : el.id)}
          >
            {focalOn ? 'Done' : 'Set focal point'}
          </SmallButton>
          {focal ? <SmallButton onClick={() => data.setFocal(el, target, null)}>Clear</SmallButton> : null}
        </Row>
      ) : null}
      {target.canAlt ? (
        <Field
          label="Alt text"
          testId="image-alt"
          value={target.alt}
          onCommit={(v) => data.setField(`${target.nodePath}/alt`, v || undefined, 'Alt text')}
        />
      ) : null}
      {target.canCaption ? (
        <Field
          label="Caption"
          testId="image-caption"
          value={target.caption}
          onCommit={(v) => data.setField(`${target.nodePath}/caption`, v || undefined, 'Caption')}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- chart

/** One numeric grid cell: committed on blur / Enter (Enter moves down), Esc restores. */
function NumberCell({ value, r, c, label, onCommit, onDown }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      aria-label={label}
      data-grid-r={r}
      data-grid-c={c}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text);
        if (text.trim() !== '' && Number.isFinite(n) && n !== value) onCommit(n);
        else setText(String(value));
      }}
      onKeyDown={(e) => {
        const key = matchKey(e, 'grid');
        if (key === 'cell-cancel') {
          e.stopPropagation();
          setText(String(value));
          e.currentTarget.blur();
        }
        if (key === 'cell-down') {
          e.preventDefault();
          e.currentTarget.blur();
          onDown?.(e.currentTarget);
        }
      }}
      className="h-7 w-full min-w-0 rounded border border-zinc-200 bg-white px-1 text-right text-xs tabular-nums"
    />
  );
}

/** One text grid cell (a category, a series name). */
function TextCell({ value, r, c, label, onCommit, onDown, className }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      aria-label={label}
      data-grid-r={r}
      data-grid-c={c}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        const key = matchKey(e, 'grid');
        if (key === 'cell-cancel') {
          e.stopPropagation();
          setText(value);
          e.currentTarget.blur();
        }
        if (key === 'cell-down') {
          e.preventDefault();
          e.currentTarget.blur();
          onDown?.(e.currentTarget);
        }
      }}
      className={cx('h-7 w-full min-w-0 rounded border border-zinc-200 bg-white px-1 text-xs', className)}
    />
  );
}

/** Enter in a grid cell: the cell below (same column) takes the focus. */
function focusBelow(input) {
  const r = Number(input.getAttribute('data-grid-r'));
  const c = input.getAttribute('data-grid-c');
  const grid = input.closest('[data-grid]');
  grid?.querySelector(`[data-grid-r="${r + 1}"][data-grid-c="${c}"]`)?.focus();
}

const CHART_TEXT = [
  ['title', 'Title'],
  ['xAxis', 'X axis title'],
  ['yAxis', 'Y axis title'],
  ['source', 'Source'],
];

/** A chart's Data tab: type, unit, highlight, text fields and the categories × series grid. */
export function ChartData({ block, blockPath, data }) {
  const g = chartGrid(block);
  const edit = (op, label) => data.setBlock(blockPath, (b) => chartEdit(b, op), label);
  const bySeries = highlightsSeries(block);
  const hlOptions = bySeries ? g.series.map((s) => s.name) : g.categories;
  return (
    <div className="space-y-2" data-testid="chart-data">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="mb-0.5 block text-[11px] text-zinc-500">Chart type</span>
          <select
            aria-label="Chart type"
            value={block.chartType}
            onChange={(e) => edit({ kind: 'key', key: 'chartType', value: e.target.value }, 'Chart type')}
            className="h-7 w-full rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
          >
            {CHART_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Unit"
          value={block.unit ?? ''}
          onCommit={(v) => edit({ kind: 'key', key: 'unit', value: v }, 'Chart unit')}
        />
      </div>
      <label className="block min-w-0">
        <span className="mb-0.5 block text-[11px] text-zinc-500">
          Highlight {bySeries ? 'series' : 'category'}
        </span>
        <select
          aria-label="Highlight"
          value={Number.isInteger(block.highlight) ? String(block.highlight) : ''}
          onChange={(e) => edit({ kind: 'key', key: 'highlight', value: e.target.value }, 'Chart highlight')}
          className="h-7 w-full rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
        >
          <option value="">None</option>
          {hlOptions.map((name, i) => (
            <option key={`${name}-${i}`} value={String(i)}>
              {name || `#${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {CHART_TEXT.map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={block.text?.[key] ?? ''}
            onCommit={(v) => edit({ kind: 'text', key, value: v }, `Chart ${label.toLowerCase()}`)}
          />
        ))}
      </div>
      <div className="overflow-x-auto" data-grid="" data-testid="chart-grid">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="w-24 text-left font-normal text-zinc-500">Category</th>
              {g.series.map((s, i) => (
                <th key={`s${i}`} className="min-w-[64px] font-normal">
                  <div className="flex items-center gap-0.5">
                    <TextCell
                      value={s.name}
                      r={-1}
                      c={i}
                      label={`Series ${i + 1} name`}
                      onCommit={(v) => edit({ kind: 'seriesName', series: i, value: v }, 'Series name')}
                    />
                    <button
                      type="button"
                      aria-label={`Remove series ${i + 1}`}
                      title={g.series.length <= 1 ? 'a chart keeps one series' : `Remove ${s.name}`}
                      disabled={g.series.length <= 1}
                      onClick={() => edit({ kind: 'removeSeries', series: i }, 'Remove series')}
                      className="px-0.5 text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-6">
                <button
                  type="button"
                  aria-label="Add series"
                  title="Add a series (a column)"
                  onClick={() => edit({ kind: 'addSeries' }, 'Add series')}
                  className="h-7 w-6 rounded border border-dashed border-zinc-300 text-zinc-500 hover:bg-zinc-50"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {g.categories.map((cat, r) => (
              <tr key={`r${r}`}>
                <td>
                  <TextCell
                    value={cat}
                    r={r}
                    c={-1}
                    label={`Category ${r + 1}`}
                    onCommit={(v) => edit({ kind: 'category', row: r, value: v }, 'Category')}
                    onDown={focusBelow}
                  />
                </td>
                {g.series.map((s, i) => (
                  <td key={`v${i}`}>
                    <NumberCell
                      value={s.values[r]}
                      r={r}
                      c={i}
                      label={`${cat || `Row ${r + 1}`} · ${s.name || `series ${i + 1}`}`}
                      onCommit={(v) => edit({ kind: 'value', row: r, series: i, value: v }, 'Chart value')}
                      onDown={focusBelow}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    aria-label={`Remove row ${r + 1}`}
                    title={g.categories.length <= 1 ? 'a chart keeps one row' : `Remove ${cat}`}
                    disabled={g.categories.length <= 1}
                    onClick={() => edit({ kind: 'removeRow', row: r }, 'Remove row')}
                    className="h-7 w-6 text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SmallButton onClick={() => edit({ kind: 'addRow' }, 'Add row')}>+ Add row</SmallButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- table

const TABLE_MAX = 8;

/**
 * A table's Data tab: title, subtitle, row header, highlight column, column alignment, add / remove row / column,
 * and the selected cell (a click in the mini grid, or the cell being edited on the canvas): its type and text.
 */
export function TableData({ block, blockPath, data, selectedCell, onSelectCell }) {
  const [fileType, setFileType] = useState(null); // an image / logo cell type waiting for its file
  useEffect(() => setFileType(null), [selectedCell?.row, selectedCell?.col]);
  const cols = tableColumns(block);
  const edit = (op, label) => data.setBlock(blockPath, (b) => tableEdit(b, op), label);
  const rows = [
    ...(block.header ? [{ r: -1, cells: block.header }] : []),
    ...block.rows.map((cells, r) => ({ r, cells })),
  ];
  const sel = selectedCell && rows.some((x) => x.r === selectedCell.row) ? selectedCell : null;
  const selCell = sel ? (sel.row < 0 ? block.header?.[sel.col] : block.rows[sel.row]?.[sel.col]) : undefined;
  const headerOf = (c) => cellText(block.header?.[c]) || `Column ${c + 1}`;
  return (
    <div className="space-y-2" data-testid="table-data">
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Title"
          value={block.title ?? ''}
          onCommit={(v) => edit({ kind: 'key', key: 'title', value: v }, 'Table title')}
        />
        <Field
          label="Subtitle"
          value={block.subtitle ?? ''}
          onCommit={(v) => edit({ kind: 'key', key: 'subtitle', value: v }, 'Table subtitle')}
        />
      </div>
      <Row label="Row header">
        <Toggle
          label="Row header"
          checked={block.rowHeader === true}
          onChange={(on) => edit({ kind: 'key', key: 'rowHeader', value: on }, 'Row header')}
        />
      </Row>
      <Row label="Highlight">
        <select
          aria-label="Highlight column"
          value={Number.isInteger(block.highlightColumn) ? String(block.highlightColumn) : ''}
          onChange={(e) =>
            edit({ kind: 'key', key: 'highlightColumn', value: e.target.value }, 'Highlight column')
          }
          className="h-7 min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
        >
          <option value="">None</option>
          {Array.from({ length: cols }, (_, c) => (
            <option key={c} value={String(c)}>
              {headerOf(c)}
            </option>
          ))}
        </select>
      </Row>
      <div className="overflow-x-auto" data-testid="table-grid">
        <table className="w-full border-separate border-spacing-0.5 text-[11px]">
          <tbody>
            <tr>
              {Array.from({ length: cols }, (_, c) => (
                <td key={`a${c}`}>
                  <select
                    aria-label={`Align ${headerOf(c)}`}
                    value={block.align?.[c] ?? 'left'}
                    onChange={(e) =>
                      edit({ kind: 'align', col: c, value: e.target.value }, 'Column alignment')
                    }
                    className="h-6 w-full rounded border border-zinc-200 bg-white text-[11px]"
                  >
                    <option value="left">left</option>
                    <option value="center">centre</option>
                    <option value="right">right</option>
                  </select>
                </td>
              ))}
            </tr>
            {rows.map(({ r, cells }) => (
              <tr key={`r${r}`}>
                {Array.from({ length: cols }, (_, c) => {
                  const on = sel && sel.row === r && sel.col === c;
                  return (
                    <td key={`c${c}`}>
                      <button
                        type="button"
                        data-testid="table-cell-pick"
                        data-row={r}
                        data-col={c}
                        aria-pressed={Boolean(on)}
                        title={`${r < 0 ? 'Header' : `Row ${r + 1}`}, ${headerOf(c)}: ${cellType(cells[c])}`}
                        onClick={() => onSelectCell({ row: r, col: c })}
                        className={cx(
                          'h-6 w-full truncate rounded border px-1 text-left',
                          r < 0 ? 'font-semibold' : '',
                          on ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 bg-white hover:bg-zinc-50',
                        )}
                      >
                        {cellText(cells[c]) || '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1">
        <SmallButton
          disabled={block.rows.length >= TABLE_MAX}
          title={block.rows.length >= TABLE_MAX ? `a table draws up to ${TABLE_MAX} rows` : ''}
          onClick={() =>
            edit({ kind: 'addRow', at: sel && sel.row >= 0 ? sel.row + 1 : undefined }, 'Add row')
          }
        >
          + Row
        </SmallButton>
        <SmallButton
          disabled={cols >= TABLE_MAX}
          title={cols >= TABLE_MAX ? `a table draws up to ${TABLE_MAX} columns` : ''}
          onClick={() => edit({ kind: 'addColumn', at: sel ? sel.col + 1 : undefined }, 'Add column')}
        >
          + Column
        </SmallButton>
        <SmallButton
          disabled={!sel || sel.row < 0 || block.rows.length <= 1}
          title={
            !sel || sel.row < 0 ? 'select a body cell' : block.rows.length <= 1 ? 'a table keeps one row' : ''
          }
          onClick={() => {
            edit({ kind: 'removeRow', row: sel.row }, 'Remove row');
            onSelectCell(null);
          }}
        >
          − Row
        </SmallButton>
        <SmallButton
          disabled={!sel || cols <= 1}
          title={!sel ? 'select a cell' : cols <= 1 ? 'a table keeps one column' : ''}
          onClick={() => {
            edit({ kind: 'removeColumn', col: sel.col }, 'Remove column');
            onSelectCell(null);
          }}
        >
          − Column
        </SmallButton>
      </div>
      {sel ? (
        <div className="space-y-1.5 rounded-md bg-zinc-50 p-2" data-testid="table-cell-editor">
          <div className="text-[11px] text-zinc-500">
            {sel.row < 0 ? 'Header' : `Row ${sel.row + 1}`} · {headerOf(sel.col)}
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-zinc-500">Cell type</span>
            <select
              aria-label="Cell type"
              value={fileType ?? cellType(selCell)}
              onChange={(e) => {
                const t = e.target.value;
                // an image / logo cell needs its file first (the picker below); the others convert at once
                if (t === 'image' || t === 'logo') setFileType(t === cellType(selCell) ? null : t);
                else {
                  setFileType(null);
                  data.cellType(blockPath, sel.row, sel.col, t);
                }
              }}
              className="h-7 w-full rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
            >
              {CELL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {fileType ? (
            <div className="flex items-center justify-between gap-2" data-testid="table-cell-file">
              <span className="text-[11px] text-zinc-500">An {fileType} cell shows a file</span>
              <FilePick
                label="Choose file…"
                testId="table-cell-file-input"
                onFile={(f) => {
                  setFileType(null);
                  data.cellType(blockPath, sel.row, sel.col, fileType, f);
                }}
              />
            </div>
          ) : null}
          <Field
            label={['image', 'logo'].includes(cellType(selCell)) ? 'Alt text' : 'Text'}
            testId="table-cell-text"
            value={cellText(selCell)}
            onCommit={(v) => edit({ kind: 'cellText', row: sel.row, col: sel.col, value: v }, 'Edit cell')}
          />
        </div>
      ) : (
        <p className="text-[11px] text-zinc-400">
          Pick a cell to set its type; double-click a cell on the slide to type.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- flow node

const TRENDS = ['', 'up', 'down', 'flat'];

/** A flow node: its fields, add before / after, remove, move up / down (within the block's node range). */
export function NodeSection({ info, data }) {
  const fields = NODE_FIELDS[info.type] ?? [];
  const node = info.node ?? {};
  const set = (key, value, label) => data.setField(`${info.nodePath}/${key}`, value, label);
  const button = (action, label, onClick, aria) => {
    const why = nodeLimit(info, action);
    return (
      <SmallButton aria-label={aria ?? label} disabled={Boolean(why)} title={why ?? ''} onClick={onClick}>
        {label}
      </SmallButton>
    );
  };
  return (
    <div className="space-y-1.5 border-t border-zinc-100 pt-2" data-testid="node-section">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {info.type} node
        </span>
        <span className="text-xs tabular-nums text-zinc-500" data-testid="node-position">
          {info.k + 1} of {info.count} · {info.min}–{info.max}
        </span>
      </div>
      {fields.map(([key, kind]) => {
        if (kind === 'trend')
          return (
            <label key={key} className="block">
              <span className="mb-0.5 block text-[11px] text-zinc-500">Trend</span>
              <select
                aria-label="Trend"
                value={node.trend ?? ''}
                onChange={(e) => set('trend', e.target.value || undefined, 'Trend')}
                className="h-7 w-full rounded-md border border-zinc-300 bg-white px-1.5 text-xs"
              >
                {TRENDS.map((t) => (
                  <option key={t} value={t}>
                    {t || 'none'}
                  </option>
                ))}
              </select>
            </label>
          );
        if (kind === 'lines' && node[key] === undefined && key !== 'lines') return null;
        return (
          <Field
            key={key}
            label={key}
            required={(NODE_REQUIRED[info.type] ?? []).includes(key)}
            multiline={kind === 'lines'}
            value={kind === 'lines' ? (node[key] ?? []) : (node[key] ?? '')}
            onCommit={(v) =>
              set(
                key,
                kind === 'lines' ? (v.length ? v : undefined) : v === '' ? undefined : v,
                `Edit ${key}`,
              )
            }
          />
        );
      })}
      <div className="flex flex-wrap gap-1 pt-1">
        {button('add', '+ Before', () => data.node('add', info, 'before'), 'Add a node before')}
        {button('add', '+ After', () => data.node('add', info, 'after'), 'Add a node after')}
        {button('remove', 'Remove', () => data.node('remove', info), 'Remove the node')}
        {button('up', '↑', () => data.node('move', info, info.k - 1), 'Move the node up')}
        {button('down', '↓', () => data.node('move', info, info.k + 1), 'Move the node down')}
      </div>
    </div>
  );
}
