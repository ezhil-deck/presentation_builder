# presentation_builder — read first

Brand input → Mood → generated presentation, with its own slide engine, renderer and editor. Plain JS/JSX, React 18,
webpack 5, Node 24. `docs/PLAN-draft.md` holds the design and every owner decision; `DECISIONS.md` the dated log.

## Ground rules

1. **The three reference repos are ideas, not constraints.** brand-mood-creator (v5), pitchdeckdoclist and design_assets
   are read for knowledge; nothing is ported, converted or depended on. No runtime path ever reaches into them.
2. **No AI in the pipeline.** Read, design, compose, fit, check and export are deterministic functions.
3. **No guesswork.** A value the brand does not give is a question (`BrandSpec.questions`), never a default. No colour,
   glyph, shape or decoration is added to every brand because the brand is silent. Every derived value names the brand
   signal it came from (`provenance`).
4. **One document, one renderer.** `Deck` JSON (schemas/deck.schema.json) is what the engine writes, the editor edits,
   the renderer paints and the exporters read. Every element is an absolute box; text carries the lines the fitter
   computed; HTML and PPTX must agree.
5. **Rules are code.** A rule is a function with a unit test and a negative test. Golden brands (`golden/brands/*`)
   snapshot their Mood and showcase Deck under `golden/expected/`; CI diffs them. No rule registry, no change-log JSON.
6. **Fit is computed, never cropped.** Text is measured with the font files; over budget → step the role down to
   `fit.min` → re-layout (fewer columns / split). Overflow that remains is a warning in the report.
7. **Editing warns, never blocks.** Any edit is allowed; checks mark violations with a one-click fix.
8. **Models:** Fable thinks and plans; Opus implements.
9. Nobody runs `git commit` / `git push` unless the owner asks in that conversation.

## Map

- `schemas/` — the five contracts: `brand-spec`, `mood`, `layout`, `content`, `deck` (+ `input/` = the accepted Brand
  Presentation Spec input format). Change a schema → bump its `$id` version and update `docs/PLAN-draft.md`.
- `packages/brand` read + validate input → BrandSpec · `mood` BrandSpec → Mood · `layouts` catalogue (JS modules returning
  Layout instances) · `engine` Content + Mood + layouts → Deck, text fit · `renderer` React, Deck → HTML · `export` PDF
  (puppeteer) + PPTX · `checks` report · `cli` `pb` · `ui` local editor/review app (port 8100).
- `golden/brands/<id>/` brand inputs (git-ignored) · `golden/showcase/showcase.md` the fixed review deck ·
  `golden/expected/<id>/` snapshots (in git). `out/<id>/` run outputs (git-ignored).

## Workflow

Plan or diff first for anything non-trivial; the owner approves per PR. Keep `docs/PLAN-draft.md` §0 current when a
decision changes and add one dated line to `DECISIONS.md`. Report results faithfully: failing tests, skipped steps and
gaps are stated, never smoothed over.
