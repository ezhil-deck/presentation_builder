# Authored-template pipeline fixtures

These five HTML files are **pipeline fixtures, not the template library**. They exist to prove that
`scripts/template-records.mjs` measures hand-authored templates written in the convention of `docs/TEMPLATES.md`
(1920 x 1080 `.slide` elements, the catalogue's marks, the intent marks `data-role`, `data-need`, `data-treatment`,
`data-template`, `data-option`). Neutral greys, Latin placeholder copy, generic shapes and system faces only; no
brand, no design to copy.

- `cover-device-band.html`: a cover with a device band (a slanted strip), a photo area and a quiet text field.
- `cover-cutout.html`: a cover with a cut-out (a transparent image).
- `section-colour-field.html`: a section break on a colour field.
- `cta.html`: a call to action with a button and a contact line.
- `statement.html`: a statement with a weight run, in a base and a `dark` option.

`records.json` next to them is their measured output (`npm run templates:authored -- packages/templates/__fixtures__/authored
packages/templates/__fixtures__/authored/records.json`); the tests validate it. The questions it carries (an authored role
the rules identify differently) are expected: an authored mark stands only once the owner verifies the record.
