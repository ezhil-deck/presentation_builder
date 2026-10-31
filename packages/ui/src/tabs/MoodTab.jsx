import { outFile } from '../api.js';
import { fmtNum } from '../lib/format.js';

const SWATCH_KEYS = ['bg', 'text', 'heading', 'textMuted', 'accent', 'card', 'cardText', 'border'];

function Swatch({ color, label }) {
  if (typeof color !== 'string') return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span
        className="h-4 w-4 shrink-0 rounded-sm ring-1 ring-inset ring-black/10"
        style={{ background: color }}
      />
      <span className="text-neutral-500">{label}</span>
      <span className="font-mono text-neutral-800">{color}</span>
    </div>
  );
}

function Surface({ s }) {
  return (
    <div className="rounded border border-neutral-200 bg-white" data-testid="surface">
      <div className="flex h-16 flex-col justify-center rounded-t px-3" style={{ background: s.bg }}>
        <span style={{ color: s.heading, fontWeight: 600 }}>{s.id}</span>
        <span style={{ color: s.text }} className="text-xs">
          text <span style={{ color: s.textMuted }}>muted</span>{' '}
          <span style={{ color: s.accent }}>accent</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2">
        {SWATCH_KEYS.map((k) => (
          <Swatch key={k} label={k} color={s[k]} />
        ))}
      </div>
      <div className="border-t border-neutral-100 px-2 py-1 text-[11px] text-neutral-500">
        {s.role ?? '—'} · {s.tone ?? '—'}
        {s.contrast ? (
          <span className="tabular-nums">
            {' '}
            · contrast text {fmtNum(s.contrast.text)} / heading {fmtNum(s.contrast.heading)} / accent{' '}
            {fmtNum(s.contrast.accent)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function MoodTab({ id, mood }) {
  if (!mood) return <p className="text-sm text-neutral-500">No mood.json for this brand (not built).</p>;
  const surfaces = mood.palette?.surfaces ?? [];
  const brand = mood.palette?.brand ?? {};
  const roles = Object.entries(mood.type?.roles ?? {});
  const faces = mood.type?.faces ?? {};
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Palette</h3>
        <div className="mb-3 flex flex-wrap gap-4">
          {Object.entries(brand).map(([k, v]) => (
            <Swatch key={k} label={k} color={v} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {surfaces.map((s) => (
            <Surface key={s.id} s={s} />
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Type roles</h3>
        <table className="w-full border-collapse text-left text-xs">
          <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5 pr-3">Role</th>
              <th className="py-1.5 pr-3">Face</th>
              <th className="py-1.5 pr-3 text-right">Size</th>
              <th className="py-1.5 pr-3 text-right">Weight</th>
              <th className="py-1.5 pr-3 text-right">Line height</th>
              <th className="py-1.5 pr-3 text-right">Letter sp.</th>
              <th className="py-1.5 pr-3 text-right">Fit min</th>
              <th className="py-1.5 pr-3">Colour</th>
              <th className="py-1.5 pr-3">Case</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(([name, r]) => (
              <tr key={name} className="border-b border-neutral-200" data-testid="type-role">
                <td className="py-1 pr-3 font-mono text-neutral-900">{name}</td>
                <td className="py-1 pr-3 text-neutral-700">
                  {faces[r.face]?.family ?? r.face ?? '—'}
                  {r.face ? <span className="text-neutral-400"> ({r.face})</span> : null}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(r.size)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(r.weight)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(r.lineHeight)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(r.letterSpacing)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(r.fit?.min)}</td>
                <td className="py-1 pr-3 font-mono text-neutral-600">{r.color ?? '—'}</td>
                <td className="py-1 pr-3 text-neutral-600">{r.case ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          mood.html{' '}
          <a
            className="font-normal normal-case text-indigo-700 hover:underline"
            href={outFile(id, 'mood.html')}
          >
            open
          </a>
        </h3>
        <iframe
          title="mood.html"
          src={outFile(id, 'mood.html')}
          className="h-[80vh] w-full rounded border border-neutral-300 bg-white"
        />
      </section>
    </div>
  );
}
