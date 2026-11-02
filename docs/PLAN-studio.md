# PLAN — the Studio: a designer-friendly app (slide preview + brand panel) and a richer slide content model

Status: **approved by the owner 2026-10-31 ("Approve S1 + S2")**; written after the owner's review of the P3 UI:
> 1. presentation viewer UI is not that great · 2. slide outline content seems very simple - check all of our preset
> content combinations and their default content (to understand the slide types and their contents, nothing final) ·
> 3. we need to start with slide preview and brand change panel so that it is easy to use · 4. this app is designer
> friendly.

Nothing below is implemented. The owner approves the plan (or parts) first; then it is built in the order of §5.

## 1. What changes
The P3 UI was a review console (tables first, slides second). The app is for designers: the **slide is the centre**,
the **brand is a panel beside it**, and everything else (checks, questions, report) is a secondary layer the designer
opens when needed. The content the app shows must look like real presentation content (the reference presets' default
content shows what slides actually hold), not a 24-line test deck.

Two deliverables, in this order:
- **S1 Studio shell** — one screen: filmstrip · canvas · brand panel. Switching the brand (or a surface, font pair, layout
  variant) re-composes the deck live and the canvas updates in place.
- **S2 Content model v2 + showcase v2** — slide kinds and their node structures grown from the reference catalogue
  (`docs/research/preset-content-catalogue.md`), with realistic default content per kind, so a brand switch is judged on
  slides that look like a deck.

The P4 editor is then built *inside* the Studio (same canvas, same panel): selection, drag, inline text and the one-click
fixes land on this shell. Nothing from the P3 review console is thrown away: its server, checks and renderer are reused;
only the pages change.

