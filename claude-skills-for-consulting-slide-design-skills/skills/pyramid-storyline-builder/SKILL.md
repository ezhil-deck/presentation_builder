---
name: pyramid-storyline-builder
description: Structures a deck as a top-down Pyramid Principle argument so every slide supports one governing answer with MECE supporting lines.
---

# Pyramid Storyline Builder

## When to use
Use this before you build any slides, when you have findings but no narrative. Use it when a draft deck is a pile of analysis with no clear answer at the top. Use it when a partner asks "what is the one thing you want them to do?" and the deck cannot answer in one sentence.

## What it does
It produces a storyline tree: the governing thought at the top, the few supporting arguments below it, and the evidence that proves each argument. The tree becomes the table of contents and the action-title chain. It guarantees the deck argues one case rather than reporting many.

## Method
This applies the Pyramid Principle: ideas are grouped and summarized, each level answers a question raised by the level above, and ideas in a group are mutually exclusive and collectively exhaustive.

1. Write the governing thought. State the single answer the audience needs in one sentence. This is the apex. Everything else exists to support it. If you cannot write it, the analysis is not finished.

2. Identify the audience question. The apex must answer a real question the audience is asking: should we enter the market, why is margin falling, what should we do about the competitor. Name that question explicitly.

3. Build the supporting line of argument. Below the apex, list the 3 to 5 arguments that, taken together, prove the apex and answer the question. Use either a deductive chain (situation, problem, therefore action) or an inductive group (three independent reasons). Do not mix the two within one group.

4. Enforce MECE on each group. The supporting arguments must not overlap and must leave no gap. Test each pair for overlap. Test the set for completeness against the audience question.

5. Push each argument down a level. For each supporting argument, list the sub-points and the evidence that proves it. Keep recursing until each leaf maps to one slide of analysis you can actually produce.

6. Apply the so-what test at every node. Each node must state a conclusion, not a topic. If a node reads as a heading, rewrite it as a claim.

7. Sequence with SCQA at the top. Open with Situation (agreed facts), Complication (what changed or what is at risk), Question (the audience question), Answer (the apex). This sets up the pyramid for the reader.

8. Map nodes to slides. Each leaf becomes a slide. Each supporting argument becomes a section divider or a summary slide. The apex becomes the executive summary.

## Inputs
- The raw findings and analysis available.
- The decision the audience must make and the question they are asking.
- The audience and their starting beliefs.

## Output format
Return the pyramid as an indented tree: apex, then supporting arguments, then evidence leaves, each written as a full-sentence claim. Below it, return the SCQA opening in four lines. Finish with a flat slide list derived from the leaves, in presentation order.

## Example
Audience question: "Should we keep the loss-making logistics unit?"
Apex: "Keep logistics, but fix pricing and routing within 12 months, because it protects the core account base that funds the rest of the business."
Supporting line: (1) Logistics loses money only on three contracts, (2) those losses are fixable through repricing and route consolidation, (3) exiting would lose anchor accounts worth more than the logistics loss.
Each becomes a section, each section's leaves become the analysis slides.
