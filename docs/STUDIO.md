# The Studio — a guide for designers

The Studio is the local editor of presentation_builder: one screen where a brand's deck is shown, checked and edited.
Every slide you see is painted by the same renderer that makes the PDF / PNG export, from a **Deck** the server composes
from your content, the brand's Mood and your overrides. Nothing you do is a hidden tweak of a picture: every change is a
command on the content or on your overrides, the server re-composes, re-fits the text and re-runs the checks, and the
checks *warn* (with a one-click Fix where there is one) but never block.

Run it: `npm run build:ui && npm run serve:ui` → http://localhost:8100 (the Studio is the start page; `#/studio/<brand>/<deck>/<slide>`
links to a slide). Specs behind this guide: `docs/PLAN-studio.md` (the shell) and `docs/P4-spec.md` (the editor).

## 1. The screen

- **Top bar** — the brand switcher, the deck (content) picker, slide counter with ‹ ›, zoom (Fit / 50 / 100 %), the
  guides toggle (margins + title zone), the grid (`G`), **Edit** (`E`), undo / redo, the saved state ("Saved",
  "Saving…"), **Export** (PDF, PNG, HTML, or `pb build`) and **More** (Questions, Report, Diff, Checks, Mood drawers).
  A Markdown deck shows a "read-only" mark: the first edit offers *Save as a copy*.
