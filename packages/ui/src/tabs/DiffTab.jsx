import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { normaliseDiff } from '../lib/diff.js';
import { hrefFor } from '../router.js';

const show = (v) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

/** Diff tab: this build's deck vs the golden snapshot (golden/expected/<id>/deck.json), from the server's diff. */
export default function DiffTab({ id, version }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api.diff(id).then((r) => live && setState({ loading: false, ...r }));
    return () => {
      live = false;
    };
  }, [id, version]);

  if (state.loading) return <p className="text-sm text-neutral-500">Loading diff…</p>;
  if (state.error) {
    return (
      <p className="text-sm text-neutral-500">
        No diff: {state.error}
        {state.status === 501 ? ' (the CLI diff module is not available yet)' : ''}
      </p>
    );
  }
  const d = normaliseDiff(state.data);
  return (
    <div className="space-y-3 text-xs">
      <p className="text-neutral-600">
        golden/expected/{id}/deck.json → out/{id}/deck.json:{' '}
        {d.identical ? (
          <span className="font-medium text-emerald-700" data-testid="diff-identical">
            identical
          </span>
        ) : (
          <span className="tabular-nums">
            {d.slides.length} slide(s) changed{d.deck.length ? `, ${d.deck.length} deck-level change(s)` : ''}
          </span>
        )}
      </p>
      {d.deck.length ? (
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3">Deck key</th>
              <th className="py-1.5 pr-3">Before</th>
              <th className="py-1.5 pr-3">After</th>
            </tr>
          </thead>
          <tbody>
            {d.deck.map((c, i) => (
              <tr key={`${c.key}-${i}`} className="border-b border-neutral-200 align-top">
                <td className="py-1 pr-3 font-mono">{c.key}</td>
                <td className="max-w-md truncate py-1 pr-3 font-mono text-neutral-500">
                  {'value' in c ? show(c.value) : show(c.from)}
                </td>
                <td className="max-w-md truncate py-1 pr-3 font-mono">{'value' in c ? '' : show(c.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {d.slides.length ? (
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3">Slide</th>
              <th className="py-1.5 pr-3">Added</th>
              <th className="py-1.5 pr-3">Removed</th>
              <th className="py-1.5 pr-3">Changed elements (keys)</th>
            </tr>
          </thead>
          <tbody>
            {d.slides.map((s) => (
              <tr key={s.key} className="border-b border-neutral-200 align-top" data-testid="diff-slide">
                <td className="py-1 pr-3 font-mono">
                  {s.index ? (
                    <a
                      className="text-indigo-700 hover:underline"
                      href={hrefFor({ id, tab: 'slides', slide: s.index })}
                    >
                      {s.key}
                    </a>
                  ) : (
                    s.key
                  )}
                  {s.status ? <span className="text-neutral-400"> {s.status}</span> : null}
                  {s.slideKeys.length ? (
                    <div className="text-neutral-500">{s.slideKeys.join(', ')}</div>
                  ) : null}
                </td>
                <td className="py-1 pr-3 font-mono text-emerald-700">{s.added.join(', ') || '—'}</td>
                <td className="py-1 pr-3 font-mono text-red-700">{s.removed.join(', ') || '—'}</td>
                <td className="py-1 pr-3">
                  {s.changed.length
                    ? s.changed.map((c) => (
                        <div key={c.id}>
                          <span className="font-mono">{c.id}</span>
                          {c.keys.length ? (
                            <span className="text-neutral-500"> ({c.keys.join(', ')})</span>
                          ) : null}
                        </div>
                      ))
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <details>
        <summary className="cursor-pointer text-neutral-500">raw diff JSON</summary>
        <pre className="mt-1 max-h-[60vh] overflow-auto rounded border border-neutral-200 bg-neutral-50 p-2 text-[11px]">
          {JSON.stringify(state.data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
