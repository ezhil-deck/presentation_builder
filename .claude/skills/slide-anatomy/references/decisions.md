# From measurements to generation-time decisions

The builder works through skeleton x style x skin:
- **L1 + L2** give the skeleton: slots, zones, rhythm.
- **L3** gives the style: ratios, density, weight balance.
- **L4** gives the skin: device, angle, colour field.

Each decision below reads a measured range per category from the library. A range becomes a builder rule only after the owner approves it.

| Known at creation time | Decision | Measured basis (library field) |
|---|---|---|
| Brand has a strong colour, a photo is supplied | Cover type: colour panel over the photo (interlock) vs a clean split vs type only | `zones.split`, `images[].bleed`, `angles` (cover) |
| Brand shape language (angle / curve / none) | One cut angle used on every panel edge, or a curve, or none | `angles` (one value across the edges) |
| No photo; topic art or none | Cut-out on the diagonal opposite the logo, or a type-only cover with a larger title | `weight.centre` against the logo corner |
| Partner / client logo present | Opposite corner from the brand logo, with a label, height about the subtitle size | `logos[]` corner and `hToTitleSize` |
| Title length (words, lines) | Size within the category's title % H range; widen the text zone before stepping down | `typeScale.titlePctH`, `titleWords`, `zones.text` |
| A keyword in the title | Weight contrast on the run, not colour | `typeScale.emphasisRuns` |
| Metadata present (doc type, date, authors, legal) | Stack them in groups: the inner gap inside a group, a wider gap between groups, legal anchored to the bottom margin | `rhythm.groups`, `innerGap`, step gaps |
| Number of text levels | Small steps: adjacent ratio about 1.2 (1.07-1.8); title : body about 1.9 on working slides, 2.3 on covers; statement slides 1-3 sizes, working slides 4-5 (findings F3, F2) | `typeScale.ratios`, `count`, `titleToBody` |
| Text on a colour field | Hero text on the panel; furniture moves to a calm surface; contrast at least 4.5 | `ground` / `contrast` |
| Image is a cut-out vs a rectangle | Cut-outs may break the margin and bleed; rectangles bleed on whole sides | `images[].transparent`, `breaksMargin` |
| Deck rhythm | Dark covers and dividers, light content; a divider every N pages | `darkBackground` share per category, section-break frequency per deck |
| Density style (minimal to modular) | Margins, exhibits per slide, containers | `margins`, category mix, modular-columns share |
| QA after the build | No placeholders or hidden objects, text on the shared edge, contrast passes, logo smaller than the title | `QA` fields |
