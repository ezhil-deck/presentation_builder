// The Studio (docs/PLAN-studio.md §2, S1): one screen - top bar, filmstrip, canvas, brand panel. The slide is the
// centre; the brand is a panel beside it; checks, questions, report, diff and the mood are drawers over the canvas.
// Every brand / surface / layout / decor / logo change asks the server to compose and swaps the deck in. Edit mode
// (docs/P4-spec.md, P4.1; `E`) adds selection, move / resize / nudge / align, lock / hide / reset, one-click fixes
// and undo / redo (⌘Z / ⇧⌘Z) - every change a command on the overrides, re-composed and re-checked by the server.
// P4.2: inline text (double-click / Enter in edit mode) and slide add / duplicate / delete / move / hide are commands
// on the content document (contentEdit.js); a Markdown deck asks for a copy first (CopyDialog.jsx). P4.3: images
// (replace by upload, fit, focal point, alt, caption; a file dropped on the slide), chart data and table cells (the
// Data tab, table cells inline), flow nodes (add / remove / reorder) and the deck's font pair (dataEdit.js) - each one
// command in the same log. P4.4: every key from the keyboard map (keys.js) - ⌘A, ⌘⇧L, ⌘⇧H, Delete, [ / ] and `?`
// (the Shortcuts overlay) added; the multi-select rules live in useEditor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { slideSkeleton } from '../../../engine/src/content/placeholders.js';
import { getPointer } from '../../../engine/src/content/source.js';
import { api, brandFilesBase, studioApi } from '../api.js';
import ChecksTable, { ChecksSummary } from '../components/ChecksTable.jsx';
import { DeckStyle } from '../components/SlideCanvas.jsx';
import { findElement, isReportV1, itemsForSlide } from '../lib/checks.js';
import { studioHref } from '../router.js';
import DiffTab from '../tabs/DiffTab.jsx';
import MoodTab from '../tabs/MoodTab.jsx';
import QuestionsTab from '../tabs/QuestionsTab.jsx';
import ReportTab from '../tabs/ReportTab.jsx';
import BrandPanel from './BrandPanel.jsx';
import Canvas from './Canvas.jsx';
import {
  addSlidePatch,
  deleteSlidePatch,
  duplicateSlidePatch,
  editedUnits,
  moveSlidePatch,
  setFieldPatch,
  textEditPatch,
} from './contentEdit.js';
import CopyDialog from './CopyDialog.jsx';
import {
  addImageBlockPatch,
  addNodePatch,
  cellAsType,
  imageTarget,
  moveNodePatch,
  nextCell,
  removeNodePatch,
  setBlockPatch,
  tableEdit,
} from './dataEdit.js';
import Drawer from './Drawer.jsx';
import { slideElements, withFrames, withKeys } from './edit.js';
import Filmstrip from './Filmstrip.jsx';
import { clearLayoutCache } from './LayoutPicker.jsx';
import { matchKey } from './keys.js';
import { navTarget, overrideOf } from './lib.js';
import ShortcutsOverlay from './ShortcutsOverlay.jsx';
import SlideKindPicker from './SlideKindPicker.jsx';
import TopBar from './TopBar.jsx';
import { Icon } from './ui.jsx';
import { useEditor } from './useEditor.js';
import { useStudio } from './useStudio.js';
import { parseHash } from '../router.js';

const DRAWER_TITLE = {
  questions: 'Questions',
  report: 'Report',
  diff: 'Diff',
  checks: 'Checks',
  mood: 'Mood',
};

/** An uploaded image may be this large (the server refuses more, docs/P4-spec.md §6). */
const ASSET_LIMIT = 20 * 1024 * 1024;

/** A File as a data URL (the upload's base64 body). */
function readAsDataUrl(file) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => fail(r.error ?? new Error('the file could not be read'));
    r.readAsDataURL(file);
  });
}

