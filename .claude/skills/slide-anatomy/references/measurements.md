# L2 / L3 measurements: definitions

Every position is given in % of the slide: x in % W, y and sizes in % H. Type size is font size / slide height (8 pt on a 540 pt slide = 1.48% H).

## L2 Composition
| Field | How it is computed |
|---|---|
| `background` | The full-slide fill shape. Otherwise, the commonest border colour of the render (`pixels.background`, `single` false when it covers under 60% of the border). |
| `darkBackground` | Relative luminance under 0.2. |
| `margins` | The extent of text and marks (logos, footer marks) per side, leaving out objects that bleed. A side over 25% is listed in `open`: nothing reaches it (e.g. an image half). |
| `edges` | Left x of non-bleeding objects, clustered within 0.6% W. An edge needs 2 or more members, and `mainEdge` is the one with the most. |
| `rhythm.column` | The objects whose left x is within 2% W of the title's left x, top to bottom (panels, images and decor left out). |
| `rhythm.steps` | The gap from each object's bottom to the next object's top, in % H and in title-size units. |
| `rhythm.groups` | A new group starts where a gap exceeds max(1.6x the smallest gap, 0.45x the title size). `innerGap` is the smallest gap. |
| `zones` | Text zone = the union of title, subtitle, eyebrow, body, headings, date, authors and big numbers. Visual zone = the union of images, cut-outs, charts, panels, cards and cut shapes. `split` = left-right / right-left / top-bottom / bottom-top / overlap (interlocking). |
| `images[]` | Role, area, bleed sides, transparency (cut-out), and `breaksMargin` (passes the measured right or bottom margin). |
| `angles` | Non-axis straight edges of shapes (PDF paths) or pixel regions, in degrees from the horizontal, with the total edge length as % W. One value across many edges = one angle rule. |
| `fills` | Shape fill colours with their area. |
| `layers` | Objects in draw order. |

## L3 Balance
| Field | How it is computed |
|---|---|
| `typeScale.sizesPctH` | The distinct text sizes, largest first (furniture left out). `count` (5 or fewer is the norm). `ratios` = adjacent size ratios. |
| `titleToBody` | Title size / body size. Content slides 1.6-2.5; covers, dividers and KPI 3.5 or more. |
| `titleLeading` | Line pitch / size (multi-line titles). |
| `emphasisRuns` | Title runs set in another face or weight (keyword emphasis). |
| `logos[]` | Corner, width % W, height % H, and height / title size. |
| `weight` | A visual-weight map from the render: (colour distance from the slide's mean colour + edge energy) per pixel. Gives the 3x3 share, the centre (x, y) and left:right. It works without a single background. |
| `ink` | Pixels away from the background. `emptySpace` = 100 - ink share (meaningful when `background.single`). |
| `busy3x3` | Edge energy per third (0-100): flat fields vs photos or text. |
| `palette` | 8 median-cut colours with area share. |
| `words` | Words, leaving out footer, page number, legal and source. |
| text `ground` / `contrast` | The commonest render colour inside the text box that is not the text colour, and the WCAG ratio. Flagged under 4.5 (3 for text 3.3% H or larger). |

## Screenshot measurements (extract_image.py)
- `regions[]`: each palette colour covering 3% or more:
  - bbox;
  - `solid` (fill ratio over 0.6);
  - for each edge (left / right / top / bottom), a robust straight-line fit with `angleFromAxis`, `straight` (RMS under 0.6%), the span along the axis and the position (`at`) at both ends.
  - Two edges of one region at the same angle (e.g. right -9.8° from vertical, bottom 9.7° from horizontal) show one angle rule.
- `grid.png`: a 5% grid for reading text and logo positions by eye.
- `--probe x,y`: the exact colour at a point.
