---
name: exhibit-selector
description: Chooses the right exhibit type for a given message, mapping the so-what to the chart, framework, or layout that proves it most clearly.
---

# Exhibit Selector

## When to use
Use this when you know what a slide must say but not how to show it. Use it when a slide defaults to a bullet list that could be a stronger visual. Use it when a chart type fights the message, for example a pie chart asked to show change over time.

## What it does
It maps the message of a slide to the exhibit that proves it fastest: the correct chart family, a framework layout, a comparison grid, a process flow, or a simple labelled diagram. It picks the form that matches the analytical relationship being shown.

## Method
The exhibit must match the relationship in the data. Diagnose the relationship, then pick the form.

1. Name the relationship. Decide which one the slide shows: comparison between items, composition of a whole, change over time, distribution, correlation between two variables, flow or process, or a conceptual structure. Most confusion comes from forcing the wrong relationship onto a chart.

2. Match relationship to chart family.
   - Comparison across categories: bar chart, sorted. Use horizontal bars when labels are long.
   - Composition, one point in time: stacked bar or, only for a few large slices, a single waterfall or a 100 percent stacked bar. Avoid pies with many slices.
   - Composition that builds or bridges: waterfall (bridge) chart, ideal for "from X to Y, here is what moved".
   - Change over time: line chart for many periods, column chart for few.
   - Distribution: histogram or box.
   - Correlation: scatter, with a 2x2 overlay when you want to classify.
   - Ranking with a Pareto point: sorted bars with a cumulative line.

3. Decide chart versus framework versus table. If the point is a structured set of ideas rather than numbers, use a framework layout (2x2, value chain, process flow, tree) instead of a chart. If the reader truly needs to look up precise values, a compact grid of cards is acceptable, but a chart usually communicates the pattern faster.

4. Reduce to one message per exhibit. If the relationship is really two messages, split into two exhibits. One exhibit should answer one question.

5. Choose the comparison anchor. Every exhibit needs a reference: a target line, a benchmark, last year, a competitor. Without an anchor, a number is just a number.

6. Plan the highlight. Pick the one element the reader's eye should land on first, the bar, slice, or quadrant that carries the so-what. Everything else recedes.

7. Sanity-check against the action title. The chosen exhibit must visibly prove the action title. If a reader could draw the opposite title from the same exhibit, the form is wrong.

## Inputs
- The slide's action title or intended message.
- The underlying data and what relationship it represents.
- The comparison or benchmark available.

## Output format
Return the recommended exhibit type, the relationship it shows, the element to highlight, and the comparison anchor to include. If a list would be stronger as a framework, name the framework. Flag any case where the data does not actually support the title.

## Example
Title: "Cost growth came almost entirely from logistics, not labor."
Relationship: composition of a change (a bridge).
Recommended exhibit: waterfall from prior-year cost to current-year cost, each driver as a step, logistics step highlighted in the accent color, all others muted.
