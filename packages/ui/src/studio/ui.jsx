// Small chrome primitives of the Studio: a neutral zinc ramp, one blue for UI state, 13 px type, 8 px grid. Icons only
// where universal (chevrons, close, more).
import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/format.js';

const PATHS = {
  down: 'M4 6l4 4 4-4',
  left: 'M10 4L6 8l4 4',
  right: 'M6 4l4 4-4 4',
  close: 'M4 4l8 8M12 4l-8 8',
};

export function Icon({ name, className }) {
  if (name === 'more') {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={className}>
        <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
        <circle cx="8" cy="8" r="1.25" fill="currentColor" />
        <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={className}>
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A quiet toolbar button (zinc), `active` = the blue state. */
export function ToolButton({ active, className, children, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] leading-none disabled:cursor-not-allowed disabled:text-zinc-400',
        active ? 'bg-blue-50 text-blue-700' : 'text-zinc-700 hover:bg-zinc-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A trigger + a floating panel; closes on an outside click or Escape. `children(close)` renders the panel. */
export function Popover({ trigger, children, align = 'left', panelClass, label, onOpen, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      <ToolButton
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        active={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {trigger}
      </ToolButton>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className={cx(
            'absolute top-full z-40 mt-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-900/10',
            align === 'right' ? 'right-0' : 'left-0',
            panelClass,
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ children, hint, className, ...props }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400',
        className,
      )}
      {...props}
    >
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-zinc-400">{hint}</span> : null}
    </button>
  );
}

export const MenuSeparator = () => <div className="my-1 h-px bg-zinc-200" />;

/** An on / off switch (blue when on). */
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-blue-600' : 'bg-zinc-300',
      )}
    >
      <span
        className={cx(
          'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** The brand's logo on a neutral chip (its main logo file), else the brand's initial. */
export function LogoChip({ brand, size = 'sm' }) {
  const h = size === 'lg' ? 'h-10 px-2.5' : 'h-6 px-1.5';
  const img = size === 'lg' ? 'max-h-6 max-w-[120px]' : 'max-h-3.5 max-w-[56px]';
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded bg-zinc-100 ring-1 ring-inset ring-zinc-200',
        h,
      )}
    >
      {brand?.logo ? (
        <img src={brand.logo} alt="" className={cx('block object-contain', img)} />
      ) : (
        <span className="text-[11px] font-semibold uppercase text-zinc-500">
          {(brand?.name ?? brand?.id ?? '?').slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** The brand's colour dots (primary, secondary, accent). */
export function ColourDots({ colours, size = 10 }) {
  return (
    <span className="inline-flex items-center gap-1">
      {(colours ?? []).map((c, i) => (
        <span
          key={`${c}-${i}`}
          title={c}
          className="inline-block rounded-full ring-1 ring-inset ring-black/10"
          style={{ background: c, width: size, height: size }}
        />
      ))}
    </span>
  );
}

/** A panel group header (small caps label, optional right side). */
export function GroupHeader({ children, right }) {
  return (
    <div className="flex h-8 items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h3>
      {right}
    </div>
  );
}

/** A label + control row of the panel. */
export function Row({ label, children }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="w-16 shrink-0 text-zinc-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}
