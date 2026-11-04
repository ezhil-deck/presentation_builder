# S2 — Layouts for the content/2 blocks (S2.a slice 2)

Status: built 2026-11-01 from docs/PLAN-studio.md §3.2 / §3.3 and the reference catalogue
(docs/research/preset-content-catalogue.md §2, §3, §6). Not yet reviewed by the owner in the Studio. **Slice 3**
(2026-11-01, §6–§7): the remaining aliases removed - every content/2 field draws as itself.

Code: `packages/layouts/src/` (`kinds/aside.js`, `kinds/process.js`, `kinds/kpi-hero.js`, `kinds/bullets.js`
`bulletsColumns`, `shapes.js`, `icons.js`, item layouts in `items.js`), `packages/engine/src/compose/`
(`summary.js` `blocks[]`, `pick.js` match + shape warnings, `bind.js` group headings, `slots.js` shape / icon / KPI /
points drawing), `packages/engine/src/content/lower.js` (aliases removed for the fields below). Sample:
`content/samples/all-blocks.md` (44 slides: every block type, the 12 process shapes, 7 main + aside slides, two
columns of points). Tests: `packages/layouts/__tests__/s2.test.js`, `packages/engine/__tests__/s2Layouts.compose.test.js`.

**content/1 is untouched**: a layout reads the new summary fields only when `summary.v2` is true (a content/2 slide),
pick() scores layouts only for content/2 slides, and every v1 kind keeps its v1 layout first in `forKind`. The 10
golden decks are byte-identical.

## 1. How a layout is chosen

- `summarize(slide)` now gives `v2` (content/2 slide) and `blocks: [{type, nodes, shape?, ordered?, title?, fields[],
  icons[]}]` — the slide's blocks as written (node count, the node fields any node carries, the icon names asked
  for). The old `{type: count}` map is `blockCounts`.
- A LayoutDef may carry `kinds` (other slide kinds it can take: a main + aside slide is inferred as either block's
  kind by `inferKind`) and `match(summary) → score`. `catalogue.forKind(kind)` returns the kind's own layouts (the v1
  default first) then every layout listing the kind in `kinds`. `pick()` on a content/2 slide takes the highest
  score > 0 among `forKind(kind)`, else the default. A pinned layout (`layout:` / Studio override) still wins.
  Since C4 (2026-11-03, docs/PLAN-catalogue.md §4) the catalogue layouts (`cat-l<plan>-<n>`) are scored first on every
  content/2 slide and these layouts are the fallback (compose option `catalogue: false` / `pb build --no-catalogue`:
  these layouts only).
- Every def has a short `label` and `tags` for the Studio's picker.

### Layout family table

| id | kind (schema) | blocks it takes | variants | signals it reads |
|---|---|---|---|---|
| `steps-aside-{right,left,below}` | steps | `process` (any shape) + aside | right 7/5, left 5/7, below (row) | grid.gutter, spacing.lg, the aside's roles (below height), components.steps (linear), the shape (§2) |
| `chart-aside-*` | chart | `chart` + aside | same | as above |
| `table-aside-*` | table | `table` + aside | same | mood.tables.maxRows / maxCols |
| `image-aside-*` | image-text | `image` + aside (not paragraph: that is `image-text`) | same | decor.imagery mask |
| `cards-aside-*` | cards | `items` + aside; items + items = two lists 6 + 6 | same | components.card, steps marker (numbers) |
| `kpi-aside-*` | kpi | `kpis` + aside | same | stat / kpi label roles |
| `bullets-aside-*` | bullets | `points` + aside; paragraph + points; points + points 6 + 6 | same | type.bullets |
| `process-{cycle,funnel,pyramid,stack,hub,ladder,quadrant,venn,tree,converge,diverge}` | steps | one `process` of that shape, node count in range | the picker swaps shapes | §2 |
| `kpi-hero` | kpi | one `kpis` block with one node | — | display / stat role sizes |
| `bullets-columns` | bullets | one `points` block over 6 points | the "two columns" pick | type.bullets (glyph, colour, indent), grid.gutter |
| v1 `cards` | cards | `items`: group heading (`title`), `item-card` when items carry icon / image / label | — | components.card, components.icon, decor.imagery.crop, components.steps.marker |
| v1 `kpi` | kpi | `kpis` with body → `kpi-value-label-body` and 3 more body lines; with images → full body height | — | kpi labelStyle, bodySmall |
| v1 `bullets` | bullets | `points` whose icons resolve → a points flow (icon markers) | — | components.icon |

