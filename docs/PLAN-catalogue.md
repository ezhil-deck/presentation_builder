# The Rich Slide Catalogue — review and the outline-matching plan (C1–C6)

Status: **approved 2026-11-02** (owner: "Approve, start C2" — D1–D5 in §5 approved). C1, C2, C3, C3.1 and C3.2 (the
owner's D6–D8 after the C3 review) built (§4); C3.2 approved 2026-11-03 ("Approve, start C4"); C4 built 2026-11-03
(§4: the catalogue is the default layout source, golden decks re-snapshotted), approved 2026-11-03 ("Approve C4");
next C5 / C6, and the design rules of docs/research/external-template-patterns.md §4 (D9 / D10 open). The first two
design rules, PR-F fill room and PR-C′ recorded placement, approved 2026-11-03 ("Approve both") and now rules of every
build (docs/P2-spec.md §9 R-FILLROOM, R-PLACE; engine 0.4.0): they replace C3.1's fill → top / bottom → middle
placement below with the record's own and let the fill use the room the record gives.

Owner, 2026-11-02: "keep this as our Rich slide Catalogue. These are mainly for the content combination; when to use
and what content to be replaced is up to the outline content and brand style. For outline matching a slide will be
picked from this catalogue and redesigned for the brand."

Source: the owner's artifact https://claude.ai/artifact/7qR3iQpw2HeNuVjWKNtSFa, copied unchanged to
`golden/catalogue/rich-slide-catalogue.html` (one self-contained HTML file; every slide is hand-written HTML at
1920 × 1080, no images). `golden/catalogue/index.json` is extracted from it by `npm run catalogue:index`
(`scripts/catalogue-index.mjs`) and checked by `packages/engine/__tests__/catalogue-index.test.js`.

## 1. What the catalogue holds (1,646 slides, five sections)

| section | ids | slides | what it is |
|---|---|---|---|
| 1 Individual blocks | B1–B258 | 258 | 94 base block styles (B1–B94) and their variants (counts, orientations, grounds; B211–B258 are the preset diagram metaphors drawn on their own) |
| 2 Common combinations | C1–C20 | 20 | the 20 combinations consultants use most, each a shape with blocks in its zones (chart + takeaways, KPI band + exhibit + callout, dashboard, executive summary …) |
| 3 Every preset combination | P1–P191 | 191 | every combination in the presentations.ai preset library (1,323 presets), most used first, with its code (`figures+list.desc`, `diagram:priority_stack+list` …) and the number of presets that use it |
| 4 Every shape | S1–S100 | 100 | the zone grammar: header, an optional top band, one to three columns (F full, H ½+½, L ⅔+⅓, R ⅓+⅔, T ⅓+⅓+⅓) each stacking up to three blocks, an optional bottom band, at most five blocks; code `t·H12·b` |
| 5 Every content length | L\<plan\>-\<n\> | 1,077 | the **content-length plan**: 38 content combinations × every band of item count and text length, one slide per layout, grouped in *families* (layouts that differ only in a value or heading length share one composition). Every content field is marked (`data-c` container, `data-f` field, `data-i` item, `data-type`), so each slide is also the answer key for what goes where. 840 diagram layouts (3 plans) are not in it yet |

The content-length plan's vocabulary (section 5): combinations of **Points + descriptions**, **Bullet list**,
**Points + sub-points**, **KPI numbers** (value + heading + body, or value + body), **Chart**, **Table**, **Columns**,
**Comparison (2)**, **Roadmap**, **Timeline** (+ details), **Paragraph**, **Title only**; item-count bands per block
(e.g. points 2–4 / 2–6 / 2–8, KPIs 1–8, chart points 2–12, table rows 2–8); length bands per field: heading 1–20 /
21–60, description 1–70 / 71–140, value 1–6 / 7–12, body 1–70, bullet 1–70 / 71–220, paragraph 1–80 / 81–400. Its
rule, stated in the catalogue: *count → arrangement, length → scale, weight → placement*.

## 2. How it maps to what we have

**Content/2 blocks** (`packages/engine/src/content/blocks.js`, 14 types) against the plan's combinations:

| catalogue | ours | note |
|---|---|---|
| Points + descriptions | `items` | heading + description per node |
| Bullet list | `points` | |
| Points + sub-points | `subpoints` | |
| KPI numbers (value + heading + body / value + body) | `kpis` | both field sets exist |
| Chart | `chart` | the plan's chart is "n points"; our chart carries series / categories and a `form` |
| Table | `table` | rows 2–8 |
| Columns (2–4) | `items` shown as columns (no own type) | a column = heading + description; `compare` is the two-sided case |
| Comparison (2) | `compare` | |
| Roadmap | `timeline` / `process` phases | no own type; the catalogue treats it as phases with a year |
| Timeline (+ details) | `timeline` | details = description + sub-steps |
| Paragraph | `paragraph` | |
| Title only | a slide with no blocks | |

Not in our vocabulary (section 1, 94 base styles): chart forms (sankey, treemap, marimekko, bullet, histogram, slope,
dot plot, diverging, area, stacked, scatter / bubble, heatmap, small multiples, annotated chart, icon array, progress
rings / bars, sparkline tiles — we have `chart.form` funnel / waterfall / radar / gauge), table kinds (scorecard with
bars, harvey balls, feature matrix, pricing, status, financial), structures (org chart, issue tree, journey map, gantt,
swimlanes, staircase, flywheel, value chain, layers, 3 × 3 matrix, tile map, bento), text blocks (statement, callouts,
Q&A, glossary, pros / cons, do / don't, checklist, key message + supports), people (profile, testimonials), and the 50
preset diagram metaphors (rocket, bridge, iceberg, chess, umbrella …; we reduce diagrams to 11 `process.shape`s).

**Layouts** (`packages/layouts`, 68): our main + aside family (right / left / below, two asides) is the subset
L11, R11, F2, L12, R21, L13, R31 of the 100 shapes; the process shapes cover 11 of the metaphors as abstract forms;
cover / section / agenda / cta / quote / team / logos / image kinds match B32–B35, B29, B194–B197, B254, B31 / B91–B93.
We have no top / bottom band zone, no three-column stacks, and no composition per length band: our layouts take a
count and let the fitter step the role down, where the catalogue changes the composition with the band (a family per
band).

**The catalogue's own look is not ours.** Its colours, faces, dark grounds, hairlines and card styles are the
catalogue author's choices for legibility; under CLAUDE.md rule 3 they are never defaults. A catalogue slide gives the
**composition**: zones, which field sits where, the size relations between fields (figure : heading : body), the
arrangement per count and band. The brand gives everything else through the Mood (surfaces and rhythm, type roles,
palette roles, card / line / bullet / icon styles, imagery crop, decor cadence, logo and footer).

## 3. The plan: outline → catalogue match → brand redesign

Pipeline today: Content (content/2 blocks) + Mood + the 68 layouts → `pick()` scores layouts → bind → fit → Deck.
Proposed: the catalogue becomes the first layout source for content/2 slides; the 68 stay as the fallback and for
content/1 decks (golden decks unchanged until the owner approves a re-snapshot).

- **C1 Index (built 2026-11-02).** The HTML kept in the repo, `index.json` with every slide's id, section, name, spec,
  shape, description, combination code, preset count, plan number, and for plan slides the containers and fields
  (`data-c` / `data-type` / `data-f` / `data-i` counts). Tests: counts per section and per plan, unique ids, a
  negative test on a figure without an id.
- **C2 Geometry.** Measure every catalogue slide once in headless Chrome (the same puppeteer the export uses) at
  1920 × 1080: the box, font size, weight and alignment of every marked field (`data-c/f/i`), every zone
  (`data-zone` on the shape slides), the header (`.k` kicker, `.t` title, `.r` rule), source line and footer →
  `golden/catalogue/geometry.json` (checked in; a build step, not a runtime step, so the pipeline stays offline and
  deterministic). Test: every plan slide's fields have a box inside the slide; the shape slides' zones tile the body
  without overlap.
- **C3 Catalogue layouts.** A generated `LayoutDef` per plan slide (and per shape): the measured boxes re-expressed on
  our 12-column grid in Mood terms — margins and gutters from `mood.grid`, the catalogue's font-size bands mapped to
  type roles (figure → display / stat, 50 px heading → h3, 30 px → body, labels → eyebrow), fields bound to the
  content/2 node fields by `data-f` / `data-i`, zones as slots. Containers keep their block type (`data-type` →
  `items` / `points` / `kpis` …). Nothing of the catalogue's colour or face is copied. The existing bind / fit /
  surface / decor / logo stages run unchanged on these slots, so a catalogue layout is "redesigned for the brand" by
  the same rules every layout already obeys. Golden: a showcase v3 slide per plan family, rendered before / after for
  the owner's review, never straight into the snapshots.
- **C4 Matching.** `pick()` for a content/2 slide computes the slide's **combination key**: block types in written
  order, node counts, and the length band of every field by the plan's bands (§1). Candidates = the plan slides with
  that combination; the exact count row and band columns first (the family), else the nearest band (longer text wins
  the tie, so the fitter steps down rather than up); among several, the deck's rhythm / variety rule and the preset
  usage count (section 3) decide; a pinned layout still wins. No plan for the combination → the 68 layouts as today,
  with a `catalogue` warning naming the nearest combination. Every composed slide records its catalogue id
  (`slide.source.catalogue`). Tests: a slide per plan picks a layout of that plan; a band change picks the next
  family; a combination outside the plans falls back with the warning.
- **C5 Checks and diff.** A `catalogue` check (info): the composed slide against its catalogue slide — the same
  fields present, in the same zones, in the same order; `pb diff --catalogue` renders our slide beside the
  catalogue's (the catalogue HTML served locally) for a visual check. The Studio's Checks group shows it.
- **C6 Studio.** The slide-kind picker browses the catalogue (sections 1–5, thumbnails from the HTML in an iframe,
  search by combination); "Pick from catalogue" on a slide pins a catalogue id; the panel shows the match reason (the
  combination key and the family).

Order: C2 → C3 → C4 (one PR each, owner review in the Studio after C3 and C4), then C5, C6. The 840 diagram layouts
the catalogue does not have yet keep our 11 process shapes until the catalogue grows.

## 4. Built so far

- C1 (2026-11-02): `golden/catalogue/rich-slide-catalogue.html` (10.8 MB, 4.0 MB gzipped, byte-identical to the
  artifact), `golden/catalogue/index.json` (1.5 MB), `scripts/catalogue-index.mjs`, `npm run catalogue:index`,
  `packages/engine/__tests__/catalogue-index.test.js` (9 tests: section and per-plan counts, unique ids, negative
  tests on a figure without an id / a wrong prefix / a duplicate).
  Measured: 1,646 slides (258 / 20 / 191 / 100 / 1,077); 35 plans present (16, 17 and 30 are the diagram plans the
  catalogue says come later); every plan's slide and family counts equal its heading. Plan-slide containers
  (`data-type`): kpi_block 420, paragraph 394, simple_list 360, chart 312, kpi_vb 156, list_with_description 108,
  list_with_subpoints 84, roadmap 54, timeline 54, multi_column_list 36, table 28, comparison 18,
  timeline_with_list 12, title 1. Fields (`data-f`): heading, value, body, description, point (charts), bullet,
  paragraph (no `data-i`), row (tables). Grounds: `.slide.dark` on 88 slides (70 of them plan slides).
  Two numbers in the catalogue disagree: the preset captions sum to 1,321, the section's own list says 1,323 (P117
  parallel_lanes and P120 seed_to_scale read "1 preset" in the caption, 2 in the list); the test asserts the measured
  1,321 and names the gap. L35-1 (Title only) marks its title as the container and has no fields.
- C2 (2026-11-02): `scripts/catalogue-geometry.mjs`, `npm run catalogue:geometry` (wrapped in `caffeinate -d -u -i`;
  `node scripts/catalogue-geometry.mjs` alone works too), `golden/catalogue/geometry.json` (7.1 MB, 248k lines
  prettier-formatted, 257 kB gzipped), `packages/engine/__tests__/catalogue-geometry.test.js` (16 tests: the checked-in
  file validates clean, counts, spot checks, negative tests on fixtures). Each figure's `.slide` is rendered alone,
  unscaled, at 0,0 in a 1920 × 1080 page (device scale 1, `--font-render-hinting=none`) carrying every `<style>` block of
  the catalogue, its SVG symbol sprite and the root dataset its script sets (`brand=headspace`, `scheme=crimson`,
  `ground=light`, `style=classic`); one browser, 4 pages, the slide swapped in by `innerHTML`; every request but
  about:blank / data: is aborted (none was made: the Google Fonts `<link>`s are not carried). Boxes are
  `getBoundingClientRect` relative to the slide, edges rounded to whole px; font size and line height to 0.01 px;
  `lines` = round(content height ÷ line height) (padding and borders left out). `measured` is kept while the output is
  otherwise unchanged. Run time 5–25 s (load on the machine); two runs byte-identical.
  Measured: 1,646 slides; 2,037 containers, 10,520 fields (both equal to the index), 412 zones (100 shape slides),
  5,638 region entries (4,123 top-level) on the 570 slides without fields (none hit the 400-entry cap).
  **Faces.** The brand's faces are embedded in the page (data: URIs), so titles and most text are measured in
  Headspace Apercu as the owner sees them (title stack `"Headspace Apercu", Outfit, Arial, Helvetica, sans-serif` on all
  1,615 titled slides). The one face the page fetches from Google Fonts, **Source Serif 4** (`.sr` headings, figures
  outside `.ed`), falls back to **Georgia** offline: 1,571 of the 10,520 fields ask for it, so their widths and `lines`
  are Georgia's, not the owner's view; 133 glyphs (symbols Apercu lacks) were painted in Arial. `fontFamily` in the file
  records the title stack, the faces asked for by fields and the glyphs painted per face.
  **Rules the catalogue needed** (each in the validator, every case listed):
  - *Body box*: from the bottom of `.r` (else `.t`) to the top of `.src` / `.ft`; horizontally the title's column
    widened to the mirror of its left margin (right = max(title right, 1,920 − title left)), since a title at the left
    margin (1,320 / 1,360 wide) is narrower than the content measure the zones and blocks use: x 67, w 1,786 on 1,607
    slides; the 8 side-column headers keep their column (B93, B198, B199, C16, P9, P62, P77, P100). Slides without a
    title have no body (`null`): the 31 title-less slides B4, B12, B29,
    B32–B35, B79, B103–B105, B132, B133, B190, B192, B203–B206, B210, B257, C17, C20, P5, P8, P13, P20, P126, P186,
    P187, P191. L35-1 (Title only: the title is the container, set low) has a 248 px body and is exempt from h ≥ 400.
  - *Items*: a container's `box` is the union of the elements carrying its `data-c` + `data-type`; the catalogue marks
    only the first of a row of cards / columns, so the other items' fields lie beside it. `items` = the parallel
    element of each such field (the field's ancestor at the marked element's depth below their common ancestor, or the
    outermost one toward the field that holds no other container's marker), `extent` = box ∪ items. 100 containers on
    84 slides: L1 6, L4 22, L5 24, L7 1, L8 7, L13 8, L37 13, L38 3 slides.
  - *display: contents fields* (64 timeline headings, L32-1 … L32-18 except L32-2): no box of their own; the box is the
    union of the children, the text style that of the child with the longest text, the children kept as `parts` (year
    figure + label).
  - *Hanging chart labels*: a chart's `point` labels are placed absolutely under the frame and hang outside it by less
    than their own height (3–8 px; 13 px L7-10; 10 px to the right L8-13; 28 px for the two-line labels of L9-12 and
    L11-11): 105 fields on 25 slides — L6-1, L6-2, L6-3, L7-10, L8-13, L8-69, L8-79, L8-81, L8-85, L8-86, L8-88, L8-89,
    L8-91, L8-96, L8-98, L8-100, L8-101, L8-103, L8-104, L8-105, L8-107, L9-1, L9-2, L9-12, L11-11.
  - *Known overflows* (`KNOWN_OVERFLOWS`, catalogue faults, not excused by any rule): a `white-space: nowrap` KPI value
    is wider than its grid column, so the last column runs past the container — L5-71 (column 4, 42 px right; past the
    1,853 px margin) and L38-63 (columns 3 and 6, 26 px).
  Left out: pseudo-element text (`.ft .bn::before`, list markers), SVG internals of charts (only their frames as
  regions), per-field painted face (only the totals), and any re-measure under another catalogue brand / scheme.

- C3 (2026-11-02): catalogue layouts, behind the compose option `catalogue` (CLI `pb build --catalogue`); the golden
  decks and the Studio are unchanged.
  **Files.** `scripts/catalogue-layouts.mjs` (`npm run catalogue:layouts`, no dependencies) →
  `packages/layouts/data/catalogue-layouts.json` (1,077 records, 2.8 MB prettier-formatted, read lazily on first use);
  `packages/layouts/src/catalogue-key.js` (`combinationKey(blocks)`, `combinationShape`, `bandOf`, `bandDistance`: the
  one key C4 reuses), `catalogue-defs.js` (record → LayoutDef, loader checks), `catalogue-data.cjs`;
  `catalogue.js` (`list({catalogue})`, `forKind(kind, {catalogue})`, `get` finds `cat-l<plan>-<n>` always);
  `scripts/catalogue-geometry.mjs` now records each container's `classes` (its marked element) and `itemClasses` (from
  its first field up to its item; geometry otherwise byte-identical, two runs identical); engine `pick()` /
  `composeDeck({options: {catalogue: true}})`, `slots.js` honours a flow's own `cells`, `summary.js` counts a list of
  strings as one text and a compare column's rows as `rows`; deck schema v1.5 (slide `source.catalogue`); CLI
  `--catalogue` (refused with `--snapshot`), `--before` → `compare.png` + `index.html` (per slide: layout, catalogue
  id, match, catalogue key, slide key); review deck `golden/showcase/catalogue-review.md` (41 slides: a cover, one
  slide per plan at a middle count with short fields, five at long fields). Tests:
  `packages/layouts/__tests__/catalogue-{key,layouts,defs}.test.js`, `packages/engine/__tests__/
  catalogueLayouts.compose.test.js`, `packages/cli/__tests__/catalogue.test.js` (34 tests; the defs test builds all
  1,077 records for all 10 golden Moods, about 0.2 s).
  **Measured.** Bands: the spec strings use the plan text's bands plus description 141–220 and body 71–140 / 141–220
  (now in `BANDS`; the generator fails on any other). Grid: 12 columns with a **32 px gutter** (of 20–40 px, the gutter
  whose lines lie nearest the 922 inner container edges: mean 4.2 px, 87.7 % within 1 px; 28 px: mean 6.0 px, 3.8 %; the
  modal edges 606 / 574, 909 / 877, 1,212 / 1,180, 1,364 / 1,332 are exact column lines at 32 px; 28 px is the
  `column-gap` of a few three-card rows such as L1-1). Kinds: kpi 576, cards 228, chart 84, timeline 66, steps 54,
  table 28, bullets 20, two-column 18, text 3. Size bands (all 10,520 fields, role by the rule in the generator's header):
  heading h3 1,438 / bodySmall 842 / h2 337 / display 2; value stat 1,410 / h2 632 / h3 1; body bodySmall 1,556 / body
  487; description body 623 / bodySmall 562; bullet body 624 / bodySmall 384 / h2 6; paragraph body 183 / h2 160 /
  bodySmall 51; point bodySmall 829 / body 264; row bodySmall 129 (no `label` field: eyebrow unused). Flows: row
  1,359, column 501, grid 176 containers. Cards: 165 containers (79 by the marked element, 86 by an element from the
  first field to its item). 1,035 distinct keys; 42 keys shared by two slides (plans 2 / 14: 18, 22 / 32: 12, 24 / 28: 12).
  **Rules found on the review sheets** (generator / build rules, not slide fixes): the content group (the vertical union
  of the zones) is stretched to the Mood's body area instead of centred (the first renders overflowed KPI and card
  rows on bosch / hdfc-2 / rukko); a column or grid flow whose rows are shorter than the brand's item needs keeps the
  rows that fit and puts the items side by side (`fittedFlow`); a chart / table stacked on the same columns as a flow
  takes the height the flow's rows do not need (`giveToGraphic`: headspace's stacked-bar chart was squashed to a band
  over a half-empty KPI row); a container whose extent takes in another one (KPIs flanking a chart, a list in a grid's
  sixth cell: 49 containers) keeps its items' own cells on the grid (`flow.cells`); a process with another shape than
  linear and nested KPIs never match (the shape / ring layouts draw them; the first showcase run put four shaped
  processes on roadmap compositions). Result: 0 overflow on all 10 golden brands for both decks.
  **Match statistics** (`pb build --catalogue`, stripe / bosch / headspace, the same on each): catalogue-review.md 40
  exact family, 0 same combination, 1 none (the cover); showcase.md 9 exact family, 6 same combination, 23 none (15
  slides differ from the plain build). Exact-family slides leave no required slot unbound (tested). Sheets and
  indexes: `out/_catalogue/<brand>/{review,showcase}/{sheet.png,compare.png,index.html}` (git-ignored).
  **Limits.**
  - *Shared keys*: plans 2 and 14 (items + paragraph), 24 and 28 (items), 22 and 32 (timeline) give the same key for
    the same counts and bands (our `items` is both points + descriptions and columns; a timeline's details and
    description share one band). The first in catalogue order wins (plan 2, plan 24); plan 28 is never picked and plan
    14 only for the counts plan 2 lacks; a timeline whose milestones carry `lines` takes plan 22, one without plan 32.
  - *Roadmap → process (linear)*: 35 of the 54 roadmaps mark phases with an ordinal (Step 1, Phase 1, 01, a numbered
    row: the steps marker), 19 with a year (12), Now / Today (6) or a region (1), which a content/2 process node cannot
    carry (no label field): those labels are not drawn. (C3.2 / D8: a process node's `label` draws them.)
  - *display: contents fields / `parts`* (64 timeline headings, plan 32): kept as one field (the union box, the role of
    the longest child); the year part is our timeline's `when`, the record notes `parts: 2`.
  - *Known overflows* L5-71, L38-63: their containers keep the measured box; the 26–42 px the catalogue paints past it
    are not part of any zone.
  - *L35-1 (Title only)*: the title is the container (above the body, zone y −1.13); the record draws our standard
    title only - not the catalogue's low section-opener title; a content/2 slide with no block (a front key makes it
    content/2) matches it.
  - *Cards* (revised C3.1): every container the catalogue draws on cards takes the Mood's card (items / sub-points:
    `item-card`; paragraphs and one-column lists: `box.card`; KPIs, steps, timelines, point flows, compare columns:
    `flow.card`, the card behind each cell). Containers the catalogue draws on hairlines / rules get neither card nor
    rule (D5: rules are hints only). (C3.2 / D6: ruled containers take the card.)
  - *Roles* (revised C3.1): the size-band roles reach every slot (items, KPIs, steps, timelines, compare, lists,
    paragraphs) and step up the brand's ladder to fill (`box.fill`); a catalogue lockup (figure beside its text,
    numeral | heading | description rows) is still drawn as our vertical item; field boxes inside items are recorded,
    not used.
  - *Fill* (C3.1): the per-container bound "our empty share ≤ the catalogue's + 15 points" holds for 55–83 % of the
    containers per Mood, not all (test: at least half). The catalogue fills its zones with numerals (96–140 px),
    labels, meters and rules we do not draw, and the brands' ladders are smaller than its 50 / 30 px heading / body
    (stripe h3 = body = 22.4 px).
  - *Synthetic overflow* (C3.1): a slide written for each record at the middle of every band overflows on 6–115 of
    1,076 records per Mood (most: 5–8 KPIs with 141–220-character bodies, timelines with long details); the review
    and showcase decks have 0 overflow on all 10 brands.
  - *KPIs value + body* (plans 36–38): content/2 reads a KPI written with only a body as its heading (fences.js), so
    the key reads value + heading without body as value + body.
  - *Lengths*: a sub-point's / timeline's lines count as one text (joined), a compare side's description is its rows
    (features + item headings and bodies); chart forms and table kinds are not part of the key (any chart counts).
  - *Faces*: 1,571 fields were measured in Georgia (C2); sizes are CSS sizes (roles unaffected), `lines` are Georgia's.
  - *Listing*: `catalogue.list()` / `forKind()` keep the 68 unless `{catalogue: true}` is passed (the Studio's
    layout endpoint, the picker skeletons and the layout tests enumerate the default list); `get()` finds every id.
  - `flow.cells` is a layout box key the schema does not name (as `flow.shape`, `flow.nested`); layout schema unchanged.
