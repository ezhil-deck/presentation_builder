// PR-6 template binding (proposal, docs/P3-proposals.md; compose/templateBind.js): on the golden hdfc-2 brand-spec
// (its V2 capability record, in git) the cover binds the device / photo-area / text-zone template - the device at its
// own canvas box, the photo clipped to the brand's photo area, the tint over it, the text in the text zone clear of
// both, the logo in the brand's box, every element naming its signal. With the proposal off every golden deck is
// byte-identical to the default compose; every PR-6 deck validates.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { composeDeck, normalizeProposals, parseMarkdown, validateDeck } from '../src/index.js';
import { polyXRange } from '../src/compose/templateBind.js';
import { ROOT, goldenShowcaseMd } from './helpers.js';

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const BRANDS = [
  'akgmedia',
  'bosch',
  'cisco',
  'hdfc-2',
  'headspace',
  'notion',
  'rukko',
  'shopify',
  'stripe',
  'the-ken',
];
const golden = (id) => ({
  mood: readJson(`golden/expected/${id}/mood.json`),
  brandSpec: readJson(`golden/expected/${id}/brand-spec.json`),
});
const md = goldenShowcaseMd();
const compose = ({ mood, brandSpec }, proposals, edit) => {
  const content = parseMarkdown(md, { brandSpec });
  if (edit) edit(content);
  return composeDeck({
    content,
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.4.0',
    ...(proposals === undefined ? {} : { proposals }),
  });
};
const PX = (b) => ({
  x: (b.x / 100) * 1920,
  y: (b.y / 100) * 1080,
  w: (b.w / 100) * 1920,
  h: (b.h / 100) * 1080,
});
const capOf = (bs, key) => bs.capabilities.find((c) => c.key === key);