Aside blocks: `points` (a list box), `items` (a column / row of rich item cards), `paragraph` (a body box, top
aligned), `kpis` (a column / row of KPIs). Main blocks (most graphic first): process, chart, table, image, items, kpis,
points. pick() prefers the aside **below** for a KPI aside, else **left** when the aside is written before the main,
**right** when after. The aside below takes its height from its own roles (KPI: stat + 2 label lines (+ 3 body
lines); paragraph 4 body lines; items: card padding + heading 2 + body 3; points: one bullet line per point), at most
45 % of the body area.

Item layouts added: `item-card` (thumbnail at `decor.imagery.crop.defaultRatio` ≤ 45 % of the card, icon in the
brand icon's room or the steps number marker, label in `eyebrow`, heading `card.titleRole`, body `card.bodyRole`;
a heading that needs fewer lines gives the rest to the body), `kpi-value-label-body`, `kpi-hero` (value in the larger
of display / stat, left 5 columns; heading h2 + body right 7), `point-marker-text` (marker one bullet line square, or
the icon room; text at `type.bullets.indent`). `step-number-title-text` shows a resolved icon in the marker's square.

## 2. Process shapes

`catalogue.processShape(shape, {mood, frame, n, body, icon})` (packages/layouts/src/shapes.js) returns nodes (box, inner
text frame, alignment, paint `card` / `accent` / none) and marks (lines, ellipses, polygons) in canvas px with token
refs; the engine paints them (`slots.js shapeElements`). Plain geometry only: rect, ellipse, line, polygon (PPTX-safe).
Connectors: `shape.divider.color` / `weight` (else `border` / `shape.borderWidth`, 0 → the rule width); with
`components.arrow` (head ≠ none) its colour, stroke and an arrowhead. A literal connector colour that hardly differs
from the slide background (contrast < 1.5) takes the surface `border`. Nodes on `card` use the brand's card component
(fill, border, radius, shadow; flat → bare text); the one node a shape centres on uses `accent` with the card radius.
Node text colour: the first of the surface's cardText / text / heading / bg, then the other surfaces' cardText / text,
that reaches 4.5 : 1 on the node fill. Heading role h3, body role body (as steps); one shared size per part across
the nodes; a resolved icon sits on top of the node text at the brand icon size (container from
`components.icon.tokens container.*`). Node ranges (`SHAPE_RANGES`): linear 2–8, cycle 3–8, funnel 3–6, pyramid 3–6,
stack 2–6, hub 3–8, ladder 2–6, quadrant 4, venn 2–3, tree 3–8, converge 3–8, diverge 3–8. Outside the range the
process is drawn as linear steps and the slide carries a content warning
(`process.shape "x" needs a–b nodes (has n): drawn as linear steps`); a pinned shape layout that does not fit says
`layout "process-x" needs …`.

- **linear** — today's `steps` layout: the `step-number-title-text` flow, direction from `components.steps.tokens.orientation`,
  connector line when `tokens.line`.
- **cycle** — n cards on the ellipse inscribed in the main frame (first node at the top or turned half a step,
  whichever gives the larger boxes), sized by a deterministic search (width 100 → 30 %, height 100 → 50 %) so no two
  boxes come closer than spacing.xl (else 2 × spacing.lg); a connector from each node to the next, the last back to
  the first, clipped to the box edges.
- **funnel** — n trapezoid bands stacked in the left 5 of 12 columns, narrowing downwards to a 35 % tip; each node's
  heading + body in the right 7 columns, vertically centred on its band.
