# The template library with design intent, and the element vocabulary — plan (V0–V6)

Status: **approved 2026-11-04** (owner: "Approve, start V0"; D11–D15 in §8 approved as written). V0, V1 and V2 built and accepted 2026-11-04 ("Accept, start V1+V2", then "Accept, start V3"); V3 in progress as proposal PR-6 (§9). Owner, 2026-11-04: "what if we have
a list of well designed slide template library; when the input brand details come in, it will not just randomly fill in
brand things, instead it understands the brand guidelines and it understands the slide template, then it produces the
visually good result with the brand details" and "we need to build an element / component vocabulary, so that we never
wrongly identify a component / element". Architect's answer (same day): yes, with "understands" meaning two records
with matching vocabularies and a measurable binding step between them, AI at authoring time only.

Ground rules unchanged (CLAUDE.md): no AI in the pipeline; nothing applied to every brand by default; a missing value is a
question; one Deck, one renderer; rules are code with unit + negative tests and golden snapshots; design proposals are
rendered before / after for the owner, never straight into the snapshots.

## 0. Why

The case that started it: hdfc-2's cover (2026-11-04). The brand JSON says, in `layouts[0]` (id "title"): title right,
text at the bottom, at most 42 % wide, a photo area left of the red band (x 1061 at the top → 741 at the bottom), the
band device `coverBands`, the tint overlay, the logo box. READ records every field as given. The Mood carries none of
them. The one cover layout (`packages/layouts/src/kinds/cover.js`) puts the title bottom-left across two thirds of the
width, so it runs through the photo, the white slash and the red band, while the blue field the brand reserved for it
stays empty. No check sees it: the slashes are pixels of the background JPG, and the decor-overlap check knows only
front-layer decor elements.

What this shows:
- **The catalogue is a template library without intent.** 1,646 compositions (docs/PLAN-catalogue.md): where the boxes
  are, what content goes where. Not why a slide works - which element is its device, where its quiet area for text is,
  whether its image is a cut-out or a bleed, what carries its emphasis.
- **The brand record has capabilities without a receiver.** Devices, photo areas, imagery rules, masks, components, a
  type ladder. No template has a slot named for them, so the brand's strongest assets are drawn as decor behind text.
- **The input is checked for shape, not truth.** READ validates the schema and that files exist; provenance (`inferred`,
  `verifiedAt`) is carried and never used; every check measures the output. A wrong `photoArea` would pass silently.
- **Five vocabularies name the same things differently** (§1), so a thing can be mis-identified at every hand-over:
  reference slide → template record, brand JSON → Mood, content → layout, layout → deck.

"Understands", then, is three things, each measurable: (1) one vocabulary with an identification rule per term; (2) a
template record that carries design intent in that vocabulary, and a brand capability record in the same vocabulary;
(3) a binding step that fills every template need from a named brand signal, scores the fit, and refuses or asks when
it cannot. The pick is "the template this brand can fill best", and the score is the proof that nothing was filled at
random. AI may author records (as Brand Studio already authors brand JSON); every authored record is measured by scripts
and verified by the owner before it is used; the build itself stays rules.

## 1. V0 — the element / component vocabulary (first; everything else is written in it)

### 1.1 Today: five vocabularies, overlapping

