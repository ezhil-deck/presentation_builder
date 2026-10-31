# presentation_builder — brand input → mood → generated presentation

Status: **DRAFT v2 for discussion** (2026-10-30). Nothing is implemented. The three reference repos
(brand-mood-creator v5, pitchdeckdoclist, design_assets) are **knowledge and ideas only**; nothing from them is binding.

---

## 0. Decisions so far (owner, 2026-10-30)

| # | Topic | Decision |
|---|---|---|
| 1 | Input | Brand JSON (+ assets) now; other sources (brand kit, website, logo) later |
| 2 | AI | None anywhere in the pipeline; gaps are settled by a person, never guessed |
| 3 | Output | Both: a fixed showcase deck per brand **and** decks from user content |
| 4 | Stack | Same as pitchdeckdoclist (JS/JSX, React 18, webpack 5, Babel, Tailwind 3, Puppeteer, Node 24) in a completely fresh codebase |
| 5 | Renderer | **One renderer, owned by this app.** It renders slides itself and writes its own output (PDF / PPTX / images). Moods do not need to load in pitchdeckdoclist |
| 6 | Product | **Generator + editor** (amended 2026-10-30): brand in → mood + decks out, **and** slides stay editable like pitchdeckdoclist, done a better way. The one renderer is also the editor's canvas |
| 7 | Reuse | References are inspiration only. New, simpler layout + token model designed here |
| 8 | Governance | Rules live in code with unit tests; golden brands snapshot-diff in CI; owner approves per PR; one short DECISIONS.md |
| 9 | Scope | New brands only; the 4,380 corporate moods are untouched |
| 10 | Models | Fable for thinking and planning, Opus for implementation |

Superseded by 5–7: "app contract fixed", "freeze v5 and port its code". v5 is now a source of ideas and a quality baseline to beat, not code to port.

---

## 1. What the references taught us (why the new design looks the way it does)

**v5 / brand-mood-creator** — three weeks, 23.6k lines of Python, 221 rules, 7-step change process, 76–379 s per brand.
- Its two bottlenecks were (a) the conversion machinery itself and (b) rendering through pitchdeckdoclist's webpack bundle
  (full app build, Chrome on :8098, ~1,595 slides per pass, `Math.random` reseeding to get stable output).
- Its best ideas, worth re-deriving in the new model: colour roles per surface; theme from brand colours only (never pad a
  palette); font ladder sized from the font files' own metrics; footer and margin rules as plain functions; "a missing value is
  a question, not a default"; the finding that horizontal geometry is a formula of margins (95%) and only the vertical axis
  depends on text — so fit can be computed, not rendered.
- Its mistakes to avoid: rules as prose in a registry instead of tested code; building on whatever base commit is checked out;
  per-change JSON snapshots and committed proposal images (5.7 GB pilot folder); design decisions written straight into CSS
  blocks so no one can read a mood's decisions.

**pitchdeckdoclist** — shows what a slide engine needs: a slide = a preset (whole-slide layout of containers, each with a
content type, a node-count and character range), a theme (light/dark/colour surfaces as CSS variables), a font pair with a
class ladder (h1–h11, p1–p9, …), text cropping as a last resort, and a picker that scores presets by node count and
char-range fit. It also shows the cost of 14 mood files and a 5 MB template-menu per mood.

**design_assets** — 4,556 moods, but almost everything per mood is a copy; what really varies per brand is ~10 decisions
(colours, component variables, margins/footer, shapes, preset overrides, motion, logos, theme, font pair). The 1,589 common
presets and the 86 reference moods are a catalogue of layouts and looks to learn from, not a format to keep.

---

## 2. The new design

### 2.1 One sentence
A brand JSON goes in; a **Mood** (data, ~20 KB) is derived from it by tested rules; the **engine** composes slides from
content + Mood + a **layout catalogue**; one **renderer** draws them to HTML and exports PDF / PPTX / PNG; every run ends
with a real deck and a report.

### 2.2 Pipeline

```
 brand/<id>.json + assets
        │
        ▼
 [1] READ      → BrandSpec      validated, every value tagged given / derived(signal) / missing
        │                        missing → questions.json (answered by a person, re-run)
        ▼
 [2] DESIGN    → Mood           pure functions: palette per surface, type scale, margins, shape language,
        │                        component variants, decoration set, motion family, logo placement
        ▼
 [3] COMPOSE   → Deck           content (showcase.md or user outline) + Mood + layout catalogue
        │                        → slides as absolute boxes on a 1920×1080 canvas; fit computed from font metrics
        ▼
 [4] RENDER    → HTML/CSS       one React renderer; Puppeteer for PDF / PNG; a PPTX writer reads the same box model
        │
        ▼
 [5] CHECK     → report.html    contrast, overflow, logo safety, margin, variety; golden-set diff in CI
        │
        ▼
 [6] PUBLISH   → out/<brand>/   mood.json, theme.css, fonts/, showcase.pdf|pptx, decks/*, report
```

