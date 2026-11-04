import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  BLOCK_TYPES,
  bindSlots,
  cellText,
  composeDeck,
  lowerSlide,
  normalizeKind,
  parseMarkdown,
  parseMarkdownResult,
  summarize,
  upgradeContent,
  validateContent,
  validateDeck,
} from '../src/index.js';
import { ROOT, showcaseMd, stripeBrandSpec, stripeMood } from './helpers.js';

const mood = stripeMood();
const brandSpec = stripeBrandSpec();
const compose = (content, options) =>
  composeDeck({
    content,
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
    ...(options ? { options } : {}),
  });
const sampleMd = () => readFileSync(join(ROOT, 'content/samples/all-blocks.md'), 'utf8');

describe('content/2: content/samples/all-blocks.md on the stripe golden Mood', () => {
  const { content, warnings: parseWarnings } = parseMarkdownResult(sampleMd(), { brandSpec });
  const { deck, warnings } = compose(content);

  it('parses to a valid content/2 document using all 14 block types, with no parse warnings', () => {
    expect(content.schema).toBe('content/2');
    expect(validateContent(content)).toEqual([]);
    const used = new Set(content.slides.flatMap((s) => s.blocks.map((b) => b.type)));
    expect([...used].sort()).toEqual([...BLOCK_TYPES].sort());
    expect(parseWarnings).toEqual([]);
  });

  it('composes to a schema-valid deck on the expected kinds (the aliases)', () => {
    expect(validateDeck(deck)).toEqual([]);
    expect(deck.slides.map((s) => `${s.id} ${s.kind}`)).toEqual([
      's1 cover',
      's2 agenda',
      's3 section',
      's4 cards',
      's5 cards',
      's6 kpi',
      's7 kpi',
      's8 steps',
      's9 steps',
      's10 timeline',
      's11 chart',
      's12 chart',
      's13 chart',
      's14 chart',
      's15 chart',
      's16 table',
      's17 quote',
      's18 team',
      's19 logos',
      's20 two-column',
      's21 two-column',
      's22 text',
      's23 image-text',
      's24 image',
      's25 quote',
      's26 steps',
      's27 steps',
      's28 steps',
      's29 steps',
      's30 steps',
      's31 steps',
      's32 steps',
      's33 steps',
      's34 steps',
      's35 steps',
      's36 steps',
      's37 steps',
      's38 kpi',
      's39 cards',
      's40 bullets',
      's41 table',
      's42 cards',
      's43 bullets',
      's44 chart',
      's45 chart',
      's46 chart',
      's47 chart',
      's48 table',
      's49 table',
      's50 two-column',
      's51 image-text',
      's52 section',
      's53 image',
      's54 quote',
      's55 logos',
      's56 timeline',
      's57 kpi',
      's58 bullets',
      's59 cta',
    ]);
    for (const s of deck.slides) expect([s.id, s.elements.length > 0]).toEqual([s.id, true]);
  });

  it('draws every field it carries: no content warning is left (S2.a slice 3)', () => {
    expect(warnings.filter((w) => w.check === 'content').map((w) => `${w.slide} ${w.message}`)).toEqual([]);
    expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('renders the content: subpoint lines, check cells, tiers, the CTA, stacked% shares, the funnel form', () => {
    const texts = (id) =>
      deck.slides
        .find((s) => s.id === id)
        .elements.filter((e) => e.type === 'text')
        .map((e) => e.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' | '));
    expect(texts('s5')).toContain('Two new cold-chain partners\nNight routes up 18%\nOslo hub at capacity');
    const table = deck.slides.find((s) => s.id === 's16').elements.find((e) => e.type === 'table').table;
    expect(table.cells[1].map((c) => c.text)).toEqual(['Load matching', '✓', '✓', '✓']);
    expect(table.cells[2].map((c) => c.text)).toEqual(['Same-day settlement', '✗', '✓', '✓']);
    expect(texts('s21')).toEqual(expect.arrayContaining(['€1,900', 'per month', 'Most chosen']));
    expect(texts('s59')).toContain('Book a route review');
    const stacked = deck.slides.find((s) => s.id === 's14').elements.find((e) => e.type === 'chart').chart;
    expect(stacked.chartType).toBe('stackedBar');
    const funnel = deck.slides.find((s) => s.id === 's15').elements.find((e) => e.type === 'chart').chart;
    expect([funnel.chartType, funnel.form]).toEqual(['bar', 'funnel']);
    const bar = deck.slides.find((s) => s.id === 's12').elements.find((e) => e.type === 'chart').chart;
    expect(bar.chartType).toBe('bar');
  });
});

describe('aliases keep content/1 decks unchanged', () => {
  const v1 = parseMarkdown(showcaseMd(), { brandSpec });
  const { deck: d1, warnings: w1 } = compose(v1);

  it('the showcase upgraded to content/2 composes to the same slides as the content/1 showcase', () => {
    const { content: v2 } = upgradeContent(v1);
    // C4: a content/2 slide takes a catalogue layout by default; the upgrade equivalence holds on the 68 (opted out)
    const { deck: d2, warnings: w2 } = compose(v2, { catalogue: false });
    expect(validateDeck(d2)).toEqual([]);
    // only the content hash (deck id / source) differs: every slide, element and warning is the same - except the
    // table's row heights: a content/2 table grows its rows to the brand's density row height (S2.b, docs/S2-layouts.md
    // §8), with the same cells, columns and text
    const isTable = (s) => s.elements.some((e) => e.type === 'table');
    // (and the text sources, P4.2: they point into each document - `/blocks/0/text` in content/1, `/title` in 2)
    const noSource = (slides) =>
      JSON.parse(JSON.stringify(slides, (k, v) => (k === 'source' && v?.path ? undefined : v)));
    expect(noSource(d2.slides.filter((s) => !isTable(s)))).toEqual(
      noSource(d1.slides.filter((s) => !isTable(s))),
    );
    const tables = (d) => d.slides.flatMap((s) => s.elements.filter((e) => e.type === 'table'));
    const [t1, t2] = [tables(d1), tables(d2)];
    expect(t2.map((e) => [e.frame, e.table.colWidths, e.table.rows])).toEqual(
      t1.map((e) => [e.frame, e.table.colWidths, e.table.rows]),
    );
    t2.forEach((e, k) =>
      e.table.rowHeights.forEach((h, r) => expect(h).toBeGreaterThanOrEqual(t1[k].table.rowHeights[r])),
    );
    expect(w2).toEqual(w1);
    expect(d2.id).not.toBe(d1.id);
  });

  it('summarize / bindSlots see a content/1 slide unchanged', () => {
    for (const s of v1.slides) {
      expect(lowerSlide(s).slide).toBe(s);
      expect(lowerSlide(s).notes).toEqual([]);
    }
    const s = v1.slides[10];
    const layout = catalogue
      .forKind('kpi')[0]
      .build({ mood, geometry: mood.geometry, summary: summarize(s) });
    const out = [];
    bindSlots(s, layout, { warn: (...a) => out.push(a) });
    expect(out).toEqual([]);
  });
});

describe('the engine never throws on a valid content/2 document', () => {
  const all = {
    schema: 'content/2',
    slides: [
      {
        id: 'everything',
        title: 'Every block on one slide',
        label: 'L',
        subtitle: 'S',
        number: '01',
        background: 'assets/none.png',
        cta: 'Go',
        blocks: [
          { type: 'points', items: [{ text: 'a', icon: 'x', children: [{ text: 'b' }] }] },
          {
            type: 'items',
            title: 'T',
            items: [{ heading: 'h', body: 'b', icon: 'i', image: 'p.png', label: 'l' }],
          },
          { type: 'subpoints', items: [{ heading: 'h', lines: ['a', 'b'] }] },
          {
            type: 'kpis',
            nested: true,
            items: [{ value: '1', heading: 'h', body: 'b', image: 'i', trend: 'up' }],
          },
          { type: 'process', shape: 'venn', items: [{ heading: 'a', icon: 'i' }] },
          { type: 'timeline', items: [{ heading: 'a', lines: ['x'], icon: 'i' }] },
          {
            type: 'chart',
            chartType: 'radar',
            series: [{ name: 's', values: [1, 2] }],
            text: { title: 't' },
          },
          {
            type: 'table',
            title: 't',
            header: [{ type: 'heading', text: 'H' }, 'B'],
            rows: [
              [
                { type: 'logo', src: 'l.png', alt: 'Logo' },
                { type: 'rating', value: 4 },
              ],
            ],
            highlightColumn: 0,
          },
          { type: 'quotes', items: [{ text: 'q', photo: 'p.png', label: 'l' }, { text: 'r' }] },
          { type: 'people', title: 't', items: [{ name: 'A B', bio: 'b' }] },
          { type: 'logos', title: 't', items: [{ heading: 'H', body: 'b', row: 0 }] },
          {
            type: 'compare',
            tiers: true,
            columns: [
              { header: 'A', price: '€1' },
              { header: 'B', image: 'x.png' },
            ],
          },
          { type: 'paragraph', text: 'p' },
          { type: 'image', treatment: 'device', items: [{ src: 'a.png', caption: 'c' }, { src: 'b.png' }] },
        ],
      },
      ...BLOCK_TYPES.map((type) => ({ id: `only-${type}`, kind: type, blocks: [] })),
      { id: 'empty', blocks: [] },
    ],
  };

  it('composes a slide with all 14 blocks, each block type as a kind hint, and an empty slide', () => {
    expect(validateContent(all)).toEqual([]);
    let result;
    expect(() => {
      result = compose(all);
    }).not.toThrow();
    expect(validateDeck(result.deck)).toEqual([]);
    const msgs = result.warnings.filter((w) => w.slide === 'everything').map((w) => w.message);
    for (const gone of ['background', 'chart type radar', 'table.logo', 'image.treatment', 'label'])
      expect(msgs.filter((m) => m.startsWith(gone))).toEqual([]);
    expect(msgs).toEqual(
      expect.arrayContaining([
        // a cover shows no section number and no button: still reported (docs/S2-layouts.md §6)
        'number not rendered on layout "cover" until S2.a layouts land',
        'cta not rendered on layout "cover" until S2.a layouts land',
        'process.shape "venn" needs 2–3 nodes (has 1): drawn as linear steps',
        'kpis.nested needs 3 nodes (has 1): drawn as a KPI row',
      ]),
    );
  });

  it("block types as kind hints resolve to today's kinds", () => {
    expect(BLOCK_TYPES.map((t) => normalizeKind(t).kind)).toEqual([
      'bullets',
      'cards',
      'cards',
      'kpi',
      'steps',
      'timeline',
      'chart',
      'table',
      'quote',
      'team',
      'logos',
      'two-column',
      'text',
      'image',
    ]);
  });

  it('cellText renders rich cells as their text', () => {
    expect(cellText({ type: 'check', value: true })).toBe('✓');
    expect(cellText({ type: 'check', value: false })).toBe('✗');
    expect(cellText(true)).toBe('✓');
    expect(cellText({ type: 'number', value: 12.5 })).toBe('12.5');
    expect(cellText({ type: 'chip', text: 'Beta' })).toBe('Beta');
    expect(cellText('x')).toBe('x');
  });
});
