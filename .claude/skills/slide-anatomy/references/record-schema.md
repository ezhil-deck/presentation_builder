# record.json fields

```
source        {kind: pdf|html|image, file, page|selector+index, exact}
slide         {w, h, unit, aspect}
render        path of the render the pixel facts and the overlay use
page, pages   position in the deck (category rules use it)
deck          {slug, firm, file}        (batch only)
category      {name, why}
L1_elements[] {id, role, why, kind: text|image|shape|vectorgroup|region, bbox [x0,y0,x1,y1] %, areaPct, z,
               text, pt, sizePctH, font, weight, colour, fill, lines, leading, align, caps, emphasisRuns,
               bleed[], transparent, angles{deg: edge length %W}, ground, contrast, furniture, px, radius}
L2_composition{background, backgroundArt, darkBackground, margins{left,top,right,bottom,open[]}, edges[{x, ids}],
               mainEdge, rhythm{column[], steps[{from, fromRole, to, toRole, gapPctH, gapInTitleSize}], groups[[ids]], innerGap},
               zones{text, visual, split, textAreaPct, visualAreaPct}, images[], angles{}, fills{}, layers[]}
L3_balance    {typeScale{sizesPctH[], count, ratios[], bodyPctH, titlePctH, titleToBody, titleWords, titleLines,
               titleLeading, faces[], emphasisRuns[], titleCaps}, logos[{id, role, wPctW, hPctH, corner, hToTitleSize}],
               weight{grid3x3, centre, leftRight}, ink{share, emptySpace, grid3x3, centre, leftRight}, busy3x3, palette[], words}
L4_intent     {signature, brandSignal, notes}       (by eye; every claim names the measurement it rests on)
QA            {placeholders[], hidden[], offEdgeText[], sizesOver5, titleOver25Words, lowContrast[], smallestTextPctH, tinyText[]}
```
