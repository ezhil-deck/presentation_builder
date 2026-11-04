# P2 — Engine + renderer: content → Deck → HTML / PDF / PNG

Status: spec for implementation (2026-10-31). Exit: `pb build golden/brands/<id>` renders the showcase deck of every golden
brand to `out/<id>/deck.{json,html,pdf}` + `slides/NN.png`; fit is computed from font metrics; the report lists any overflow.
Four packages, built in parallel against the interfaces below: `engine` (parse, fit, compose), `layouts` (catalogue),
`renderer` (Deck → HTML), `export` (HTML → PDF / PNG). Then one integration pass wires `pb build`.

Principles carried: no AI, no randomness, no defaults that are not a brand signal (name the signal), every element an
absolute box, text carries its fitted lines, HTML and PPTX must agree (so **no browser text wrapping**: the renderer places
the lines the fitter computed).

---

## 1. Content (packages/engine/src/content/)

`parseMarkdown(md, { brandSpec }) → Content` (schemas/content.schema.json, **amended**: add block
`{type:"columns", items:[{title?, blocks:[…]}]}`).

Markdown grammar (what `golden/showcase/showcase.md` uses):
- Front matter `---…---` → `title`, `purpose` ignored.
- `# Title` starts a slide (`blocks[0] = {type:title}`); `<!-- kind: X -->` on the next line → `slide.kind`.
- The first plain paragraph after a `#` on a `cover`/`section`/`cta` slide → `{type:subtitle}`; other paragraphs → `paragraph`.
- `## Heading` inside a slide opens a **column**; when a slide has ≥ 2 `##`, the slide's blocks after the title become one
  `columns` block (each column: `title` = the heading, `blocks` = what follows until the next `##`). A single `##` → `subtitle`.
