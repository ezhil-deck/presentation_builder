/**
 * S2.a slice 2 (docs/S2-layouts.md): content/2 slides composed onto their own layouts - main + aside, the process
 * shapes, rich item cards, the KPI hero, KPI body / image / trend, points flows - on the stripe and akgmedia golden
 * Moods; the v1 showcase keeps its layouts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { composeDeck, parseMarkdown, parseMarkdownResult, validateDeck } from '../src/index.js';
import { ROOT, showcaseMd } from './helpers.js';

const read = (id, f) => JSON.parse(readFileSync(join(ROOT, 'golden/expected', id, f), 'utf8'));
const BRANDS = ['stripe', 'akgmedia'].map((id) => ({
  id,
  mood: read(id, 'mood.json'),
  brandSpec: read(id, 'brand-spec.json'),
}));
// C4: these slides test the 68 layouts (the catalogue's fallback), so the catalogue layouts are opted out
const compose = (content, b) =>
  composeDeck({
    content,
    mood: b.mood,
    brandSpec: b.brandSpec,
    catalogue,
    engineVersion: '0.0.0',
    options: { catalogue: false },
  });
const sampleMd = () => readFileSync(join(ROOT, 'content/samples/all-blocks.md'), 'utf8');
/** A content/2 deck: a cover first (slide 1 is always a cover), then `slides`. */
const deckOf = (slides) => ({
  schema: 'content/2',
  slides: [{ id: 'cover', title: 'Cover', blocks: [] }, ...slides],
});
/** The fields this slice draws: no content warning may name them any more. */
const IMPLEMENTED =
  /^(items\.(title|icon|image|label)|kpis\.(body|image)|process\.icon|points\.icon) not rendered/;

const H30 = 'Return loads matched en route.'; // 30 characters (process heading range)
const B60 = 'A shipper posts the pickup, drop-off and time window today.'; // 60 characters (process body range)

