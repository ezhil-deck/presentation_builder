// G7 (docs/P2-spec.md §8): rhythm wins for content surfaces. palette.perKind holds only the kinds the brand names a
// layout for exactly; the G1 `content` expansion applies to it only when the brand gives no rhythm.
import { rule as paletteRule } from '../src/rules/palette.js';
import { rule as logoRule } from '../src/rules/logo.js';
import { rule as compositionRule } from '../src/rules/composition.js';
import { deriveMood } from '../src/index.js';
import { messages, readJson } from './fixtures.js';

const golden = (id) => readJson('..', '..', '..', 'golden', 'expected', id, 'brand-spec.json');
/** Kinds akgmedia names no layout for (no team, steps, timeline, logos, text, table in its brandLayouts). */
const VIA = ['text', 'steps', 'timeline', 'table', 'team', 'logos'];

describe('G7 on the akgmedia BrandSpec (rhythm black, white, white, ultramarine, white, snow, pink, black)', () => {
  const b = golden('akgmedia');
  const res = paletteRule(b);
  const { palette } = res.patch;

  it('the kinds named exactly keep their named surfaces', () => {
    expect(palette.perKind).toEqual({
      cover: 'black',
      agenda: 'white',
      section: 'ultramarine',
      bullets: 'white',
      'two-column': 'white',
      cards: 'white',
      kpi: 'snow',
      chart: 'white',
      'image-text': 'white',
      quote: 'pink',
      cta: 'black',
    });
  });

  it('kinds reached only via content get no perKind entry (they cycle the rhythm)', () => {
    for (const k of VIA) {
      expect(palette.perKind[k]).toBeUndefined();
      expect(res.provenance[`/palette/perKind/${k}`]).toBeUndefined();
    }
    expect(new Set(palette.rhythm)).toEqual(new Set(['black', 'white', 'ultramarine', 'snow', 'pink']));
  });

  it('logo, layoutHints keep the G1 expansion (G7 is palette-only)', () => {
    const hints = compositionRule(golden('akgmedia')).patch.composition.layoutHints;
    for (const k of VIA) expect(hints[k]).toEqual(hints.bullets);
    const hdfc = golden('hdfc-2');
    const logo = logoRule(hdfc).patch.logo.perKind;
    for (const k of VIA) expect(logo[k]).toBe(hdfc.logos.perLayout.content);
  });

  it('the derived Mood validates with the exact-only perKind', () => {
    const mood = deriveMood(golden('akgmedia'));
    for (const k of VIA) expect(mood.palette.perKind[k]).toBeUndefined();
    expect(mood.palette.perKind.quote).toBe('pink');
  });
});

describe('G7 negatives: no rhythm -> the content layout surface is the fallback', () => {
  it('rhythm not given: via-content kinds take the content surface, noted "via content" + no rhythm', () => {
    const b = golden('akgmedia');
    delete b.backgrounds.rhythm;
    const res = paletteRule(b);
    expect(res.patch.palette.rhythm).toEqual([]);
    for (const k of VIA) {
      expect(res.patch.palette.perKind[k]).toBe('white');
      expect(res.provenance[`/palette/perKind/${k}`]).toEqual({
        rule: 'MD-PALETTE',
        from: ['/brandLayouts/3/id', '/brandLayouts/3/surface', '/backgrounds/rhythm'],
        note: expect.stringMatching(/^via content.*no rhythm \(G7\)$/),
      });
    }
    // cover / section / cta / image never fall back to content
    expect(res.patch.palette.perKind.image).toBeUndefined();
  });

  it('a rhythm whose every entry is dropped counts as no rhythm', () => {
    const b = golden('akgmedia');
    b.backgrounds.rhythm = ['nowhere', 'mystery'];
    const res = paletteRule(b);
    expect(res.patch.palette.rhythm).toEqual([]);
    expect(messages(res).filter((m) => /dropped/.test(m))).toHaveLength(2);
    for (const k of VIA) expect(res.patch.palette.perKind[k]).toBe('white');
  });

  it('a rhythm of one entry is still a rhythm (no expansion)', () => {
    const b = golden('akgmedia');
    b.backgrounds.rhythm = ['snow'];
    const res = paletteRule(b);
    expect(res.patch.palette.rhythm).toEqual(['snow']);
    for (const k of VIA) expect(res.patch.palette.perKind[k]).toBeUndefined();
  });
});
