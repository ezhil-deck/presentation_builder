# @pb/ui — the Studio + the review console

The Studio (`#/`, docs/PLAN-studio.md S1) is the default screen: filmstrip · canvas · brand panel. The server composes
(one engine, in Node, ST-1); the browser paints the Deck it returns with `@pb/renderer` and never runs a rule. The P3
review console below stays reachable at `#/review`; its pages are also the Studio's drawers.

## Studio

- **Top bar**: brand switcher (a card per brand painting that brand's cover composed from the current content, logo
  chip, name, three colour dots), content switcher (the showcase + `content/*.md`), slide counter, zoom fit / 50 /
  100 %, Guides (margins, title zone, check outlines; off by default), Grid, Export (PDF / PNG slides / deck JSON +
  HTML of the composed deck with its overrides → `out/<id>/studio/<content>/`; "Showcase build + PNG" = the P3 build),
  ⋯ (Questions, Report, Diff, Checks, Mood drawers; Reconvert brand; Review console).
- **Filmstrip**: the live slides scaled; the selected one ringed in the brand's accent. ← → ↑ ↓ PageUp / PageDown move
  one slide (Cmd = first / last, Home / End), one wheel gesture over the canvas = one slide (fit mode), `G` = 4-up grid,
  Esc closes a drawer / the grid.
