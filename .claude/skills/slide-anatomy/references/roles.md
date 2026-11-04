# L1 roles: how each object gets its role (anatomy.py)

<!-- generated from packages/vocabulary/data/vocabulary.json by scripts/vocabulary-docs.mjs: do not edit -->

anatomy.py decides every role with the vocabulary (packages/vocabulary/data/vocabulary.json, run by
scripts/vocabulary_rules.py; the human page is docs/vocabulary.md). Rules run in this order; the first rule that holds
wins, and its reason is stored in `why` (its id in `rule`). Rules that read fields anatomy does not measure (block
items, brand context, opacity, tilt ...) never fire on a reference; they are listed so the order is whole. An object no
rule decides is `unknown` (before V0: small-text). Painted-over objects keep the QA role `hidden` and are not identified.

The **body size** is the size carrying the most words once the largest size is left out (one size only: that size). On
covers the title carries most words, so leaving the largest size out stops the title becoming "body".

| order | role | rule | when | why |
|---|---|---|---|---|
| 50 | cell | `cell.row` | inBlock; cells >= 2 | a field of a block holding two or more cells: a table row |
| 60 | big-number | `big-number.block` | kind is text; inBlock; text matches `number`; text does not match `date`; sizePctH >= 1.5 x bodyPctH | a number pattern (not a year / date) at >= 1.5x body in a block (a KPI value) |
| 70 | label | `label.chart` | kind is text; inBlock; itemFields = 1; words <= 6; blockDataLabels >= 2 | a short one-field item of a block that also shows two figures or more of its own (data labels, not a 1..n numbering): a chart / diagram label |
| 75 | marker | `marker.text` | kind is text; itemHead; words <= 2 | a short text at the head of an item |
| 80 | bullet | `bullet.list-line` | kind is text; inBlock; itemFields = 1; blockItems >= 1 | the only text of its item in a list block |
| 90 | heading | `heading.item` | kind is text; inBlock; it leads its item (heaviest, then first) | leads its item: the heaviest of the item's free texts (the first in reading order on equal weight) |
| 95 | body | `body.kpi` | kind is text; inBlock; a field of its item is big-number | the text of an item that holds a big-number: it explains the figure |
| 96 | description | `description.under-heading` | kind is text; inBlock; a field before it in its item is heading | reads after the heading of its item |
| 97 | paragraph | `paragraph.block` | kind is text; inBlock; not item; itemFields = 1 | the block's only run of text, outside any item (one line counts: a one-sentence statement block) |
| 98 | paragraph | `paragraph.lines` | kind is text; inBlock; lines >= 2; not (a field before it in its item is heading) | running text of 2 lines or more with no heading in its item |
| 98.5 | decor-word | `decor-word.faded` | kind is text; words <= 3; opacity <= 0.5 | a word or two at half opacity or less: decoration, not copy |
| 100 | legal | `legal.wording` | kind is text; text matches `legal`; sizePctH <= 1.05 x bodyPctH (holds when the right side is missing) | legal wording at body size or smaller (wording decides before repetition: a repeated copyright line is still legal) |
| 110 | source | `source.wording` | kind is text; text matches `source`; sizePctH <= bodyPctH (holds when the right side is missing) | starts with Source / Note, no larger than body (wording decides before repetition) |
| 120 | page-number | `page-number.furniture` | kind is text; furniture; text matches `pagenum` | digits only, repeated on >= 40 % of the pages at this spot |
| 130 | footer-text | `footer-text.furniture` | kind is text; furniture | repeated on >= 40 % of the deck's pages at this spot |
| 140 | page-number | `page-number.band` | kind is text; text matches `pagenum`; (y0 > 88) or (y1 < 10); sizePctH <= bodyPctH (holds when the right side is missing) | digits only, in the top / bottom band, not larger than body |
| 150 | label | `label.partner` | kind is text; text matches `partner` | 'prepared for / commissioned by' wording: names the partner mark beside it |
| 160 | date | `date.pattern` | kind is text; text matches `date` | date pattern |
| 170 | placeholder | `placeholder.wording` | kind is text; text matches `placeholder` | placeholder wording (QA) |
| 180 | contact | `contact.wording` | kind is text; text matches `contact`; words <= 25 | email / web / phone / thank-you wording |
| 190 | authors | `authors.names` | kind is text; commas >= 2; not hasDigit; words <= 60; capitalShare >= 0.7 | comma-separated capitalised names, no digits |
| 195 | quote-mark | `quote-mark.glyph` | kind is text; text matches `quoteGlyph` | only quote glyphs |
| 196 | attribution | `attribution.under-quote` | kind is text; words <= 15; directly under a text matching `quoteEnd` (gap <= 4 % H, smaller than it) | directly under the end of a quote (a text closing with a quote mark), smaller than it, 15 words or fewer |
| 197 | caption | `caption.under-image` | kind is text; sizePctH < bodyPctH (holds when the right side is missing); words >= 2; words <= 30; text does not match `number`; directly under a image of >= 1.5 % (gap <= 2 % H) | a phrase directly under a picture (within 2 % H), smaller than body, not a figure |
| 199 | tabs | `tabs.row` | kind is text; rowPeers >= 2; activePeer; words <= 3 | one of a row of short texts with one marked active |
| 210 | big-number | `big-number.size` | kind is text; text matches `number`; sizePctH >= 1.5 x bodyPctH | a number at >= 1.5x body size |
| 300 | title | `title.largest` | kind is text; the largest sizePctH among the free text (topmost within 0.05) | largest free text (topmost on a tie) |
| 310 | subtitle | `subtitle.under-title` | kind is text; words >= 1; directly below the title (gap < 1.6 x its size, same edge, the subtitle stack growing); sizePctH >= 0.95 x bodyPctH (holds when the right side is missing) | directly under the title, same edge, smaller |
| 320 | eyebrow | `eyebrow.above-title` | kind is text; words >= 1; directly above the title (gap < 1.6 x its size, same edge); words <= 8 | short line just above the title, same edge |
| 330 | body | `body.size` | kind is text; \|sizePctH - bodyPctH\| < 0.15 | at the body size |
| 340 | label | `label.small` | kind is text; sizePctH < bodyPctH; words <= 6 | short and smaller than body |
| 350 | heading | `heading.larger` | kind is text; sizePctH > bodyPctH | larger than body, not the title |
| 395 | device | `device.named` | not (kind is text); (named) or (signature) | the brand names it as its device (or the reference record names it its signature) |
| 400 | background | `background.fill` | kind is shape; areaPct >= 90 | covers >= 90 % of the slide |
| 401 | background-art | `background-art.cover` | kind is image / region; areaPct >= 90 | art covering >= 90 % of the slide |
| 410 | brand-logo | `brand-logo.furniture` | kind is image / vectorgroup; furniture; areaPct < 5 | a small mark repeated on >= 40 % of the deck's pages at this spot |
| 420 | partner-logo | `partner-logo.label` | kind is image / vectorgroup; areaPct < 5; next to a text the rule `label.partner` identified | small mark next to a partner label |
| 421 | partner-logo | `partner-logo.not-brand` | kind is image / vectorgroup; inLogos = false | its file is not one of the brand's logos |
| 425 | brand-logo | `brand-logo.file` | kind is image / vectorgroup; inLogos = true | its file is one of the brand's logos |
| 428 | logo-item | `logo-item.grid` | kind is image / vectorgroup; areaPct < 5; areaPct >= 0.1; aspect >= 1.2; not holdsText; (kind is image) or (pieces >= 3); peerMarks >= 3 | one of >= 3 similar wide marks in a row / grid (an image, or a drawing of 3 pieces or more, holding no text) |
| 430 | brand-logo | `brand-logo.corner` | kind is image / vectorgroup; areaPct < 5; inCorner; aspect >= 1.2 | small wide mark in a corner zone |
| 440 | chart-exhibit | `chart-exhibit.vector` | kind is vectorgroup; pieces >= 8; areaPct >= 4; numberLabelsInside >= 3 | many vector pieces holding >= 3 number labels |
| 441 | diagram | `diagram.vector` | kind is vectorgroup; pieces >= 8; areaPct >= 4; textsInside >= 2 | many vector pieces holding word labels |
| 442 | illustration | `illustration.vector` | kind is vectorgroup; pieces >= 8; areaPct >= 4 | many vector pieces, no labels inside |
| 445 | chart-exhibit | `chart-exhibit.element` | kind is chart | a chart element |
| 446 | table-exhibit | `table-exhibit.element` | kind is table | a table element |
| 448 | watermark | `watermark.faint` | kind is image / vectorgroup; opacity <= 0.35; areaPct >= 5 | faint mark over a large area |
| 450 | cutout | `cutout.transparent` | kind is image; areaPct >= 12; transparent | image >= 12 % of the slide with transparency |
| 451 | hero-image | `hero-image.large` | kind is image; areaPct >= 12 | image >= 12 % of the slide |
| 452 | avatar | `avatar.round` | kind is image; areaPct < 4; mask = "ellipse" | small image cut to a circle |
| 455 | picture | `picture.size` | kind is image; areaPct >= 1.5 | image, 1.5 % of the slide or more |
| 456 | icon | `icon.image` | kind is image | image under 1.5 % of the slide |
| 458 | sticker | `sticker.tilted` | not (kind is text); tilt >= 3; areaPct < 6 | small and tilted |
| 459 | badge | `badge.on-edge` | kind is shape / region; holdsText; areaPct < 1.5; heldWords <= 3; onEdge; not (tilt >= 3) | small level shape with a short text on the edge of another element |
| 460 | chip | `chip.pill` | kind is shape / region; holdsText; areaPct < 1.5; heldWords <= 3; pill | a small pill holding a short label |
| 461 | button | `button.cta` | kind is shape / region; holdsText; areaPct < 3; heldWords <= 4; heldText matches `cta` | a small shape holding call-to-action wording |
| 462 | callout | `callout.pointer` | kind is shape / region; holdsText; pointer | a text fill with a pointer |
| 463 | pager | `pager.series` | series >= 3; (y0 > 85) or (y1 < 15) | one of >= 3 equal small marks in a row at the top / bottom |
| 465 | frame | `frame.outline` | kind is shape / region; stroke; not fill; framesContent | an outline around content |
| 466 | marker | `marker.shape` | not (kind is text); itemHead; areaPct < 1 | a small shape at the head of an item |
| 467 | connector | `connector.joins` | not (kind is text); thin; length >= 2.5; joinsItems >= 2 | a thin line joining >= 2 items of one block |
| 470 | divider | `divider.between` | not (kind is text); thin; length >= 2.5; sidesWithContent = 2 | thin line with content on both sides along its length |
| 471 | rule | `rule.thin` | not (kind is text); thin; length >= 2.5 | thin line, 2.5 % of the slide long or more |
| 480 | cut-shape | `cut-shape.angle` | kind is shape / region; angles | filled shape with a non-axis edge |
| 490 | band | `band.strip` | kind is shape / region; spansSide; heldTexts <= 0 | full-width / full-height strip holding no text (furniture aside) |
| 495 | panel | `panel.large` | kind is shape / region; holdsText; areaPct >= 8 | large fill holding text |
| 496 | card | `card.small` | kind is shape / region; holdsText | fill holding text |
| 499 | decor | `decor.fill` | kind is shape / region / line | fill holding no text |
| 500 | icon | `icon.vector` | kind is vectorgroup; areaPct < 1.5 | vector under 1.5 % of the slide |
| 501 | decor | `decor.vector` | kind is vectorgroup | vector over 1.5 % of the slide, no other rule |

