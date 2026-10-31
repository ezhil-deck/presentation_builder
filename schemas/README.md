# Schemas — the five contracts

```
 input/brand-presentation-spec  ──read──►  brand-spec  ──rules──►  mood ─┐
                                                                          ├─compose+fit─►  deck  ──►  HTML / PDF / PPTX
 content (from Markdown)  ────────────────────────────────────────────────┤
 layout (instances returned by packages/layouts modules, given mood.geometry)┘
```

| file | produced by | consumed by | notes |
|---|---|---|---|
| `input/brand-presentation-spec.schema.json` | upstream authoring (the brand folder) | `packages/brand` | the accepted input; copied from v5's schema as the input format users already produce |
| `brand-spec.schema.json` | `packages/brand` | `packages/mood` | clean data + `provenance` sidecar (pointer → given/derived/answered) + `questions[]` |
| `mood.schema.json` | `packages/mood` | `packages/engine`, `ui` | the ~10 decision groups; `provenance` = rule id + brand pointers |
| `layout.schema.json` | `packages/layouts` (JS, per Mood) | `packages/engine` | boxes with absolute frames + slots with capacity |
| `content.schema.json` | `packages/engine` (Markdown parser) or hand-written | `packages/engine` | brand- and layout-free content blocks |
| `deck.schema.json` | `packages/engine`; edited by `ui` | `renderer`, `export`, `checks` | THE document; fully resolved; text carries fitted lines |

Rules of thumb
- Provenance is a sidecar map keyed by JSON pointer, so data stays clean and diffable.
- Mood tokens reference roles by name (`fill: "card"`); Deck has only literals. The engine resolves.
- Layouts are code that return data: no template language; frames are px on 1920×1080.
- Changing a schema = bump `$id` version + note in `docs/PLAN-draft.md` + a DECISIONS line.