## 2. The Studio screen (S1)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▣ stripe ▾   Showcase v2 ▾      ◀ 4 / 24 ▶   fit ▾  guides □      Export ▾  ⋯     │  top bar
├──────────┬──────────────────────────────────────────────────┬────────────────────┤
│ filmstrip│                                                  │ BRAND              │
│ 01 ▭     │                                                  │ ● stripe   logo    │
│ 02 ▭     │               the slide (live renderer,          │ Surfaces  ▭▭▭▭     │
│ 03 ▭     │               fit to the free area)              │ Type      Sohne…   │
│ 04 ▮ ←   │                                                  │ Rhythm    ▭▭▭▭▭▭   │
│ 05 ▭     │                                                  │ ─────────────────  │
│ …        │                                                  │ SLIDE              │
│          │                                                  │ kind   text ▾      │
│          │                                                  │ layout text-left ▾ │
│          │                                                  │ surface page ▾     │
│          │  ← → keys · click filmstrip · scroll             │ decor   on/off     │
│          │                                                  │ ─────────────────  │
│          │                                                  │ CHECKS (2) ▸       │
└──────────┴──────────────────────────────────────────────────┴────────────────────┘
```

- **Top bar**: brand switcher (every brand with a mood: logo chip + name + two colour dots; switching re-composes the
  current content for the new brand), content switcher (showcase v2 / any `.md` deck in `content/`), slide counter with
  prev / next, zoom (fit / 50 / 100 %), **guides** toggle (margins, title zone, check outlines: off by default), Export
  (PDF / PNG / PPTX later), overflow menu (Reconvert brand, open report, open questions).
- **Filmstrip** (left, 180 px): live thumbnails (the renderer scaled, not PNGs), current slide marked, kind label under
  each; click selects; keyboard ↑ ↓ ← →; `G` toggles a 4-up grid view of the whole deck in the canvas area.
- **Canvas**: the slide at the largest size that fits, centred on a neutral background, no chrome over the slide; a
  thin caption below (kind · layout · surface). Present mode (P6) will be this canvas full-screen.
- **Brand panel** (right, 320 px), three stacked groups:
  - **Brand** — logo, name, surfaces as swatch tiles (bg / text / accent; click = set this slide's surface; the deck's
    rhythm shown as a strip), type (heading / body faces with a sample line; when the brand defines alternative pairs,
    a switch), a "Mood" link to the full Mood page (P1's `mood.html`, in a drawer).
  - **Slide** — kind (read-only in S1), layout variant picker (the catalogue's layouts for this kind, as mini wireframes;
    picking one re-composes this slide), surface, decor on / off, logo on / off (where the brand's rules allow).
  - **Checks** — the slide's check items (collapsed count by default; expanded = the list, each item outlines its element
    on the canvas while hovered). Deck-level findings under a "Deck" header.
- **Drawers** (over the canvas, closable): Questions (answers → `answers.json` → Reconvert), Report, Diff. These are the
  P3 pages, moved out of the way.
- Look: neutral chrome (one grey ramp + one accent for selection), 13 px UI type, tabular numbers, icons only where
  universal (chevrons, close); the slide is the only coloured thing on screen by default.

### 2.1 Live re-compose (how a brand / surface / layout change reaches the canvas)
The engine is a pure function `composeDeck(content, mood, catalogue)` (11 ms per deck). The server keeps every brand's
Mood (with font metrics) in memory and exposes one call:
`POST /api/compose { brandId, contentId, overrides?: { slides: { [slideId]: { surface?, layout?, decor?, logo? } } } } → { deck, warnings, checks }`.
The UI holds the deck it last received and paints it; a change sends the call and swaps the deck in (≈ 20–60 ms end to
end on localhost, so switching brands feels instant; PNG / PDF export is a separate, explicit step). Overrides are stored
beside the content as `content/<deck>.overrides.json` (per brand) so a designer's choices survive a reload; the checks
run on every compose and are returned with the deck. The browser never runs a rule (one engine, in Node) — if latency
ever matters, the same engine can run in the browser since it needs no file access once the Mood is loaded.

### 2.2 Ideas taken from the reference editor (pitchdeckdoclist, read for ideas only)
- **Brand cards previewed on a real slide**: its Style panel shows each brand kit as a card painting the kit's own cover
  layout in the kit's colours and fonts (BrandKitTileList). The Studio's brand switcher does the same with our renderer: a
  card = that brand's cover slide composed from the current content, so a designer compares brands on the same slide.
- **Fit = one transform**: the slide is laid out at 1920×1080 and scaled by `min(w / 1920, h / 1080)`; chrome that must
  look constant on screen (selection ring, hairlines) is counter-scaled. The canvas re-fits when the panel docks.
- **Thumbnails are the live slide DOM scaled**, refreshed on change, never images (SlideRail). Rail rows: number +
  card + selection ring; "+" between rows and a context menu arrive with P4.
- **Busy state while restyling**: a flag blocks navigation until the re-render completes (applyMoods). Ours: the canvas
  dims and the panel locks for the ~50 ms compose round trip; a failed compose keeps the previous deck and shows why.
- **Navigation**: ← → ↑ ↓ and PageUp / PageDown move one slide, with Cmd for first / last; one wheel gesture = one
  slide (debounced), ignored over scrollable areas.
- Not taken: the theme change by appending stylesheets, class-swap re-rendering slide by slide, static mood PNG grids -
  our deck is re-composed as data and painted once.

### 2.3 What S1 does NOT do
No element editing (P4), no present mode (P6), no new brands (brand inputs still arrive as folders under
`golden/brands/` or `brands/`), no PPTX (P5). The review-console pages survive as drawers only.

## 3. Content model v2 (S2)
Source: `docs/research/preset-content-catalogue.md` (1,589 reference presets, 33 container types, 3,955 default-content
entries). What it shows: **a slide is a title block plus one to three node lists**; 49 % of presets are title + one
graphic, the rest add a short list, a paragraph or a KPI row that explains the graphic. A node is heading + body
(+ icon / value / image / label); the "graphic" is a *treatment* of the list (670 presets are diagram treatments of the
same heading + body nodes). The new grammar therefore grows by **node-list block types**, not by named graphics; the
treatment is a layout decision the engine makes from the block type, node count and brand, and the Studio's layout
picker lets a designer swap it.

### 3.1 Blocks (the content vocabulary; each a fenced YAML block in the Markdown)
| block | nodes | fields per node | replaces / covers in the references |
|---|---|---|---|
| `points` | 2–12 | text, icon? | simple_list (290 presets), agenda rows (with `body`), references |
| `items` | 2–10 | heading, body?, icon?, image?, label?; block `title?` (group heading) | list_with_description (472), cards |
| `subpoints` | 1–8 | heading, lines[] | list_with_subpoints (53) |
| `kpis` | 1–8 | value, heading, body?, image?, trend? | kpi_block (216, incl. the single-KPI hero), mini_chart (percent), tam-sam-som (`nested: true`) |
| `process` | 2–8 | heading, body?, icon?; block `shape?`: linear · cycle · funnel · pyramid · stack · hub · ladder · quadrant · venn · tree · converge · diverge | the diagram families (670) reduced to 12 shapes; metaphor art (chess, rocket, iceberg…) is NOT taken |
| `timeline` | 2–10 | when, heading, body?, lines[]?, icon? | timeline, roadmap, timeline_with_list (57) |
| `chart` | 1–30 rows | type: column · bar · line · area · pie · donut · stacked · grouped · stacked% · funnel · waterfall · scatter · radar · gauge; categories, series[], text {title, xAxis, yAxis, legend?, source?}, highlight? | chart + multi_series_chart (114); the long tail (kagi, bump, candlestick, waffle…) is NOT taken |
| `table` | 2–8 × 2–8 | title?, subtitle?, header[], rows[][] where a cell is a string or {type: text · heading · number · check · rating · image · logo · chip, …}; `highlightColumn?`, `rowHeader?` | table (45) with rich cells, pricing / compare tables |
| `quotes` | 1–4 | text, name, role?, photo?, label? | quotes + testimonials (41) |
| `people` | 1–9 | name, role, photo?, bio?; block `title?`, `subtitle?` | team_slide (24), presenter (cover) |
| `logos` | 1–20 | src? / name, (rows); block `title?`; cards: heading + body | logogrid (12), cover logo strip |
| `compare` | 2 columns | columns[]: header, label?, image?, items[{heading, body?, check?}]; `tiers: true` → price, per, features | comparison, before/after, pricing tiers (29) |
| `paragraph` | 1 | text (150–400 chars) | paragraph as a container beside a graphic (93) |
| `image` | 1–4 | src, alt, caption?; block `treatment?`: side · full · background · collage · device | image (175: full-bleed background with overlay, collage, device mockup) |
Slide-level keys (front of the slide): `label` (eyebrow), `title`, `subtitle`, `number` (section "01"), `background`
(image src), `cta` (button text), `notes`. A slide holds one title block + up to three content blocks; `kind` becomes an
optional hint (the engine infers the layout family from the blocks). All 18 current kinds remain as aliases.

### 3.2 Layouts: what the catalogue must grow
Compositions, by frequency in the references: title + process (279); title + process + points / items (285); title +
items (113); title + kpis (57); title + image (44); title + process + paragraph (36); title + chart (30); title + chart +
items (19); title + image + kpis (19); title + quotes / team / roadmap / timeline (≈ 70); title + table (13); title +
compare; title + logos. So the layout catalogue gets **slot pairs**: a *main* slot (process / chart / image / table) with an
optional *aside* slot (points / items / paragraph / kpis) left, right or below, plus the shape treatments of `process`
(12 shapes, each an item layout drawn with boxes and lines - PPTX-safe, no art), node layouts for icons / numbers /
images, and the image treatments. Every treatment carries its design-intent ranges from the catalogue (§6: diagram
heading ≤ 20–30, body 30–60; list heading ≤ 40, body 30–160; KPI value ≤ 8; quote 80–200 …) as `maxChars` per field, which
the fitter uses as targets and the Studio shows when a text is over. Estimated ≈ 20 new layouts + 12 process shapes +
8 node layouts; built over §5 step 3 in the order of the frequency table.

### 3.3 Icons, images, people
Icons: a node's `icon` is a concept name; it resolves to the brand's icon set (BrandSpec `components.icon.items`, E5)
by name, else the node has no icon (no generic icon pack is added to every brand: R-021). Images: `src` files in the
content folder or `{brand.imagery.samples[n]}` placeholders; people without photos keep the brand avatar rule. Charts and
tables stay native boxes (decision 11).

### 3.4 Showcase v2 (the golden deck)
≈ 32 slides with **neutral sample copy** in the references' newest style (a fictional company, realistic numbers, no
"Add a title…" placeholders): cover (+ presenter block where the brand gives one), agenda with descriptions, section with
number, process × 3 shapes (linear 4, cycle 5, funnel 4), process + aside points, items with icons (3 and 6), points
numbered (5), subpoints (3 cards), kpis (1 hero; 4 row; 3 with body + image), charts (column, bar, line, pie / donut,
stacked + aside), table with check cells (compare plans), compare before / after, pricing tiers, quotes grid (3),
testimonial with photo, team with bio (4), timeline with body (4), roadmap (6), logos row + logo cards, image full-bleed with
text, image collage, paragraph + process, quadrant and venn, references, cta. Each slide is reviewed once in the Studio
across the 10 brands before it becomes the golden snapshot (owner's before / after, as for every rule).

### 3.5 Not taken from the references
The AI picker and its taghint codes (no AI, decision 2); metaphor diagram art (chess, rocket, iceberg, lighthouse…) and
stock-image defaults (nothing is added to a brand that the brand does not give); the 1,895 orphan default-content
entries; per-preset range tables as *limits* (ours are design intent per layout, the fitter still measures). The
character-band → heading-class ladder (§6) is already covered by our role sizes + fit-up / step-down rules.

## 4. Decisions (confirmed with the plan, 2026-10-31)
- **ST-1** Compose stays on the local Node server (one engine); the browser is a view + commands. *(vs. bundling the
  engine into the browser: possible later, not needed for a local single-user app.)*
- **ST-2** Overrides (a designer's per-slide surface / layout / decor choices) are data beside the content, per brand,
  never edits of the Mood or the content file.
- **ST-3** Thumbnails and the canvas are the live renderer (same React components); PNGs are export artefacts only.
- **ST-4** Guides and check outlines are off by default on the canvas; the slide is shown as it exports.
- **ST-5** The content grammar stays Markdown + fenced YAML blocks (decision 14) and grows new block types; the showcase
  v2 replaces showcase v1 as the golden deck (snapshots re-made once, with the owner's before / after).

## 5. Order of work
1. **S1.a** Studio shell with the brand switcher, filmstrip, canvas, Brand panel (surfaces, type), Checks group; compose
   endpoint; P3 pages as drawers. *(≈ 3–4 days)*
2. **S1.b** Slide group: layout variant picker, surface / decor / logo overrides, overrides file. *(≈ 2 days)*
3. **S2.a** Content model v2: the 14 block types (§3.1) in the parser + content schema, then layouts in the order of
   §3.2 (process shapes and asides first, then charts / tables / compare / image treatments), renderer + PPTX-safe boxes.
   *(≈ 1.5 weeks, in slices the owner reviews in the Studio)*
4. **S2.b** Showcase v2 (§3.4, ≈ 32 slides of realistic content) + re-snapshot after the owner's review. *(≈ 2 days)*
5. Then P4 editor on the Studio shell.

## 6. Status
- **2026-10-31 S1 built** (S1.a + S1.b): the Studio is the default screen (`#/`, `#/studio/<brand>/<content>/<n>`); server
  `packages/ui/server/studio.js` keeps every brand's Mood in memory and composes in 8–12 ms (35–50 ms end to end in the
  browser, byte-identical to the CLI without overrides); brand switcher cards paint each brand's cover from the current
  content; surface / layout / decor / logo overrides per slide are saved to `content/overrides/<content>.<brand>.json`
  (ST-2) and are **local**: a pinned surface or `decor: false` changes that slide only (the rhythm and decor frequency keep
  counting as if unpinned - fixed in the engine after the first build shifted later slides). Drawers: Questions (answers +
  reconvert), Report (live), Diff (vs golden), Checks, Mood; the P3 review console stays at `#/review`. Export writes to
  `out/<brand>/studio/<content>/` (PDF / PNG) so the P3 build and its sign-off hash are untouched.
  Not done: the font-pair switch (brands define no alternative pairs yet); the layout picker shows one layout per kind
  until S2.a adds variants ("Other kinds…" lists all 18); `logo: false` removes the slide logo, not the footer's.
