---
title: Showcase deck
purpose: One slide per layout kind. Every brand's mood is reviewed on this deck. Copy tells the reader what the slide is for; it is placeholder, not a sample company.
---

# {brand.name}
<!-- kind: cover -->
{brand.tagline}

# What this deck shows
<!-- kind: agenda -->
1. The brand's surfaces and type
2. Text-first slides
3. Data: charts, tables, numbers
4. Pictures and people
5. Closing

# Section dividers carry the brand's strongest surface
<!-- kind: section -->
Part 1 · Surfaces and type

# A title and a short statement
<!-- kind: text -->
One paragraph of body text at the brand's body size. It should read comfortably from the back of a room, stay inside the margins, and never be shrunk below the brand's minimum size. Two sentences are enough to judge the line length and the leading.

# Three to five points, one idea each
<!-- kind: bullets -->
- The first point is short
- The second point runs a little longer so wrapping can be checked against the margin
- The third point has a sub-point
  - Sub-points use the brand's nested glyph and indent
- A fourth point keeps the list honest
- Five is the limit before the layout should split

# Two columns compare two things
<!-- kind: two-column -->
## Before
- Slow conversion
- Rendering tied to another app
- Rules written as prose

## After
- Seconds per brand
- One renderer for build, edit and export
- Rules as tested code

# Cards group related ideas
<!-- kind: cards -->
```cards
- title: Read
  text: The brand JSON is validated and every value is traced to its source.
- title: Design
  text: "Tested rules turn the brand into a mood: palette, type, geometry, shapes."
- title: Compose
  text: Content meets layouts; text is fitted from the font's own metrics.
- title: Export
  text: The same boxes become HTML, PDF and an editable PPTX.
```

# A process in steps
<!-- kind: steps -->
```steps
- title: Brand in
  text: "One folder: the JSON and its assets."
- title: Mood out
  text: Twenty kilobytes of decisions, readable and overridable.
- title: Deck out
  text: Showcase and user decks, checked and exported.
```

# Milestones on a line
<!-- kind: timeline -->
```timeline
- when: P0
  title: Foundations
- when: P1
  title: Brand to mood
- when: P2
  title: Engine and renderer
- when: P4
  title: Editor
```

# Section dividers repeat, so the rhythm shows
<!-- kind: section -->
Part 2 · Data

# Four numbers that matter
<!-- kind: kpi -->
```kpis
- value: 12
  label: layouts in the first catalogue
- value: "<10 s"
  label: brand to mood, no browser
- value: 100%
  label: elements editable in PPTX
- value: 0
  label: values guessed
```

# A column chart with a highlighted series
<!-- kind: chart -->
```chart
chartType: column
categories: [Q1, Q2, Q3, Q4]
series:
  - name: Conversions
    values: [12, 19, 27, 41]
  - name: Edits
    values: [4, 7, 9, 12]
highlight: 0
```

# A line chart over time
<!-- kind: chart -->
```chart
chartType: line
categories: [Jan, Feb, Mar, Apr, May, Jun]
series:
  - name: Seconds per brand
    values: [379, 202, 135, 95, 40, 9]
```

# Share of a whole
<!-- kind: chart -->
```chart
chartType: donut
categories: [Copied, Generated, Brand assets]
series:
  - name: Mood folder
    values: [82, 10, 8]
```

# A table with a header row and five rows
<!-- kind: table -->
```table
header: [Phase, Goal, Weeks, Status]
rows:
  - [P0, Foundations, 1, In progress]
  - [P1, Brand to mood, 2, Planned]
  - [P2, Engine and renderer, 3, Planned]
  - [P3, Checks and showcase, 2, Planned]
  - [P4, Editor, 4, Planned]
align: [left, left, right, left]
```

# Section dividers on the alternate surface
<!-- kind: section -->
Part 3 · Pictures and people

# A full-bleed image with a short title
<!-- kind: image -->
![Brand imagery sample]({brand.imagery.samples[0]})

# Image beside text
<!-- kind: image-text -->
![Brand imagery sample]({brand.imagery.samples[1]})
## Pictures follow the brand's imagery direction
One short paragraph beside the image. The image takes the brand's mask and treatment; the text keeps the body role and the margin.

# A quotation
<!-- kind: quote -->
> The mood is the brand's guidelines, applied the same way on every slide, without anyone having to remember them.
— A reviewer, Design team

# The people behind it
<!-- kind: team -->
```people
- name: First Person
  role: Brand lead
- name: Second Person
  role: Design engineer
- name: Third Person
  role: Product
```

# Partners and customers
<!-- kind: logos -->
```logos
- name: Logo one
- name: Logo two
- name: Logo three
- name: Logo four
- name: Logo five
- name: Logo six
```

# A diagram of how the parts connect
<!-- kind: diagram -->
```steps
- title: Brand
- title: Mood
- title: Deck
- title: Export
```

# Side by side
<!-- kind: comparison -->
## Generated
- Every value traced
- Fits by rule
## Edited
- Any change allowed
- Rules warn, never block

# Thank you
<!-- kind: cta -->
Questions and next steps
{brand.name} · {brand.tagline}