- **pyramid** — as funnel, widening from a point at the top (band 0 is a triangle).
- **stack** — n full-width layers (card component), heading in the left 4 of 12 columns and body in the right 8 of each
  layer, vertically centred; layers at most 1.5 × the row's need tall, the block centred.
- **hub** — node 0 in the middle third (accent), the spokes in two columns in the outer thirds (first half left),
  rows centred; a line from the middle of the hub's side to the near side of each spoke (inside the gap columns).
- **ladder** — n columns rising left to right, bottom-aligned; the first as tall as a node needs (three body lines from
  five nodes), the last the full height; text at the top of each step.
- **quadrant** — four cards in a 2 × 2 grid with 2 × spacing.lg between them; two axis lines (divider) through the gaps.
- **venn** — 2–3 circles (accent outline at the divider weight) in a row, overlapping by 30 % of the diameter; each
  node's text centred in its circle's free part (no text in the overlaps).
- **tree** — node 0 the root (accent) at the top centre, the others in one row below; elbow connectors (trunk, bar,
  one branch per child, arrowheads with the brand arrow); the tree centred vertically.
- **converge** — n − 1 inputs stacked in the left 5 columns, the last node (accent) centred in the right 5; lines from
  each input to a bus in the middle 2 columns and one line (arrow) into the target.
- **diverge** — the mirror: node 0 (accent) on the left, n − 1 outputs on the right.

Bands (funnel / pyramid) use the card component's fill and border; when that fill hardly differs from the slide
background (contrast < 1.25: an outlined or flat card) they take the accent fill, so the bands stay visible.

Fit: heading 30 / body 60 characters (catalogue §6) fit without overflow for every shape up to 5 nodes on stripe and
akgmedia (tested); hdfc-2 and rukko too, bosch except ladder with 5 nodes. At 6–8 nodes the narrower nodes step text
down and some overflow at the maximum text (cycle 7–8 everywhere; tree, converge, diverge from 6–7; ladder 6; hub 8 on
bosch / hdfc-2): the catalogue's own rule is "more nodes, shorter text" (taghint), so the fitter reports it and
nothing is cropped.

## 3. Node fields now drawn

- `items`: `title` (group heading above the list, h3, slot `<flow>-heading`), `icon` (brand icon by name, else omitted
  with an `icon` info), `image` (thumbnail), `label` (eyebrow above the heading), sequence numbers when no item's
  icon resolves and the brand's steps marker carries a number (on rich cards only, see §5).
- `points`: `icon` as the point's marker (a points flow); more than 6 points → two columns, column-major; ordered →
  `1.` markers, else the brand glyph in the bullet colour.
- `kpis`: `body` under the heading; a single KPI → `kpi-hero`; `image` → the cell background under the brand's
  text-over-image overlay (decor.imagery.textOverImage with opacity > 0), else a thumbnail above the value
  (crop.defaultRatio), else not shown (info); `trend` → a small triangle (up / down) or bar (flat) after the value in
  `components.kpi.tokens deltaColors.<trend>` (no colour → no mark).
- `process`: `shape` (§2), `icon`.

## 4. What is still aliased (content warnings after slice 3)

Nothing in `content/samples/all-blocks.md` (59 slides) is reported any more on stripe, akgmedia or bosch. What a
deck can still hit:

- slide `number` on any layout but the section (`number not rendered on layout "X" until S2.a layouts land`);
- slide `label` when the brand defines no `eyebrow` role (same message, the label is dropped);
- slide `subtitle` on a layout with no subtitle box (none in the catalogue today; a pinned v1 layout of another kind
  can still drop it), `cta` on a layout other than `cta` is set as body text (no warning, as content/1);
- `quotes` with 2–4 quotes on a pinned single-quote layout (`quotes beyond the first not rendered on layout "X"`);
- `kpis.nested` with a node count other than 3 (`kpis.nested needs 3 nodes (has n): drawn as a KPI row`);
- `table` over 8 columns / rows and `image` over 4 images: cut, with a warning (`table has 10 columns: drawn with the
  first 8`, `image has 5 images: drawn with the first 4`); a second image block with treatment background;
