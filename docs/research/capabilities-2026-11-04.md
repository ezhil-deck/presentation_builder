# Brand capabilities and claim checks on the 10 golden brands (V2, 2026-11-04)

The owner's question (2026-11-04): "what if the input is wrong? are we measuring that?" Until V2, READ validated the schema and
that every named file exists; a value the JSON claims about one of its own files was never compared with the file, and
provenance (`inferred`, `verifiedAt`) was carried and unused. V2 adds two READ rules (docs/P1-rules.md §A): **BR-CLAIMS**
(every such claim measured against its file, a failing claim = an optional question on its pointer) and **BR-CAPABILITIES**
(what the brand can supply, in the vocabulary, from the JSON and its files alone). No AI, no defaults: what the JSON does not
give is absent; what cannot be measured is recorded as skipped with its reason.

Numbers below are from `readBrand(golden/brands/<id>)` on 2026-11-04 (code: `packages/brand/src/{claims,capabilities,svggeom,
pixels,measure}.js`). These are the owner's brands; their names appear in this report only, never in code.

## What was found (the short list)

- **hdfc-2 cover photoArea — fails.** `layouts[0].composition.photoArea` = (0,0) (1061,0) (741,1080) (0,1080) against
  `assets/elements/cover-bands.svg` (device `coverBands`, box 0,0,1920,1080, viewBox y 277.6-1357.6, preserveAspectRatio none).
  Every vertex is outside the painted shapes (deepest 0 px). The slanted edge (1061,0)→(741,1080) runs exactly on the red
  band's right edge for 93.5 % of its length (mean distance 2.9 px), but the band path ends at viewBox y 1287.7 = **canvas
  y 1010**; the last 70 px of the edge extrapolate the band's line past its end, up to **69.9 px = 3.64 % W** from any
  painted edge (tolerance 2 %; 96.9 % of the sampled edge within). The cover image agrees with the SVG, not with the
  photoArea: in `assets/backgrounds/cover-art.jpg` the red band also stops at y ≈ 1010 and below it the blue field starts at
  x 656 (y 1015), 646 (y 1050), 638 (y 1075), while the photoArea claims photo up to x 747 / 741 there. So the polygon's
  bottom vertex is wrong by roughly 70-100 px, or the band should run to the slide's foot; the JSON should say which.
