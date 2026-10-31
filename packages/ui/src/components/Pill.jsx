import { STATUS_CLASS } from '../lib/checks.js';
import { cx } from '../lib/format.js';

/** A small status / severity tag. */
export default function Pill({ status, children, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset',
        STATUS_CLASS[status] ?? 'bg-neutral-100 text-neutral-600 ring-neutral-200',
        className,
      )}
    >
      {children ?? status}
    </span>
  );
}
