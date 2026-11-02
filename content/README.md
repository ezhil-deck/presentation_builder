# content/

Decks the Studio (`packages/ui`, docs/PLAN-studio.md) can show besides the showcase (`golden/showcase/showcase.md`).
Every `*.md` here (this README excepted) is listed in the Studio's content switcher; its id is the file name without
`.md`. The grammar is the showcase's: Markdown, one slide per `# ` heading, fenced YAML blocks (decision 14).

`overrides/<contentId>.<brandId>.json` holds a designer's per-slide choices made in the Studio for one deck and one brand
(ST-2): `{ "slides": { "<content slide id>": { "surface"?, "layout"?, "decor"?: false, "logo"?: false } } }`. They are
data beside the content, never edits of the Mood or the content file; the showcase's overrides live here too
(`overrides/showcase.<brandId>.json`).