Slide categories run the `kind` chain the same way (references/categories.md describes them; the vocabulary names them
E3 `<kind>-slide`, and each rule keeps the category name the library uses):

| order | category | kind | when |
|---|---|---|---|
| 10 | cover | cover-slide | page = 1 |
| 20 | agenda | agenda-slide | agendaHeading; page <= 6 |
| 30 | closing-contact | cta-slide | closingHeading |
| 40 | legal | legal-slide | fromEnd <= 3; legalWords > 60; legalWords > words |
| 50 | closing-contact | cta-slide | fromEnd <= 2; not charts; numberLabels < 6; bigNumbers < 2; closingWords |
| 60 | legal | legal-slide | fromEnd <= 3; (legalWords > 60) or (legalStart) |
| 70 | back-cover | back-cover-slide | fromEnd = 0; words <= 30 |
| 80 | quote | quote-slide | quoteText; words <= 80; not charts |
| 90 | section-break | section-slide | words <= 25; not charts; bigNumbers <= 1; (hasTitle) or (bigNumbers >= 1); mainTexts <= 3; (darkBackground) or (fieldPictures >= 1) or (bigNumbers >= 1) or (titleToBody >= 2.2) |
| 100 | kpi | kpi-slide | bigNumbers >= 2; not charts |
| 110 | chart | chart-slide | (charts >= 1) or (numberLabels >= 6 and shapes >= 3) |
| 120 | table | table-slide | tableRows >= 3 |
| 130 | text-heavy | text-slide | columns >= 3; wordsPerColumn > 90 |
| 140 | modular-columns | cards-slide | columns >= 3 |
| 145 | - | bullets-slide | bulletLines >= 3 |
| 146 | - | two-column-slide | textColumns = 2 |
| 147 | - | comparison-slide | blocks.compare >= 1 |
| 148 | - | diagram-slide | diagrams >= 1 |
| 149 | - | timeline-slide | blocks.timeline >= 1 |
| 150 | team-or-gallery | team-slide | pictures >= 3; words <= 150 |
| 151 | - | steps-slide | blocks.process >= 1 |
| 152 | - | logos-slide | logoItems >= 3 |
| 155 | image-text | image-slide | photos >= 1; words <= 10 |
| 160 | image-text | image-text-slide | photos >= 1; words <= 150 |
| 170 | blank | blank-slide | words = 0; photos <= 0; pictures <= 0 |
| 175 | text-heavy | text-slide | words > 160 |
| 190 | text | text-slide | always (the last rule of its chain) |

<!-- end of generated section -->

## Known limits (state them; fix them as general rules)
- **Raster-only decor** (string art, mosaics baked into one image) shows up as one background-art object. Describe it in L4.
- **Charts drawn as long lines** (line charts, gridlines) are not grouped into one vector group. The `chart` category falls back to "6 or more number labels over drawn shapes".
- **Logos set as text** (a wordmark typed in a font) become text. Spot them on the overlay and note them in L4.
- **Draw order in PDFs** comes from PyMuPDF's bbox log and can mismatch for overlapping objects of the same kind. Contrast is therefore measured from the render's pixels, not from the layer order.
