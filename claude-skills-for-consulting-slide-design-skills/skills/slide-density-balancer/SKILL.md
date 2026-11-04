---
name: slide-density-balancer
description: Right-sizes how much content a single slide carries, splitting overloaded slides and consolidating thin ones, so each slide makes one clear point.
---

# Slide Density Balancer

## When to use
Use this when slides are wall-to-wall text or, conversely, almost empty. Use it when a single slide is trying to make three arguments at once. Use it when a deck has too many pages because each says too little, or too few because each says too much.

## What it does
It tunes the information density of each slide to the one-message standard: enough substance to prove the action title, not so much that the point is lost. It splits crowded slides, merges thin ones, and moves detail to backup.

## Method
The target is one message per slide, supported by just enough evidence to be credible.

1. Count the messages. Read the slide and list the distinct points it makes. If it makes more than one, it is overloaded. One slide, one action title, one point.

2. Split overloaded slides. When a slide carries two or three arguments, break it into that many slides, each with its own action title and exhibit. The deck gets longer but each page lands.

3. Consolidate thin slides. When several slides each make a fragment of one point, merge them. A slide that holds one sentence and nothing else usually belongs combined with its neighbor.

4. Move detail to backup. Supporting tables, methodology, and granular data go to an appendix. The main slide shows the conclusion and the one exhibit that proves it; the backup holds the proof for the few who want it.

5. Apply the glance test. A reader should grasp the slide's point in five to ten seconds. If it takes longer, reduce density: fewer bullets, shorter lines, one exhibit.

6. Tune to the setting. A read-ahead document tolerates more density than a presented slide. For a live presentation, push detail down hard. For a leave-behind, allow more, but still one message per page.

7. Limit elements. As a working guide, keep a presented slide to one exhibit plus a few supporting lines, and a text slide to a handful of short bullets. These are guides, not quotas; the real test is the single message.

8. Re-sequence after splitting. When you split or merge, recheck the action-title chain so the storyline still flows and the page count is justified.

## Inputs
- The slide or deck to rebalance.
- The intended use (presented live versus read-ahead).
- The action title each slide should make.

## Output format
Return, per affected slide: the number of messages found, the recommendation (split into N, merge with slide X, move detail to backup, or keep), and the resulting action titles. End with the net change in page count and a note on whether the storyline still holds.

## Example
Slide: "Market overview" with a sizing chart, a competitor table, and a growth forecast.
Finding: three messages.
Action: split into three slides, "The market is 4bn and growing 6 percent", "Three players hold 60 percent share", "Mid-tier is the fastest-growing segment", each with its own exhibit; move the full competitor table to backup.
