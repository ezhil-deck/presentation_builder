import { Fragment, useMemo, useState } from 'react';
import { hrefFor } from '../router.js';
import Pill from './Pill.jsx';

const STATUSES = ['fail', 'warn', 'pass', 'skip'];

/** The summary line of a Report v1. */
export function ChecksSummary({ summary }) {
  if (!summary) return null;
  const items = summary.items ?? {};
  return (
    <p className="text-xs text-neutral-600" data-testid="checks-summary">
      <span className="tabular-nums">{summary.checks}</span> checks:{' '}
      <span className="tabular-nums text-red-700">{summary.fail} fail</span>,{' '}
      <span className="tabular-nums text-amber-700">{summary.warn} warn</span>,{' '}
      <span className="tabular-nums text-emerald-700">{summary.pass} pass</span>,{' '}
      <span className="tabular-nums text-neutral-500">{summary.skip} skip</span>
      <span className="text-neutral-400"> · items </span>
      <span className="tabular-nums">
        {items.fail ?? 0} fail / {items.warn ?? 0} warn / {items.info ?? 0} info
      </span>
    </p>
  );
}

/**
 * The report's results: one row per check (status, id, title, signal, count), expandable to its items; filters
 * by status and by check. An item with a slide links to it.
 */
export default function ChecksTable({ id, checks }) {
  const [status, setStatus] = useState('all');
  const [check, setCheck] = useState('all');
  const [open, setOpen] = useState(() => new Set());
  const results = useMemo(() => checks?.results ?? [], [checks]);
  const shown = results.filter(
    (r) => (status === 'all' || r.status === status) && (check === 'all' || r.id === check),
  );
  const toggle = (rid) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs text-neutral-600">
        <label className="inline-flex items-center gap-1">
          Status
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-7 rounded border border-neutral-300 bg-white px-1"
          >
            <option value="all">all</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s} ({results.filter((r) => r.status === s).length})
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1">
          Check
          <select
            aria-label="Check filter"
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            className="h-7 rounded border border-neutral-300 bg-white px-1"
          >
            <option value="all">all</option>
            {results.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums text-neutral-400">
          {shown.length} of {results.length}
        </span>
      </div>
      <table className="w-full border-collapse text-left text-xs">
        <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-6 py-1.5" />
            <th className="py-1.5 pr-3">Status</th>
            <th className="py-1.5 pr-3">Check</th>
            <th className="py-1.5 pr-3">Title</th>
            <th className="py-1.5 pr-3">Signal</th>
            <th className="py-1.5 pr-3 text-right">Count</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const expanded = open.has(r.id);
            const n = r.items?.length ?? 0;
            return (
              <Fragment key={r.id}>
                <tr
                  data-testid="check-row"
                  className="cursor-pointer border-b border-neutral-200 hover:bg-neutral-50"
                  onClick={() => n && toggle(r.id)}
                >
                  <td className="py-1.5 text-neutral-400">{n ? (expanded ? '▾' : '▸') : ''}</td>
                  <td className="py-1.5 pr-3">
                    <Pill status={r.status} />
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-neutral-900">{r.id}</td>
                  <td className="py-1.5 pr-3 text-neutral-700">
                    {r.title}
                    {r.reason ? <span className="text-neutral-400"> — {r.reason}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-neutral-500">{r.signal ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.count ?? n}</td>
                </tr>
                {expanded
                  ? r.items.map((it, i) => (
                      <tr
                        key={`${r.id}-${i}`}
                        data-testid="check-item"
                        className="border-b border-neutral-100 bg-neutral-50/60"
                      >
                        <td />
                        <td className="py-1 pr-3">
                          <Pill status={it.severity} />
                        </td>
                        <td className="py-1 pr-3 font-mono text-neutral-500">
                          {it.index ? (
                            <a
                              className="text-indigo-700 hover:underline"
                              href={hrefFor({ id, tab: 'slides', slide: it.index })}
                            >
                              slide {it.index}
                            </a>
                          ) : (
                            (it.slide ?? '—')
                          )}
                        </td>
                        <td className="py-1 pr-3 text-neutral-700" colSpan={2}>
                          {it.message}
                          {it.elementId ? (
                            <span className="ml-1 font-mono text-neutral-400">{it.elementId}</span>
                          ) : null}
                          {it.fix ? (
                            <span className="ml-1 font-mono text-neutral-400">fix: {it.fix.command}</span>
                          ) : null}
                        </td>
                        <td />
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
