// A drawer over the canvas (docs/PLAN-studio.md §2): the P3 review pages (questions, report, diff, checks, mood) moved
// out of the way; closable (× or Escape, handled by the Studio).
import { Icon } from './ui.jsx';

export default function Drawer({ title, subtitle, onClose, children }) {
  return (
    <div className="absolute inset-0 z-30 flex justify-end" data-testid="drawer">
      <button
        type="button"
        aria-label="Close drawer"
        className="flex-1 cursor-default bg-zinc-900/10"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-label={title}
        className="flex h-full w-[min(960px,85%)] flex-col border-l border-zinc-200 bg-white shadow-xl shadow-zinc-900/10"
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4">
          <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
          {subtitle ? <span className="truncate text-xs text-zinc-500">{subtitle}</span> : null}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </section>
    </div>
  );
}
