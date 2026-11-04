---
name: mece-layout-architect
description: Arranges the content of a single slide into a MECE structure so the elements are mutually exclusive, collectively exhaustive, and laid out in a logical reading order.
---

# MECE Layout Architect

## When to use
Use this when a slide's content overlaps, repeats, or has gaps, for example a list where two bullets say the same thing or a framework missing a category. Use it on any slide that groups items: drivers, options, segments, risks, workstreams. Use it before designing, so the layout reflects a clean structure.

## What it does
It restructures the items on a slide so the groups are MECE, mutually exclusive and collectively exhaustive, and then lays them out so the structure is visible. Categories do not overlap, nothing is missing, and the arrangement shows how the parts relate.

## Method
MECE is the test that a set of categories has no overlaps and no gaps. Apply it to the slide's content, then express it spatially.

1. List the raw items. Pull every item the slide currently shows.

2. Find the organizing dimension. Decide the single axis the items are grouped by: by stage, by function, by region, by cause, by size, by time. Items should be grouped by one consistent dimension, not a mix.

3. Test mutual exclusivity. Check every pair of categories for overlap. If an item could sit in two buckets, the buckets are wrong; redefine them or split the item.

4. Test collective exhaustiveness. Ask what is missing. Use a known structure to check completeness: a process has a start and end, a market has all segments, a P&L has all cost lines. Add an "other" only as a last resort, and keep it small.

5. Choose the structure shape. Map the MECE set to a layout: a list for a simple set, columns for parallel categories, a 2x2 for two binary dimensions, a process flow for sequence, a tree for hierarchy, a matrix for two crossing dimensions.

6. Order within the structure. Sequence the categories by logic the reader expects: time order, size order, or priority order. Random order signals sloppy thinking.

7. Lay out for reading order. Place the structure so the eye moves top-left to bottom-right. Group related cells with shared borders and white space. Keep parallel categories visually parallel (same size, same style).

8. Add the spanning summary. If the categories ladder up to one point, add a summary band or a right-hand callout that states it, so the structure has a so-what.

## Inputs
- The list of items or bullets on the slide.
- The dimension by which they should be grouped, if known.
- The action title the structure must support.

## Output format
Return the MECE grouping as labelled categories with their members, a note on the organizing dimension, and any overlaps fixed or gaps filled. Then recommend the layout shape and the order of categories. Flag any "other" bucket and any remaining overlap you could not resolve.

## Example
Raw bullets: cut travel, renegotiate IT vendors, reduce overtime, consolidate offices, freeze hiring, switch cloud provider.
Organizing dimension: cost type.
MECE groups: People (overtime, hiring freeze), Facilities (offices, travel), Technology (IT vendors, cloud).
Layout: three parallel columns, one per cost type, ordered by savings size, with a top band stating total addressable saving.