| where | names | count |
|---|---|---|
| deck (`schemas/deck.schema.json`) - what the renderer draws | element type: text, image, shape, line, chart, table, group; shape kind rect / ellipse / line / polygon / path | 7 + 5 |
| layout (`schemas/layout.schema.json`) - what a layout offers | box role: title, subtitle, eyebrow, body, list, image, chart, table, kpis, quote, attribution, logo, footer, number, shape, divider, decor, group; slot type: text, richtext, list, cards, image, images, people, chart, table, kpis, quote, steps, timeline, logos, number; kind: cover … blank | 18 + 15 + 21 |
| brand input (`schemas/input/brand-presentation-spec.schema.json`) - what the brand owns | decor element type: shape, pattern, texture, illustration, rule, frame, badge, sticker, watermark, textGradient, actionIcon, word; components: chip, callout, quote, divider, steps, timeline, button, buttonSecondary, pager, badge, team, arrow, tabs, logoWall, ctaChevron, icons, avatar; card blocks (image, icon, eyebrow, title, body, link, button, badge, stat, logo, divider, tags, meta, footer, panel, rating); card recipes; imagery sample kinds (photo-people, photo-product, product-ui, illustration, abstract, logo, icon, unknown); masks (rect, ellipse, polygon, svg, text); backgrounds; placements | ~80 |
| content/2 (`schemas/content.schema.json`) - what the author wrote | block types: points, items, subpoints, kpis, process, timeline, chart, table, quotes, people, logos, compare, paragraph, image; chart types; cell types; image treatments side / full / background / collage / device | 14 + … |
| anatomy (`.claude/skills/slide-anatomy/references/roles.md`, categories.md) and the catalogue (section 1, 94 base block styles) - what a reference slide holds | L1 roles: title, subtitle, eyebrow, body, label, heading, small-text, big-number, date, authors, legal, source, contact, page-number, footer, partner-label, placeholder, logo, partner-logo, footer-mark, hero-image, cutout, picture, icon, background, background-art, chart-or-diagram, rule, cut-shape, band, panel, card, decor, hidden; 15 categories | ~35 + 15 + 94 |

The conflicts a vocabulary must settle (each is a mis-identification waiting to happen):
- *shape*: a drawn primitive (deck) vs a decor element type (brand) vs a cut-shape (anatomy).
- *rule / divider / line*: three names, two things (a decor hairline that separates nothing vs a divider between two content groups) and one primitive.
- *panel / card / band / callout*: a fill with text ≥ 8 % (panel), smaller (card), a full-side strip (band), a component (callout) - today chosen by the author, not by a test.
- *badge*: a decor element type and a component and a card block.
- *quote*: a content block, a component, a layout role and an anatomy category.
- *logo*: the brand's mark, a partner's mark, a logo-wall item, a card block, a sample kind, a table cell type.
- *label*: an eyebrow, a small text, a timeline year, a process node label, a chart data label, a KPI heading.
- *image*: a treatment (side / full / background / collage / device) vs a role (hero, cut-out, picture, icon, background-art) vs a primitive.
- *stat / kpi / big-number / number*: one thing in four places.
- *timeline / roadmap / process / steps*: the content type, the component, the layout slot and the catalogue combination.
- *device vs decor*: the one distinction the binding step depends on most, and no vocabulary has it.

### 1.2 The vocabulary: four namespaces, one entry shape

One term per thing, one rule per term. Four namespaces so a name never means two things:

| namespace | question | source today | closed? |
|---|---|---|---|
| **E1 primitive** | what is drawn | the deck's 7 element types | closed |
| **E2 role** | what a thing is for on the slide | anatomy L1 roles + layout box roles + brand decor / component kinds, unified | open, by rule |
| **E3 structure** | what things form together | content/2 block types; header, zone, band, column, stack, group, grid, cell; slide kinds (anatomy categories ∪ layout kinds) | open, by rule |
| **E4 treatment** | how a thing is finished | image treatment (side, full, background, collage, device, cut-out, clipped), mask, card style, fill, emphasis (weight run), angle, layer (behind / front) | open, by rule |

Every entry: `{ term, namespace, definition, identify: <the measurable test, with its why>, signal: <what proves it: a
field, a file, a geometry>, notBut: [<confusable terms and the deciding test>], mapsFrom: { deck, layout, brand,
content, anatomy, catalogue }, examples: [positive, negative] }`. The identification test is a rule a script runs, in
the style of anatomy.py (geometry, text patterns, furniture repetition), never a judgment: *band* = a strip spanning a
full side, ≤ 30 % H or ≤ 40 % W, holding no text or only furniture; *panel* = a fill holding text, ≥ 8 % of the
slide; *card* = the same under 8 %; *divider* = a thin shape with content groups on both sides along its length;
*rule* = a thin shape without; *brand-logo* = a mark whose file is one of `brand.logos` (or, on a reference, in a corner
zone without a partner label); *partner-logo* = a mark under or beside a partner label, or not in `brand.logos`;
*device* = the element the brand names as its signature (`layouts[].composition.device`, or a decor element with
`frequency: always` on that kind) or the L4 `signature` of a reference record; everything else that holds no text is
*decor*. When no test decides, the term is `unknown` and the record carries a question for that object (rule 3), never a
guess; `unknown` is counted, so the vocabulary's own gaps are measured.

