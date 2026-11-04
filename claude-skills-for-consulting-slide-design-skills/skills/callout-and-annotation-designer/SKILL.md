---
name: callout-and-annotation-designer
description: Adds callouts and annotations that direct the reader to the insight on an exhibit, using restrained leader lines, short text, and a single accent.
---

# Callout and Annotation Designer

## When to use
Use this when an exhibit shows a pattern but does not tell the reader what to conclude. Use it when a chart needs the so-what stated on the slide, not just in the title. Use it when a complex visual needs one or two guideposts to be read quickly.

## What it does
It places callouts and annotations that point at the important part of an exhibit and say why it matters. Done well, a callout converts a neutral chart into a guided one: the reader's eye lands exactly where you want and reads the insight in place.

## Method
The job of a callout is direction and meaning, not decoration. Keep it spare.

1. Find the insight point. Identify the single place on the exhibit the reader must understand: the spike, the gap, the outlier, the crossover. The callout points there.

2. Write the annotation as a claim. The annotation text states a conclusion in a few words, not a label. "Margin crosses zero in Q3" beats "Q3". Keep it to one short line, two at most.

3. Use a thin leader line. Connect the annotation to the exact element with a single thin line or a small marker. Avoid thick arrows, glow, or boxes around the whole region unless you are enclosing a true group.

4. Limit the number. One annotation per exhibit is ideal, two if the slide makes two points. More than that and the exhibit becomes noise. If you need many, the exhibit should be split.

5. Apply one accent. The callout uses the single accent color so it stands out against the muted chart. Do not introduce a new color for each note.

6. Position to avoid collision. Place annotations in white space, not over data. Keep leader lines short and non-crossing. Align annotation text to the grid where possible.

7. Distinguish callout types. A data callout marks a value on the chart. A summary callout (often a right-hand band) states the overall takeaway. A footnote clarifies a definition or source. Use each for its purpose and keep footnotes small and gray.

8. Read the exhibit cold. Show it to a fresh eye. They should reach the intended conclusion within a few seconds, guided by the callout. If they reach a different conclusion, the annotation or the highlight is wrong.

## Inputs
- The exhibit and its data.
- The insight the reader should take from it.
- The action title, so the callout reinforces rather than repeats it.

## Output format
Return each callout as: the element it points to, the annotation text (one short line), the connector style (marker or thin leader), and the placement (which white space). Specify the accent color use and any footnote needed. Flag if the exhibit needs more than two callouts, which signals it should be split.

## Example
Exhibit: line chart of cumulative cash, dipping below zero then recovering.
Callouts: marker at the trough with "Cash low point, month 7, minus 2.1m"; small right-hand band summary "Self-funding from month 11". Both in the single accent; leader lines thin; chart otherwise gray.