- `- ` / `* ` lists (nesting by 2 spaces), `1.` ordered → `list` (`ordered`).
- Fenced blocks ```` ```cards ```` | `steps` | `timeline` | `kpis` | `chart` | `table` | `logos` | `people` → parsed as YAML
  (dependency `yaml`) into the matching block; unknown fence → paragraph with the raw text + warning.
- `> text` then `— attribution` (em dash or `--`) → `quote` (attribution split on ` · ` or `, ` into `attribution`, `role`).
- `![alt](src)` → `image` (`src` relative to the brand folder when it starts with `assets/`, else as given).
- `{brand.name}`, `{brand.tagline}`, `{brand.imagery.samples[N]}` (→ the sample's `file`) are resolved from the BrandSpec;
  an unresolvable placeholder → the block is dropped with a warning (never left as literal braces).
- Inline `**bold**`, `*italic*`, `[text](url)` → runs.

`inferKind(slide) → kind` when `slide.kind` is absent: title only → `text`; title + subtitle only → `section`; kpis → `kpi`;
chart → `chart`; table → `table`; cards → `cards`; steps → `steps`; timeline → `timeline`; logos → `logos`; people → `team`;
quote → `quote`; columns → `two-column`; image + paragraph → `image-text`; image only → `image`; list → `bullets`;
paragraph(s) → `text`. First slide with no kind → `cover`; last with a `cta` block → `cta`.

## 2. Layouts (packages/layouts)

```js
export const catalogue = { list(): LayoutDef[], forKind(kind): LayoutDef[], get(id): LayoutDef }
// LayoutDef = { id, kind, version, tags, build(ctx) → Layout (schemas/layout.schema.json) }
// ctx = { mood, geometry: mood.geometry, summary }  (summary from §3.1)
```
Kinds in v1 (one layout each; the showcase uses all): `cover`, `section`, `agenda`, `bullets`, `text`, `two-column`,
`cards`, `steps`, `timeline`, `kpi`, `chart`, `table`, `image`, `image-text`, `quote`, `team`, `logos`, `cta`.
Aliases (no module): `diagram → steps`, `comparison → two-column`, `blank → text`.

Geometry conventions every layout uses (all from the Mood; nothing hard-coded except the canvas):
- Canvas 1920×1080. `content` frame = canvas inset by `geometry.margins`. `safeArea` only guards logo/footer/decor.
- Title box: `x = content.x`, `y = titleZone.y` (else `margins.top`), `w = content.w`, `h = titleZone.height` (else
  `2 × roles.h1.size × roles.h1.lineHeight`, signal `type.roles.h1`). Body area starts at `title.y + title.h + spacing.lg`.
- Footer band: the bottom margin (`y = 1080 − margins.bottom … 1080`), items per `mood.footer` (position → left/right).
- Columns: `grid.columns` / `grid.gutter` → `colW = (content.w − gutter×(n−1)) / n`; two-column = 6+6, image-text = 5+7
  (image left) — these splits are layout design, allowed (they are not brand facts).
- Cards / kpis / steps / team / logos: a box with `flow: {direction:'row'|'grid', gap: 'md', columns: n}` where
  `n = min(maxItems, summary.items)`; `maxItems`: cards 4, kpis 4, steps 5, team 4, logos 8, timeline 5.
- Cover: title box in the lower half when `composition.layoutHints.cover.titleRole === 'display'` else top; logo per
  `mood.logo.perKind.cover` at `mood.logo.position` inside the safe area; `footer: 'hide'` when the hint says so.
- Section: title centred vertically, `surface.prefer: 'dark'` only if `palette.perKind.section` is absent.
- Quote: quote box centred, `align` from `components.quote.tokens.align` (else layout default `center`).
- Every layout declares `decor.zones` (content-free frames, e.g. right third on cover, bottom band on section).
Slots: `role` = the Mood type role the text uses; capacities `minItems/maxItems/maxLevels`; char capacity is NOT declared —
the fitter decides. Title slots are `required: true`; others `required: false`.

## 3. Engine (packages/engine)

### 3.1 Summary + pick
`summarize(slide) → {kind, items, chars, hasImage, hasChart, …}`; `pick(kind, summary, mood, catalogue) → Layout`
(v1: the single layout for the kind, alias fallback; unknown kind → `text` + warning).

### 3.2 Surface + background per slide
`surfaceFor(i, slide, mood)`: `slide.surface` if pinned → else `palette.perKind[kind]` → else `palette.rhythm[j]` where `j`
counts only slides that reached this branch (cover/section/cta excluded from the cycle) → else the `default` surface.
Background: `composition.layoutHints[kind].background` names a variant → if that surface carries `background[variant]` of
type image/gradient → use it (image → `deck.assets`), else solid `surface.bg`.

### 3.3 Resolve (tokens → literals)
`resolve(mood, surface)` returns `{ color(ref), font(role), radius(ref), shadow(ref), spacing(ref) }`: `ref` may be a
surface role (`text`, `heading`, `accent`, `card`, `cardText`, `border`, `textMuted`, `bg`), `semantic.X`, `chart.N`, a
literal `#hex`, or `transparent`; radius refs by name (`sm|md|lg|pill|none|tile|button…` → `shape.radius[ref]`, unknown →
0 + warning); `font(role)` → `{family, size, weight, lineHeight, letterSpacing, case, color: color(role.color)}` with
`family` = `type.faces[role.face].family` and `metrics` attached for the fitter.

