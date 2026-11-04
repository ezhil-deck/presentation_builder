// The Studio's edit mode (docs/P4-spec.md §2; P4.1): selection (click, shift-click, Tab in z order, Esc, groups as one
// with double-click to enter), move by drag with snapping and guides, resize by handles (text re-fitted live through a
// preview compose every ~50 ms), nudge by arrow keys, align / distribute / match size, lock / hide / reset. A gesture
// paints draft frames locally and commits ONE command on release; every command goes to the server (useStudio.run).
// P4.2: double-click on a text element (or Enter with one selected) opens the inline editor over it (`inline`); text
// with no content source (generated: step numbers, initials) is refused with a tip. P4.3: a chart's / table's own
// texts (title, source) edit inline like any text; a double-click on a table opens the inline editor on the cell under
// the pointer (`cell`: Tab / Shift+Tab / Enter move on to the next cell). P4.4: keys from the keyboard map (keys.js);
// the multi-select rules - hidden elements are never selected (click, Tab, ⌘A) and leave the selection when hidden;
// locked ones stay selected but are never moved, nudged, aligned, distributed, matched or resized; a drag moves the
// unlocked ones and clamps / snaps their bounding box as one; a multi-selection resizes from the corners of its
// bounding box (each frame scaled in proportion, text re-fitted through the preview compose); shift-click never
// mixes the levels of an entered group; Delete / ⌘⇧H hide the selection in one command.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findElement } from '../lib/checks.js';
import { cellAt } from './dataEdit.js';
import {
  CORNERS,
  alignFrames,
  bounds,
  clampMove,
  clickSelection,
  contentFrameOf,
  distributeFrames,
  levelElements,
  matchSize,
  pickTarget,
  pruneSelection,
  resizeFrame,
  roundFrame,
  sameFrame,
  scaleFrames,
  selectAllIds,
  selectableElements,
  snapMove,
  snapTargets,
  snapThreshold,
  withKeys,
} from './edit.js';
import { arrowOf, matchKey } from './keys.js';

const DRAG_START_PX = 3;
const PREVIEW_MS = 50;
const NUDGE_COMMIT_MS = 350;
const TIP_MS = 2600;
/** Element types whose resize is previewed through compose (re-fitted / laid out again while the handle moves). */
const LIVE_RESIZE = new Set(['text', 'group', 'chart', 'table']);

/** Why a text element cannot be edited inline (null: it can). */
export function inlineRefusal(el) {
  if (!el || el.type !== 'text') return 'Only text is edited inline';
  if (!el.source?.path) return 'This text is made by the layout, not taken from the content';
  return null;
}

/** The table a pointer target belongs to: the table element itself, or the table whose drawn cell part it is. */
export function tableOf(slide, el) {
  if (!el) return null;
  if (el.type === 'table') return el;
  const m = /^(.*)-cell-\d+-\d+(?:-|$)/.exec(el.id ?? '');
  const t = m ? findElement(slide?.elements, m[1]) : null;
  return t?.type === 'table' ? t : null;
}

/**
 * `s` = useStudio's state, `deck` = the committed deck, `index` = the slide shown, `geometry` = the brand's
 * {margins, titleZone, grid}, `editing` = edit mode on. Returns the selection and the handlers the canvas, the panel
 * and the key handler use.
 */
