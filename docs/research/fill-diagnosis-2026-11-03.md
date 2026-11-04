# Why item descriptions stay small — measurement of the fill step (2026-11-03)

Status 2026-11-03: the replacement rules below were built as proposals PR-F and PR-C′ (docs/P3-proposals.md), approved
by the owner the same day ("Approve both") and are now rules of every build (docs/P2-spec.md §9 R-FILLROOM, R-PLACE;
engine 0.4.0).

Written by the coordinator after P-E and P-A (docs/research/external-template-patterns.md §4.2) were built as
proposals and their before / after sheets read: **neither does what the note promised.** P-E (equal steps first)
never raises a description; where it changes a slide it lowers the heading (bosch 4, 28). P-A (five rungs with ratio
targets) shrinks card text on six brands (the-ken 39.8 → 27.5 px) and raises the number of sizes a deck uses. So the
fill step was measured before any further rule (showcase deck, 10 golden brands, real Moods, default build: 80 item
flows with heading + description, 10 lists, 30 KPI boxes; 690 fill tries; the per-box table is in the session's
scratchpad, not in git).

## What binds the description's next rung (54 blocked flows of 80)

| cause | flows |
|---|---|
| the description's **text box is too short** at the next rung: same line count, the fitter steps it down, the try is rejected | 34 |
| the same, plus the heading at its next rung shrinks too | 8 |
| the same, plus a timeline's year label (`when`) already shrunk | 4 |
| the year label alone | 2 |
| the heading alone (akgmedia h3 30 → h1 79 px, a 13–14-step fall) | 2 |
| an element already shrunk in the base layout (the year label on notion / rukko 28–29, up to 14 steps), so no try can pass | 4 |
| the share bound (`fill + 0.1`) | 1 (cisco 23, together with an overflow) |
| "the title must stay larger than the text" | 0 of 690 tries |

26 flows reach the ceiling (h2 / the ladder's top); 19 flows pass no try at all (akgmedia 6, cisco 3, rukko 3,
hdfc-2 2, notion 2, shopify 2, headspace 1).

## Three mechanics behind it (engine, not the brands)

1. **A steps / timeline flow box is sized before the fill.** `placedBox` (catalogue-defs.js) gives the flow
   1.35 × the content's *base-role* need, so a trial at larger roles has no room inside the box it is tried in; the
   catalogue's zone (L31-7: 412 px for a 132 px numeral, a two-line heading and a three-line description) is there
   but unused. Cards show the same on the item side: the heading box takes the cell and the text box collapses to 0 px
   (akgmedia 10, 37).
2. **The strain test is absolute.** A try is rejected when *any* text in the box is shrunk or overflows, including
   parts the fill never touches (the year label); nine timeline boxes can never step.
3. **Every try raises the heading with the description.** There is no "description up, heading stays" try; where the
   brand's next heading rung is a big jump the description is blocked by its heading.

## What the catalogue placement says (C3.1 `VALIGN`)

`fill: 'top', bottom: 'middle'` — 1,027 of 2,036 containers are `fill` and 760 `bottom`, so the catalogue's own
vertical composition (pattern 2 of the note: content anchored low, the open band deliberate) is dropped for 88 % of
containers. C3.1's reason ("the free space holds what we do not draw") was written before D7 (numerals drawn) and
D6 (cards drawn).

## Replacement rules (proposals; before / after on the 10 brands; the catalogue record is the signal, D1)

- **PR-F Fill room.** (1) The fill runs inside the zone the record gives (the flow box is placed *after* the fill,
  at the recorded alignment, to the need of the chosen roles); the item layouts size the text box from the cell's
  room left after the parts, never 0. (2) A try is rejected only for strain the try *adds*: an element shrunk in the
  base layout by n steps may stay shrunk by n. (3) Tries put the description first: for each text step from 3 down,
  the heading steps that keep "heading larger than text" and **heading : text ≤ 2 : 1** (the note's measured item
  pairs: Pitch 45 / 26, Editorial 56 / 26) — a heading never climbs where its description cannot follow. Keeps the
  existing caps (running text ≤ h2, titles ≤ h1).
- **PR-C′ Recorded placement.** `fill` → middle of the zone (the catalogue centres such groups), `bottom` → bottom;
  the band left between title and content is a decor zone. Replaces P-C, which needed a brand-JSON signal none of
  the 10 brands has: here the signal is the catalogue record of the slide itself (D1: composition from the catalogue).
- **P-A is withdrawn as a scale rule**: the brands' ladders have gaps too large to serve as rungs (stripe h3 = body;
  akgmedia h3 30 → h1 79), so forcing five rungs can only shrink text. Pattern 1 ("few sizes") follows from PR-F
  stepping consistently; a `type-ladder` *check* (info: sizes used per slide, the jump ratios) can stay as a report
  without changing a pick.
- **P-E is withdrawn**: its premise (the try order) was not the block.