### 3.4 Fit (packages/engine/src/fit/)
`measure(text, font) → width` = Σ `widths[cp]` (per-em advance × size; missing cp → `avgCharWidth`) + `letterSpacing × size ×
(n−1)`; space = `widths[32]`.
`breakLines(paragraph, font, maxWidth)` greedy word wrap on spaces; a word wider than `maxWidth` is broken by characters
(warning). Returns lines `[{text, width}]` per run (runs with bold keep their text; v1 measures bold with the same metrics +
warning once per deck when the face has no bold file).
`layoutText(paragraphs, frame, font, {align, valign, bullets}) → {lines, height, overflow}`: line box `L = lineHeight × size`;
baseline of line i = `y0 + i·L + (L − (ascent − descent)·size)/2 + ascent·size` (CSS half-leading; the renderer uses the
same formula, so HTML = PPTX); `spaceBefore/After` between paragraphs; list indent = `bullets.indent` (else `1.5 × size`,
signal: role size); `x` per align; `valign` shifts the whole block.
`fitText(paragraphs, frame, role, mood, surface) → textElementProps`: start at `role.size`; while `overflow` and
`size − step ≥ fit.min` → `size −= step`; record `fit: {requestedSize, appliedSize, overflow, steps}`; overflow left →
element `warnings[]` `check:"overflow"` with a `fix` `{command:"fitText", args:{allowBelowMin:true}}`.
Shared sizing: items of one flow box (cards, kpis, bullets of one list) all take the smallest applied size among them.
Charts: `layoutChart(block, frame, mood, resolve) → chart.geometry` (plot frame after axis/legend room measured with the
`chartLabel` role; bar rects; tick values nice-rounded; donut radii). Tables: `layoutTable(block, frame, …)` → colWidths
proportional to the max measured cell width per column (min = header width), rowHeights from fitted cells.

### 3.5 Compose
`composeDeck({ content, mood, brandSpec, catalogue, engineVersion }) → { deck, warnings }`:
for each content slide → kind → layout → surface/background → bind blocks to slots (by type; unbound required slot →
warning; unbound block → warning) → resolve styles → fit → elements (z: background 0, decor-behind 10, shapes 20, text /
images 30, logo 40, footer 50, decor-front 60) → logo (variant = `logo.perSurface[surface]`, height `large`/`small` per
`logo.perKind[kind]`, placed at `logo.position` inside safeArea, clearSpace respected) → footer (per `mood.footer`, hidden
when `hideOn` includes kind or the layout says `hide`) → decor: elements with `allowedOn ∋ kind`, `surfaces ∌ surface` → skip,
`frequency: always` → placed; `often` → placed on every 2nd eligible slide, `sometimes` every 3rd, `rare` first only
(deterministic by slide index); placed at `element.box` when given, else into the layout's first free `decor.zone` that fits
the image's aspect (scaled to the zone), `opacity` as given, `animated` kept on the element (`image.animated` asset id).
Deck `assets` map (id = sha1 of path), `fonts` from `mood.type.faces` used. Validate against schemas/deck.schema.json.
Deterministic: same inputs → identical JSON (sorted keys).