- `chart.text.xAxis` / `yAxis` on a chart without axes (pie, donut, funnel, radar, gauge): a chart warning;
- slides with three content blocks compose on the kind's default layout with a binding warning for the block that has
  no slot, unless they are one main (process / chart / table / image) + two asides (S2.b, §8: handled).

## 5. Where this differs from the brief

- **`numbered: true`** is not in the content/2 schema (`items` has `additionalProperties: false`; schema and parser
  were out of scope), so numbers follow the brand rule only, and only on rich item cards (items with an icon, image or
  label, or items in a main + aside layout): a plain items block keeps the v1 card so the upgraded showcase stays
  identical to the content/1 showcase.
- **Venn with 3 nodes** is a row of three overlapping circles, not a triangle (more text room on a 16:9 slide).
- **Hub** spokes sit in two columns beside the hub rather than on a ring (a ring left no room for 60-character bodies
  at 3–5 nodes on the brands with tall card padding).
- **Studio**: `/api/studio/layouts?kind=` now lists the variants; no UI field changed. The UI test
  `packages/ui/__tests__/studio-server.test.js` asserted one layout per kind (18 in all) and was updated to the new
  list (52 layouts; default first). The server builds every layout with `summary {kind, items: 3}` (no blocks), so
  the picker cannot yet filter to the layouts that fit the slide's blocks: passing the slide's `summary` to
  `forKind` / `match` would need a UI change (not made).

## 6. Slice 3: every field draws as itself (2026-11-01)

Code: `packages/engine/src/compose/{keys,dataText,tableCells,media,nested}.js`, `fit/chart.js` (forms + chart text),
`fit/table.js` (rich cells), `compose/{slots,bind,summary,pick}.js`, `content/lower.js` (aliases removed);
`packages/layouts/src/kinds/{compare,quotes,media,kpi-nested}.js`, `common.js` (title block), `items.js` (5 item
layouts); `packages/renderer/src/elements/{chart,table}.js` (polygons, cell fill). Sample: 59 slides. Tests:
`packages/engine/__tests__/s2Slice3.compose.test.js`, `packages/layouts/__tests__/s3.test.js`.

