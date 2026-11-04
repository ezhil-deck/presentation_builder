---
name: flow-and-page-tracker-auditor
description: Audits deck flow and adds navigation aids (section dividers, page tracker, consistent running headers) so a long deck stays oriented and reads as one document.
---

# Flow and Page Tracker Auditor

## When to use
Use this on a long deck (roughly 15 slides or more) where the reader can lose the thread. Use it when sections are not signposted, when there is no sense of where you are, or when the deck feels like loose slides rather than a document. Use it after the storyline and slides are built, as a structural finishing pass.

## What it does
It audits the deck's flow and installs navigation: clear section dividers, a page tracker that shows the current section, consistent running headers and footers, and transitions between sections. The reader always knows where they are and where the argument is going.

## Method
Navigation makes a long argument legible. Build it from the storyline structure.

1. Map the sections. Recover the top-level structure from the storyline: the few sections that group the slides. These are the supporting arguments of the pyramid. Confirm the slide order matches.

2. Add section dividers. Give each section a divider slide with the section name and its one-line takeaway (an action title for the whole section). The divider tells the reader what the next block will argue.

3. Build a page tracker. Add a small, consistent navigation element (often a horizontal list of section names) that highlights the current section. It runs on body slides so the reader always sees progress through the argument. Keep it small and neutral, accent only the current section.

4. Standardize running headers and footers. Use one consistent header zone (section or topic) and footer (page number, short title, confidentiality, source area). Same position, same style on every slide.

5. Check transitions. At the end of each section, confirm the last slide hands off to the next section's question. A one-line bridge ("That covers where value is; next, what to do about it") keeps the flow.

6. Verify numbering and order. Page numbers continuous, slides in the order the title chain implies, backup clearly separated and labelled.

7. Keep navigation light. Trackers, headers, and footers are wayfinding, not content. Keep them small, neutral, and out of the way of the message. They should never compete with the exhibit.

8. Re-read as a journey. Read the dividers and trackers alone. They should narrate the structure of the argument from start to finish.

## Inputs
- The full deck and its storyline or section structure.
- The action title for each section, if defined.
- The brand standard for headers, footers, and page numbers.

## Output format
Return: the section map (sections and their slides), the divider slides to add (name plus section takeaway), the page tracker design and where it appears, the standardized header and footer spec, and any transition bridges to add. Flag slides that are out of order or sections with no clear takeaway.

## Example
Deck: 24 slides, no dividers, inconsistent footers.
Audit: four sections (Diagnosis, Market, Options, Plan). Add four divider slides, each with a section takeaway. Add a four-item page tracker across the top of body slides, current section in accent. Standardize footer to page number plus short title plus "Confidential". Add a bridge from Options to Plan: "We recommend Option B; here is how we deliver it."