## 4. Renderer (packages/renderer) — plain JS, no JSX (so Node runs it without Babel)
`renderDeckToHtml(deck, { assetBase, fontBase, inlineAssets:false }) → html` (react-dom/server `renderToStaticMarkup`), and
`renderSlideToHtml(deck, i)`. Rules: every element is `position:absolute` at its frame; **text lines are rendered one span
per line at the fitter's `x`/`y` (baseline → `top = y − ascent·size`), `white-space:pre`, no wrapping**; font via
`@font-face` for every `deck.fonts[].files` (woff2/ttf/otf format from the extension); images `object-fit` per `image.fit`,
`image.animated` used as `src` when `{animated:true}` option; shapes: rect/ellipse as div, line/path/polygon as inline SVG;
chart as inline SVG from `chart.geometry` (bars, line paths, donut arcs, ticks, labels using the chart's font literals);
table as absolutely positioned cells from `colWidths`/`rowHeights` with each cell's fitted lines; backgrounds solid /
gradient / image + overlay. One `<section class="slide" data-index>` per slide, 1920×1080; a stylesheet that scales slides
to the viewport for on-screen viewing (`transform: scale`) without affecting print. Print CSS: `@page {size:1920px 1080px;
margin:0}`, one slide per page.

## 5. Export (packages/export)
`exportPdf(html, outFile, {basePath})` and `exportPng(html, outDir, {basePath, scale:1})` with puppeteer: `page.setContent`
with `file://` base for assets (or write the html next to the assets and `page.goto`), viewport 1920×1080,
`emulateMediaType('print')` for PDF (`printBackground:true, preferCSSPageSize:true`), one screenshot per `section.slide`
for PNG. `exportPptx` stays a stub (P5).

## 6. CLI + golden
`pb build <brand-dir> [--content <md>] [--out] [--pdf] [--png] [--snapshot]`: mood (as today) → content (default
`golden/showcase/showcase.md`) → compose → `deck.json`, `deck.html`, `report.json` (mood + compose warnings, overflow list,
per-slide layout/surface table), `--pdf` → `deck.pdf`, `--png` → `slides/NN.png`. `--snapshot` → `golden/expected/<id>/deck.json`;
jest golden test (packages/cli) compares. `pb render <deck.json> --pdf|--png` renders an existing deck.

## 7. Integration decisions (2026-10-31, after the three builds)
- **F1 fit step clamp.** Step down by `fit.step`; when the next step would pass `fit.min`, take `fit.min` as the last size (so
  the floor is reachable). No `fit.step` → one jump to `fit.min`.
- **F2 large logo.** No golden Mood gives `logo.height.large` (it is an optional question). Until answered, cover/cta use the
  small height (info warning). No invented size.
- **F3 showcase.md** is the engine's input: fix the "Image beside text" annotation to `image-text`, quote YAML values that
  contain `: `, and correct the doc count (24 slides).
- **F4 bullets.** The engine owns bullet geometry: each list item's first line carries `bullet {text, x, width}`; the renderer
  draws the glyph at that `x` and never computes its own indent.
- **F5 slot conventions** (engine ↔ layouts): column slots are `col<N>-title` / `col<N>-body`; people → slot type `people`
  (added to layout schema); team layouts use it. Every text slot names its type role.
- **F6 flow items.** When a flow box names `itemLayout`, the engine builds it via `catalogue.itemLayout(id, {mood, w, h})`
  for the cell size from `flowCells` and binds the item's fields to that sub-layout's slots; items share one applied size.
- **F7 ajv ^8** becomes a dependency of engine and layouts (no more borrowing from mood).
- **F8 chart geometry** follows the renderer's documented shape (`packages/renderer/src/elements/chart.js`); ticks carry x/y.
- **F9 `pb build`** per §6; the CLI passes `content` and `catalogue`, reads `{deck, warnings}`; the compatibility shim goes.
- **F10 review sheets.** `pb build --png` also writes `out/<id>/sheet.png`: a contact sheet of all slides (4 per row) for review.

## 8. Fixes after the first rendered review (2026-10-31, overnight; rule-level, no design invention)
- **G1 `content` is a category in the brand's layout vocabulary.** Every golden input uses the same 13 layout ids (title,
  agenda, section, content, twoColumn, cards, stat, chart, imageText, imageBleed, quote, team, closing). `content` means
  "a content slide"; so for every brand-keyed lookup (logo.perKind, decor allowedOn, footer hideOn, composition.layoutHints,
  palette.perKind) a catalogue kind resolves to the brand's exact id when it names one (bullets→content is the exact match,
  twoColumn, cards, stat→kpi, chart, imageText, imageBleed→image, quote, team, title→cover, closing→cta, section, agenda), and
  **otherwise, when the kind is not cover/section/cta/image, to `content`** (text, steps, timeline, logos, diagram,
  comparison, cards-less kinds). Implemented once in packages/mood `kindMap.js` (`brandIdFor(kind)`) and used by every rule
  that reads brand layout ids; the Mood records the expansion (perKind entries get provenance note "via content").
  (hdfc-2: headerStrip + logo were missing on steps/timeline/team/logos/diagram; notion/rukko logos likewise.)
- **G2 brand colour names resolve.** `palette.brand = {primary, secondary, accent, tertiary}` (MD-PALETTE, from colors.*);
  the engine resolver accepts `primary|secondary|accent|tertiary` (fixes stripe's textOverImage overlay `primary`, and the
  `primary` refs in cisco/headspace/shopify/the-ken).
- **G3 custom radius names kept.** MD-SHAPE carries every named step of layout.radiusScale verbatim (`tile`, `button`, …) next
  to the canonical ones; unknown names no longer warn in the resolver.
