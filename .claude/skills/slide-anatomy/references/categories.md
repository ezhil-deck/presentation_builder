# Slide categories: rules and what to study in each

Categories are set by rules, in the order below; the first match wins (the vocabulary's `kind` chain in packages/vocabulary/data/vocabulary.json, run by anatomy.py over its measurements; references/roles.md lists the rules as they run, and each slide kind is the E3 term `<kind>-slide`). The record keeps the reason, and the library lets a reviewer correct one by hand (overrides.json).

| Category | Rule (summary) |
|---|---|
| cover | Page 1. |
| agenda | The title / heading / eyebrow says agenda, contents or overview, on pages 6 or earlier. |
| closing-contact | A heading that is only "Contacts / Contact us / Thank you / Get in touch" (or ends in "Contacts"), title-sized; or in the last 3 pages with contact or thank-you wording, no chart. A phrase inside body copy ("thanks to...", "Contact center") does not count. |
| legal | In the last 4 pages, over 60 legal words that outweigh the other words (checked before closing-contact), or mostly legal wording. |
| back-cover | The last page, 30 words or fewer. |
| quote | The text opens or closes with quote marks, 80 words or fewer, no chart. |
| section-break | 25 words or fewer in 3 or fewer texts, one large text, a colour field / photo / numeral, no exhibit. A photo counts only when it bleeds, is a cut-out, or is not under a top title (a picture under a top title is an exhibit, e.g. a raster chart). |
| kpi | 2 or more big numbers (a rank like "#1" counts), no chart. |
| chart | A chart vector group, or 6 or more number labels over drawn shapes. |
| table | 3 or more rows, each of 3 or more short cells (median of 4 words or fewer) sharing a baseline. |
| modular-columns | 3 or more columns of text blocks side by side (cards, pillars), 90 words or fewer per column; longer columns are running text (text-heavy). |
| team-or-gallery | 3 or more pictures, 150 words or fewer. |
| image-text | A photo with text, 150 words or fewer. |
| text-heavy / text | Over 160 words / the rest. |

## What to study per category (beyond the general checklist in SKILL.md)
- **Cover:**
  - which logos, where, and how big against the title;
  - the partner label and logo;
  - the title stack (eyebrow / title / subtitle / date / authors) and its groups;
  - background, panel and cut angle;
  - image mask, bleed and margin break;
  - legal anchored to the bottom margin;
  - the weight diagonal.
- **Agenda:**
  - number of items and the numbering style (01 / 1. / roman / none);
  - item spacing vs item size;
  - an active-item marker when the agenda repeats as a tracker;
  - columns vs a list;
  - whether a picture or colour field shares the slide.
- **Section break:**
  - full-bleed colour / photo / numeral;
  - numeral size against the title;
  - title position (centre / lower-left / left third);
  - whether the grid is broken on purpose;
  - how often it appears in the deck (every N pages).
- **Quote / statement:**
  - quote-mark treatment (glyph, size, colour);
  - attribution stack (name / role / company) and its gap;
  - line length;
  - a portrait, and its mask.
- **KPI:**
  - number size against the title (3x or more);
  - number count and arrangement (row / grid / hero + support);
  - caption under or beside the number;
  - dividers (hairline / none / tiles);
  - delta pills;
  - one takeaway.
- **Chart:**
  - the exhibit header stack (title, then unit line);
  - one data hue against grey;
  - direct labels, and gridlines;
  - change annotation;
  - source line position;
  - takeaway column width and side;
  - exhibits per slide.
- **Table:**
  - header row treatment (fill / rule / bold);
  - zebra or rules;
  - column alignment (numbers right);
  - a highlight row or column;
  - cell padding against the text size.
- **Modular columns:**
  - number of modules;
  - module container (tile / card / rule / none);
  - icon or number on top;
  - heading/body ratio inside a module;
  - gutter against the margin.
- **Image + text:**
  - image share and side;
  - bleed;
  - mask shape;
  - text width;
  - overlap (text over the image on a panel?).
- **Team / gallery:**
  - portrait mask (circle / square / cut-out);
  - grid count;
  - name/role stack;
  - equal crops.
- **Closing / CTA:**
  - contact block order;
  - the call to action, and its weight;
  - logo returns large here;
  - a back-cover colour field or photo.
- **Legal / back cover:**
  - smallest text size;
  - columns;
  - whether the logo is the only mark.