- C3.1 (2026-11-02): scale, placement, cards and numbers (the coordinator read the C3 sheets: "after" consistently
  sparser than "before" - arrangement kept, scale and placement dropped). Rules, each tested (unit + negative):
  - **Scale.** The generator's role rule gained the title step (a field at least the slide title's 56.23 px: h1, a
    figure stat; a figure from 80 px: display, built as the larger of the Mood's display / stat). The recorded roles
    reach the slots they are drawn in: `flow.itemRoles` ({title, text, value, label, body}) honoured by the item
    layouts (`roles` option of card-title-text, item-card, kpi-value-label(-body), step, timeline, point-marker-text,
    compare-column; a role the Mood lacks keeps the item's own), list and paragraph slot roles. Then **fill**
    (`box.fill` = the share the catalogue's text fills; engine `fillUp`): the box's roles step up the brand ladder
    (caption … h1, one rung per size; running text ≤ h2 - the approved fit-up's ceiling -, titles / paragraphs ≤ h1,
    a title stays larger than its text) to the largest step that fits without stepping down and stays within the
    catalogue's share + 10 points. L34-1 had drawn at h2 (stripe's h2 is 36.4 px: the 64 px statement's band); it is
    now h1 on the Mood's card. Body text elements of catalogue slides whose role changed against C3 (review /
    showcase, of 203 / 74): stripe 161 / 52, bosch 134 / 39, headspace 158 / 49 (most: bullet → h2 / h3 / bodyLarge,
    stat → display, KPI labels → h2).
  - **Placement.** The generator records `place` (content in its zone: fill / top / middle / bottom + `empty`, the
    text-only share `text` for card containers) and `itemAlign` (the first item's fields in the item). We draw top
    for fill / top and middle for middle / bottom (the catalogue's free space mostly holds numerals, labels and meters
    above the fields). Flows: `flow.valign` places each item's content in its cell (all items of a flow by the
    tallest one, so rows stay level; markers move with them; text frames keep to the cell); text boxes take it as
    their vertical alignment; steps and timelines (tied to a connector / rule) are placed as a whole box. C3's
    full-area stretch is replaced by `groupScale`: the group keeps the catalogue's share of the body, grown only as
    far as the brand's content needs (text lengths from the slide; the record's rows of item stacks; a chart, a
    table or a block with images: the whole area). Fill test (`catalogueFill.test.js`, every record with a slide
    written at the middle of its bands): containers within the catalogue's empty share + 15 points, per Mood -
    stripe 62 %, bosch 78 %, headspace 78 %, akgmedia 55 %, hdfc-2 82 %, rukko 69 %, cisco 64 %, notion 65 %, shopify
    78 %, the-ken 65 % (after the role / placement / card rules alone: stripe 28 %, bosch 32 %).
  - **Cards and numbers.** `card` → the Mood's card component behind the text box / each cell (`componentBackground`,
    padding inside, text in `textOn` of the card's fill). The geometry records `numbered` (an unmarked numeral 01 /
    1 / Step 1 … in the first item: 53 containers); numbered items draw the steps number marker when the brand's
    marker is a number (compare-column gained the marker; item-card already had it).
  - Engine fix found by the fill test: fit-up (`applyFitUp`) crashed when two main texts in different roles had no
    common ladder step (a catalogue list + paragraph); each now takes its largest step within the shared size.
  - Remaining visual gaps on the sheets (stripe / bosch / headspace): records the catalogue draws on hairlines
    (ruled columns, 2 × 2 cells) lose the brand's cards the 68 drew (bosch review 13–15, showcase 9–12; stripe
    review 2, 23) and read as plain text; steps and timelines under the catalogue's big numerals / years keep the
    band roles (stripe review 17, 23, 29; bosch showcase 4) because their text-only fill target is low; tables keep
    their size.