- **G4 every brand style is a Mood role.** MD-TYPE adds each brand style under its own name (size/weight/lineHeight/… and
  fit.min by the same rules) in addition to the canonical roles resolved by chain. Resolver lookups of `label`, `tableHead`,
  `cardTitle`, `closingTitle`, … then succeed with the brand's own values (fixes the table-font fallbacks on 5 brands and
  hdfc-2's cta `closingTitle`).
- **G5 deck schema formalised:** `fonts[].metrics {ascent, descent, …}`, `image.tile` (boolean), `image.scale` (number).
- **G6 rules the integration pass added, now written down (applied; owner to confirm):** (a) contrast guard — a *literal*
  role colour under 3:1 on its surface is replaced by the surface `text` colour (surface-role colours never replaced);
  (b) text over a content image gets the brand's `decor.imagery.textOverImage` overlay between them, text colour = the
  surface text colour with the most contrast against the overlay; (c) text keeps one gutter clear of brand-boxed decor,
  else keeps its width + info warning; (d) decor `tile` `scale` = multiplier of the asset's own pixel size.
- **G7 rhythm wins for content surfaces.** G1's `content` expansion does NOT apply to `palette.perKind`: a kind takes a
  brand surface only when the brand names that layout id exactly (title/cover, section, closing/cta, quote, team, …); every
  other content kind cycles `palette.rhythm` (the brand's own statement of variety), falling back to the `content` hint's
  surface only when the brand gives no rhythm. (G1 as applied made decks mostly one surface — akgmedia lost black/snow/pink.)
  Logo, decor, footer and layoutHints keep the expansion.
- **G8 role sizes must be px.** A brand style whose `size` < 4 (a multiplier, e.g. notion `displayHighlight` 1.35) is not
  registered as a role; one warning names it. Deck schema adds `image.animated` (asset id).
- **G9 a rhythm step may name a background variant.** `backgrounds.rhythm` entries that are variant ids (hdfc-2 `cover`,
  stripe `heroRibbon`-style) carry that variant's background onto the slide (image/gradient on the variant's surface), not
  only the surface colour. MD-PALETTE records `rhythm` as ids and adds `rhythmBackgrounds {step → variant}`; the engine uses
  the variant's background for that step.