- **Filmstrip** (left) — every slide as a thumbnail with its number, kind and overflow count. Click to show it; drag a
  row to reorder; right-click for add / duplicate / delete / hide; `+` between rows (or **New slide**) opens the
  slide-kind picker (the catalogue's layouts as wireframes, inserted with clearly marked placeholder copy).
- **Canvas** (centre) — the slide at the largest size that fits (or 50 / 100 %), a caption with kind · layout · surface,
  the zoom and a findings badge (click: the panel's Checks). One wheel gesture = one slide. Overflowing text has a red
  outline. In edit mode the canvas takes clicks, drags, double-clicks and dropped image files.
- **Panel** (right), top to bottom: **Brand** (the brand's colours, fonts, the Mood drawer), **Element** (edit mode: the
  selection — see §3), **Checks** (this slide's findings with Fix buttons; above the Slide group when the slide has
  warnings), **Slide** (layout variant, surface, decor and logo on / off, reset slide) and **Type** (the font pair, when the
  brand gives alternatives).

## 2. View mode and edit mode

The Studio opens in **view mode**: arrows / PageUp / PageDown / `[` / `]` step slides, `G` shows the deck as a grid, the
panel's Slide group switches layout / surface / decor / logo (each a command, undoable). Press `E` (or the Edit button) for
**edit mode**: the canvas becomes editable — click selects, the selection is outlined in blue with handles, and the panel
grows the Element group. `E` again (or the button) leaves it. Undo / redo work in both modes.

## 3. Editing (everything P4.1–P4.4 built)

**Select.** Click an element; Shift-click adds or removes; `⌘A` selects every editable element of the slide (not hidden,
not locked, not the background); Tab / ⇧Tab walk the elements in z order (from the last selected); Esc clears; a click
on the empty canvas around the slide clears too. Groups (a chart, a table, a flow's items) select as one;
double-click enters a group (its children then select one by one, a dashed outline shows the group, Esc leaves it).
Inside a group a Shift-click on something outside it is ignored: a selection never mixes levels.

**Move.** Drag. The selection snaps (6 px on screen at any zoom) to the margins, the title zone, the brand's grid
columns, the canvas centre and the other elements' edges and centres, and to the position with **equal gaps** between two
neighbours; a blue line shows each snap, a magenta measure shows the distance to the element you lined up with (or the
two equal gaps). Alt switches snapping off; Shift keeps the move on one axis. A multi-selection moves and snaps as one
box and stays on the canvas as one box (the elements keep their places to each other). Arrow keys nudge 1 px, ⇧ 10 px
(a burst of nudges is one undo step). Frames are kept on the canvas, never pushed inside the margins — the margins
check warns instead, with a Fix.

**Resize.** One element: the 8 handles; the dragged edge snaps to the same targets as a move (with the distance); Shift
keeps an image's aspect; text re-fits live while you drag (the fitter, never a crop) and the fitted result is committed
on release. Several elements: the selection's box gets 4 corner handles (no edge handles) and every frame scales in
proportion (Shift keeps the box's aspect), text re-fitted the same way.

**Align and size.** With 2 or more selected: align left / centre / right / top / middle / bottom to the selection's box,
distribute horizontally / vertically (3 or more), match width / height (to the first selected). With 1 selected: align
to the content frame (inside the margins). The frame fields (X, Y, W, H) take exact numbers.

**Lock, hide, reset.** Lock (`⇧⌘L`) keeps an element where it is: it stays selectable but is left out of every move,
nudge, align, distribute, match and resize — the panel says how many of the selection are locked. Hide (`⇧⌘H`, Delete or
the Hide switch) takes the selection off the slide in one undo step; a hidden element is not painted, cannot be
selected and leaves the selection; the panel's *Hidden on this slide* list brings one back (Show) or all (`⇧⌘H` with
nothing selected). **Reset element** drops the selected elements' overrides; **Reset slide** drops every override of
the slide.

**Text.** Double-click a text (or Enter with one selected) to edit it in place, in its own font, size and colour. Enter =
new paragraph (where the field takes paragraphs), ⇧Enter = line break, `⌘B` / `⌘I` bold / italic, `⌘K` link, `⌘↵` or a
click outside = done, Esc = cancel. A counter under the text shows its length against the field's design range (orange
over it, red far over it). Text the layout makes (step numbers, initials) is not editable: a tip says why.

**Images.** Select an image: **Replace** (a file picker), fit *cover* / *contain*, **Focal point** (drag the crosshair:
the crop follows on every resize), alt text, caption. Drop an image file on the canvas: it replaces the image under the
pointer, or adds an image block when the slide shows none.

**Charts and tables.** Select a chart: the panel's **Data** tab has the type, unit, highlight, the text fields and a
categories × series grid (add / remove rows and columns; Enter goes down, Esc reverts). Double-click a table cell to edit
it in place (Tab / ⇧Tab / Enter move on); the Data tab has title, row header, highlight column, column alignment,
add / remove rows and columns and a per-cell type (text, heading, number, check, rating, chip, image, logo).

**Flow items** (items, points, KPIs, process, timeline, people, logos, compare). Select a node: its fields in the
Element group, **+ Before / + After / Remove / ↑ ↓** within the block's node range, or drag its ⠿ handle onto another node.

**Slides.** Filmstrip drag, the context menu, `⌘D` duplicate, Delete (in the filmstrip) delete, `⌘↑` / `⌘↓` move, hide
(a hidden slide stays in the Studio, dimmed, and is left out of an export). Layout swap keeps the content; it drops the
slide's element overrides (the boxes changed) with a notice.

**Checks.** Every compose runs the checks. The panel lists this slide's findings; a finding with a fix has a **Fix**
button (`refit`, `move-inside`, `snap-colour`, `reset`) — the fix is a command like any other (undoable).

## 4. Keyboard

`?` shows this list in the Studio (generated from the same map). ⌘ is Cmd on a Mac and Ctrl elsewhere. Keys of the Studio,
edit mode and the filmstrip never fire while you type in a field (an input, the inline text, a grid cell); the inline and
grid keys are the keys of those fields. The source is `packages/ui/src/studio/keys.js` — the tables below are generated
from it (`shortcutsMarkdown()`) and a unit test checks that they match.

**Studio (view and edit mode)** (`view`)

| Keys | Action | Id |
| --- | --- | --- |
| `E` | Edit mode on / off | `edit-mode` |
| `G` | The deck as a grid on / off | `grid-view` |
| `⌘Z` | Undo | `undo` |
| `⇧⌘Z` | Redo | `redo` |
| `← / ↑ / PageUp` | Previous slide (edit mode: when nothing is selected) | `prev-slide` |
| `→ / ↓ / PageDown` | Next slide (edit mode: when nothing is selected) | `next-slide` |
| `[` | Previous slide | `prev-slide` |
| `]` | Next slide | `next-slide` |
| `Home` | First slide | `first-slide` |
| `⌘← / ⌘↑ / ⌘PageUp` | First slide | `first-slide` |
| `End` | Last slide | `last-slide` |
| `⌘→ / ⌘↓ / ⌘PageDown` | Last slide | `last-slide` |
| `?` | This list of shortcuts | `shortcuts` |
| `Esc` | Close the drawer, the grid or this list | `close` |

**Edit mode (the canvas)** (`edit`)

| Keys | Action | Id |
| --- | --- | --- |
| `Esc` | Leave focal mode or the group, else clear the selection | `escape` |
| `↵` | Edit the selected text inline (a table: its first cell) | `inline-edit` |
| `Tab` | Select the next element | `next-element` |
| `⇧Tab` | Select the previous element | `prev-element` |
| `← / → / ↑ / ↓` | Nudge the selection 1 px | `nudge` |
| `⇧← / ⇧→ / ⇧↑ / ⇧↓` | Nudge the selection 10 px | `nudge-10` |
| `⌘A` | Select every editable element (not hidden, locked or background) | `select-all` |
| `⇧⌘L` | Lock / unlock the selection | `lock` |
| `⇧⌘H` | Hide the selection (nothing selected: show the hidden ones) | `hide` |
| `Del / ⌫` | Hide the selection (one undo step) | `hide-selection` |

**Filmstrip (a slide row focused)** (`filmstrip`)

| Keys | Action | Id |
| --- | --- | --- |
| `⌘D` | Duplicate the slide | `duplicate-slide` |
| `Del / ⌫` | Delete the slide | `delete-slide` |
| `⌘↑` | Move the slide up | `move-slide-up` |
| `⌘↓` | Move the slide down | `move-slide-down` |

**Inline text** (`inline`)

| Keys | Action | Id |
| --- | --- | --- |
| `⌘↵` | Done (commit the text) | `inline-commit` |
| `Esc` | Cancel the edit | `inline-cancel` |
| `↵` | New paragraph | `inline-paragraph` |
| `⇧↵` | Line break | `inline-break` |
| `⌘B` | Bold | `bold` |
| `⌘I` | Italic | `italic` |
| `⌘K` | Link | `link` |

**Table cells and the data grid** (`grid`)

| Keys | Action | Id |
| --- | --- | --- |
| `Tab` | Commit, next cell | `cell-next` |
| `⇧Tab` | Commit, previous cell | `cell-prev` |
| `↵` | Commit, the cell below | `cell-down` |
| `Esc` | Cancel the cell edit | `cell-cancel` |

## 5. The document model

What you edit and save is **your content plus your overrides; the Deck is always derived**. The content is a JSON
document, `content/<deck>.content.json` (schema content/2: slides with their blocks — titles, paragraphs, items, charts,
tables, images…); text, data, slide and node edits change it. Your design departures — a slide's surface / layout /
decor / logo, an element's frame, lock, hidden, colour, an image's fit or focal point, the deck's font pair — are kept per
brand in `content/overrides/<deck>.<brand>.json`, keyed by slide and element id, and applied after compose (a text whose
frame changed is re-fitted there). Switching brand shows the same content with that brand's Mood and that brand's
overrides.

A Markdown deck (the golden showcase, `content/*.md`) is an import and stays read-only: the first edit opens **Save as a
copy**, which writes `content/<name>.content.json` (and copies the deck's overrides and history per brand) and makes the
edit there. Every change autosaves (debounced); the top bar shows "Saved" when content, overrides and history are on
disk. The Mood itself is never edited in the Studio: it is the brand's derived design.

## 6. Uploads and export

**Uploads.** An image you add is uploaded to the server (png, jpg, webp, gif, svg — checked by its bytes — up to 20 MB) and
saved as `content/assets/<deck>/<sha12>-<name>`; the content names it by that repo-relative path. Nothing is written into
a brand folder. A Markdown deck takes no upload (save a copy first, then add the image again).

**The rule for where an upload is found** (P4.4): the export base of a deck is the brand folder — the same base every brand
asset and font is named from — so the composed deck names an upload from there: `../../../content/assets/<deck>/<file>`
(from `golden/brands/<brand>/`). Every page resolves it with that one rule: the Studio canvas (base `/files/brands/<brand>/`
→ `/content/assets/…`), the exported `deck.html`, PDF and PNGs (base = the brand folder as a `file://` path relative to the
export folder) and the exported `deck.html` opened through the server (`/files/out/…` → `/files/content/assets/…`). The
`assets` check knows uploads are files of the deck: a missing upload is a finding, not a silent blank.

**Export.** Top bar → Export: PDF, PNG (one per slide + a contact sheet), HTML, written to
`out/<brand>/studio/<deck>/` (deck.json, checks.json, overrides.json, deck.html, deck.pdf, slides/NN.png, sheet.png) from the
derived Deck with your overrides; hidden slides are left out. A deck with warnings exports (warnings never block). PPTX
comes with P5.

## 7. Undo and history

Every change is a command with its inverse in one log per deck and brand: `⌘Z` / `⇧⌘Z` (or the top bar buttons). One
gesture is one step — a drag, a resize, a burst of nudges, a text commit, a grid edit, a multi-selection hide, a Fix.
After an undo the Studio shows the slide the command was on. The log (the last 200 commands) is saved in
`content/history/<deck>.<brand>.json` (git-ignored, per user), so a reload keeps undo. The server never undoes: it only
re-composes the state it is given.

## 8. Limits (2026-11-02, after P4.4)

- Charts and tables move and resize, but a chart's / table's own texts edit in place only where the layout took them from
  the content; a path shape keeps its drawing size; a child's frame override inside a group is absolute.
- A stored frame is clamped to the canvas on every compose (the stored value may differ from the painted one); the client
  clamps a multi-selection as one box, the server still clamps each element on its own.
- Hide / show a slide is a per-brand override (the content schema has no slide key for it); image fit and the focal point
  of non-block images are element overrides.
- Element overrides stay with a node's position after a node add / remove / reorder; a layout swap drops them.
- `⌘K` asks for the link in a browser prompt; uploads are sent base64 (20 MB cap); an upload on a Markdown deck must be
  repeated after Save as a copy.
- Equal-spacing snapping is between two neighbours (the moving box between them), not to repeat a gap elsewhere;
  multi-selection resize keeps the aspect only with Shift and has no edge handles.
- Shortcuts are fixed (no remapping); `⇧⌘H` / `⇧⌘L` may be taken by the browser or the OS on some systems — the panel's
  Hide / Lock switches do the same.
- The e2e suite runs one brand (stripe) and one deck; it needs the git-ignored brand input and Chrome.
