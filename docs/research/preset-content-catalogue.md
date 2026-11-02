# Preset content catalogue (reference app pitchdeckdoclist / design_assets)

Research, 2026-10-31. Read-only survey of the reference app's slide presets so presentation_builder can design a richer
content model. **The references are ideas only; nothing here is to be ported.**

Sources (design_assets files dated 2026-10-22; counts from scripts over the files, not from the older skill write-ups):
- `design_assets/commonfiles/json/common-preset-template-menu.json` (the browse menu)
- `design_assets/commonfiles/json/common-preset-template-variations.json` (1,589 presets)
- `design_assets/commonfiles/json/common-default-content.json` (3,955 `add-slide` entries + 7 `add-object`)
- `design_assets/commonfiles/json/table-content.json` (32 table menus, 33 matrices)
- `design_assets/commonfiles/json/taghint.json`, `pitchdeckdoclist/src/editor/core/ai/AiUtils.js:179-250`
- vocabulary: `brand-mood-creator/skills/app-presets-and-menus/`, `skills/preset-catalog/` (menu displayNames and node
  patterns below come from graphite's `graphite-template-menu.json`, the mood every v5 conversion starts from)

Vocabulary. A **preset** is one slide: a `layout` with **containers** (`layout.elements[]`, any depth, each with an
`assettype`). A container points to a **menu** (a template-menu variation = one graphic treatment, with `pdGraphicType`
title / diagram / textbox / table / react_chart / multicolumnlist and a node pattern), carries `nodecount`
{ai_min, ai_max, default}, text **ranges** (`head_range` … `[min,max]` characters) and a `slide-content` key into
`common-default-content["add-slide"]`. The title container has two variants (`title_only`, `title_subtitle`) whose
`propertyConfig.title[]` maps character bands to heading classes. The app fills text to the ranges and still shrinks text
after render (`TextCropHelper`).

## 1. Taxonomy

One browse category, `cat-slide-templates`, with 26 subcategories and 980 references. 975 resolve against the 1,589 common
presets; 5 (`cfg-cover-image`, `cfg-cover-image-title-subtitle-presenter`, `cfg-cover-label-title-subtitle`,
`cfg-section-break-title-subtitle`, `cfg-cta-medium-title-button`) exist only in mood files. 23 refs are `popular`.
**635 common presets are not referenced by the menu** ("unlisted": never shown in browse, used only by the AI picker).
Containers per preset: 1 → 64 presets, 2 → 780, 3 → 660, 4 → 80, 5 → 4 (one malformed entry has no layout). 66 distinct
layout names. (The 2026-10-08 skill count was 685 refs / 25 subcategories / 942 presets; `new` and ~650 presets were added since.)

| subcategory | refs | popular | main container types (presets using) |
|---|---|---|---|
| cover | 21 | 0 | title 18, image 10, presenter 3, logogrid 3, paragraph 2 |
| agenda | 13 | 0 | title 10, agenda_slide 10, list_with_description 3 |
| section-divider | 20 | 0 | title 19, image 13, section_number 2 |
| introduction | 26 | 4 | title 26, image 17, list_with_description 6, simple_list 3, mockup 2 |
| problem | 17 | 0 | title 17, list_with_description 5, image 3, simple_list 3, quotes 2, kpi_block 2 |
| solution | 41 | 1 | title 41, diagram 19, list_with_description 16, simple_list 8, list_with_subpoints 4 |
| framework | 78 | 0 | title 78, diagram 58, venn_diagram 12, list_with_description 11, swot 2, xy_plot 2 |
| process | 139 | 1 | title 137, diagram 107, list_with_description 24, paragraph 12, simple_list 12 |
| goals | 23 | 1 | title 23, diagram 17, list_with_description 4, kpi_block(_with_subpoints) 4 |
| features | 33 | 1 | title 31, list_with_description 18, image 11, simple_list 9, mockup 3 |
| comparison | 39 | 0 | title 30, table 19, list_with_subpoints 7, simple_list 7, comparison 5, logogrid 4 |
| growth | 15 | 1 | title 15, diagram 6, list_with_description 5, chart 3, kpi_block 2 |
| metrics | 73 | 3 | title 72, kpi_block 64, image 10, simple_list 9, kpi_block_with_subpoints 7 |
| charts | 70 | 0 | title 70, chart 51, multi_series_chart 18, kpi_block 11, list_with_description 8 |
| market | 15 | 1 | title 15, kpi_block 5, chart 4, tam_sam_som_block 3, diagram 2 |
| quotes | 24 | 1 | title 22, quotes 18, testimonials 6, simple_list 4, kpi_block 3 |
| case-study | 19 | 0 | title 16, image 10, list_with_description 6, logogrid 3, kpi_block 2 |
| team | 17 | 1 | team_slide 17, title 16, simple_list 2 |
| plan | 36 | 3 | title 36, roadmap 10, timeline 9, simple_list 7, list_with_description 6, table 3 |
| risk | 5 | 0 | title 4, diagram 4 |
| pricing | 7 | 1 | title 7, kpi_block_with_subpoints 3, diagram 2, simple_list 2, table 1 |
| breakdown | 50 | 1 | title 49, list_with_description 24, simple_list 10, paragraph 8, image 5, references 5 |
| next-steps | 35 | 2 | title 26, list_with_description 26, image 6, list_with_subpoints 3 |
| summary | 12 | 0 | title 10, list_with_description 6, image 5, simple_list 3 |
| conclusion | 15 | 0 | title 15, image 6, list_with_description 4, references 3 |
| new | 137 | 0 | title 108, list_with_description 90, simple_list 29, paragraph 20, kpi_block 17, list_with_subpoints 12 |
| **total** | **980** | **23** | |

## 2. Content types (container `assettype`)

Columns: presets using it (all 1,589 / listed 980); menus = distinct graphic treatments; fields = keys of the default
content per node (`[]` = one entry per node); nodes = min/default/max, most common triples; ranges = most common
`[min,max]` character pairs (count). "What it is" from graphite's menu displayNames and node patterns.

| id | what it is | fields per node | nodes min/def/max | text ranges (chars) | presets all / listed | menus |
|---|---|---|---|---|---|---|
| titleandsubtitle | slide title block: label (eyebrow) + title + subtitle, two variants (title only / title+subtitle); menus cfg-title-only (1,491 variants), cfg-title (1,216), split-horizontal (210), split-vertical (140) | title, subtitle, label (347 of 906 entries); cover entries add `placeholder.logos`, `ctaText` | 1 | bands → class, see §6 (title 1–35/36–70/…, subtitle 1–70/71–140, label 1–15) | 1,530 / 897 | 5 |
| diagram | non-linear SVG diagram with text nodes; 49 `graphic_type` families: priority_stack 208, circular_ecosystem 59, generic 52, process 41, funnel 35, fracture_point 33, chess_strategy 32, hub_spoke 19, pyramid 17, layered_circles 16, ladder 15, pathway_progress 9, rocket_launch 9, convergent 8, pillar_columns 8, sunburst 7, lightbulb 7, bridge 7, trophy 7, divergent 7, metamorphosis 6, tree 6, honeycomb 6, iceberg 5, quadrant_map 5, … (menus: Blocks, Chess, Struggling Man, Circular Ring, Loop Sequence, Zigzag, Box/Hexagon Stack) | heading[], body[] (250 of 263), icon[] (70) | 3/4/4 ×193, 5/6/6 ×145, 4/4/4 ×43, 2/4/6 ×36; range 1–8 | head 1–20 (290), 1–25 (209), 1–30 (64), 1–40 (36); body 30–60 (144), 40–50 (140), 40–65 (45) | 670 / 234 | 223 |
| list_with_description | vertical / grid list, each node heading + body, usually with a small icon (cfg-icon-small-list-heading-body 148) or a sequence number; optional group heading | heading[], body[], icon[] (38), graphictitle (65), label (19), image[] (18) | 3/3/3 ×131, 4/4/4 ×98, 2/2/2 ×89, 2/3/3 ×32; range 1–10 | head 1–40 (161), 1–30 (79), 1–25 (71), 1–15 (52), 35–50 (49); body 30–50 (52), 90–110 (50), 120–160 (45), 41–150 (37) | 472 / 257 (494 containers) | 211 |
| simple_list | one-line points with a number on the left/top (cfg-numbered-list-left-sequence-short-points 147) or an icon (Vertical Icon List 16, Grid Icon 6 points) | heading[], icon[] (35), graphictitle (43) | 4/4/4 ×71, 2/3/3 ×59, 5/6/6 ×50, 3/3/3 ×26; range 1–12 | head 50–80 (49), 40–50 (49), 100–130 (49), 21–40 (23), 151–250 (15) | 290 / 117 | 88 |
| kpi_block | number cards: big value + heading + body; single-KPI hero (66 presets, nodecount 1), vertical / grid / horizontal blocks, image-background KPI | data-driven[] (the value), heading[], body[] (126), value[] (30), image[] (24), label (19), checkbox (11), icon (4) | 1/1/1 ×66, 3/3/3 ×43, 2/2/2 ×42, 4/4/4 ×24; range 1–8 | value 1–5 (57), 1–8 (50), 1–4 (25), 1–6 (24); head 1–40 (30), 1–20 (28), 1–30 (25); body 40–350 (22), 41–150 (12) | 216 / 124 | 111 |
| image | single feature image (cfg-image 99), slide-background image via a menuless `dummy` container + `floater-properties.showBackgroundImage` (57), full overlay (10), stock image (5), four-image collage grid (3) | image (string or []) ; some entries also carry title/subtitle/heading/body for the slide | 1/1/10 ×61 (grid cap), 1/1/1 ×11 | none | 175 / 110 | 5 |
| chart | single-series react chart. 56 chart menus: column-simple 68, bar-simple 38, doughnut(-graphic-bg) 35, pie 35, curved-line 5, curved-area 5, then one each: funnel (6 shapes), waterfall, radar, dumbbell (2), polar-area, radial-bar, box-plot, candlestick, bubble, scatter, gauge, bump, kagi, waffle, icon-repeat-fill, asset-scale (2), shape/size-scale comparison, icon-comparison | list[[label, value]] (52), chart-text-content{graphictitle, xaxistitle, yaxistitle, legends[], graphicsubtitle}; pie form: labels[], values[[]], labelheader, itemheader, sourcetextname, prompttext[], projectiontext; graphic-image-bg[] | default 4 ×27, 6 ×12, 5 ×11, 8 ×8 (= rows); max to 30 | none (values are data) | 93 / 63 | 37 (+41 with `other-supported-menu` alternatives) |
| paragraph | one text box (textbox), plain or on a themed / graphic plate | text[] (and the same string in heading[]) | 1 | head 1–280 (27), 150–260 (16), 1–400 (12), 150–400 (9) | 93 / 57 | 6 |
| list_with_subpoints | heading + 2–4 bullet sub-points per node ("\n"-separated body); grid of cards, ruled panel, checked list | heading[], body[] (sub-points joined by "\n"), subheading[] (9), label[] (6), icon[] (2) | 3/3/3 ×8, 2/2/2 ×8, 1/1/1 ×6, 4/4/4 ×6; range 1–8 | head 1–20 (22), 1–40 (21); body 1–40 (7), 20–145 (6), 41–150 (5); subheading 10–40 (13) | 53 / 49 | 44 |
| table | rich table (TableDiagramComponent): standard 31, alternate 19, vertical 3, compare-plans 2, pricing-plans 2, sales-funnel 2, product-roadmap, competitor-comparison, ad-format-comparison, brand-portfolio-scorecard | from table-content.json: menu {title, subtitle, item} → matrix of cells {pattern, elements[{type/subtype, content}], nodealign, mergeInfo}; cell patterns: text-body 505, text-heading 204, tick-wrong 11, text-data-driven 8, text-heading-body 7, image 4; cell element types: text/body 465, text/heading 216, text/data-driven 38, list/checkbox 30, rating 12, group 8, logogrid 4, image/person 4, microchart 4, text/button 3 | `tableGrid` row 2–8 × col 2–8, default 5×4 (×9); matrices 5×4 ×10, 5×3 ×4, 6×4 ×4, up to 10×8 | cell text free | 45 / 30 | 10 |
| quotes | one quote with name + role (+ photo), or a 2–4 quote grid / split | quote[], name[], designation (string or []), person[] (15), label (5) | 1/1/1 ×11, 3/3/4 ×6, 4/4/4 ×3 | quote 80–200 (25); name 5–25 (15); designation 10–40 (11); label 5–15 (4) | 30 / 23 | 18 |
| agenda_slide | numbered agenda rows (numbers left / right / with description) | heading[], body[] (3 of 4) | 2/2/2 ×4, 3/4/4 ×3, 4/6/6 ×3; up to 8/9 | head 1–40 (14), 1–26 (5); body 50–80 (5) | 26 / 10 | 5 |
| roadmap | dated phases (vertical number timeline, horizontal roadmap, progress track) | heading[], body[], label[] (dates, 9), value[] (5), icon[] (2) | 2/8/8 ×5, 2/3/3 ×3, 4/4/4 ×3, 5/5/6 ×3 | head 1–20 (6), 1–40 (5), 1–35 (4), 41–80 (3); body 21–80 (4), 81–150, 81–250; label 1–20; value 2–11 | 26 / 14 | 14 |
| team_slide | people cards: portrait + name + designation (+ bio), horizontal / grid / vertical | person[], name[], designation[], body[] (bio, 4), title/subtitle (4), ctaText (1) | 3/3/3 ×8, 4/4/4 ×4, 2/2/2 ×4, 6/6/6 ×2; up to 9 | name 1–17 (5), 5–20 (4), 5–25 (4); designation 5–30 (5), 10–40 (4); bio 10–80 … 20–120 (5) | 24 / 19 | 14 |
| timeline | milestones on a line (horizontal, curved, vertical, staircase, half-loop year bar) | heading[], body[], data-driven[] (10) / value[] (7) = the date, label[] (1) | 3/3/3 ×5, 4/4/5 ×3, 2/3/4 ×2; range 2–10 | head 1–20 (9), 1–30 (6); body 20–90 (3), 20–65..155; value 1–5 (4), 1–30 (3), 1–11 (3) | 23 / 15 | 8 |
| kpi_block_with_subpoints | value + heading + bullet sub-points; pricing tiers (label + price + per-unit subheading + features) | data-driven[], heading[], body[] ("\n" sub-points), label[] (4), subheading[] (1), image[] (3) | 6/6/6 ×6, 1/1/1 ×3, 4/4/4 ×3, 4/6/6 ×3 | value 1–5 (14), 1–7 (3), 1–10 (2); head 1–20 (8); body 160–400 (3), 80–90 (3), 50–400 (2) | 21 / 16 | 11 |
| multi_series_chart | grouped / stacked / stacked-percentage column and bar, multi-line (18 menus) | list[[label, v1, v2, v3 …]], chart-text-content{legends[] or multiserieslegend, axis titles} | default 6 ×7, 4 ×4, 5 ×3, 7 ×2; max 8–100 | none | 21 / 20 | 18 |
| references | numbered source / endnote list (list, ruled band, ledger cards, two-column panel) | heading[] (17), body[] (10) | 2/3/3, 2/5/8, 1/6/6; up to 10 | head 21–40 (6), 1–40 (3), 1–50 (2); body 81–150 (6) | 17 / 15 | 8 |
| venn_diagram | 2–3 overlapping circles, optional shared centre text | heading[], body[], icon[] (3), start_point_head (centre) | 2/2/2 ×7, 3/3/3 ×5 | head 1–40 (6), 1–50 (2), 1–20 (2); centre 1–25 (4); body 10–100 | 14 / 12 | 12 |
| logogrid | rows of logos (single, grid, split with text, clientele strip, logo cards with heading/body) | logos[[row], [row]] (2-D), graphictitle (1), heading[]/body[] (3) | 1/1/1 ×6, 2/2/2 ×3, 2/15/20 ×1 | head 1–20 (6); body 80–90 (5) | 12 / 12 | 10 |
| testimonials | longer customer quotes with person, horizontal / split / vertical | quote[] or testimonial[], name[], designation[], person[] | 3/4/4 ×4, 5/5/5 ×3, 2/2/2 ×2, 1/1/1 ×2 | testimonial 80–200 (9), 120–300, 60–280; name 5–25 (5); designation 10–40 | 11 / 6 | 4 |
| mockup | device frame (phone) with a screenshot; one has 3 feature callouts | device[] (file), heading[]/body[] callouts (6) | 1/1/1 ×9, 2/3/4 ×1 | head 1–20; body 10–110 | 10 / 9 | 6 |
| timeline_with_list | timeline whose milestones carry sub-point lists | heading[], body[] ("\n" sub-points), data-driven[]/value[] (date) | 3/4/5 ×6, 2/2/2 ×2 | head 1–20 (6); body 10–185 (3); value 1–5 (4), 2–11 (3) | 8 / 2 | 2 |
| comparison | two-column comparison (multicolumnlist): header per column + items; versus / checked / icon variants | header[], items[{heading[], body[], checkbox[], label[], image[]}], headerlabel[], data-driven[] | 2/2/2 (columns) | head 1–40 (2), 1–20 (2); body 20–145 … 180–260 | 6 / 6 | 6 |
| presenter | cover "Presented by / to" block (photo, name, role, label); profile summary with numbers | person[], name[], designation[], label[], data-driven[] (1) | 1 | name 5–25 | 4 / 4 (+ mood cover presets) | 3 |
| tam_sam_som_block | layered / simple TAM-SAM-SOM, radial segments | label[] (TAM/SAM/SOM), heading[], body[], data-driven[] | 3/3/3 | head 1–20; value 1–5 (2), 1–11; body 30–40, 180–200 | 3 / 3 | 3 |
| swot_matrix | 2×2 SWOT grid | heading[] ×4, body[] | 4/4/4 | head 1–20; body 70–90 | 2 / 2 | 2 |
| section_number | the "01" of a section divider | section ["01"] (+ title, subtitle, image on the slide entry) | 1 | none | 2 / 2 | 1 |
| multi_column_list | feature grid in 2 columns | items[{heading[]}] | 2/2/2 | head 1–40; label 3–15 | 2 / 2 | 1 |
| mini_chart | micro-doughnut per point | microchart[] (percent), heading[], body[] | 3/4/5 | head 1–20; body 10–60 | 1 / 1 | 1 |
| video | embedded video | video[] (file) | 1 | none | 1 / 1 | 1 |
| xy_plot | 2×2 positioning plot with named points | heading[] (points) | 4/4/4 | head 1–40 | 1 / 1 | 1 |

Other container facts: `hide-highlight` (strip `**bold**` markers) on 201 list_with_description, 187 simple_list,
45 paragraph containers; `graphic_type` on 670 diagram containers (the picker's subtype gate); `other-supported-menu`
(alternative treatments picked at random) on 41 chart and 18 table containers; `propertyConfig.primary[]` (per node
field font class / visibility, e.g. `text-quote p3`, `text-designation p5`) on 175 presets.

## 3. Combinations (containers on one slide)

127 distinct multisets. `titleandsubtitle` written as `title`. Top 30 (presets):

| # | combination | presets |
|---|---|---|
| 1 | title + diagram | 279 |
| 2 | title + diagram + simple_list | 155 |
| 3 | title + diagram + list_with_description | 130 |
| 4 | title + list_with_description | 113 |
| 5 | title + kpi_block | 57 |
| 6 | title + image | 44 |
| 7 | list_with_description (no title) | 39 |
| 8 | title + diagram + paragraph | 36 |
| 9 | title + diagram + image + list_with_description | 36 |
| 10 | title + chart | 30 |
| 11 | title + list_with_subpoints | 25 |
| 12 | title + agenda_slide | 24 |
| 13 | title + diagram + kpi_block | 23 |
| 14 | title + kpi_block + list_with_description | 23 |
| 15 | title + simple_list | 23 |
| 16 | title + list_with_description + simple_list | 22 |
| 17 | title + chart + list_with_description | 19 |
| 18 | title + image + kpi_block | 19 |
| 19 | title + kpi_block + simple_list | 18 |
| 20 | title + quotes | 18 |
| 21 | title + roadmap | 18 |
| 22 | title + team_slide | 18 |
| 23 | title + list_with_description + list_with_description | 17 |
| 24 | title + multi_series_chart | 17 |
| 25 | title + list_with_description + paragraph | 17 |
| 26 | title + timeline | 16 |
| 27 | title only | 15 |
| 28 | title + image + list_with_description | 15 |
| 29 | title + venn_diagram | 14 |
| 30 | title + table | 13 |

Next: title + paragraph + simple_list 13, title + image + simple_list 12, title + kpi_block_with_subpoints 12,
title + chart + kpi_block 12, title + references 11, title + testimonials 11, title + timeline_with_list 8,
title + list_with_description + table 7, title + image + list_with_subpoints 7, title + kpi_block + paragraph 7.
Pattern: 49 % of presets (780 of 1,589) are two containers, almost always title + one graphic; the three-container slides pair a diagram or chart with a short list,
a paragraph or a KPI row that explains it; four-container slides add an image.

## 4. Default content

`add-slide` has 3,955 entries; 2,060 are reachable from the 1,589 presets' `slide-content` keys, 1,895 are orphans
(older presets, rules path). 31,607 strings: 2,111 start with "Add", 501 "Describe", 373 "Explain" — the instructional
placeholder voice. The 973 newest entries (`grp-*`) instead carry neutral *sample* copy (fictional companies, realistic
numbers) and encode their own limits in the key: `-h40-b80-n3` = heading ≤ 40, body ≤ 80, 3 nodes; `-t23-s60` = title 23,
subtitle 60; `b20_140-v20-h30` = body 20–140, value 20, heading 30. Assets are file names only: images from
`genericassets/images/default/moods/<imagestyle>/` (bg_9.jpg, team-profile1.png, device_4.jpg), icons
`genericassets/icons/ultimatestroke/*.svg` (655 refs), ultimatebold (114), rounded (57), logos
`genericassets/images/default/logos/` (131) plus `#COMPANY_PRIMARY_LOGO#` / `#COMPANY_SECONDARY_LOGO#` placeholders.
`add-object` (7 entries: chart, multi_series_chart, diagram, multicolumnlist, layout, cover, cta) is the default for a
graphic inserted without a preset; `layout` holds a title and subtitle per size code V/S/M/L/X
("AI Future" 9 chars / "Design Smart Decks" 18 / 43 / 60 / 116).

Examples (verbatim, shortened to the first nodes) and the placeholder pattern:

- **titleandsubtitle** `cover-slide-title`: `{"label":"Document title","title":"Your title goes here","subtitle":"Add a one-line tagline that sums up your story.","placeholder":{"logos":[["#COMPANY_PRIMARY_LOGO#","#COMPANY_SECONDARY_LOGO#"],…]}}`;
  `recommended-tools`: `{"label":"Where to start","title":"Add a title on where to start","subtitle":"Add a short line on who this list is for and how to use it to get started quickly."}`.
  Pattern: label = topic eyebrow; title = "Add a title on/that …"; subtitle = "Add a short line on …".
- **diagram** `market-forces`: `{"heading":["Biggest trend","Customer demand","Competition"],"body":["Describe the biggest trend shaping your market.","Explain what customers want now and how it's changing.",…]}`;
  `grp-title-pillar-hall-icon-pillars-b`: `{"heading":["Verified access","Client-held keys","Live audit trail"],"body":["Every login is checked against device, location and role before data loads.",…],"icon":["genericassets/icons/ultimatebold/default/quality.svg",…]}`.
  Pattern: heading = 2–4 word node name; body = one sentence "Describe / Explain …" per node.
- **list_with_description** `grp-granola-image-tabbed-spine-h50-b120-n3`: `{"title":"Add your company name","subtitle":"Add a short line on what your company does.","heading":["What we do","Who we serve","Why it matters"],"body":["Add what your company does in plain words and the problem it solves …",…]}`;
  `grp-split-pill-rail-intake-actions`: `{"heading":["Add a third weekend cohort","Fold evening coding into weekends"],"body":["180 on the waitlist","Only 64% filled"],"icon":[…]}`.
- **simple_list** `grp-arch-doors-arrow-rail-checklist-c`: `{"graphictitle":["Before go-live"],"heading":["Brief till staff on the sign-up flow","Print QR codes on every receipt","Invite 500 regulars to the beta",…]}`;
  `six-points-agenda`-style lists: `{"heading":["Intro","Problem","Solution","Product","Business model","Next steps"]}`.
- **kpi_block** `describe-problem-statement-kpi-block`: `{"title":"Add a title that sums up what the numbers show","subtitle":"Pick metrics that make the problem impossible to ignore.","data-driven":["10%","25%","40%"],"heading":["of your customers face this problem today. Replace it with a figure from your research.",…],"image":["3metrics_1.jpg",…]}`;
  `grp-gtm-scorecard-kpi-v7-h40-n4`: `{"data-driven":["$4.2M","38","14d","118%"],"heading":["Net new ARR","New enterprise logos","Days to onboard","Net revenue retention"]}`.
  Pattern: value = a 1–8 char figure with unit; heading = what it measures; body = "Explain what this number tells you, where it comes from, and what you plan to do about it."
- **chart** `grp-cost-verdict-column-chart-n3`: `{"list":[["Vendor A","668"],["Vendor B","412"],["Vendor C","540"]],"chart-text-content":{"graphictitle":"Three-year total cost of ownership by vendor","xaxistitle":"Vendor","yaxistitle":"3-yr TCO ($k)","legends":["3-yr TCO ($k)"],"chartsubtitle":"Cumulative cost across all three bids, in $k"}}`;
  pie form `doughnut-react-chart-sty-a`: `{"labels":["Online ads","Video","Events","Email","Other"],"values":[["40%"],["25%"],["15%"],["12%"],["8%"]],"labelheader":"Channel","itemheader":"Share of budget","sourcetextname":"Source: Add your data source","projectiontext":"Projected budget split"}`.
- **multi_series_chart** `grp-title-multi-line-chart-kpi-note-cards-b`: `{"list":[["Q1 25","108","97"],["Q2 25","110","95"],…],"chart-text-content":{"graphictitle":"Net revenue retention by segment, %","xaxistitle":"Quarter","yaxistitle":"NRR %","legends":["Enterprise","Self-serve"]}}`.
- **table** (table-content.json) menu `table-lead-row-rollout-effort`: `{"title":"Rollout effort by metric","subtitle":"Time, consultant days, hardware and training for Deck POS against a legacy rollout.","item":"table_lead_row_rollout_effort"}` → matrix cell `{"rowIndex":0,"colIndex":1,"data":{"pattern":"table-text-heading","elements":[{"type":"text","subtype":"heading","data":{"content":"Deck POS"}}]},"properties":{"nodealign":"right"},"mergeInfo":{"rowSpan":1,"colSpan":1}}`; a checklist cell (`team_pricing_plans`): `{"pattern":"table-tick-wrong","elements":[{"type":"list","subtype":"checkbox","data":{"checked":true}}],"properties":{"nodealign":"center","isColumnHighlighted":true}}`.
- **quotes** `what-a-person-said-quote`: `{"label":"Customer voice","quote":["\"Add a quote that captures one strong idea.\nKeep it short enough to read at a glance,\nand let it speak for itself.\""],"person":["team-profile1.png"],"name":["Name"],"designation":["Role, company"]}`;
  `grp-…-quote`: `{"quote":["We lost a week every month to spreadsheets. Now the close runs itself and my team builds the forecast."],"name":["Marta Lindqvist"],"designation":["Chief Financial Officer, Halden Foods"]}`.
- **testimonials** `testimonials-vertical-testimonial-single`: `{"testimonial":["Add a longer quote from a customer that tells the story of working with you. Describe the problem they had, what you did together, and the result they saw. …"],"name":["Name"],"designation":["Role"]}`.
- **team_slide** `team-spotlight-4-portrait`: `{"label":"Team spotlight","title":"Team name","person":["team-profile1.png",…],"name":["Name",…],"designation":["Role",…],"subtitle":"Add a short line on what this team achieved …"}`.
- **presenter** `presented-by`: `{"person":["team-profile1.png"],"name":["Presenter name"],"designation":["Role, company"],"label":["Presented by"]}`.
- **timeline** `timeline-roadmap-…-b20_140-v20-h30`: `{"data-driven":["Week 1–2","Week 3–4","Week 5–8","Week 9–12"],"value":[same],"heading":["Kickoff","Setup","Rollout","Go live"],"body":["Describe what happens at the start, who is involved, and what needs to be ready.",…]}`.
- **roadmap** `grp-title-change-list-curved-path-roadmap-c`: `{"label":["Q1 2027","Q2 2027","Q4 2027","Q1 2028"],"heading":["Pilot site","Regional rollout","Legacy switch-off","Full review"],"body":["Rotterdam runs the new system first",…]}`;
  `timeline-steps-b20_140-h20`: body with "\n" sub-lines: `"Describe what needs to be set up first.\nNote who does it and how long it takes."`.
- **list_with_subpoints** `grp-title-tucked-premise-rising-five-step-cards-c`: `{"heading":["Cut optional fields","Show costs early",…],"body":["Drop fax field\nAutofill address","Shipping on cart\nNo surprise fees",…]}` (sub-points = "\n"-separated lines).
- **kpi_block_with_subpoints** `pricing-four-tier-cards-list-2`: `{"label":["Free","Pro","Team","Enterprise"],"data-driven":["$0","$10","$20","Contact us"],"subheading":["","per user / month","per user / month",""],"body":["Add the main limit for this plan \n Add a feature it includes \n Add who it's best for",…]}`.
- **agenda_slide** `agenda_slide-rippling-agenda-list-sequence-left-2`: `{"heading":["Intro","Problem","Solution","Next steps"],"body":["Introduce yourself and say why this conversation matters right now.",…]}`.
- **references** `references-single-references-card`: `{"heading":["Primary research","Market analysis","Pilot results"],"body":["Add a short summary of this research, what it covers, and how it supports your solution.",…]}`.
- **logogrid** `cover-client-white-logogrid`: `{"graphictitle":"Trusted by","logos":[["…/client-white-logo-1.png",…5]]}`; `regulatory-compliance-logo-cards`: `{"heading":["Security certifications","Anti-bribery standard"],"body":[…],"logos":[["Badge_1.png","Badge_2.png","Badge_3.png"],["Badge_4.png"]]}`.
- **image** `grp-split-field-pipeline-image`: `{"image":["bg_9.jpg"]}`; `divider-chapter-label-title-image-right-text`: `{"label":"Next steps","title":"What happens next","subtitle":"Add a short line that sets up the next steps …","image":["bg_24.png"]}`.
- **paragraph** `paragraph-title-paragraph-table`: `{"heading":["Add a short paragraph that explains what this table tracks, how to read it, and the main thing your audience should notice."],"text":[same]}`.
- **comparison** `beforeafter-two-col-image-text-2`: `{"items":[{"label":["Before"],"image":["bg_19.jpg"],"heading":["Describe the old way in one short line"],"body":["Explain how things worked before the change …"]},{"label":["After"],…}]}`; `process-multicolumn-list`: `{"header":["Before launch","After launch"],"items":[{"heading":["Plan","Build","Test"],"body":[…]},{…}]}`.
- **venn_diagram** `diagram-granola-venn-with-common-point-2`: `{"icon":[…3],"title":"Add a title on what happens where all three meet","heading":["People","Process","Technology"],"body":["Add the people and skills this depends on …",…]}`.
- **tam_sam_som_block** `market-a16z-simple-tamsamsom-2`: `{"body":["Everyone who could need your offer.","The part you can realistically serve.","The share you expect to win soon."],"data-driven":["$10B","$1B","$10M"],"heading":["Total market","Serviceable market","Obtainable market"]}`.
- **swot_matrix** `framework-granola-swotmetrix-2`: `{"heading":["Strengths","Weaknesses","Opportunities","Threats"],"body":["Add what you do better than anyone else …",…]}`.
- **mockup** `device-screen-1`: `{"device":["device_4.jpg"]}`; **mini_chart** `chart-marriott-horizontal-micro-donut-points-2`: `{"microchart":["40%","30%","20%","10%","5%"],"heading":["Completed","In progress","Planned","At risk","On hold"],"body":[…]}`; **xy_plot**: `{"heading":["Your company","Competitor A","Competitor B","Competitor C"]}`; **section_number** `section-heading`: `{"title":"Add a section title","subtitle":"Introduce the topic and what the points below cover.","section":["01"]}`; **video**: `{"video":["product-walkthrough.mp4"]}`.

## 5. Gaps vs presentation_builder's grammar

presentation_builder (docs/P2-spec.md §1, showcase 24 slides): 18 kinds — cover, section, agenda, bullets, text,
two-column, cards, steps, timeline, kpi, chart, table, image, image-text, quote, team, logos, cta (aliases diagram → steps,
comparison → two-column). Blocks: title, subtitle, paragraph, list (nested / ordered), columns, cards {title, text},
steps {title, text}, timeline {when, title}, kpis {value, label}, chart {chartType column|line|donut, categories, series,
highlight}, table {header, rows, align}, logos {name}, people {name, role}, quote {text, attribution, role}, image {src, alt}.

Reference content the grammar lacks, ranked by presets using it (all / listed):

| rank | reference content | presets | what is missing in the new grammar |
|---|---|---|---|
| 1 | diagram families | 670 / 234 | only a linear `steps`; no cycle / ring (circular_ecosystem 59, loop), hub-and-spoke (19), pyramid / stack (17 + priority_stack 208), funnel (35), layered circles (16), ladder / staircase (15), quadrant (5), convergent / divergent, tree, honeycomb, pillars, plus metaphor art (chess, struggling man, lighthouse, rocket, iceberg, bridge, mountain, trophy); nodes with heading + body + icon |
| 2 | list with description + icon / number / group heading | 472 / 257 | `cards {title, text}` has no icon, sequence number, label or `graphictitle`; reference nodes 2–10 (cards max 4), head ≤ 40, body 30–160 |
| 3 | simple numbered / icon list, grid of icons | 290 / 117 | `bullets` has no numbers-as-design, no icons, no group heading; items 21–250 chars with up to 12 nodes |
| 4 | KPI with heading + body (+ image, icon, checkbox), single-KPI hero | 216 / 124 | `kpis {value, label}` only; no body (126 entries), no image-backed KPI (24), no 1-node hero (66 presets), no checkbox / icon |
| 5 | image treatments | 175 / 110 | no full-bleed background image behind text (57 dummy containers with overlay), no four-image collage (3), no image + KPI (19), image + list (34), image + sub-point list (7) |
| 6 | paragraph as a container beside a graphic | 93 / 57 | paragraph exists only inside text / image-text; reference pairs it with a diagram (36), list (17), KPI (7); 150–400 chars |
| 7 | chart types and chart text | 96 + 21 / 63 + 20 | missing pie, area / curved area, bar (horizontal), grouped / stacked / stacked-percentage (multi-series), funnel (6 shapes), waterfall, radar, dumbbell, polar, radial bar, box plot, candlestick, bubble, scatter, gauge, bump, kagi, waffle, icon-fill, asset-scale; `chart-text-content` (graphic title, axis titles, legend labels, source line), image plate behind a chart |
| 8 | list with sub-points, KPI with sub-points, pricing tiers | 53 + 21 / 49 + 16 | no node-level bullet lists (heading + 2–4 sub-lines), no tier card (label + price + per-unit + features) |
| 9 | rich table cells | 45 / 30 | cells are strings; reference has tick / cross checklist (30 cells), data-driven, heading+body, person image, logo, rating, micro-chart, button, column highlight, row header, merged cells, table title + subtitle + source, grid limits |
| 10 | quotes grid and testimonials with photo | 30 + 11 / 23 + 6 | one quote only; no person photo, label ("Customer voice"), 2–4 quote grids, 80–300 char testimonials |
| 11 | roadmap and timeline with body / sub-points | 26 + 8 / 14 + 2 | `timeline {when, title}` has no body, no sub-points, no icon; roadmap up to 8 phases with 21–250 char bodies |
| 12 | team with portrait and bio | 24 / 19 | `people {name, role}` has no photo, bio (10–120 chars), team title / subtitle, cta |
| 13 | agenda with descriptions | 26 / 10 | agenda = ordered list; reference rows carry a 50–80 char body |
| 14 | references / endnotes | 17 / 15 | no source list (heading 21–50 + body 81–150, numbered) |
| 15 | venn, SWOT, TAM-SAM-SOM, xy plot, mini-chart | 14 + 2 + 3 + 1 + 1 | no overlapping-set, 2×2 matrix, nested market sizes, positioning plot or percent micro-donut per point |
| 16 | logo grid rows, logo cards | 12 / 12 | `logos {name}` is flat; reference has 2-D rows, a "Trusted by" title, logo cards with heading + body, cover logo placeholders |
| 17 | comparison columns with header / checkbox / image / vs | 6 + 2 / 6 + 2 | `two-column` is close but has no column header line, checkbox rows, before / after images or data-driven header |
| 18 | device mockup, video | 10 + 1 | no device frame with screenshot, no video block |
| 19 | cover presenter block, section number, title label / eyebrow, cta text | 4 + 2 (+ mood covers); label on 347 title entries | no presenter (photo + name + role + "Presented by"), no section "01", no eyebrow label on title, no cta button text |

## 6. Sizes: what the references say about text ranges

- **Title bands → heading class** (`propertyConfig.title[]`, character count of the whole string; the band with the
  smallest max wins when there is no text). Most common: title 1–60 → h4 (547 variants), 1–35 → h4 (528), 36–70 → h5 (464),
  1–50 → h4 (420), 1–60 → h5 (284), 51–80 → h5 (194), 50–100 → h5 (152), 60–120 → h5 (80); large titles 1–40 → h3 (35),
  1–60 → h3 (32), 1–30 → h3 (29); cover titles 1–30 → h3, 31–60 → h4. Subtitle 1–140 → p4 (244), 1–70 → p3 (240),
  71–140 → p4 (238), 1–160 → p4 (189), 91–120 → p3 (153), 60–90 → p2 (149). Label 1–10 → l2 (90), 1–15 → l2 (88),
  1–15 → l1 (39). So: a title steps down one class at about 35–60 chars and again at 70–80; a subtitle at 70–90.
- **taghint codes** (AiUtils.js:179-250). Title slides, 2 letters = title, subtitle: S ≤ 12 / ≤ 30, M 13–25 / 31–70,
  L 26–35 / 71–100, X > 35 / > 100 chars (MenuParser.getHintForTitles classifies existing text with S < 15, M 15–40,
  L 41–70, X 70+ for titles and S < 31, M 31–70, L 71–100, X 100+ for subtitles). Node containers, 2 letters =
  heading, body: heading S 0–15, M 16–30, L 31–60, X > 60; body S 0–40, M 41–90, L 91–160, X > 160. Single-field
  code `S#/M#/L#/X#` (simple lists, paragraphs, quotes): 0–24 / 25–60 / 61–120 / 120–160. `D1`/`D2` prefix = a
  data-driven value of 1–2 "digits groups" (KPIs). `taghint.json` turns a menu's code into the allowed codes per node
  count, e.g. `2-primary-small-medium-secondary-large-extended`: 1–4 nodes → SL, SX, ML, MX; 5 nodes → SL, SX, ML;
  6 nodes → SL, ML: more nodes, shorter text.
- **Container ranges** (`[min,max]` chars, keys in `RANGE_KEYS_FOR_FILL`): diagram heading 1–20 / 1–25 / 1–30,
  body 30–60 / 40–50; list heading 1–40, body 30–50 / 90–110 / 120–160; simple-list item 40–130 (up to 250); KPI value
  1–5 / 1–8, heading 1–40, body 40–350; paragraph 150–400 (single node); quote 80–200, testimonial 80–300; name 5–25,
  designation 10–40, bio 10–120; agenda row 1–40 + 50–80; timeline date (`value_range`) 1–5 / 1–11 / 1–30; label 3–15;
  subheading 10–40. Nodes: `ai_min` / `ai_max` / `default` per container (section 2); the picker scores a fit on both.
- **Tables**: `tableGrid` row 2–8 × col 2–8 (default 5×4) is the only size statement; cell text is unbounded.
- **Node fonts**: `propertyConfig.primary[]` names a font class per node field (`text-quote p3`, `text-designation p5`,
  `bodyfontclass`) on 175 presets; otherwise the mood's font-class mapping for `diagram` applies.
- The default-content keys of the newest presets encode the same bands (`-h40-b80-n3`, `-t23-s60`), i.e. the
  author's intended maxima for a given layout; and `add-object.layout` gives the app's own size ladder for titles
  (9 / 18 / 43 / 60 / 116 chars for V / S / M / L / X).
- The app does not guarantee the ranges: text is fitted after render (`TextCropHelper`), so a fitter in the new app should
  treat these numbers as the *design intent* of each container, not as hard limits.
