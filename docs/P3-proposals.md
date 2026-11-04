# P3 — design-quality proposals (need the owner's approval before they become rules)

Status 2026-11-03: **PR-F and PR-C′ approved by the owner ("Approve both") and now rules of every build** — R-FILLROOM
and R-PLACE in `docs/P2-spec.md §9`, tested in `packages/engine/__tests__/rules-approved.test.js`; the golden decks were
re-snapshotted (engine 0.4.0) and are equal, slide for slide, to the approved `--proposals prf,prc` builds (84 slides
changed against the C4 default build). `--proposals prf|prc` no longer exists (the flag takes `all` or `pr4`); the
PR-F / PR-C′ entries and build notes below are kept as the record. Open proposals: PR-4, PR-5 and PR-6 (2026-11-04,
template binding, `--proposals pr6`).

Status 2026-10-31: **PR-1, PR-2, PR-3 approved by the owner ("Approve PR-1..3") and now rules of every build** —
`docs/P2-spec.md §9` (R-FITUP, R-AVATAR, R-LOGOCHIP), tested in `packages/engine/__tests__/rules-approved.test.js`, golden
decks re-snapshotted (engine 0.3.0). PR-4 and PR-5 stay proposals: PR-4 is implemented behind `pb build --proposals`
(rendered to `out/_proposals/<brand>/`), PR-5 is not implemented. PR-F and PR-C′ (2026-11-03, from
docs/research/fill-diagnosis-2026-11-03.md) are implemented behind `pb build --proposals prf|prc` (`out/_prf`, `out/_prc`,
`out/_prfc`). Nothing in a proposal touches the golden snapshots until approved. Every proposal names its brand signal (R: no look applied to every brand without one).

## PR-1 Fit-up: short text grows up the brand's own ladder — APPROVED 2026-10-31 → rule R-FITUP (P2-spec §9)
**Seen:** stripe/rukko/hdfc-2 slides 4, 5, 6, 23 — body at the brand's body size (21–27 px on 1920) fills under a quarter
of its box; the slide reads like a document page.
**Rule:** for the main text slot of text / bullets / agenda / two-column / image-text / quote slides, when the fitted
content height is < 45 % of the box height, step the size **up** through the brand's own larger roles for that face
(body → bodyLarge → h3 → h2 sizes, only roles the brand defines; the brand's `lineHeight` of the target role is used) while
the content still fits and stays ≤ 60 % of the box; never beyond `h2`. Signal: the brand's own role ladder; recorded in
`text.fit.upSteps` and provenance. Titles never grow (they are already the brand's title role).
**Not applied to:** cards/kpis/steps/table/chart text (shared sizes), captions, footers.

## PR-2 People without photos: initials from the brand's avatar component — APPROVED 2026-10-31 → rule R-AVATAR
**Seen:** team slide (20) on every brand — large grey/red blocks.
**Rule:** when a person has no photo, draw the avatar as the brand's `components.avatar` (mask circle/square, fill `accent`
or the avatar fill token, placeholder `initials` when the token says so) at `avatar.tokens.size`; when no size token, the
avatar is as tall as two lines of the name role (signal: `type.roles.h3`/name role). Initials = first letters of the first
two words, set in the name role on `cardText`/contrast colour.

## PR-3 Logos without files: text chips — APPROVED 2026-10-31 → rule R-LOGOCHIP
**Seen:** logos slide (21) on every brand — six tiny names on an empty slide.
**Rule:** a logo item with no `src` renders as a chip using `components.chip` tokens (fill, radius, padding, font) with the
name in the chip font; when the brand has no chip component, the name is set in the `h3` role centred in its cell with a
`border` hairline (signal: `shape.divider`/`borderWidth`).

## PR-4 Section title keeps clear of brand-boxed decor
**Seen:** hdfc-2 slides 3/16 — the title crosses the red slash the brand places with an absolute `box`.
**Rule:** on cover/section/cta, when a text box intersects a decor element placed by brand `box` on the `front` layer, the
text box is narrowed to the free side (left of the decor when it is right-of-centre, else right of it) down to 50 % of the
content width before the fitter runs; if it then overflows, the original box is kept and the existing `decor-overlap`
info stays. Signal: the brand's own decor box.

## PR-5 Body column width follows the content, not only maxCharsPerLine
**Seen:** the narrowed column (`maxCharsPerLine × avg char width`) leaves 55 % of the slide empty on every brand.
**Rule:** keep the maxCharsPerLine column as the *maximum* line length, but centre the column's content block in the body
area when the slide has no second element (image/decor zone used), i.e. the block's x = margins.left + (bodyArea.w −
column.w)/2 only for text-only slides whose brand `alignment.body` is `center`; for `left` brands the column stays left
and the right zone is offered to decor (unchanged). Signal: `typography.alignment.body`.