export function useEditor({ s, deck, index, geometry, editing }) {
  const [selection, setSelection] = useState([]);
  const [group, setGroup] = useState(null);
  const [draft, setDraft] = useState(null); // {[id]: frame} while a gesture runs
  const [guides, setGuides] = useState([]);
  const [inline, setInline] = useState(null); // the text element id being edited inline
  const [tip, setTip] = useState(null); // {id, text}: why a double-click did not open the inline editor
  const [cell, setCell] = useState(null); // {id, r, c}: the table cell being edited inline (P4.3)
  const tipTimer = useRef(null);
  const gesture = useRef(null);
  const nudge = useRef(null);
  // lock / hide / show, defined below, reached from the key handler
  const toggleRef = useRef(null);
  const showHiddenRef = useRef(null);
  const slide = deck?.slides?.[index] ?? null;
  const canvas = deck?.canvas ?? { width: 1920, height: 1080 };

  const live = useRef({});
  live.current = { s, slide, selection, group, geometry, canvas, index, inline };

  // a new slide, brand or edit mode off: nothing selected
  useEffect(() => {
    setSelection([]);
    setGroup(null);
    setDraft(null);
    setGuides([]);
    setInline(null);
    setTip(null);
    setCell(null);
  }, [index, editing, s.brandId, s.contentId]);
  useEffect(() => () => clearTimeout(tipTimer.current), []);

  /** Open the inline editor on a text element, or show why it cannot be (a tip by the element). */
  const startInline = useCallback((el) => {
    const why = inlineRefusal(el);
    if (why) {
      clearTimeout(tipTimer.current);
      setTip(el ? { id: el.id, text: why } : null);
      tipTimer.current = setTimeout(() => setTip(null), TIP_MS);
      return false;
    }
    setTip(null);
    setSelection([el.id]);
    setInline(el.id);
    return true;
  }, []);
  const endInline = useCallback(() => setInline(null), []);
  /** Open the inline editor on table cell (r, c) of the deck table `id` (its cell rows: the header first). */
  const startCell = useCallback((id, r, c) => {
    setTip(null);
    setInline(null);
    setSelection([id]);
    setCell({ id, r, c });
  }, []);
  const endCell = useCallback(() => setCell(null), []);

  // a new deck: keep only the ids it still has, and none that is hidden now
  useEffect(() => {
    setSelection((sel) => pruneSelection(slide, sel));
  }, [slide]);

  const elementOf = useCallback((id) => findElement(live.current.slide?.elements, id), []);
  const overrideOf = useCallback((id) => live.current.s.overrides?.elements?.[id] ?? null, []);

  /** Commit frames {[id]: frame} as one command (ids whose frame did not change are left out). */
  const commitFrames = useCallback(async (frames, label) => {
    const { s: st, slide: sl } = live.current;
    const elements = {};
    for (const [id, f] of Object.entries(frames ?? {})) {
      const el = findElement(sl?.elements, id);
      if (!el || sameFrame(roundFrame(f), el.frame)) continue;
      elements[id] = withKeys(st.overrides?.elements?.[id], { frame: roundFrame(f) });
    }
    if (!Object.keys(elements).length) {
      setDraft(null);
      st.clearPreview();
      return null;
    }
    const r = await st.run({ elements }, { type: 'frame', label, slideId: sl?.id });
    setDraft(null);
    setGuides([]);
    if (!r) st.clearPreview();
    return r;
  }, []);

  /** A pointer down on the slide (canvas `scale`): select, then maybe a move gesture. */
  const onSlideMouseDown = useCallback(
    (e, scale) => {
      if (!editing || e.button !== 0) return;
      const { group: g, slide: sl, selection: sel } = live.current;
      let id = pickTarget(e.target, g);
      if (g && id && !findElement(levelElements(sl, g), id)) id = null;
      e.preventDefault();
      if (g && !id) {
        // shift-click outside the entered group: ignored (a selection stays within one level)
        if (e.shiftKey) return;
        // a click outside it: leave the group, select at the slide level
        setGroup(null);
        id = pickTarget(e.target, null);
      }
      // a hidden element is never selected (it is not painted; a stale target is ignored)
      if (id && findElement(sl?.elements, id)?.hidden) id = null;
      if (!id) {
        if (!e.shiftKey) setSelection([]);
        return;
      }
      const next = clickSelection(sel, id, e.shiftKey);
      if (next !== sel) setSelection(next);
      if (e.shiftKey) return;
      const starts = {};
      for (const x of next) {
        const el = findElement(sl?.elements, x);
        if (el && !el.locked) starts[x] = el.frame;
      }
      if (!Object.keys(starts).length) return;
      gesture.current = {
        kind: 'move',
        x0: e.clientX,
        y0: e.clientY,
        scale,
        starts,
        moved: false,
        targets: snapTargets({
          slide: sl,
          geometry: live.current.geometry,
          canvas: live.current.canvas,
          exclude: new Set(Object.keys(starts)),
        }),
      };
    },
    [editing],
  );

  /**
   * A pointer down on a resize handle: of the one selected element, or a corner of a multi-selection's bounding box
   * (its unlocked elements scale in proportion; an edge handle does nothing for several).
   */
  const onHandleMouseDown = useCallback((e, dir, scale) => {
    const { selection: sel, slide: sl } = live.current;
    if (e.button !== 0 || !sel.length) return;
    if (sel.length > 1) {
      if (!CORNERS.includes(dir)) return;
      const starts = {};
      const types = new Set();
      for (const id of sel) {
        const x = findElement(sl?.elements, id);
        if (x && !x.locked) {
          starts[id] = x.frame;
          types.add(x.type);
        }
      }
      const ids = Object.keys(starts);
      if (!ids.length) return;
      e.preventDefault();
      e.stopPropagation();
      gesture.current = {
        kind: 'resize-many',
        dir,
        x0: e.clientX,
        y0: e.clientY,
        scale,
        starts,
        box: bounds(ids.map((id) => starts[id])),
        live: [...types].some((t) => LIVE_RESIZE.has(t)),
        moved: false,
        lastPreview: 0,
        targets: snapTargets({
          slide: sl,
          geometry: live.current.geometry,
          canvas: live.current.canvas,
          exclude: new Set(ids),
        }),
      };
      return;
    }
    const el = findElement(sl?.elements, sel[0]);
    if (!el || el.locked) return;
    e.preventDefault();
    e.stopPropagation();
    gesture.current = {
      kind: 'resize',
      dir,
      id: el.id,
      type: el.type,
      x0: e.clientX,
      y0: e.clientY,
      scale,
      starts: { [el.id]: el.frame },
      moved: false,
      lastPreview: 0,
      targets: snapTargets({
        slide: sl,
        geometry: live.current.geometry,
        canvas: live.current.canvas,
        exclude: new Set([el.id]),
      }),
    };
  }, []);

  // the gesture follows the pointer on the window; one command on release
  useEffect(() => {
    const onMove = (e) => {
      const g = gesture.current;
      if (!g) return;
      let dx = (e.clientX - g.x0) / g.scale;
      let dy = (e.clientY - g.y0) / g.scale;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_START_PX) return;
      g.moved = true;
      // the threshold is SNAP_PX on screen: in canvas px it grows as the canvas is shown smaller
      const threshold = snapThreshold(g.scale);
      const targets = e.altKey ? null : g.targets;
      if (g.kind === 'move') {
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        // the moving group (the unlocked part of the selection) snaps and is clamped as one box
        const ids = Object.keys(g.starts);
        const box = bounds(ids.map((id) => g.starts[id]));
        let sdx = dx;
        let sdy = dy;
        let lines = [];
        if (targets) {
          const snapped = snapMove({ ...box, x: box.x + dx, y: box.y + dy }, targets, threshold);
          if (!e.shiftKey || dx !== 0) sdx = snapped.frame.x - box.x;
          if (!e.shiftKey || dy !== 0) sdy = snapped.frame.y - box.y;
          lines = snapped.guides;
        }
        const c = clampMove(box, sdx, sdy, live.current.canvas);
        if (c.dx !== sdx || c.dy !== sdy) lines = [];
        const frames = {};
        for (const id of ids)
          frames[id] = { ...g.starts[id], x: g.starts[id].x + c.dx, y: g.starts[id].y + c.dy };
        g.frames = frames;
        setDraft(frames);
        setGuides(lines);
      } else if (g.kind === 'resize-many') {
        const r = resizeFrame(g.box, g.dir, dx, dy, { keepAspect: e.shiftKey, targets, threshold });
        g.frames = scaleFrames(g.starts, g.box, r.frame);
        setDraft(g.frames);
        setGuides(r.guides);
        const now = Date.now();
        if (g.live && now - g.lastPreview >= PREVIEW_MS) {
          g.lastPreview = now;
          const own = live.current.s.overrides?.elements ?? {};
          live.current.s.previewPatch({
            elements: Object.fromEntries(
              Object.entries(g.frames).map(([id, f]) => [id, withKeys(own[id], { frame: f })]),
            ),
          });
        }
      } else {
        const start = g.starts[g.id];
        const r = resizeFrame(start, g.dir, dx, dy, {
          keepAspect: e.shiftKey && g.type === 'image',
          targets,
          threshold,
        });
        g.frames = { [g.id]: r.frame };
        setDraft(g.frames);
        setGuides(r.guides);
        // text re-fits live (a chart / table is laid out again, P4.3): a preview compose with the temporary
        // override every ~PREVIEW_MS
        const now = Date.now();
        if (LIVE_RESIZE.has(g.type) && now - g.lastPreview >= PREVIEW_MS) {
          g.lastPreview = now;
          const cur = live.current.s.overrides?.elements?.[g.id];
          live.current.s.previewPatch({ elements: { [g.id]: withKeys(cur, { frame: r.frame }) } });
        }
      }
    };
    const onUp = () => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      setGuides([]);
      if (!g.moved || !g.frames) return;
      commitFrames(g.frames, g.kind === 'move' ? 'Move' : 'Resize');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [commitFrames]);

  /**
   * Double-click: a group is entered (its children select one by one); a text opens the inline editor; a table (or a
   * drawn part of one of its cells) opens it on the cell under the pointer (`scale` = the canvas scale).
   */
  const onSlideDoubleClick = useCallback(
    (e, scale = 1) => {
      if (!editing) return;
      const { group: g, slide: sl } = live.current;
      const id = pickTarget(e.target, g);
      const el = id ? findElement(sl?.elements, id) : null;
      if (el?.type === 'group' && el.children?.length) {
        setGroup(el.id);
        const child = pickTarget(e.target, el.id);
        setSelection(child ? [child] : []);
        return;
      }
      const table = tableOf(sl, el);
      if (table) {
        const rect = e.currentTarget?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
        const x = (e.clientX - rect.left) / (scale || 1);
        const y = (e.clientY - rect.top) / (scale || 1);
        const at = cellAt(table, x, y);
        if (at && table.source?.path) startCell(table.id, at.r, at.c);
        else {
          clearTimeout(tipTimer.current);
          setTip({
            id: table.id,
            text: table.source?.path
              ? 'Double-click a cell to edit it'
              : 'This table is not taken from the content',
          });
          tipTimer.current = setTimeout(() => setTip(null), TIP_MS);
        }
        return;
      }
      if (el?.type === 'text') startInline(el);
    },
    [editing, startInline, startCell],
  );

  /** Arrow keys: 1 px (Shift 10), accumulated and committed as one command after a pause. */
  const nudgeBy = useCallback(
    (dx, dy) => {
      const { selection: sel, slide: sl } = live.current;
      const n = nudge.current ?? { dx: 0, dy: 0, starts: {}, timer: null };
      if (!nudge.current) {
        for (const id of sel) {
          const el = findElement(sl?.elements, id);
          if (el && !el.locked) n.starts[id] = el.frame;
        }
      }
      if (!Object.keys(n.starts).length) return;
      // the nudged group stays on the canvas as one box
      const c = clampMove(bounds(Object.values(n.starts)), n.dx + dx, n.dy + dy, live.current.canvas);
      n.dx = c.dx;
      n.dy = c.dy;
      const frames = {};
      for (const [id, f] of Object.entries(n.starts)) frames[id] = { ...f, x: f.x + n.dx, y: f.y + n.dy };
      n.frames = frames;
      nudge.current = n;
      setDraft(frames);
      clearTimeout(n.timer);
      n.timer = setTimeout(() => {
        nudge.current = null;
        commitFrames(frames, 'Nudge');
      }, NUDGE_COMMIT_MS);
    },
    [commitFrames],
  );
  useEffect(() => () => clearTimeout(nudge.current?.timer), []);

  /** Tab / Shift+Tab: the next / previous element in z order at the current level (from the last selected). */
  const cycle = useCallback((back) => {
    const { slide: sl, group: g, selection: sel } = live.current;
    const list = selectableElements(sl, g);
    if (!list.length) return;
    const at = sel.length ? list.findIndex((el) => el.id === sel[sel.length - 1]) : -1;
    const next = at < 0 ? (back ? list.length - 1 : 0) : (at + (back ? -1 : 1) + list.length) % list.length;
    setSelection([list[next].id]);
  }, []);

  /** Edit-mode keys (keys.js, scope `edit`); true when the key was the editor's. */
  const onKey = useCallback(
    (e) => {
      if (!editing) return false;
      const { selection: sel, group: g, slide: sl } = live.current;
      const action = matchKey(e, 'edit');
      if (!action) return false;
      if (action === 'inline-edit') {
        if (sel.length !== 1) return false;
        const el = findElement(sl?.elements, sel[0]);
        if (el?.type === 'text') {
          startInline(el);
          return true;
        }
        if (el?.type === 'table' && el.source?.path && el.table?.cells?.length) {
          startCell(el.id, 0, 0);
          return true;
        }
        return false;
      }
      if (action === 'escape') {
        if (g) {
          setSelection([g]);
          setGroup(null);
          return true;
        }
        if (sel.length) {
          setSelection([]);
          return true;
        }
        return false;
      }
      if (action === 'next-element' || action === 'prev-element') {
        cycle(action === 'prev-element');
        return true;
      }
      if (action === 'nudge' || action === 'nudge-10') {
        if (!sel.length) return false;
        const a = arrowOf(e);
        const d = action === 'nudge-10' ? 10 : 1;
        nudgeBy(a.dx * d, a.dy * d);
        return true;
      }
      if (action === 'select-all') {
        setSelection(selectAllIds(sl, g));
        return true;
      }
      if (action === 'lock') {
        if (!sel.length) return false;
        toggleRef.current('locked');
        return true;
      }
      if (action === 'hide') {
        if (sel.length) toggleRef.current('hidden');
        else showHiddenRef.current();
        return true;
      }
      if (action === 'hide-selection') {
        if (!sel.length) return false;
        toggleRef.current('hidden', true);
        return true;
      }
      return false;
    },
    [editing, cycle, nudgeBy, startInline, startCell],
  );

  const items = useCallback(
    () =>
      live.current.selection
        .map((id) => findElement(live.current.slide?.elements, id))
        .filter((el) => el && !el.locked)
        .map((el) => ({ id: el.id, frame: el.frame })),
    [],
  );

  /** Align the selection (≥ 2: to their bounds; 1: to the content frame). */
  const align = useCallback(
    (how) => {
      const list = items();
      if (!list.length) return null;
      const ref =
        list.length > 1
          ? bounds(list.map((i) => i.frame))
          : contentFrameOf(live.current.geometry, live.current.canvas);
      return commitFrames(alignFrames(list, how, ref), `Align ${how}`);
    },
    [items, commitFrames],
  );
  const distribute = useCallback(
    (axis) => commitFrames(distributeFrames(items(), axis), `Distribute ${axis}`),
    [items, commitFrames],
  );
  const match = useCallback(
    (key) => commitFrames(matchSize(items(), key), `Match ${key === 'w' ? 'width' : 'height'}`),
    [items, commitFrames],
  );
  /** The frame fields of the panel: one element's frame set. */
  const setFrame = useCallback((id, frame) => commitFrames({ [id]: frame }, 'Frame'), [commitFrames]);

  /**
   * Lock / hide on the selection, one command: on for all unless every one has it already (then off); `force` sets
   * it. A hidden element leaves the selection (it is no longer painted).
   */
  const toggle = useCallback((key, force) => {
    const { s: st, selection: sel, slide: sl } = live.current;
    const els = sel.map((id) => findElement(sl?.elements, id)).filter(Boolean);
    if (!els.length) return null;
    const on = typeof force === 'boolean' ? force : !els.every((el) => el[key]);
    const elements = Object.fromEntries(
      els.map((el) => [el.id, withKeys(st.overrides?.elements?.[el.id], { [key]: on })]),
    );
    return st.run({ elements }, { type: key, label: `${on ? '' : 'Un'}${key}`, slideId: sl?.id });
  }, []);
  toggleRef.current = toggle;

  /** The hidden elements of the slide (at the current level and in its groups). */
  const hiddenElements = useMemo(() => {
    const out = [];
    const walk = (els) => {
      for (const el of els ?? []) {
        if (el.hidden) out.push(el);
        if (Array.isArray(el.children)) walk(el.children);
      }
    };
    walk(slide?.elements);
    return out;
  }, [slide]);

  /** Show hidden elements again (`ids`, default every hidden one of the slide): one command. */
  const showHidden = useCallback((ids) => {
    const { s: st, slide: sl } = live.current;
    const list = [];
    const walk = (els) => {
      for (const el of els ?? []) {
        if (el.hidden && (!ids || ids.includes(el.id))) list.push(el.id);
        if (Array.isArray(el.children)) walk(el.children);
      }
    };
    walk(sl?.elements);
    if (!list.length) return null;
    const elements = Object.fromEntries(
      list.map((id) => [id, withKeys(st.overrides?.elements?.[id], { hidden: false })]),
    );
    return st.run({ elements }, { type: 'hidden', label: 'Show', slideId: sl?.id });
  }, []);
  showHiddenRef.current = showHidden;

  /** Clear the selection (a click on the empty canvas around the slide). */
  const clear = useCallback(() => {
    setSelection([]);
    setGroup(null);
  }, []);

  /** Reset element: every override of the selected elements dropped. */
  const resetElements = useCallback(() => {
    const { s: st, selection: sel, slide: sl } = live.current;
    const own = sel.filter((id) => st.overrides?.elements?.[id]);
    if (!own.length) return null;
    return st.run(
      { elements: Object.fromEntries(own.map((id) => [id, null])) },
      { type: 'reset', label: 'Reset element', slideId: sl?.id },
    );
  }, []);

  const selected = useMemo(
    () => selection.map((id) => findElement(slide?.elements, id)).filter(Boolean),
    [selection, slide],
  );

  return {
    selection,
    selected,
    setSelection,
    group,
    draft,
    guides,
    elementOf,
    overrideOf,
    onSlideMouseDown,
    onSlideDoubleClick,
    onHandleMouseDown,
    onKey,
    inline,
    tip,
    startInline,
    endInline,
    cell,
    startCell,
    endCell,
    align,
    distribute,
    match,
    setFrame,
    toggle,
    resetElements,
    hiddenElements,
    showHidden,
    clear,
  };
}
