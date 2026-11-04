# Template records — the convention for hand-authored templates

A template is an anatomy record plus intent, written in the vocabulary (docs/PLAN-template-library.md §2, V1). The
record format is `schemas/template.schema.json`; the records live in `packages/templates/data/` and are read through
`@pb/templates` (`templates()`, `templatesOf(category)`, `templateById(id)`, `validateTemplate(record)`, `needsOf(record)`).
Two sources write them, with the same measuring pipeline (the slide-anatomy extractor, its pixel pass and `anatomy.py`):

| source | script | output | needs |
|---|---|---|---|
| the Rich Slide Catalogue (1,646 slides) | `npm run templates:catalogue` (scripts/catalogue-records.mjs) | `packages/templates/data/catalogue.json` | none: a composition only (`composition: true`) |
| hand-authored HTML (this page) | `npm run templates:authored -- <dir> <out.json>` (scripts/template-records.mjs) | the file you name; a library file goes in `packages/templates/data/` | from `data-need` |

Both run at authoring time only (puppeteer + Python 3 / Pillow, wrapped in `caffeinate -d -u -i`); the build never
measures and never calls a model. A record is `exact: true` (measured from the browser layout) and `verifiedAt: null`
until the owner verifies it (D13).

## Writing a template

One HTML file holds one or more templates. Each template is an element with class `slide`, **1920 x 1080 px**, its
children positioned absolutely. Self-contained: images as `data:` URIs or files next to the HTML; every other request
is blocked (the measurement is offline), so a web font that is not embedded falls back.

**The catalogue's marks** (as in `golden/catalogue/rich-slide-catalogue.html`):

