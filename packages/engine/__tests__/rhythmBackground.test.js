// G9 (docs/P2-spec.md §8): the slide that takes a rhythm step naming a background variant carries that variant's
// background (image / gradient on the variant's surface), not only the surface colour.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  backgroundFor,
  composeDeck,
  createSurfaceState,
  parseMarkdown,
  resolve,
  surfaceFor,
} from '../src/index.js';
import { ROOT, showcaseMd } from './helpers.js';

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const hdfc = () => ({
  mood: readJson('golden/expected/hdfc-2/mood.json'),
  brandSpec: readJson('golden/expected/hdfc-2/brand-spec.json'),
});
const compose = ({ mood, brandSpec }) =>
  composeDeck({ content: parseMarkdown(showcaseMd(), { brandSpec }), mood, brandSpec, catalogue }).deck;

describe('G9 rhythm step → background variant', () => {
  it('hdfc-2: the slide on rhythm step 0 ("cover") gets the cover image on the blue surface', () => {
    const g = hdfc();
    expect(g.mood.palette.rhythmBackgrounds).toEqual({ 0: 'cover', 3: 'sectionBands', 7: 'starfield' });
    const deck = compose(g);
    const s = deck.slides[3];
    expect([s.kind, s.surfaceId]).toEqual(['text', 'blue']);
    expect(s.background.type).toBe('image');
    const cover = g.mood.palette.surfaces.find((x) => x.id === 'blue').background.cover;
    expect(deck.assets[s.background.asset].file).toBe(cover.image);
    // the cover slide (perKind, hint "cover") still has its own image; content slides off the rhythm stay solid
    expect(deck.slides[0].background.type).toBe('image');
    expect(deck.slides[4].background.type).toBe('solid');
  });

  it('negative: without rhythmBackgrounds the same slide is the solid surface colour', () => {
    const g = hdfc();
    delete g.mood.palette.rhythmBackgrounds;
    const s = compose(g).slides[3];
    expect(s.surfaceId).toBe('blue');
    expect(s.background).toEqual({
      type: 'solid',
      color: g.mood.palette.surfaces.find((x) => x.id === 'blue').bg,
    });
  });

  it('surfaceFor records the rhythm step it took (null off the rhythm); a hint variant on the surface wins', () => {
    const { mood } = hdfc();
    const state = createSurfaceState();
    const first = surfaceFor(0, { kind: 'text' }, mood, state);
    expect([first.id, state.step]).toEqual(['blue', 0]);
    surfaceFor(1, { kind: 'cover' }, mood, state);
    expect(state.step).toBeNull();
    const R = resolve(mood, first);
    const assets = { add: (f) => `id:${f}` };
    expect(backgroundFor(['text'], first, mood, R, assets, { rhythmStep: 0 }).asset).toBe(
      `id:${first.background.cover.image}`,
    );
    // hint names "hero" (also an image on blue): the hint wins over the rhythm step's variant
    const hinted = { ...mood, composition: { layoutHints: { text: { background: 'hero' } } } };
    expect(backgroundFor(['text'], first, hinted, R, assets, { rhythmStep: 0 }).asset).toBe(
      `id:${first.background.hero.image}`,
    );
    // no rhythm step → solid
    expect(backgroundFor(['text'], first, mood, R, assets).type).toBe('solid');
  });
});