describe('PR-6 on the hdfc-2 cover (fixture: the golden brand-spec with capabilities)', () => {
  const g = golden('hdfc-2');
  const { deck, proposals } = compose(g, { templateBinding: true });
  const s1 = deck.slides[0];
  const el = (id) => s1.elements.find((e) => e.id === id);

  it('binds the device / photo area / text field template and records score and signals', () => {
    expect(s1.source.template).toBe('cover-device-photo-field');
    expect(s1.source.score).toBe(11); // device, photo area, overlay, text zone 2 each; image, logo, field 1
    for (const row of s1.source.binding) {
      expect(['bound', 'left out']).toContain(row.status);
      if (row.status === 'bound') expect(typeof row.signal).toBe('string');
      else expect(typeof row.why).toBe('string');
    }
    expect(proposals.effects).toContainEqual(
      expect.objectContaining({
        proposal: 'PR-6',
        index: 1,
        template: 'cover-device-photo-field',
        score: 11,
      }),
    );
    // every drawn element of the bound slide but the footer names its template element and signal
    for (const e of s1.elements) expect([e.id, typeof e.source?.signal]).toEqual([e.id, 'string']);
  });

  it('the device at its own canvas box, behind, once (placeDecor does not place it again)', () => {
    const dev = el('s1-device-coverBands');
    expect(dev.frame).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(dev.z).toBe(10);
    expect(dev.source.signal).toMatch(/^device:coverBands/);
    expect(s1.elements.filter((e) => e.name === 'coverBands')).toHaveLength(1);
  });

  it('the photo framed by the photo area, clipped to its polygon, under the tint (multiply) and the device', () => {
    const area = capOf(g.brandSpec, 'photo-area').given.layouts[0].polygon;
    const photo = el('s1-photo');
    const maxX = Math.max(...area.map((p) => p[0]));
    expect(photo.frame).toEqual({ x: 0, y: 0, w: Math.round((maxX / 100) * 1920 * 100) / 100, h: 1080 });
    expect(photo.image.clip).toEqual(area.map(([x, y]) => [Math.round((x / maxX) * 1e4) / 1e4, y / 100]));
    expect(photo.source.signal).toMatch(/^image:photo-people \/imagery\/samples\/0/);
    const tint = el('s1-overlay-coverTint');
    expect(tint.image.blend).toBe('multiply');
    expect(photo.z).toBeLessThan(tint.z);
    expect(tint.z).toBeLessThan(el('s1-device-coverBands').z);
    // no text sits on the photo: no text-over-image overlay
    expect(s1.elements.some((e) => e.role === 'overlay')).toBe(false);
    expect(s1.background).toEqual({ type: 'solid', color: '#004B8D' });
    expect(s1.source.backgroundWhy).toMatch(/photo area \+ device/);
  });

  it('the text in the text zone (right, bottom, 42 % W), clear of the photo area and the painted bands', () => {
    const zoneX = 1920 - 85 - 0.42 * 1920;
    const texts = s1.elements.filter((e) => e.type === 'text');
    expect(texts.map((t) => t.slot).sort()).toEqual(['label', 'subtitle', 'title']);
    const bands = capOf(g.brandSpec, 'device:coverBands').measured.geometry.polygons.map((p) =>
      p.map(([x, y]) => [(x / 100) * 1920, (y / 100) * 1080]),
    );
    const area = capOf(g.brandSpec, 'photo-area').given.layouts[0].polygon.map(([x, y]) => [
      (x / 100) * 1920,
      (y / 100) * 1080,
    ]);
    for (const t of texts) {
      expect(t.frame.x).toBeCloseTo(zoneX, 1);
      expect(t.frame.x + t.frame.w).toBeCloseTo(1835, 1);
      expect(t.text.align).toBe('right');
      for (const poly of [...bands, area]) {
        const r = polyXRange(poly, t.frame.y, t.frame.y + t.frame.h);
        if (r) expect(r[1]).toBeLessThan(t.frame.x);
      }
      expect(t.source.template).toMatch(/^o\d+$/);
      expect(t.source.signal).toMatch(/^text-zone /);
    }
    // bottom: the subtitle ends at the content frame's bottom (1080 - margin 100) or above
    const sub = texts.find((t) => t.slot === 'subtitle');
    expect(sub.frame.y + sub.frame.h).toBeLessThanOrEqual(980.01);
  });

  it('the logo in the brand box of the title layout (logo:monoLight placement)', () => {
    const box = capOf(g.brandSpec, 'logo:monoLight').given.placements[0].box;
    const logo = el('s1-logo');
    const want = PX(box);
    for (const k of ['x', 'y', 'w', 'h']) expect(logo.frame[k]).toBeCloseTo(want[k], 1);
    expect(logo.source.signal).toMatch(/^logo:monoLight/);
  });

  it('a pinned template wins: tpl-cover-type-rule draws the brand rule (coverRule) under the title from its keys', () => {
    const pinned = compose(g, { templateBinding: true }, (c) => {
      c.slides[0].layout = 'tpl-cover-type-rule';
    }).deck.slides[0];
    expect(pinned.source.template).toBe('cover-type-rule');
    const rule = pinned.elements.find((e) => e.name === 'coverRule');
    expect(rule).toMatchObject({
      type: 'line',
      frame: { w: 80, h: 5 },
      style: { stroke: { color: '#ED1C24', width: 5 } },
    });
    const title = pinned.elements.find((e) => e.slot === 'title');
    expect(rule.frame.y).toBeGreaterThanOrEqual(title.frame.y + title.text.fit.height - 0.5);
    // align right: the rule ends at the title box's right edge
    expect(rule.frame.x + rule.frame.w).toBeCloseTo(title.frame.x + title.frame.w, 1);
  });

  it('slide 26 (statement + photo): the slide title and the quote label shown in the header; the photo clear of the header strip and the footer', () => {
    const s26 = deck.slides[25];
    expect(s26.source.template).toBe('statement-photo');
    const slots = s26.elements.filter((e) => e.type === 'text' && e.role !== 'footer').map((e) => e.slot);
    expect(slots.sort()).toEqual(['attribution', 'quote', 'quote-label', 'title']);
    expect(s26.warnings?.some((w) => /not shown|not rendered/.test(w.message))).toBeFalsy();
    const photo = s26.elements.find((e) => e.id === 's26-photo');
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const furniture = s26.elements.filter((e) => e.role === 'footer' || e.name === 'headerStrip');
    expect(furniture.length).toBeGreaterThan(0);
    for (const f of furniture) expect([f.id, hit(photo.frame, f.frame)]).toEqual([f.id, false]);
    expect(photo.frame.h).toBeGreaterThanOrEqual(540);
    const row = s26.source.binding.find((r) => r.deckElement === 's26-photo');
    expect(row.why).toMatch(/inset clear of decor headerStrip, the footer/);
  });

  it("no template binds -> today's layout plus an info naming the nearest and its unmet needs (D15)", () => {
    const s25 = deck.slides[24];
    expect(s25.source?.template).toBeUndefined();
    const w = s25.warnings.find((x) => x.check === 'template');
    expect(w).toMatchObject({ severity: 'info' });
    expect(w.message).toMatch(/nearest "statement-[a-z]+".*3 quotes/);
  });
});

describe('PR-6 off: byte-identical decks; on: schema-valid decks', () => {
  // (the default compose = golden/expected/<id>/deck.json is packages/cli golden.test.js, from the brand input)
  it.each(BRANDS)('%s: off (absent, {}, all false, []) = the default compose, byte for byte', (id) => {
    const g = golden(id);
    const base = compose(g);
    const s = JSON.stringify(base.deck);
    for (const off of [{}, normalizeProposals(undefined), [], { templateBinding: false }]) {
      const r = compose(g, off);
      expect(JSON.stringify(r.deck)).toBe(s);
      expect(r.proposals).toBeUndefined();
    }
  });

  it('a brand-spec without capabilities: PR-6 on composes the default deck', () => {
    const g = golden('hdfc-2');
    delete g.brandSpec.capabilities;
    expect(JSON.stringify(compose(g, ['pr6']).deck)).toBe(JSON.stringify(compose(g).deck));
  });

  it.each(BRANDS)('%s: PR-6 on writes a schema-valid deck; every bound element names its signal', (id) => {
    const { deck } = compose(golden(id), ['pr6']);
    expect(validateDeck(deck)).toEqual([]);
    for (const s of deck.slides) {
      if (!s.source?.template) continue;
      for (const e of s.elements)
        if (e.source?.template) expect([e.id, typeof e.source.signal]).toEqual([e.id, 'string']);
    }
  });
});
