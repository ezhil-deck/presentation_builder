// "Save as a copy" (docs/P4-spec.md §1, P4.2): the showcase and the sample decks are Markdown imports and never edited
// in place; the first edit on one asks for a name, the deck is saved as content/<name>.content.json (with its overrides
// and command log) and the Studio continues on the copy, where the edit is made.
import { useEffect, useRef, useState } from 'react';

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `from` = the read-only deck's title; `onSave(name)` (may throw: the message is shown); `onCancel()`. */
export default function CopyDialog({ from, defaultName, onSave, onCancel }) {
  const [name, setName] = useState(defaultName ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const valid = NAME.test(name);
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/20 pt-24">
      <form
        role="dialog"
        aria-label="Save as a copy"
        data-testid="copy-dialog"
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        className="w-[420px] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-900/15"
      >
        <h2 className="text-[14px] font-semibold text-zinc-900">Save as a copy</h2>
        <p className="mt-1 text-[13px] leading-snug text-zinc-600">
          “{from}” is a Markdown deck and is not edited in place. Save a copy under content/ and the edit is
          made there.
        </p>
        <label className="mt-3 block text-[12px] text-zinc-500" htmlFor="copy-name">
          Name (lower-case letters, digits, hyphens)
        </label>
        <input
          id="copy-name"
          ref={ref}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!valid}
          className="mt-1 h-8 w-full rounded-md border border-zinc-300 px-2 font-mono text-[13px]"
        />
        <p className="mt-1 text-[11px] text-zinc-400">content/{valid ? name : '…'}.content.json</p>
        {error ? (
          <p role="alert" className="mt-2 text-[12px] text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-[13px] text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="h-8 rounded-md bg-blue-600 px-3 text-[13px] text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saving ? 'Saving…' : 'Save copy'}
          </button>
        </div>
      </form>
    </div>
  );
}