| mark | on | meaning |
|---|---|---|
| `class="k"`, `"t"`, `"r"`, `"src"`, `"ft"`, `"lg"` | a direct child of `.slide` | header parts: eyebrow, title, rule, source, footer, logo. `k`, `src`, `ft`, `lg` are furniture (anchored to a margin) |
| `data-c="1" data-type="<container type>"` | a content block | a container (the catalogue's types: simple_list, list_with_description, kpi_block, roadmap ...) |
| `data-c="1" data-f="<field>" data-i="2"` | a text | a field of container 1, item 2 (heading, description, bullet, value, body, paragraph, point ...) |

**The intent marks** (V1):

| mark | on | meaning |
|---|---|---|
| `data-template="<id>"` | `.slide` | the template id (required; letters, digits, `.`, `_`, `-`) |
| `data-category="<E3 slide kind>"` | `.slide` | the kind the template is written for (`cover-slide`, `section-slide`, `cta-slide`, `quote-slide` ...): record `authoredCategory`; the binding (V3) reads it, because the kind chain decides from deck position (page 1 = cover), which a template does not have. A different identified `category` is a question (element `slide`) |
| `data-basis="<sentence>"` | `.slide` | the measured range(s) the composition is grounded in (anatomy references, numbers only): record `provenance.basis` |
| `data-option="mirrored" \| "dark" \| "image-left" \| "image-right"` | `.slide` | a variant of the template with the same `data-template`; its record id is `<id>~<option>`, and every variant lists the others in `options` |
| `data-role="<E2 term>"` | a non-field element | what the element is for: `device`, `hero-image`, `cutout`, `brand-logo`, `panel`, `band`, `button` ... (any E2 term of docs/vocabulary.md) |
| `data-need="<capability key>"` | an element the brand must supply | see the grammar below |
| `data-need-optional` | with `data-need` | the template is still itself without it |
| `data-treatment="<E4 term>"` | an image | how it sits: `side`, `full`, `background-image`, `transparent`, `clipped` ... |

The element carrying a mark must draw something the measurement sees: a fill, a border, an image, an svg or text of
its own. An empty positioning wrapper names nothing (an error). A photo area is best drawn as an `<img>` placeholder
(a neutral grey image), so it is measured as an image.

### The capability-key grammar (shared with the brand capability record, V2)

`packages/vocabulary/src/capabilities.js` (`parseCapabilityKey`, `isCapabilityKey`) parses every key; a key outside it is
an error wherever it is written.

| key | the template needs |
|---|---|
| `device:<id>` | a device (the brand's decor element of that id; the binding step, V3, matches it) |
| `photo-area` | a photo area (the brand's `layouts[].composition`) |
| `overlay:<id>` | a tint / overlay |
| `text-zone` | a field reserved for text |
| `image:<kind>` | an image of a kind: `photo-people`, `photo-product`, `product-ui`, `illustration`, `abstract` |
| `image:any` | (a need only, @pb/templates `parseNeedKey`) an image of any of those kinds; a brand capability is never `image:any` |
| `cutout` | a cut-out (transparent) image |
| `colour-field:<surface id or role>` | a strong colour field |
| `logo:<variant>` | a logo variant: any key of the brand's `logos.variants` (`full`, `mark`, `wordmark`, `monoLight`, `monoDark`, `icon`, `reverse` ...) |
| `mask:<id>` | a mask an image is cut to |
| `component:<term>` | a component of that E2 role (`component:chip`, `component:button` ...) or E3 structure (`component:quotes`, `component:process`, `component:timeline`, `component:logos`, `component:people`, `component:stack` ...); a slide kind is not a component |
| `angle`, `second-face`, `weight-contrast`, `type-ladder` | an angle rule (one key for all of a brand's angles), a second face, a weight contrast, a type ladder |
| `composition`, `motion` | the brand's composition (density / whitespace) rules, its motion block: capabilities with no element |

## What the measurement does with the marks

The intent marks are **never read by a rule**: `identify()` names every element from what is visible (boxes, sizes,
weights, lines, fills, borders, angles, transparency, the item grouping of `data-c` / `data-i`), exactly as it does for
the catalogue (whose `data-f` / `data-type` stay hidden too). Then:

- an authored role (or treatment) that differs from the identified one becomes a **question** in the record
  (`questions[]`): the element keeps the identified role, the authored mark stands only once the owner sets
  `verifiedAt` (D13). Example from the fixtures: a slanted band authored `device` is identified `cut-shape` (a filled
  shape with a non-axis edge; `device` needs the brand's or the record's own signature, never a mark).
- an authored role or treatment that is not a vocabulary term: an **error** (an unknown term);
- a need outside the grammar: an **error**;
- a need (or role) on an element that draws nothing: an **error** (it names no element).
Any error: the script lists them all and writes nothing (exit 1).

## What a record carries

`category` (E3 slide kind, from the vocabulary's kind chain), `elements[]` (E2 role, E1 primitive, box, E4 treatment,
text metrics: size % H, weight, lines, words, align, caps, leading; z; `why` = the rule id that decided the role; the
marks as written), `zones` (text / visual boxes, `split`; `source.shapeCode` for the catalogue's shape slides),
`margins`, `edges` + `mainEdge`, `rhythm`, `hierarchy`, `balance` (weight centre, left : right, empty space, the
diagonal the masses sit on, the 3 x 3 busyness grid), and intent:

| intent | measured as |
|---|---|
| `device` | the element identified as `device` (zone by its centre, angle from its edges, layer from the texts it overlaps, `breaksMargin`); null with its why otherwise (the catalogue draws no brand device; an authored device is a question until verified) |
| `quiet` | the busy3x3 cells (edge energy 0-100) under the text zone; `busy` = the busiest |
| `image` | the largest picture: treatment (image-treatment chain), bleed sides, mask (clip / radius; none for a cut-out), `faces: null` (no measurement gives it) |
| `emphasis` | the first that holds: a big-number (`numeral`), a run set heavier than its text (`weight-run`), a panel holding text (`colour-field`), title >= 3.5x body (`size`); else null; the counts are kept in `measurement` |
| `furniture` | the header parts k / src / ft / lg and repeated objects, with the margins they sit on |

No text is kept (word counts and metrics only): the copy stays in the HTML.

`needs[]` = `{key, role, optional, why, element}` from `data-need`; a record without needs is a composition only.

## The library (V3)

`packages/templates/authored/<kind>/<name>.html` (cover 5, section 3, cta 2, quote 2; options `mirrored` / `dark`),
measured into `packages/templates/data/authored.json` by `npm run templates:authored -- packages/templates/authored
packages/templates/data/authored.json` (the folder is read with its sub-folders as one deck; byte-identical on a second
run). `authoredTemplates()` reads it without the catalogue file; `candidates()` / `pickTemplate()` (`src/match.js`)
match it (proposal PR-6, docs/P3-proposals.md). A `data-need` that reaches no element of the record (its element hidden
behind another) is an error: draw the need's element above, or on the element that shows.

## Pipeline fixtures

`packages/templates/__fixtures__/authored/` holds five small fixtures (a cover with a device band, a photo area and a
quiet text field; a cover with a cut-out; a section break on a colour field; a CTA; a statement with a dark option) and
their measured `records.json`. They prove the pipeline; they are not the library.
