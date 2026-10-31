// Small handmade decks / moods for the check tests, and the golden snapshots (golden/expected/<id>/, in git).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const GOLDEN_EXPECTED = join(__dirname, '..', '..', '..', 'golden', 'expected');
export const GOLDEN_BRANDS = join(__dirname, '..', '..', '..', 'golden', 'brands');

export const goldenIds = () =>
  readdirSync(GOLDEN_EXPECTED)
    .filter((id) => existsSync(join(GOLDEN_EXPECTED, id, 'deck.json')))
    .sort();

const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

/** { deck, mood, brandSpec } of a golden brand. */
export const golden = (id) => ({
  deck: readJson(GOLDEN_EXPECTED, id, 'deck.json'),
  mood: readJson(GOLDEN_EXPECTED, id, 'mood.json'),
  brandSpec: readJson(GOLDEN_EXPECTED, id, 'brand-spec.json'),
});

/** A text element at `frame` (fitter output included). */
export function text(id, frame, { color = '#111111', size = 32, weight = 400, role = 'body', ...rest } = {}) {
  return {
    id,
    type: 'text',
    role: rest.boxRole ?? role,
    frame,
    z: rest.z ?? 30,
    text: {
      paragraphs: [{ runs: [{ text: rest.content ?? 'Some text' }] }],
      font: { family: rest.family ?? 'Test Sans', size, weight, lineHeight: 1.2, color, role },
      fit: {
        requestedSize: size,
        appliedSize: size,
        overflow: rest.overflow ?? false,
        steps: 0,
        height: rest.height ?? 40,
      },
      ...(rest.valign ? { valign: rest.valign } : {}),
    },
  };
}

/** A filled rect shape. */
export const rect = (id, frame, fill, extra = {}) => ({
  id,
  type: 'shape',
  role: extra.role ?? 'shape',
  frame,
  z: extra.z ?? 20,
  shape: { kind: 'rect' },
  style: { fill, ...(extra.opacity !== undefined ? { opacity: extra.opacity } : {}) },
});

/** An image element. */
export const image = (id, frame, asset, extra = {}) => ({
  id,
  type: 'image',
  role: extra.role ?? 'image',
  frame,
  z: extra.z ?? 30,
  ...(extra.name ? { name: extra.name } : {}),
  image: { asset, ...(extra.animated ? { animated: extra.animated } : {}) },
});

/** A slide. */
export const slide = (id, elements, { kind = 'text', surfaceId = 'light', background, ...rest } = {}) => ({
  id,
  kind,
  surfaceId,
  background: background ?? { type: 'solid', color: '#FFFFFF' },
  elements,
  ...rest,
});

/** A deck of `slides` with one font family (two weights). */
export const deck = (slides, extra = {}) => ({
  schema: 'deck/1',
  id: 'test-deck',
  engineVersion: '0.3.0',
  canvas: { width: 1920, height: 1080 },
  source: { brandId: 'test' },
  fonts: [
    {
      family: 'Test Sans',
      files: [
        { file: 'fonts/test-400.woff2', weight: '400' },
        { file: 'fonts/test-700.woff2', weight: '700' },
      ],
    },
  ],
  assets: {},
  slides,
  ...extra,
});

/** A Mood fragment with what the checks read. */
export const mood = (extra = {}) => ({
  brandId: 'test',
  geometry: { margins: { top: 80, right: 100, bottom: 80, left: 100 } },
  palette: { surfaces: [{ id: 'light' }, { id: 'dark' }], rhythm: ['light', 'dark'] },
  type: { roles: { body: { size: 32, fit: { min: 24 } }, title: { size: 64, fit: { min: 48 } } } },
  logo: { variants: {}, perKind: {} },
  footer: { show: false },
  ...extra,
});

/** A `files` stub: the listed relative paths exist. */
export const filesOf = (list) => ({ exists: (p) => list.includes(p) });

/** The result of check `id` in a report. */
export const resultOf = (report, id) => report.results.find((r) => r.id === id);