### 2.3 Core objects (all plain JSON, all versioned)
- **BrandSpec** — the normalised brand: colours (with roles), typography (faces, files, roles), logos (variants + clear space),
  imagery, voice, rules; each value carries `source: given | derived:<signal> | missing`.
- **Mood** — the ~10 brand-dependent decisions as data. Readable, diffable, overridable by hand. The only thing the engine
  needs from the brand.
- **Layout catalogue** — slide layouts (cover, section, agenda, bullets, two-column, diagram, chart, table, KPI, image, quote,
  CTA, …) defined as box trees with content slots and capacity (node counts, char budgets). Written fresh; the 1,589 presets
  are mined for ideas, not converted.
- **Deck** — ordered slides, each = layout id + content bound to slots + computed boxes. Renderer-agnostic, so HTML and PPTX
  are two writers of the same model.

### 2.3b Editing (decision 6, amended)
The Deck model is the editor's document: every element is an absolute box with a slot binding, so editing is a change to
JSON, re-fit by the same rules, re-painted by the same renderer. What "better than pitchdeckdoclist" means here:
- **One source of truth** — no HTML-vs-outline duality; the Deck JSON is what is saved, exported and shown.
- **Rules stay on after edits** — the fit, margin and contrast rules re-run on every change; the editor shows the violation
  instead of silently cropping.
- **Layout swap keeps content** — content is bound to slots, so switching a slide's layout or the deck's Mood re-composes
  without losing text.
- **Undo as a command log** — every edit is a reversible command on the Deck; export at any point is deterministic.
- **Editor = the same React renderer** with selection, drag/resize handles and inline text editing layered on top.

### 2.4 Why this fixes the two bottlenecks
- **Conversion speed**: steps 1–3 are pure functions over JSON and font metrics; target well under 10 s per brand with no
  browser. The browser is used once, for the final PDF/PNG, not for measurement.
- **Rendering**: one renderer in this repo, started by the app itself; no pitchdeckdoclist build, no shared Chrome port, no
  app-code patches. The PPTX writer reads the same box model, so what you export is what you saw.

### 2.5 Principles carried over (as code, not prose)
- No guesswork: a missing value is a question; no colour, glyph or shape is added to every brand by default.
- Every rule is a function with a unit test and a negative test; golden brands snapshot the Mood and the showcase deck.
- Determinism: same input + same engine version = byte-identical Mood and Deck JSON.

---

## 3. Roadmap

| Phase | Goal | Exit criteria |
|---|---|---|
| **P0 Foundations** (≈1 wk) | Settle §4, define BrandSpec / Mood / Layout / Deck schemas, pick the golden set, scaffold the repo | Schemas reviewed and approved; `npm run` skeleton; 10 golden brand inputs copied in |
| **P1 Brand → Mood** (≈2 wk) | READ + DESIGN as tested rules; Mood viewer page | All golden brands produce a Mood with no unanswered questions after one review round; < 2 s per brand |
| **P2 Engine + renderer** (≈3 wk) | Layout catalogue v1 (~12 layouts), COMPOSE with metric-based fit, React renderer, PDF/PNG export | Showcase deck for every golden brand renders to PDF; fit computed, no text overflow in the report |
| **P3 Checks + showcase quality** (≈2 wk) | CHECK report, visual diff in CI, design-quality rules (variety, contrast, logo, decoration) | Owner signs off the showcase decks of the golden set as "good enough to send" |
| **P4 Editor v1** (≈4 wk) | Selection, move/resize/align, inline text edit, slide add/delete/duplicate/reorder, layout swap, live Mood/surface/font switch, image replace, chart-data and table-cell edit, undo/redo, save/load Deck JSON, rule warnings with one-click fix | A generated showcase deck can be edited in the browser and exported again; violations are shown, never blocked |
| **P5 PPTX + user decks** (≈2–3 wk) | PPTX writer from the box model; Markdown/outline → deck; batch mode | A user outline becomes a branded PPTX/PDF in one command; PPTX opens cleanly in PowerPoint/Keynote |
| **P6 Ingest + depth** (ongoing) | Deterministic ingest (brand kit, website, logo), more layouts, charts/tables/motion depth, editor polish | New brand from URL/kit with no hand-written JSON |