## PR-F Fill room (2026-11-03, proposal; docs/research/fill-diagnosis-2026-11-03.md) — APPROVED 2026-11-03 → rule R-FILLROOM (P2-spec §9)
**Seen:** the fill step (C3.1) leaves item descriptions small: of 80 catalogue item flows with a heading and a
description, 54 never reach their next rung - 34 because the description's text box is too short at that rung (the
title box keeps two lines it does not use), others because a timeline's year label already shrunk in the base layout
blocks every try, or because every try raises the heading with the description (akgmedia h3 30 → h1 79).
**Rule (engine `slots.js` `pickFill` / `roomTries` / `addsStrain`, layouts `catalogue-defs.js` `placeTied`, compose
`placeRecorded`):**
1. *Room.* In a catalogue box the fill steps (`box.fill`), the step / timeline / card-title-text items' title gives the
   lines it does not need to the description below it (as item-card / compare-column already do), so the description's
   text box is the cell's room left after the parts; a text box the parts leave at 0 px while it holds text counts as
   an overflow (the strain test rejects that try). A steps / timeline flow is laid out in the record's whole zone (no
   placedBox before the fill) and placed after the fill: a box of 1.35 × the content's fitted height at the chosen roles
   (measured, not estimated), at the record's alignment (C3.1's, or PR-C′'s with that proposal), its connector / line
   moved with it (PR-C′ alone does the same).
2. *Relative strain.* A try is rejected only for strain it adds: compared element by element with the same box at its
   base roles, a text that overflows where its base did not, or is stepped down more steps than its base. An element the
   try does not touch (a timeline year, a marker, a label) never blocks a try on its own.
