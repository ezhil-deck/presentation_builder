import { cx } from '../lib/format.js';

const KIND = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  default:
    'bg-white text-neutral-800 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400',
  ghost: 'text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-300',
};

export default function Button({ kind = 'default', className, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium disabled:cursor-not-allowed',
        KIND[kind],
        className,
      )}
      {...props}
    />
  );
}
