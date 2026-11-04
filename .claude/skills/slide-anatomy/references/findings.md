# Findings from the anatomy library (provisional)

Status: **collected, not consolidated.** Every finding below is a measured pattern from the reference library, kept
so it can be tested in the builder. Later we keep only what makes our results best and drop the rest; a finding becomes a
builder rule only after the owner approves its before/after (docs D9).

Source: 1,720 slides from 55 consulting decks (`out/anatomy/`, run 2026-11-04 after the category fixes). Values are
medians with the p10-p90 range in brackets; % W / % H = share of slide width / height. Read every number with the limits
at the end.

## F1 One frame for the whole deck
- Left margin 3.5-4.3 % W in every category (cover 4.17, chart 3.82, table 3.45, text-heavy 4.32, closing 4.14).
- Working slides: the title starts 4.0-4.4 % H from the top and is 3.7 % H tall (chart, table, text-heavy).
- The frame is fixed per deck; variety happens inside it, never by moving the frame.

## F2 Two registers: statement slides and working slides
| | statement (cover, section, agenda, closing) | working (chart, table, modules, text) |
|---|---|---|
| words | 5-30 (section 5, cover 14, agenda 30) | 190-330 |
| distinct sizes | 1-3 (section 1, cover 3) | 4-5 |
| title height | 5.9-6.7 % H (cover 6.68 [4.44-11.1], section 6.38 [4.63-14.2]) | 3.7-4.4 % H |
| dark background | 17-29 % (section 29, cover 25, closing 24) | 2-8 % |
| picture area | about 40 % (cover 37.8, section 42.2) | exhibits |
- Dark, full photos and colour fields are punctuation, kept for statement slides; the contrast of the two registers is
  the deck's rhythm.

## F3 The type scale steps are small
- Adjacent size ratio 1.2 [1.07-1.8] over 5,989 steps.
- Title : body 1.9 on working slides (chart 1.89, table 1.83, modules 1.88), 2.3 on covers [1.34-5.5], 2.2 on KPI.
- Hierarchy = several small steps plus weight, not big jumps.

## F4 Consulting is the dense end
- Working slides carry ~190 words in 5 sizes. These decks teach the dense end of minimal -> modular; the minimal and
  creative ends need other references (our catalogue, design references).

## F5 Covers: no single formula, but balanced
- Text / visual relation: text over the picture or panel 23, type only 15, left-right split 13, top-bottom 4 (of 55).
- Visual-weight centre 48.9 % W, 49.9 % H [44-55]: covers balance around the middle, not heavy to one side.
- Title top about 30 % down the slide; 14 words; 3 sizes; title : next size 2.3.
- Brand logo: width 7.9 % W [3-18], height 0.72 x the title size [0.22-1.6]; corners top-left 35, bottom-right 27,
  bottom-left 21, top-right 10 (93 logos).
- Metadata stack in groups: inside a group ~2 % H, between groups wider, legal pinned to the bottom margin (McKinsey
  cover: 2.1 / 1.8 then 3.3 then legal at the bottom margin).
- Angled cuts on 27 % of covers: a firm's signature (Accenture: both panel edges at the same ~10 deg), not a consulting
  rule -> an angle only from the brand's own shape signal.

## F6 Section breaks
- 5 words, 1 size, title 6.38 % H; dark 29 %; a picture or colour field on ~42 % of the area.
- The same layout repeats through a deck (Roland Berger "B" cut-outs, KPMG photo panels, EY "Chapter n"), often with a
  large numeral (EY "04", Accenture "01" at ~30 % H) or the chapter number beside the title.
- Lines inside the title group ~6 % H apart: the most open spacing of any category.

## F7 Closing / contact
- Title 3.86 % H (smaller than the cover: the closing is a working page that carries people), ~155 words, 24 % dark.
- Two kinds: a "Thank you" statement (cover-like, large type, photo or colour field) and a contact sheet (people with
  photo, name, role, email in a grid). The big logo returns here.
- Spacing inside groups ~1.5 % H: dense like a working slide.

## F8 Spacing follows the register
- Gap inside a text group: cover 4.4 % H, section 6.3, agenda 2.6, working slides 1.1-1.5. A cover breathes ~3x a
  working slide.

## F9 A deck is a few layouts reused with variations
- Agendas repeat as trackers (the current item highlighted); section breaks repeat one layout; footer and logo sit at
  the same spot on 40 %+ of pages. Consistency inside a deck beats novelty per slide.

## Tested in the builder
- 2026-11-04, statement proposals A (cover-anchor, section-lower-left, cta-statement) and B (cover-split,
  section-numeral-side, cta-split) on the 10 golden brands: **owner verdict - not better than today.** Seen in the
  renders: moving the title group up (F5 "title top 30 %") put it over the subject of photo covers (bosch, cisco,
  shopify); lower-left sections left the top half empty with nothing to hold it; the numeral-side column wrapped short
  titles to two lines. Lesson: position and ratio medians alone do not improve a slide; the weak point today is the small
  title in a large field, which these layouts did not change. F5's 30 % and F6's placements stay unproven.

## Limits
- Not yet: why a design works (L4 intent by eye), which slides are good (medians = typical, not best), the minimal and
  creative ends, our catalogue side by side.
- Rough numbers: empty space comes from the pixel pass; text-area share is inflated on dense slides (text zones overlap
  exhibits).
- Category misses left: heat-map tables read as charts, some raster charts as section breaks, two all-legal last pages
  as closing.