### 1.3 Deliverables and measurement

- `docs/vocabulary.md` (the human page: every term, its test, its confusables) generated from
  `packages/vocabulary/data/vocabulary.json`; `maps.json` maps every enum value of the five schemas to exactly one
  term. `packages/vocabulary/src`: `termFor(namespace, source, name)`, `identify(object, context)` (the anatomy rules
  moved here and extended; anatomy.py and the layouts call it), `confusables(term)`.
- Tests (the negative-test culture, CLAUDE.md): every enum value in the five schemas maps to one term, and the test
  fails when a schema gains a name without a map; every term has a positive and a negative fixture; every confusable
  pair has a fixture pair that the deciding test separates; `unknown` is returned, not a guess, on a fixture built to
  be ambiguous.
- **The catalogue is the answer key.** Its 1,646 slides mark every container and field (`data-c`, `data-f`, `data-i`,
  `data-type`). `identify()` run over `golden/catalogue/geometry.json` must name every marked block and field exactly
  (E3 and E2 hit rate 100 %, a test); the two analysed covers in `.claude/skills/slide-anatomy/examples/` and the
  anatomy library on disk (`out/anatomy/`, third-party decks: numbers only, never in the repo) give the role accuracy on
  real slides, reported per role as a table in the PR.
- The skill's `references/roles.md` is regenerated from the vocabulary, so there is one source; anatomy.py keeps its
  measurements and calls `identify()` for roles.

## 2. V1 — the template record (T)

A template is an anatomy record plus intent, written in the vocabulary. Fields (all positions in % of W / H so sources
of any size compare; `exact: false` where only pixels were measured):
- `category` (E3 slide kind), `elements[]` (E2 role, E1 primitive, box, E4 treatment, text metrics for text), `zones`
  and `split` (shape code as in the catalogue), `margins`, `edges` (the shared left edge and what sits on it), `rhythm`
  (gaps, groups), `hierarchy` (type-scale ratios: title : body, adjacent steps, emphasis runs), `balance` (weight
  centre, empty share, diagonal).
- **Intent** (L4, each claim naming its measurement): `device` { role, zone, angle, layer, breaksMargin }, `quiet`
  (the text-safe region: the busyness grid under the text zone, measured), `image` { treatment, bleed sides, mask,
  faces }, `emphasis` (what carries it: weight run, colour field, numeral), `furniture` (what is anchored to a margin).
- **Needs**: what the brand must supply for this template to be itself - a device of role X, a photo (people / product /
  abstract), a cut-out, a strong colour field, a second face, a mono logo variant, an angle, a card component … Each
  need names the brand field that can meet it (§3). A template without needs is a composition only (every catalogue
  record today).
- `options` (mirrored, light / dark, image left / right - the Pitch pattern: one composition, several variants),
  `provenance` (source, who measured, `verifiedAt`).

Sources, in this order:
1. **The Rich Slide Catalogue** (1,646): the anatomy scripts run over the rendered HTML (the geometry is measured
   already; roles, rhythm, hierarchy, quiet area and balance are new) → every catalogue record gains L1–L3 and the
   intent fields it can have without images. Nothing of the catalogue changes; `catalogue-layouts.json` gains the
   fields.
2. **Hand-authored templates** by the owner's designers: HTML at 1920 × 1080 in the catalogue's own convention (every
   field marked), measured the same way. This is the "well designed slide template library" of the owner's question;
   covers, sections, CTAs, statements and image-led slides first, the kinds the catalogue has least.
3. **Reference decks** through the anatomy library (`out/anatomy/`, third party): their records give ranges and
   patterns per category, never a template (numbers and patterns only; no text, colour, face or image of theirs).
AI at authoring time only (D13): a model may propose a record or an intent field; it is `exact: false` until the
scripts measure it and the owner verifies it (`verifiedAt`), the same rule Brand Studio applies to brand JSON.

