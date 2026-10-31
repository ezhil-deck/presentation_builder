# P3 — Checks, visual diff, review UI (spec, 2026-10-31)

Phase goal (PLAN-draft §3): a CHECK report over every build, a visual diff, design-quality rules as checks, and the local
web UI (decision 14: "CLI in P1–P2, local web UI in P3") in which the owner reviews the showcase decks of the golden set
and signs them off as "good enough to send". The editor (P4) is built on the same UI and the same in-browser renderer.

Ground rules apply unchanged (CLAUDE.md): no AI; a check names the brand signal it reads and is **skipped** (status
`skip`, with the reason) when the brand gives none - it never invents a threshold; every check has a unit test and a
negative test; checks warn, they never block a build (only contract failures fail: invalid deck, missing files, unanswered
blocking questions). Nothing in P3 changes a deck: a design finding that needs an engine change becomes a proposal
(docs/P3-proposals.md), rendered before/after for the owner.

## A. `@pb/checks` — the report

`runChecks({ brandSpec, mood, deck, files? }) → Report`. Pure and deterministic (sorted keys, stable order). `files` is
optional `{ exists(relPath) → boolean }` resolved against the brand folder; without it, file checks are `skip`.

### A.1 Report v1
```
{
  kind: 'Report', version: '1.0.0',
  brandId, deckId, engineVersion,
  summary: { checks, pass, warn, fail, skip, items: { fail, warn, info } },
  results: [ { id, title, status: 'pass'|'warn'|'fail'|'skip', signal, reason?, count, items: [ item ] } ]
}
item = { severity: 'fail'|'warn'|'info', slide?: id, index?: 1-based, elementId?, message, data?, fix? }
fix  = { command, args }      // a command the P4 editor can apply (refit, snap-colour, move-inside, …); optional
```
A result's `status` = the worst item severity (`fail` > `warn` > `pass`; `info` items alone = `pass`). `signal` names the
Mood / BrandSpec field(s) the check read (e.g. `mood.geometry.margins`); `reason` is given when `skip`.

### A.2 Checks (id — rule — signal — item severity)
1. `schema` — the deck validates against schemas/deck.schema.json — none — fail.
2. `questions` — no unanswered **blocking** question in `brandSpec.questions` (optional ones → info) — brand questions — fail / info.
3. `assets` — every `image.asset` / `image.animated` / `background.asset` id exists in `deck.assets`, and (with `files`) its
   file exists — deck.assets — fail. Logo variants named by `mood.logo.variants` with a missing file → fail.
4. `fonts` — every `text.font.family` used is in `deck.fonts` with ≥ 1 file; a weight used by an element that no file of
   the family declares → warn ("measured with the <w> face"); families with no files → fail — deck.fonts — fail / warn.
5. `overflow` — no `text.fit.overflow`, no table cell overflow (`el.warnings[].check === 'overflow'`) — fitter output — warn
   (fix: `{command:'refit'}`).
