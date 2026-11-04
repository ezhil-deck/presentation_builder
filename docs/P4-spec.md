# P4 — the editor on the Studio shell (spec, proposal 2026-11-02)

Status: **approved by the owner 2026-11-02 ("Approve, start P4.1")**; built in the order of §8. Scope = decision 15 (PLAN-draft §4b): inline text
edit + move / resize / align; slide add / delete / duplicate / reorder + layout swap keeping content; live Mood / surface /
font-pair switch; replace images, edit chart data and table cells in place; undo / redo; save / load; rule warnings with
one-click fixes. Decisions 16–18 hold: local files, single user; warn never block; present mode later (P6).
The editor is the Studio (`docs/PLAN-studio.md` §2) with editing layered on the same canvas and panel: nothing is a
second screen, and the renderer that paints the deck is the renderer the designer edits on.

## 1. The document (what is edited and saved)
The Studio already derives every deck: `Content + Mood + overrides → Deck` on the server in ~10 ms. The editor keeps
that: **the saved document is the content plus the designer's overrides; the Deck is always derived** (this is the
"one source of truth" of PLAN-draft §2.3b made precise - the Deck is what is exported and shown, never hand-edited).
- `content/<deck>.content.json` — the content (schema content/2). A Markdown file is the *import*: opening a `.md` deck in
  the editor parses it once into this JSON; from then on the JSON is the document (Markdown stays as it was; "export as
  Markdown" is a later, lossy feature). The showcase stays Markdown and is never edited in place (a designer who edits it
  gets a copy under `content/`).
- `content/overrides/<deck>.<brand>.json` — per brand: the slide overrides the Studio has today (surface, layout, decor,
  logo) **plus element overrides** keyed by element id: `{ frame?, locked?, color?, hidden? }`. Element overrides are applied
  after compose; a text whose frame changed is re-fitted in the new frame (the fitter, never a crop).
- Every change is a **command** (`{ type, args, inverse }`) on content or overrides; the client keeps the log for undo /
  redo and sends the resulting content / overrides to the server, which re-composes and returns the Deck + checks. A
  command never touches the Deck directly, so rules re-run on every edit (decision 17: they warn, with a fix, never block).

## 2. Editing on the canvas
- **Selection**: click selects an element (outline in the UI accent + 8 handles; the filmstrip keeps slide selection);
  shift-click multi-selects; Esc clears; Tab cycles elements in z order; a selected element's slot / role / frame show in
  the panel's new **Element** group. Groups (chart, table, flow items) select as one; double-click enters a group.
- **Move / resize**: drag moves (snapping to the margins, the title zone, the grid columns and other elements' edges,
  with guide lines; Alt disables snapping; Shift constrains to one axis), handles resize (Shift keeps the aspect for
  images, text re-fits live during the drag with the fitted result committed on release), arrow keys nudge 1 px (Shift:
  10). Frames are clamped to the canvas, never to the margins - the margins check warns instead.
- **Align / distribute**: with ≥ 2 selected: left / centre / right / top / middle / bottom, distribute horizontally /
  vertically, match width / height; with 1 selected: align to the content frame.