- C3.2 (2026-11-02): the owner's three changes after the C3 sheets (D6–D8), each a rule with unit + negative tests;
  golden decks byte-identical, the Studio UI untouched.
  **D6 cards where the catalogue rules.** `scripts/catalogue-geometry.mjs` records per plan container `rules: {top,
  bottom, left, right, between, inner}` (+ `axis` on roadmaps / timelines) and the tally `ruleSources` in
  `geometry.json`. A rule is any border side 0 < width ≤ 4 px with a visible colour, or an element at most 4 px thick
  painted with a background, at least 48 px long, outside the header and SVG (pseudo-elements are not read). Found:
  `border-top div.rt` (1,848), `border-bottom li.rb` / `div.rb` (437 / 278), thin `background` divs (372, `height:
  1.5px; background: var(--ln)`), inline `border-top` / `border-left` / `border-right` / `border-bottom` (327 / 204 /
  51 / 19), `.card.o` outlines (70), `ul` / `li.rule` / `li.rule2` / `.lab` borders, table `td` / `th` borders (tables keep
  no card). A line belongs to a container when it lies within 48 px outside its extent or inside it and is not inside
  another container; its side comes from the items it crosses (above them all: top, below: bottom, items on both
  sides: between, inside one: inner - sub-points on hairlines); on a roadmap / timeline a line crossing items at two
  places or more is its `axis` (our steps connector / timeline line) and makes no card. Generator (`cardSource`): a
  container drawn on cards (`class`) or ruled (`rule`) takes `card: true` when its block can carry the card (kpis,
  points, items, subpoints, process, timeline, compare, paragraph). **Cards gained by rule: 1,120 of 2,036 block
  containers** (kpis 429, points 255, paragraph 211, items 109, subpoints 84, compare 18, process 11, timeline 3; by
  class 165) - per plan 1: 57, 2: 30, 3: 4, 4: 224, 5: 201, 6: 6, 7: 10, 8: 88, 9: 9, 12: 36, 13: 84, 14: 34, 15: 15, 18:
  27, 19: 22, 20: 6, 21: 15, 23: 8, 24: 24, 25: 32, 27: 12, 28: 12, 29: 6, 31: 7, 32: 3, 36: 15, 37: 45, 38: 88. The
  runtime draws the card for every block type (tested on items, points, paragraph, kpis, steps, timeline, compare):
  the text in the card's padding, in the colour that reads on its fill; a part keeps its role's own colour (a KPI value
  in the brand's figure colour) when that reads on the card, a bullet that does not read takes the text colour; a
  text box's card hugs its text (placed as the text is) instead of filling a tall zone. Item cards are numbered only
  where the catalogue numbers them (`flow.numbered: false` on the other catalogue flows; the 68 keep numbering every
  card). The card's padding needs room, so: needs count the engine's padding (also for a flat card), a sub-point
  list's line count (`summary.blocks[].lineCount`), a numbered card's marker; a paragraph under a graphic takes the
  shortfall from it (the graphic keeps half its height); a paragraph's role and a KPI value's role step down where
  they cannot fit their cell (`fittingRole`, `fitValueRole`: one line of the cell's width, the stack within its
  height).
  **D7 numeral room.** The geometry records the first item's numeral / year / label: `numeral {box, fontSize, text,
  class, fields}` (`fields` = the first item's fields without it) and `numeralAlign` top / left - a short unmarked text
  (≤ 24 characters; a block part of a field counts, as the years inside plan 19 / 32 headings) repeated for the items
  (a group of two or more of one tag, class and size), above or left of the first item's fields, the largest group
  winning. The generator gives a steps / timeline container, or a numbered one (ordinal text), whose numeral is larger
  than its running text `numeral {role (display ≥ 80 px, h1 ≥ the title's 56.23 px, h2 ≥ 44, else h3), place (above /
  beside), share (of the item up to its fields)}`, and counts the numeral as content for `place` (the fill target).
  **Numeral zones: 101 containers, 346 items** (timeline 53, process 19, points 15, items 11, subpoints 3; per plan 1:
  7, 2: 2, 3: 1, 4: 1, 13: 1, 14: 2, 18: 9, 19: 24, 22: 12, 23: 2, 24: 2, 27: 2, 28: 2, 31: 10, 32: 17, 38: 7). Runtime:
  `step-number-title-text`, `timeline-when-title-text`, `item-card` and `compare-column` take `numeral` (items.js
  `numeralZone`: share × item height above, at least the role's line + gap, at most 60 %; beside: share × width, at
  most half): the number (or the year, `when`) at the zone's role - a `display` numeral the larger of display / stat -,
  on the brand's marker when it has one; the steps connector / timeline line runs under the zone, where the catalogue
  draws its axis; item needs and the group's share count the zone. Fill: titles may step one rung further than their
  running text (one rung of running text can be a jump, body 22 → h2 36 px on stripe). Fill bound (catalogueFill
  test, containers within the catalogue's empty share + 15 points): stripe 81 %, bosch 90 %, headspace 90 %, akgmedia
  74 %, hdfc-2 90 %, rukko 69 %, cisco 57 %, notion 82 %, shopify 73 %, the-ken 83 % (C3.1: 62 / 78 / 78 / 55 / 82 / 69
  / 64 / 65 / 78 / 65 - cisco and shopify fell).
  **D8 process labels (content v2.1).** `schemas/content.schema.json` `$id` content.v2.1: a `process` node's optional
  `label` (BLOCKS.process `label` 1–20; fences.js reads `label:`; lower.js puts it on the steps item; source.js points
  the label box - and a short label's number - at `/items/<k>/label`). Drawing rule (engine `itemFlowElements`, the
  step layout's label box): a label of up to 2 characters sits in the number marker on the brand's marker shape; a
  longer one is drawn in a label box over the item (the zone's width beside the fields) at the marker role / the
  numeral role, with no marker shape behind it; without a label the marker is as before. A label on another node type
  is a content warning (unknown field), never an error; v2.0 documents parse unchanged. Generator: roadmaps whose label
  names a year or is not an ordinal get `labels: 'year'` - **20 of 54 records** (years: L18-2, -7, -10, -13, -19, -26,
  L31-1, -10, -11, -17; "Phase 1 · 2026" / "2026–2027": L31-2, -3, -6; Now / Today / Near term: L18-1, -6, -9, -18,
  -22, L31-5; region: L18-21). The review deck's L18-13 slide carries `label:` Now / 2027 / 2028 / 2029.
  **Sheets** (`out/_catalogue/<brand>/{review,showcase}`, stripe / bosch / headspace, before = the 68): the C3.1 gaps
  are closed - bosch review 13–15 and showcase 9–12 and stripe review 2 / 23 have their cards back, stripe review 17 /
  23 / 29 and bosch showcase 4 draw the catalogue's numerals / years at its size band with the text scaled. 0 overflow
  on all 10 golden brands for both decks.
  **Limits (revised).**
  - *Still weaker than before*: running text on cards often stays at body while its title steps up (stripe review 2,
    23, 38; showcase 12; bosch review 6): the fill cannot grow text past the room the zone gives; sub-point / timeline
    lines stay small (stripe showcase 29, headspace showcase 29); a group the catalogue centres leaves an empty band
    above it (stripe review 2, 23, 28); a big numeral zone leaves a gap between the year row and the titles (review 17
    on all three); short years at the display role wrap in narrow timeline columns (headspace showcase 29: "Jan /
    2027"); the steps connector shows between step cards (stripe review 40).
  - *Detection*: L31-12 has no label (its "Phase 1 · 2026" sits over the heading with the description beside it);
    `numeral` is recorded for points containers (15) but a points flow draws its own markers (no zone); the generator
    reads `labels` only on roadmaps, and `match()` does not prefer a `labels: 'year'` record for a slide with labels
    (C4).
  - *Cards everywhere the catalogue rules*: the catalogue rules most of its containers (its editorial `.rt` / `.rb`
    style), so most catalogue slides now draw the Mood's card (owner's D6, as asked); KPI rows on cards make
    `fittedFlow` choose 2 × 2 grids where C3.1 kept a row (stripe review 24).
  - Roles stepped by the fill are capped as in C3.1 (running text ≤ h2, titles ≤ h1).

- C4 (2026-11-03): matching - the catalogue layouts are the first layout source of every content/2 slide by default,
  the 68 the fallback (D1); golden decks re-snapshotted once (owner: "Approve, start C4").
  **Files.** `packages/engine/src/compose/pick.js` (the precedence in its header; `catalogueMatch`, `fallbackWarning`),
  `compose/index.js` (default on, `options.catalogue === false` opts out; the deck's use of each catalogue id passed as
  `options.used`; `result.catalogue` always), `packages/layouts/src/catalogue-key.js` (`keyDistance`, `nearestKey`),
  `catalogue-defs.js` (`match` on by default; the `labels` tie-break; `def.labels` read from the containers),
  `catalogue.js` (`nearest(blocks)`), `packages/cli/src/{index,build}.js` (`--no-catalogue`; `--catalogue` kept as a
  no-op; `--before <dir>` → changed slides, `compare.png` + `index.html`; `report.catalogue` always; `--snapshot` no
  longer refused, `--no-catalogue --snapshot` refused), `packages/ui/src/studio/{LayoutPicker,BrandPanel}.jsx` (a
  `cat-l…` current layout shows "Catalogue L23-6"; picking the kind's default then pins it). Tests: `packages/engine/
  __tests__/catalogueLayouts.compose.test.js` (C4 block), `packages/layouts/__tests__/catalogue-{key,defs}.test.js`,
  `packages/cli/__tests__/catalogue.test.js`, `packages/ui/__tests__/studio.test.jsx`; the S2 / showcase tests that test
  the 68 layouts on content/2 now opt out (`catalogue: false`, stated in each file).
  **Rules** (each with a unit and a negative test):
  - *Precedence* (pick.js): a pinned layout; else the catalogue layouts that take the kind, scored on their own - exact
    family 100 (+1 timeline flavour, +0.5 labels), same combination 60 minus the band distance (1-60, the longer band
    winning a tie) -, the highest winning; only when none scores, the 68 as before (their `match` returns 0-40: aside
    10 / 20, agenda-rows 20, bullets-columns 15, compare 25 / 30, kpi-hero / quotes / image / process shapes 30,
    kpi-nested 40). A tier, not a score race: no 68 score outranks a catalogue match. Shaped processes and nested KPIs
    keep the shape / ring layouts (`drawnElsewhere`, C3); content/1 slides and cover / section / cta are unchanged.
  - *Variety*: equal scores go to the record used fewer times so far in the deck, then catalogue order (deterministic).
    Plans 2 / 14 and 24 / 28 share keys: a second slide of a shared key takes 14 / 28, a third 2 / 24 again; the
    timeline pairs 22 / 32 still go by the flavour.
  - *Year labels* (D8): a record with a process container scores +0.5 when its `labels` (`'year'` on the 20 roadmap
    records) agree with the slide's (a process node with a `label`) - below one band step, so it decides only among
    records at the same band distance (process:4, heading 1-20, description 71-140: labelled → L31-11, unlabelled →
    L31-9). Exact keys of processes are unique, so the family tier never needs it.
  - *Fallback warning*: a content/2 slide composed on the 68 gets a `catalogue` warning, severity **info**: `no
    catalogue slide for "<slide key>": nearest <L-id> "<record key>"` (+ ` (a <kind> layout)` when that record does not
    take the slide's kind; + `; the plans have no <type> block` for block types no record has, which alone are named
    when every block is such). Nearest (`nearestKey`): fewest block-type differences (multiset, order ignored), then
    node-count difference, then band distance of the paired blocks; ties by catalogue order. Not for cover / section /
    cta, shaped processes, nested KPIs, a pinned layout or the opt-out.
  - *Changed slides* in `report.catalogue` leave slide warnings out (the info notes change no drawing).
  **Measured** (`pb build` from the brand folders, showcase.md, before = `--no-catalogue`; the same on every brand):
  | brand | slides changed layout | family | combination | none | overflow |
  |---|---|---|---|---|---|
  | akgmedia, bosch, cisco, hdfc-2, headspace, notion, rukko, shopify, stripe, the-ken | 15 of 38 (each) | 9 | 6 | 23 | 0 |
  Changed slides (all brands): 4, 9, 10, 11, 12, 14, 15, 17, 18, 19, 20, 23, 28, 29, 37 (L31-7, L24-12, L24-13, L23-6,
  L27-8, L36-11, L25-18, L26-2, L26-3, L26-2, L8-61, L29-5, L32-7, L22-7, L24-9). Checks: unchanged on every brand but
  notion (contrast warn → pass). The 23 fallback slides: cover, 2 sections, cta (no note); agenda (items:5 - the record
  exists but is a cards layout), 2 main + aside and 2 main + two asides, KPI hero (kpis:1), chart:4 (plan 26 has 3 / 6), table:5,
  compare tiers (compare:3), quotes ×2, team, logos ×2, image, 4 shaped processes (no note). The review deck
  (catalogue-review.md) keeps 40 exact family + the cover. All 1,077 records: a slide written at the middle of a
  record's bands picks that record's key by default (tested). Sheets: `out/_c4/<brand>/after/{compare.png,index.html}`
  (before = `out/_c4/<brand>/before`, git-ignored). `golden/expected/<id>/deck.json` rewritten by `pb build --snapshot`
  only (equal to the `after` build).
  **Limits.**
  - *Snapshot metrics*: under the snapshot Moods (`golden/expected/<id>/mood.json`, no advance widths: every glyph at
    avgCharWidth) cisco's showcase slide 15 (L25-18, KPI body at bodySmall) overflows its 421 × 63 px frame; built from
    the brand folder (the face's widths: the golden deck) it does not. Listed in `showcaseV2.test.js`
    (`SNAPSHOT_OVERFLOW`), not fixed: the KPI cell's height is a C3 / C3.1 layout rule, not matching.
  - *Kinds*: the candidates are the catalogue layouts that take the slide's kind (the C3 `kinds` lists): a slide
    written `kind: agenda` with items keeps agenda-rows although L24-16 has its key (named in the note).
  - *Severity*: the fallback note is `info` (a gap of the catalogue, not of the content), so the compose check's status
    does not change; C5's catalogue check is to show it.
  - *Studio*: `list()` / `forKind()` and the picker still list the 68 (C6 browses the catalogue); unpinning a slide
    pinned to a 68 layout returns it to the engine's pick, which may be a catalogue layout; a new slide from the
    slide-kind picker (the kind's default, unpinned) composes on the catalogue when its skeleton has a record. The UI
    bundle (`npm run build:ui`) was not rebuilt.

## 5. Decisions for the owner

- **D1** The catalogue is the first layout source for content/2 slides, the 68 layouts the fallback (content/1 and the
  golden decks untouched until a re-snapshot is approved after C3).
- **D2** `BLOCKS` design-intent ranges move to the plan's bands (heading 1–20 / 21–60, description 1–70 / 71–140,
  value 1–6 / 7–12, body 1–70, bullet 1–70 / 71–220, paragraph 1–80 / 81–400) so the length counter in the Studio and
  the match use one vocabulary.
- **D3** The block vocabulary grows after C4 (content v2.1): chart forms and table kinds as `chart.form` / `table.kind`
  values, new text blocks (statement, callout, checklist, Q&A, pros / cons), each with a catalogue slide as its
  reference — one PR per group, never all at once.
- **D4** C2's measurement runs headless Chrome once per catalogue version and checks the result in; the conversion
  itself never opens a browser.
- **D5** The catalogue's grounds (dark slides) and hairlines are composition hints only; the Mood's surface rhythm
  decides a slide's ground (rule 3).
- **D6** (owner 2026-11-02, after the C3 sheets) A container the catalogue separates with rules or hairlines takes the
  Mood's card: the card is the brand's grouping device, so no slide loses the cards the 68 layouts drew (amends D5 for
  grouping; the catalogue's rules themselves are still not drawn).
- **D7** Steps and timelines get the room the catalogue's numerals or years take: the geometry records each item's
  numeral box, the number marker or the year is drawn at the numeral's size band, and the text takes the rest.
- **D8** A content/2 process node may carry a `label` (content v2.1: "2026", "Now", "Phase 1") drawn in place of the
  number marker, so a roadmap's phase labels are kept.
