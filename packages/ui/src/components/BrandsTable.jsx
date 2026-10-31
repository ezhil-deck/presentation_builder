import { fmtDate } from '../lib/format.js';
import { hrefFor } from '../router.js';
import Button from './Button.jsx';
import Pill from './Pill.jsx';

/** The counts line above the table. */
export function brandCounts(brands) {
  return {
    brands: brands.length,
    built: brands.filter((b) => b.out).length,
    stale: brands.filter((b) => b.stale).length,
    signedOff: brands.filter((b) => b.signedOff && !b.reviewStale).length,
    fail: brands.filter((b) => (b.report?.fail ?? 0) > 0).length,
  };
}

const Dash = () => <span className="text-neutral-300">—</span>;

/** One row per brand (P3-spec §C.2.1): build state, stale, slides, overflow, checks, questions, sign-off. */
export default function BrandsTable({ brands, onBuild }) {
  const c = brandCounts(brands);
  return (
    <div>
      <p className="mb-2 text-xs text-neutral-600" data-testid="brand-counts">
        <span className="tabular-nums">{c.brands}</span> brands ·{' '}
        <span className="tabular-nums">{c.built}</span> built ·{' '}
        <span className="tabular-nums">{c.stale}</span> stale · <span className="tabular-nums">{c.fail}</span>{' '}
        with failing checks · <span className="tabular-nums">{c.signedOff}</span> signed off
      </p>
      <table className="w-full border-collapse text-left text-xs">
        <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1.5 pr-3">Brand</th>
            <th className="py-1.5 pr-3">Build</th>
            <th className="py-1.5 pr-3 text-right">Slides</th>
            <th className="py-1.5 pr-3 text-right">Overflow</th>
            <th className="py-1.5 pr-3 text-right">Checks fail</th>
            <th className="py-1.5 pr-3 text-right">Checks warn</th>
            <th className="py-1.5 pr-3 text-right">Blocking Q</th>
            <th className="py-1.5 pr-3">Signed off</th>
            <th className="py-1.5 pr-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <tr
              key={b.id}
              className="border-b border-neutral-200 hover:bg-neutral-50"
              data-testid="brand-row"
            >
              <td className="py-1.5 pr-3">
                <a
                  className="font-medium text-neutral-900 hover:text-indigo-700 hover:underline"
                  href={hrefFor({ id: b.id })}
                >
                  {b.id}
                </a>
                {b.name && b.name !== b.id ? <span className="ml-1 text-neutral-400">{b.name}</span> : null}
              </td>
              <td className="py-1.5 pr-3">
                <span className="flex flex-wrap items-center gap-1">
                  {b.building ? (
                    <Pill status="info">building</Pill>
                  ) : b.out ? (
                    <Pill status="pass">built</Pill>
                  ) : (
                    <Pill status="skip">not built</Pill>
                  )}
                  {b.stale ? <Pill status="warn">stale</Pill> : null}
                  {b.answersNewer ? <Pill status="warn">answers newer</Pill> : null}
                  {!b.input ? <Pill status="skip">no input</Pill> : null}
                  {b.out && !b.report ? (
                    <span className="text-[11px] text-neutral-400" title="report.checks is not Report v1">
                      no checks
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{b.counts?.slides ?? <Dash />}</td>
              <td
                className={`py-1.5 pr-3 text-right tabular-nums ${b.counts?.overflow ? 'text-red-700' : ''}`}
              >
                {b.counts?.overflow ?? <Dash />}
              </td>
              <td
                className={`py-1.5 pr-3 text-right tabular-nums ${b.report?.fail ? 'font-semibold text-red-700' : ''}`}
              >
                {b.report ? b.report.fail : <Dash />}
              </td>
              <td className={`py-1.5 pr-3 text-right tabular-nums ${b.report?.warn ? 'text-amber-700' : ''}`}>
                {b.report ? b.report.warn : <Dash />}
              </td>
              <td
                className={`py-1.5 pr-3 text-right tabular-nums ${b.questions?.blocking ? 'text-red-700' : ''}`}
              >
                {b.out ? (b.questions?.blocking ?? 0) : <Dash />}
              </td>
              <td className="py-1.5 pr-3">
                {b.signedOff ? (
                  <span className="flex items-center gap-1">
                    <Pill status={b.reviewStale ? 'warn' : 'pass'}>
                      {b.reviewStale ? 'deck changed' : 'yes'}
                    </Pill>
                    <span className="tabular-nums text-neutral-500">{fmtDate(b.signedOffDate)}</span>
                  </span>
                ) : (
                  <Dash />
                )}
              </td>
              <td className="py-1.5 pr-3">
                <span className="flex justify-end gap-1">
                  <Button disabled={!b.input || b.building} onClick={() => onBuild?.(b.id, false)}>
                    Build
                  </Button>
                  <Button disabled={!b.input || b.building} onClick={() => onBuild?.(b.id, true)}>
                    Build + PNG
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
