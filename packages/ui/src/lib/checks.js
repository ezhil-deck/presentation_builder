// Reading the build's check report (Report v1, P3-spec §A.1). The UI computes no rule: it only groups and
// locates what the report and the deck already say.

/** True for a Report v1 (`checks.version` 1.x); older builds carry the P2 stub. */
export function isReportV1(checks) {
  return typeof checks?.version === 'string' && checks.version.startsWith('1.');
}

/** Every item of every result, with its check id / title attached. */
export function flattenItems(checks) {
  const out = [];
  for (const r of checks?.results ?? []) {
    for (const item of r.items ?? []) out.push({ ...item, check: r.id, title: r.title });
  }
  return out;
}

/** The items about one slide (`slide` id or 1-based `index`). */
export function itemsForSlide(checks, slide, index) {
  return flattenItems(checks).filter(
    (it) => (it.slide != null && it.slide === slide?.id) || (it.slide == null && it.index === index),
  );
}

/** An element of a slide by id, groups searched (children frames are slide-absolute). */
export function findElement(elements, id) {
  for (const el of elements ?? []) {
    if (el.id === id) return el;
    if (el.children) {
      const hit = findElement(el.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** Overlay boxes for the items of one slide: the frame of the element each item names. */
export function overlayBoxes(slide, items) {
  const boxes = [];
  (items ?? []).forEach((it, i) => {
    if (!it.elementId) return;
    const el = findElement(slide?.elements, it.elementId);
    if (!el?.frame) return;
    boxes.push({
      key: `${it.check}-${it.elementId}-${i}`,
      frame: el.frame,
      severity: it.severity ?? 'info',
      label: it.check,
      elementId: it.elementId,
      message: it.message,
      item: i,
    });
  });
  return boxes;
}

const ORDER = { fail: 0, warn: 1, info: 2, pass: 3, skip: 4 };
export const bySeverity = (a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9);

/** One colour per severity (overlay borders and labels). */
export const SEVERITY_COLOR = { fail: '#dc2626', warn: '#d97706', info: '#0284c7' };

/** Tailwind classes for a status / severity pill. */
export const STATUS_CLASS = {
  fail: 'bg-red-50 text-red-700 ring-red-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  pass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  skip: 'bg-neutral-100 text-neutral-500 ring-neutral-200',
};