- **Brand panel**: Brand (logo, surfaces as tiles - a click sets this slide's surface -, heading / body faces, the
  deck's rhythm, Mood), Slide (kind, layout picker with wireframes, surface, decor, logo, Reset slide), Checks (this
  slide's items; hover = outline on the canvas; deck items). Every change = compose with the new overrides, then store
  them; the canvas dims and the panel locks for the round trip; a failed compose keeps the previous deck.
- Hash: `#/studio/<brand>/<content>/<n>` (kept current with `replaceState`).

Studio API (`server/studio.js`, mounted by `server/index.js`):

- `GET /api/studio/brands` — every `golden/brands/<id>/<id>.json` derived once (`deriveBrand`, kept in memory;
  re-derived when the input or `answers.json` changes - mtime / size, then sha256): `[{id, name, ok, logo, colours,
accent, surfaces, rhythm, fonts, geometry, questions: {blocking, total}, errors}]`. `GET /api/studio/brands/:id` adds
  `questionsList` + the live `mood`; `POST /api/studio/brands/:id/reconvert` re-derives.
- `GET /api/studio/contents` — `[{id, title, file}]`: `showcase` then `content/*.md` (README skipped).
- `POST /api/studio/compose {brandId, contentId, overrides?}` → `{deck, warnings, checks (Report v1), report, overrides,
ms}`; without `overrides` the stored file is used. Overrides = `{slides: {[contentSlideId]: {surface?, layout?,
decor?: false, logo?: false}}}` (400 on unknown keys / types / layouts outside the catalogue).
- `GET|PUT /api/studio/overrides/:contentId/:brandId` — `content/overrides/<contentId>.<brandId>.json` (ST-2).
- `GET /api/studio/covers?contentId=` — every brand's first slide composed (`deck: null` + `error` when underivable).
- `GET /api/studio/layouts?kind=&brandId=` — the catalogue's layouts for a kind (all without `kind`), built for that
  brand's Mood: `[{id, kind, default, boxes: [{id, role, frame}]}]`.
- `POST /api/studio/diff {brandId, contentId}` — the live deck vs `golden/expected/<id>/deck.json` (showcase only).
- `POST /api/studio/export {brandId, contentId, pdf?, png?}` — deck.json, checks.json, overrides.json, deck.html (+
  deck.pdf / slides) in `out/<brandId>/studio/<contentId>/` through the CLI's `runRender`.

The server imports `@pb/cli`, `@pb/engine`, `@pb/layouts` and `@pb/checks` through the workspace links; they are not
yet declared in this package.json (that needs an `npm install` to update package-lock.json).

## Review console (P3-spec §C)

A local, single-user web app to review the golden brands' showcase decks and sign them off. The slides are painted
live by `@pb/renderer` (`@pb/renderer/components`); everything else shown comes from the files the CLI wrote in
`out/<id>/` (deck, report, questions, mood) or from the server's deck diff. The UI computes no rule.

## Run

|                                  | command                                                                | where                            |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| serve (built UI + API, one port) | `npm run build:ui && npm run serve:ui`                                 | http://localhost:8100/           |
| dev (hot reload)                 | `npm run api:ui` **in a second terminal**, then `npm run dev:ui`       | http://localhost:8100/           |
| API only                         | `npm run api:ui` (`node packages/ui/server.js --api-only --port 8101`) | http://localhost:8101/api/brands |

In dev, webpack-dev-server (port 8100) serves the app and proxies `/api` and `/files` to the API server on 8101
(`webpack.config.cjs` `devServer.proxy`), so `npm run dev:ui` alone shows the app but no data.
`node packages/ui/server.js [--port N] [--host H] [--api-only]`.

## Server (`server.js` → `server/index.js`, node:http only)

`createServer({ repoRoot, distDir?, apiOnly?, spawn?, loadDiff? })` / `startServer({ port, host, ...options })`.

- `GET /api/brands` — one entry per `out/<id>/` or `golden/brands/<id>/` folder (`_*` folders skipped):
  `{ id, name, out, input, report (checks summary of a Report v1, else null), stale, signedOff, ... }`;
  `stale` = sha256 of `golden/brands/<id>/<id>.json` ≠ `brand-spec.json` `input.sha256`. Extra fields for the UI:
  `counts`, `engineVersion`, `builtAt`, `deckHash`, `questions {blocking, optional}`, `signedOffDate`, `reviewStale`,
  `answersNewer`, `building`, `checksVersion`.
- `GET /api/brands/:id` — the same entry for one brand.
- `GET /api/brands/:id/{brand-spec,mood,deck,report,questions,checks,review}` — the JSON of `out/<id>/` (404 when
  absent; `review` → `{}`).
- `GET /api/brands/:id/diff` — `diffDecks(golden/expected/<id>/deck.json, out/<id>/deck.json)` from
  `packages/cli/src/diff.js`, imported lazily (501 `{error:'diff not available'}` while that module or export is
  missing; 404 without either deck).
- `POST /api/brands/:id/build` `{ png? }` → spawns `node packages/cli/bin/pb.js build golden/brands/<id> [--png]` in the
  repo root (one per brand: 409 while running); `GET /api/brands/:id/build` → `{ running, log (last 200 lines), exitCode }`.
- `GET|POST /api/brands/:id/answers` — read / merge `golden/brands/<id>/answers.json` (JSON pointer → value). The only
  writable file under the brand folder.
- `POST /api/brands/:id/review` `{ signedOff, notes? }` → `out/<id>/review.json` `{ signedOff, notes, date, engineVersion,
deckHash }` (deckHash = sha256 of `deck.json`; the UI marks the sign-off stale when the deck changes).
- `GET /files/out/<id>/...`, `GET /files/brands/<id>/...` — static files with their MIME type; a path resolving outside
  these roots → 403.
- Serve mode only: `packages/ui/dist/` (`/` → `index.html`).

## Pages (hash router)

`#/review` Brands · `#/b/<id>` Brand (Slides) · `#/b/<id>/<tab>` (`slides`, `checks`, `questions`, `mood`, `diff`, `report`) ·
`#/b/<id>/slides/<n>` slide n large (← → keys, Esc = grid; check items listed beside it and outlined on the canvas,
one colour per severity; "PNG" shows `out/<id>/slides/NN.png` instead).

Tailwind's preflight is off so the live slides match the export (no CSS reset); `src/index.css` resets the UI chrome only.
