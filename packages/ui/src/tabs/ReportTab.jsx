import { fmtNum } from '../lib/format.js';
import { hrefFor } from '../router.js';

function KeyValues({ title, obj }) {
  const entries = Object.entries(obj ?? {});
  if (!entries.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-right font-mono tabular-nums text-neutral-900">{fmtNum(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Report tab: the build report as the CLI wrote it (counts, ms, warnings, per-slide table). `slideHref(n)` links a
 * slide (default: the review console's slide page; the Studio passes its own).
 */
export default function ReportTab({ id, report, slideHref }) {
  const linkFor = slideHref ?? ((n) => hrefFor({ id, tab: 'slides', slide: n }));
  if (!report) return <p className="text-sm text-neutral-500">Not built: no report.json for this brand.</p>;
  const warnings = report.warnings ?? [];
  const slides = report.slides ?? [];
  return (
    <div className="space-y-5 text-xs">
      <div className="flex flex-wrap gap-10">
        <KeyValues title="Counts" obj={report.counts} />
        <KeyValues title="ms" obj={report.ms} />
        <div className="text-neutral-600">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Build</h3>
          <div>
            deck <span className="font-mono">{report.deckId}</span>
          </div>
          <div>
            content <span className="font-mono">{report.content ?? '—'}</span>
          </div>
          <div>
            engine <span className="font-mono">{report.engineVersion}</span>
          </div>
        </div>
      </div>
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Warnings <span className="tabular-nums">({warnings.length})</span>
        </h3>
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5 pr-3">Pointer / check</th>
              <th className="py-1.5 pr-3">Slide</th>
              <th className="py-1.5 pr-3">Message</th>
            </tr>
          </thead>
          <tbody>
            {warnings.map((w, i) => (
              <tr key={i} className="border-b border-neutral-200 align-top" data-testid="report-warning">
                <td className="py-1 pr-3 text-neutral-600">
                  {w.source ?? '—'}
                  {w.severity ? <span className="text-neutral-400"> · {w.severity}</span> : null}
                </td>
                <td className="py-1 pr-3 font-mono text-neutral-700">
                  {w.pointer ?? w.check ?? '—'}
                  {w.rule ? <span className="text-neutral-400"> ({w.rule})</span> : null}
                </td>
                <td className="py-1 pr-3 font-mono text-neutral-500">{w.slide ?? '—'}</td>
                <td className="py-1 pr-3 text-neutral-800">{w.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Slides <span className="tabular-nums">({slides.length})</span>
        </h3>
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3 text-right">#</th>
              <th className="py-1.5 pr-3">Id</th>
              <th className="py-1.5 pr-3">Kind</th>
              <th className="py-1.5 pr-3">Layout</th>
              <th className="py-1.5 pr-3">Surface</th>
              <th className="py-1.5 pr-3 text-right">Overflow</th>
              <th className="py-1.5 pr-3 text-right">Warnings</th>
              <th className="py-1.5 pr-3">Sizes (role requested → applied)</th>
            </tr>
          </thead>
          <tbody>
            {slides.map((s) => (
              <tr
                key={s.id ?? s.index}
                className="border-b border-neutral-200 align-top"
                data-testid="report-slide"
              >
                <td className="py-1 pr-3 text-right tabular-nums">
                  <a className="text-indigo-700 hover:underline" href={linkFor(s.index)}>
                    {s.index}
                  </a>
                </td>
                <td className="py-1 pr-3 font-mono">{s.id}</td>
                <td className="py-1 pr-3">{s.kind}</td>
                <td className="py-1 pr-3 text-neutral-600">{s.layoutId}</td>
                <td className="py-1 pr-3 text-neutral-600">{s.surfaceId}</td>
                <td className={`py-1 pr-3 text-right tabular-nums ${s.overflow ? 'text-red-700' : ''}`}>
                  {fmtNum(s.overflow)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(s.warnings)}</td>
                <td className="py-1 pr-3 font-mono text-[11px] text-neutral-600">
                  {(s.sizes ?? []).map((z) => (
                    <span key={z.element} className="mr-2 inline-block">
                      {z.role} {fmtNum(z.requested)}
                      {z.applied !== z.requested ? (
                        <span className="text-indigo-700"> → {fmtNum(z.applied)}</span>
                      ) : null}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
