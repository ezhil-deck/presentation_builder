# P1 — Brand → Mood: the rules

Status: spec for implementation (2026-10-30). Every rule below becomes a function with a unit test and a negative test.
Rule ids are `BR-*` (packages/brand, input → BrandSpec) and `MD-*` (packages/mood, BrandSpec → Mood). A rule may only
read the brand; where it derives, it names the signal in `provenance`. Where the brand is silent and the rule needs the
value, it emits a **question**, never a default.

Survey of the 10 golden inputs (what the rules can count on): all have `surfaces[]` (2–6, with per-surface roles),
`colors.{primary,secondary,accent,neutrals,chart,chartMuted,chartSequential}`, `typography.fonts.{heading,body}` with
font files on disk (`source:file` → `files[].url`; `source:google` → prefetched `assets/fonts/google/<Family>-normal-*.woff2`),
`typography.styles` (16–28 named roles, always display/h1/h2/h3/body/bodySmall/caption/eyebrow/stat/quote/button),
`layout.{margins,grid,radiusScale,footer}`, `backgrounds.{default,variants,rhythm}`, `cards.style`, `assets.elements` (0–10),
`motion`, `brand.logos` (full + mono variants), `layouts[]` hints. Versions 1.0–1.5 of the input spec.

## A. packages/brand

**BR-READ** `readBrand(dir)`: `<dir>/<basename>.json`; `id` must equal the folder name; validate with ajv against
`schemas/input/brand-presentation-spec.schema.json` (collect every error as `{pointer, message}`; invalid → throw with the list).
Compute `input.sha256`. Apply `<dir>/answers.json` (`{ "<json-pointer>": value }`) onto the input first; such values get
provenance `answered`.

**BR-NORMALIZE** input → BrandSpec (schemas/brand-spec.schema.json), field map:
| BrandSpec | input | note |
|---|---|---|
| id, name, tagline | id, brand.name, brand.tagline | |
| logos.variants[k].file | brand.logos[k] | file must exist (BR-ASSET); read width/height (SVG viewBox / PNG header) |
| logos.{onSurface,height,minHeight,clearSpace,position,perLayout,forbidOnSurfaces,noFilter} | brand.logoRules.* | |
| colors.* | colors.* ; `named` ← colors.custom ; `gradients` ← gradients | |
| surfaces[] | surfaces[] | keep every given key; `tone` ← given or **BR-TONE** |
| backgrounds.{default,variants} ; backgrounds.rhythm | backgrounds.{default,variants} ; backgrounds.rhythm.sequence | |
| typography.faces[k] | typography.fonts[k] | files by **BR-FONTFILES**; `variable` = weight string contains a space or a range file; `metrics` by **BR-METRICS** |
| typography.roles[k] | typography.styles[k] | `face` ← style.font ; size, weight, lineHeight, letterSpacing, case as given |
| typography.{alignment,bullets,limits} | same | |
| layout.* | layout.* | `canvas` must be 1920×1080 (input width/height) else error |
| components.cards | cards | whole block |
| components.{chip,callout,...} ; components.icons | components.* ; icons | |
| charts, tables, imagery (+ imagery.masks ← masks) | same | |
| decor.elements[] / illustrationStyle / maxElementsPerSlide | assets.elements / assets.illustrationStyle / assets.maxElementsPerSlide | files must exist |
| composition, brandLayouts ← layouts, voice, motion, rules, accessibility, locale, export | same | |
Every copied leaf gets `provenance["<pointer>"] = {source:"given", from:"<input pointer>", inputProvenance?}` (the input's own
`provenance` block, when the parent object has one). Unknown input keys are ignored but listed once in `warnings`.

