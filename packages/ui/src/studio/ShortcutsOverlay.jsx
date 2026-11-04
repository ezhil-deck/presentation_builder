// The Shortcuts overlay (docs/P4-spec.md §2, P4.4; `?`): every entry of the keyboard map (keys.js), grouped by scope,
// generated from the map so it can never drift from what the handlers do. Esc, a click outside the card or the close
// button closes it.
import { useEffect } from 'react';
import { SCOPES, SHORTCUTS, formatKeys } from './keys.js';
import { Icon } from './ui.jsx';

export default function ShortcutsOverlay({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/30 p-8"
      data-testid="shortcuts-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        data-testid="shortcuts-overlay"
        className="max-h-full w-full max-w-3xl overflow-auto rounded-lg border border-zinc-200 bg-white p-5 text-[13px] text-zinc-900 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          ⌘ is Cmd on a Mac, Ctrl elsewhere. Keys of the Studio, edit mode and the filmstrip do nothing while
          you type in a field.
        </p>
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {SCOPES.map((scope) => (
            <section key={scope.id} data-testid="shortcuts-scope" data-scope={scope.id}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {scope.label}
              </h3>
              <table className="w-full border-collapse">
                <tbody>
                  {SHORTCUTS.filter((e) => e.scope === scope.id).map((e, i) => (
                    <tr
                      key={`${e.action}-${i}`}
                      data-testid="shortcut-row"
                      data-action={e.action}
                      className="border-t border-zinc-100 align-top"
                    >
                      <td className="whitespace-nowrap py-1 pr-3">
                        <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 font-sans text-[12px] text-zinc-800">
                          {formatKeys(e)}
                        </kbd>
                      </td>
                      <td className="py-1 text-zinc-700">{e.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
