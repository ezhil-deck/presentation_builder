# S2 — Content v2: the grammar (block types) and its aliases onto today's layouts

Status: S2.a slice 1 (2026-10-31), built from docs/PLAN-studio.md §3.1 / §3.3 / §3.5 and the reference catalogue
(docs/research/preset-content-catalogue.md §2, §4, §6). Contract: `schemas/content.schema.json` **v2.1**
(`$id …/content.v2.1.json`; v2.1, 2026-11-02: the `process` node `label`, docs/PLAN-catalogue.md D8 - every v2.0
document is a valid v2.1 document). Code: `packages/engine/src/content/` (`parse.js` the Markdown reader, `fences.js` the
fenced blocks, `blocks.js` the vocabulary + ranges, `upgrade.js` content/1 → content/2, `lower.js` the aliases onto
today's layouts, `schema.js` the content/2 validators). Sample: `content/samples/all-blocks.md` (every block type once).

No new layout exists yet: every content/2 block composes onto the v1 catalogue through an alias (§5), and the 10 golden
decks are byte-identical.

## 1. Two versions, one reader

`parseMarkdown(md, { brandSpec, schema? })` returns `content/1` or `content/2`:

- A document written only in the P2 grammar (docs/P2-spec.md §1; the showcase) is read exactly as before and stays
  **`content/1`** — its content hash, so every golden deck, is unchanged.
- A document that uses any content/2 construct is **`content/2`**: a slide front (§2), a content/2 fence (`points`,
  `items`, `subpoints`, `process`, `quotes`, `quote`, `compare`, `paragraph`, `image`), a content/2 field in a shared
  fence (`kpis` with `heading` / `body` / `image`, `timeline` with `heading` / `body` / `lines` / `icon`, `people` with
  `bio`, `logos` with `heading` / `body` / `row` / `rows`, a list fence written as a mapping with `items`, a `chart`
  with `type:` / `text:` or a content/2 chart type, a `table` with `title` / `subtitle` / `highlightColumn` / `rowHeader`
  or rich cells), `schema: content/2` in the front matter, or the option `{ schema: 'content/2' }`.
- In a content/2 document every P2 construct is upgraded (§4), so all its blocks are content/2 blocks.
  `upgradeContent(doc)` does the same for a content/1 JSON document. The composer accepts both versions.

## 2. A slide

```markdown
# The slide title
---
label: Investor update
subtitle: The line under the title
number: "01"
background: assets/hero.jpg
cta: Book a route review
kind: section
surface: dark
layout: section
notes: Speaker notes
decor: false
logo: false
---
```

- `# ` starts a slide; its text is the slide **`title`**.
- An optional YAML fence `---` … `---` directly under the heading (blank lines allowed, as Prettier writes it) holds
  the slide keys: `label` (eyebrow), `subtitle`, `number` (section "01"), `background` (image src), `cta` (button
  text), `kind` (hint), `surface`, `layout` (pinned layout id), `notes`, `decor` / `logo` (`false` = the Studio's
  per-slide override). Values are read as written (failsafe YAML: `01` stays `"01"`); `title:` and unknown keys are
  ignored with a warning; invalid YAML is a warning, never an error.
- `<!-- kind: x -->` stays accepted (the front's `kind` wins). `kind` may also be a block type (`process`, `items`, …:
  §5).
- A single `## text` is the `subtitle`; the first plain paragraph of a cover / section / cta slide is its subtitle
  (unless the front gives one). Two or more `##` make a `compare` block (§3).
- A plain line is a `paragraph` block (one line = one paragraph). `- ` / `1.` lists are `points`; `![alt](src)` is an
  `image` block (adjacent images make one block); `> quote` then `— Name, Role` (or a last `> — Name, Role` line) is a
  `quotes` block (adjacent quotes make one block).
- `{brand.name}`, `{brand.tagline}`, `{brand.imagery.samples[N]}` resolve as in P2 (quote them inside YAML:
  `src: "{brand.imagery.samples[0]}"`); an unresolvable placeholder drops its block / slide key with a warning.
- A slide holds one title block and up to three content blocks; more is a content warning.

## 3. The 14 block types

A fenced block is ```` ```<type> ```` + a YAML body: a **list of nodes**, or a **mapping** of block keys with the
nodes under `items` (`columns` for `compare`; `chart`, `table` are mappings; `paragraph` is text). A bare scalar node
fills the type's main field (`- Two` = `{text: Two}` in points). Unknown fields are ignored with one warning per block;
a block of the wrong shape is dropped with a warning; broken YAML keeps the fence as a paragraph with a warning.

Ranges are design intent (`BLOCKS` in `packages/engine/src/content/blocks.js`, exported for layouts, the fitter and the
Studio): a node count outside `nodes` or a text longer than 1.5 × `maxChars` (`FAR_OVER`) is a content warning, never
an error; the fitter still measures.

| block | nodes | node fields (maxChars) | block keys |
|---|---|---|---|
| `points` | 2–12 | `text` (130), `icon?`, `children?` | `ordered?` |
| `items` | 2–10 | `heading` (40), `body?` (30–160), `icon?`, `image?`, `label?` (15) | `title?` (40) |
| `subpoints` | 1–8 | `heading` (40), `lines[]` (≤ 4 lines, 40 each) | |
| `kpis` | 1–8 | `value` (8), `heading?` (40), `body?` (40–350), `image?`, `trend?` up · down · flat | `nested?` |
| `process` | 2–8 | `heading` (30), `body?` (30–60), `icon?`, `label?` (1–20, v2.1: a phase label - "2026", "Now", "Phase 1" - drawn in place of the number marker: up to 2 characters in the brand's marker, longer in a label box with no marker shape behind it) | `shape?` linear · cycle · funnel · pyramid · stack · hub · ladder · quadrant · venn · tree · converge · diverge |
| `timeline` | 2–10 | `when?` (11), `heading` (30), `body?` (20–90), `lines[]?` (40), `icon?` | |
| `chart` | 1–30 rows | — | `chartType` column · bar · line · area · pie · donut · stacked · grouped · stacked% · funnel · waterfall · scatter · radar · gauge (YAML `type:`), `categories`, `series[{name, values}]`, `text?{title, xAxis, yAxis, legend[], source}`, `highlight?`, `unit?` |
| `table` | 2–8 rows × 2–8 cols | a cell is a string or `{type: text · heading · number · check · rating · image · logo · chip, text?, value?, src?, alt?}`; bare `true` / `false` = a check cell | `title?`, `subtitle?`, `header[]`, `rows[][]`, `align[]?`, `highlightColumn?`, `rowHeader?` |
| `quotes` | 1–4 | `text` (80–200), `name?` (25), `role?` (40), `photo?`, `label?` (15) | |
| `people` | 1–9 | `name` (25), `role?` (40), `photo?`, `bio?` (10–120) | `title?` (60), `subtitle?` (140) |
| `logos` | 1–20 | `src?` / `name?` / `heading?` (20), `body?` (90), `row?` | `title?`; YAML `rows: [[…], […]]` sets `row` |
| `compare` | 2–4 columns | column: `header` (40), `label?` (15), `image?`, `items[{heading (40), body? (20–145), check?}]`; tiers: `price` (10), `per` (40), `features[]` | `tiers?` |
| `paragraph` | 1 | `text` (150–400) | |
| `image` | 1–4 | `src`, `alt?`, `caption?` | `treatment?` side · full · background · collage · device |

`points.children` (the P2 list nesting) and `points.ordered` (a `1.` list) carry what the P2 grammar already had;
`image.focal` is kept from content/1. Slide keys `title` / `subtitle` / `label` have ranges too (60 / 140 / 15).

One example per type:

````markdown
# Agenda
1. Where the quarter landed
2. How the routing engine works

# Points with icons
```points
- text: Fewer empty miles
  icon: route
- Same-day settlement
```

# Why carriers switch
```items
title: Why carriers switch
items:
  - heading: Fewer empty miles
    body: Return loads are matched before the truck leaves.
    icon: route
  - heading: Same-day settlement
    body: Drivers are paid when the delivery is signed.
```

# Regions
```subpoints
- heading: Nordics
  lines: [Two new cold-chain partners, Night routes up 18%]
- heading: Iberia
  lines: [Pilot with 60 owner-drivers]
```

# The quarter
```kpis
- value: €4.2M
  heading: Net new annual revenue
  body: Up from €3.1M in Q2.
  trend: up
- value: "118%"
  heading: Net revenue retention
```

# How a load moves
```process
shape: cycle
items:
  - heading: Load posted
    body: A shipper posts the pickup and drop-off.
  - heading: Match found
  - heading: Delivered
```

# The road to 2027
```timeline
- when: Q4 2026
  heading: Iberia rollout
  body: All pilot drivers move to paid plans.
- when: Q1 2027
  heading: Rail handover
  lines: [Long legs by rail, Short legs by truck]
```

# Revenue by quarter
```chart
type: column
categories: [Q1, Q2, Q3]
series:
  - name: Revenue (€M)
    values: [2.6, 3.1, 4.2]
highlight: 2
text:
  title: Quarterly revenue
  source: Finance, unaudited
```

# Plans
```table
title: What each plan includes
header: [Feature, Starter, Fleet]
rows:
  - [Load matching, true, true]
  - [Same-day settlement, false, true]
  - [Trucks, "10", {type: chip, text: Unlimited}]
highlightColumn: 2
```

# What carriers say
```quotes
- text: The return leg now pays for the diesel.
  name: Ingrid Solberg
  role: Owner, Solberg Transport
- text: Drivers stay because they are paid on time.
  name: Tomás Ferreira
```

# Leadership
```people
title: Leadership
items:
  - name: Maren Holt
    role: Chief Executive
    bio: Ran dispatch for a 400-truck fleet.
```

# Customers
```logos
title: Customers
rows:
  - [Nordkyst Seafood, Brightwater Dairy]
  - [{src: assets/ostra.svg, name: Ostra Retail}]
```

# Pricing
```compare
tiers: true
columns:
  - header: Starter
    price: €290
    per: per month
    features: [Up to 10 trucks, Load matching]
  - header: Fleet
    label: Most chosen
    price: €1,900
    per: per month
    features: [Up to 100 trucks, Same-day settlement]
```

# Before and after
## Before
- Trucks return empty
## After
- Return loads matched before departure

# Why empty miles matter
```paragraph
text: A quarter of all truck kilometres in Europe are driven empty. Matching a return load before the truck leaves is the cheapest way for a small carrier to raise its margin.
```

# On the road
```image
treatment: collage
items:
  - src: "{brand.imagery.samples[0]}"
    caption: Oslo hub at night
  - src: "{brand.imagery.samples[1]}"
```
````

## 4. content/1 → content/2 (`upgradeContent`, and every P2 construct in a content/2 document)

| content/1 | content/2 |
|---|---|
| `title` / `eyebrow` / `subtitle` / `cta` block | slide `title` / `label` / `subtitle` / `cta` (a second subtitle → paragraph; cta url / contact → paragraphs) |
| `list` (nested, ordered) | `points` (`children`, `ordered`) |
| `cards {title, text, icon, image, number}` | `items {heading, body, icon, image, label}` |
| `steps {title, text}` | `process {shape: linear, items: {heading, body}}` |
| `kpis {value, label, trend}` | `kpis {value, heading, trend}`; `delta` dropped (info: no v1 layout showed it) |
| `timeline {when, title, text}` | `timeline {when, heading, body}` |
| `quote {text, attribution, role, avatar}` | `quotes [{text, name, role, photo}]` (adjacent quotes merge) |
| `image {src, alt, caption, focal}` | `image {items: [{src, alt, caption, focal}]}` (adjacent images merge) |
| `columns [{title, blocks}]` | `compare {columns: [{header, image (first image), items (list items: heading = text, body = sub-items; paragraphs: heading)}]}` |
| `chart` (`stackedBar`) | `chart` (`stacked`) |
| `table`, `people`, `logos`, `paragraph` | same fields |

The v1 fence names stay as aliases in content/2: `cards` → `items`, `steps` → `process` (shape linear), `quote` →
`quotes`; `kpis`, `timeline`, `people`, `logos`, `chart` (`chartType` or `type`), `table` read their v1 field names
(`title` → `heading`, `text` → `body`, a KPI's `label` → `heading`, `attribution` → `name`, `avatar` → `photo`).

## 5. Aliases onto today's layouts (until the S2.a layouts land)

`lowerSlide(slide)` (used by `inferKind`, `summarize`, `bindSlots`) turns a content/2 slide into the v1 blocks today's
layouts bind. A content/1 slide is returned as the same object, so content/1 decks compose byte-identically; the
showcase upgraded to content/2 composes to the same slides as the content/1 showcase (tested).

| content/2 | kind | lowered to | not shown yet (one content warning per slide and field) |
|---|---|---|---|
| slide `title` / `label` / `subtitle` / `cta` | | title / eyebrow / subtitle / cta blocks | `label` (no layout has an eyebrow slot), `subtitle` where the layout has no subtitle slot: "label not rendered on layout "X" until S2.a layouts land"; `number`, `background` |
| `points` | bullets (agenda by hint) | list | `points.icon` |
| `items` | cards | cards {title: heading, text: body} | `items.title`, `items.icon`, `items.image`, `items.label` |
| `subpoints` | cards | cards {title: heading, text: lines joined by line breaks} | |
| `kpis` | kpi (one KPI too) | kpis {value, label: heading, trend} | `kpis.body`, `kpis.image`, `kpis.nested` |
| `process` | steps | steps {title: heading, text: body, label} | `process.shape` (not linear: "drawn as linear steps"), `process.icon` |
| `timeline` | timeline | timeline {when, title: heading, text: body + lines} | `timeline.icon` |
| `chart` | chart | chart: column / bar / line / area / pie / donut / scatter drawn natively; stacked → stackedBar; grouped → column (multi-series columns); stacked% → stackedBar of each category's shares (unit %); funnel / waterfall / radar / gauge → column | `chart.text`; "chart type X rendered as column until its layout exists" |
| `table` | table | rows of strings: rich cells as their text, check → ✓ / ✗ | `table.title`, `table.subtitle`, `table.highlightColumn`, `table.rowHeader`, `table.image cells` / `table.logo cells` (shown as their alt text) |
| `quotes` | quote | the first quote {text, attribution: name, role} | `quotes.items` (beyond the first), `quotes.photo`, `quotes.label` |
| `people` | team | people {name, role, photo} | `people.title`, `people.subtitle`, `people.bio` |
| `logos` | logos | logos {src, name (else heading)} | `logos.title`, `logos.body`, `logos.row` |
| `compare` | two-column | columns: header → column title; price + per → a paragraph; features and items → a list (check → ✓ / ✗ prefix, body → a sub-item) | `compare.label`, `compare.image` |
| `paragraph` | text | paragraph | |
| `image` | image; image-text with `treatment: side` or text beside it | image {src, alt} of the first item | `image.items` (beyond the first), `image.caption`, `image.treatment` (background / collage / device) |

A block type used as a kind hint resolves to the same kinds (`BLOCK_KIND_ALIASES` in compose/pick.js). Warnings have
`check: 'content'`, severity `warn`; the Studio shows them per slide.

## 6. Where this slice differs from PLAN-studio as written

- **Version split.** The deck id hashes the parsed content, so a P2-grammar document must stay `content/1` for the
  golden decks to stay byte-identical; only documents using content/2 constructs are `content/2` (§1).
- **Charts.** The engine already draws bar, area, pie and scatter (fit/chart.js), so they are not folded into
  column / line / donut; stacked and grouped keep every series (stackedBar, multi-series column) instead of the first.
- **timeline.body** is shown: the v1 timeline item layout has a text slot (body + lines joined).
- **Additions** to the node fields of §3.1, to keep what content/1 already carried: `points.children` and
  `points.ordered` (nested / numbered lists), `image.focal`, `chart.unit`, `table.align`, `logos.row` (2-D rows), and
  `compare` columns `price` / `per` / `features` (tiers). `kpis.heading` is optional (a P2 KPI may have no label).
- **Unknown fields** in a fence are ignored with a warning; the schema itself rejects them (`additionalProperties:
  false` on every content/2 node and block).

## 7. Grammar additions (S2.a slice 3)

The aliases of §5 are gone: every field of §3 draws as itself (docs/S2-layouts.md §6). What the drawing adds to the
grammar:

- **`chart` `waterfall`**: `values[0]` is the starting level, each next value a change; a last value equal to the
  running total is the closing total.
- **`chart` `gauge`**: `values[0]` is the value, `values[1]` the scale maximum (absent: 100 with `unit: "%"`, else the
  nice ceiling of the value, with a warning). `categories` are not drawn.
- **`chart` `text.legend[]`** replaces the series names in the legend, by position.
- **`table`**: 2–8 × 2–8; more columns / rows are cut to 8 with a content warning. A `number` cell is right-aligned
  unless `align` names the column's alignment; a `rating` cell's `value` is a whole number of dots (0–10).
- **`image`**: up to 4 images (more: the first 4, warning); 2–4 images without a treatment are a collage;
  `treatment: background` makes the first image the slide background (as the `background` slide key).
- **`kpis` `nested: true`** draws exactly 3 KPIs (largest first); another count is a KPI row with a warning.
- **`logos`**: an item with a `body` makes the block logo cards; `rows` lay the logos out row by row.
