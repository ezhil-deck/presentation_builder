---
name: slide-anatomy
description: Read a reference slide (PDF page, HTML slide or screenshot) down to its design decisions - every element and its role, background, decor, positions, margins, shared edges, vertical rhythm, type scale, logo and image sizes, cuts and angles, visual balance and the signature device - as one measured record, then collect records per slide category (cover, agenda, section break, chart, CTA ...) into a browsable library with measured ranges. Use whenever someone shares a slide, deck, screenshot or design to "analyse", "study", "break down", "learn from", "extract design details from", or asks what makes a slide work, or to add references to the anatomy library.
---

# Slide anatomy

Turns a reference slide into numbers we can design from. One slide gives one **record**; many records of one
**category** give measured ranges, which the presentation builder turns into skeleton, style and skin decisions
(references/decisions.md). This is research: it runs outside the builder pipeline and never adds AI to it.
References are other people's work: we keep measurements and patterns, never their text, colours, faces or images in our output.

## The four levels every record answers
| Level | Question | Examples |
|---|---|---|
| L1 Elements | What is on it, and what is each thing for? | brand logo, partner logo + label, eyebrow, title, keyword run, subtitle, date, authors, legal, hero image, cut-out, panel, band, cut shape, decor, chart, footer |
| L2 Composition | How is it built? | background, layers, zones and split, margins, shared left edges, vertical rhythm and groups, angles, image bleed and mask, what breaks the margin |
| L3 Balance | Why does it feel right? | type scale and ratios, title size and leading, logo size against the title, image and text area, visual-weight centre, empty space, contrast |
| L4 Intent | What makes it theirs? | signature device, the brand signal it comes from, what breaks if it is removed |

L1-L3 are measured by the scripts. L4 is written by eye, and every L4 claim names the measurement it rests on.

## Workflow
Scripts are in `scripts/` (Python 3 + Pillow; PyMuPDF for PDFs: `pip install pymupdf`; HTML uses the project's puppeteer).

1. **Extract (exact first).** Choose the most exact source available:
   - PDF page: `python3 scripts/extract_pdf.py deck.pdf 7 out/x`. Gives text runs with font, pt, colour and box; images with crop, transparency and bleed; vector shapes with fill and angles; and draw order.
   - HTML slide: `node scripts/extract_html.mjs file.html out/x --selector .slide --index 12`. Gives the same from the browser layout, plus radius, clip-path (its polygon's angles and outline as `mask`) and shadow; a border on some sides only is measured as thin lines, an svg counts its `pieces`, an img is read for transparency. Its page function `rawObjects` is shared with the template record scripts (V1: scripts/catalogue-records.mjs, scripts/template-records.mjs; `scripts/records_batch.py` runs the pixel and anatomy passes over many measured slides).
   - Screenshot or image: `python3 scripts/extract_image.py shot.png out/x --crop x0,y0,x1,y1`. Crop off any app chrome. You get colour regions with straight-edge angles, the palette and grid.png (a 5% grid). Add text and logo objects to raw.json by hand, reading positions off the grid, and mark them `"exact": false`.
2. **Pixel pass.** `python3 scripts/extract_image.py out/x/render.jpg out/x --raw x` adds the background, palette, visual-weight centre, empty space and busyness grid. (Step 1 already did this for screenshots.)
3. **Anatomy.** `python3 scripts/anatomy.py out/x --page 7 --pages 30`, which writes record.json:
   - roles by rule (references/roles.md, generated from the vocabulary: packages/vocabulary/data/vocabulary.json, run by `scripts/vocabulary_rules.py`), each with its `why` and rule id;
   - the category (references/categories.md);
   - margins, edges, rhythm, type scale, zones, logos, images, angles and QA (references/measurements.md).
4. **Check by eye.** `python3 scripts/overlay.py out/x` draws boxes by role, the main edge, the margins and the rhythm gaps. Open overlay.jpg next to the slide and confirm each role and group. A wrong role is fixed in the rule (the vocabulary's rule in packages/vocabulary/data/vocabulary.json, with its fixture; the measurement it reads in anatomy.py), never in that one record. Rule fixes apply to every slide, so re-run the batch after changing a rule.
5. **Whole decks.** `python3 scripts/batch.py decks.json out/anatomy --root <folder>`, where decks.json is `[{file, slug, firm}]`. It runs every page and detects furniture: an object at the same spot on 40% or more of a deck's pages becomes footer / page number. Already finished pages are skipped.
6. **Intent (L4).** For the slides you study closely, fill `L4_intent` in record.json:
   - `signature`: the device;
   - `brandSignal`: where it comes from;
   - `notes`: what the measurements show and what would break.
7. **Library.** `python3 scripts/library.py out/anatomy` writes `out/anatomy/library.html`, one self-contained page that opens from disk. It has:
   - a tab per category, with measured ranges (median, p10-p90), a by-firm table and the reference grid;
   - a detail view with a toggleable overlay;
   - a Method tab showing these files.

   Category corrections made in the page are exported as overrides.json. Put that file in out/anatomy and rebuild.

## What to look at, per slide (the checklist the record must answer)
- **Logos:**
  - which is the brand's and which the partner's (a label such as "Prepared for" or "Commissioned by" says so);
  - the corner each sits in;
  - width as % W, and height compared with the title size.
- **Text stack:**
  - every text object's role, face, weight, size as % H, colour and leading;
  - keyword runs inside the title (weight or face change);
  - caps.
- **Background:** a flat colour, gradient, photo or art, and whether it is dark.
- **Decor:**
  - whether there is any;
  - what it is (swirl, mosaic, brackets, cut shape);
  - whether it is raster or vector, and behind or in front of the text.
- **Shapes:** panels, bands and cut shapes, with their angles. Check whether every cut shares one angle (one angle rule).
- **Images:**
  - area and position;
  - bleed sides;
  - mask: rectangle, cut-out (transparent) or clipped by a shape;
  - whether the image breaks the margin;
  - which way it faces or looks.
- **Positions:**
  - margins per side, and open sides;
  - the shared left edge and what sits on it;
  - the text zone against the visual zone, and how they split or interlock.
- **Rhythm:**
  - gaps down the title column;
  - groups (inner gap vs gap between groups);
  - what is anchored to a margin instead of to the stack.
- **Balance:**
  - type-scale ratios;
  - visual-weight centre, and left:right balance;
  - empty space;
  - which diagonal the masses sit on (logo top-left vs art bottom-right).
- **QA:**
  - placeholders;
  - objects hidden under images;
  - text off the shared edge;
  - more than 5 sizes;
  - titles over 25 words;
  - low contrast;
  - tiny text.

## Rules for this skill
- Measure, don't estimate. When only pixels exist, say so (`exact: false`). Give every number in % of slide W or H, so decks of any size compare.
- Roles and categories come from rules with a stated `why`. When a rule is wrong, change the rule and re-run; never patch one record.
- A range becomes a design rule for the builder only after the owner approves it (references/decisions.md lists the candidates).
- Renders and records of third-party decks stay in git-ignored `out/anatomy/`. Never publish them as an artifact or put them in the repo.

## Files
- `references/roles.md`: L1 role rules.
- `references/measurements.md`: every L2/L3 number and how it is computed.
- `references/categories.md`: the categories, their rules, and what to study in each.
- `references/record-schema.md`: record.json fields.
- `references/decisions.md`: which measured ranges drive which generation-time decisions.
- `references/findings.md`: what the library has taught so far (provisional; consolidate to what makes results best).
- `examples/`: two covers analysed fully, including L4.
