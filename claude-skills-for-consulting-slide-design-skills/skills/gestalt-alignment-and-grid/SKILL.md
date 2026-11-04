---
name: gestalt-alignment-and-grid
description: Cleans up slide layout using a grid and Gestalt principles so elements align, related items group, and the slide looks designed rather than assembled.
---

# Gestalt Alignment and Grid

## When to use
Use this on any slide that looks slightly off: edges that do not line up, uneven gaps, elements floating without relationship. Use it as a finishing pass before review. Use it when a slide is correct in content but reads as amateur.

## What it does
It imposes a grid and applies Gestalt grouping so the slide reads as an organized whole. Elements snap to shared edges, related items sit close, unrelated items separate, and the visual hierarchy matches the logical hierarchy.

## Method
Gestalt principles describe how the eye groups visual elements. Alignment to a grid is the mechanical foundation. Apply both.

1. Lay a grid. Define columns and consistent margins. Most consulting slides use a left and right margin, a title zone at top, and a body divided into 2, 3, or 4 columns. Every element should snap to a grid line.

2. Align to shared edges. Left-align text blocks to the same vertical line. Top-align items in a row. Nothing should be a few pixels off. Misalignment is the single most common tell of a rushed slide.

3. Apply proximity. Place related items close together and unrelated items farther apart. The eye reads near things as belonging together. A label belongs next to its element, not floating.

4. Apply similarity. Give items of the same type the same size, color, and style. Three parallel options should look identical in form so the reader treats them as peers.

5. Apply common region. Group items by enclosing them in shared white space or a single hairline border, not by boxing each one. A light shared border says "these go together" without clutter.

6. Use alignment to express hierarchy. The most important element gets position (top or left), size, or the accent color. Supporting elements indent or shrink. The layout should mirror the logical structure.

7. Equalize spacing. Make the gaps between repeated elements identical. Uneven spacing reads as accidental. Use the same gap value throughout the slide.

8. Set a consistent text scale. Title, subtitle, body, label: a small set of sizes used consistently. Avoid arbitrary font sizes. Consistent type scale is part of alignment.

9. Do a squint test. Squint at the slide. The groups and the hierarchy should still be obvious as blurry shapes. If everything blurs into one mass, grouping has failed.

## Inputs
- The slide to clean up.
- The logical grouping of its content (which items belong together).
- The intended hierarchy (what matters most).

## Output format
Return the grid to use (columns, margins), the alignment fixes (which elements to align to which edge), the grouping changes (what to bring together, what to separate), the size and style normalizations, and the one element to elevate. Note any element that breaks the grid and why.

## Example
Slide: three option cards, each a different width, labels floating above, an inconsistent gap.
Fixes: three equal-width columns on a shared grid; card titles top-aligned; each card's detail grouped under its title with tight proximity; equal gaps between cards; recommended option marked with the accent; all card text on a single type scale.
