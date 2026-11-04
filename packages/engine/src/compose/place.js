/**
 * The recorded placement rule (R-PLACE, was PR-C′; approved 2026-11-03, docs/P2-spec.md §9) for a steps / timeline
 * flow tied to a line: the catalogue layout gives the flow its whole zone (`box.flow.place` {valign, lines}), the fill
 * (R-FILLROOM) runs in that zone, and the flow is placed afterwards - a box of PLACE_SPARE × its content's fitted
 * height at the record's alignment, its connector / line moved with it - so the placement never changes a size.
 */
import { r2 } from '../util/stable.js';

/** The share of the flow's content height the placed box takes (a third to spare). */
export const PLACE_SPARE = 1.35;

/**
 * Bottom of the painted content of `els` (cards behind items left out; text at its fitted height where its valign
 * puts it), or null when nothing is painted.
 */
function paintedBottom(els) {
  const ends = els
    .filter((e) => !/-bg(-border-top)?$/.test(e.id ?? ''))
    .map((e) => {
      if (e.type === 'text' && e.text?.fit) {
        const h = e.text.fit.height;
        const free = Math.max(0, e.frame.h - h);
        const dy = e.text.valign === 'bottom' ? free : e.text.valign === 'middle' ? free / 2 : 0;
        return e.frame.y + dy + h;
      }
      return e.frame.y + e.frame.h;
    });
  return ends.length ? Math.max(...ends) : null;
}

/**
 * Where a flow laid out from the top of its zone `frame` goes (placed after the fill): a box of PLACE_SPARE × its
 * content's height (the chosen roles' fitted need), at most the zone, set at `valign` in the zone; returns the move
 * down (0 for top, for a box the content fills, or a move under half a px).
 */
export function placeOffset(els, frame, valign) {
  if (valign !== 'middle' && valign !== 'bottom') return 0;
  const end = paintedBottom(els);
  if (end === null) return 0;
  const h = Math.min(frame.h, PLACE_SPARE * Math.max(0, end - frame.y));
  const dy = (frame.h - h) * (valign === 'bottom' ? 1 : 0.5);
  return dy > 0.5 ? r2(dy) : 0;
}

/**
 * Moves elements down by `dy`, keeping each text box inside `zone` (at least its fitted text): the room a moved text
 * box had below its text is given up at the zone's bottom. Line end points move with the line. Mutates the frames.
 */
export function shiftDown(els, dy, zone) {
  const end = zone ? zone.y + zone.h : Infinity;
  for (const e of els) {
    const y = e.frame.y + dy;
    const h =
      e.type === 'text' && e.text?.fit && y + e.frame.h > end
        ? Math.max(e.text.fit.height, end - y)
        : e.frame.h;
    e.frame = { ...e.frame, y: r2(y), h: r2(h) };
    if (typeof e.lineProps?.y2 === 'number') e.lineProps = { ...e.lineProps, y2: r2(e.lineProps.y2 + dy) };
  }
}

/**
 * One binding's elements `els` (mutated) after its fill: a steps / timeline flow the layout leaves to the engine
 * (`box.flow.place`) is placed in its zone at the recorded alignment, its line boxes (`place.lines`, already in the
 * slide's `elements`, id `<slideId>-<box id>`) moved with it.
 */
export function placeAfterFill(binding, els, elements, slideId) {
  const box = binding.box;
  const place = box?.flow?.place;
  if (!place) return;
  const dy = placeOffset(els, box.frame, place.valign);
  if (!dy) return;
  shiftDown(els, dy, box.frame);
  const lines = new Set(place.lines ?? []);
  shiftDown(
    elements.filter((e) => lines.has(e.layoutBox) && e.id === `${slideId}-${e.layoutBox}`),
    dy,
    null,
  );
}
