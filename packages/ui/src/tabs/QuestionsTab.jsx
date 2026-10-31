import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Pill from '../components/Pill.jsx';

/** An answer as typed: JSON when it parses (numbers, booleans, objects), else the string. */
export function parseAnswer(text) {
  const t = String(text).trim();
  if (t === '') return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return String(text);
  }
}

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

export default function QuestionsTab({ id, questions, onRebuild, building, canBuild }) {
  const [answers, setAnswers] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .answers(id)
      .then((a) => live && setAnswers(a ?? {}))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [id]);

  if (!questions)
    return <p className="text-sm text-neutral-500">No questions.json for this brand (not built).</p>;
  if (!questions.length) return <p className="text-sm text-neutral-500">The build asked no questions.</p>;

  const save = async (pointers) => {
    const body = {};
    for (const p of pointers) {
      const v = parseAnswer(draft[p] ?? '');
      if (v !== undefined) body[p] = v;
    }
    if (!Object.keys(body).length) return;
    setError(null);
    try {
      setAnswers(await api.saveAnswers(id, body));
      setDraft((d) => {
        const next = { ...d };
        for (const p of Object.keys(body)) delete next[p];
        return next;
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const pending = questions.filter((q) => (draft[q.pointer] ?? '').trim() !== '').map((q) => q.pointer);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <span className="tabular-nums">
          {questions.length} question(s), {questions.filter((q) => q.severity === 'blocking').length} blocking
        </span>
        <span className="text-neutral-400">
          answers go to golden/brands/{id}/answers.json (JSON pointer → value)
        </span>
        <span className="ml-auto flex gap-2">
          <Button disabled={!pending.length} onClick={() => save(pending)}>
            Save all ({pending.length})
          </Button>
          <Button kind={saved ? 'primary' : 'default'} disabled={building || !canBuild} onClick={onRebuild}>
            {building ? 'Building…' : 'Rebuild'}
          </Button>
        </span>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <table className="w-full border-collapse text-left text-xs">
        <thead className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1.5 pr-3">Severity</th>
            <th className="py-1.5 pr-3">Pointer</th>
            <th className="py-1.5 pr-3">Question</th>
            <th className="py-1.5 pr-3">Needed by</th>
            <th className="w-[28%] py-1.5 pr-3">Answer</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const has = answers && Object.prototype.hasOwnProperty.call(answers, q.pointer);
            return (
              <tr
                key={q.id ?? q.pointer}
                className="border-b border-neutral-200 align-top"
                data-testid="question-row"
              >
                <td className="py-1.5 pr-3">
                  <Pill status={q.severity === 'blocking' ? 'fail' : 'skip'}>{q.severity}</Pill>
                </td>
                <td className="py-1.5 pr-3 font-mono text-neutral-700">{q.pointer}</td>
                <td className="py-1.5 pr-3 text-neutral-800">{q.question}</td>
                <td className="py-1.5 pr-3 font-mono text-neutral-500">{(q.neededBy ?? []).join(', ')}</td>
                <td className="py-1.5 pr-3">
                  {has ? (
                    <div className="mb-1 flex items-center gap-1">
                      <Pill status="pass">answered</Pill>
                      <span className="truncate font-mono text-neutral-600">{show(answers[q.pointer])}</span>
                    </div>
                  ) : null}
                  <div className="flex gap-1">
                    <input
                      aria-label={`Answer ${q.pointer}`}
                      value={draft[q.pointer] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [q.pointer]: e.target.value }))}
                      placeholder={has ? 'change answer' : 'value (JSON or text)'}
                      className="h-7 min-w-0 flex-1 rounded border border-neutral-300 px-1.5 font-mono"
                    />
                    <Button disabled={!(draft[q.pointer] ?? '').trim()} onClick={() => save([q.pointer])}>
                      Save
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