**BR-TONE** surface.tone when not given: relative luminance (WCAG) of `bg`; `dark` when contrast(bg, #FFFFFF) ≥ contrast(bg, #000000),
else `light`. provenance `derived`, signal `surfaces/<i>/bg`.

**BR-FONTFILES** face files: `source:file` → each `files[].url` (or `url`) relative to the brand folder; `source:google` →
`assets/fonts/google/<Family>-normal-<min>-<max>-latin.woff2` and `-italic-` when present (Family with spaces removed);
`source:system` → no files. A face with no file on disk → **question** `typography.faces.<k>.files` (blocking; the fitter
cannot measure without a file).

**BR-METRICS** from the first normal-style file, with `fontkit`: unitsPerEm, ascent, descent, lineGap, capHeight, xHeight
(all per 1 em, i.e. divided by unitsPerEm), `widths` = advance per 1 em for U+0020..U+00FF at the face's default instance
(variable fonts: the default/400 instance; if `weights` lists a weight, use the instance closest to the first listed weight),
`avgCharWidth` = mean advance over a–z. Cache by file sha256 under `.cache/fontmetrics/`.

**BR-ASSET** every referenced file (logos, font files, decor, imagery samples, background images, icons) must exist under
the brand folder; missing → error `{pointer, file}`; read mime, width, height for images.

**BR-QUESTIONS** the rules' needs; missing → question (blocking unless noted):
`colors.primary`; at least one surface with `bg`+`text`; faces `heading` and `body` with files; roles `display|h1|h2|h3|body|caption`;
`layout.margins`; `logos.variants.full`; `layout.footer` (optional: footer rule then hides the footer and warns);
`backgrounds.default` (optional: palette uses surfaces[0] and warns). Questions carry `neededBy` rule ids and `options` when
the answer is a choice (e.g. which surface is the default).

## B. packages/mood — one module per group, `rule(brandSpec) → { patch, provenance, warnings, questions }`

**MD-PALETTE**
- `surfaces[]` ← brand surfaces, every role copied; `tone` as given/BR-TONE; `contrast` = WCAG ratios of text/heading/accent vs bg
  (warn when text < accessibility.minContrastBody or 4.5).
- `role`: `default` = the surface named by `backgrounds.default.surface` (else surfaces[0] + warning); a surface whose `bg`
  equals `colors.primary`, `accent` or `secondary` → `accent`; remaining surfaces of the opposite tone to the default → `dark`
  (when their tone is dark) else `alt`; same tone as default → `alt`. Signals named.
- `background` on a surface: for every `backgrounds.variants[v]` of type image/gradient/pattern, attach the spec to the surface it
  names (`variant.surface`) under `background` keyed by variant id — a surface may carry several (`background: {heroRibbon: {...}}`).
- `rhythm` ← backgrounds.rhythm entries mapped to surface ids (a variant id maps to its `surface`; an unknown id → warning, dropped).
- `perKind` ← brandLayouts via the **kind map** (below): `{cover: <surface of layout 'title'>, ...}`; only kinds the brand names.
- `semantic` ← colors.semantic; `chart.categorical` ← colors.chart, `sequential` ← colors.chartSequential, `muted` ← colors.chartMuted,
  `highlight` ← charts.highlightMode.color if given else colors.accent (signal named); surface `chart` ← surfaces[i].chart when given.
- `gradients` ← colors.gradients.definitions when policy ≠ never.

**MD-TYPE**
- `faces` ← brand faces (family, files, fallback, variable, metrics).
- `roles`: for each Mood role, the first brand role in its chain that exists; provenance names it. Chains:
  display←[display]; h1←[h1]; h2←[h2]; h3←[h3, cardTitle]; body←[body]; bodySmall←[bodySmall]; caption←[caption, footnote, meta];
  eyebrow←[eyebrow, label]; stat←[stat, factValue]; statLabel←[statLabel, caption]; quote←[quote]; quoteAttribution←[personRole, caption];
  bullet←[body]; tableHeader←[tableHead, tableHeader, label, caption]; tableCell←[tableCell, bodySmall]; chartLabel←[chartLabel, caption];
  footer←[layout.footer.style → that role, caption]; button←[button]. A chain with no hit → question (blocking for display/h1/h2/h3/body/caption, optional otherwise).
- `color` (meaning, not look): display/h1/h2/h3 → `heading`; body/bodySmall/bullet/quote/stat/tableCell/button → `text`;
  caption/eyebrow/statLabel/quoteAttribution/chartLabel/footer/tableHeader → `textMuted`.
- `fit.min`: body-like roles → `typography.limits.minBodySize` (question if absent, optional → then min = size); headings →
  the size of the next smaller heading (display→h1→h2→h3→body); `fit.step` = 2.
- `align` ← typography.alignment; `bullets` ← typography.bullets; `limits` ← typography.limits.

**MD-GEOMETRY** canvas 1920×1080; margins, safeArea, grid, titleZone ← layout.*; `spacing` ← layout.spacing sorted ascending mapped
to xs,sm,md,lg,xl (5 or more entries: indices 0,1,2,3,last; fewer: assign from `sm` upward and warn); `density` ← composition.density.

**MD-SHAPE** `radius` ← layout.radiusScale (keys none/xs/sm/md/lg/xl/full/pill → none, sm←xs|sm, md, lg, pill←full|pill);
`language`: max named radius ≤ 2 → `sharp`, ≤ 16 → `soft`, else `round` (signal: the scale); `borderWidth` ← cards.style.border.width;
`shadow` ← layout.shadowScale parsed to {x,y,blur,spread,color}; `divider` ← components.divider.

**MD-COMPONENTS** card: `variant` ← cards.style.kind (filled|flat|outlined|elevated|glass), tokens ← fill, radius, shadow, padding, border,
titleRole ← titleStyle, bodyRole ← bodyStyle, fillOpacity, backdropBlur (all as given, colour names kept as role refs when they
are role names, literal hex kept literal). chip/callout/quote/button/buttonSecondary/steps/timeline/avatar/logoWall/arrow/ctaChevron:
`variant` ← the block's `style|kind|variant` key else `default`; tokens ← the rest of the block. kpi ← charts.kpi. icon ← components.icons.
Only blocks the brand gives exist in the Mood.

**MD-CHARTS-TABLES** copy charts.* and tables.* with role refs (palette ← 'categorical' unless charts.palette names sequential/mono).

**MD-LOGO** variants ← logos.variants (+width/height); `perSurface` ← logos.onSurface merged with surfaces[i].logo; `perKind` ←
logos.perLayout via kind map; `height.small` ← logos.height; `height.large` ← question (optional; absent → layouts use small);
clearSpace, position as given.

**MD-FOOTER** ← layout.footer: show; items in order [logo?, text?, pageNumber?, date?] by the booleans; pageNumberFormat, text,
position, role ← style; `hideOn` ← hideOn via kind map; `band` only when footer.split/band given. Missing footer block → show:false + warning.

**MD-DECOR** elements ← decor.elements (file, layer, box, opacity, placement, allowedOn via kind map, surfaces, frequency, colorable);
maxPerSlide ← decor.maxElementsPerSlide; imagery ← imagery.treatments/masks/textOverImage/crop.

**MD-COMPOSITION** copy composition; `opening/closing` ← openingSequence/closingSequence via kind map; `layoutHints[kind]` ←
brandLayouts entries {surface, background, logo, titleRole ← titleStyle, footer}.

**MD-MOTION** family: transition `none` → calm; `wipe|slide|push` or duration < 200 → crisp; `fade|dissolve` with duration ≥ 250 → soft;
otherwise neutral (signal: motion.transition + duration). Copy transition, build, duration, easing, stagger. No motion block → absent.

**MD-VOICE** titleCase ← voice.titleCase, language ← voice.language, rtl ← locale.rtl.

**Kind map** (brand layout ids / hideOn names → layout kinds): title|cover → cover; closing|cta|thankyou|thanks → cta; section|divider|sectionBands → section;
agenda|contents → agenda; content|bullets|list → bullets; twoColumn|two-column|split → two-column; chart|data → chart; table → table;
kpi|stats|numbers → kpi; image|photo|imageBleed|bleedPhoto|hero → image; quote|testimonial → quote; team|people → team; logos|logoWall|partners → logos;
cards|features → cards; steps|process → steps; timeline|roadmap → timeline; comparison|versus → comparison; diagram → diagram; text|statement → text.
Unknown ids are kept verbatim and warned once.

**Assembly** `deriveMood(brandSpec)`: run modules in the order above, merge patches, concatenate provenance/warnings/questions;
`id` = brandSpec.id, `brandHash` = sha256 of the BrandSpec JSON (canonical, sorted keys), `engineVersion` from package.json;
validate against schemas/mood.schema.json; deterministic (sorted keys on write).

## C. CLI + golden
`pb mood <brand-dir> [--out out/<id>] [--snapshot] [--html]` → `brand-spec.json`, `mood.json`, `questions.json` (empty array when
none), `report.json` (warnings). `--snapshot` copies mood.json + brand-spec.json (minus metrics.widths) to `golden/expected/<id>/`.
Jest golden test: for every `golden/brands/*` present, derive and deep-compare with `golden/expected/<id>/mood.json` (skipped when
the input folder is absent, so CI without inputs still passes). `--html` writes `mood.html`: surfaces as swatches with contrast,
the type ladder set in the brand's own fonts (@font-face from the files), component tokens, logos, footer, decor thumbnails, questions.

## D. Reconciliation after the first implementation (owner-side decisions, 2026-10-30)

Both packages were built against §A/§B; the real inputs and the two agents' reports showed where the spec was wrong. These
decisions amend §A/§B and are the source of truth from now on.

**D1 Input validation (BR-READ).** The input schema in `schemas/input/` is a reference copy (1.4) and real inputs run 1.0–1.5.
Rule: validate, but an `additionalProperties` violation is a **warning** (the key is ignored and listed once); `type`,
`enum`, `required`, `pattern` violations remain **errors**. Unknown keys never block a brand; wrong values do.

**D2 BrandSpec enums mirror the input schema's enums; the brand package never coerces.** Amend `schemas/brand-spec.schema.json`:
`layout.shadowScale` values object `{x,y,blur,spread,color,opacity}` **or** string; `components.icons.style` enum = input's
(line|filled|duotone|solid|outline|custom); `rules[].severity` error|warn|warning; `colors.gradients.policy` = input enum
(none|text-only|accents-only|backgrounds|everywhere); `typography.bullets.nested` string or array; `decor.elements[].file`
optional (drawn elements carry `type` + their draw keys, copied verbatim), `type` and `placement` enums = input's (placement
also `under-title|full-bleed`); role `case` adds `sentence`; `composition.density` = input enum (sparse|balanced|dense; Mood
`geometry.density` and `composition.density` use the same enum); `motion.duration` number; background `type` = input enum
(solid|linear-gradient|radial-gradient|mesh-gradient|image|pattern|video); background `overlay`, gradient stop colours and any
`colorRef` field accept hex **or** a role name (define `$defs.colorOrRef`); `logos.position` adds under-title|full-bleed.
`typography.scriptFallbacks` lives at typography level (not per face).

