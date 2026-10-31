/** Short local date + time for ISO strings ("—" when absent). */
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v !== 'number') return String(v);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** Two-digit slide file number (01.png). */
export const pngName = (n) => `${String(n).padStart(2, '0')}.png`;

export function cx(...names) {
  return names.filter(Boolean).join(' ');
}
