import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Pill from '../components/Pill.jsx';
import { cx, fmtDate } from '../lib/format.js';
import { useBuild } from '../lib/useBuild.js';
import { TABS, hrefFor } from '../router.js';
import ChecksTab from '../tabs/ChecksTab.jsx';
import DiffTab from '../tabs/DiffTab.jsx';
import MoodTab from '../tabs/MoodTab.jsx';
import QuestionsTab from '../tabs/QuestionsTab.jsx';
import ReportTab from '../tabs/ReportTab.jsx';
import SlidesTab from '../tabs/SlidesTab.jsx';
import SignOff from './SignOff.jsx';

const LABEL = {
  slides: 'Slides',
  checks: 'Checks',
  questions: 'Questions',
  mood: 'Mood',
  diff: 'Diff',
  report: 'Report',
};

async function loadBrand(id) {
  const [entry, deck, report, questions, mood, review] = await Promise.all([
    api.brand(id),
    api.file(id, 'deck'),
    api.file(id, 'report'),
    api.file(id, 'questions'),
    api.file(id, 'mood'),
    api.file(id, 'review'),
  ]);
  return { entry, deck, report, questions, mood, review };
}

function BuildStatus({ state, error }) {
  const [open, setOpen] = useState(false);
  if (!state.running && state.exitCode == null && !error) return null;
  return (
    <div className="text-xs">
      <button type="button" className="text-neutral-600 hover:underline" onClick={() => setOpen(!open)}>
        {state.running ? 'building…' : `last build: exit ${state.exitCode}`} {open ? '▾' : '▸'} log
      </button>
      {error ? <span className="ml-2 text-red-700">{error}</span> : null}
      {open ? (
        <pre className="mt-1 max-h-64 overflow-auto rounded border border-neutral-200 bg-neutral-900 p-2 font-mono text-[11px] leading-4 text-neutral-100">
          {state.log.join('\n')}
        </pre>
      ) : null}
    </div>
  );
}

export default function BrandPage({ route }) {
  const { id, tab, slide } = route;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const build = useBuild(id, reload);

  useEffect(() => {
    let live = true;
    loadBrand(id)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [id, version]);

  const entry = data?.entry;
  const engineVersion = data?.report?.engineVersion ?? data?.deck?.engineVersion;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-4">
      <header className="mb-3 space-y-2 border-b border-neutral-200 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href="#/" className="text-xs text-neutral-500 hover:text-neutral-900">
            Brands /
          </a>
          <h1 className="text-base font-semibold text-neutral-900">{entry?.name ?? id}</h1>
          <span className="font-mono text-xs text-neutral-500">{id}</span>
          {engineVersion ? (
            <span className="font-mono text-xs text-neutral-500">engine {engineVersion}</span>
          ) : null}
          <span className="text-xs tabular-nums text-neutral-500">built {fmtDate(entry?.builtAt)}</span>
          {entry && !entry.out ? <Pill status="skip">not built</Pill> : null}
          {entry?.stale ? <Pill status="warn">stale: input changed</Pill> : null}
          {entry?.answersNewer ? <Pill status="warn">answers newer than build</Pill> : null}
          <span className="ml-auto flex gap-1">
            <Button disabled={build.state.running || !entry?.input} onClick={() => build.start(false)}>
              {build.state.running && !build.state.png ? 'Building…' : 'Build'}
            </Button>
            <Button disabled={build.state.running || !entry?.input} onClick={() => build.start(true)}>
              {build.state.running && build.state.png ? 'Building…' : 'Build + PNG'}
            </Button>
          </span>
        </div>
        <BuildStatus state={build.state} error={build.error} />
        <SignOff
          id={id}
          review={data?.review}
          deckHash={entry?.deckHash}
          disabled={!entry?.out}
          onSaved={(review) => setData((d) => ({ ...d, review }))}
        />
      </header>
      <nav className="mb-4 flex gap-1 border-b border-neutral-200 text-xs">
        {TABS.map((t) => (
          <a
            key={t}
            href={hrefFor({ id, tab: t })}
            className={cx(
              '-mb-px border-b-2 px-3 py-1.5 font-medium',
              t === tab
                ? 'border-indigo-600 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800',
            )}
          >
            {LABEL[t]}
          </a>
        ))}
      </nav>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {!data && !error ? <p className="text-xs text-neutral-500">Loading…</p> : null}
      {data ? (
        <main>
          {tab === 'slides' ? (
            <SlidesTab id={id} deck={data.deck} report={data.report} slide={slide} />
          ) : null}
          {tab === 'checks' ? <ChecksTab id={id} report={data.report} /> : null}
          {tab === 'questions' ? (
            <QuestionsTab
              id={id}
              questions={data.questions}
              building={build.state.running}
              canBuild={Boolean(entry?.input)}
              onRebuild={() => build.start(false)}
            />
          ) : null}
          {tab === 'mood' ? <MoodTab id={id} mood={data.mood} /> : null}
          {tab === 'diff' ? <DiffTab id={id} version={version} /> : null}
          {tab === 'report' ? <ReportTab id={id} report={data.report} /> : null}
        </main>
      ) : null}
    </div>
  );
}