**D3 Role sizes are canvas px (BR-NORMALIZE).** Input `typography.sizeUnits`: `slide` → sizes as given; `site` → every
size × `slideScale`; unset (legacy) → sizes ≤ 40 × `slideScale`, larger as given. Provenance `derived`, signal
`typography.sizeUnits`+`slideScale`. BrandSpec keeps `typography.sizeUnits` and `slideScale` for the record. Same for
`typography.limits.minBodySize`, `bullets.indent/gap`, `cards.style.padding` and component paddings? **No** — only
`styles[].size` and `limits.minBodySize` (the reading rules scale text and button padding; keep padding as given and warn once).

**D4 Role colour.** `typography.styles[].color` (a surface role name) IS copied to `roles[].color`; MD-TYPE uses it when
given and the meaning table only when absent (provenance names which).

**D5 Questions and answers share INPUT pointers.** `answers.json` keys are JSON pointers into the input (applied before
validation; provenance `answered`). Every question (brand or mood) carries `pointer` = the input pointer where an answer goes;
mood questions name input pointers too (`/brand/logoRules/heightLarge`, `/typography/limits/minBodySize`, ...). The BrandSpec
`provenance.answered.from` = that pointer (schema description corrected).

**D6 Missing files.** Font file missing → blocking question (the fitter cannot run). Any other referenced file missing
(logo, decor, imagery sample, background image, icon) → error. Documented, not a conflict.