### P0 task list — status 2026-10-30
- [x] P0.1 Answer §4 / §4b (18 decisions).
- [x] P0.2 Golden set: the 10 brands in `brand-mood-creator/inputs/` copied to `golden/brands/` (586 MB, git-ignored). **Owner to confirm the list.**
- [x] P0.3 `schemas/brand-spec.schema.json` — clean data + provenance sidecar + questions.
- [x] P0.4 `schemas/mood.schema.json` — palette, type, geometry, shape, components, charts, tables, logo, footer, decor, composition, motion; provenance per decision.
- [x] P0.5 `schemas/layout.schema.json`, `schemas/content.schema.json`, `schemas/deck.schema.json` — box model, slots with capacity, content blocks, fully-resolved deck with fitted lines.
- [x] P0.6 Repo scaffold (npm workspaces, 9 packages, jest, eslint, webpack UI, CI) — see README.
- [x] P0.7 `golden/showcase/showcase.md` — 24 slides, every layout kind once, placeholder copy. **Owner to review the copy.**
- [ ] P0.8 Owner review of the five schemas (the only thing P1 depends on).

### P1 status — 2026-10-30: built; awaiting owner review
- `pb mood <brand-dir> [--snapshot] [--html]` reads, derives and writes `out/<id>/{brand-spec,mood,questions,report}.json` + `mood.html`.
- 10/10 golden brands derive a Mood in 5–12 ms warm (≈150 ms cold incl. schema compile). 9 exit 0; hdfc-2 exits 2 with two
  blocking questions (faces `data`/`tagline` have no font files on disk). Every brand has one optional question (`logos.heightLarge`).
- Snapshots in `golden/expected/<id>/` (4.6 MB), deterministic; jest golden test in `packages/cli`. 245 tests, lint clean.
- Rules spec: `docs/P1-rules.md` (§A brand, §B mood, §C CLI, §D the 13 reconciliation decisions after the first build).
- Schemas: brand-spec v1.2, mood v1.3, layout v1.2, deck v1.2, content v1.1: enums mirror the input schema; sizes converted to canvas px (D3); E1–E6 after the owner's Mood review (tone from the brand's text colour; dead / unplaced decor; animated + extra element keys kept; icon directory as a set; unreferenced-asset inventory).
- Known gaps: `typography.scriptFallbacks` not carried into the Mood; `logoWall.logos` files not checked by BR-ASSET; the engine
  stub still accepts the old `kind:'Mood'` fixture; "input key not read" warnings (87 across the set) are noise until the map grows.

### P2 status — 2026-10-31: built end to end; awaiting owner review
- `pb build golden/brands/<id> --png --pdf` renders the 24-slide showcase for all 10 golden brands: `deck.{json,html,pdf}`,
  `slides/NN.png`, `sheet.png` (contact sheet), `report.json` (per-slide layout / surface / sizes / overflow + warnings).
- ~5 s per brand including Chrome; compose alone ≈ 11 ms. Fitter reports 0 overflow on all 10. 505+ tests, lint clean.
- Spec: `docs/P2-spec.md` (§1–6 contracts, §7 integration decisions F1–F10, §8 post-review fixes G1–G6).
- Snapshots: `golden/expected/<id>/deck.json` (deterministic). Layout wireframes: `out/_layouts/<id>/<kind>.svg`.
- Design-quality proposals for the owner: `docs/P3-proposals.md`. PR-1..3 approved 2026-10-31 and now rules (`docs/P2-spec.md §9`);
  PR-4 rendered behind `--proposals` to `out/_proposals/`; PR-5 open.
- Known limits: logos/people without files render as names / placeholders; `logo.height.large` unanswered → small logo on
  covers; bold runs measured with the regular face metrics; decor placed only by brand `box` or into layout zones.

### P3 status — 2026-10-31: built; awaiting the owner's review and sign-off in the UI
- Spec: `docs/P3-spec.md` — §A `@pb/checks` Report v1 with 14 checks (each names its brand signal, skips without one),
  §B `pb diff` (JSON + pixel diff, local), §C the review UI on port 8100 (live in-browser renderer, checks, questions →
  answers.json, Mood, diff, report, sign-off), §D decisions P3-D1..D4 (confirmed by the owner 2026-10-31), §F build notes.
