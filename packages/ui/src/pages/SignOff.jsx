import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import { fmtDate } from '../lib/format.js';

/** "Reviewed: good enough to send" + notes, saved to out/<id>/review.json; stale when the deck changed since. */
export default function SignOff({ id, review, deckHash, disabled, onSaved }) {
  const [checked, setChecked] = useState(Boolean(review?.signedOff));
  const [notes, setNotes] = useState(review?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setChecked(Boolean(review?.signedOff));
    setNotes(review?.notes ?? '');
  }, [review]);

  const dirty = checked !== Boolean(review?.signedOff) || notes !== (review?.notes ?? '');
  const stale = Boolean(review?.signedOff && deckHash && review.deckHash !== deckHash);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved?.(await api.saveReview(id, { signedOff: checked, notes }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => setChecked(e.target.checked)}
        />
        Reviewed: good enough to send
      </label>
      <input
        aria-label="Review notes"
        value={notes}
        disabled={disabled}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="notes"
        className="h-7 w-64 rounded border border-neutral-300 px-1.5"
      />
      <Button kind={dirty ? 'primary' : 'default'} disabled={disabled || busy || !dirty} onClick={save}>
        Save sign-off
      </Button>
      {review?.date ? (
        <span className="tabular-nums text-neutral-500">
          {review.signedOff ? 'signed off' : 'saved'} {fmtDate(review.date)}
        </span>
      ) : null}
      {stale ? (
        <span className="rounded bg-amber-50 px-1.5 py-px text-amber-800 ring-1 ring-inset ring-amber-200">
          deck changed since sign-off
        </span>
      ) : null}
      {error ? <span className="text-red-700">{error}</span> : null}
    </div>
  );
}