## 9. Approved design rules (owner, 2026-10-31: "Approve PR-1..3"; 2026-11-03: "Approve both" for PR-F / PR-C′ - on the before / after sheets)
The three proposals below left `docs/P3-proposals.md` and are rules of every compose (no option; the golden decks carry
them; engine version 0.3.0). Each names its brand signal and is tested in `packages/engine/__tests__/rules-approved.test.js`.
- **R-FITUP (was PR-1)** `compose/fitup.js`: the main text (box roles body / list / quote) of a text / bullets / agenda /
  two-column / image-text / quote slide that fills < 45 % of its box steps **up** the brand's own role ladder
  (body → bodyLarge → h3 → h2; only roles the Mood defines; each step takes that role's lineHeight) while the text still
  fits and stays ≤ 60 % of the box; never beyond h2; two-column bodies share one size (the largest step both accept).
  Recorded on the element: `text.fit.upSteps`, `text.fit.upRole` (`requestedSize` stays the role's size). Titles,
  subtitles, eyebrows, attributions, captions, footers and flow items (cards / kpis / steps / table / chart) never grow.
  Signal: the brand's role ladder.
- **R-AVATAR (was PR-2)** `compose/slots.js` `avatarElements`: a person without a photo is drawn as the brand's
  `components.avatar` (mask circle / square, fill = the avatar fill token else the surface accent, radius token) at
  `avatar.tokens.size`; without a size token, as tall as two lines of the name role (the item layout is rebuilt for that
  size so name and role follow). Initials (first letters of the first two words, name role, contrast colour ≥ 3:1) only
  when the token says `placeholder: initials`; `silhouette` brands get the fill alone (no asset to draw). Signal: the
  brand's avatar component / name role.
- **R-LOGOCHIP (was PR-3)** `compose/slots.js` `chipElements`: a logo item without a file renders as a chip from
  `components.chip` tokens (fill, radius, padding, font, text colour) hugging the name; without a chip component the name
  is set in `h3`, centred in its cell, with a hairline only when the brand has a divider weight / borderWidth.
  Signal: the brand's chip component / divider.

Approved 2026-11-03 (owner: "Approve both" on the PR-F / PR-C′ sheets `out/_prfc/<id>/compare.png`, 10 golden brands,
84 slides changed): two more rules of every compose, no option (engine version 0.4.0; the golden decks re-snapshotted,
equal to the approved proposal builds). Tested in `packages/engine/__tests__/rules-approved.test.js` against
`__tests__/fixtures/c4-default-flows.json` (the 0.3.0 build they were approved against). Both apply to the catalogue
layouts (content/2 slides) only; the 68 layouts, fit-up and the Mood are unchanged.
- **R-FILLROOM (was PR-F)** `compose/slots.js` `pickFill` / `roomTries` / `chooseRoom` / `addsStrain`: the C3.1 fill of
  a catalogue box (`box.fill`) runs in the room the record gives. *Room:* the step / timeline / card-title-text items'
  title gives the lines it does not use to the description below it; a text box the parts leave at 0 px while it holds
  text counts as an overflow. *Relative strain:* a try is rejected only for strain it adds against the same box at its
  base roles (a text that overflows where its base did not, or steps down further); an element the try does not touch
  (a timeline year, a marker) never blocks it. *Description first, monotone:* a flow whose items have a heading and a
  description first computes the base pick (the C3.1 tries without the room, in the same call) and tries every
  [k, kText] (3 down to 0) that (a) draws text and heading at least as large as the base pick, (b) keeps the heading
  strictly larger than the text (equal only when the base pair is equal) and (c) keeps heading : text ≤ 2.3 unless it
  is the base pair; among the tries that fit (no added strain, within the record's share + 10 points) the largest text
  wins, then the largest heading within 2 : 1, else the smallest ratio; none fits → the base pick, drawn in the room.
  A text box keeps the three equal steps and a KPI flow its six, the first that fits winning, with the relative strain
  test. Caps: running text ≤ h2, titles ≤ h1. Recorded in the deck as before: each text's chosen role
  (`text.font.role`, size in `text.fit`); no before / after record (there is no other build to compare with). Signal:
  the catalogue record (zone, fill share) and the brand's own role ladder.
- **R-PLACE (was PR-C′)** layouts `catalogue-defs.js` `VALIGN` / `contentAlign` / `placeTied` / `decorBand`, engine
  `compose/place.js`, `slots.js` `placeInCells`: a catalogue container takes the record's vertical placement as
  recorded - `fill` → middle, `top` → top, `middle` → middle, `bottom` → bottom (C3.1 drew fill → top, bottom →
  middle) - for items without a card in their cells (`flow.valign`; a row stays level; at the bottom the content keeps
  its top inset), for un-carded text boxes, lists and paragraphs (`align.v`; a text card hugging its text moves with
  it). *Inside a card the card is the anchor:* an item drawn on a card (its own component card or the Mood's card behind
  the cell) keeps its content at the card's top padding and the card stays. A steps / timeline flow keeps its whole
  zone (`flow.place` {valign, lines}), is filled there (R-FILLROOM) and placed afterwards: a box of 1.35 × the measured
  fitted height at the recorded alignment, its connector / line moved with it - so the placement never changes a size.
  The band the composition leaves between the title and the content group, when wider than 2 × spacing.lg, is a decor
  zone (after the zone under the content). Never moves a title, a footer or a chart / table. Signal: the catalogue
  record of the slide (D1).

Still open as proposals (`--proposals`, off by default): PR-4 title clear of brand-boxed decor (changes 0 slides as
written: hdfc-2's slash is behind-layer full-canvas decor), PR-5 body column width for text-only slides.