| field | drawn as | signals |
|---|---|---|
| slide `label` | eyebrow line above the title (cover, section, cta, image, every standard title); follows the fitted title's first line | type.roles.eyebrow (absent → dropped + warning) |
| slide `subtitle` (content layouts) | box `title-subtitle` under the title, 1–2 lines from its length; follows the title's last line; the body area starts below it | bodyLarge, else h3 |
| slide `number` | section: above the title (and label) | stat, else display |
| slide `background` / image `treatment: background` | slide background image (cover), one even overlay | decor.imagery.textOverImage overlay + opacity; text < 3:1 on the overlay takes the brand surface text that reads; no rule → no overlay (info) |
| slide `cta` (cta layout) | the button: rect hugging the text + padding, one-character `icon.glyph` on its side | components.button (fill, text, radius, border, padding.0/1, font); none → body role |
| `chart.text` | title (h3) above, source (caption) under the chart element; axis titles (x under the category labels, y above the plot) and legend labels in the geometry | chartLabel role |
| chart `funnel` | centred bars narrowing, category names left, values right | charts.bar.gap, highlight |
| chart `waterfall` | first value = start level, changes float on the running total, a last value equal to the total = closing total from 0; connectors | kpi deltaColors.up / down (else series colour), axes line colour |
| chart `radar` | n spokes from 12 o'clock, grid polygons per nice tick, a polygon per series | gridlines colour (else border), line.width, line.areaOpacity |
| chart `gauge` | half ring 9 → 3 o'clock, track + value arc, value in stat inside, scale ends labelled | palette.chart.muted, charts.highlight, donut.innerRadius (absent → half disc, info) |
| `table.title` / `subtitle` | above the table (h3 / bodySmall) | |
| cell `heading` / `rowHeader` | the header role in the body colour | tables.header.font |
| cell `number` | right-aligned unless the column's `align` says otherwise | |
| cell `check` | brand icon `check` / `cross` (tables.checkIcon.glyph, check, tick / cross, x, close), else ✓ in tables.checkIcon.color (else accent) / tables.checkIcon.emptyGlyph (else ✗) in textMuted; a colour under 3:1 on the slide keeps the text colour | |
| cell `rating` | n dots (0.6 × the cell size, ≤ 10) | accent |
| cell `image` / `logo` | thumbnail two cell lines tall (cover at the crop ratio / contain) | decor.imagery.crop |
| cell `chip` | the chip component (rect + text) | components.chip |
| `highlightColumn` | the column's cells (header too) on tables.highlightColumn.fill, else the accent at 15 % over bg; text that reaches 4.5:1 | tables.highlightColumn |
| `compare` label / image / check | `compare-columns`: banner image, label (eyebrow), header (h2), rows as a list with check marks | crop ratio |
| `compare.tiers` | `compare-tiers`: card component, label, name, price (stat), unit, features; cards as tall as the rows | components.card |
| `image` 2–4 items, `collage` | `image-collage` (also inside any image box): 2 side by side, 3 = 1 tall + 2, 4 = 2 × 2, gutter apart | grid.gutter, card radius |
| `image.treatment: device` | `image-device` (or the image box of image-text): rect of the surface border colour, the image inset as its screen | border, spacing.sm |
| `image.caption` | under each image (caption role); full-bleed: a line under the title | caption role |
| `quotes` 2–4 | `quote-grid`: quote cards (quote role, name, role, photo / avatar rule when any quote has a photo), cards sized to the longest quote | components.card, quote hint, avatar |
| `quotes` photo / label | `quote-photo` (photo left 5 / 12) and a label above the quote | |
| `people` title / subtitle / bio, > 4 people | `person-card` grid (≤ 4 a row, else 3 × 2 / 3 × 3; wide cells put the photo left) under the title + subtitle | personName, personRole, avatar |
| `logos` title / rows / cards | the title (eyebrow) above the wall, explicit rows centred, `logo-card` (logo, heading, body) | logoWall.height, card |
| `timeline` icon / lines | brand icon in place of the dot (the line runs through it), lines as a bulleted list under the body | icon tokens, type.bullets |
| `kpis.nested` (3 nodes) | `kpi-nested`: rings at 100 / 70 / 42 %, bottom-aligned, value + heading in each; bodies listed beside | shape.language sharp → rects; palette.chart.sequential |

## 7. Where slice 3 differs from the brief

- **Chart type in the deck.** `schemas/deck.schema.json` names the native chart types only and is outside this
  slice's scope, so a drawn form reports the native type it reads as (`funnel` → `bar`, `waterfall` → `column`,
  `radar` → `line`, `gauge` → `donut`) and its own name in `chart.form` (extra key; the renderer paints the geometry).
  A schema change (`chartType` enum or a `form` property) is the owner's call.
- **Tabular figures** for number cells are not set: the metrics carry no tnum widths, so the HTML would not land
  where the fitter measured. Number cells are right-aligned only.
- **Compare check rows** use the glyph marks (brand check icons are drawn in table cells only).
- **Gauge maximum**: `values[1]`, else 100 for a `%` unit, else the nice ceiling of the value (warning) - a grammar
  addition (docs/S2-content-v2.md §7).
- **Background overlay** is one even layer at the brand's opacity (a gradient rule is not drawn as a gradient): text
  can sit anywhere on the slide.
- **Studio**: the catalogue now has 59 layouts; `packages/ui/__tests__/studio-server.test.js` asserts 52 and is out
  of this slice's scope (one number to change there).

## 8. S2.b: layouts the showcase v2 review called for (2026-11-01)

Built with showcase v2 (`golden/showcase/showcase-v2.md`, docs/PLAN-studio.md §3.4) from the slice-3 review notes
(PLAN-studio §6). Code: `packages/layouts/src/kinds/{table,aside,agenda,cards,timeline}.js`, `common.js`
(`mainAsides`), `items.js` (`agenda-row`); `packages/engine/src/compose/slots.js`. Tests:
`packages/layouts/__tests__/s2b.test.js`, `packages/engine/__tests__/showcaseV2.test.js`. Every rule reads content/2
summaries only: the 10 golden decks are byte-identical. 68 layouts in all.