3. *Description first, monotone* (amended 2026-11-03 by the coordinator; `roomTries` / `chooseRoom`). A flow whose
   item roles have a heading and a description first computes the default build's pick for the box (the same layout,
   the proposal off). Its tries are every [k, kText] (k, kText from 3 down to 0) whose roles `steppedRoles` allows and:
   (a) *Monotone:* a try is eligible only if its text size ≥ the default build's text size AND its heading size ≥ the
   default build's heading size for that box; PR-F only grows a pair, never pulls one down. If no eligible try passes,
   the default pick stays.
   (b) The heading is strictly larger than the text in every chosen try (equal sizes never, unless the default pair is
   already equal).
   (c) *Soft ratio:* among eligible passing tries (no added strain, within the record's share + 10 points) prefer the
   largest text; among those, the largest heading with heading : text ≤ 2.0; if none at that text size has ≤ 2.0, the
   smallest ratio ≤ 2.3 (Editorial's measured 56 / 26 = 2.15 is the largest item pair in the note); above 2.3 only the
   default pair itself.
   A text box (list, paragraph) keeps the three equal steps, a KPI flow (value / label / body) today's six, the first
   that fits winning; both with the relative strain test.
The caps stay: running text ≤ h2, titles ≤ h1, a title never at or below its text.
**Signal:** the catalogue record of the slide - its zone, its fill share (`box.fill`) and its alignment (D1) - and the
brand's own role ladder; no size is invented.
**Where it applies:** only catalogue boxes with `box.fill` (the content/2 slides the catalogue composes); the 68 layouts,
fit-up (R-FITUP) and the Mood are unchanged.
**What it never does:** draw a heading or a description smaller than the default build; add an overflow or a
step-down to an element; choose a pair over 2.3 : 1 other than the default's own; pass the caps. Recorded per box whose drawing differs from the default build (`effects`: `from` / `to` steps and roles, `room`
when only the text box changed; `place` for a placed steps / timeline flow).
**Render (historical, before the approval; the flag is gone):** `pb build golden/brands/<id> --png --proposals prf --before out/<id> --out out/_prf/<id>`.

## PR-C′ Recorded placement (2026-11-03, proposal; replaces the deferred P-C; docs/research/fill-diagnosis-2026-11-03.md) — APPROVED 2026-11-03 → rule R-PLACE (P2-spec §9)
**Seen:** C3.1 maps the catalogue's placement `fill` → top and `bottom` → middle (`VALIGN`): 1,787 of 2,036 containers
(88 %) lose the catalogue's own vertical composition.
**Rule (layouts `catalogue-defs.js` `VALIGN_RECORDED`, `contentAlign(c, {recorded})`, `placeTied`, `decorBand`;
engine `placeInCells`, `placeRecorded`):** under the proposal a catalogue container takes the record's alignment as
recorded - `fill` → middle (the catalogue centres such groups), `top` → top, `middle` → middle, `bottom` → bottom - for
items without a card in their cells (`flow.valign`, placeInCells: a row stays level; at the bottom the content keeps its
top inset at the bottom too), for un-carded text boxes, lists and paragraphs (`align.v`; a text card hugging its text
moves with it, the card sized to the text), and for a steps / timeline flow: as with PR-F, it is filled in its whole
zone (today's tries) and placed afterwards - a box of 1.35 × the measured fitted height at the recorded alignment, its
connector / line moved with it - so PR-C′ never changes a size. *Inside a card the card is the anchor* (amended
2026-11-03 by the coordinator): an item drawn on a card (its own component card, or the Mood's card behind each cell)
keeps its content at the card's top padding - the catalogue aligned such text to a hairline, not to a card - and a
card that fills its cell does not move; the zone-level placement still applies. The band the composition leaves between the title and the content group, when wider than
2 × spacing.lg, becomes a decor zone (after the zone under the content), so brand decor without a box can use it and
nothing else does. The compose passes its proposals into the layout build (`pick` → `def.build({…, proposals})`).
**Signal:** the catalogue record of the slide (D1: composition from the catalogue) - none of the 10 brand JSONs carries a
placement signal, which is why P-C stayed deferred.
**Where it applies:** the catalogue layouts only (content/2 slides); the 68 layouts are unchanged.
**What it never does:** move a title, a footer or a chart / table; resize text (the fill runs before the placement);
move content inside a card. Recorded per box whose drawing differs from C3.1's alignment (`from` / `to`; `cardAnchor`
when only the card anchor changed it), and per slide whose decor lands in the band.
**Render (historical, before the approval; the flag is gone):** `--proposals prc` → `out/_prc/<id>`; both: `--proposals prf,prc` → `out/_prfc/<id>` (fill first, then place). As rules: a plain `pb build`; the sheet against the C4 default build is `out/_rules-fc/<id>/compare.png` (`--before out/<id>`).

## Build notes PR-F / PR-C′ (2026-11-03, after both amendments; showcase deck, 10 golden brands, before = the default C4 build `out/<id>`)
- PR-F changes 2-6 slides per brand (32 in all: bosch, cisco, shopify, stripe 2; hdfc-2, headspace, notion, the-ken 3;
  rukko 6; akgmedia 6); overflow 0. Of the 80 catalogue item flows with a heading and a description, 18 (23 %) draw
  their description larger and none smaller; no heading is smaller. Examples: bosch 4 bodyLarge 26.6 → h3 31.92 (h1
  kept); rukko 28 body → h3 with its year label still 14 steps down; akgmedia 6 of 8 (e.g. 4 body 25 → h2 29, h3 kept).
  Notion: 4 room only (h1 / h2 kept, text box from the title's unused line), 28 h3 / body (21.6 / 27, heading under its
  text) → h1 / h2 (60 / 29.7, 2.02 : 1 - no heading within 2 : 1 at that text size), 29 h3 / bodySmall (equal, 21.6)
  → h2 / h2 (equal, 29.7, allowed by (b) because the default pair is equal); 9 / 10 / 12 / 23 / 37 keep h1 / h2. Median
  heading : text falls on akgmedia (1.43 → 1.03), bosch (2 → 1.83), headspace (2.05 → 1.83), rukko (2.08 → 1.36); pairs
  over 2.3 : 1 are the default's own (cisco 3.0, akgmedia 2.72, rukko 2.77, shopify 2.65 …). Also stepped by the
  relative strain test: rukko 15's KPI labels (h3 → h2, body).
- PR-C′ changes 4-8 slides per brand (57 in all: un-carded KPI / card / list containers centred or at the bottom; on cards
  the content keeps the card's top padding - bosch / akgmedia / notion … 9 lose C3.1's centring in their cards);
  overflow 0; no heading or description changes size (steps / timelines filled in their zone, then placed). The decor
  band is built on 4-8 slides per brand, but no golden brand has decor without a box allowed there, so no decor moves.
- Both (`prf,prc`) change 7-11 slides per brand (84 in all), overflow 0, the fill as PR-F alone (18 grown, 0 smaller).
- Sheets `out/_prf`, `out/_prc`, `out/_prfc/<id>/compare.png` (index per set: `out/_prf/index.html` …). hdfc-2 builds exit 2
  (its two blocking font questions, as the default build).

## PR-6 Template binding: cover / section / CTA / statement from the authored templates (2026-11-04, proposal; V3 of docs/PLAN-template-library.md)
**Seen:** hdfc-2's cover (PLAN-template-library §0): the brand's title layout reserves a blue field (title right, bottom,
42 % wide) beside a photo area under a slanted band device; the one cover layout puts the title bottom-left through the
photo, the slash and the band. The Mood carries none of the composition fields; the V2 capability record does.
**Rule (engine `compose/templateBind.js` behind `composeDeck({ proposals: { templateBinding } })`; matching in
`@pb/templates` `match.js`):** for every cover / section / cta / quote slide, the authored templates of that kind
(`packages/templates/authored/<kind>/*.html` -> `data/authored.json`, 12 templates + 3 options) are matched against the
brand's capability record (`brandSpec.capabilities`) and the slide: each need met names its signal; a required need
unmet disqualifies, and so does any content field the slide carries that the template has no element for (its title,
label or quote label, subtitle, section number, action, a second quote, its own picture: nothing is ever left out
silently; "left out" is kept for template elements the brand cannot fill). An `image:<kind>` need is met only by the
slide's own image or a sample the brand tags `hero` / `cover` / `bleed` (`product-ui` only `hero`). When the brand
gives the kind its own visual (the kind's background hint is an image variant, or a brand device is namedBy /
allowedOn the kind), a template photo or cut-out comes only from the slide's own image unless the template also binds
that brand device. Score = weighted needs met (device, photo area, text zone, overlay 2; every other need 1) - optional
needs unmet; ties: used fewer in the deck, then id; a pinned `tpl-<id>` wins among the qualified. The best one is bound: the device at its own geometry (brand box; drawn rules as a line from their
keys), the photo (the slide's own, else a brand sample of the needed kind, rotated per deck) framed and clipped
(`image.clip`) to the brand's photo area, the brand's overlay over it (`image.blend`), the text stacked in the brand's
text zone (else the template's quiet box) in the kind's own roles with the template's gaps scaled by the brand's title
size and kept clear of the device / photo area / canvas decor polygons the capability measured (a statement's title
and label as a header at the brand's title zone), the template photo inset one gutter clear of the brand's boxed decor
on the slide and of the footer (left out and listed when it would keep under half its height), the logo in the brand's
placement box (else at the template's furniture anchor through placeLogo, at the brand's size for the kind; `none`
leaves it out). No template binds -> today's layout + an info `template` warning naming the nearest and its unmet needs.
**Signal:** the capability record (V2) - every bound element records `source: {template, signal}`; the slide records
`source: {template, score, binding: [{element, role, need, signal | why, status}]}` (deck schema v1.6).
**What it never does:** invent a device, photo or colour (an element no signal fills is left out and listed), replace
the slide's own image with a sample, drop the slide's number / action / quotes / picture (content fit), change any
other kind. Off: every deck byte-identical (packages/engine `templateBind.test.js`).
**Review:** `pb build golden/brands/<id> --proposals pr6 --png --before <plain build> --out out/_v3/<id>` ->
`compare.png` + `index.html` (the binding table per slide); the tables and the hdfc-2 cover numbers are in
docs/research/v3-binding-2026-11-04.md.

## Withdrawn
- PR-E (description follows its heading) and PR-A (composer ladder), built 2026-11-03, withdrawn the same day by the
  owner after the measurement in docs/research/fill-diagnosis-2026-11-03.md (their code removed; PR-A's size report kept
  as the info check `type-ladder` of every deck).

Review order suggested (done for PR-1..3): PR-4 next; PR-5 only if the approved fit-up still leaves slides empty (it does: see the build notes).

## Build notes (2026-10-31, rendered for review: `out/_proposals/index.html`, per brand `compare.png`)
- PR-1 changes 4–7 slides per brand (agenda, text, two-column, image-text, comparison, sometimes bullets/quote); text keeps
  its face/weight/colour and takes the larger role's size + lineHeight; ladder body → bodyLarge → h3 → h2 (roles the brand
  defines; akgmedia's h3 30 > h2 29 is skipped). Recorded in `text.fit.upSteps/upRole`.
- PR-2: initials only where the brand says `placeholder: initials` (rukko); `silhouette` brands get the accent fill at the
  avatar size token with no glyph (no asset to draw); brands without an avatar component get a two-line-high square in the
  surface accent.
- PR-3: chip tokens where the brand has a chip; without one, h3 centred and no hairline when no border signal (cisco, the-ken).
- PR-4 changes 0 slides: hdfc-2's slash lives inside a full-canvas *behind* decor (`coverBands`), which the rule as written
  (front-layer, brand-boxed) does not target. Either widen PR-4 to behind-layer decor with an opaque region, or leave it.
- Open: the right half of text/bullets slides stays empty after PR-1 (PR-5 or a layout rule for text-only slides).
