# External template patterns (Pitch, Chronicle, 2slides)

Research, 2026-11-02. Read-only survey of three public template / gallery sites, asked for by the owner: why their
results look designed, which template patterns they use, and (in §4, by the architect) how that fits our project.
**The references are ideas only; nothing here is to be ported.** No asset, copy, colour or face of theirs is a default for
us (CLAUDE.md rule 3); a pattern only counts where it can be driven by the brand's own Mood.

Sources (visited 2026-11-02; everything on the sites was read as data):

- Pitch: https://pitch.com/templates (index), and four template pages with their slide player:
  [AI Software Sales Deck](https://pitch.com/templates/AI-Software-Sales-Deck-7YVgNT6UF6ho5Znc7P6cYkn8) (31 slides),
  [Wave](https://pitch.com/templates/Wave-4wbXaj2Gs2F25jiQWL2tzfwM) (24),
  [Scale-Up Pitch Deck](https://pitch.com/templates/Scale-Up-Pitch-Deck-2xyWoC7KCN1A5qs3yk6TnqMC) (28),
  [Editorial](https://pitch.com/templates/Editorial-0oEK1D3jxabA58v6tk069rBZ) (25).
- Chronicle: https://chroniclehq.com/gallery (categories Branding, Case Studies, Guides, Marketing, Pitch, Portfolio,
  Product, Proposal, Sales, Strategy, Templates), https://chroniclehq.com/ai-presentation-maker, and four decks:
  [YC Pitch Deck Template](https://chroniclehq.com/gallery/yc-pitch-deck-template) (pitch, 14 slides seen),
  [Lovable: Beyond AI App Building](https://chroniclehq.com/gallery/lovable-case-study) (case study / product, 11),
  [State of AI in 2025 by McKinsey & Company](https://chroniclehq.com/gallery/state-of-ai-in-2025-by-mckinsey-company)
  (strategy, 7), [Notion AI Workflow](https://chroniclehq.com/gallery/notion-ai-workflow) (case study / portfolio, 7
  seen of 18), plus Chronicle's own "Getting started" deck in its web viewer (`app.chroniclehq.com/share/…`).
- 2slides: https://2slides.com/skills (their agent SKILL.md), https://2slides.com/templates (public themes) with three
  themes opened page by page —
  [Retro-futurism Orange Business Template](https://2slides.com/templates/retro-futurism-orange-business-template) (12
  pages), [Google Project Pitch Deck](https://2slides.com/templates/google-project-pitch-deck) (10),
  [Pink and Black Gradient Technology Keynote](https://2slides.com/templates/pink-and-black-gradient-technology-keynote-presentation)
  (8) —, https://2slides.com/gallery (291 decks) with
  [Vista Energy Q3 2026 Earnings Presentation](https://2slides.com/gallery/vista-energy-q3-2026-earnings-presentation),
  and https://2slides.com/prompts (Nano Banana reference images) with
  [Black information cards … monochrome style](https://2slides.com/prompts/black-information-cards-and-a-snow-capped-mountain-background-in-monochrome-style).

Method. Pitch's player renders each slide as live DOM at 1920 × 1080 (`.gallery-player-preview .slide`, scaled by a
transform), so every Pitch number below (box x / y / w in px, font size, face, weight, colour) was read from the computed
styles of the slide itself, then checked against a screenshot of the same slide. Chronicle's gallery pages show each
deck as a column of static slide images (1024 × 576, some taller); 2slides' theme pages show static 1800 × 1013 WebP
previews. For those two, sizes are estimated from the screenshots, not measured. Screenshots stayed in the session
scratchpad; none are in the repo.

Vocabulary as in `docs/PLAN-catalogue.md`: a slide = header (kicker, title) + **zones** in a **shape** (F full, H ½+½,
L ⅔+⅓, R ⅓+⅔, T ⅓+⅓+⅓, optional top / bottom **band**) holding **blocks** (`items`, `points`, `kpis`, `chart`, `table`,
`compare`, `timeline`, `paragraph`, `quote`, image …); the **Mood** gives surfaces, type roles, palette roles, card / line
/ bullet styles, imagery, decor and footer.

## 1. Per-site findings

### 1.1 Pitch (pitch.com/templates)

What a template is: a fixed, hand-made deck of 24–31 slides with placeholder copy written to the box, in one theme
(two faces, two or three ground colours, one image family). Most layouts come **twice** — a light and a dark version, or a
mirrored version (image left / image right) — so a 31-slide deck holds about 15 distinct compositions. The page text names
the narrative it prescribes (AI Software Sales: problem and impact → status quo vs possible → product and features →
traction numbers → how it works). Slides are layout-generated: real text in DOM boxes, never pictures of text.

#### AI Software Sales Deck (31 slides)

Sequence: cover (2 variants) → tagline → company overview (4 variants) → section "The Problem" → problems as three columns
(2) and as rows (2) → status quo statement (2) → customer profiles (2) → why now (2) → previous attempts (2) → section "The
Solution" → product with device (2) → how it works (2) → results KPIs (2) → feature showcase → vision (2) → closing CTA.
Kinds: cover, statement, section, image + text, columns, rows, profiles, statement list, 2 × 2 grid, device, staircase
process, KPI rows, screenshot, quote + photo, closing — 15.

| # | composition (our vocabulary) | measured |
|---|---|---|
| 1 | F, full-bleed photo; title bottom-left, meta line in the bottom band | title PT Serif 160 at x 50 y 725; meta Geist 20 uppercase at y 1002 |
| 2 | H: title top-left ½, phone device cut-out on the right ½ bleeding off the bottom edge | device 602 × 1310 at x 1127 y 101 (taller than the slide) |
| 4–7 | H, half-bleed photo (960 wide, edge to edge) + text ½; four variants = light / dark × photo left / right | title 78 at y 601, two body paragraphs 26 at y 737 / 812: text sits in the lower half of its zone |
| 9 | t·T·: title + three columns (Problem / Challenge / Impact) | columns at x 52 / 698 / 1322, w ≈ 530; headings 45 at y 511; bodies 26 at y 804 — the middle third of the slide is empty on purpose |
| 10 | R: title in the left ⅓ (w 571), three rows on the right ⅔: heading (w 262) + body (w 885) per row, hairlines between rows | rows at y 398 / 625 / 857 |
| 13 | H: eyebrow (20 uppercase) + statement title 78 top-left, one lead line 36 at the bottom-left; photo right ½ bleeding | lead at y 979 |
| 15 | t·T·: three profiles, each a small cut-out portrait + heading 45 + body 26 | portraits 137–382 px, placed at different sizes |
| 17 | H: three statements at 45 serif stacked in the left ½ with hairlines between, small lead 26 above them; photo right ½ | statements at y 739 / 854 / 968 |
| 19 | t·H·: 2 × 2 grid, heading 45 + body 26 per cell | cells at x 50 / 829, y 533 / 826 |
| 24 | t·F·: four steps on a rising staircase (numeral 01–04 in serif 45 + body 26), thin vertical rule at each step | step tops at y 625 / 292 / 521 / 174 (zig-zag rising left to right) |
| 26 | R: title in the left ⅓; three KPI rows on the right ⅔: value 120 serif (x 829) + label 32 sans (x 1297), hairline per row | values at y 420 / 654 / 893 |
| 28 | t·F·: one product screenshot, framed, centred (1383 × 691), caption 26 under it, dark ground | |
| 29 | three columns of text across the top (title / two paragraphs), placeholder portrait left, photo right ⅔ bleeding top and bottom | |
| 31 | F, full-bleed photo; closing line 120 top-left, meta in the bottom band | |

- Grid and margins: one 50 px margin on all four sides (2.6 % of width); thirds at x 50 / 698 / 1322 with ≈ 100 px
  gutters; halves split at 960 with text inset to x 1035. Every text block starts on one of those lines.
- Type: two faces, one weight. PT Serif 400 for display — 160 (cover, section), 120 (tagline, CTA, KPI values), 78
  (slide titles), 45 (item headings, numerals); Geist 400 for text — 36 / 32 (leads, KPI labels), 26 (body), 20 uppercase
  (meta, eyebrows). Nothing is bold. Title : body = 3 : 1, display : body = 6 : 1.
- Colour: two colours only — deep green rgb(26 85 68) and off-white rgb(247 248 243), each the text colour on the other.
  No accent colour. The dark slides carry an oversized soft-focus photo (2227 × 1253 at −154, −86) behind them, so even a
  text-only dark slide has depth.
- Imagery: one family (blurred underwater plants) used full-bleed (covers, sections), half-bleed (overview, why now) and as
  a texture; one device cut-out; one framed screenshot.
- Cards: none. Structure comes from hairlines (rows, KPI rows, staircase) and alignment.

#### Wave (24 slides)

Sequence: cover (3 variants) → point with big image → team → headline + image → list → device → two ideas → quote → video →
image + text (2) → list on dark → three ideas (2) → timeline → table → chart → data (2) → six ideas (2) → contact. Kinds ≈ 17.

- Grid: 24 px margin (1.25 %, tight) with images as rounded panels inset by the same 24 px; columns at x 24 / 497 / 970 /
  1128 / 1443 / 1601 (a 4-column grid with a ½ split at 970). A **bottom band on 20 of 24 slides**: three meta items
  (presentation title, company, date) in 14 px uppercase 500 at y 1034, on the grid lines x 24 / 1128 / 1601.
- Type: Geist 400 for display — 180 (cover, quote mark), 120 (statements, KPI values, timeline numerals), 64 (slide
  titles); Geist Mono for text — 24 uppercase labels, 20 / 500 body. Sans + mono pairing, one weight per role.
- Colour: three grounds from one hue — dark green rgb(25 47 39), mint rgb(207 229 229), off-white rgb(247 247 245),
  rotating slide by slide; the chart (slide 19) uses two greens of the same hue. No second hue anywhere.
- Slide 4: a full-width rounded image panel (1872 × 705) over the top ⅔, title 64 bottom-left, mono body right — a
  **top-band image** shape. Slide 10: quote mark 180 at the top-left, quote 120 mint on dark, attribution 24 uppercase
  above it. Slide 17: timeline as four columns, numeral 01–04 at 120 + label + 3 short lines, on a hairline. Slide 20: H —
  title + paragraph left; three mint KPI panels stacked right (value 120, label 24 uppercase with a 16 px square marker).
  Slide 22 / 23: six ideas as 3 × 2 and as 2 × 3 — the same block, arranged by count and box.
- Markers: 16 px squares as bullets and label markers throughout (the theme's one ornament).

#### Scale-Up Pitch Deck (28 slides)

Sequence (the page names it: mission → market size, with problem framing): cover (2) → mission → contents → mission
statement → problem story (2) → problem list → two problems → the big question (what / why / why now) → stats (2) → quotes
→ section solution → solution → market TAM / SAM / SOM → business model → pricing → competitive matrix → competitors → team
→ roadmap → go-to-market → quote → demo → products → product hero → contact. Kinds ≈ 22.

- Grid: 100 px margin (5.2 %); title always at x 100; recurring H split at x 980 (title and lead left, content right).
- Type: one face, Instrument Sans — 155 (cover, quote mark, contact), 120, 90 (titles), 68 / 64 (item headings, values),
  28 / 500 (labels, prices), 26 / 22 (body). Weight 500 only for small labels.
- Colour: text near-black rgb(23 25 32) / slate rgb(44 48 62); grounds a pale lavender rgb(248 246 254) or a soft linear
  gradient (315° / 132°). The only saturated colour is in the imagery: 3D pastel blobs cropped past the slide edges
  (e.g. 1257 × 1408 at x 940 y −62 on the cover).
- Cards: white translucent rounded panels ("frosted") for problems (2 cards), questions (3), stats, pricing tiers (3 cards:
  tier 64, price 28 / 500, feature list 26).
- Slide 4 contents: ten entries in two columns, numeral 22 + name 68 — an agenda that fills the slide by type size.
  Slide 16 market: concentric circles with values 64 + labels, the circles themselves the chart. Slide 22 roadmap: R —
  title left, Q1–Q4 on a vertical line right with milestone + one line each.

#### Editorial (25 slides; the page: "dark and light slide variations")

Sequence: cover (2) → section 01 → make your point → team (2) → headline + image → device → two ideas (2) → quote → video →
headline + image → list → headline + text → three ideas → two ideas → timeline → table → chart → data (2) → six ideas →
four ideas → contact. Kinds ≈ 18.

- Grid: 48 px margin (2.5 %); a 4-column grid at x 48 / 509 / 970 / 1431 (w 441, 20 px gutters) and a 3-column grid at
  48 / 663 / 1277 (w 595). Cover and contact text sit on a centred column x 355, w 1209.
- Type: Instrument Serif 400 for display — 200 (cover, section, KPI values), 140 (titles, quote), 56 (item headings, list
  points, names), 34 (meta values); Public Sans — 26 body, 22 / 700 uppercase labels. Weight contrast only in the tiny
  labels.
- Colour: charcoal rgb(36 36 36), cream rgb(247 243 226), white — three grounds, no accent; dark slides ≈ 8 of 25.
- Slide 1 cover: photo full-bleed, uppercase serif title 200 on the centre column, a top band with two label / value pairs
  (left and right), description 26 at the bottom. Slide 3 section: numeral 200 in the left column + uppercase title 200.
- Slide 14 list: R — label left ⅓, **six short points set at 56 serif** on the right ⅔ (the list itself becomes display
  type). Slides 21 / 22 data: **three KPIs at 200 vs four KPIs at 140** — the same composition, the value size stepping down
  with the count. Slides 16 / 17 / 23 / 24: three ideas, two ideas, six (2 × 3), four (2 × 2) — dot marker + heading 56 +
  body 26; type sizes fixed, arrangement by count. Slide 18 timeline: four columns on one horizontal rule with a dot per
  step.

### 1.2 Chronicle (chroniclehq.com/gallery)

What it is: a web-first presentation tool ("storyline" → chapters → slides of **widgets**, with motion and interactivity);
the gallery shows real users' and Chronicle's own decks. Its marketing names the structure it generates (hook, problem,
solution, proof) and a brand kit (logo, colours, fonts, backgrounds). Slides are layout-generated; some are taller than
16 : 9 (images 984 wide × 984 tall in the gallery), i.e. a slide can scroll. Each slide carries a "Made with Chronicle" chip.

#### YC Pitch Deck Template (pitch; "Bento Coach" sample, 14 slides)

1 cover: centred app icon, name, one-line description, blue-grey gradient ground. 2 problem: a row of four portrait photos
(lifestyle, same person) across the top band, statement title where the key words are dark and the rest mid-grey, two body
columns below. 3 product: title + lead left ½, two overlapping phone mock-ups right. 4 market: title top-left, two
overlapping outline rings (a Venn) with a dollar figure in each, short body bottom-left. 5 product detail: left ⅓ text with
two numbered feature lists, right ⅔ tinted panel with a phone. 6 how it works: t·T·, three cards (illustrated UI tile +
heading + body). 7 business model: portrait photo left ⅓ bleeding top, 2 × 2 pricing cards right with chip labels.
8 traction: three cards. 9 testimonial: H, portrait photo left, large quote right behind a vertical rule. 10 category:
three cards, the middle one raised and tinted ("the sweet spot"). 11 team: title left ½; right ½ rows of portrait + name /
role + two bullets, rows divided by rules. 12 path to revenue: lead paragraph + KPI rows with rules left ⅔, aerial photo
right ⅓. 13 the ask: two statements on a blurred photo + use-of-funds chips in the bottom band. 14 closing: the product name
as a huge wordmark bleeding off the bottom edge of a gradient panel, contact in two columns below.

- One grotesque sans in two or three sizes (title ≈ 4 × body); one cool gradient ground carried through the deck; photos
  on every other slide; cards on white with soft grey fills.

#### Lovable: Beyond AI App Building (case study / product, 11 slides)

1 cover: dark-to-blue-to-orange grain gradient, logo, mono eyebrow ("case study n° 001 · month"), title, subtitle. 2 process:
three steps as gradient tiles with brand icons, joined by arrows, heading + body under each. 3 frictions: t·T· on a dark
red gradient — line icon + heading + three bullets per column. 4 the question: one centred sentence on the gradient. 5 a
typographic list: one fixed lead phrase with four alternatives stacked under its last word (alignment on a word, no
bullets). 6–8 "as a thinker / designer / builder": H — left text with a counter "1/4" and a hairline, right a gradient
panel holding chat-message cards (UI as illustration). 9 statement on a blurred city photo. 10 closing: portrait + question
+ contact row.

- Display sans for titles, a serif for body paragraphs; one gradient family as the deck's surface; counters and eyebrows
  as recurring furniture.

#### State of AI in 2025 by McKinsey & Company (strategy, 7 slides)

1 key takeaways: eyebrow in accent blue, a headline paragraph in serif where the first clause is black and the
continuation grey, four KPIs in the bottom band (value in accent blue, small label, vertical rules between), a footer band
(date left, deck title right). 2 L: area chart ⅔ + stacked phase bar ⅓ with labels. 3 R: three KPIs stacked left ⅓,
two-column table right ⅔ with hairline rows. 4 H: KPI 2 × 2 left, stacked column chart right. 5 H: eyebrow + paragraph
left, large grey circles with figures right, bleeding off the edges. 6 F: one centred serif paragraph in white on a full
accent-blue ground (the deck's single colour slide). 7 summary: six numbered findings in two columns, numerals in accent
blue, rule above each.

- One accent (blue) used only for numbers, eyebrows and one full slide; serif headline + sans labels; white ground; the
  footer band on every slide.

#### Notion AI Workflow (case study / portfolio, 7 of 18 seen)

1 cover: centred serif title alone on cream. 2 title + meta row in a top band, one full-width photo under it. 3 product: a
logo + name header, three pastel-tinted cards each holding a cropped screenshot. 4 H: logo + serif title left, a stack of
screenshot panels right. 5 / 6: small logo row + stamp label + serif title left, overlapping screenshot collage right.

- Serif display + sans UI; screenshots and the brands' own logos are the imagery; cards tinted from a pastel set.

### 1.3 2slides (2slides.com)

Inputs (from their SKILL.md on /skills; seven MCP tools):

| route | what it takes | what it returns | cost |
|---|---|---|---|
| Fast PPT (`slides_generate`) | `content` (text / outline), **`themeId` (required, from `themes_search --query "business"` …)**, `language`, sync / async | an online deck + PDF (.pptx per the MCP listing) | 10 credits / page |
| Create PDF slides (`slides_create_pdf_slides`) | `content`, `designStyle` (free text, e.g. "modern minimalist, blue color scheme"), aspect ratio (1:1 … 21:9), resolution 1K / 2K / 4K, `page` (0 = auto), `contentDetail` concise / standard | image pages + PDF | 100–200 credits / page |
| Create like this (`slides_create_like_this`) | `content`, **`referenceImage` URL**, same options | image pages + PDF | 100–200 credits / page |
| narration, download | job id, voice (30), single / multi speaker | WAV + transcript, PNG pages | 210 / free |

- A **theme** is a pre-built template deck: name, an id `st-<timestamp>-<suffix>`, tags (e.g. pitch deck, keynote, 12
  pages, orange, retro-futurism), N sample pages. The theme pages and the `themeId` input appear to be the same thing (the
  id format is the only link I saw; not verified through the API).
- Two engines, from the evidence: **Fast PPT is layout-generated** (cheap, editable, styled by the theme file);
  **"Nano Banana" is image-generated** — the whole page, text included, is one generated picture (the cost is per image,
  the export is PNG / PDF, and the reference images on /prompts are single bitmaps with baked-in text).

Theme evidence (static 1800 × 1013 previews):

- Retro-futurism Orange (12 pages): three grounds rotating — orange, black, beige; titles in a wide geometric sans,
  uppercase, ≈ 3 lines filling half the slide; thin line-art decor (a starburst, a star outline, a wireframe funnel, a
  dotted world map) cropped past the edges; KPIs as three big filled circles (orange / black / white) with a figure each;
  icons in filled circles in a row; an agenda as four "Chapter n" pairs on black. The same placeholder paragraph repeats on
  most pages (hand-made sample copy).
- Google Project Pitch Deck (10): yellow / black / white / blue grounds; one big arrow graphic as the theme's motif;
  H with a photo half; numbered circles 01–03 in three different colours stepping diagonally; a deliverables table on
  yellow; a roadmap with dates on an arrowed line; resource cards stacked in three tints.
- Pink and Black Gradient Technology Keynote (8): dark purple-black with flowing magenta line art; title with one
  accent-coloured phrase; glassy rounded cards in 2 × 2 numbered 01–04; icon tiles in magenta; stock tech photos framed with
  rounded corners.

Output evidence: the **gallery (291 decks) is mostly real companies' investor / earnings decks** reposted page by page
(e.g. Vista Energy Q3 2026, 11 slides), each offered for download and with "Make slides in this style", which uses that
deck's cover as the reference image. The **/prompts** page is a set of reference images for Nano Banana, e.g. "Black
information cards and a snow-capped mountain background in monochrome style": one dense infographic page — uppercase
title and subtitle, a paragraph, then three zones (a 2 × 3 grid of dark icon cards, a hub-and-spoke diagram, an icon list)
and a bottom takeaway line, a mountain photo fading in at the top-right. These pages look rich because the image model
packs illustration, icons and diagram into one bitmap; the text is not editable and the faces are whatever the model
draws.

### 1.4 What would not transfer to a brand-driven generator

- **Hero imagery made for the template** (Pitch's underwater photos, Wave's renders, Scale-Up's 3D blobs, Lovable's
  gradients): each theme owns one image family. A brand only has what its JSON / assets give; we cannot assume a texture
  per brand.
- **Copy written to the box**: every Pitch placeholder is cut to fit its column (three statements of one line each, KPI
  labels of two lines). Real outline content is longer and uneven.
- **Device mock-ups and screenshots** need product screenshots the brand rarely supplies.
- **Image-generated pages** (2slides Nano Banana): no editable text, no exact brand faces, no consistency guarantee across
  pages — outside our offline, layout-based model.
- **Scrolling slides** (Chronicle's taller-than-16:9 slides) and live widgets / motion.
- Hand-picked portrait sets (team rows with real faces, lifestyle photo strips).

## 2. Cross-site pattern table

| pattern | where seen (slide) | in our vocabulary | what it needs from the brand |
|---|---|---|---|
| Few type sizes with big jumps, one weight | Pitch AI Sales (160 / 78 / 45 / 26, all 400); Editorial (200 / 140 / 56 / 26); Wave (180 / 120 / 64 / 20) | type roles: display, title, item heading, body, label — 4–5 roles, ratio display : body ≥ 5 : 1, title : body ≈ 3 : 1 | its faces and the size ladder (F-ladder); weights only where the brand uses them |
| Display serif (or display sans) + text sans / mono | Pitch AI Sales (PT Serif + Geist), Editorial (Instrument Serif + Public Sans), Wave (Geist + Geist Mono), McKinsey (serif + sans) | Mood heading / body face pair | the brand's face pair and which role each takes |
| One margin, one left edge, columns on a grid | Pitch: 50 / 24 / 100 / 48 px on every slide; thirds at 50 / 698 / 1322 | `mood.grid` margins and gutters; zone edges on the 12-column grid | a margin scale (or a density signal) |
| Title top, content anchored to the bottom, open middle | AI Sales 9 (headings y 511, bodies y 804); 4–7 (text from y 601); Wave 4; Editorial 16 | zones aligned to the bottom of the body box; the gap is a deliberate band | nothing — composition rule |
| Ground rhythm: 2–3 surfaces, same layout in light and dark | AI Sales (green / off-white pairs); Wave (dark / mint / off-white); Editorial (charcoal / cream / white) | Mood surfaces (dark, light, tint) and a deck rhythm rule | the palette's own dark and light (T-slots) |
| Hairline rules instead of cards | AI Sales 10, 17, 24, 26; Editorial 18; McKinsey 2, 3, 7; YC 11, 12 | line style between items / rows (`kpis`, `items`, `timeline`, summary lists) | line colour / weight (or "no rules") |
| Big numerals as graphics | AI Sales 26 (values 120), Editorial 21 (200), Wave 17 (01–04 at 120), McKinsey 1 (accent values), Scale-Up 11 | `kpis` value in the display face; step numbers as display | display face; accent role for figures |
| Value size steps with the count | Editorial 21 vs 22: 3 KPIs at 200, 4 KPIs at 140; Scale-Up 11 (3 at 90 in a column) | length / count band → scale (catalogue rule *count → arrangement, length → scale*) | nothing |
| Arrangement by count, sizes fixed | Editorial 16 / 17 / 23 / 24 (3, 2, 6 as 2 × 3, 4 as 2 × 2); Wave 22 / 23 | `items` in T / H / 2 × 3 / 2 × 2 grids | nothing |
| Short list set as display type | Editorial 14 (six points at 56 serif, R shape); Scale-Up 4 (contents at 68) | `points` with short bullets → heading role, not body | display face |
| Full-bleed photo on cover / section / closing | AI Sales 1, 3, 8, 21, 31; Editorial 1; YC 13; Lovable 9 | cover / section / CTA kinds with image ground + scrim | brand photography or an image the brand allows |
| Half-bleed image zone | AI Sales 4–7, 13, 17; Wave 6, 12; YC 7, 9, 12 | H / L / R with an edge-to-edge image zone | imagery + crop rule |
| Rounded image panels inset by the margin | Wave 3, 4, 6, 13; Pitch Pink & Black (2slides) | image zone with radius = card radius, inset = margin | the brand's corner radius |
| Oversized decor cropped past the edges | Scale-Up blobs; 2slides Retro-futurism line art; McKinsey 5 circles; YC 14 wordmark | decor layer, bleed allowed, behind content | a brand shape / motif / logo mark |
| Texture behind text-only dark slides | AI Sales 11, 12, 16, 20 (blurred photo at 2227 × 1253) | surface with image texture | a brand texture or photo; else plain ground |
| Statement slide (one sentence, 90–140) | AI Sales 3, 13; Scale-Up 3, 10; Lovable 4; McKinsey 6; Wave 10 | `paragraph` / title-only kind, display scale | nothing |
| Quote as type: big quote mark + quote at title size | Wave 10 (mark 180, quote 120); Scale-Up 24; Editorial 11; YC 9 | `quote` block, display role, attribution as label | display face |
| Two-tone headline (lead clause dark, rest muted) | McKinsey 1; YC 2 | title with emphasis run in the strong text role | text strong / muted roles |
| Eyebrow / kicker labels in small uppercase or mono | AI Sales 13 (20 uppercase); Wave (24 mono); Lovable 1; McKinsey (accent) | header kicker | label style (case, tracking) |
| Footer / meta band on every slide | Wave (3 items at y 1034); McKinsey (date + title); Editorial cover top band | bottom band: footer | footer fields the brand gives (C-FOOTER rules) |
| Frosted / tinted cards | Scale-Up (white translucent); Notion (pastel tints); 2slides Pink & Black (glassy) | card style | card fill / opacity / radius |
| One highlighted item among equals | YC 10 (middle card raised, tinted); Scale-Up 18 (pricing) | `items` with an emphasis index | accent role |
| Staircase / zig-zag sequence | AI Sales 24 (steps rising); 2slides Google 5 (circles stepping) | `process` shape | nothing |
| Device mock-ups and screenshots | AI Sales 2, 22, 28; Wave 8; YC 3, 5; Notion 3–5 | image block with device frame | product screenshots |
| Same layout mirrored | AI Sales 4 / 6 (image left / right); 13 / 14 | layout variant flag | nothing |
| Image-generated page (text inside the picture) | 2slides Nano Banana, /prompts | — (not our model) | — |

## 3. The ten patterns most responsible for the "designed" look (ranked)

1. **Few sizes, big jumps, one weight** — every Pitch theme uses four or five sizes with display : body ≥ 5 : 1 and
   almost no bold, so the hierarchy reads at a glance and no two sizes fight.
2. **Title fixed at the top, content anchored to the bottom** — the empty middle (AI Sales 9: headings at y 511, bodies at
   y 804) looks deliberate because both edges are fixed, which is how a slide with little content avoids looking unfinished.
3. **One margin and one left edge for the whole deck** — 50 / 24 / 100 / 48 px depending on the theme, never varied;
   every block starts on a column line, so slides of different kinds still look like one system.
4. **A two- or three-ground rhythm with the same layouts in light and dark** — no accent colour is needed (AI Sales,
   Wave, Editorial have none); the alternation alone gives pace and makes the deck feel art-directed.
5. **Count changes the arrangement or the size, never the system** — three KPIs at 200, four at 140 (Editorial 21 / 22);
   six ideas as 3 × 2 or 2 × 3; few words get display type (six short points at 56): content fills the slide by scale.
6. **Hairlines instead of boxes** — rows, KPI lists, timelines and findings separated by thin rules give order with very
   little ink, which reads as editorial rather than templated.
7. **Numbers as graphics** — KPI values and step numerals set in the display face at title size or larger turn data into
   the slide's image, which is how data slides with three figures still look full.
8. **Full- or half-bleed imagery on cover, section and statement slides** — a picture running off the edge every three to
   five slides, from one image family, carries the mood between denser slides.
9. **Two faces with fixed roles** (display serif or sans + text sans / mono, labels in small uppercase) — the pairing does
   most of the "brand voice" work and stays the same on every slide.
10. **Consistent small furniture** — eyebrow labels, a footer / meta band, counters ("1/4"), one marker shape (Wave's
    16 px squares): repeated tiny elements make each slide look like a page of the same publication.

Close behind: oversized decor cropped past the edges (Scale-Up, 2slides themes), statement slides between dense ones, and
the two-tone headline (McKinsey).

What I could not see or measure: Chronicle's and 2slides' slides only as images (sizes estimated, not measured; faces not
identified); Chronicle's web viewer showed only its own tutorial deck, not the gallery decks, and the Notion deck's later
slides did not load; 2slides' generated Fast PPT output (no account, no API call made — the theme previews are the theme
files' own sample pages); how 2slides fills a theme with new content; Pitch's "Generate presentation" AI output (not run).

## 4. Fit with our project

Written 2026-11-02 from §1–§3. The rule of the house holds: nothing here is a default applied to every brand; each
pattern becomes a rule that reads a brand signal, with a unit test, a negative test and a before / after render for the
owner (CLAUDE.md rules 3, 5; PLAN-catalogue D1–D8).

### 4.1 Where each ranked pattern stands today

| # | pattern | we have | gap |
|---|---|---|---|
| 1 | few sizes, big jumps, one weight | `type.roles` from the brand's styles (G4), the fitter's ladder | a brand ladder can have 10+ sizes with small jumps; nothing picks the five the composer should use, nothing checks the jump ratios |
| 2 | title top, content anchored bottom, open middle | the catalogue's recorded placement (C3.1 `place`: most groups centred) | no bottom-anchored option; the open band between title and content is never deliberate |
| 3 | one margin, one left edge, a grid | `mood.geometry` margins / grid / title zone; catalogue zones snapped to the 12 columns | done |
| 4 | 2–3 grounds in rhythm, same layout light and dark | `palette.surfaces` + `rhythm`, `surfaceFor` | done; the catalogue's dark slides are hints only (D5) |
| 5 | count → arrangement, length → scale | the catalogue's plan families (C3), the fill step (C3.1), numeral zones (C3.2) | the fill bound holds for 57–90 % of containers; description scale does not follow its heading |
| 6 | hairlines instead of boxes | lines in `components` (steps connector, timeline line); D6 draws cards where the catalogue rules | no brand-level choice of the grouping device (card vs rule vs none) |
| 7 | numbers as graphics | values at `display` / `stat` by band, numerals at the catalogue's size (D7) | display for a 1–6 character value is capped by the brand's `display` role |
| 8 | full / half-bleed imagery every 3–5 slides | cover / section / cta image grounds, image-aside layouts, `decor.imagery` | no imagery rhythm across the deck; needs a brand image family |
| 9 | two faces with fixed roles, small uppercase labels | `type.faces` heading / body, `eyebrow` role, `case` | done where the brand gives it |
| 10 | small furniture: eyebrow, footer band, counters, one marker | label eyebrow, footer rules (C-FOOTER), steps marker | no counters ("1 / 4"), no deck-wide marker rule |

Close behind: statement slides at display scale (our C3.1 fill stops at h1 for paragraphs), the two-tone headline
(stripe's Mood already has `h1Accent` / `displayAccent` roles, unused by the composer), oversized decor past the edges
(`decor.elements` carry placement, bleed is not a placement value), one highlighted item among equals (charts have
`highlight`, items do not), mirrored layouts (we have aside left / right).

### 4.2 Proposed rules (each one PR, before / after rendered, owner approves)

- **P-A Composer ladder.** From the brand's roles the Mood picks the five rungs the composer uses (display, title,
  heading, body, label) so that display : body ≥ 4 : 1 and title : body ≈ 2.5–3 : 1 where the brand's sizes allow it
  (signal: the brand's own style sizes; a brand whose styles do not reach the ratio keeps its sizes and gets an info).
  The fitter keeps the full ladder for stepping down. Check `type-ladder` (info): a slide uses more than five sizes, or
  the ratios are not met. This is pattern 1 and most of 5 and 7.
- **P-B Grouping device.** One Mood decision `components.group.device`: `card` when the brand gives card tokens (fill,
  radius or border), `rule` when it gives a line style and no card, else a question. The catalogue's cards (class) and
  rules (D6) are then both drawn with the brand's device. Pattern 6. Amends D6 only in that the owner's "card" becomes
  the device for brands with cards; a brand without cards gets rules.
- **P-C Vertical anchor.** `composition.anchor`: `bottom` when the brand's own layouts put content low (signal:
  `brandLayouts` / the brand's example slides' content placement), else the catalogue's recorded placement; the band
  between title and content is a decor zone. Pattern 2.
- **P-D Statement scale.** A paragraph of 1–80 characters that is the slide's only block, and a quote, take `display`
  when it fits on ≤ 3 lines, with the attribution as `eyebrow`; the quote mark drawn only when the Mood's quote
  component gives one. The statement rhythm (one between dense slides) is the deck writer's, not the engine's.
- **P-E Description follows its heading.** When the fill step moves an item heading up the ladder, its description moves
  up by the same number of rungs where it fits (the C3.2 gap on stripe review 2 / 23 / 38). Pattern 5.
- **P-F Imagery rhythm.** When `decor.imagery` gives an image family, a section or statement slide takes a full-bleed
  image ground every 3–5 slides (the surface rhythm's cadence), with the text-over-image rule; no family → nothing.
  Pattern 8.
- **P-G Furniture.** Agenda-driven section counters ("2 / 5") from the agenda block (signal: the deck has an agenda); the
  title's lead clause in `h1Accent` / `displayAccent` when the brand defines those roles and the title carries an
  emphasis run (content: `**lead**`). Pattern 10 and the two-tone headline.
- **P-H Emphasis among equals.** Content v2.2: `highlight: true` on an `items` / `kpis` / `compare` node, drawn with the
  accent surface or raised card, at most one per block (a second is a content warning).

Order: P-E and P-A first (they finish the catalogue fill), then P-B and P-C (placement), then P-D, P-G, P-H, P-F.
None of these is part of C4; they are a design milestone after the catalogue is the default.

### 4.3 What 2slides and Pitch do that we do not take

- Image-generated pages (2slides Nano Banana, text inside the picture): against rule 2 and rule 4 (one Deck, every
  element a box). Their layout engine ("Fast PPT": content + a theme id) is the same shape as ours: a theme is our
  Mood + catalogue, their `concise / standard` detail is our length bands, their theme search by tag is the Studio
  picker's tags.
- Per-template photography, copy cut to fit each box, device mock-ups: a brand-driven generator gets these only from
  the brand (imagery, screenshots) or the deck's content; never invented.
- Pitch's "generate presentation": not run, so no claim about its output.

### 4.4 Decisions for the owner

- **D9** approve the P-A … P-H list as the design milestone after C4, in the order above. **Approved 2026-11-03**
  (owner: "Design rules first"). 2026-11-03, after measuring (docs/research/fill-diagnosis-2026-11-03.md): P-E and
  P-A withdrawn (owner: "Build PR-F and PR-C′"); P-C becomes PR-C′, whose signal is the catalogue record's own
  placement (no brand-JSON field needed); PR-F (fill room) precedes the rest of the list. 2026-11-03: PR-F and PR-C′
  approved by the owner ("Approve both") and now rules of every build (docs/P2-spec.md §9 R-FILLROOM, R-PLACE; engine
  0.4.0, golden decks re-snapshotted).
- **D10** P-B amends D6: the grouping device comes from the brand (card tokens → card, line style → rule, neither →
  question) rather than always a card.