| rule / layout | what it does | signals |
|---|---|---|
| table row height | a content/2 table box carries `table.rowHeight` = one cell line + 2 × the density's spacing token (sparse `xl`, balanced `lg`, dense `md`); the composer re-lays the table with `tables.rows.minHeight` raised to min(rowHeight, frame height / row count) and keeps it only when nothing overflows - a short table fills more of its box, a long one never grows past it. No density → rows as fitted | geometry.density, spacing.*, tables.rows.font / minHeight |
| `table-aside-right` | (slice 2, unchanged) table 7 / aside 5 for a table + points / paragraph; its table box takes the row height too | as §1 |
| `<main>-asides-right` (`steps`, `chart`, `table`, `image`) | three blocks = one main (process / chart / table / image) + two asides (points / items / paragraph / kpis, not two paragraphs): main 7 / the two asides stacked in 5, each as tall as its content needs (its role lines, 30–70 % of the column), spacing.lg apart | grid.gutter, spacing.lg / md, the asides' roles, face avgCharWidth |
| `<main>-aside-below-2` | the same blocks: the main above, the two asides side by side below (6 / 6), as tall as the taller needs (≤ 45 % of the body area); KPIs / items in a row of ≤ 3 | as above |
| pick | `mainAsides(summary)` splits a three-block slide (main = the block earliest in MAIN_ORDER; asides in written order, slots `aside-1` / `aside-2`); the asides below when one of them is a KPI block (as for one aside), else stacked right. A paragraph aside's body slot is listed after the list slots (it takes every body block left). The kind is inferred from any of the blocks, so the family is listed under the aside kinds too | |
| `agenda-rows` | an agenda slide whose one block is `items` (agenda with descriptions): one `agenda-row` per item down the body area - the steps number marker, heading (h3) in 5 / description (body) in 7 columns, vertically centred; rows ≤ 3 h3 lines tall | components.steps marker, h3 / body roles, grid.gutter |
| items over four | a content/2 `items` block of 5–10 items takes two rows of ceil(n / 2) cards (every item shown) instead of four plus a capacity warning | |
| six milestones | a content/2 `timeline` of 6 keeps one row of 6; 7–10 wrap to two rows of ceil(n / 2) (the line runs along the first row) | |

Engine rules found on the showcase v2 sheets (slots.js; content/2 only):

- **KPI image cells** take the image as the cell background only when some brand surface text colour reaches the
  brand's `textOverImage.minContrast` (else 4.5 : 1) on the overlay over both a white and a black pixel; otherwise the
  image is a thumbnail above the KPI (info). With a gradient overlay the KPI text keeps to the dense 45 % (bottom by
  default; left / right 60 %). On the golden brands: bosch, cisco, headspace, notion, shopify, the-ken draw the image
  cell; stripe, hdfc-2, rukko the thumbnail (akgmedia: no overlay rule).
- **KPI trend mark**: the value is fitted in its box less the mark's room (0.35 × the value size + spacing.sm), so the
  mark stays inside the KPI's cell.
- **Process node text on a card with a top border** (`border.sides: top`, e.g. rukko's flat card): the text colour is
  read against the card's own fill, never the border strip, and the text starts spacing.sm under the strip.
- **Content/2 card item layouts** (logo / quote / tier / compare / person cards, as item cards already did) take the
  text colour that reads on the card's actual fill (bosch logo cards on the accent surface were white on light grey).

Where this differs from the brief: the three-block layouts are one def per main (`steps-`, `chart-`, `table-`,
`image-asides-right` / `-aside-below-2`), named like the one-aside family; `agenda-rows`, the two-row items grid, the
six-column timeline and the four engine rules above were not in the brief - they are the fixes the v2 sheets needed
(capacity warnings, unreadable text). `packages/ui/__tests__/studio-server.test.js` asserts 59 layouts and is out of
this task's scope: it needs 68.