**D7 Required-but-missing.** `readBrand` throws `BrandInputError` with `questions` attached when the BrandSpec cannot be
formed; `pb` catches it, writes `out/<id>/questions.json` + `report.json` and exits 2 (not 1) so "needs answers" is
distinguishable from "broken input".

**D8 Surface roles (MD-PALETTE).** Order of tests: `default` (backgrounds.default.surface) → `accent` when bg equals
`colors.primary` **or** `colors.accent` (secondary no longer counts) → opposite tone to default: `dark` if dark else `alt` →
same tone: `alt`. Stripe navy (= secondary, dark) is therefore `dark`; rukko red (= primary) is `accent`.

**D9 Spacing (MD-GEOMETRY).** n ≥ 5 sorted values: xs,sm,md,lg,xl = indices round((n−1)·{0, .25, .5, .75, 1}); fewer than
5: assign from `sm` upward and warn. Stripe (4,8,12,16,24,32,48,64) → 4,12,24,32,64.

**D10 Kind map.** Add `stat → kpi`, `imageText → image-text`; add `image-text` to `schemas/layout.schema.json` kinds.

**D11 Mood questions** are returned beside the Mood (`deriveMoodResult`); `pb mood` writes them to `questions.json` with the
brand's. Mood schema stays without questions.