## 3. V2 — the brand capability record (B) and claim checks

READ derives, from the brand JSON alone and in the vocabulary, what the brand can supply (no new input field; a
capability the JSON cannot give is absent, and absent is a measurable fact, not a question, until a template needs it):
- devices (decor elements with `allowedOn`, layer, frequency, geometry read from the SVG), photo areas and overlays
  (`layouts[].composition`), imagery (source, treatments, `textOverImage`, masks, sample kinds), colour fields
  (surfaces by role), the type ladder and its ratios, alignment, logo variants and their measured boxes, components by
  E2 role (chip, callout, steps marker, divider, pager, avatar, button …), shape language (the angles measured in the
  brand's SVGs: one angle or several), density and whitespace rules, motion.
- **Claim checks** (from the owner's 2026-11-04 question "what if the input is wrong? are we measuring that?"): a value
  that the JSON claims about one of its own files is compared with the file - `photoArea` against the band path in the
  device SVG, the logo box against the lockup's bounding box in the cover image, named colours against the colours the
  SVGs contain, a mask against its SVG, a font's metrics against the font file (done today). A claim that fails is a
  question for that field (severity blocking when a template binds to it), never a capability. Provenance is read:
  `inferred: true` lowers a capability to "offered, needs the owner's `verifiedAt`" in the Studio's brand panel.
- Recorded in the brand-spec (`/capabilities`, with provenance to the fields and files each one rests on) so the Mood,
  the binding and the checks read one record.

## 4. V3–V4 — binding (the "understanding")

For a slide (kind, content/2 blocks, brand):
1. **Candidates** = templates of that category (content slides: also by C4's combination key, which stays) whose
   *needs* the brand can meet from its capability record. A need met by a brand signal scores +1 and records the
   signal; a need the brand cannot meet disqualifies the template unless the template marks the need `optional`.
2. **Score** = needs met − optional needs unmet, then C4's content fit (exact family 100 / same combination 60 − band
   distance), then variety (the deck's `used` map). A pinned template still wins.
3. **Bind** every template element from the brand by role: the device slot takes the brand device of that role (its
   own geometry, angle and layer); the quiet area takes the title and text stack; the image slot takes the content's
   image with the template's treatment and the brand's mask; furniture takes the brand's footer / pager; every text
   takes the Mood's role for the template's hierarchy step (R-FILLROOM and R-PLACE unchanged inside the zones). Nothing
   is invented: an element with no brand signal is left out and noted, and if it was the device the template was never
   a candidate.
4. **Record** on the slide: `slide.source.template`, `binding[]` (template element → brand signal pointer), the score
   and the needs table, so a check can prove every element came from a named signal and the Studio can show the
   reason (C6 generalised).
No template of the category binds → the kind's base layout as today (the 68) with an info note naming the nearest
template and the unmet needs; a question only when the base layout also needs a value the brand lacks (D15).

**V3 = cover, section, CTA, statement** (the hdfc-2 case: the cover template whose device slot binds `coverBands`,
whose photo area is the brand's `photoArea`, whose text zone is the blue field at the brand's 42 %), built as a
proposal with before / after sheets on the 10 golden brands. **V4 = the content kinds**: the catalogue records carry
intent from V1, the binding extends C4's scoring; golden decks re-snapshotted only after the owner approves.

## 5. V5 — measurement, checks and Studio

- **Vocabulary accuracy** (V0): the catalogue answer key at 100 %, the role table on the anatomy examples.
- **Binding coverage** per brand: needs met / needs total over the template set, a table on the 10 golden brands in
  every PR; a brand's unmet needs are the list of what its JSON should gain (Brand Studio reads it).
- **Text over image** (new check `image-under-text`): the rendered pixels under every text box on an image background -
  edge density and luminance variance against the brand's `textOverImage` rule; warn when the text sits on busy content
  or crosses a strong edge. Catches the hdfc-2 cover whether the brand fields are right or wrong, and a user photo with
  a face under the title.
- **Binding provenance** (check `binding`, replaces C5's catalogue check): every drawn element of a template-bound slide
  names its template element and its brand signal; an element without both fails.
- Studio: the template browser (C6 generalised: templates by category with thumbnails, needs and the brand's coverage);
  the slide panel shows the binding table and the score; "Pick template" pins one; the brand panel lists capabilities,
  claim-check results and unverified (`inferred`) fields.

## 6. V6 — the design milestone re-founded

docs/research/external-template-patterns.md §4's remaining proposals stop being rules applied to every brand and become
template intent fields bound to brand signals: P-B grouping device → the template's `group` treatment bound to the
brand's card / divider / whitespace rule (D10 decided here); P-D statement scale → the statement template's hierarchy;
P-G furniture → the template's `furniture` bound to the brand's pager / footer / logo rules; P-H emphasis → the
template's `emphasis` bound to the brand's weight contrast; P-F imagery rhythm → templates' `image` needs across the
deck sequence (the Pitch pattern of mirrored pairs). Each still goes before / after to the owner.

## 7. Order, size, what each PR proves

| milestone | PR | proves |
|---|---|---|
| V0 vocabulary | 1 | 100 % on the catalogue answer key; every schema enum mapped; confusable fixtures; roles.md regenerated |
| V1 template record | 2 (catalogue records + the record schema; hand-authored templates as they arrive) | anatomy over the catalogue, intent fields measured; the first hand-authored covers measured |
| V2 capabilities + claim checks | 1 | the 10 golden brands' capability tables; hdfc-2's claims checked against its files; a deliberately wrong `photoArea` becomes a question |
| V3 binding: cover / section / CTA / statement | 1, as a proposal | before / after sheets; hdfc-2's cover in the blue field; binding coverage table |
| V4 binding: content kinds | 1, as a proposal | sheets; golden decks re-snapshotted after approval |
| V5 checks + Studio | 2 | `image-under-text` negative test on the hdfc-2 cover; binding check; browser |
| V6 design fields | one per field, as proposals | sheets |

V0 blocks everything; V1 and V2 are independent of each other after V0; V3 needs both. C5 and C6 of the catalogue
plan are absorbed (binding check, template browser). The 840 diagram layouts the catalogue lacks come as templates when
they exist.

## 8. Decisions for the owner

- **D11 One source for every name.** The five schemas' enums are generated from (or tested against) the vocabulary,
  so a new name anywhere must first be a term with a test. Alternative: a map only, enums stay hand-edited (weaker: a
  drift fails only when a test notices).
- **D12 Where templates come from.** The catalogue (measured) + hand-authored HTML templates in the catalogue's
  convention (the owner's designers) + reference ranges from the anatomy library; nothing from a reference deck itself.
- **D13 AI at authoring time.** A model may propose a template record, an intent field or a brand field; it is
  `exact: false` / `inferred: true` until measured by the scripts and verified by the owner. Never at build time.
- **D14 Cover first.** V3 ships the cover / section / CTA / statement binding as a proposal before the content kinds,
  because that is where devices, photo areas and quiet zones matter most and where the catalogue has least.
- **D15 Unmet needs.** A template whose needs the brand cannot meet is not a candidate (no substitute device, no
  invented photo); when no template of the category binds, the kind's base layout with an info note; a question only
  when the base layout too lacks a value. Alternative: always a question (stricter; a deck would stop on every brand
  without a device).

## 9. Built so far

**V0 - the vocabulary (2026-11-04, not committed; awaiting the owner's review).** `packages/vocabulary` (`@pb/vocabulary`,
no dependencies): `data/vocabulary.json` (147 terms: E1 7, E2 56, E3 46 = 14 blocks + 9 composition structures + 23 slide
kinds, E4 38; 167 ordered rules in 15 chains, written in a 23-predicate set, `src/predicates.js`), `data/maps.json`
(40 sources over 79 enum paths of the six schema files + the three `components` objects -> one term per value; 157 paths
excluded with their reason, `frequency` among them), `identify()` / `identifyAll()` (JS) and
`.claude/skills/slide-anatomy/scripts/vocabulary_rules.py` (Python: anatomy.py's role pass and its category now run
through it), `termFor()`, `confusables()`, `docs/vocabulary.md` and the skill's `references/roles.md` generated by
`npm run vocabulary:docs`.

A bare term names one thing across all four namespaces (a test). E1 keeps the deck's seven names; the others were
renamed where they collided: E4 `text-mask`, `image-fill`, `background-image`, `transparent` (was cutout); E3
`image-block`, `chart-block`, `table-block`, `paragraph-block` (maps keep the content schema's bare names as sources),
`band-zone`, `gap-group` (the rhythm group: `item-group`, the suggested name, would read as the E3 `item` structure);
E2 `chart-exhibit`, `table-exhibit`; E2 `group` removed (the layout box role `group` maps to E1 group). Slide kinds carry
`-slide` (`chart-slide`). Terms added beyond the architect's inventory: E2 `background` (a plain fill over 90 % of the
slide: anatomy's background role had no term); E4 fills `conic-gradient`, `mesh-gradient`, `gradient`, `pattern`,
`texture`, `image-fill`, `video` (the brand's background / gradient types name them).

The catalogue answer key (marks hidden, `unknown` = miss; map corrected 2026-11-04: field `point` -> E2 label,
container `roadmap` -> timeline or process, the resolution of each record listed in docs/vocabulary.md): **header parts
6,461 / 6,461 (100 %)**; **E3 block type 2,012 / 2,037 (98.8 %)**: points, paragraph-block, kpis, subpoints, table-block,
timeline (timeline + timeline_with_list) 100 %, chart-block 309 / 312, items 137 / 144, compare 15 / 18, roadmap 42 / 54
(timeline 19, process 23); **E2 field role 10,490 / 10,520 (99.7 %)**: description, bullet, paragraph, row -> cell 100 %,
heading 2,613 / 2,619, value 2,034 / 2,043, body 2,034 / 2,043, point -> label 1,087 / 1,093. The 100 % targets for
blocks and fields are not reached; every miss and its reason is in docs/vocabulary.md: 12 roadmaps show no sequence sign
(V1 geometry item: the axis / connector line is measured only for containers typed roadmap / timeline, so it is not
read; measure it for every container); 7 two-item lists are drawn exactly as a comparison and 3 comparisons show no
contrast mark; 9 KPI values are word figures ("No findings") and pull their item's heading / body with them; 6 chart
labels are 7+ words or sit in a chart whose figures are outside its marked element.

On the anatomy library (out/anatomy, 1,722 pages, 109,344 objects; numbers only): 89,531 objects keep their role,
5,165 are renamed (logo -> brand-logo, footer -> footer-text, small-text -> unknown, partner-label -> label), 5,522 are
refined (footer-mark, chart-or-diagram and rule split by a sharper test) and 9,126 change, each by a stated rule (a thin
vector line is a rule / divider, not an icon; wording before repetition for legal / source; a band holding text is a
panel; logo walls are logo items; the furniture signature counts digit runs as one sign); 33 of 1,722 categories change.
The two analysed covers keep every role (two renames: partner-label -> label, logo -> brand-logo).

**V1 - the template record (2026-11-04, not committed; awaiting the owner's review).** Part A, the geometry item left by V0:
`scripts/catalogue-geometry.mjs` measures a `connector` for every container (lines along it, items crossed, orientation, inner
pieces; `rules` untouched); geometry.json regenerated (deep-equal to before once the key is stripped; `measured` date moved),
catalogue-layouts.json regenerated (all 1,077 records deep-equal; only the geometry hash in `source`); on every roadmap /
timeline the connector reproduces the old `axis` exactly (a test). The E3 rule `process.connector` (one line crossing every
item, or inner pieces, plus a label on the first item) lifts the block answer key to **2,014 / 2,037 (98.9 %)**: the rule as
first written (any line crossing two items) scored 2,009, turning six plain lists into processes, so the stricter one shipped.
Remaining 23 misses: 9 roadmaps with no line through their items (ruled rows, numbered columns, cards with a top rule each;
numbering does not separate them from 12 lists numbered the same way), 7 compare / items drawings, 3 charts, 1 list drawn
exactly like a roadmap (L1-35). Fields and header parts unchanged (99.7 %, 100 %).

Part B: `schemas/template.schema.json` (the record of §2; every role / category / treatment / primitive enum tested against the
vocabulary, a `template` map source), `packages/templates` (`templates()`, `templatesOf()`, `templateById()`,
`validateTemplate()`, `needsOf()`), `scripts/catalogue-records.mjs` (one Chrome load, the anatomy pipeline over the rendered
catalogue: 1 min 27 s for 1,646 slides, byte-identical on a second run) -> `packages/templates/data/catalogue.json` (1,646
records, 14.3 MB, keyed by catalogue id, plan slides linked to their catalogue-layouts id; no body text). Hand-authored
convention `docs/TEMPLATES.md` + `scripts/template-records.mjs` (catalogue marks + `data-role` / `data-need` / `data-treatment` /
`data-template` / `data-option`); five neutral fixture templates in `packages/templates/__fixtures__/authored/` give six records
(a `dark` option): 14 of 16 authored roles agree with the rules; the two disagreements are recorded as questions, not resolved
(a slanted band authored `device` reads as `cut-shape`; a button reads as `card`): the identified role stands until the owner
sets `verifiedAt` (D13). The capability-key grammar shared with V2 lives in `packages/vocabulary/src/capabilities.js`.

Measured on the catalogue: emphasis carrier numeral 933 / colour-field 151 / weight-run 31 / size 5 / none 526; a quiet area
on every record (busy under the text zone median 12.1, p90 16 on a 0-100 scale); image intent on 17, device on none (the
catalogue draws no brand device). Roles: 44,978 elements, 98.2 % agreement with the catalogue's marks on marked text
(20,608 / 20,994); 241 `unknown` roles, all one cause - text smaller than body and longer than six words (captions, chart
titles, notes), which no E2 term covers since V0 dropped `small-text` (pinned per category; a rise fails). **Weak result,
listed for the owner:** the vocabulary's slide-kind chain agrees with the catalogue-layouts kind on only 570 / 1,077 plan
slides (cards -> text 183, chart -> kpi 69, timeline -> text 60, kpi -> text 46, steps -> text 40): the chain was tuned on
third-party decks, not the catalogue; the catalogue records keep the chain's answer with its why, and the binding (V3 / V4)
must read the catalogue-layouts kind for plan slides until the chain is re-founded on the catalogue as a second answer key.
Also changed: `extract_html.mjs` measures more (one-sided borders as lines, svg pieces, img transparency, clip-path angles,
`::before` / `::after` text, no child text in a parent run) - the two analysed covers were not re-measured with it.

**V2 - the brand capability record and claim checks (2026-11-04, not committed; awaiting the owner's review).** READ rules
BR-CAPABILITIES and BR-CLAIMS (docs/P1-rules.md §A; `packages/brand/src/{capabilities,claims,svggeom,pixels,measure}.js`;
schema v1.4 adds `/capabilities` and `/claims`). Capabilities on the 10 golden brands: 24 (the-ken) to 43 (hdfc-2) each, in the
key grammar, with the term from the vocabulary (a brand rule such as `type-ladder`, `composition`, `motion`, `angle` carries
`term: null`, never `unknown`); none is `offered`: all 116 `inferred: true` fields carry a `verifiedAt`. Claims (pass / fail /
skipped): akgmedia 17 / 0 / 0, bosch 20 / 0 / 1, cisco 21 / 18 / 2, hdfc-2 21 / 3 / 1, headspace 29 / 23 / 1, notion 5 / 1 / 0,
rukko 17 / 1 / 1, shopify 28 / 42 / 2, stripe 17 / 1 / 1, the-ken 28 / 5 / 2; each failure = one optional `claim.*` question on
the input pointer (blocking only once a template binds to the field, V3). What the claims found (docs/research/
capabilities-2026-11-04.md): hdfc-2's cover `photoArea` runs on the band's right edge for 93.5 % of its length but the band
path in cover-bands.svg (and the red band in cover-art.jpg) ends at y 1010, so the polygon's foot is 70-100 px wrong - the
owner's cover question has a measured answer; its `monoLight` file is the colour lockup on a blue panel (luminance 0.43) and
its `monoDark` a greyscale lockup on opaque white (0.67): neither is a mono mark; its logo box passes exactly (609 x 119
measured vs 608 x 118 claimed). 85 imagery sample sizes on five brands are CSS display sizes, 47 exactly 2x the file
(`scaleW` / `scaleH` recorded). `reverse` makes no tone claim (architect: it is the mark for a coloured ground; rukko's is
black). Golden snapshots re-taken through the snapshot path (`pb mood --snapshot`, `pb build --snapshot`): deck.json differs
only in `moodHash`, mood.json only in `brandHash` (the brand hash covers the whole BrandSpec), brand-spec.json only in the
additions - proven per brand. Studio: a collapsed Capabilities group in the brand panel (keys, terms, status, claims with
claimed vs measured, unverified fields) read from `out/<id>/brand-spec.json` of the last `pb mood`, not the live derive
(`studio.js` untouched; a gap). Not decoded: WebP (2 shopify backgrounds skipped).

**V3 - the template binding for cover / section / CTA / statement, proposal PR-6 (2026-11-04, not committed; awaiting
the owner's review of the sheets `out/_v3/index.html`, before = `out/_v3/_before/<id>` = the golden decks).** Part A: 12
hand-authored templates + 3 options (`packages/templates/authored/<kind>/`, neutral, AI-authored at authoring time per
D13, each with `provenance.basis` naming the anatomy range it rests on) measured into `packages/templates/data/authored.json`
(template schema v1.1: `authoredCategory` from `data-category`, `provenance.basis` from `data-basis`, the need wildcard
`image:any`; the script errors when a `data-need` reaches no element). 45 / 47 authored roles agree with the rules; 13
questions left (2 device -> cut-shape: the vocabulary names a device only from a brand or reference signature; 11 category:
the kind chain reads deck position and header text, which a template has not). Part B: `@pb/templates` `match.js`
(`candidates`, `pickTemplate`) with the rules settled during the fix round: (1) content fit - a template with no element for a
field the slide carries (title, label, subtitle, number, action, its one quote, its own picture) is not a candidate, so
nothing is dropped silently; "left out" is only a template element the brand cannot fill (an avatar, a subtitle the content
lacks); (2) an `image:<kind>` need is met only by the slide's own image or a brand sample the brand tags `hero` / `cover` /
`bleed` (a product-ui sample never, unless tagged hero); (3) the brand's own visual for the kind wins - when the kind's
background hint is an image variant or a brand device is named by / allowed on the kind, a template photo or cut-out must
be the slide's own image unless the template also binds that device (hdfc-2: device + photo area); (4) score weights: a need
met by a device / photo-area / text-zone / overlay counts 2, the rest 1. Part C: engine `compose/templateBind.js` behind
`proposals.templateBinding` (deck schema v1.6: `slide.source.template / score / binding`, element `source.template / signal`,
`image.clip` polygon + `image.blend`; the HTML renderer draws `clip-path` / `mix-blend-mode`, PDF / PNG inherit; no PPTX
writer exists yet); the bound photo keeps clear of boxed brand decor and the footer band (inset by the gutter; left out below
half its height); the background is the surface colour when the template draws the photo + device from parts. Part D: 46 of
60 cover / section / cta / quote slides bound on the 10 golden brands (the 3-quote slide 25 binds nothing anywhere: the
statement templates hold one quote; four covers bind nothing because the brand's own cover art wins and no template fits
their light surface - headspace, notion, rukko, stripe keep today's cover). hdfc-2's cover: the blue surface, the brand photo
clipped to the photo area, the tint over it, coverBands on top, the logo at the brand's box (608 x 118 at 1233, 78), label /
title / subtitle right-aligned at the bottom of the 42 % zone, 190-247 px clear of the photo area and the band. Proposal off =
byte-identical to the golden decks (a test on all 10). Known weaknesses for the owner: the section photo band crops the
hero's faces on bosch (the sample carries no focal point; `imagery.crop.focus` centre); the `margins` check flags every
template photo that bleeds by design and the `decor` check flags a device bound by `namedBy` (both checks unchanged, V5);
the scores are small integers, so most ties fall to template order. Tables and numbers in
docs/research/v3-binding-2026-11-04.md.
