# @pb/ui — the review UI (P3-spec §C)

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

`#/` Brands · `#/b/<id>` Brand (Slides) · `#/b/<id>/<tab>` (`slides`, `checks`, `questions`, `mood`, `diff`, `report`) ·
`#/b/<id>/slides/<n>` slide n large (← → keys, Esc = grid; check items listed beside it and outlined on the canvas,
one colour per severity; "PNG" shows `out/<id>/slides/NN.png` instead).

Tailwind's preflight is off so the live slides match the export (no CSS reset); `src/index.css` resets the UI chrome only.