**D12 Accepted agent choices** (now spec): type chains and fit.min as implemented (body-like = every non-heading role; a role
smaller than minBodySize keeps its own size as min, warned once); radius step naming preference; shape language from
none/xs/sm/md/lg/xl only; divider/shadow parsing; component token flattening (dotted keys) — but cap logoWall: `logos.N.*`
entries are NOT tokens, copy `logoWall.logos` as a Mood `components.logoWall.items` array (amend mood schema: `component.items`
array of objects allowed); charts/tables verbatim; footer `text` item only when non-empty, `split` copied; motion family
rule; empty rhythm `[]` + warning; perKind first-wins + warning.

**D13 Engine stub + CLI.** `packages/engine` accepts `schema: 'mood/1'` (drop the `kind` check). `pb mood <dir> [--out]
[--snapshot] [--html]` per §C; `pb build` keeps running the stubs after it. Golden snapshots in `golden/expected/<id>/`
(mood.json + brand-spec.json without `metrics.widths`); jest golden test per §C.

## E. Fixes after the owner's Mood review (approved 2026-10-30, "Apply both fixes")

**E1 BR-TONE v2.** When a surface gives `text`, its tone is `dark` when relativeLuminance(text) > relativeLuminance(bg),
else `light` (provenance `derived`, signal `surfaces/<i>/text` + `bg`). Only a surface without `text` falls back to the v1
contrast comparison (contrast(bg,#FFF) ≥ contrast(bg,#000) → dark). A given `tone` still wins. Reason: bosch blue #007BC0
carries white text but v1 derived `light` (black beat white by 0.04).

**E2 MD-DECOR dead elements.** An element whose `allowedOn` is absent or empty (after the kind map) can never be placed:
keep it in `decor.elements` with `allowedOn: []` and `unused: true`, and warn `decor element "<id>" has no allowed layouts
(allowedOn missing or empty)`. The viewer lists such elements under "unused". Mood schema: add `unused` boolean to elements.

**E3 MD-DECOR keeps every brand-given element key.** Beyond the normalised keys, every other key the brand gives on an
element (`animated`, `anchor`, `tile`, `scale`, `video`, `align`, `blend`, `length`, `thickness`, `color`, …) is carried
verbatim into the Mood element (schema: element `additionalProperties: true`). `animated` / `video` are files: BR-ASSET checks
them like `file`. Meaning for later stages: the still `file` is what PDF/PPTX get; `animated` is what the HTML renderer /
present mode show. (akgmedia: webglFlower/Cross/Spiral/Knot carry `animated: *.webp` + `anchor: fixed`, silently dropped;
`anchor` also on hdfc-2, notion, rukko.)

**E4 MD-DECOR: wanted but unplaced → question, not "unused".** An element with `frequency` `always` or `often` and no
`allowedOn` raises an **optional question** at `/assets/elements/<i>/allowedOn` ("Which layouts may <id> appear on?",
options = the layout kinds) and is kept with `unused: true` until answered. E2's silent "unused + warning" applies only to
elements with frequency `sometimes`/`rare`/absent. (Hits: akgmedia webglCross/Spiral/Knot `often`; bosch supergraphicStrip
and hdfc-2 headerBand/footerRule/coverTint/titleSlash `always`.)

**E5 BR-ICONS: an icon directory is an icon set.** When `icons.customPath` names a directory, BrandSpec
`components.icons.files` lists every image file in it; `<name>-white.<ext>` (or `-light` / `-dark`) is recorded as a variant
of `<name>.<ext>` (`variants: {white: file}`), not a separate icon. MD-COMPONENTS carries them as `components.icon.items`
[{name, file, variants}]. (akgmedia and stripe reference `assets/icons/` as a directory; akgmedia has 38 icon files, 19 white variants.)

**E6 BR-ASSET inventory.** After normalisation, every file under `assets/` that no BrandSpec pointer or icon directory
references (font files excluded) is listed in `BrandSpec.unreferencedAssets[]` and summarised in one warning ("N asset files
are not referenced by the brand JSON: …first 5…"). Never used for design (no guesswork) — surfaced so the brand author sees
what the JSON leaves out; the viewer lists them. (stripe 31, notion 14, rukko 4 — e.g. rukko `elements/title-bar.svg` and
`halftone-red.svg` exist on disk while the JSON draws `titleBar` as a rule.)