/** The plain text of inline-edited paragraphs (a table cell's text: its paragraphs joined by spaces). */
const plainParagraphs = (paragraphs) =>
  (paragraphs ?? [])
    .map((p) => (p.runs ?? []).map((r) => r.text ?? '').join(''))
    .join(' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

function Notice({ kind = 'info', children, onClose }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={
        kind === 'error'
          ? 'flex items-start gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow-sm'
          : 'flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm'
      }
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-900"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Whether the deck table `id` on the slide has a header row (its cell rows count it first). */
function deckTableHeader(slide, id) {
  return Array.isArray(findElement(slide?.elements, id)?.table?.header);
}

export default function Studio({ route = {} }) {
  const s = useStudio({ brand: route.brand, content: route.content, slide: route.slide });
  const [zoom, setZoom] = useState('fit');
  const [guides, setGuides] = useState(false);
  const [grid, setGrid] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [hoverItem, setHoverItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const [picker, setPicker] = useState(null); // {after: index, top}: the slide-kind picker
  const [focalId, setFocalId] = useState(null); // the image in focal-point mode (P4.3)
  const [tableCell, setTableCell] = useState(null); // {row, col}: the Data tab's selected table cell (P4.3)
  const [shortcuts, setShortcuts] = useState(false); // the Shortcuts overlay (P4.4, `?`)

  const deck = s.result?.deck ?? null;
  const shownId = s.result?.brandId ?? s.brandId;
  const brand = s.brands?.find((b) => b.id === shownId) ?? null;
  const opts = useMemo(
    () => ({ assetBase: brandFilesBase(shownId ?? ''), fontBase: brandFilesBase(shownId ?? '') }),
    [shownId],
  );
  const checks = isReportV1(s.result?.checks) ? s.result.checks : null;
  const slide = deck?.slides?.[s.index];
  const slideItems = useMemo(
    () => (checks && slide ? itemsForSlide(checks, slide, s.index + 1) : []),
    [checks, slide, s.index],
  );
  const { setIndex, index, total, busy } = s;
  const editor = useEditor({ s, deck, index, geometry: brand?.geometry, editing });

  // what the canvas paints: a gesture's live preview (text re-fitted) or the committed deck, with the draft frames
  const shownDeck = useMemo(
    () => withFrames(s.preview?.deck ?? deck, index, editor.draft),
    [s.preview, deck, index, editor.draft],
  );
  const shownSlide = shownDeck?.slides?.[index];
  const editorView = useMemo(
    () => ({
      ...editor,
      selected: editor.selection.map((id) => findElement(shownSlide?.elements, id)).filter(Boolean),
    }),
    [editor, shownSlide],
  );

  useEffect(() => setHoverItem(null), [index, deck]);
  // focal mode and the Data tab's cell belong to one element on one slide
  const selectedKey = editor.selection.join(',');
  useEffect(() => {
    setFocalId(null);
    setTableCell(null);
  }, [index, editing, selectedKey]);

  /** Undo / redo (the Studio then shows the slide the command was on). */
  const { undo, redo } = s;
  const history = useCallback((dir) => (dir < 0 ? undo() : redo()), [undo, redo]);

  // the hash mirrors brand / content / slide (replaceState: no history entry per slide)
  useEffect(() => {
    if (!s.brandId || !s.contentId) return;
    const h = studioHref({ brand: s.brandId, content: s.contentId, slide: index + 1 });
    if (typeof window !== 'undefined' && window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [s.brandId, s.contentId, index]);

  // links into the Studio (report / checks / diff rows): follow them
  const { selectBrand, selectContent } = s;
  useEffect(() => {
    const onHash = () => {
      const r = parseHash(window.location.hash);
      if (r.page !== 'studio') return;
      if (r.brand) selectBrand(r.brand);
      if (r.content) selectContent(r.content);
      if (r.slide) setIndex(r.slide - 1);
      setDrawer(null);
      setGrid(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [selectBrand, selectContent, setIndex]);

  const step = useCallback(
    (d) => {
      if (busy) return;
      setIndex(index + d);
    },
    [busy, index, setIndex],
  );

  // keys (keys.js, scope `view`): slide navigation, E edit, G grid, ⌘Z / ⇧⌘Z, Esc closes, `?` the shortcuts; in edit
  // mode the editor's keys first (scope `edit`: Esc clears the selection, Tab cycles, arrows nudge a selection …).
  // No key fires while a field has the focus (the matcher's rule).
  const { onKey: editorKey } = editor;
  // the key handler reads the busy flag of the latest render (not of the render that registered it)
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e) => {
      // the Shortcuts overlay takes its own keys (Esc / ? close it)
      if (shortcuts) return;
      const action = matchKey(e, 'view');
      const editAction = matchKey(e, 'edit');
      if (!action && !editAction) return;
      if (action === 'undo' || action === 'redo') {
        e.preventDefault();
        if (!busyRef.current) history(action === 'redo' ? 1 : -1);
        return;
      }
      if (action === 'shortcuts') {
        e.preventDefault();
        setShortcuts(true);
        return;
      }
      if (action === 'close') {
        if (drawer) setDrawer(null);
        else if (grid) setGrid(false);
        else editorKey(e);
        return;
      }
      if (drawer) return;
      if (!grid && !busyRef.current && editorKey(e)) {
        e.preventDefault();
        return;
      }
      if (action === 'edit-mode') {
        setEditing((v) => !v);
        return;
      }
      if (action === 'grid-view') {
        setGrid((g) => !g);
        return;
      }
      const n = navTarget(e, index, total);
      if (n === null) return;
      e.preventDefault();
      if (!busyRef.current) setIndex(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer, grid, index, total, setIndex, editorKey, history, shortcuts]);

  // the brand detail (questions + live Mood) for the drawers that need it
  useEffect(() => {
    if (!shownId || (drawer !== 'questions' && drawer !== 'mood')) return undefined;
    let live = true;
    studioApi
      .brand(shownId)
      .then((d) => live && setDetail(d))
      .catch((err) => live && setNotice({ kind: 'error', text: err.message }));
    return () => {
      live = false;
    };
  }, [drawer, shownId, s.brands]);

  const reconvert = async () => {
    clearLayoutCache();
    await s.reconvert();
  };

  const onExport = async ({ pdf, png, cli }) => {
    if (!shownId) return;
    setExporting(true);
    setNotice(null);
    try {
      if (cli) {
        await api.build(shownId, true);
        setNotice({
          kind: 'info',
          text: `pb build ${shownId} --png started (showcase, without the Studio overrides) → out/${shownId}/; follow it in the review console.`,
        });
      } else {
        const r = await studioApi.exportDeck(shownId, s.contentId, { pdf, png });
        setNotice({ kind: 'info', text: `Exported to ${r.outDir}`, links: r.urls });
      }
    } catch (err) {
      setNotice({ kind: 'error', text: `Export failed: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const slideHref = (n) => studioHref({ brand: shownId, content: s.contentId, slide: n });

  /** A check item's one-click fix: the server says which element overrides it makes; applied as a command. */
  const onFix = async (item) => {
    if (!shownId || busy) return;
    try {
      const r = await studioApi.fix(shownId, s.contentId, item, s.overrides);
      if (r?.elements && Object.keys(r.elements).length) {
        await s.run(
          { elements: r.elements },
          { type: 'fix', label: `Fix ${item.check ?? item.fix?.command}`, slideId: slide?.id },
        );
      }
      if (r?.message) setNotice({ kind: 'info', text: r.message });
    } catch (err) {
      setNotice({ kind: 'error', text: `Fix failed: ${err.message}` });
    }
  };

  /** A slide override from the panel; a layout change drops the slide's element overrides (ED-3) with a notice. */
  const onOverride = (sid, patch) => {
    if (patch.layout !== undefined && slide) {
      const n = Object.keys(s.overrides.elements ?? {}).filter((id) =>
        findElement(slide.elements, id),
      ).length;
      if (n) {
        setNotice({
          kind: 'info',
          text: `Layout changed: ${n} element override${n > 1 ? 's' : ''} of this slide dropped (the boxes changed).`,
        });
      }
    }
    return s.setSlideOverride(sid, patch, slide);
  };

  // ---- content commands (P4.2): text and slides, built on the current document (or on its copy) ----
  const { edit } = s;
  const slideIdAt = useCallback(
    (i) => {
      const x = deck?.slides?.[i];
      return x ? (x.contentSlideId ?? x.id) : null;
    },
    [deck],
  );

  /** An inline edit committed: the units written back through the element's source (setField / setParagraphs). */
  const onInlineCommit = (el, paragraphs) => {
    editor.endInline();
    const slideId = slide?.contentSlideId ?? slide?.id;
    const units = editedUnits(paragraphs, el.source);
    if (JSON.stringify(units) === JSON.stringify(editedUnits(el.text.paragraphs, el.source))) return;
    const elementId = el.id;
    edit((content, d) => {
      const target = findElement(
        d?.slides?.find((x) => (x.contentSlideId ?? x.id) === slideId)?.elements,
        elementId,
      );
      if (!target?.source) return null;
      const p = textEditPatch(
        content,
        slideId,
        target.source,
        units,
        editedUnits(target.text.paragraphs, target.source),
      );
      if (!p) return null;
      const many = (target.source.paths?.length ?? 1) > 1 || units.length > 1;
      return {
        patch: { content: p },
        meta: { type: many ? 'setParagraphs' : 'setField', label: 'Edit text', slideId },
        focus: slideId,
      };
    });
  };

  // ---- data commands (P4.3): images, chart data, table cells, flow nodes - on the shown slide's content ----
  const sid = slide?.contentSlideId ?? slide?.id ?? null;
  const contentSlide = s.doc?.content?.slides?.find((x) => x.id === sid) ?? null;
  /** A content command from `build(content) -> content patch | null` on this slide. */
  const onSlide = (build, meta) => {
    const at = sid;
    return edit((content) => {
      const p = build(content, at);
      return p ? { patch: { content: p }, meta: { ...meta, slideId: at }, focus: at } : null;
    });
  };
  /** A Markdown deck takes no upload: the first one asks for "Save as a copy" (then the designer adds it again). */
  const needsCopy = () => {
    if (!s.readOnly) return false;
    edit(() => null);
    setNotice({
      kind: 'info',
      text: 'Images are saved with the deck: save it as a copy, then add the image again.',
    });
    return true;
  };
  /** Upload an image for this deck: {file, width, height, size} or null (a notice says why). */
  const upload = async (file) => {
    if (file.size > ASSET_LIMIT) {
      setNotice({ kind: 'error', text: `${file.name} is over 20 MB: images up to 20 MB.` });
      return null;
    }
    try {
      return await studioApi.uploadAsset(s.contentId, file.name, await readAsDataUrl(file));
    } catch (err) {
      setNotice({ kind: 'error', text: `Upload failed: ${err.message}` });
      return null;
    }
  };
  const data = {
    setField: (path, value, label = 'Edit field') =>
      onSlide((content, at) => setFieldPatch(content, at, path, value), { type: 'setField', label }),
    setBlock: (blockPath, fn, label = 'Edit block') =>
      onSlide(
        (content, at) => {
          const block = getPointer(
            content.slides.find((x) => x.id === at),
            blockPath,
          );
          if (!block) return null;
          const next = fn(block);
          return next && next !== block ? setBlockPatch(content, at, blockPath, next) : null;
        },
        { type: 'setBlock', label },
      ),
    replaceImage: async (el, file) => {
      if (needsCopy()) return null;
      const target = imageTarget(el, contentSlide);
      if (!target) return null;
      const up = await upload(file);
      if (!up) return null;
      return data.setField(target.srcPath, up.file, 'Replace image');
    },
    /** A focal point (null clears it): in the content for an image block's item, else an element override. */
    setFocal: (el, target, focal) =>
      target.focalIn === 'content'
        ? data.setField(
            `${target.nodePath}/focal`,
            focal ?? undefined,
            focal ? 'Focal point' : 'Clear focal point',
          )
        : s.run(
            { elements: { [el.id]: withKeys(s.overrides.elements?.[el.id], { focal }) } },
            { type: 'focal', label: focal ? 'Focal point' : 'Clear focal point', slideId: slide?.id },
          ),
    setFit: (el, fit) =>
      s.run(
        { elements: { [el.id]: withKeys(s.overrides.elements?.[el.id], { fit }) } },
        { type: 'fit', label: `Fit ${fit}`, slideId: slide?.id },
      ),
    cellType: async (blockPath, row, col, type, file) => {
      let src;
      if (type === 'image' || type === 'logo') {
        if (!file) return null;
        if (needsCopy()) return null;
        src = (await upload(file))?.file;
        if (!src) return null;
      }
      return data.setBlock(
        blockPath,
        (b) => {
          const cell = row < 0 ? b.header?.[col] : b.rows?.[row]?.[col];
          const next = cellAsType(cell, type, { src });
          return next === null ? b : tableEdit(b, { kind: 'cell', row, col, value: next });
        },
        `Cell type ${type}`,
      );
    },
    node: (action, info, arg) => {
      const label = { add: 'Add node', remove: 'Remove node', move: 'Move node' }[action];
      return onSlide(
        (content, at) => {
          if (action === 'add') return addNodePatch(content, at, info, arg)?.patch ?? null;
          if (action === 'remove') return removeNodePatch(content, at, info);
          return moveNodePatch(content, at, info, arg);
        },
        { type: `${action}Node`, label },
      );
    },
  };

  /** A table cell committed inline: its text written to the content cell; Tab / Enter open the next cell. */
  const onCellCommit = (tableEl, cellEl, paragraphs, move) => {
    editor.endCell();
    const { r, c, row, col } = cellEl.cell;
    setTableCell({ row, col });
    const text = plainParagraphs(paragraphs);
    if (text !== plainParagraphs(cellEl.text.paragraphs) && tableEl.source?.path) {
      data.setBlock(
        tableEl.source.path,
        (b) => tableEdit(b, { kind: 'cellText', row, col, value: text }),
        'Edit cell',
      );
    }
    const next = move ? nextCell(tableEl, r, c, move) : null;
    if (next) editor.startCell(tableEl.id, next.r, next.c);
  };

  /** A file dropped on the slide: it replaces the image under the pointer, or is added when the slide shows none. */
  const onDropFile = async (file, el) => {
    if (
      !/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type ?? '') &&
      !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name ?? '')
    ) {
      setNotice({ kind: 'error', text: `${file.name} is not an image (png, jpg, webp, gif, svg).` });
      return;
    }
    if (el && imageTarget(el, contentSlide)) {
      await data.replaceImage(el, file);
      return;
    }
    const shown = slideElements(slide).some((x) => x.type === 'image' && imageTarget(x, contentSlide));
    if (shown) {
      setNotice({ kind: 'info', text: 'Drop the file on an image to replace it.' });
      return;
    }
    if (needsCopy()) return;
    const up = await upload(file);
    if (up)
      onSlide((content, at) => addImageBlockPatch(content, at, up.file), {
        type: 'addImage',
        label: 'Add image',
      });
  };

  const addSlide = (after, layout) => {
    setPicker(null);
    const afterId = slideIdAt(after);
    edit((content, d, overrides) => {
      const r = addSlidePatch(content, afterId, slideSkeleton(layout), overrides);
      return {
        patch: { content: r.patch },
        meta: { type: 'addSlide', label: `Add ${layout.label ?? layout.id}`, slideId: r.id },
        focus: r.id,
      };
    });
  };
  const duplicateSlide = useCallback(
    (i) => {
      const id = slideIdAt(i);
      if (!id || busy) return;
      edit((content, d, overrides) => {
        const r = duplicateSlidePatch(content, overrides, id);
        return r
          ? {
              patch: r.patch,
              meta: { type: 'duplicateSlide', label: 'Duplicate slide', slideId: r.id },
              focus: r.id,
            }
          : null;
      });
    },
    [slideIdAt, edit, busy],
  );
  const deleteSlide = useCallback(
    (i) => {
      const id = slideIdAt(i);
      if (!id || busy) return;
      if ((deck?.slides?.length ?? 0) < 2) {
        setNotice({ kind: 'info', text: 'A deck keeps at least one slide.' });
        return;
      }
      edit((content) => {
        const p = deleteSlidePatch(content, id);
        return p
          ? { patch: { content: p }, meta: { type: 'deleteSlide', label: 'Delete slide', slideId: id } }
          : null;
      });
    },
    [slideIdAt, edit, busy, deck],
  );
  const moveSlide = useCallback(
    (from, to) => {
      const id = slideIdAt(from);
      if (!id || busy || to < 0 || to >= (deck?.slides?.length ?? 0)) return;
      edit((content) => {
        const p = moveSlidePatch(content, id, to);
        return p
          ? {
              patch: { content: p },
              meta: { type: 'moveSlide', label: 'Move slide', slideId: id },
              focus: id,
            }
          : null;
      });
    },
    [slideIdAt, edit, busy, deck],
  );
  const toggleHidden = (i) => {
    const x = deck?.slides?.[i];
    if (!x) return;
    const hidden = overrideOf(s.overrides, x).hidden === true;
    s.setSlideOverride(x.contentSlideId ?? x.id, { hidden: !hidden }, x);
  };
  const openPicker = (after, rect) => {
    const top = Math.max(56, Math.min(rect?.top ?? 56, (window.innerHeight || 800) - 560));
    setPicker({ after, top });
  };
  const current = s.contents?.find((c) => c.id === s.contentId);

  let empty = null;
  if (s.loadError) empty = `Could not load the Studio: ${s.loadError}`;
  else if (!s.brands) empty = 'Loading brands…';
  else if (!s.brands.length) empty = 'No brand inputs under golden/brands/.';
  else if (!deck && !s.error) empty = 'Composing…';
  else if (!deck && s.error) empty = s.error;

  return (
    <div
      className="pb-ui pb-studio flex h-screen flex-col overflow-hidden bg-zinc-50 text-[13px] text-zinc-900"
      data-testid="studio"
    >
      {deck ? <DeckStyle deck={deck} fontBase={opts.fontBase} /> : null}
      {shortcuts ? <ShortcutsOverlay onClose={() => setShortcuts(false)} /> : null}
      <TopBar
        brands={s.brands}
        brandId={shownId}
        contents={s.contents}
        contentId={s.contentId}
        index={index}
        total={total}
        zoom={zoom}
        guides={guides}
        grid={grid}
        busy={busy}
        exporting={exporting}
        onBrand={s.selectBrand}
        onContent={s.selectContent}
        onStep={step}
        onZoom={setZoom}
        onGuides={setGuides}
        onGrid={setGrid}
        onExport={onExport}
        onDrawer={setDrawer}
        onReconvert={reconvert}
        editing={editing}
        canUndo={s.canUndo}
        canRedo={s.canRedo}
        saveState={s.saveState}
        onEdit={setEditing}
        onUndo={() => history(-1)}
        onRedo={() => history(1)}
        readOnly={s.readOnly}
      />
      <div className="flex min-h-0 flex-1">
        <Filmstrip
          deck={shownDeck}
          index={index}
          opts={opts}
          accent={brand?.accent}
          overrides={s.result?.overrides}
          onSelect={(i) => !busy && setIndex(i)}
          disabled={busy || !deck}
          onAdd={openPicker}
          onDuplicate={duplicateSlide}
          onDelete={deleteSlide}
          onMove={moveSlide}
          onToggleHidden={toggleHidden}
        />
        {picker ? (
          <SlideKindPicker
            brandId={shownId}
            title={`New slide after slide ${picker.after + 1}`}
            style={{ left: 188, top: picker.top }}
            onPick={(layout) => addSlide(picker.after, layout)}
            onClose={() => setPicker(null)}
          />
        ) : null}
        {s.copyRequest ? (
          <CopyDialog
            from={current?.title ?? s.contentId}
            defaultName={`${s.contentId}-copy`.toLowerCase().replace(/[^a-z0-9-]/g, '-')}
            onSave={(name) => s.saveCopy(name)}
            onCancel={s.cancelCopy}
          />
        ) : null}
        <main className="relative min-w-0 flex-1">
          {empty ? (
            <div
              className="flex h-full items-center justify-center bg-zinc-100 text-zinc-500"
              data-testid="studio-empty"
            >
              {empty}
            </div>
          ) : (
            <Canvas
              deck={shownDeck}
              index={index}
              opts={opts}
              zoom={zoom}
              guides={guides}
              geometry={brand?.geometry}
              items={slideItems}
              hoverItem={hoverItem}
              grid={grid}
              accent={brand?.accent}
              busy={busy}
              editing={editing}
              editor={editorView}
              contentSlide={s.doc?.content?.slides?.find(
                (x) => x.id === (slide?.contentSlideId ?? slide?.id),
              )}
              onInlineCommit={onInlineCommit}
              onInlineCancel={editor.endInline}
              focalId={focalId}
              onFocalCommit={(el, target, focal) => data.setFocal(el, target, focal)}
              onFocalDone={() => setFocalId(null)}
              onCellCommit={onCellCommit}
              onCellCancel={editor.endCell}
              onNodeMove={(info, to) => data.node('move', info, to)}
              onDropFile={onDropFile}
              onShowChecks={() => setChecksOpen(true)}
              onSelect={(i) => {
                setIndex(i);
                setGrid(false);
              }}
              onStep={step}
            />
          )}
          <div className="pointer-events-none absolute left-4 right-4 top-3 z-20 flex flex-col items-center gap-2">
            {deck && s.error ? (
              <div className="pointer-events-auto w-full max-w-xl">
                <Notice kind="error" onClose={s.clearError}>
                  Compose failed: {s.error}. The previous deck is still shown.
                </Notice>
              </div>
            ) : null}
            {notice ? (
              <div className="pointer-events-auto w-full max-w-xl">
                <Notice kind={notice.kind} onClose={() => setNotice(null)}>
                  {notice.text}
                  {notice.links ? (
                    <span className="mt-1 flex flex-wrap gap-x-3">
                      {Object.entries(notice.links).map(([name, url]) => (
                        <a
                          key={name}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          {name}
                        </a>
                      ))}
                    </span>
                  ) : null}
                </Notice>
              </div>
            ) : null}
          </div>
          {drawer ? (
            <Drawer
              title={DRAWER_TITLE[drawer]}
              subtitle={`${brand?.name ?? shownId ?? ''} · ${s.contents?.find((c) => c.id === s.contentId)?.title ?? ''}`}
              onClose={() => setDrawer(null)}
            >
              {drawer === 'questions' ? (
                detail?.id === shownId ? (
                  <QuestionsTab
                    id={shownId}
                    questions={detail.questionsList}
                    building={busy}
                    canBuild
                    onRebuild={reconvert}
                  />
                ) : (
                  <p className="text-zinc-500">Loading…</p>
                )
              ) : null}
              {drawer === 'report' ? (
                <ReportTab id={shownId} report={s.result?.report} slideHref={slideHref} />
              ) : null}
              {drawer === 'diff' ? (
                <DiffTab
                  id={shownId}
                  version={deck?.id}
                  load={() => studioApi.diff(shownId, s.contentId)}
                  label={`golden/expected/${shownId}/deck.json → the live deck`}
                  slideHref={slideHref}
                />
              ) : null}
              {drawer === 'checks' ? (
                checks ? (
                  <div className="space-y-3">
                    <ChecksSummary summary={checks.summary} />
                    <ChecksTable id={shownId} checks={checks} slideHref={slideHref} />
                  </div>
                ) : (
                  <p className="text-zinc-500">No checks for this deck.</p>
                )
              ) : null}
              {drawer === 'mood' ? (
                detail?.id === shownId ? (
                  <MoodTab id={shownId} mood={detail.mood} />
                ) : (
                  <p className="text-zinc-500">Loading…</p>
                )
              ) : null}
            </Drawer>
          ) : null}
        </main>
        <BrandPanel
          brand={brand}
          deck={deck}
          index={index}
          checks={checks}
          overrides={s.result?.overrides}
          busy={busy}
          onOverride={onOverride}
          onReset={(sid) => s.resetSlide(sid, slide)}
          onFix={onFix}
          editing={editing}
          editor={editor}
          onSelect={(i) => !busy && setIndex(i)}
          onHoverItem={setHoverItem}
          onOpenMood={() => setDrawer('mood')}
          onOpenChecks={() => setDrawer('checks')}
          checksOpen={checksOpen}
          onChecksOpen={setChecksOpen}
          contentSlide={contentSlide}
          data={s.doc ? data : null}
          focalId={focalId}
          onFocal={setFocalId}
          tableCell={
            editor.cell
              ? { row: editor.cell.r - (deckTableHeader(slide, editor.cell.id) ? 1 : 0), col: editor.cell.c }
              : tableCell
          }
          onTableCell={setTableCell}
          fontPair={s.overrides.fontPair ?? null}
          onFontPair={(id) =>
            s.run({ fontPair: id }, { type: 'fontPair', label: id ? `Font pair ${id}` : 'Brand font pair' })
          }
        />
      </div>
    </div>
  );
}