6. `min-size` — `text.fit.appliedSize ≥ mood.type.roles[role].fit.min` for its role; when the brand gives an absolute floor
   (`brandSpec.accessibility.minFontSize`, the brand-spec schema's field) also ≥ that — role fit.min — warn.
7. `margins` — every element frame lies inside the content frame (canvas inset by `mood.geometry.margins`), except roles
   that are allowed outside: `decor`, `background`, `band`, `logo`/`footer` when `mood.footer.position` / `mood.logo.position`
   places them in the margin, and full-bleed image slides (`kind === 'image'`); an element partly outside → warn with the
   overshoot per side (fix: `{command:'move-inside'}`) — geometry.margins — warn.
8. `contrast` — every text element against the colour behind it: the slide background (solid), the gradient's stops
   (worst), the overlay when an image background has `overlay`+`overlayOpacity` (blend over the overlay colour; without an
   overlay an image background → skip item with reason "image background"), or the nearest shape/rect with a solid `fill`
   whose frame contains the text frame and whose `z` is lower. Threshold: WCAG — 4.5:1 below 24 px (18 pt) regular / 18.66 px
   bold, 3:1 at or above (the brand's own `accessibility.minContrastBody` / `minContrastLarge` win when given) — surfaces +
   accessibility — warn
   (fix: `{command:'snap-colour', args:{role}}`). The compose-time `contrast` info warnings are not repeated.
9. `text-overlap` — two text elements of one slide whose frames intersect by more than 2 px on both axes (ignoring
   decor / background / group containers) → warn — none (geometric) — warn.
10. `logo` — on each slide whose kind `mood.logo.perKind` names, a logo element exists; its height ≥ the brand's
    `logo.height[size]` when given (else skip that item); it does not intersect any text / image element by more than
    `mood.logo.clearSpace` — logo.perKind / height / clearSpace — warn.
11. `decor` — decor elements appear only on slides their `allowedOn` lists, only on surfaces their `surfaces` list names
    (when given); a decor with `frequency: 'always'` missing on an allowed slide → warn; a decor intersecting a text element
    on the `front` layer → warn (the compose-time `decor-overlap` info is folded into this check's items, not duplicated) —
    decor.elements — warn.
12. `variety` — when `mood.palette.rhythm` has ≥ 2 distinct surfaces: the content slides (not cover / section / cta) use
    ≥ 2 distinct `surfaceId`s, and no run of more than `rhythm.length + 1` consecutive content slides shares one surface;
    when the brand has one surface only → skip ("the brand gives one surface") — palette.rhythm — warn.
13. `empty-space` — for text / bullets / two-column / image-text / quote slides: the union of text + image + chart +
    table boxes covers < 35 % of the content frame → info (a report line for the owner; PR-5 territory, no fix) — geometry
    + layout — info.
14. `compose` — every `deck.warnings[]` entry not already represented by a check above, grouped by its `check` id as
    items (severity: the warning's severity, `error`→fail) — deck.warnings — mixed.

Every item carries `slide`, `index` and `elementId` when it is about one element. Messages are one sentence, literal
values included (`"#50617A on #FFFFFF is 3.9:1 (needs 4.5:1 at 22 px)"`).

### A.3 Where it runs
- `pb build` writes the report into `report.json` → `checks` (replacing the stub) and prints a one-line summary
  (`checks: 12 pass, 2 warn, 0 fail, 1 skip`). Exit code unchanged (checks never fail the build).
- `pb check <out-dir | brand-dir>` runs the checks on an existing `out/<id>/` (reads brand-spec / mood / deck.json;
  `files` from the brand folder when it can be found: `deck.source.brandId` under golden/brands or `--brand <dir>`) and
  writes `checks.json`; `--json` prints it.
- Golden: `packages/checks/__tests__/golden.test.js` runs the checks on every `golden/expected/<id>/deck.json` and asserts
  **no `fail` result** (warn is allowed; the counts are not snapshotted, they are reviewed in the UI).

## B. `pb diff` — JSON + visual diff
`pb diff <dirA> <dirB> [--out <dir>]` compares two build folders (default out = `<dirB>/diff/`; when that would land inside
`golden/expected/`, `<dirA>/diff/` with a note - snapshots are never written into; two snapshots need `--out`):
- JSON: per slide, elements added / removed / changed (which keys differ, old → new for scalars; frames and `text.fit`
  summarised), plus deck-level changes (fonts, assets, engineVersion). `diff.json` + a Markdown `DIFF.md` summary.
- Pixels: for every `slides/NN.png` present in both, `pixelmatch` (threshold 0.1) → `diff/NN.png` (the diff mask) and the
  changed-pixel share; a slide with > 0.1 % changed pixels is listed. A contact sheet `diff.png` (before | after | mask) of
  the changed slides via `compareSheet`-style rendering (puppeteer, local only).
- `pb diff out/<id> golden/expected/<id>` works too (JSON only: snapshots carry no PNGs).
- CI stays JSON-only (no Chrome, no PNG goldens in git: decision P3-D1 below).

## C. The review UI (`@pb/ui`, port 8100) — read-only review, the base of the P4 editor
A local single-user web app: `npm run dev:ui` (webpack dev server + the API) or `npm run serve:ui` (built `dist/` + API).
No framework server: `packages/ui/server.js` on `node:http` (port 8101 for the API in dev, proxied by webpack-dev-server;
in serve mode one port, 8100, serves both).

### C.1 Server API (JSON; every path is relative to the repo: no absolute paths leave the server)
- `GET /api/brands` → `[{ id, out: bool, input: bool, report: summary|null, stale: bool, signedOff: bool }]` — `out/<id>/`
  folders and `golden/brands/<id>/` inputs; `stale` = the input file's sha256 ≠ `brand-spec.input.sha256` of the build.
- `GET /api/brands/:id/{brand-spec,mood,deck,report,questions,checks,review}` → the JSON files of `out/<id>/`
  (404 when absent; `review` = `out/<id>/review.json`, `{}` when absent).
- `GET /api/brands/:id/diff` → the JSON diff of `out/<id>/deck.json` vs `golden/expected/<id>/deck.json` (B's JSON part,
  imported from `@pb/cli`).
- `GET /files/out/<id>/...` and `GET /files/brands/<id>/...` → static files (slides PNG, assets, fonts) with correct MIME;
  paths are normalised and must stay inside those two roots.
- `POST /api/brands/:id/build` `{ png?: bool }` → spawns `node packages/cli/bin/pb.js build golden/brands/<id> [--png]`
  (one build at a time per brand; 409 while running); `GET /api/brands/:id/build` → `{ running, log: last lines, exitCode }`.
- `POST /api/brands/:id/answers` `{ pointer: value, … }` → merges into `golden/brands/<id>/answers.json` (an object of
  JSON pointer → value, the format `readInput` applies) and returns it. Nothing else under the brand folder is writable.
- `POST /api/brands/:id/review` `{ signedOff: bool, notes?: string }` → writes `out/<id>/review.json`
  `{ signedOff, notes, date (ISO), engineVersion, deckHash }`; sign-off is marked stale by the UI when `deckHash` ≠ the
  current deck's hash.

### C.2 Pages (React 18 + Tailwind 3; plain JSX; no router library: a tiny hash router)
1. **Brands** `/#/` — one row per brand: id, built / not built, stale, slides, overflow, checks (fail / warn counts),
   questions (blocking count), signed off (with date); buttons Build, Build + PNG.
2. **Brand** `/#/b/<id>` with tabs:
   - **Slides** — the deck painted **live** by `@pb/renderer`'s `Deck` / `Slide` React components (not the PNGs; a
     `<style>` from `fontFaceCss(deck, {fontBase})` + `baseCss`, `assetBase`/`fontBase` = `/files/brands/<id>/`), a 4-up
     thumbnail grid scaled with CSS transform; click → the slide large (fit to width) with the check items of that slide
     listed beside it and each item's element outlined on the canvas (an overlay box from the element frame; one colour
     per severity). Prev / next keys. A "PNG" toggle shows the exported PNG instead (when present) to compare renderer vs export.
   - **Checks** — the report: one row per result (status, id, title, signal, count), expandable to items; filter by
     status and check; an item links to its slide. Summary line at the top.
   - **Questions** — `questions.json`: pointer, question, severity, neededBy; an input per question whose value is sent to
     `/answers` (typed as JSON when it parses, else string); an "answered" badge when `answers.json` has the pointer;
     "Rebuild" after answering.
   - **Mood** — `mood.html` in an iframe (`/files/out/<id>/mood.html`), plus the Mood JSON's palette surfaces as swatches
     and the type roles as a table (from `mood.json`).
   - **Diff** — vs the golden snapshot: per slide the changed element ids and keys; "identical" when none.
   - **Report** — the build report: counts, ms, warnings table (source / pointer / message), the per-slide table.
   - A header on every tab: brand name, engineVersion, built date, stale flag, Build buttons, and **Sign-off**: a
     checkbox "Reviewed: good enough to send" + notes, saved through `/review`.
3. The UI never computes a rule itself: everything shown comes from the files the CLI wrote (deck, report, questions)
   or from the server's diff; the overlay boxes use the element frames in the deck.

### C.3 Tests
- Server: `packages/ui/__tests__/server.test.js` with a temp repo layout (out/ + golden/brands/ fixtures): brands list,
  file serving (and a path-traversal refusal), answers merge, review write, build 409 while running (spawn stubbed).
- UI: component tests with `react-dom/server` / `@testing-library/react` (add as devDependency) for the Brands table,
  the Checks table filters and the Slide overlay (frames → boxes); a smoke render of the Slides tab with a golden deck.

## D. Decisions in P3 (proposed 2026-10-31; **confirmed by the owner 2026-10-31: "Confirm P3-D1..D4"**)
- **P3-D1** PNG goldens are not committed (10 brands × 24 slides ≈ 250 files per engine change); CI diffs the deck JSON
  (already golden-tested), the pixel diff is local (`pb diff`) and in the UI.
- **P3-D2** Contrast threshold = WCAG AA sizes (4.5:1 / 3:1 at 24 px) unless the brand's `accessibility` block gives its own
  minimum; a brand that says nothing is checked against WCAG as the published standard, not a guess.
- **P3-D3** The sign-off lives in `out/<id>/review.json` (git-ignored, local) in P3; where sign-offs should be shared is a
  later decision (P3 "who uses it").
- **P3-D4** `questions` with severity blocking are a `fail` in the report even though the deck builds (the build already
  exits 2 for them); optional questions are `info`.

## E. Exit criteria (PLAN-draft §3)
Owner signs off the 10 showcase decks in the UI. Before that: every brand's report has no `fail` result (or the fail is a
missing input the owner must supply, e.g. hdfc-2 fonts), and the design findings (`warn` items) are either accepted or
turned into proposals for P3.x follow-ups.

## F. Build notes (2026-10-31, after the two implementations)
- Checks: `contentFrame` is now exported by `@pb/engine` (the checks import it). Interpretation choices recorded by the
  implementation: "behind" a text = painted earlier with z ≤ the text's; translucent fills blend over the colour beneath, over
  a photo the fill colour itself; an image with no overlay → `info` "not measured"; logo clear space counts text by its
  laid-out block (frame width × fit.height), a full-bleed image containing the logo is its backdrop; `empty-space` counts
  laid-out blocks; compose warnings fold into their check (`overflow`, `contrast`, `decor-overlap`→decor,
  `logo-clearspace`→logo, `font-metrics`→fonts), the rest into `compose`; `decor` warns per slide for a missing `always`
  element, including drawn (file-less) elements v1 never places; `fonts` = one item per family + weight; a check that throws
  = a `fail` naming the error; `pb check` always exits 0.
- First run over the 10 golden decks: no `fail` except hdfc-2 (`questions`: the two missing font files; `fonts`: Lato has no
  files). Warnings: akgmedia decor 16, bosch contrast 1 / logo 2 / variety 1, cisco logo 20 (page number inside the 26 px
  logo clear space), hdfc-2 decor 25, headspace contrast 1 / logo 1, notion contrast 1 / logo 1 / variety 2, rukko decor 17,
  shopify logo 1, stripe contrast 3, the-ken fonts 4 / contrast 12. These are the owner's review list in the UI.
- UI: imports `@pb/renderer/components` (Deck, Slide, fontFaceCss, baseCss: no react-dom/server in the bundle); Tailwind
  preflight is off so the live slides match the export; `mood.html` now references files relative to its folder (CLI
  `html.js`), so the Mood tab iframe shows fonts and logos. Extra API: `GET /api/brands/:id`, `GET /api/brands/:id/answers`;
  the brands list carries `deckHash`, `builtAt`, `reviewStale`, `answersNewer`, `building`, `checksVersion`. The Diff tab
  calls `diffDecks(golden, current)` (old → new).

