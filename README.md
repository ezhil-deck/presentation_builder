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

| Path                | What                                                                             |
| ------------------- | -------------------------------------------------------------------------------- |
| `packages/brand`    | read + validate brand input -> BrandSpec (`readBrand()`)                         |
| `packages/mood`     | BrandSpec -> Mood by rules (`deriveMood()`)                                      |
| `packages/layouts`  | layout catalogue (`layouts`)                                                     |
| `packages/engine`   | content + Mood + layouts -> Deck; text fit (`composeDeck()`, `fitText()`)        |
| `packages/renderer` | React components painting a Deck to HTML (`Deck`, `Slide`, `renderDeckToHtml()`) |
| `packages/export`   | PDF (puppeteer) and PPTX (pptxgenjs) writers (`exportPdf()`, `exportPptx()`)     |
| `packages/checks`   | rule checks producing a report (`runChecks()`)                                   |
| `packages/cli`      | the `pb` command                                                                 |
| `packages/ui`       | local editor / review web app (webpack + Tailwind, port 8100)                    |
| `golden/brands/`    | golden brand inputs (git-ignored, copied in locally)                             |
| `schemas/input/`    | the brand input schema                                                           |
| `docs/`             | design docs                                                                      |
| `out/`              | build output, `out/<id>/` (git-ignored)                                          |

All packages are plain JavaScript / JSX ES modules (React 18, Babel, webpack 5, Tailwind 3, Jest 29) in one npm-workspaces
monorepo. Node 24 (`.nvmrc`).

## Run

```sh
npm install                                   # puppeteer's Chrome goes to .cache/puppeteer (git-ignored)
npm test                                      # jest, every package
npm run lint                                  # eslint
npm run cli -- build golden/brands/stripe --png   # out/stripe/{brand-spec,mood,deck,report}.json + deck.html, slides/NN.png, sheet.png
npm run cli -- build golden/brands/stripe --out out/try
npm run cli -- check out/stripe --brand golden/brands/stripe   # the checks of an existing build -> out/stripe/checks.json
npm run cli -- diff out/stripe golden/expected/stripe          # JSON (+ pixel) diff of two builds
npm run build:ui && npm run serve:ui          # the review UI: http://localhost:8100 (dev: npm run api:ui + npm run dev:ui)
```

Status: P0–P2 built; P3 (checks report, `pb diff`, review UI with sign-off) built 2026-10-31 — see `docs/P3-spec.md`.
`docs/PLAN-draft.md` has the roadmap and every owner decision.

## Rendering unattended (macOS)

Headless Chrome screenshots hang when the display sleeps, which makes `pb build --png/--pdf` and the export tests time
out. For unattended runs keep the display awake: `caffeinate -d -u -t 3600 &` before the run (idle-sleep prevention alone
is not enough). Open item: have `@pb/export` hold `caffeinate -d` itself while a browser is open.