- Built: `pb build` writes the Report v1 into report.json (+ questions.json, mood.html: a build folder is complete on its
  own); `pb check`, `pb diff`; the UI (`npm run build:ui && npm run serve:ui` → http://localhost:8100) lists the 10 brands
  with check counts, paints every deck live with the renderer, overlays check items on the slide, takes answers and
  sign-offs. 695 tests, lint + prettier clean.
- First results over the 10 golden decks: no `fail` except hdfc-2 (two missing font files); the warn items (contrast,
  logo clear space, decor `always` elements v1 never places, variety) are the owner's review list in the Checks tab.
- P3-D1..D4 confirmed 2026-10-31. Exit (§E) pending: the owner's sign-off per brand in the UI; warn findings accepted or
  turned into proposals (P3.x).

### P1 task list — Brand → Mood (as planned)
- P1.1 `brand/read`: load folder, validate against `schemas/input`, resolve asset + font files, hash. Negative tests: missing file, bad colour.
- P1.2 `brand/normalize`: input → BrandSpec with provenance for every pointer; `questions[]` for what the rules need and the input lacks; `answers.json` merge.
- P1.3 `brand/fonts`: read metrics from the font files (fontkit/opentype.js): unitsPerEm, ascender, descender, capHeight, xHeight, advance widths — the fitter's input.
- P1.4 `mood/palette`: surfaces with tone (luminance), contrast ratios, rhythm, per-kind surface, chart palettes. Rule tests on the golden set.
- P1.5 `mood/type`: faces + roles + fit floors from the brand's roles and limits; no invented sizes.
- P1.6 `mood/geometry`, `mood/shape`, `mood/logo`, `mood/footer`, `mood/components`, `mood/charts-tables`, `mood/decor`, `mood/composition`, `mood/motion` — one module per group, each a pure function `(brandSpec) → partial mood + provenance`.
- P1.7 `pb mood <brand-dir>` writes `out/<id>/{brand-spec,mood}.json`; `golden/expected/<id>/mood.json` snapshots; CI diff.
- P1.8 Mood viewer: a static HTML page per brand (surfaces, type ladder, components) so the Mood can be reviewed before any engine exists.

---

## 4. Decisions, round 2 (owner, 2026-10-30)

| # | Topic | Decision | Consequence |
|---|---|---|---|
| 11 | Exports | **PDF + editable PPTX** | Every element is an absolute box (text / image / shape / line) on a 1920×1080 canvas. No HTML flow layout. HTML and PPTX are two writers of the same Deck model |
| 12 | Text fit | **Font metrics, by rule** | Fit is computed from the font files (shaping + line breaking in code). Over budget → step down the scale → re-layout (fewer columns, split slide). Never crop. The browser only paints |
| 13 | Layouts v1 | **~12, one per slide kind** | cover, section, agenda, bullets, two-column, diagram, chart, table, KPI, image, quote, CTA. Variants driven by brand signals come later |
| 14 | UI + input | **CLI in P1–P2, local web UI in P3; Markdown** | User decks come from Markdown (one slide per heading) plus an optional outline JSON |

Follow-ons from 11–12 (to confirm in P0, no question needed unless you object):
- Charts and tables are drawn as native boxes/shapes (so they stay editable in PPTX), not as rendered images.
- Line breaking must be the engine's own (metrics + a breaking algorithm), and the HTML renderer positions each line it
  computed rather than letting the browser wrap — otherwise HTML and PPTX would disagree.
- Output lives in `presentation_builder/out/<brand>/` (git-ignored); publishing to a shared folder is a later step.
- Motion is out of scope until P5 (PDF has none; PPTX transitions can be added then).

## 4b. Decisions, round 3 — editor (owner, 2026-10-30)

| # | Topic | Decision |
|---|---|---|
| 15 | Editor v1 scope (P4) | All four: inline text edit + move/resize/align; slide add/delete/duplicate/reorder + layout swap keeping content; live Mood / surface / font-pair switch; replace images, edit chart data and table cells in place |
| 16 | Persistence | Local files, single user: Deck JSON on disk under `out/`; no accounts, no database. Multi-user later if needed |
| 17 | Rules while editing | Warn, never block: any edit is allowed; violations are marked with a one-click fix (re-fit, snap to brand colour) |
| 18 | Present mode | Later (P6). P4 = edit + export |

P4 is therefore the largest phase (≈4 wk); charts and tables need their own editable data model in P2 so P4 can edit them.

## 5. Still open (smaller)
1. **Golden set** — defaulted to the 10 brands in `brand-mood-creator/inputs/`; say if any should be added or dropped.
2. **Showcase copy** — drafted in `golden/showcase/showcase.md`; review when convenient.
3. **Who uses it** — only you for now, or the team (affects setup polish in P3)?
4. **Schema review (P0.8)** — the five files in `schemas/` are the contracts every package builds on; a read-through before P1 saves rework.
