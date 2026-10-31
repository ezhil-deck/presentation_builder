// G9 (docs/P2-spec.md §8): a rhythm step may name a background variant. MD-PALETTE keeps palette.rhythm as surface
// ids and adds palette.rhythmBackgrounds {step → variant id} for the steps that name a variant.
import { rule as paletteRule } from '../src/rules/palette.js';
import { readJson } from './fixtures.js';

const golden = (id) => readJson('..', '..', '..', 'golden', 'expected', id, 'brand-spec.json');

describe('G9 MD-PALETTE rhythmBackgrounds', () => {
  it('hdfc-2 (rhythm cover, default, default, sectionBands, default, default, default, starfield)', () => {
    const b = golden('hdfc-2');
    const res = paletteRule(b);
    const { palette } = res.patch;
    expect(palette.rhythm).toEqual(['blue', 'white', 'white', 'blue', 'white', 'white', 'white', 'deep']);
    expect(palette.rhythmBackgrounds).toEqual({ 0: 'cover', 3: 'sectionBands', 7: 'starfield' });
    expect(res.provenance['/palette/rhythmBackgrounds/0'].from).toEqual([
      '/backgrounds/rhythm/0',
      '/backgrounds/variants/cover',
    ]);
    // the image variants are attached to the surfaces the steps land on
    const surface = (id) => palette.surfaces.find((s) => s.id === id);
    expect(surface('blue').background.cover.type).toBe('image');
    expect(surface('deep').background.starfield.type).toBe('image');
  });

  it('negative: a rhythm of surface ids (akgmedia: variant ids equal to surface ids) records no rhythmBackgrounds', () => {
    for (const id of ['akgmedia', 'stripe', 'rukko']) {
      expect([id, paletteRule(golden(id)).patch.palette.rhythmBackgrounds]).toEqual([id, undefined]);
    }
  });

  it('negative: "default" and unknown entries are never a background step', () => {
    const b = golden('hdfc-2');
    b.backgrounds = { ...b.backgrounds, rhythm: ['default', 'nope', 'cover'] };
    const { palette } = paletteRule(b).patch;
    expect(palette.rhythm).toEqual(['white', 'blue']);
    expect(palette.rhythmBackgrounds).toEqual({ 1: 'cover' });
  });
});