- **Lock / hide** per element; **reset** (drop the element's overrides) and **reset slide** (drop all its overrides).
- **Inline text**: double-click a text element → a contenteditable overlay in the element's exact font, size, line height
  and colour (the browser edits; the fitter lays out on commit). Enter = new paragraph, Shift+Enter = line break,
  Cmd+B / I = bold / italic runs, Cmd+K = link; Esc cancels, blur or Cmd+Enter commits → the content block field is
  updated (title, subtitle, label, a node's heading / body / value, a quote, a paragraph…) → re-compose → re-fit. The
  editor shows the field's design-intent range (`BLOCKS`) as a count under the overlay and a warning when exceeded.
- **Images**: select → replace (file picker → copied to `content/assets/<deck>/`, referenced by content), fit mode
  (cover / contain), focal point drag inside the frame, alt text; drop a file on the canvas → replaces the image under
  the pointer, or adds an `image` block when the slide has none.
- **Charts**: select → the panel's Data tab: a small grid (categories × series) with add / remove row / column, series
  names, chart type, highlight, unit, text fields (title, axis titles, source); every change re-composes the chart.
- **Tables**: cells edit inline (Tab / Shift+Tab move, Enter down); row / column add / remove from the panel; cell type
  (text / heading / number / check / rating / chip) from a small menu; highlight column and row header toggles.
- **Flow items** (items, points, kpis, process, timeline, people, logos, compare): add / remove a node from the panel
  (within the block's node range), reorder by drag inside the group, edit fields inline.

## 3. Slides and deck
- Filmstrip: drag to reorder; context menu add / duplicate / delete / hide; `+` between slides → a picker of slide kinds
  with a sample of each (the catalogue's layouts as wireframes, with the block types they take); a new slide gets the
  block skeleton with short placeholder text that is clearly placeholder (never exported silently: a check lists
  placeholder text left in the deck).
- Layout swap keeps content (the Studio's picker; element overrides are dropped on a swap with a notice, since the
  boxes change). Surface, decor and logo per slide as today.
- Brand switch (today), font-pair switch when the brand defines alternatives, and a **Mood tweak** panel is NOT in P4:
  the Mood stays the brand's derived decisions; a designer's departures from it live in overrides.
- Save = the content JSON + overrides files (autosaved on every command, debounced; a "saved" state in the top bar);
  Open = any `content/*.content.json` or `.md`; Export = PDF / PNG (today) and PPTX (P5) from the derived Deck.

## 4. Rules while editing (decision 17)
The checks run on every compose and come back with the Deck; the panel's Checks group lists this slide's items with a
**Fix** button when the item carries a `fix` command: `refit` (re-run the fitter at the role size), `move-inside` (snap
the frame into the content frame), `snap-colour` (the nearest brand colour that reaches the contrast), `reset`. Overflow
is shown as a red outline on the element and a count in the filmstrip. Nothing blocks: a deck with warnings exports.

## 5. Undo / redo and history
A client command log per document (Cmd+Z / Shift+Cmd+Z), grouped per gesture (one undo per drag, per text commit, per
data-grid edit); persisted to `content/history/<deck>.<brand>.json` (last 200 commands) so a reload keeps undo; the
server never undoes - it only re-composes the state it is given.

## 6. Server additions (packages/ui/server/studio.js)
- `GET / PUT /api/studio/content/:id` (content JSON; PUT validates against the content schema and returns the deck),
  `POST /api/studio/content/import` (a `.md` → `.content.json`), `POST /api/studio/assets/:deck` (file upload → the
  file name + size + dimensions; images only, ≤ 20 MB),
- `POST /api/studio/compose` grows `overrides.elements` (applied after compose: frame / locked / colour / hidden, text
  re-fitted); the response keeps `{ deck, warnings, checks, ms }`,
- `POST /api/studio/fix` `{ brandId, contentId, item }` → the overrides change the fix command makes (the client applies
  it as a command, so it is undoable).

## 7. Decisions (confirmed with the spec, 2026-11-02)
- **ED-1** The document is content JSON + overrides; the Deck is derived and never hand-edited (PLAN-draft §2.3b precise).
- **ED-2** Text and data edits write to the content JSON; Markdown is an import only (export to Markdown later, lossy).
- **ED-3** Element overrides are per element id and survive re-compose while the slide keeps its layout; a layout swap
  drops them with a notice.
- **ED-4** Edits never bypass the rules: every change re-fits, re-checks and reports; fixes are commands, not silent.
- **ED-5** Uploaded assets live under `content/assets/<deck>/` (local, single user); nothing is written into a brand folder.
- **ED-6** No Mood editing in P4 (a brand's derived decisions stay the brand's); the Studio's overrides are the designer's
  departures.

## 8. Order of work (≈ 4 weeks, each step reviewed in the Studio)
1. **P4.1** Selection, move / resize / nudge / align, lock / hide / reset, element overrides end to end, undo / redo with
   persistence, Checks fixes. *(≈ 1 week)*
2. **P4.2** Inline text with re-fit, content JSON document + Markdown import, autosave, slide add / duplicate / delete /
   reorder, the slide-kind picker. *(≈ 1 week)*
3. **P4.3** Images (replace, fit, focal), chart data grid, table cell editing, flow-item add / remove / reorder, font-pair
   switch. *(≈ 1.5 weeks)*
4. **P4.4** Snapping polish, keyboard map, multi-select edge cases, placeholder check, browser e2e tests (puppeteer
   driving the Studio: select, drag, type, undo, export) and docs. *(≈ 0.5 week)*

## 9. Status
- **2026-11-02 P4.1 built**: edit mode (`E`) on the Studio canvas - selection with counter-scaled handles, shift
  multi-select, Tab cycling, group entry; drag with snapping guides (content frame, title zone, grid, element edges; Alt
  off, Shift one axis), resize with live re-fit (preview compose every ~50 ms, one command on release), arrow nudges
  grouped per pause; Element panel (frame fields, lock, hide, reset element / slide, align, distribute, match size);
  Fix buttons on check items (`refit`, `move-inside`, `snap-colour`, `reset`); overflow outlines + filmstrip counts; undo /
  redo (⌘Z / ⇧⌘Z) grouped per gesture and persisted in `content/history/<content>.<brand>.json`; slide overrides also go
  through the command log, a layout change drops the slide's element overrides with a notice. Engine:
  `compose/overrides.js` (`applyElementOverrides`: frames clamped to the canvas, text re-fitted in the new frame, shapes
  and groups scaled, `locked` / `hidden` / `color`; `paintedDeck` drops hidden elements) and `compose/fixes.js`
  (`fixCommand`). Deck schema v1.3 adds `hidden`. 2,435 tests; golden decks byte-identical.
  Limits: charts and tables move but keep their size until P4.3 (their geometry needs the content block); a path shape
  keeps its drawing size; a child's frame override inside a group is absolute; handles show for a single selection only;
  a stored frame is clamped on every compose (the stored value may differ from the painted one).
- **2026-11-02 P4.2 built**: the content document (`content/<deck>.content.json`, `GET/PUT /api/studio/content/:id`,
  `POST …/import`; every Markdown deck is read-only and the first edit offers "Save as a copy", which also copies the
  deck's overrides and history per brand; autosave debounced 400 ms, the top bar's saved state covers content + overrides
  + history); content commands (setField, setParagraphs, add / duplicate / delete / move slide, setSlideKey) in the same
  undo log; inline text (double-click or Enter: a contenteditable overlay within 0.2 px of the painted lines in the
  element's exact font; Enter / Shift+Enter / ⌘B / ⌘I / ⌘K; the `BLOCKS` length counter, orange over the range, red
  over 1.5×; chart / table text deferred to P4.3); filmstrip drag-reorder, context menu, `+` between rows, New slide,
  ⌘D / Delete / ⌘↑ / ⌘↓; the slide-kind picker (catalogue layouts grouped by tag, wireframe + block types, inserts a
  skeleton with placeholder copy); the `placeholder` check (info; an editor check the Studio always runs - `pb build`
  keeps its 14). Panel: Checks above Slide when the slide has findings, count badge, layout picker collapsed, findings
  badge on the canvas caption (the owner's "where is the Fix button?"). Engine: every bound text element carries
  `source {path, paths?, join?}` (a JSON pointer into the content slide; deck schema v1.4; golden decks re-snapshotted
  for that key only). 2,473 tests.
  Limits: hide / show a slide is a per-brand slide override (`hidden`, the content schema has no slide key for it); ⌘K
  uses a prompt; a ✓ / button prefix on an edited row stays in the content; undoing a content command from another
  brand's history restores the whole slide; a content command re-composes ≈ 430 ms later ("Saving…").
- **2026-11-02 P4.3 built**: images (Replace → `POST /api/studio/assets/:deck`, base64 JSON, png / jpg / webp / gif /
  svg checked by header bytes, ≤ 20 MB, saved as `content/assets/<deck>/<sha12>-<name>`; fit cover / contain, a focal
  crosshair → `crop` recomputed on resize, alt, caption; drop a file on the canvas); charts (a Data tab: type, unit,
  highlight, text fields, a categories × series grid with add / remove; charts and tables re-lay out with their frame,
  live while resizing); tables (double-click a cell for inline edit, Tab / Enter across; Data tab: title, subtitle, row
  header, highlight column, per-column align, add / remove row / column, per-cell type menu); flow nodes (fields in the
  Element group, + Before / + After / Remove / ↑ ↓ within the `BLOCKS` range, drag the ⠿ handle to reorder); font pair
  (`type.pairs` in the Mood when the brand gives `typography.pairs` - no golden brand does, so the switch shows "This
  brand defines one pair" and is tested with a fixture; a deck-level `{ fontPair }` override, `@pb/mood` `applyFontPair`).
  Sources on charts, tables, images and flow parts (deck schema v1.4 unchanged, golden decks re-snapshotted for those
  keys). Schemas: brand-spec v1.3, mood v1.4 (`pairs`). Bugs found in the browser check and fixed: the `assets` check
  on uploaded files, the focal drag ignoring the centred cover crop, grid inputs locked during a compose. 2,529 tests.
  Limits: image `fit` and the focal point of non-block images are element overrides (the content schema has no field);
  uploaded files are referenced relative to the brand folder (`../../../content/assets/…`) and export with an upload is
  not yet run end to end; base64 upload only; an upload on a Markdown deck opens "Save as a copy" and must be repeated;
  element overrides stay with a node's position after add / remove / reorder.
- **2026-11-02 P4.4 built**: snapping polish (the canvas centre and other elements' centres, an equal-spacing snap between
  two neighbours with its two gaps shown, the dragged edge of a resize snapping to the targets of a move, a threshold of
  6 px on screen at every zoom (`snapThreshold(scale)`: the canvas scale reaches the editor through the pointer-down), a
  magenta distance label when a snap lines up with another element or with equal gaps; Alt off, Shift one axis); the
  keyboard map `packages/ui/src/studio/keys.js` (every Studio / editor key as data: key, modifiers, scope view / edit /
  filmstrip / inline / grid, label, action; one `matchKey(e, scope)`, ⌘ = Cmd or Ctrl, no view / edit / filmstrip key
  while a field has the focus) used by the Studio, the editor, the inline editor, the data grid, the filmstrip and the
  focal layer; new keys ⌘A, ⇧⌘L, ⇧⌘H, Delete (hide the selection), `[` / `]`, `?` (the Shortcuts overlay, generated from
  the map); multi-select rules (hidden elements never selectable and dropped from the selection, the panel's "Hidden on
  this slide" with Show; locked elements kept in the selection but out of every move / nudge / align / distribute / match
  / resize, "n locked" in the panel; a drag clamps and snaps the moving group as one box; multi-selection resize from 4
  corner handles, each frame scaled, text previewed through compose; Tab from the last selected; Delete = one undo step;
  undo of a multi-move = one step; the selection pruned on re-compose; a click on the empty canvas clears; a Shift-click
  outside an entered group refused). Uploaded-asset export run end to end (real puppeteer render: the PNG shows the
  uploaded pixels, the PDF embeds the image, deck.html resolves it): one rule - an upload is named from the brand folder
  (the export base) as `../../../content/assets/…` - and the server now serves `/files/content/assets/` (where an exported
  deck.html under `/files/out/` resolves it; it was a 404). `server.js --root <dir>` (a data root; the UI / CLI stay the
  checkout's) and the browser e2e suite (`npm run test:e2e`, `jest.e2e.config.cjs`, puppeteer on a sandbox: select, drag,
  Fix, undo / redo, the overlay, Delete, inline text → Save as a copy, export). Designer guide `docs/STUDIO.md` (its key
  tables generated from keys.js and tested). Bugs found and fixed: a Shift-click outside an entered group mixed levels in
  the selection; Tab selected hidden elements; a multi-selection dragged past the canvas edge was clamped per element by
  the server (the elements lost their places to each other); an exported deck.html opened through the server lost its
  uploaded images. 2,561 unit tests + 8 e2e.
  Limits: equal spacing is between two neighbours only (no "repeat this gap" elsewhere); the server still clamps each
  stored frame on its own (the client clamps a group as one box, so the stored frames agree); a multi-selection resize
  has no edge handles and keeps the aspect only with Shift; shortcuts are not remappable and ⇧⌘H / ⇧⌘L may be taken by
  the browser or the OS (the panel's Hide / Lock do the same); the e2e suite covers one brand (stripe) and one deck and
  needs the git-ignored brand input and Chrome; the export test checks the PDF by its embedded image (no PDF rasteriser
  in the repo).
  Test stability (2026-11-02, after the suite-level flake: a hung PNG export left `.pb-export-*.html` in the repo's
  renderer fixtures and failed the next run): the export writer never writes into `basePath` - its temporary HTML lives
  in its own temp dir with `<base href="file://<basePath>/">` injected first in the head (`injectBase`), removed on
  success, failure and timeout alike; `goto` 30 s, `document.fonts.ready` 15 s, a 60 s puppeteer protocol timeout, a
  bounded `browser.close()` with SIGKILL of Chrome's pid as the last resort. Every Chrome the tools launch for a render
  goes through `@pb/export` `withBrowser` (the PDF / PNG writers, `renderOutputs`, the contact / compare / diff sheets),
  which holds a cross-process lock (`packages/export/src/lock.js`, `<tmpdir>/pb-chrome.lock`: one Chrome at a time
  across jest workers; a lock older than 5 min or whose holder pid is gone is taken over). The export test exports from
  a temp copy of the fixtures. Cost: the full suite takes about 24 s instead of 14 s (the Chrome tests wait for each
  other). Not fixed: rare jest worker SIGSEGVs in V8's garbage collector (Node 24.12, any suite, seen since 2026-10-31).
- **Next**: P5 - the PPTX writer (native, editable boxes from the same Deck; HTML and PPTX must agree). P4 follow-ups
  (not scheduled): "repeat this gap" spacing snaps, a content-schema key for slide hide (today a per-brand override),
  focal / fit of non-block images in the content, element overrides that follow a node through add / remove / reorder,
  multipart upload instead of base64, an e2e run per golden brand.