describe.each(BRANDS.map((b) => [b.id, b]))('content/samples/all-blocks.md on %s', (_id, b) => {
  const { content } = parseMarkdownResult(sampleMd(), { brandSpec: b.brandSpec });
  const { deck, warnings } = compose(content, b);
  const layout = (id) => deck.slides.find((s) => s.id === id).layoutId;

  it('composes to a schema-valid deck with the new layouts picked by the blocks present', () => {
    expect(validateDeck(deck)).toEqual([]);
    expect(
      ['s4', 's7', 's8', ...Array.from({ length: 18 }, (_, i) => `s${26 + i}`)].map((id) => layout(id)),
    ).toEqual([
      'cards',
      'kpi-hero',
      'process-cycle',
      'process-funnel',
      'process-pyramid',
      'process-stack',
      'process-hub',
      'process-ladder',
      'process-quadrant',
      'process-venn',
      'process-tree',
      'process-converge',
      'process-diverge',
      'steps-aside-right',
      'steps-aside-left',
      'chart-aside-below',
      'cards-aside-right',
      'bullets-aside-left',
      'table-aside-right',
      'image-aside-right',
      'bullets-columns',
    ]);
    expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('carries no content warning for the fields this slice draws, and no overflow', () => {
    expect(warnings.filter((w) => w.check === 'content' && IMPLEMENTED.test(w.message))).toEqual([]);
    expect(warnings.filter((w) => w.check === 'content' && /process\.shape/.test(w.message))).toEqual([]);
    expect(warnings.filter((w) => w.check === 'overflow')).toEqual([]);
    // every block of a main + aside slide is bound
    for (const id of ['s36', 's37', 's38', 's39', 's40', 's41', 's42'])
      expect(
        warnings.filter((w) => w.slide === id && w.check === 'binding' && w.severity !== 'info'),
      ).toEqual([]);
  });

  it('draws the shapes from plain geometry only: lines, rects, ellipses, polygons', () => {
    for (const id of Array.from({ length: 10 }, (_, i) => `s${26 + i}`)) {
      const els = deck.slides.find((s) => s.id === id).elements.filter((e) => e.slot === 'steps');
      expect(els.length).toBeGreaterThan(0);
      for (const e of els) {
        expect(['text', 'shape', 'line', 'image']).toContain(e.type);
        if (e.type === 'shape') expect(['rect', 'ellipse', 'polygon']).toContain(e.shape.kind);
      }
    }
    const funnel = deck.slides
      .find((s) => s.id === 's26')
      .elements.filter((e) => e.shape?.kind === 'polygon');
    expect(funnel).toHaveLength(4);
    const venn = deck.slides.find((s) => s.id === 's32').elements.filter((e) => e.shape?.kind === 'ellipse');
    expect(venn).toHaveLength(3);
  });

  it('shows the group headings of two item lists side by side, and the KPI row under the chart with trends', () => {
    const texts = (id) =>
      deck.slides
        .find((s) => s.id === id)
        .elements.filter((e) => e.type === 'text')
        .map((e) => e.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '));
    expect(texts('s39')).toEqual(expect.arrayContaining(['Shippers', 'Carriers']));
    expect(texts('s4')).toContain('Why carriers switch');
    const s38 = deck.slides.find((s) => s.id === 's38').elements;
    expect(s38.filter((e) => e.name === 'trend')).toHaveLength(3);
    expect(s38.some((e) => e.type === 'chart')).toBe(true);
  });
});

describe('fit at the catalogue maximum: heading 30, body 60 characters', () => {
  it.each(BRANDS.map((b) => [b.id, b]))(
    '%s: every shape up to 5 nodes (its range) fits without overflow',
    (_id, b) => {
      const slides = [];
      for (const [shape, r] of Object.entries(catalogue.shapeRanges)) {
        for (let n = r.min; n <= Math.min(r.max, 5); n += 1)
          slides.push({
            id: `${shape}-${n}`,
            title: 'A process at the maximum text',
            blocks: [
              {
                type: 'process',
                shape,
                items: Array.from({ length: n }, () => ({ heading: H30, body: B60 })),
              },
            ],
          });
      }
      const { deck, warnings } = compose(deckOf(slides), b);
      expect(validateDeck(deck)).toEqual([]);
      expect(warnings.filter((w) => w.check === 'overflow').map((w) => `${w.slide} ${w.message}`)).toEqual(
        [],
      );
    },
  );
});

describe('negative: a process shape outside its node count', () => {
  const b = BRANDS[0];
  it.each(Object.keys(catalogue.shapeRanges).filter((s) => s !== 'linear'))(
    '%s with 9 nodes (and 1 node) warns and is drawn as linear steps',
    (shape) => {
      for (const n of [1, 9]) {
        const { deck, warnings } = compose(
          deckOf([
            {
              id: 'p',
              title: 'Too many',
              blocks: [
                {
                  type: 'process',
                  shape,
                  items: Array.from({ length: n }, (_, k) => ({ heading: `Step ${k + 1}` })),
                },
              ],
            },
          ]),
          b,
        );
        const slide = deck.slides[1];
        expect(slide.layoutId).toBe('steps');
        expect(slide.elements.some((e) => e.role === 'connector' || e.shape?.kind === 'polygon')).toBe(false);
        expect(
          warnings.filter((w) => w.slide === 'p' && w.check === 'content').map((w) => w.message),
        ).toContain(
          `process.shape "${shape}" needs ${catalogue.shapeRanges[shape].min === catalogue.shapeRanges[shape].max ? catalogue.shapeRanges[shape].min : `${catalogue.shapeRanges[shape].min}–${catalogue.shapeRanges[shape].max}`} nodes (has ${n}): drawn as linear steps`,
        );
      }
    },
  );

  it('a pinned shape layout the node count does not fit warns and draws linear steps', () => {
    const { deck, warnings } = compose(
      deckOf([
        {
          id: 'q',
          title: 'Pinned',
          layout: 'process-quadrant',
          blocks: [{ type: 'process', items: [{ heading: 'a' }, { heading: 'b' }, { heading: 'c' }] }],
        },
      ]),
      b,
    );
    expect(deck.slides[1].layoutId).toBe('process-quadrant');
    expect(deck.slides[1].elements.some((e) => e.role === 'connector')).toBe(false);
    expect(warnings.map((w) => w.message)).toContain(
      'layout "process-quadrant" needs 4 nodes (has 3): drawn as linear steps',
    );
  });
});

describe('node fields', () => {
  const [stripe, akg] = BRANDS;
  const icon = stripe.mood.components.icon.items[0];

  it('items: a brand icon by name is drawn (container + image); an unknown name is an info and leaves no element', () => {
    const { deck, warnings } = compose(
      deckOf([
        {
          id: 'i',
          title: 'Icons',
          blocks: [
            {
              type: 'items',
              items: [
                { heading: 'Known', body: 'Has an icon of the brand.', icon: icon.name },
                { heading: 'Unknown', body: 'Asks for an icon the brand lacks.', icon: 'no-such-icon' },
              ],
            },
          ],
        },
      ]),
      stripe,
    );
    const els = deck.slides[1].elements;
    const img = els.filter((e) => e.name === 'icon');
    expect(img).toHaveLength(1);
    expect(deck.assets[img[0].image.asset].file).toBe(icon.file);
    expect(els.some((e) => e.name === 'icon container')).toBe(true);
    expect(warnings.filter((w) => w.slide === 'i' && w.check === 'icon').map((w) => w.message)).toEqual([
      'icon "no-such-icon" is not in the brand\'s icon set: not shown',
    ]);
    expect(warnings.filter((w) => w.slide === 'i' && w.check === 'content')).toEqual([]);
  });

  it("items without a resolving icon get sequence numbers when the brand's steps marker carries one; labels sit above the heading", () => {
    const { deck } = compose(
      deckOf([
        {
          id: 'n',
          title: 'Numbers',
          blocks: [
            {
              type: 'items',
              items: [
                { heading: 'First', body: 'One.', label: 'Now' },
                { heading: 'Second', body: 'Two.', label: 'Next' },
              ],
            },
          ],
        },
      ]),
      stripe,
    );
    const els = deck.slides[1].elements;
    const num = els.filter((e) => /-number$/.test(e.id)).map((e) => e.text.paragraphs[0].runs[0].text);
    expect(num).toEqual(['1', '2']);
    const label = els.find((e) => e.id.endsWith('-0-label'));
    const title = els.find((e) => e.id.endsWith('-0-title'));
    expect(label.text.font.role).toBe('eyebrow');
    expect(label.frame.y).toBeLessThan(title.frame.y);
  });

  it('kpis: body under the heading, a single KPI as the hero in the larger of display / stat', () => {
    const { deck } = compose(
      deckOf([
        {
          id: 'k',
          title: 'Two',
          blocks: [
            {
              type: 'kpis',
              items: [
                { value: '4', heading: 'Hubs', body: 'Two opened this year.' },
                { value: '9', heading: 'Lanes', body: 'Three are new.' },
              ],
            },
          ],
        },
        {
          id: 'h',
          title: 'One',
          blocks: [
            { type: 'kpis', items: [{ value: '1.9M', heading: 'Kilometres', body: 'Not driven empty.' }] },
          ],
        },
      ]),
      stripe,
    );
    expect(deck.slides[1].elements.filter((e) => /-body$/.test(e.id))).toHaveLength(2);
    const hero = deck.slides[2];
    expect(hero.layoutId).toBe('kpi-hero');
    const r = stripe.mood.type.roles;
    expect(hero.elements.find((e) => e.id.endsWith('-value')).text.font.role).toBe(
      r.display.size > r.stat.size ? 'display' : 'stat',
    );
  });

  it("kpis with an image: the cell background under an overlay text reads on (bosch: value in the gradient's dense half); a thumbnail when the overlay is too weak (stripe) or absent (akgmedia)", () => {
    const slide = {
      id: 'm',
      title: 'Images',
      blocks: [
        {
          type: 'kpis',
          items: [
            { value: '23%', heading: 'Fewer empty miles', image: 'assets/a.png' },
            { value: '14 d', heading: 'Onboarding', image: 'assets/b.png' },
          ],
        },
      ],
    };
    const bosch = { mood: read('bosch', 'mood.json'), brandSpec: read('bosch', 'brand-spec.json') };
    const s = compose(deckOf([slide]), bosch).deck.slides[1].elements;
    const img = s.find((e) => e.id.endsWith('-0-image'));
    const value = s.find((e) => e.id.endsWith('-0-value'));
    expect(s.some((e) => e.role === 'overlay')).toBe(true);
    // bosch's overlay is a gradient towards the bottom: the KPI text sits in the lower part of the image
    expect(value.frame.y).toBeGreaterThanOrEqual(img.frame.y + img.frame.h / 2);
    expect(value.frame.y + value.frame.h).toBeLessThanOrEqual(img.frame.y + img.frame.h + 0.5);
    for (const b of [stripe, akg]) {
      const r = compose(deckOf([slide]), b);
      const a = r.deck.slides[1].elements;
      const thumb = a.find((e) => e.id.endsWith('-0-image'));
      const av = a.find((e) => e.id.endsWith('-0-value'));
      expect(a.some((e) => e.role === 'overlay')).toBe(false);
      expect(av.frame.y).toBeGreaterThanOrEqual(thumb.frame.y + thumb.frame.h);
    }
    // negative: stripe's overlay (primary at 0.55) leaves no brand text colour at 4.5:1 over a light or dark photo
    const why = compose(deckOf([slide]), stripe).warnings.filter((w) => /thumbnail/.test(w.message));
    expect(why.length).toBeGreaterThan(0);
  });

  it('points: more than six points flow in two columns, column-major, each with the brand bullet glyph', () => {
    const items = Array.from({ length: 8 }, (_, k) => ({ text: `Point ${k + 1}` }));
    const { deck } = compose(
      deckOf([{ id: 'p', title: 'Eight', blocks: [{ type: 'points', items }] }]),
      stripe,
    );
    const s = deck.slides[1];
    expect(s.layoutId).toBe('bullets-columns');
    const text = (k) => s.elements.find((e) => e.id === `p-list-${k}-text`);
    expect(text(1).frame.x).toBe(text(0).frame.x);
    expect(text(4).frame.x).toBeGreaterThan(text(0).frame.x);
    const marker = s.elements.find((e) => e.id === 'p-list-0-marker');
    expect(marker.text.paragraphs[0].runs[0].text).toBe(stripe.mood.type.bullets.glyph);
  });
});

describe('content/1 keeps its layouts', () => {
  it('the v1 showcase picks the default layout of every kind', () => {
    for (const b of BRANDS) {
      const { deck } = compose(parseMarkdown(showcaseMd(), { brandSpec: b.brandSpec }), b);
      for (const s of deck.slides) expect([s.id, s.layoutId]).toEqual([s.id, s.kind]);
    }
  });
});