- **2026-10-31 S2.a slice 1 built**: content/2 grammar with the 14 block types (`docs/S2-content-v2.md`,
  `packages/engine/src/content/{blocks,fences,upgrade,lower,schema}.js`), design-intent ranges in `BLOCKS`, every block
  composing onto today's layouts through aliases with one content warning per dropped field; the 10 golden decks are
  unchanged (a v1 document still parses as content/1). Seed deck `content/samples/all-blocks.md` (26 slides, Larkspur
  Logistics) is listed in the Studio's content switcher.
- **2026-11-01 S2.a slice 2 built** (`docs/S2-layouts.md`): 21 main + aside layouts (main = process / chart / table /
  image / items / kpis / points; aside right 7/5, left 5/7, below; two lists 6/6), 11 process shapes as geometry only
  (`packages/layouts/src/shapes.js`: cycle, funnel, pyramid, stack, hub, ladder, quadrant, venn, tree, converge,
  diverge; linear = steps) with the brand's divider / card / accent signals, node fields (items: group heading, brand
  icon by name, thumbnail, label, sequence numbers; points: icon markers, two columns above 6; kpis: body, single-KPI
  hero, image-backed cell, trend marks). `summarize()` exposes `blocks[]`; `pick()` scores layouts for content/2 slides
  only, so the 10 golden decks are byte-identical; the Studio's picker lists every variant (52 layouts in all). Sample
  deck now 44 slides. 1,313 tests. Known limits: max text fits every shape to 5 nodes, some shapes overflow (reported,
  never cropped) at 6–8 nodes; venn with 3 nodes is a row, hub spokes sit in two columns; `numbered: true` is not in the
  content schema (numbers follow the brand's marker rule only); the picker cannot yet narrow by the slide's blocks.
- **2026-11-01 S2.a slice 3 built** (`docs/S2-layouts.md` §4, §6–7): every content/2 field now draws as itself - slide
  `label` (eyebrow), `subtitle` on content layouts, section `number`, `background` image with the brand's overlay, `cta`
  button; chart text (title, axis titles, legend, source) and funnel / waterfall / radar / gauge drawn natively (deck
  `chart.form` + a native `chartType` for the PPTX writer); table title / subtitle, the eight cell types, highlight column,
  row header; `compare-columns` / `compare-tiers`; image collage / device / background / caption; `quote-grid` /
  `quote-photo`; people title / subtitle / bio (3×3); logos title / rows / cards; timeline icons + sub-points;
  `kpi-nested`. 59 layouts, sample deck 59 slides, no content warning on stripe / akgmedia / bosch, 2,044 tests, golden
  decks byte-identical. Known limits: number cells are right-aligned without tabular figures (metrics carry none);
  compare check rows use glyphs; the background overlay is flat; slides with three content blocks still take the kind's
  default layout.
- **2026-11-01 S2.b showcase v2 written, awaiting the owner's approval**: `golden/showcase/showcase-v2.md` (38 slides,
  one B2B software year with internally consistent numbers, no fictional company, brand placeholders on cover / cta,
  American spelling; `packages/engine/__tests__/showcaseV2.test.js` checks ranges, copy rules and the arithmetic). Two
  layout families from the slice-3 review: table rows sized by the brand's density, and main + two asides
  (`*-asides-right`, `*-aside-below-2`) for three-block slides (`docs/S2-layouts.md` §8). Fixes found on the sheets: KPI
  image cells use the image as background only when the brand's own contrast minimum holds on the overlay, else a
  thumbnail; card text picks a colour that reads on the card fill; rukko node text reads against the card fill; the label
  hugging a bottom-aligned title trims the title frame to its text (top-aligned) so no boxes overlap. Rendered for all 10
  brands: 0 overflow, no content warning except the two brands without a tagline, text-overlap 0, fails only hdfc-2's
  fonts. Review: `out/_showcase-v2/index.html` (v1 left, v2 right) and the Studio (content "showcase-v2").
  **Approved by the owner 2026-11-02 ("Approve showcase v2")**: showcase-v2.md is now `golden/showcase/showcase.md`
  (the golden deck, what `pb build` composes by default) and the 10 deck snapshots were re-made (ST-5); v1 is kept as
  `golden/showcase/showcase-v1.md` - the engine's rule tests stay written against it (`helpers.showcaseMd()`), the golden
  tests use the new deck.
  Open items noted by the build: akgmedia gives no overlay rule, so its title sits on the slide-32 image; text colours on
  overlays are swapped only below 3:1 (bosch's blue KPI values and notion's muted body read weakly on an overlay);
  the-ken's text on red cards is 4.27:1 and rukko's initials 3.19:1 (palette limits, reported); icons on slide 9 draw only
  for a brand whose icon set has those names.

