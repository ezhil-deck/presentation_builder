// G1 (docs/P2-spec.md §8): `content` is a category in the brand's layout vocabulary.
import { rule as logoRule } from '../src/rules/logo.js';
import { rule as decorRule } from '../src/rules/decor.js';
import { rule as footerRule } from '../src/rules/footer.js';
import { rule as compositionRule } from '../src/rules/composition.js';
import { rule as paletteRule } from '../src/rules/palette.js';
import { deriveMood } from '../src/index.js';
import { load, readJson } from './fixtures.js';

/** The hdfc-2 golden BrandSpec (12 layout ids: no team, steps, timeline, logos, diagram, text, table). */
const hdfc = () => readJson('..', '..', '..', 'golden', 'expected', 'hdfc-2', 'brand-spec.json');
const VIA = ['text', 'steps', 'timeline', 'table', 'team', 'logos'];

describe('G1 on the hdfc-2 BrandSpec', () => {
  it('logo.perKind: every kind hdfc-2 names no layout for takes perLayout.content, noted "via content"', () => {
    const b = hdfc();
    const res = logoRule(b);
    for (const k of VIA) {
      expect(res.patch.logo.perKind[k]).toBe(b.logos.perLayout.content);
      expect(res.provenance[`/logo/perKind/${k}`]).toEqual({
        rule: 'MD-LOGO',
        from: ['/logos/perLayout/content'],
        note: expect.stringMatching(/^via content/),
      });
    }
    expect(res.patch.logo.perKind.steps).toBe(b.logos.perLayout.content);
    // exact ids keep their own value
    expect(res.patch.logo.perKind.section).toBe('small');
    expect(res.patch.logo.perKind.cta).toBe('large');
  });

  it('decor headerStrip allowedOn includes steps / timeline / team / logos / text', () => {
    const res = decorRule(hdfc());
    const strip = res.patch.decor.elements.find((e) => e.id === 'headerStrip');
    expect(strip.allowedOn).toEqual(expect.arrayContaining(['steps', 'timeline', 'team', 'logos', 'text']));
    expect(res.provenance['/decor/elements/0'].note).toMatch(/allowedOn via content/);
    // an element on cover only gains nothing
    const coverRule = res.patch.decor.elements.find((e) => e.id === 'coverRule');
    expect(coverRule.allowedOn).toEqual(['cover']);
  });

  it('footer hideOn unaffected: cover / section / cta only (content not hidden)', () => {
    expect(footerRule(hdfc()).patch.footer.hideOn).toEqual(['cover', 'section', 'cta']);
  });

  it('layoutHints: via-content kinds take the content layout; palette.perKind does not (G7: hdfc-2 gives a rhythm)', () => {
    const b = hdfc();
    const hints = compositionRule(b).patch.composition.layoutHints;
    for (const k of VIA) expect(hints[k]).toEqual(hints.bullets);
    const pal = paletteRule(b);
    expect(pal.patch.palette.rhythm.length).toBeGreaterThan(0);
    for (const k of VIA) {
      expect(pal.patch.palette.perKind[k]).toBeUndefined();
      expect(pal.provenance[`/palette/perKind/${k}`]).toBeUndefined();
    }
  });

  it('cover / section / cta / image never fall back to content', () => {
    const b = hdfc();
    b.brandLayouts = b.brandLayouts.filter(
      (l) => !['title', 'section', 'closing', 'imageBleed'].includes(l.id),
    );
    b.logos.perLayout = { content: 'small' };
    b.layout.footer.hideOn = ['content'];
    b.composition.openingSequence = [];
    b.composition.closingSequence = [];
    for (const e of b.decor.elements) e.allowedOn = e.allowedOn.filter((id) => id === 'content');
    const perKind = logoRule(b).patch.logo.perKind;
    for (const k of ['cover', 'section', 'cta', 'image']) expect(perKind[k]).toBeUndefined();
    expect(perKind.steps).toBe('small');
    const hideOn = footerRule(b).patch.footer.hideOn;
    expect(hideOn).toEqual(expect.arrayContaining(['bullets', 'steps', 'team']));
    for (const k of ['cover', 'section', 'cta', 'image']) expect(hideOn).not.toContain(k);
  });

  it('the derived Mood validates and carries the expansion', () => {
    const mood = deriveMood(hdfc());
    expect(mood.logo.perKind.timeline).toBe('none');
    expect(mood.palette.perKind.team).toBeUndefined(); // G7: rhythm wins for content surfaces
  });
});

describe('G1 negatives', () => {
  it('a kind the brand names exactly never takes content, even when that map omits it (notion-like: team)', () => {
    const b = load('stripe'); // names team in brandLayouts, perLayout = {title, closing, content}
    const perKind = logoRule(b).patch.logo.perKind;
    expect(perKind.team).toBeUndefined();
    expect(perKind['two-column']).toBeUndefined();
    expect(perKind.steps).toBe('small');
  });

  it('no content entry -> no expansion', () => {
    const b = load('stripe');
    delete b.logos.perLayout.content;
    expect(logoRule(b).patch.logo.perKind).toEqual({ cover: 'large', cta: 'large' });
    b.brandLayouts = b.brandLayouts.filter((l) => l.id !== 'content');
    const pk = paletteRule(b).patch.palette.perKind;
    expect(pk.steps).toBeUndefined();
    expect(compositionRule(b).patch.composition.layoutHints.steps).toBeUndefined();
  });

  it('an element not allowed on content gains nothing', () => {
    const el = decorRule(load('stripe')).patch.decor.elements[0];
    expect(el.allowedOn).toEqual(['section', 'cta']);
  });
});
