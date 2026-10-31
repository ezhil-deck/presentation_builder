# P3 — design-quality proposals (need the owner's approval before they become rules)

Status 2026-10-31: **PR-1, PR-2, PR-3 approved by the owner ("Approve PR-1..3") and now rules of every build** —
`docs/P2-spec.md §9` (R-FITUP, R-AVATAR, R-LOGOCHIP), tested in `packages/engine/__tests__/rules-approved.test.js`, golden
decks re-snapshotted (engine 0.3.0). PR-4 and PR-5 stay proposals: PR-4 is implemented behind `pb build --proposals`
(rendered to `out/_proposals/<brand>/`), PR-5 is not implemented. Nothing in a proposal touches the golden snapshots until
approved. Every proposal names its brand signal (R: no look applied to every brand without one).

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