- **hdfc-2 cover logo box — passes.** `composition.logo` = monoLight at (1233, 78, 608 × 118) on `cover-art.jpg`: the pixels
  unlike the ground colour (#0A4C8A, median of the ring around box + 2 % W) form a box at (1233, 78, 609 × 119): fills
  100 % of the claimed box, does not run past box + 2 % W; `monoLight` exists in logos.
- **hdfc-2 mono logos — fail.** `monoLight` = `hdfcsec-logo-reverse.png`: mean WCAG luminance of its opaque pixels 0.427
  (light needs ≥ 0.6): it is the colour lockup (blue panel, red mark, blue "20"), not a light mono mark. `monoDark` =
  `hdfcsec-logo-bw.png`: 0.669 (dark needs ≤ 0.4): a greyscale lockup on an opaque white ground.
- **`reverse` makes no tone claim** (architect's decision, 2026-11-04, not the owner's: `reverse` is the mark for a coloured ground and may be black, as
  rukko's `logo-black.svg` "for red grounds", luminance 0.003). Its luminance is recorded on `logo:reverse` as a measurement.
- **Imagery sample sizes — 85 fail on 5 brands** (cisco 18, headspace 19, notion 1, shopify 42, the-ken 5): the `w`/`h` the
  JSON gives are mostly CSS display sizes of website images, not the files' pixel sizes. Each claim records `scaleW` /
  `scaleH` = file px / claimed px: 47 of the 85 are exactly 2× (a retina export), 78 keep the claimed aspect (uniform
  scale), 7 have an aspect that differs (the claim and the file disagree in shape). They stay failing claims.
  hdfc-2's 7 samples match their files exactly.
- **Decor**: headspace — three illustrations paint #141313 (nearest brand colour #2D2C2B, distance 42.7) and dc-07 also
  #FF7300 (nearest #FF7E1D, 31); `shape-w3-dw10` box aspect 24.6 vs its viewBox 27.8 (11.5 % off). rukko `halftoneBlack` box
  1.30 vs viewBox 1.23 (5.6 % off). stripe `dotGrid` paints #30437F (nearest brand colour #2B3A6B, 22.5).
- **Skipped (not measured)**: 11 claims — 8 image backgrounds that give an `overlay` (the surface colour then comes from the
  overlay: bosch 1, cisco 2, hdfc-2 1, rukko 1, stripe 1, the-ken 2), 2 WebP backgrounds (shopify; only PNG / JPEG are
  decoded), 1 SVG holding only an embedded image (headspace `illustration-family`: no plain colour to check).
- **Unverified fields: 0 on every brand.** 116 fields carry `inferred: true` (cisco 39, headspace 20, shopify 32, the-ken 25)
  and every one has a `verifiedAt`, so every capability is `given`; none is `offered`.

## Capabilities per family
| brand | devices | photo-areas | imagery | colour-fields | type | logos | components | shape | composition | total | offered |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| akgmedia | 10 | 0 | 3 | 5 | 3 | 5 | 10 | 0 | 2 | 38 | 0 |
| bosch | 2 | 0 | 4 | 5 | 2 | 4 | 10 | 0 | 2 | 29 | 0 |
| cisco | 0 | 0 | 7 | 4 | 2 | 3 | 7 | 0 | 2 | 25 | 0 |
| hdfc-2 | 8 | 3 | 5 | 3 | 3 | 6 | 12 | 1 | 2 | 43 | 0 |
| headspace | 5 | 0 | 11 | 5 | 2 | 2 | 6 | 1 | 2 | 34 | 0 |
| notion | 2 | 0 | 4 | 3 | 3 | 6 | 12 | 0 | 2 | 32 | 0 |
| rukko | 5 | 0 | 4 | 2 | 3 | 5 | 16 | 1 | 2 | 38 | 0 |
| shopify | 1 | 0 | 14 | 6 | 2 | 3 | 7 | 0 | 2 | 35 | 0 |
| stripe | 2 | 0 | 6 | 3 | 2 | 3 | 12 | 0 | 2 | 30 | 0 |
| the-ken | 1 | 0 | 6 | 5 | 3 | 2 | 4 | 1 | 2 | 24 | 0 |

### Keys per brand (term in brackets; rule = term null: not an element)
- **akgmedia**: devices: `device:headingRule` (E2:device), `device:ringsTitle` (E2:device), `device:sparklesTitle` (E2:sticker), `device:swirlSection` (E2:device), `device:globeClosing` (E2:device), `device:sparkleQuote` (E2:sticker), `device:webglFlower` (E2:device), `device:webglCross` (E2:illustration), `device:webglSpiral` (E2:illustration), `device:webglKnot` (E2:illustration); imagery: `image:illustration` (E2:illustration), `cutout` (E2:cutout), `mask:rect` (E4:rect); colour-fields: `colour-field:white` (E2:background), `colour-field:black` (E2:background), `colour-field:snow` (E2:background), `colour-field:ultramarine` (E2:background), `colour-field:pink` (E2:background); type: `type-ladder` (rule), `second-face` (E4:face-run), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:wordmark` (E2:brand-logo), `logo:monoDark` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:reverse` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:callout` (E2:callout), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:button` (E2:button), `component:people` (E3:people), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **bosch**: devices: `device:supergraphicStrip` (E4:pattern), `device:supergraphic` (E2:illustration); imagery: `image:photo-people` (E2:picture), `image:photo-product` (E2:picture), `mask:none` (E4:rect), `mask:square` (E4:rect); colour-fields: `colour-field:page` (E2:background), `colour-field:light` (E2:background), `colour-field:dark` (E2:background), `colour-field:blue` (E2:background), `colour-field:hero` (E2:background); type: `type-ladder` (rule), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:icon` (E2:brand-logo), `logo:monoDark` (E2:brand-logo), `logo:monoLight` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:tabs` (E2:tabs), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **cisco**: imagery: `image:photo-people` (E2:picture), `image:product-ui` (E2:picture), `image:illustration` (E2:illustration), `image:abstract` (E2:background-art), `mask:none` (E4:rect), `mask:square` (E4:rect), `mask:rounded` (E4:rect); colour-fields: `colour-field:black` (E2:background), `colour-field:navy` (E2:background), `colour-field:paper` (E2:background), `colour-field:hero` (E2:background); type: `type-ladder` (rule), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:monoDark` (E2:brand-logo); components: `component:card` (E2:card), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:tabs` (E2:tabs), `component:stack` (E3:stack), `component:logos` (E3:logos), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **hdfc-2**: devices: `device:headerStrip` (E2:device), `device:headerBand` (E2:decor), `device:leadRule` (E2:device), `device:coverRule` (E2:device), `device:footerRule` (E2:decor), `device:coverBands` (E2:device), `device:coverTint` (E2:decor), `device:titleSlash` (E2:sticker); photo-areas: `photo-area` (E3:zone), `overlay:coverTint` (E4:blend), `text-zone` (E3:zone); imagery: `image:photo-people` (E2:picture), `image:photo-product` (E2:picture), `image:illustration` (E2:illustration), `mask:rect` (E4:rect), `mask:slant` (E4:polygon); colour-fields: `colour-field:white` (E2:background), `colour-field:blue` (E2:background), `colour-field:deep` (E2:background); type: `type-ladder` (rule), `second-face` (E4:face-run), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:wordmark` (E2:brand-logo), `logo:icon` (E2:brand-logo), `logo:monoDark` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:reverse` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:callout` (E2:callout), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:button` (E2:button), `component:pager` (E2:pager), `component:badge` (E2:badge), `component:people` (E3:people), `component:icon` (E2:icon); shape: `angle` (rule); composition: `composition` (rule), `motion` (rule)
- **headspace**: devices: `device:illustration-family` (E2:illustration), `device:illustration-family-1` (E2:illustration), `device:illustration-family-2` (E2:illustration), `device:illustration-family-3` (E2:illustration), `device:shape-w3-dw10` (E2:decor); imagery: `image:photo-people` (E2:picture), `image:photo-product` (E2:picture), `image:product-ui` (E2:picture), `image:illustration` (E2:illustration), `image:abstract` (E2:background-art), `mask:none` (E4:rect), `mask:rounded` (E4:rect), `mask:rounded-2` (E4:rect), `mask:square` (E4:rect), `mask:rounded-3` (E4:rect), `mask:blob` (E4:svg); colour-fields: `colour-field:yellow` (E2:background), `colour-field:cream` (E2:background), `colour-field:white` (E2:background), `colour-field:blue` (E2:background), `colour-field:dark` (E2:background); type: `type-ladder` (rule), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:monoLight` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:logos` (E3:logos), `component:icon` (E2:icon); shape: `angle` (rule); composition: `composition` (rule), `motion` (rule)
- **notion**: devices: `device:peekTop` (E2:illustration), `device:peekSide` (E2:illustration); imagery: `image:product-ui` (E2:picture), `mask:none` (E4:rect), `mask:rounded` (E4:rect), `mask:top` (E4:rect); colour-fields: `colour-field:page` (E2:background), `colour-field:warm` (E2:background), `colour-field:dark` (E2:background); type: `type-ladder` (rule), `second-face` (E4:face-run), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:icon` (E2:brand-logo), `logo:monoDark` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:wordmark` (E2:brand-logo), `logo:reverse` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:callout` (E2:callout), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:connector` (E2:connector), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:logos` (E3:logos), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **rukko**: devices: `device:titleBar` (E2:device), `device:cornerCut` (E2:device), `device:cutRed` (E2:device), `device:cutBlack` (E2:device), `device:halftoneBlack` (E2:device); imagery: `image:abstract` (E2:background-art), `mask:none` (E4:rect), `mask:square` (E4:rect), `mask:slanted` (E4:polygon); colour-fields: `colour-field:black` (E2:background), `colour-field:red` (E2:background); type: `type-ladder` (rule), `second-face` (E4:face-run), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:icon` (E2:brand-logo), `logo:reverse` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:monoDark` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:callout` (E2:callout), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:connector` (E2:connector), `component:button` (E2:button), `component:badge` (E2:badge), `component:tabs` (E2:tabs), `component:stack` (E3:stack), `component:pager` (E2:pager), `component:avatar` (E2:avatar), `component:people` (E3:people), `component:icon` (E2:icon); shape: `angle` (rule); composition: `composition` (rule), `motion` (rule)
- **shopify**: devices: `device:shape-w3-dw3` (E2:decor); imagery: `image:photo-people` (E2:picture), `image:photo-product` (E2:picture), `image:product-ui` (E2:picture), `image:illustration` (E2:illustration), `image:abstract` (E2:background-art), `mask:none` (E4:rect), `mask:square` (E4:rect), `mask:top-rounded` (E4:rect), `mask:rounded` (E4:rect), `mask:rounded-2` (E4:rect), `mask:top-rounded-2` (E4:rect), `mask:rounded-3` (E4:rect), `mask:one-side` (E4:rect), `mask:rounded-4` (E4:rect); colour-fields: `colour-field:black` (E2:background), `colour-field:ink` (E2:background), `colour-field:paper` (E2:background), `colour-field:dark` (E2:background), `colour-field:dark2` (E2:background), `colour-field:hero` (E2:background); type: `type-ladder` (rule), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:monoLight` (E2:brand-logo), `logo:icon` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:tabs` (E2:tabs), `component:logos` (E3:logos), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **stripe**: devices: `device:rays` (E4:texture), `device:dotGrid` (E4:pattern); imagery: `image:photo-people` (E2:picture), `image:photo-product` (E2:picture), `image:product-ui` (E2:picture), `mask:card` (E4:rect), `mask:portrait` (E4:rect), `mask:none` (E4:rect); colour-fields: `colour-field:page` (E2:background), `colour-field:light` (E2:background), `colour-field:navy` (E2:background); type: `type-ladder` (rule), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:monoDark` (E2:brand-logo), `logo:monoLight` (E2:brand-logo); components: `component:card` (E2:card), `component:chip` (E2:chip), `component:callout` (E2:callout), `component:quotes` (E3:quotes), `component:divider` (E2:divider), `component:process` (E3:process), `component:timeline` (E3:timeline), `component:connector` (E2:connector), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:logos` (E3:logos), `component:icon` (E2:icon); composition: `composition` (rule), `motion` (rule)
- **the-ken**: devices: `device:inv-dc-01` (E2:decor); imagery: `image:photo-product` (E2:picture), `image:product-ui` (E2:picture), `image:illustration` (E2:illustration), `mask:none` (E4:rect), `mask:square` (E4:rect), `mask:top-rounded` (E4:rect); colour-fields: `colour-field:mist` (E2:background), `colour-field:white` (E2:background), `colour-field:brand` (E2:background), `colour-field:dark` (E2:background), `colour-field:hero` (E2:background); type: `type-ladder` (rule), `second-face` (E4:face-run), `weight-contrast` (E4:weight-run); logos: `logo:full` (E2:brand-logo), `logo:monoLight` (E2:brand-logo); components: `component:card` (E2:card), `component:button` (E2:button), `component:avatar` (E2:avatar), `component:icon` (E2:icon); shape: `angle` (rule); composition: `composition` (rule), `motion` (rule)

Terms: every element key maps through `termFor` or a named term that exists, so no capability is `unknown` on these
brands (`unknown` is kept for the vocabulary's own gaps). `type-ladder`, `composition`, `motion` and `angle` are not elements
but brand rules: their `term` is null and their `why` starts "not an element: a brand rule". Rules worth reading the table
with: a decor element is `E2:device` when a composition names it or it has `frequency: always` with layouts in `allowedOn`
(the vocabulary's device rule), which is why most of rukko's and akgmedia's elements are devices; `angle` lists the straight
painted edges >= 1 % of the frame width (hdfc-2: one angle, 73.5 deg from horizontal = its 16.5 deg slant, in 5 elements;
rukko and the-ken: 45; headspace: 10 angles from the straight sides of three rounded-polygon illustrations, i.e. no single
angle).

## Claim results (every claim, claimed vs measured)
| brand | claims | pass | fail | skipped | questions added |
|---|---:|---:|---:|---:|---:|
| akgmedia | 17 | 17 | 0 | 0 | 0 |
| bosch | 21 | 20 | 0 | 1 | 0 |
| cisco | 41 | 21 | 18 | 2 | 18 |
| hdfc-2 | 25 | 21 | 3 | 1 | 3 |
| headspace | 53 | 29 | 23 | 1 | 23 |
| notion | 6 | 5 | 1 | 0 | 1 |
| rukko | 19 | 17 | 1 | 1 | 1 |
| shopify | 72 | 28 | 42 | 2 | 42 |
| stripe | 19 | 17 | 1 | 1 | 1 |
| the-ken | 35 | 28 | 5 | 2 | 5 |

### akgmedia
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:630,h:642,aspect:0.98} | {width:630,height:642,aspect:0.981,scaleW:1,scaleH:1} | assets/illustrations/3d-knot.png: the claimed size matches the file |
| `sample.1` | pass | {w:610,h:404,aspect:1.51} | {width:610,height:404,aspect:1.51,scaleW:1,scaleH:1} | assets/icons/line-globe.png: the claimed size matches the file |
| `sample.2` | pass | {w:228,h:226,aspect:1.01} | {width:228,height:226,aspect:1.009,scaleW:1,scaleH:1} | assets/icons/icon-sparkles.png: the claimed size matches the file |
| `sample.3` | pass | {w:212,h:212,aspect:1} | {width:212,height:212,aspect:1,scaleW:1,scaleH:1} | assets/icons/icon-starburst.png: the claimed size matches the file |
| `sample.4` | pass | {w:594,h:594,aspect:1} | {width:594,height:594,aspect:1,scaleW:1,scaleH:1} | assets/illustrations/3d-cage-sphere-p3.png: the claimed size matches the file |
| `sample.5` | pass | {w:672,h:555,aspect:1.21} | {width:672,height:555,aspect:1.211,scaleW:1,scaleH:1} | assets/illustrations/3d-rings-iridescent.png: the claimed size matches the file |
| `sample.6` | pass | {w:575,h:520,aspect:1.11} | {width:575,height:520,aspect:1.106,scaleW:1,scaleH:1} | assets/illustrations/3d-cross-pipe.png: the claimed size matches the file |
| `sample.7` | pass | {w:560,h:543,aspect:1.03} | {width:560,height:543,aspect:1.031,scaleW:1,scaleH:1} | assets/illustrations/3d-flower.png: the claimed size matches the file |
| `sample.8` | pass | {w:523,h:564,aspect:0.93} | {width:523,height:564,aspect:0.927,scaleW:1,scaleH:1} | assets/illustrations/3d-spring.png: the claimed size matches the file |
| `sample.9` | pass | {w:608,h:605,aspect:1} | {width:609,height:606,aspect:1.005,scaleW:1.002,scaleH:1.002} | assets/illustrations/3d-star-pillow.png: the claimed size matches the file |
| `sample.10` | pass | {w:568,h:574,aspect:0.99} | {width:568,height:574,aspect:0.99,scaleW:1,scaleH:1} | assets/illustrations/3d-cage-sphere.png: the claimed size matches the file |
| `sample.11` | pass | {w:582,h:580,aspect:1} | {width:582,height:580,aspect:1.003,scaleW:1,scaleH:1} | assets/illustrations/3d-swirl-sphere.png: the claimed size matches the file |
| `sample.12` | pass | {w:616,h:340,aspect:1.81} | {width:616,height:340,aspect:1.812,scaleW:1,scaleH:1} | assets/icons/line-eye.png: the claimed size matches the file |
| `sample.13` | pass | {w:679,h:366,aspect:1.86} | {width:679,height:366,aspect:1.855,scaleW:1,scaleH:1} | assets/icons/line-rings.png: the claimed size matches the file |
| `sample.14` | pass | {w:600,h:378,aspect:1.59} | {width:600,height:378,aspect:1.587,scaleW:1,scaleH:1} | assets/icons/line-golden-spiral.png: the claimed size matches the file |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0} | monoDark assets/logos/akg-wordmark-black.png: mean luminance of the opaque pixels 0 (dark needs <= 0.4) |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:1} | monoLight assets/logos/akg-wordmark-white.png: mean luminance of the opaque pixels 1 (light needs >= 0.6) |

### bosch
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/innovation-lab.webp: the claimed size matches the file |
| `sample.1` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/laser-lab.webp: the claimed size matches the file |
| `sample.2` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/health-team.webp: the claimed size matches the file |
| `sample.3` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/kitchen-family.webp: the claimed size matches the file |
| `sample.4` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/ebike.webp: the claimed size matches the file |
| `sample.5` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/adas-driver.webp: the claimed size matches the file |
| `sample.6` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/img/shopfloor.webp: the claimed size matches the file |
| `sample.7` | pass | {w:356,h:593,aspect:0.6} | {width:356,height:593,aspect:0.6,scaleW:1,scaleH:1} | assets/img/topic-ai.webp: the claimed size matches the file |
| `sample.8` | pass | {w:356,h:593,aspect:0.6} | {width:356,height:593,aspect:0.6,scaleW:1,scaleH:1} | assets/img/topic-mobility.webp: the claimed size matches the file |
| `sample.9` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/img/product-power-tools.webp: the claimed size matches the file |
| `sample.10` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/img/product-garden-tools.webp: the claimed size matches the file |
| `sample.11` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/dr-christian-fischer.webp: the claimed size matches the file |
| `sample.12` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/markus-forschner.webp: the claimed size matches the file |
| `sample.13` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/stefan-grosch.webp: the claimed size matches the file |
| `sample.14` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/dr-markus-heyn.webp: the claimed size matches the file |
| `sample.15` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/frank-meyer.webp: the claimed size matches the file |
| `sample.16` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/dr-tanja-rueckert.webp: the claimed size matches the file |
| `sample.17` | pass | {w:1280,h:720,aspect:1.78} | {width:1280,height:720,aspect:1.778,scaleW:1,scaleH:1} | assets/team/katja-von-raven.webp: the claimed size matches the file |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0,approx:true} | monoDark assets/logo-black.svg: mean luminance of the opaque pixels 0 (dark needs <= 0.4) |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:1,approx:true} | monoLight assets/logo-white.svg: mean luminance of the opaque pixels 1 (light needs >= 0.6) |
| `backgroundSurface.hero` | skipped | {surface:hero,bg:#000000} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |

### cisco
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:1600,h:900,aspect:1.78} | {width:1600,height:900,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-6.png: the claimed size matches the file |
| `sample.1` | pass | {w:1232,h:693,aspect:1.78} | {width:1232,height:693,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-10.webp: the claimed size matches the file |
| `sample.2` | pass | {w:1232,h:693,aspect:1.78} | {width:1232,height:693,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-11.webp: the claimed size matches the file |
| `sample.3` | pass | {w:1316,h:606,aspect:2.17} | {width:1316,height:606,aspect:2.172,scaleW:1,scaleH:1} | assets/img/photo-9.png: the claimed size matches the file |
| `sample.4` | pass | {w:1200,h:449,aspect:2.67} | {width:1200,height:449,aspect:2.673,scaleW:1,scaleH:1} | assets/img/photo-7.png: the claimed size matches the file |
| `sample.5` | pass | {w:800,h:450,aspect:1.78} | {width:800,height:450,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-3.webp: the claimed size matches the file |
| `sample.6` | pass | {w:800,h:450,aspect:1.78} | {width:800,height:450,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-4.webp: the claimed size matches the file |
| `sample.7` | pass | {w:800,h:450,aspect:1.78} | {width:800,height:450,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-8.webp: the claimed size matches the file |
| `sample.8` | pass | {w:800,h:450,aspect:1.78} | {width:800,height:450,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-12.png: the claimed size matches the file |
| `sample.9` | **fail** | {w:1440,h:984,aspect:1.463} | {width:1600,height:1087,aspect:1.472,scaleW:1.111,scaleH:1.105} | assets/backgrounds/bg-1-src.png: w 1440 vs 1600, h 984 vs 1087 |
| `sample.10` | **fail** | {w:1440,h:984,aspect:1.463} | {width:2880,height:1968,aspect:1.463,scaleW:2,scaleH:2} | assets/backgrounds/bg-1.png: w 1440 vs 2880, h 984 vs 1968 |
| `sample.11` | **fail** | {w:1200,h:655,aspect:1.832} | {width:1360,height:500,aspect:2.72,scaleW:1.133,scaleH:0.763} | assets/backgrounds/bg-2-src.svg: w 1200 vs 1360, h 655 vs 500, aspect 1.832 vs 2.72 |
| `sample.12` | **fail** | {w:1200,h:655,aspect:1.832} | {width:2400,height:1310,aspect:1.832,scaleW:2,scaleH:2} | assets/backgrounds/bg-2.png: w 1200 vs 2400, h 655 vs 1310 |
| `sample.13` | pass | {w:1600,h:1087,aspect:1.472} | {width:1600,height:1087,aspect:1.472,scaleW:1,scaleH:1} | assets/backgrounds/sec-1-src.png: the claimed size matches the file |
| `sample.14` | pass | {w:2880,h:1968,aspect:1.463} | {width:2880,height:1968,aspect:1.463,scaleW:1,scaleH:1} | assets/backgrounds/sec-1.png: the claimed size matches the file |
| `sample.15` | **fail** | {w:1440,h:1152,aspect:1.25} | {width:1600,height:1231,aspect:1.3,scaleW:1.111,scaleH:1.069} | assets/backgrounds/sec-2-src.png: w 1440 vs 1600, h 1152 vs 1231, aspect 1.25 vs 1.3 |
| `sample.16` | **fail** | {w:1440,h:1152,aspect:1.25} | {width:2880,height:2304,aspect:1.25,scaleW:2,scaleH:2} | assets/backgrounds/sec-2.png: w 1440 vs 2880, h 1152 vs 2304 |
| `sample.17` | **fail** | {w:1440,h:352,aspect:4.091} | {width:1600,height:432,aspect:3.704,scaleW:1.111,scaleH:1.227} | assets/backgrounds/sec-3-src.png: w 1440 vs 1600, h 352 vs 432, aspect 4.091 vs 3.704 |
| `sample.18` | **fail** | {w:1440,h:352,aspect:4.091} | {width:2880,height:704,aspect:4.091,scaleW:2,scaleH:2} | assets/backgrounds/sec-3.png: w 1440 vs 2880, h 352 vs 704 |
| `sample.19` | **fail** | {w:996,h:60,aspect:16.6} | {width:1992,height:120,aspect:16.6,scaleW:2,scaleH:2} | assets/decorw/dw-0-0.png: w 996 vs 1992, h 60 vs 120 |
| `sample.20` | pass | {w:1600,h:1087,aspect:1.472} | {width:1600,height:1087,aspect:1.472,scaleW:1,scaleH:1} | assets/elements/dc-01.png: the claimed size matches the file |
| `sample.21` | pass | {w:1600,h:348,aspect:4.598} | {width:1600,height:348,aspect:4.598,scaleW:1,scaleH:1} | assets/elements/dc-02.png: the claimed size matches the file |
| `sample.22` | pass | {w:1600,h:1231,aspect:1.3} | {width:1600,height:1231,aspect:1.3,scaleW:1,scaleH:1} | assets/elements/dc-03.png: the claimed size matches the file |
| `sample.23` | pass | {w:1600,h:432,aspect:3.704} | {width:1600,height:432,aspect:3.704,scaleW:1,scaleH:1} | assets/elements/dc-04.png: the claimed size matches the file |
| `sample.29` | pass | {w:1200,h:675,aspect:1.778} | {width:1200,height:675,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-1.webp: the claimed size matches the file |
| `sample.30` | pass | {w:1200,h:675,aspect:1.778} | {width:1200,height:675,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-2.png: the claimed size matches the file |
| `sample.31` | pass | {w:800,h:450,aspect:1.778} | {width:800,height:450,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-5.webp: the claimed size matches the file |
| `sample.41` | **fail** | {w:273,h:154,aspect:1.773} | {width:800,height:450,aspect:1.778,scaleW:2.93,scaleH:2.922} | assets/logow-11.webp: w 273 vs 800, h 154 vs 450 |
| `sample.42` | **fail** | {w:273,h:154,aspect:1.773} | {width:800,height:450,aspect:1.778,scaleW:2.93,scaleH:2.922} | assets/logow-13.png: w 273 vs 800, h 154 vs 450 |
| `sample.43` | pass | {w:72,h:38,aspect:1.895} | {width:72,height:38,aspect:1.895,scaleW:1,scaleH:1} | assets/logow-2.svg: the claimed size matches the file |
| `sample.45` | **fail** | {w:273,h:154,aspect:1.773} | {width:800,height:450,aspect:1.778,scaleW:2.93,scaleH:2.922} | assets/logow-7.webp: w 273 vs 800, h 154 vs 450 |
| `sample.46` | **fail** | {w:273,h:154,aspect:1.773} | {width:800,height:450,aspect:1.778,scaleW:2.93,scaleH:2.922} | assets/logow-9.webp: w 273 vs 800, h 154 vs 450 |
| `sample.47` | **fail** | {w:72,h:38,aspect:1.895} | {width:144,height:76,aspect:1.895,scaleW:2,scaleH:2} | assets/logow-shot-1.png: w 72 vs 144, h 38 vs 76 |
| `sample.48` | **fail** | {w:273,h:154,aspect:1.773} | {width:546,height:308,aspect:1.773,scaleW:2,scaleH:2} | assets/logow-shot-10.png: w 273 vs 546, h 154 vs 308 |
| `sample.49` | **fail** | {w:273,h:154,aspect:1.773} | {width:546,height:308,aspect:1.773,scaleW:2,scaleH:2} | assets/logow-shot-12.png: w 273 vs 546, h 154 vs 308 |
| `sample.50` | **fail** | {w:273,h:154,aspect:1.773} | {width:546,height:308,aspect:1.773,scaleW:2,scaleH:2} | assets/logow-shot-6.png: w 273 vs 546, h 154 vs 308 |
| `sample.51` | **fail** | {w:273,h:154,aspect:1.773} | {width:546,height:308,aspect:1.773,scaleW:2,scaleH:2} | assets/logow-shot-8.png: w 273 vs 546, h 154 vs 308 |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:1,approx:true} | monoLight assets/logo-light.svg: mean luminance of the opaque pixels 1 (light needs >= 0.6) |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0,approx:true} | monoDark assets/logo-mono-dark.svg: mean luminance of the opaque pixels 0 (dark needs <= 0.4) |
| `backgroundSurface.heroPhoto` | skipped | {surface:hero,bg:#28415D} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |
| `backgroundSurface.bleedPhoto` | skipped | {surface:hero,bg:#28415D} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |

### hdfc-2
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `photoArea.title` | **fail** | {photoArea:[[0,0],[1061,0],[741,1080],[0,1080]],device:coverBands} | {vertexInsidePx:0,vertexInsidePctW:0,nearestEdge:[[1061,0],[741,1080]],edgeMaxDistancePx:69.9,edgeMaxDistancePctW:3.64,edgeMeanDistancePx:2.93,edgeWithinShare:0.969} | photoArea vs assets/elements/cover-bands.svg (device coverBands): the edge nearest the device runs up to 3.64 % W from a painted edge (tolerance 2 %; 96.9 % of its length within) |
| `logoBox.title` | pass | {variant:monoLight,box:{x:1233,y:78,w:608,h:118},background:cover} | {variantExists:true,borderColour:#0A4C8A,lockup:{x:1233,y:78,w:609,h:119},fill:1,beyondMargin:false} | logo box vs assets/backgrounds/cover-art.jpg: the lockup (pixels unlike the ground colour #0A4C8A) fills 100 % of the box and stays within it |
| `sample.0` | pass | {w:1246,h:831,aspect:1.5} | {width:1246,height:831,aspect:1.499,scaleW:1,scaleH:1} | assets/images/cover-businessman-chart.jpeg: the claimed size matches the file |
| `sample.1` | pass | {w:1175,h:783,aspect:1.5} | {width:1175,height:783,aspect:1.501,scaleW:1,scaleH:1} | assets/images/toc-laptop-desk.jpeg: the claimed size matches the file |
| `sample.2` | pass | {w:321,h:209,aspect:1.54} | {width:321,height:209,aspect:1.536,scaleW:1,scaleH:1} | assets/images/imagery-globe-tablet.jpeg: the claimed size matches the file |
| `sample.3` | pass | {w:511,h:213,aspect:2.4} | {width:511,height:213,aspect:2.399,scaleW:1,scaleH:1} | assets/images/imagery-hand-chart.jpeg: the claimed size matches the file |
| `sample.4` | pass | {w:276,h:245,aspect:1.13} | {width:276,height:245,aspect:1.127,scaleW:1,scaleH:1} | assets/images/imagery-isometric-growth.jpeg: the claimed size matches the file |
| `sample.5` | pass | {w:288,h:216,aspect:1.33} | {width:288,height:216,aspect:1.333,scaleW:1,scaleH:1} | assets/images/imagery-hologram-team.jpeg: the claimed size matches the file |
| `sample.6` | pass | {w:494,h:272,aspect:1.82} | {width:494,height:272,aspect:1.816,scaleW:1,scaleH:1} | assets/images/imagery-young-investors.jpeg: the claimed size matches the file |
| `logoTone.monoDark` | **fail** | {tone:dark} | {meanLuminance:0.669} | monoDark assets/logos/hdfcsec-logo-bw.png: mean luminance of the opaque pixels 0.669 (dark needs <= 0.4) |
| `logoTone.monoLight` | **fail** | {tone:light} | {meanLuminance:0.427} | monoLight assets/logos/hdfcsec-logo-reverse.png: mean luminance of the opaque pixels 0.427 (light needs >= 0.6) |
| `decorAspect.headerStrip` | pass | {box:{x:0,y:0,w:1920,h:175}} | {boxAspect:10.9714,viewBoxAspect:11.0029,off:0.0029} | box 10.971 vs viewBox 11.003: 0.3 % off (tolerance 5 %) |
| `decorColours.headerStrip` | pass | {colours:the brand colours} | {colours:[{hex:#004B8D,nearest:#004B8D,distance:0},{hex:#ED1C24,nearest:#ED1C24,distance:0}]} | assets/elements/header-strip.svg: every painted colour is a brand colour |
| `decorAspect.headerBand` | pass | {box:{x:0,y:0,w:1282,h:175}} | {boxAspect:7.3257,viewBoxAspect:7.345,off:0.0026} | box 7.326 vs viewBox 7.345: 0.3 % off (tolerance 5 %) |
| `decorColours.headerBand` | pass | {colours:the brand colours} | {colours:[{hex:#004B8D,nearest:#004B8D,distance:0},{hex:#ED1C24,nearest:#ED1C24,distance:0}]} | assets/elements/header-band.svg: every painted colour is a brand colour |
| `decorAspect.coverBands` | pass | {box:{x:0,y:0,w:1920,h:1080}} | {boxAspect:1.7778,viewBoxAspect:1.7778,off:0} | box 1.778 vs viewBox 1.778: 0 % off (tolerance 5 %) |
| `decorColours.coverBands` | pass | {colours:the brand colours} | {colours:[{hex:#ED1C24,nearest:#ED1C24,distance:0},{hex:#FFFFFF,nearest:#FFFFFF,distance:0}]} | assets/elements/cover-bands.svg: every painted colour is a brand colour |
| `decorAspect.coverTint` | pass | {box:{x:0,y:0,w:1920,h:1080}} | {boxAspect:1.7778,viewBoxAspect:1.7778,off:0} | box 1.778 vs viewBox 1.778: 0 % off (tolerance 5 %) |
| `decorColours.coverTint` | pass | {colours:the brand colours} | {colours:[{hex:#ED1C24,nearest:#ED1C24,distance:0}]} | assets/elements/cover-tint.svg: every painted colour is a brand colour |
| `decorAspect.titleSlash` | pass | {box:{x:236,y:37,w:34,h:103}} | {boxAspect:0.3301,viewBoxAspect:0.3324,off:0.0068} | box 0.33 vs viewBox 0.332: 0.7 % off (tolerance 5 %) |
| `decorColours.titleSlash` | pass | {colours:the brand colours} | {colours:[{hex:#ED1C24,nearest:#ED1C24,distance:0}]} | assets/elements/title-slash.svg: every painted colour is a brand colour |
| `backgroundSurface.cover` | pass | {surface:blue,bg:#004B8D} | {share:0.519} | 51.9 % of assets/backgrounds/cover-art.jpg lies within RGB 40 of blue bg #004B8D (needs 20 %) |
| `backgroundSurface.starfield` | pass | {surface:deep,bg:#002354} | {share:0.565} | 56.5 % of assets/backgrounds/starfield-blue.jpg lies within RGB 40 of deep bg #002354 (needs 20 %) |
| `backgroundSurface.hero` | skipped | {surface:blue,bg:#004B8D} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |
| `mask.slant` | pass | {type:polygon,points:33.3,0 100,0 100,100 0,100} | {points:4} | 4 points |

### headspace
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:3840,h:2160,aspect:1.78} | {width:3840,height:2160,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-20.png: the claimed size matches the file |
| `sample.1` | pass | {w:2145,h:1714,aspect:1.25} | {width:2145,height:1714,aspect:1.251,scaleW:1,scaleH:1} | assets/img/photo-2.png: the claimed size matches the file |
| `sample.2` | pass | {w:954,h:1302,aspect:0.73} | {width:954,height:1302,aspect:0.733,scaleW:1,scaleH:1} | assets/img/photo-10.png: the claimed size matches the file |
| `sample.3` | pass | {w:1188,h:1000,aspect:1.19} | {width:1188,height:1000,aspect:1.188,scaleW:1,scaleH:1} | assets/img/photo-4.png: the claimed size matches the file |
| `sample.4` | pass | {w:863,h:1000,aspect:0.86} | {width:863,height:1000,aspect:0.863,scaleW:1,scaleH:1} | assets/img/photo-5.png: the claimed size matches the file |
| `sample.5` | pass | {w:1266,h:620,aspect:2.04} | {width:1266,height:620,aspect:2.042,scaleW:1,scaleH:1} | assets/img/photo-6.png: the claimed size matches the file |
| `sample.6` | pass | {w:636,h:868,aspect:0.73} | {width:636,height:868,aspect:0.733,scaleW:1,scaleH:1} | assets/img/photo-11.png: the claimed size matches the file |
| `sample.7` | pass | {w:636,h:868,aspect:0.73} | {width:636,height:868,aspect:0.733,scaleW:1,scaleH:1} | assets/img/photo-12.png: the claimed size matches the file |
| `sample.8` | pass | {w:800,h:686,aspect:1.17} | {width:800,height:686,aspect:1.166,scaleW:1,scaleH:1} | assets/img/photo-3.png: the claimed size matches the file |
| `sample.9` | pass | {w:720,h:607,aspect:1.19} | {width:720,height:607,aspect:1.186,scaleW:1,scaleH:1} | assets/img/photo-18.png: the claimed size matches the file |
| `sample.10` | pass | {w:373,h:426,aspect:0.88} | {width:373,height:426,aspect:0.876,scaleW:1,scaleH:1} | assets/img/photo-7.png: the claimed size matches the file |
| `sample.11` | **fail** | {w:1344,h:718,aspect:1.872} | {width:1032,height:774,aspect:1.333,scaleW:0.768,scaleH:1.078} | assets/backgrounds/bg-1-src.png: w 1344 vs 1032, h 718 vs 774, aspect 1.872 vs 1.333 |
| `sample.12` | **fail** | {w:1344,h:718,aspect:1.872} | {width:2688,height:1436,aspect:1.872,scaleW:2,scaleH:2} | assets/backgrounds/bg-1.png: w 1344 vs 2688, h 718 vs 1436 |
| `sample.13` | pass | {w:1032,h:774,aspect:1.333} | {width:1032,height:774,aspect:1.333,scaleW:1,scaleH:1} | assets/backgrounds/sec-1-src.png: the claimed size matches the file |
| `sample.14` | pass | {w:2880,h:1660,aspect:1.735} | {width:2880,height:1660,aspect:1.735,scaleW:1,scaleH:1} | assets/backgrounds/sec-1.png: the claimed size matches the file |
| `sample.15` | pass | {w:672,h:590,aspect:1.139} | {width:672,height:590,aspect:1.139,scaleW:1,scaleH:1} | assets/decorw/dw-0-1.svg: the claimed size matches the file |
| `sample.16` | pass | {w:129,h:129,aspect:1} | {width:129,height:129,aspect:1,scaleW:1,scaleH:1} | assets/decorw/dw-0-3.svg: the claimed size matches the file |
| `sample.17` | pass | {w:318,h:434,aspect:0.733} | {width:318,height:434,aspect:0.733,scaleW:1,scaleH:1} | assets/decorw/dw-0-4.svg: the claimed size matches the file |
| `sample.18` | **fail** | {w:1440,h:68,aspect:21.176} | {width:767,height:36,aspect:21.306,scaleW:0.533,scaleH:0.529} | assets/decorw/dw-0-5.svg: w 1440 vs 767, h 68 vs 36 |
| `sample.19` | **fail** | {w:38,h:81,aspect:0.469} | {width:76,height:162,aspect:0.469,scaleW:2,scaleH:2} | assets/decorw/dw-1-0.png: w 38 vs 76, h 81 vs 162 |
| `sample.20` | **fail** | {w:1440,h:676,aspect:2.13} | {width:2560,height:1500,aspect:1.707,scaleW:1.778,scaleH:2.219} | assets/decorw/dw-2-1.svg: w 1440 vs 2560, h 676 vs 1500, aspect 2.13 vs 1.707 |
| `sample.21` | **fail** | {w:408,h:408,aspect:1} | {width:570,height:570,aspect:1,scaleW:1.397,scaleH:1.397} | assets/decorw/dw-2-2.svg: w 408 vs 570, h 408 vs 570 |
| `sample.22` | pass | {w:275,h:330,aspect:0.833} | {width:275,height:330,aspect:0.833,scaleW:1,scaleH:1} | assets/decorw/dw-2-3.svg: the claimed size matches the file |
| `sample.23` | pass | {w:275,h:330,aspect:0.833} | {width:275,height:330,aspect:0.833,scaleW:1,scaleH:1} | assets/decorw/dw-2-4.svg: the claimed size matches the file |
| `sample.24` | pass | {w:275,h:330,aspect:0.833} | {width:275,height:330,aspect:0.833,scaleW:1,scaleH:1} | assets/decorw/dw-2-5.svg: the claimed size matches the file |
| `sample.25` | pass | {w:275,h:330,aspect:0.833} | {width:275,height:330,aspect:0.833,scaleW:1,scaleH:1} | assets/decorw/dw-2-6.svg: the claimed size matches the file |
| `sample.26` | **fail** | {w:356,h:407,aspect:0.875} | {width:373,height:426,aspect:0.876,scaleW:1.048,scaleH:1.047} | assets/decorw/dw-2-7.svg: w 356 vs 373, h 407 vs 426 |
| `sample.27` | pass | {w:104,h:105,aspect:0.99} | {width:104,height:105,aspect:0.99,scaleW:1,scaleH:1} | assets/elements/dc-01.svg: the claimed size matches the file |
| `sample.28` | pass | {w:767,h:36,aspect:21.306} | {width:767,height:36,aspect:21.306,scaleW:1,scaleH:1} | assets/elements/dc-02.svg: the claimed size matches the file |
| `sample.29` | pass | {w:1447,h:52,aspect:27.827} | {width:1447,height:52,aspect:27.827,scaleW:1,scaleH:1} | assets/elements/dc-03.svg: the claimed size matches the file |
| `sample.30` | pass | {w:318,h:434,aspect:0.733} | {width:318,height:434,aspect:0.733,scaleW:1,scaleH:1} | assets/elements/dc-04.svg: the claimed size matches the file |
| `sample.31` | pass | {w:133,h:133,aspect:1} | {width:133,height:133,aspect:1,scaleW:1,scaleH:1} | assets/elements/dc-05.svg: the claimed size matches the file |
| `sample.32` | pass | {w:138,h:48,aspect:2.875} | {width:138,height:48,aspect:2.875,scaleW:1,scaleH:1} | assets/elements/dc-08.svg: the claimed size matches the file |
| `sample.37` | **fail** | {w:387,h:290,aspect:1.334} | {width:1032,height:774,aspect:1.333,scaleW:2.667,scaleH:2.669} | assets/img/photo-1.png: w 387 vs 1032, h 290 vs 774 |
| `sample.38` | **fail** | {w:1440,h:1848,aspect:0.779} | {width:628,height:806,aspect:0.779,scaleW:0.436,scaleH:0.436} | assets/img/photo-13.png: w 1440 vs 628, h 1848 vs 806 |
| `sample.39` | **fail** | {w:1440,h:1848,aspect:0.779} | {width:628,height:806,aspect:0.779,scaleW:0.436,scaleH:0.436} | assets/img/photo-14.png: w 1440 vs 628, h 1848 vs 806 |
| `sample.40` | **fail** | {w:1440,h:1848,aspect:0.779} | {width:628,height:806,aspect:0.779,scaleW:0.436,scaleH:0.436} | assets/img/photo-15.png: w 1440 vs 628, h 1848 vs 806 |
| `sample.41` | **fail** | {w:1440,h:1848,aspect:0.779} | {width:628,height:806,aspect:0.779,scaleW:0.436,scaleH:0.436} | assets/img/photo-16.png: w 1440 vs 628, h 1848 vs 806 |
| `sample.42` | **fail** | {w:1440,h:1842,aspect:0.782} | {width:630,height:806,aspect:0.782,scaleW:0.438,scaleH:0.438} | assets/img/photo-17.png: w 1440 vs 630, h 1842 vs 806 |
| `sample.43` | **fail** | {w:1440,h:1182,aspect:1.218} | {width:659,height:541,aspect:1.218,scaleW:0.458,scaleH:0.458} | assets/img/photo-19.png: w 1440 vs 659, h 1182 vs 541 |
| `sample.44` | **fail** | {w:186,h:213,aspect:0.873} | {width:373,height:426,aspect:0.876,scaleW:2.005,scaleH:2} | assets/img/photo-8.png: w 186 vs 373, h 213 vs 426 |
| `sample.45` | **fail** | {w:186,h:213,aspect:0.873} | {width:373,height:426,aspect:0.876,scaleW:2.005,scaleH:2} | assets/img/photo-9.png: w 186 vs 373, h 213 vs 426 |
| `sample.78` | **fail** | {w:154,h:32,aspect:4.813} | {width:192,height:40,aspect:4.8,scaleW:1.247,scaleH:1.25} | assets/logow-2.svg: w 154 vs 192, h 32 vs 40 |
| `sample.79` | **fail** | {w:318,h:434,aspect:0.733} | {width:440,height:600,aspect:0.733,scaleW:1.384,scaleH:1.382} | assets/logow-4.png: w 318 vs 440, h 434 vs 600 |
| `sample.80` | **fail** | {w:154,h:32,aspect:4.813} | {width:308,height:64,aspect:4.813,scaleW:2,scaleH:2} | assets/logow-shot-1.png: w 154 vs 308, h 32 vs 64 |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:0.672,approx:true} | monoLight assets/logo-light.svg: mean luminance of the opaque pixels 0.672 (light needs >= 0.6) |
| `decorColours.illustration-family` | skipped | {colours:the brand colours} | {colours:0} | assets/elements/family-1.svg: paints no plain colour this reader can see |
| `decorColours.illustration-family-1` | **fail** | {colours:the brand colours} | {colours:[{hex:#FFCAE7,nearest:#FFCAE7,distance:0},{hex:#00A4FF,nearest:#00A4FF,distance:0},{hex:#141313,nearest:#2D2C2B,distance:42.7}]} | assets/decorw/dw-0-2.svg paints #141313 (nearest brand colour #2D2C2B, 42.7): not a brand colour |
| `decorColours.illustration-family-2` | **fail** | {colours:the brand colours} | {colours:[{hex:#01A652,nearest:#01A753,distance:1.4},{hex:#9E65C6,nearest:#9E65C6,distance:0},{hex:#141313,nearest:#2D2C2B,distance:42.7}]} | assets/elements/dc-06.svg paints #141313 (nearest brand colour #2D2C2B, 42.7): not a brand colour |
| `decorColours.illustration-family-3` | **fail** | {colours:the brand colours} | {colours:[{hex:#FFCE00,nearest:#FFCE00,distance:0},{hex:#FF7300,nearest:#FF7E1D,distance:31},{hex:#141313,nearest:#2D2C2B,distance:42.7}]} | assets/elements/dc-07.svg paints #FF7300 (nearest brand colour #FF7E1D, 31), #141313 (nearest brand colour #2D2C2B, 42.7): not a brand colour |
| `decorAspect.shape-w3-dw10` | **fail** | {box:{x:960,y:1041,w:960,h:39}} | {boxAspect:24.6154,viewBoxAspect:27.8269,off:0.1154} | box 24.615 vs viewBox 27.827: 11.5 % off (tolerance 5 %) |
| `decorColours.shape-w3-dw10` | pass | {colours:the brand colours} | {colours:[{hex:#FFCE00,nearest:#FFCE00,distance:0}]} | assets/decorw/dw-0-0.svg: every painted colour is a brand colour |
| `mask.blob` | pass | {type:svg} | {shapes:1} | assets/masks/mask-1.svg: 1 painted shape(s) |

### notion
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:1916,h:1198,aspect:1.6} | {width:1916,height:1198,aspect:1.599,scaleW:1,scaleH:1} | assets/ui-workspace.png: the claimed size matches the file |
| `sample.1` | pass | {w:1108,h:953,aspect:1.16} | {width:1108,height:952,aspect:1.164,scaleW:1,scaleH:0.999} | assets/ui-dashboard.png: the claimed size matches the file |
| `sample.2` | pass | {w:1108,h:798,aspect:1.39} | {width:1108,height:797,aspect:1.39,scaleW:1,scaleH:0.999} | assets/ui-meetings.png: the claimed size matches the file |
| `sample.3` | **fail** | {w:1204,h:626,aspect:1.92} | {width:1204,height:628,aspect:1.917,scaleW:1,scaleH:1.003} | assets/ui-chart.png: h 626 vs 628 |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0.28,approx:true} | monoDark assets/logo-lockup.svg: mean luminance of the opaque pixels 0.28 (dark needs <= 0.4) |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:0.659,approx:true} | monoLight assets/logo-lockup-white.svg: mean luminance of the opaque pixels 0.659 (light needs >= 0.6) |

### rukko
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:2400,h:1350,aspect:1.78} | {width:2400,height:1350,aspect:1.778,scaleW:1,scaleH:1} | assets/img/hero-speed-lines.jpg: the claimed size matches the file |
| `sample.1` | pass | {w:1800,h:1800,aspect:1} | {width:1800,height:1800,aspect:1,scaleW:1,scaleH:1} | assets/img/sole-tread.jpg: the claimed size matches the file |
| `sample.2` | pass | {w:2000,h:1334,aspect:1.5} | {width:2000,height:1334,aspect:1.499,scaleW:1,scaleH:1} | assets/img/graffiti-shapes.jpg: the claimed size matches the file |
| `sample.3` | pass | {w:2000,h:1334,aspect:1.5} | {width:2000,height:1334,aspect:1.499,scaleW:1,scaleH:1} | assets/img/stadium-lights.jpg: the claimed size matches the file |
| `sample.4` | pass | {w:2400,h:1350,aspect:1.78} | {width:2400,height:1350,aspect:1.778,scaleW:1,scaleH:1} | assets/img/halftone-burst.jpg: the claimed size matches the file |
| `sample.5` | pass | {w:2000,h:1334,aspect:1.5} | {width:2000,height:1334,aspect:1.499,scaleW:1,scaleH:1} | assets/img/track-lanes.jpg: the claimed size matches the file |
| `sample.6` | pass | {w:1600,h:2000,aspect:0.8} | {width:1600,height:2000,aspect:0.8,scaleW:1,scaleH:1} | assets/img/tall-banners.jpg: the claimed size matches the file |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:0.847,approx:true} | monoLight assets/logo-mono-light.svg: mean luminance of the opaque pixels 0.847 (light needs >= 0.6) |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0.003,approx:true} | monoDark assets/logo-black.svg: mean luminance of the opaque pixels 0.003 (dark needs <= 0.4) |
| `decorAspect.cornerCut` | pass | {box:{x:1720,y:0,w:200,h:200}} | {boxAspect:1,viewBoxAspect:1,off:0} | box 1 vs viewBox 1: 0 % off (tolerance 5 %) |
| `decorColours.cornerCut` | pass | {colours:the brand colours} | {colours:[{hex:#FF2A2A,nearest:#FF2A2A,distance:0}]} | assets/elements/corner-cut.svg: every painted colour is a brand colour |
| `decorAspect.cutRed` | pass | {box:{x:1280,y:0,w:640,h:720}} | {boxAspect:0.8889,viewBoxAspect:0.8889,off:0} | box 0.889 vs viewBox 0.889: 0 % off (tolerance 5 %) |
| `decorColours.cutRed` | pass | {colours:the brand colours} | {colours:[{hex:#FF2A2A,nearest:#FF2A2A,distance:0}]} | assets/elements/cut-red.svg: every painted colour is a brand colour |
| `decorAspect.cutBlack` | pass | {box:{x:1280,y:0,w:640,h:720}} | {boxAspect:0.8889,viewBoxAspect:0.8889,off:0} | box 0.889 vs viewBox 0.889: 0 % off (tolerance 5 %) |
| `decorColours.cutBlack` | pass | {colours:the brand colours} | {colours:[{hex:#0B0B0B,nearest:#0B0B0B,distance:0}]} | assets/elements/cut-black.svg: every painted colour is a brand colour |
| `decorAspect.halftoneBlack` | **fail** | {box:{x:1400,y:680,w:520,h:400}} | {boxAspect:1.3,viewBoxAspect:1.2308,off:0.0562} | box 1.3 vs viewBox 1.231: 5.6 % off (tolerance 5 %) |
| `decorColours.halftoneBlack` | pass | {colours:the brand colours} | {colours:[{hex:#0B0B0B,nearest:#0B0B0B,distance:0}]} | assets/elements/halftone-black.svg: every painted colour is a brand colour |
| `backgroundSurface.speed` | skipped | {surface:black,bg:#0B0B0B} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |
| `mask.slanted` | pass | {type:polygon,points:14,0 100,0 86,100 0,100} | {points:4} | 4 points |

### shopify
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:1920,h:1080,aspect:1.78} | {width:1920,height:1080,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-1.webp: the claimed size matches the file |
| `sample.1` | pass | {w:2090,h:1742,aspect:1.2} | {width:2090,height:1742,aspect:1.2,scaleW:1,scaleH:1} | assets/img/photo-16.webp: the claimed size matches the file |
| `sample.2` | pass | {w:2520,h:1416,aspect:1.78} | {width:2520,height:1416,aspect:1.78,scaleW:1,scaleH:1} | assets/img/photo-10.webp: the claimed size matches the file |
| `sample.3` | pass | {w:2520,h:1416,aspect:1.78} | {width:2520,height:1416,aspect:1.78,scaleW:1,scaleH:1} | assets/img/photo-11.webp: the claimed size matches the file |
| `sample.4` | pass | {w:2520,h:1416,aspect:1.78} | {width:2520,height:1416,aspect:1.78,scaleW:1,scaleH:1} | assets/img/photo-12.webp: the claimed size matches the file |
| `sample.5` | pass | {w:2000,h:865,aspect:2.31} | {width:2000,height:865,aspect:2.312,scaleW:1,scaleH:1} | assets/img/photo-17.webp: the claimed size matches the file |
| `sample.6` | pass | {w:1200,h:1152,aspect:1.04} | {width:1200,height:1152,aspect:1.042,scaleW:1,scaleH:1} | assets/img/photo-15.webp: the claimed size matches the file |
| `sample.7` | pass | {w:1022,h:1022,aspect:1} | {width:1022,height:1022,aspect:1,scaleW:1,scaleH:1} | assets/img/photo-19.webp: the claimed size matches the file |
| `sample.8` | pass | {w:1303,h:733,aspect:1.78} | {width:1303,height:733,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-18.webp: the claimed size matches the file |
| `sample.9` | pass | {w:1000,h:765,aspect:1.31} | {width:1000,height:765,aspect:1.307,scaleW:1,scaleH:1} | assets/img/photo-3.webp: the claimed size matches the file |
| `sample.10` | pass | {w:1000,h:648,aspect:1.54} | {width:1000,height:648,aspect:1.543,scaleW:1,scaleH:1} | assets/img/photo-20.webp: the claimed size matches the file |
| `sample.11` | pass | {w:1023,h:574,aspect:1.78} | {width:1023,height:574,aspect:1.782,scaleW:1,scaleH:1} | assets/img/photo-24.webp: the claimed size matches the file |
| `sample.12` | pass | {w:1022,h:574,aspect:1.78} | {width:1022,height:574,aspect:1.78,scaleW:1,scaleH:1} | assets/img/photo-22.webp: the claimed size matches the file |
| `sample.13` | **fail** | {w:1440,h:847,aspect:1.7} | {width:2880,height:1694,aspect:1.7,scaleW:2,scaleH:2} | assets/backgrounds/bg-1.png: w 1440 vs 2880, h 847 vs 1694 |
| `sample.14` | **fail** | {w:1260,h:525,aspect:2.4} | {width:2520,height:1050,aspect:2.4,scaleW:2,scaleH:2} | assets/backgrounds/bg-2.png: w 1260 vs 2520, h 525 vs 1050 |
| `sample.15` | pass | {w:2880,h:1694,aspect:1.7} | {width:2880,height:1694,aspect:1.7,scaleW:1,scaleH:1} | assets/backgrounds/sec-1.png: the claimed size matches the file |
| `sample.16` | **fail** | {w:1440,h:653,aspect:2.205} | {width:2880,height:1306,aspect:2.205,scaleW:2,scaleH:2} | assets/backgrounds/sec-2.png: w 1440 vs 2880, h 653 vs 1306 |
| `sample.17` | **fail** | {w:1440,h:858,aspect:1.678} | {width:2880,height:1716,aspect:1.678,scaleW:2,scaleH:2} | assets/backgrounds/sec-3.png: w 1440 vs 2880, h 858 vs 1716 |
| `sample.18` | pass | {w:2880,h:1694,aspect:1.7} | {width:2880,height:1694,aspect:1.7,scaleW:1,scaleH:1} | assets/backgrounds/vid-1-frame.png: the claimed size matches the file |
| `sample.19` | pass | {w:480,h:270,aspect:1.778} | {width:480,height:270,aspect:1.778,scaleW:1,scaleH:1} | assets/backgrounds/vid-1-poster.webp: the claimed size matches the file |
| `sample.20` | **fail** | {w:297,h:56,aspect:5.304} | {width:594,height:112,aspect:5.304,scaleW:2,scaleH:2} | assets/decorw/dw-0-0.png: w 297 vs 594, h 56 vs 112 |
| `sample.21` | **fail** | {w:41,h:41,aspect:1} | {width:79,height:79,aspect:1,scaleW:1.927,scaleH:1.927} | assets/decorw/dw-0-2.png: w 41 vs 79, h 41 vs 79 |
| `sample.22` | **fail** | {w:492,h:422,aspect:1.166} | {width:986,height:844,aspect:1.168,scaleW:2.004,scaleH:2} | assets/decorw/dw-0-4.png: w 492 vs 986, h 422 vs 844 |
| `sample.23` | **fail** | {w:53,h:64,aspect:0.828} | {width:106,height:128,aspect:0.828,scaleW:2,scaleH:2} | assets/decorw/dw-0-5.png: w 53 vs 106, h 64 vs 128 |
| `sample.24` | **fail** | {w:39,h:64,aspect:0.609} | {width:78,height:128,aspect:0.609,scaleW:2,scaleH:2} | assets/decorw/dw-0-6.png: w 39 vs 78, h 64 vs 128 |
| `sample.25` | **fail** | {w:1872,h:1203,aspect:1.556} | {width:2074,height:1333,aspect:1.556,scaleW:1.108,scaleH:1.108} | assets/decorw/dw-0-7.svg: w 1872 vs 2074, h 1203 vs 1333 |
| `sample.26` | **fail** | {w:1440,h:778,aspect:1.851} | {width:1440,height:819,aspect:1.758,scaleW:1,scaleH:1.053} | assets/decorw/dw-0-8.svg: h 778 vs 819, aspect 1.851 vs 1.758 |
| `sample.27` | pass | {w:2472,h:978,aspect:2.528} | {width:2472,height:978,aspect:2.528,scaleW:1,scaleH:1} | assets/elements/dc-01.png: the claimed size matches the file |
| `sample.28` | pass | {w:2610,h:2610,aspect:1} | {width:2610,height:2610,aspect:1,scaleW:1,scaleH:1} | assets/elements/dc-02.png: the claimed size matches the file |
| `sample.29` | pass | {w:24,h:24,aspect:1} | {width:24,height:24,aspect:1,scaleW:1,scaleH:1} | assets/elements/dc-03.svg: the claimed size matches the file |
| `sample.30` | pass | {w:1236,h:488,aspect:2.533} | {width:1236,height:488,aspect:2.533,scaleW:1,scaleH:1} | assets/elements/dc-04.png: the claimed size matches the file |
| `sample.31` | pass | {w:800,h:1405,aspect:0.569} | {width:800,height:1405,aspect:0.569,scaleW:1,scaleH:1} | assets/elements/dc-05.webp: the claimed size matches the file |
| `sample.32` | pass | {w:1600,h:1008,aspect:1.587} | {width:1600,height:1008,aspect:1.587,scaleW:1,scaleH:1} | assets/elements/dc-06.webp: the claimed size matches the file |
| `sample.55` | **fail** | {w:1933,h:440,aspect:4.393} | {width:3000,height:683,aspect:4.392,scaleW:1.552,scaleH:1.552} | assets/img/photo-13.webp: w 1933 vs 3000, h 440 vs 683 |
| `sample.56` | **fail** | {w:1600,h:457,aspect:3.501} | {width:3200,height:914,aspect:3.501,scaleW:2,scaleH:2} | assets/img/photo-14.webp: w 1600 vs 3200, h 457 vs 914 |
| `sample.57` | **fail** | {w:504,h:385,aspect:1.309} | {width:1000,height:765,aspect:1.307,scaleW:1.984,scaleH:1.987} | assets/img/photo-2.webp: w 504 vs 1000, h 385 vs 765 |
| `sample.58` | **fail** | {w:552,h:488,aspect:1.131} | {width:1104,height:976,aspect:1.131,scaleW:2,scaleH:2} | assets/img/photo-21.webp: w 552 vs 1104, h 488 vs 976 |
| `sample.59` | pass | {w:1022,h:574,aspect:1.78} | {width:1022,height:574,aspect:1.78,scaleW:1,scaleH:1} | assets/img/photo-23.webp: the claimed size matches the file |
| `sample.60` | pass | {w:760,h:456,aspect:1.667} | {width:760,height:456,aspect:1.667,scaleW:1,scaleH:1} | assets/img/photo-7.webp: the claimed size matches the file |
| `sample.61` | **fail** | {w:200,h:222,aspect:0.901} | {width:400,height:445,aspect:0.899,scaleW:2,scaleH:2.005} | assets/img/photo-8.webp: w 200 vs 400, h 222 vs 445 |
| `sample.62` | **fail** | {w:200,h:222,aspect:0.901} | {width:400,height:445,aspect:0.899,scaleW:2,scaleH:2.005} | assets/img/photo-9.jpg: w 200 vs 400, h 222 vs 445 |
| `sample.81` | **fail** | {w:126,h:36,aspect:3.5} | {width:500,height:143,aspect:3.497,scaleW:3.968,scaleH:3.972} | assets/logow-2.svg: w 126 vs 500, h 36 vs 143 |
| `sample.87` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-32.png: w 48 vs 96, h 48 vs 96 |
| `sample.88` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-34.webp: w 48 vs 96, h 48 vs 96 |
| `sample.89` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-36.png: w 48 vs 96, h 48 vs 96 |
| `sample.90` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-38.png: w 48 vs 96, h 48 vs 96 |
| `sample.91` | **fail** | {w:85,h:96,aspect:0.885} | {width:89,height:101,aspect:0.881,scaleW:1.047,scaleH:1.052} | assets/logow-4.svg: w 85 vs 89, h 96 vs 101 |
| `sample.92` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-40.png: w 48 vs 96, h 48 vs 96 |
| `sample.93` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-42.png: w 48 vs 96, h 48 vs 96 |
| `sample.94` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-44.png: w 48 vs 96, h 48 vs 96 |
| `sample.95` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-46.png: w 48 vs 96, h 48 vs 96 |
| `sample.96` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-50.webp: w 48 vs 96, h 48 vs 96 |
| `sample.97` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-52.png: w 48 vs 96, h 48 vs 96 |
| `sample.101` | **fail** | {w:126,h:36,aspect:3.5} | {width:252,height:72,aspect:3.5,scaleW:2,scaleH:2} | assets/logow-shot-1.png: w 126 vs 252, h 36 vs 72 |
| `sample.104` | **fail** | {w:85,h:96,aspect:0.885} | {width:168,height:192,aspect:0.875,scaleW:1.976,scaleH:2} | assets/logow-shot-3.png: w 85 vs 168, h 96 vs 192 |
| `sample.105` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-31.png: w 48 vs 96, h 48 vs 96 |
| `sample.106` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-33.png: w 48 vs 96, h 48 vs 96 |
| `sample.107` | **fail** | {w:48,h:48,aspect:1} | {width:98,height:98,aspect:1,scaleW:2.042,scaleH:2.042} | assets/logow-shot-35.png: w 48 vs 98, h 48 vs 98 |
| `sample.108` | **fail** | {w:48,h:48,aspect:1} | {width:100,height:98,aspect:1.02,scaleW:2.083,scaleH:2.042} | assets/logow-shot-37.png: w 48 vs 100, h 48 vs 98, aspect 1 vs 1.02 |
| `sample.109` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-39.png: w 48 vs 96, h 48 vs 96 |
| `sample.110` | **fail** | {w:48,h:48,aspect:1} | {width:100,height:100,aspect:1,scaleW:2.083,scaleH:2.083} | assets/logow-shot-41.png: w 48 vs 100, h 48 vs 100 |
| `sample.111` | **fail** | {w:48,h:48,aspect:1} | {width:100,height:100,aspect:1,scaleW:2.083,scaleH:2.083} | assets/logow-shot-43.png: w 48 vs 100, h 48 vs 100 |
| `sample.112` | **fail** | {w:48,h:48,aspect:1} | {width:100,height:100,aspect:1,scaleW:2.083,scaleH:2.083} | assets/logow-shot-45.png: w 48 vs 100, h 48 vs 100 |
| `sample.113` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-47.png: w 48 vs 96, h 48 vs 96 |
| `sample.114` | **fail** | {w:48,h:48,aspect:1} | {width:96,height:96,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-49.png: w 48 vs 96, h 48 vs 96 |
| `sample.115` | **fail** | {w:48,h:48,aspect:1} | {width:102,height:102,aspect:1,scaleW:2.125,scaleH:2.125} | assets/logow-shot-51.png: w 48 vs 102, h 48 vs 102 |
| `sample.118` | pass | {w:1440,h:810,aspect:1.778} | {width:1440,height:810,aspect:1.778,scaleW:1,scaleH:1} | assets/backgrounds/bg-1-src.webp: the claimed size matches the file |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:0.752,approx:true} | monoLight assets/logo-light.svg: mean luminance of the opaque pixels 0.752 (light needs >= 0.6) |
| `decorAspect.shape-w3-dw3` | pass | {box:{x:1806,y:96,w:18,h:420}} | {boxAspect:0.0429,viewBoxAspect:0.0417,off:0.0286} | box 0.043 vs viewBox 0.042: 2.9 % off (tolerance 5 %) |
| `decorColours.shape-w3-dw3` | pass | {colours:the brand colours} | {colours:[{hex:#02090A,nearest:#02090A,distance:0}]} | assets/decorw/dw-0-1.svg: every painted colour is a brand colour |
| `backgroundSurface.heroVideo` | skipped | {surface:hero,bg:#071716} | {} | assets/backgrounds/bg-1-src.webp: format not decoded (.webp; only PNG and JPEG are read) |
| `backgroundSurface.bleedPhoto` | skipped | {surface:black,bg:#000000} | {} | assets/img/photo-1.webp: format not decoded (.webp; only PNG and JPEG are read) |

### stripe
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:1632,h:1123,aspect:1.45} | {width:1632,height:1123,aspect:1.453,scaleW:1,scaleH:1} | assets/vis-payments.png: the claimed size matches the file |
| `sample.1` | pass | {w:800,h:1123,aspect:0.71} | {width:800,height:1123,aspect:0.712,scaleW:1,scaleH:1} | assets/vis-billing.png: the claimed size matches the file |
| `sample.2` | pass | {w:800,h:1123,aspect:0.71} | {width:800,height:1123,aspect:0.712,scaleW:1,scaleH:1} | assets/vis-agentic.png: the claimed size matches the file |
| `sample.3` | pass | {w:800,h:1123,aspect:0.71} | {width:800,height:1123,aspect:0.712,scaleW:1,scaleH:1} | assets/vis-issuing.png: the claimed size matches the file |
| `sample.4` | pass | {w:800,h:1123,aspect:0.71} | {width:800,height:1123,aspect:0.712,scaleW:1,scaleH:1} | assets/vis-crypto.png: the claimed size matches the file |
| `sample.5` | pass | {w:1725,h:846,aspect:2.04} | {width:1725,height:846,aspect:2.039,scaleW:1,scaleH:1} | assets/vis-connect.png: the claimed size matches the file |
| `sample.6` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/team/patrick-collison.jpg: the claimed size matches the file |
| `sample.7` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/team/john-collison.jpg: the claimed size matches the file |
| `sample.8` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/team/will-gaybrick.jpg: the claimed size matches the file |
| `sample.9` | pass | {w:400,h:400,aspect:1} | {width:400,height:400,aspect:1,scaleW:1,scaleH:1} | assets/team/trish-walsh.jpg: the claimed size matches the file |
| `sample.10` | pass | {w:541,h:541,aspect:1} | {width:541,height:541,aspect:1,scaleW:1,scaleH:1} | assets/team/eileen-omara.jpg: the claimed size matches the file |
| `sample.11` | pass | {w:1632,h:703,aspect:2.32} | {width:1632,height:703,aspect:2.321,scaleW:1,scaleH:1} | assets/photos/hertz.jpg: the claimed size matches the file |
| `sample.12` | pass | {w:1632,h:703,aspect:2.32} | {width:1632,height:703,aspect:2.321,scaleW:1,scaleH:1} | assets/photos/urbn.jpg: the claimed size matches the file |
| `sample.13` | pass | {w:1632,h:703,aspect:2.32} | {width:1632,height:703,aspect:2.321,scaleW:1,scaleH:1} | assets/photos/instacart.jpg: the claimed size matches the file |
| `sample.14` | pass | {w:1632,h:703,aspect:2.32} | {width:1632,height:703,aspect:2.321,scaleW:1,scaleH:1} | assets/photos/lemonde.jpg: the claimed size matches the file |
| `logoTone.monoDark` | pass | {tone:dark} | {meanLuminance:0.01,approx:true} | monoDark assets/logo.svg: mean luminance of the opaque pixels 0.01 (dark needs <= 0.4) |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:1,approx:true} | monoLight assets/logo-light.svg: mean luminance of the opaque pixels 1 (light needs >= 0.6) |
| `decorColours.dotGrid` | **fail** | {colours:the brand colours} | {colours:[{hex:#30437F,nearest:#2B3A6B,distance:22.5}]} | assets/decor/dot-grid.svg paints #30437F (nearest brand colour #2B3A6B, 22.5): not a brand colour |
| `backgroundSurface.heroRibbon` | skipped | {surface:page,bg:#FFFFFF} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |

### the-ken
| claim | result | claimed | measured | why |
|---|---|---|---|---|
| `sample.0` | pass | {w:2048,h:1150,aspect:1.78} | {width:2048,height:1150,aspect:1.781,scaleW:1,scaleH:1} | assets/img/photo-10.jpg: the claimed size matches the file |
| `sample.1` | pass | {w:1920,h:1171,aspect:1.64} | {width:1920,height:1171,aspect:1.64,scaleW:1,scaleH:1} | assets/img/photo-8.jpg: the claimed size matches the file |
| `sample.2` | pass | {w:1400,h:1382,aspect:1.01} | {width:1400,height:1382,aspect:1.013,scaleW:1,scaleH:1} | assets/img/photo-4.jpg: the claimed size matches the file |
| `sample.3` | pass | {w:1400,h:1321,aspect:1.06} | {width:1400,height:1321,aspect:1.06,scaleW:1,scaleH:1} | assets/img/photo-1.jpg: the claimed size matches the file |
| `sample.4` | pass | {w:1400,h:1321,aspect:1.06} | {width:1400,height:1321,aspect:1.06,scaleW:1,scaleH:1} | assets/img/photo-2.jpg: the claimed size matches the file |
| `sample.5` | pass | {w:1400,h:1260,aspect:1.11} | {width:1400,height:1260,aspect:1.111,scaleW:1,scaleH:1} | assets/img/photo-3.jpg: the claimed size matches the file |
| `sample.6` | pass | {w:1786,h:986,aspect:1.81} | {width:1786,height:986,aspect:1.811,scaleW:1,scaleH:1} | assets/img/photo-9.jpg: the claimed size matches the file |
| `sample.7` | pass | {w:1786,h:986,aspect:1.81} | {width:1786,height:986,aspect:1.811,scaleW:1,scaleH:1} | assets/img/photo-11.jpg: the claimed size matches the file |
| `sample.8` | pass | {w:1400,h:1050,aspect:1.33} | {width:1400,height:1050,aspect:1.333,scaleW:1,scaleH:1} | assets/img/photo-6.jpg: the claimed size matches the file |
| `sample.9` | pass | {w:1400,h:1050,aspect:1.33} | {width:1400,height:1050,aspect:1.333,scaleW:1,scaleH:1} | assets/img/photo-7.jpg: the claimed size matches the file |
| `sample.10` | pass | {w:1400,h:868,aspect:1.61} | {width:1400,height:868,aspect:1.613,scaleW:1,scaleH:1} | assets/img/photo-5.webp: the claimed size matches the file |
| `sample.11` | pass | {w:1024,h:576,aspect:1.78} | {width:1024,height:576,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-13.jpg: the claimed size matches the file |
| `sample.12` | pass | {w:1024,h:565,aspect:1.81} | {width:1024,height:565,aspect:1.812,scaleW:1,scaleH:1} | assets/img/photo-12.jpg: the claimed size matches the file |
| `sample.13` | pass | {w:768,h:512,aspect:1.5} | {width:768,height:512,aspect:1.5,scaleW:1,scaleH:1} | assets/img/photo-19.jpg: the claimed size matches the file |
| `sample.14` | pass | {w:768,h:432,aspect:1.78} | {width:768,height:432,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-20.jpg: the claimed size matches the file |
| `sample.15` | pass | {w:768,h:432,aspect:1.78} | {width:768,height:432,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-22.jpg: the claimed size matches the file |
| `sample.16` | pass | {w:768,h:432,aspect:1.78} | {width:768,height:432,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-23.jpg: the claimed size matches the file |
| `sample.17` | pass | {w:768,h:431,aspect:1.78} | {width:768,height:431,aspect:1.782,scaleW:1,scaleH:1} | assets/img/photo-16.jpg: the claimed size matches the file |
| `sample.18` | **fail** | {w:1320,h:135,aspect:9.778} | {width:1270,height:130,aspect:9.769,scaleW:0.962,scaleH:0.963} | assets/decorw/dw-0-0.svg: w 1320 vs 1270, h 135 vs 130 |
| `sample.25` | pass | {w:735,h:339,aspect:2.168} | {width:735,height:339,aspect:2.168,scaleW:1,scaleH:1} | assets/img/photo-14.webp: the claimed size matches the file |
| `sample.26` | pass | {w:768,h:424,aspect:1.811} | {width:768,height:424,aspect:1.811,scaleW:1,scaleH:1} | assets/img/photo-15.jpg: the claimed size matches the file |
| `sample.27` | pass | {w:1024,h:576,aspect:1.778} | {width:1024,height:576,aspect:1.778,scaleW:1,scaleH:1} | assets/img/photo-17.webp: the claimed size matches the file |
| `sample.28` | pass | {w:1024,h:575,aspect:1.781} | {width:1024,height:575,aspect:1.781,scaleW:1,scaleH:1} | assets/img/photo-18.jpg: the claimed size matches the file |
| `sample.29` | pass | {w:768,h:424,aspect:1.811} | {width:768,height:424,aspect:1.811,scaleW:1,scaleH:1} | assets/img/photo-21.jpg: the claimed size matches the file |
| `sample.30` | pass | {w:768,h:424,aspect:1.811} | {width:768,height:424,aspect:1.811,scaleW:1,scaleH:1} | assets/img/photo-24.jpg: the claimed size matches the file |
| `sample.37` | pass | {w:20,h:20,aspect:1} | {width:20,height:20,aspect:1,scaleW:1,scaleH:1} | assets/logow-2.svg: the claimed size matches the file |
| `sample.38` | **fail** | {w:310,h:174,aspect:1.782} | {width:1760,height:990,aspect:1.778,scaleW:5.677,scaleH:5.69} | assets/logow-4.jpg: w 310 vs 1760, h 174 vs 990 |
| `sample.39` | **fail** | {w:184,h:142,aspect:1.296} | {width:1024,height:576,aspect:1.778,scaleW:5.565,scaleH:4.056} | assets/logow-6.jpg: w 184 vs 1024, h 142 vs 576, aspect 1.296 vs 1.778 |
| `sample.40` | pass | {w:134,h:22,aspect:6.091} | {width:134,height:22,aspect:6.091,scaleW:1,scaleH:1} | assets/logow-8.svg: the claimed size matches the file |
| `sample.41` | **fail** | {w:20,h:20,aspect:1} | {width:40,height:40,aspect:1,scaleW:2,scaleH:2} | assets/logow-shot-1.png: w 20 vs 40, h 20 vs 40 |
| `sample.42` | **fail** | {w:310,h:174,aspect:1.782} | {width:620,height:348,aspect:1.782,scaleW:2,scaleH:2} | assets/logow-shot-3.png: w 310 vs 620, h 174 vs 348 |
| `logoTone.monoLight` | pass | {tone:light} | {meanLuminance:1,approx:true} | monoLight assets/logo-light.svg: mean luminance of the opaque pixels 1 (light needs >= 0.6) |
| `decorColours.inv-dc-01` | pass | {colours:the brand colours} | {colours:[{hex:#FFFFFF,nearest:#FFFFFF,distance:0}]} | assets/elements/dc-01.svg: every painted colour is a brand colour |
| `backgroundSurface.heroPhoto` | skipped | {surface:hero,bg:#5F1B13} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |
| `backgroundSurface.bleedPhoto` | skipped | {surface:hero,bg:#5F1B13} | {} | the variant gives an overlay: the surface colour comes from the overlay, not the image |

## Unverified fields (inferred: true without verifiedAt)
- **akgmedia**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **bosch**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **cisco**: 0 unverified (39 inferred fields, all carrying verifiedAt)
- **hdfc-2**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **headspace**: 0 unverified (20 inferred fields, all carrying verifiedAt)
- **notion**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **rukko**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **shopify**: 0 unverified (32 inferred fields, all carrying verifiedAt)
- **stripe**: 0 unverified (0 inferred fields, all carrying verifiedAt)
- **the-ken**: 0 unverified (25 inferred fields, all carrying verifiedAt)

