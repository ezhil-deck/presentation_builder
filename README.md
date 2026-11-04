# presentation_builder

presentation_builder turns a brand into presentations. A brand JSON (plus its assets) goes in; a **Mood** (the
brand-dependent design decisions as plain, diffable data) is derived from it by tested rules; the **engine** composes slides
from content + Mood + a **layout catalogue** into a **Deck** of absolute boxes on a 1920x1080 canvas, with text fit computed
from font metrics; one **renderer** paints the Deck to HTML, and the export writers produce PDF and editable PPTX. Every run
ends with a deck and a report of rule checks. There is no AI in the pipeline: a value the brand does not give is a question
for a person, never a default.

The same renderer is the canvas of a local editor: the Deck JSON is the one document that is edited, saved and exported;
rules re-run on every edit and warn instead of blocking. Design and roadmap: [docs/PLAN-draft.md](docs/PLAN-draft.md).

## Repo map

| Path                  | What                                                                             |
| --------------------- | -------------------------------------------------------------------------------- |
| `packages/brand`      | read + validate brand input -> BrandSpec (`readBrand()`)                         |
| `packages/mood`       | BrandSpec -> Mood by rules (`deriveMood()`)                                      |
| `packages/layouts`    | layout catalogue (`layouts`)                                                     |
| `packages/engine`     | content + Mood + layouts -> Deck; text fit (`composeDeck()`, `fitText()`)        |
| `packages/renderer`   | React components painting a Deck to HTML (`Deck`, `Slide`, `renderDeckToHtml()`) |
| `packages/export`     | PDF (puppeteer) and PPTX (pptxgenjs) writers (`exportPdf()`, `exportPptx()`)     |
| `packages/checks`     | rule checks producing a report (`runChecks()`)                                   |
| `packages/cli`        | the `pb` command                                                                 |
| `packages/ui`         | local editor / review web app (webpack + Tailwind, port 8100)                    |
| `packages/vocabulary` | element vocabulary: terms, rules, schema map (`identify()`, `termFor()`)         |
| `golden/brands/`      | golden brand inputs (git-ignored, copied in locally)                             |
| `schemas/input/`      | the brand input schema                                                           |
| `docs/`               | design docs                                                                      |
| `out/`                | build output, `out/<id>/` (git-ignored)                                          |

All packages are plain JavaScript / JSX ES modules (React 18, Babel, webpack 5, Tailwind 3, Jest 29) in one npm-workspaces
monorepo. Node 24 (`.nvmrc`).

## Run

```sh
npm install                                   # puppeteer's Chrome goes to .cache/puppeteer (git-ignored)
npm test                                      # jest, every package
npm run lint                                  # eslint
npm run cli -- build golden/brands/stripe --png   # out/stripe/{brand-spec,mood,deck,report}.json + deck.html, slides/NN.png, sheet.png
npm run cli -- build golden/brands/stripe --out out/try
npm run cli -- build golden/brands/stripe --no-catalogue --png --out out/stripe-68
                                              # the 68 layouts only (no catalogue layout; the build before C4, docs/PLAN-catalogue.md)
npm run cli -- build golden/brands/stripe --before out/stripe-68 --png --out out/_catalogue/stripe
                                              # the default (catalogue first) against that build: compare.png + index.html
npm run catalogue:layouts                     # regenerate packages/layouts/data/catalogue-layouts.json from golden/catalogue/
npm run vocabulary:docs                       # regenerate docs/vocabulary.md, the anatomy skill's roles.md and the answer-key record
npm run cli -- check out/stripe --brand golden/brands/stripe   # the checks of an existing build -> out/stripe/checks.json
npm run cli -- diff out/stripe golden/expected/stripe          # JSON (+ pixel) diff of two builds
npm run build:ui && npm run serve:ui          # the Studio: http://localhost:8100 (review console at #/review; dev: npm run api:ui + npm run dev:ui)
npm run test:e2e                              # browser e2e of the Studio (puppeteer, a sandbox data root; builds the UI when stale; not in npm test)
```

The Studio's designer guide (screen, editing, keyboard map, document model, uploads / export, undo): [docs/STUDIO.md](docs/STUDIO.md).
`node packages/ui/server.js --root <dir>` serves the Studio on another data root (golden/brands/, golden/showcase/,
content/, out/ under `<dir>`), as the e2e suite does.

Status: P0–P3 built; the Studio (slide preview + brand panel with live re-compose, `docs/PLAN-studio.md`) and the content
grammar v2 (`docs/S2-content-v2.md`), its layouts (`docs/S2-layouts.md`) and showcase v2 (the 38-slide golden deck,
approved 2026-11-02) built; the P4 editor on the Studio shell built (P4.1–P4.4, `docs/P4-spec.md` §9); next: P5 (PPTX).
`docs/PLAN-draft.md` has the roadmap and every owner decision.

## Rendering unattended (macOS)

Headless Chrome screenshots hang when the display sleeps, which makes `pb build --png/--pdf` and the export tests time
out. For unattended runs keep the display awake: `caffeinate -d -u -t 3600 &` before the run (idle-sleep prevention alone
is not enough). Open item: have `@pb/export` hold `caffeinate -d` itself while a browser is open.
