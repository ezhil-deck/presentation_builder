/**
 * S2.a slice 3 (docs/S2-layouts.md §5–§6): every content/2 field draws as itself - slide keys, chart text and the
 * funnel / waterfall / radar / gauge forms, rich table cells, compare / quotes / people / logos / timeline fields,
 * image treatments and nested KPIs - on the stripe, akgmedia and bosch golden Moods (all 10 for the contrast rule).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { composeDeck, parseMarkdownResult, validateDeck } from '../src/index.js';
import { chartLayout } from '../src/fit/chart.js';
import { contrastRatio, resolve } from '../src/compose/resolve.js';
import { HIGHLIGHT_CONTRAST } from '../src/compose/tableCells.js';
import { ROOT } from './helpers.js';

const read = (id, f) => JSON.parse(readFileSync(join(ROOT, 'golden/expected', id, f), 'utf8'));
const brand = (id) => ({ id, mood: read(id, 'mood.json'), brandSpec: read(id, 'brand-spec.json') });
const BRANDS = ['stripe', 'akgmedia', 'bosch'].map(brand);
const ALL = readdirSync(join(ROOT, 'golden/expected'))
  .filter((id) => existsSync(join(ROOT, 'golden/expected', id, 'mood.json')))
  .sort()
  .map(brand);
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
const deckOf = (slides) => ({
  schema: 'content/2',
  slides: [{ id: 'cover', title: 'Cover', blocks: [] }, ...slides],
});
const one = (slide, b) => {
  const r = compose(deckOf([{ id: 'x', title: 'A slide', ...slide }]), b);
  return { ...r, slide: r.deck.slides[1], mine: r.warnings.filter((w) => w.slide === 'x') };
};
const sampleMd = () => readFileSync(join(ROOT, 'content/samples/all-blocks.md'), 'utf8');
const textOf = (e) => e.text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' | ');
const [stripe, akg, bosch] = BRANDS;

/** Text of n characters (words of 9 letters and a space). */
const chars = (n) =>
  'Logistics '
    .repeat(Math.ceil(n / 10))
    .slice(0, n)
    .trim()
    .padEnd(n, 'x');

describe.each(BRANDS.map((b) => [b.id, b]))('content/samples/all-blocks.md on %s', (_id, b) => {
  const { content } = parseMarkdownResult(sampleMd(), { brandSpec: b.brandSpec });
  const { deck, warnings } = compose(content, b);

  it('composes to a schema-valid deck: no content warning, no overflow, no error', () => {
    expect(validateDeck(deck)).toEqual([]);
    expect(warnings.filter((w) => w.check === 'content')).toEqual([]);
    expect(warnings.filter((w) => w.check === 'overflow').map((w) => `${w.slide} ${w.message}`)).toEqual([]);
    expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('picks the slice 3 layouts for their blocks', () => {
    const at = (id) => deck.slides.find((s) => s.id === id).layoutId;
    expect(['s17', 's21', 's24', 's50', 's53', 's54', 's57'].map(at)).toEqual([
      'quote-grid',
      'compare-tiers',
      'image-collage',
      'compare-columns',
      'image-collage',
      'quote-photo',
      'kpi-nested',
    ]);
  });
});

describe('fit at the catalogue maximum (label 15, subtitle 140, quote 200, bio 120, logo body 90, compare body 145)', () => {
  const slides = [
    {
      id: 'keys',
      label: chars(15),
      subtitle: chars(140),
      blocks: [{ type: 'points', items: [{ text: chars(80) }, { text: chars(80) }] }],
    },
    {
      id: 'quotes',
      label: chars(15),
      blocks: [
        {
          type: 'quotes',
          items: [0, 1, 2].map(() => ({
            text: chars(200),
            name: chars(25),
            role: chars(40),
            label: chars(15),
          })),
        },
      ],
    },
    {
      id: 'people',
      blocks: [
        {
          type: 'people',
          title: chars(40),
          subtitle: chars(100),
          items: Array.from({ length: 6 }, () => ({ name: chars(25), role: chars(40), bio: chars(120) })),
        },
      ],
    },
    {
      id: 'logos',
      blocks: [
        {
          type: 'logos',
          title: chars(15),
          items: [0, 1, 2].map(() => ({ heading: chars(20), body: chars(90) })),
        },
      ],
    },
    {
      id: 'compare',
      blocks: [
        {
          type: 'compare',
          columns: [true, false].map((c) => ({
            header: chars(40),
            label: chars(15),
            items: [0, 1, 2].map(() => ({ heading: chars(40), body: chars(60), check: c })),
          })),
        },
      ],
    },
    {
      id: 'tiers',
      blocks: [
        {
          type: 'compare',
          tiers: true,
          columns: [0, 1, 2].map(() => ({
            header: chars(20),
            label: chars(15),
            price: '€1,900',
            per: chars(20),
            features: [chars(30), chars(30), chars(30)],
          })),
        },
      ],
    },
    {
      id: 'table',
      blocks: [
        {
          type: 'table',
          title: chars(40),
          subtitle: chars(100),
          header: ['Plan', 'Trucks', 'Rating', 'Status', 'Check'],
          rows: [0, 1, 2, 3].map(() => [
            { type: 'heading', text: chars(12) },
            { type: 'number', value: 1900 },
            { type: 'rating', value: 5 },
            { type: 'chip', text: chars(12) },
            true,
          ]),
          highlightColumn: 1,
        },
      ],
    },
    {
      id: 'chart',
      blocks: [
        {
          type: 'chart',
          chartType: 'column',
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [{ name: 'Revenue', values: [1, 2, 3, 4] }],
          text: { title: chars(60), xAxis: chars(20), yAxis: chars(20), source: chars(60) },
        },
      ],
    },
    {
      id: 'nested',
      blocks: [
        {
          type: 'kpis',
          nested: true,
          items: [0, 1, 2].map(() => ({ value: '€420M', heading: chars(30), body: chars(60) })),
        },
      ],
    },
    {
      id: 'timeline',
      blocks: [
        {
          type: 'timeline',
          items: [0, 1, 2, 3].map(() => ({
            when: 'Q4 2027',
            heading: chars(30),
            body: chars(60),
            lines: [chars(30), chars(30)],
          })),
        },
      ],
    },
  ];
  it.each(BRANDS.map((b) => [b.id, b]))('%s: no overflow, no content warning', (_id, b) => {
    const { deck, warnings } = compose(deckOf(slides), b);
    expect(validateDeck(deck)).toEqual([]);
    expect(
      warnings.filter((w) => w.check === 'overflow').map((w) => `${w.slide} ${w.elementId} ${w.message}`),
    ).toEqual([]);
    expect(warnings.filter((w) => w.check === 'content')).toEqual([]);
  });
});

describe('slide keys', () => {
  it('label above the title in the eyebrow role, subtitle under it, the body below both', () => {
    const { slide, mine } = one(
      {
        label: 'Investor update',
        subtitle: 'The line under the title',
        blocks: [{ type: 'paragraph', text: 'Body text.' }],
      },
      stripe,
    );
    const el = (slot) => slide.elements.find((e) => e.slot === slot && e.type === 'text');
    expect(el('label').text.font.role).toBe('eyebrow');
    expect(el('label').frame.y + el('label').frame.h).toBeLessThanOrEqual(el('title').frame.y + 0.5);
    expect(el('subtitle').frame.y).toBeGreaterThanOrEqual(el('title').frame.y + el('title').text.fit.height);
    expect(el('body').frame.y).toBeGreaterThan(el('subtitle').frame.y);
    expect(mine.filter((w) => w.check === 'content')).toEqual([]);
  });

  it('cover: the label hugs a bottom-aligned title without sitting inside its box; the title text stays put', () => {
    const base = one({ kind: 'cover', title: 'Year in review', blocks: [] }, stripe);
    const { slide } = one(
      { kind: 'cover', label: 'Year in review', title: 'Year in review', blocks: [] },
      stripe,
    );
    const el = (sl, slot) => sl.elements.find((e) => e.slot === slot && e.type === 'text');
    const label = el(slide, 'label');
    const title = el(slide, 'title');
    expect(label.frame.y + label.frame.h).toBeLessThanOrEqual(title.frame.y + 0.5);
    // every title line keeps its canvas baseline (frame.y + line.y) from the build without a label
    const baselines = (t) => t.text.lines.map((l) => Math.round(t.frame.y + l.y));
    expect(baselines(title)).toEqual(baselines(el(base.slide, 'title')));
    expect(title.text.valign).toBe('top');
  });

  it('negative: a brand without an eyebrow role drops the label with the existing warning', () => {
    const mood = structuredClone(stripe.mood);
    delete mood.type.roles.eyebrow;
    const { slide, mine } = one(
      { label: 'Investor update', blocks: [{ type: 'paragraph', text: 'Body.' }] },
      { ...stripe, mood },
    );
    expect(slide.elements.some((e) => e.slot === 'label')).toBe(false);
    expect(mine.map((w) => w.message)).toContain(
      'label not rendered on layout "text" until S2.a layouts land',
    );
  });

  it('section number in the stat role above the title; a number on another layout is reported', () => {
    const { slide } = one(
      { kind: 'section', number: '01', subtitle: 'Where the quarter landed', blocks: [] },
      stripe,
    );
    const n = slide.elements.find((e) => e.slot === 'number');
    expect(textOf(n)).toBe('01');
    expect(n.text.font.role).toBe('stat');
    expect(n.frame.y).toBeLessThan(slide.elements.find((e) => e.slot === 'title').frame.y);
    const other = one({ number: '02', blocks: [{ type: 'paragraph', text: 'Body.' }] }, stripe);
    expect(other.mine.map((w) => w.message)).toContain(
      'number not rendered on layout "text" until S2.a layouts land',
    );
  });

  it("background: the image under the brand's overlay, text colours that read on it; no rule → no overlay (info)", () => {
    const s = one(
      { background: 'assets/hero.jpg', blocks: [{ type: 'paragraph', text: 'On the photo.' }] },
      bosch,
    ).slide;
    expect(s.background).toMatchObject({
      type: 'image',
      fit: 'cover',
      overlay: '#000000',
      overlayOpacity: 0.8,
    });
    for (const e of s.elements.filter((x) => x.type === 'text' && x.z === 30))
      expect(contrastRatio(e.text.font.color.slice(0, 7), '#000000')).toBeGreaterThanOrEqual(3);
    const a = one({ background: 'assets/hero.jpg', blocks: [] }, akg);
    expect(a.slide.background.overlay).toBeUndefined();
    expect(a.mine.some((w) => w.check === 'background')).toBe(true);
    // an image block with treatment background is the slide background too
    const t = one(
      { blocks: [{ type: 'image', treatment: 'background', items: [{ src: 'assets/b.jpg' }] }] },
      stripe,
    ).slide;
    expect(t.background.type).toBe('image');
    expect(t.elements.some((e) => e.type === 'image' && e.role === 'image')).toBe(false);
  });

  it("cta: the brand's button (rect + text in the button role and colour); no button component → body text", () => {
    const { slide } = one({ kind: 'cta', cta: 'Book a route review', blocks: [] }, stripe);
    const rect = slide.elements.find((e) => e.name === 'button');
    const t = slide.elements.find((e) => e.slot === 'action' && e.type === 'text');
    expect(rect.style.fill).toBe(stripe.mood.components.button.tokens.fill);
    expect(t.text.font.role).toBe('button');
    expect(t.text.font.color).toBe('#FFFFFF');
    expect(t.frame.x).toBeGreaterThanOrEqual(rect.frame.x);
    expect(t.frame.x + t.frame.w).toBeLessThanOrEqual(rect.frame.x + rect.frame.w + 0.5);
    const mood = structuredClone(stripe.mood);
    delete mood.components.button;
    const plain = one({ kind: 'cta', cta: 'Go', blocks: [] }, { ...stripe, mood }).slide;
    expect(plain.elements.some((e) => e.name === 'button')).toBe(false);
    expect(plain.elements.find((e) => e.slot === 'action').text.font.role).toBe('body');
  });
});

describe('chart geometry of the drawn forms', () => {
  const b = stripe;
  const R = resolve(b.mood, b.mood.palette.surfaces[0]);
  const frame = { x: 0, y: 0, w: 1200, h: 700 };
  const inside = (r, p) =>
    r.x >= p.x - 0.5 && r.y >= p.y - 0.5 && r.x + r.w <= p.x + p.w + 0.5 && r.y + r.h <= p.y + p.h + 0.5;

  it('funnel: one centred bar per category inside the plot, widths ∝ values, narrowing', () => {
    const g = chartLayout(
      {
        type: 'chart',
        chartType: 'funnel',
        categories: ['a', 'b', 'c', 'd'],
        series: [{ name: 's', values: [400, 200, 100, 40] }],
      },
      frame,
      b.mood,
      R,
    );
    expect(g.bars).toHaveLength(4);
    const mid = g.plot.x + g.plot.w / 2;
    for (const bar of g.bars) {
      expect(inside(bar, g.plot)).toBe(true);
      expect(Math.abs(bar.x + bar.w / 2 - mid)).toBeLessThan(1);
    }
    expect(g.bars.map((x) => x.w)).toEqual([...g.bars.map((x) => x.w)].sort((p, q) => q - p));
    expect(g.bars[1].w / g.bars[0].w).toBeCloseTo(0.5, 2);
  });

  it('waterfall: bars float from the running total, inside the plot, joined by connectors; a closing total from 0', () => {
    const g = chartLayout(
      {
        type: 'chart',
        chartType: 'waterfall',
        categories: ['start', 'up', 'down', 'end'],
        series: [{ name: 's', values: [3, 2, -1, 4] }],
      },
      frame,
      b.mood,
      R,
    );
    expect(g.bars).toHaveLength(4);
    for (const bar of g.bars) expect(inside(bar, g.plot)).toBe(true);
    expect(g.connectors).toHaveLength(3);
    // the 'up' bar starts where 'start' ends; 'down' ends lower than it starts; 'end' (= the total) rests on 0
    expect(g.bars[1].y + g.bars[1].h).toBeCloseTo(g.bars[0].y, 1);
    expect(g.bars[3].y + g.bars[3].h).toBeCloseTo(g.bars[0].y + g.bars[0].h, 1);
    for (const c of g.connectors) expect(c.y1).toBe(c.y2);
  });

  it('radar: every series point lies on its spoke at value / scale max of the radius', () => {
    const g = chartLayout(
      {
        type: 'chart',
        chartType: 'radar',
        categories: ['a', 'b', 'c', 'd', 'e'],
        series: [{ name: 's', values: [10, 5, 8, 2, 6] }],
      },
      frame,
      b.mood,
      R,
    );
    const { x: cx, y: cy } = g.center;
    const series = g.polygons.find((p) => p.kind === 'series');
    expect(g.spokes).toHaveLength(5);
    series.points.forEach(([x, y], k) => {
      const s = g.spokes[k];
      // collinear with the centre and the spoke end
      const cross = (s.x2 - cx) * (y - cy) - (s.y2 - cy) * (x - cx);
      expect(Math.abs(cross) / g.radius).toBeLessThan(1);
      expect(Math.hypot(x - cx, y - cy) / g.radius).toBeCloseTo([10, 5, 8, 2, 6][k] / g.scale.max, 2);
    });
    expect(g.polygons.filter((p) => p.kind === 'grid').length).toBeGreaterThan(0);
  });

  it("gauge: a half ring from 9 to 3 o'clock, the value arc at value / max of it", () => {
    const g = chartLayout(
      { type: 'chart', chartType: 'gauge', series: [{ name: 's', values: [77, 100] }], unit: '%' },
      frame,
      b.mood,
      R,
    );
    const [track, value] = g.gaugeArcs;
    expect([track.a0, track.a1]).toEqual([-90, 90]);
    expect(value.a0).toBe(-90);
    expect(value.a1).toBeCloseTo(-90 + 180 * 0.77, 1);
    expect(g.radius).toBeLessThanOrEqual(frame.w / 2);
    expect(g.center.y).toBeLessThanOrEqual(frame.h);
    // without a maximum: 100 for a % unit (warning)
    const warnings = [];
    const g2 = chartLayout(
      { type: 'chart', chartType: 'gauge', series: [{ name: 's', values: [40] }], unit: '%' },
      frame,
      b.mood,
      R,
      { warnings },
    );
    expect(g2.gaugeArcs[1].a1).toBeCloseTo(-18, 1);
    expect(warnings.some((w) => /scale maximum/.test(w.message))).toBe(true);
  });

  it('chart text: title above and source under the chart element, axis titles and legend labels in the geometry; schema-valid forms', () => {
    const { slide } = one(
      {
        blocks: [
          {
            type: 'chart',
            chartType: 'line',
            categories: ['a', 'b', 'c'],
            series: [
              { name: 'x', values: [1, 2, 3] },
              { name: 'y', values: [2, 1, 3] },
            ],
            text: {
              title: 'The title',
              xAxis: 'Weeks',
              yAxis: 'Loads',
              legend: ['Nordics', 'Iberia'],
              source: 'Finance',
            },
          },
        ],
      },
      stripe,
    );
    const chart = slide.elements.find((e) => e.type === 'chart');
    const title = slide.elements.find((e) => e.id.endsWith('-title') && e.slot === 'chart');
    const source = slide.elements.find((e) => e.id.endsWith('-source'));
    expect(textOf(title)).toBe('The title');
    expect(title.frame.y + title.frame.h).toBeLessThanOrEqual(chart.frame.y);
    expect(source.frame.y).toBeGreaterThanOrEqual(chart.frame.y + chart.frame.h);
    expect(source.text.font.role).toBe('caption');
    const labels = chart.chart.geometry.labels.map((l) => l.text);
    expect(labels).toEqual(expect.arrayContaining(['Weeks', 'Loads']));
    expect(chart.chart.geometry.legend.map((l) => l.text)).toEqual(['Nordics', 'Iberia']);
    for (const type of ['funnel', 'waterfall', 'radar', 'gauge']) {
      const r = one(
        {
          blocks: [
            {
              type: 'chart',
              chartType: type,
              categories: ['a', 'b', 'c'],
              series: [{ name: 's', values: [3, 2, 1] }],
            },
          ],
        },
        stripe,
      );
      expect(validateDeck(r.deck)).toEqual([]);
      const c = r.slide.elements.find((e) => e.type === 'chart').chart;
      expect(c.form).toBe(type);
      expect(r.mine.filter((w) => w.check === 'content')).toEqual([]);
    }
  });
});

describe('rich table cells', () => {
  const table = (extra = {}) => ({
    type: 'table',
    header: ['Plan', 'Trucks', 'Check', 'Rating', 'Photo', 'Logo', 'Status'],
    rows: [
      [
        { type: 'heading', text: 'Fleet' },
        { type: 'number', value: 100 },
        true,
        { type: 'rating', value: 4 },
        { type: 'image', src: 'assets/p.png', alt: 'Depot' },
        { type: 'logo', src: 'assets/l.png', alt: 'Partner' },
        { type: 'chip', text: 'Most chosen' },
      ],
      [
        'Starter',
        '10',
        false,
        { type: 'rating', value: 2 },
        { type: 'image', src: 'assets/q.png' },
        { type: 'logo', src: 'assets/m.png' },
        { type: 'chip', text: 'Self-serve' },
      ],
    ],
    ...extra,
  });

  it('each cell type renders as its element: heading / number text, check glyph, dots, thumbnails, chip', () => {
    const { slide } = one({ blocks: [table()] }, stripe);
    const t = slide.elements.find((e) => e.type === 'table').table;
    const els = slide.elements;
    const cell = (r, c) => t.cells[r][c];
    expect(cell(1, 0).font.role).toBe(stripe.mood.tables.header.font);
    expect(cell(1, 1).align).toBe('right');
    expect(cell(1, 2).text).toBe('✓');
    expect(cell(1, 2).font.color).toBe(stripe.mood.palette.surfaces[0].accent);
    expect(cell(2, 2).text).toBe('✗');
    expect(els.filter((e) => e.name === 'rating dot' && e.id.includes('-cell-1-3-'))).toHaveLength(4);
    expect(els.filter((e) => e.name === 'rating dot' && e.id.includes('-cell-2-3-'))).toHaveLength(2);
    expect(els.find((e) => e.id.endsWith('-cell-1-4')).image.fit).toBe('cover');
    expect(els.find((e) => e.id.endsWith('-cell-1-5')).image.fit).toBe('contain');
    expect(els.find((e) => e.id.endsWith('-cell-1-6-chip')).name).toBe('chip');
    expect(textOf(els.find((e) => e.id.endsWith('-cell-1-6')))).toBe('Most chosen');
    // graphic cells leave the native table cell empty and sit over it
    expect(t.rows[0][3]).toBe('');
    for (const e of els.filter((x) => /-cell-/.test(x.id))) expect(e.z).toBe(31);
  });

  it('a brand icon named check / cross draws the check cells', () => {
    const mood = structuredClone(stripe.mood);
    mood.components.icon.items.push(
      { name: 'check', file: 'assets/icons/check.svg' },
      { name: 'cross', file: 'assets/icons/cross.svg' },
    );
    const { slide } = one({ blocks: [table()] }, { ...stripe, mood });
    const icons = slide.elements.filter((e) => e.name === 'icon' && /-cell-/.test(e.id));
    expect(icons).toHaveLength(2);
    expect(slide.elements.find((e) => e.type === 'table').table.cells[1][2].text).toBe('');
  });

  it.each(ALL.map((b) => [b.id, b]))(
    '%s: the highlighted column reads at 4.5:1 or more; title above the table',
    (_id, b) => {
      const { slide } = one({ blocks: [table({ highlightColumn: 1, title: 'Plans', rowHeader: true })] }, b);
      const el = slide.elements.find((e) => e.type === 'table');
      for (const row of el.table.cells) {
        const c = row[1];
        expect(c.fill).toBeDefined();
        const color = (c.font ?? el.table.style.rows.font).color;
        expect(contrastRatio(color.slice(0, 7), c.fill.slice(0, 7))).toBeGreaterThanOrEqual(
          HIGHLIGHT_CONTRAST,
        );
      }
      const title = slide.elements.find((e) => e.id.endsWith('-title') && e.slot === 'table');
      expect(title.frame.y + title.frame.h).toBeLessThanOrEqual(el.frame.y);
    },
  );

  it('negative: more than 8 columns (and rows) → warning, cut to 8', () => {
    const wide = {
      type: 'table',
      header: Array.from({ length: 10 }, (_, k) => `H${k}`),
      rows: Array.from({ length: 9 }, () => Array.from({ length: 10 }, (_, k) => `${k}`)),
    };
    const { slide, mine } = one({ blocks: [wide] }, stripe);
    const t = slide.elements.find((e) => e.type === 'table').table;
    expect(t.colWidths).toHaveLength(8);
    expect(t.rows).toHaveLength(8);
    expect(mine.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        'table has 10 columns: drawn with the first 8',
        'table has 9 rows: drawn with the first 8',
      ]),
    );
  });
});

describe('node fields', () => {
  it('compare: label, banner image and check marks per column; tiers on the card component with the price in stat', () => {
    const { slide } = one(
      {
        blocks: [
          {
            type: 'compare',
            columns: [
              {
                header: 'Before',
                label: 'Then',
                image: 'assets/a.png',
                items: [{ heading: 'Matched', check: false }],
              },
              {
                header: 'After',
                label: 'Now',
                image: 'assets/b.png',
                items: [{ heading: 'Matched', check: true }],
              },
            ],
          },
        ],
      },
      stripe,
    );
    expect(slide.layoutId).toBe('compare-columns');
    const label = slide.elements.find((e) => e.id.endsWith('-0-label'));
    expect(label.text.font.role).toBe('eyebrow');
    expect(slide.elements.find((e) => e.id.endsWith('-0-image')).type).toBe('image');
    const rows = slide.elements.find((e) => e.id.endsWith('-1-text')).text.paragraphs;
    expect(rows[0].bullet.glyph).toBe('✓');
    const tiers = one(
      {
        blocks: [
          {
            type: 'compare',
            tiers: true,
            columns: [
              { header: 'Starter', price: '€290', per: 'a month', features: ['10 trucks'] },
              { header: 'Fleet', price: '€1,900' },
            ],
          },
        ],
      },
      stripe,
    ).slide;
    expect(tiers.layoutId).toBe('compare-tiers');
    expect(tiers.elements.find((e) => e.id.endsWith('-0-price')).text.font.role).toBe('stat');
    expect(tiers.elements.some((e) => e.id.endsWith('-0-bg'))).toBe(true);
  });

  it('quotes: 2–4 as cards with an avatar when any has a photo; a single quote with photo and label', () => {
    const items = [
      { text: 'One quote.', name: 'Ingrid Solberg', role: 'Owner', photo: 'assets/p.png' },
      { text: 'Two quote.', name: 'Tomás Ferreira' },
      { text: 'Three.', name: 'Anke de Vries' },
      { text: 'Four.', name: 'Jonas Weber' },
    ];
    const { slide } = one({ blocks: [{ type: 'quotes', items }] }, stripe);
    expect(slide.layoutId).toBe('quote-grid');
    expect(slide.elements.filter((e) => /-text$/.test(e.id) && e.slot === 'quote')).toHaveLength(4);
    expect(slide.elements.find((e) => e.id.endsWith('-0-photo')).type).toBe('image');
    expect(slide.elements.some((e) => e.id.endsWith('-1-avatar'))).toBe(true);
    const single = one(
      { blocks: [{ type: 'quotes', items: [{ ...items[0], label: 'Customer story' }] }] },
      stripe,
    ).slide;
    expect(single.layoutId).toBe('quote-photo');
    expect(single.elements.find((e) => e.slot === 'quote-photo').type).toBe('image');
    const lab = single.elements.find((e) => e.slot === 'quote-label');
    const q = single.elements.find((e) => e.slot === 'quote');
    // the label sits right above the quote's first line (the quote is centred in its box)
    const top = q.text.valign === 'top' ? q.frame.y : q.frame.y + (q.frame.h - q.text.fit.height) / 2;
    expect(lab.frame.y + lab.frame.h).toBeLessThanOrEqual(top + 0.5);
    expect(top - (lab.frame.y + lab.frame.h)).toBeLessThan(stripe.mood.geometry.spacing.md);
  });

  it('people: title / subtitle above, bio under the role, 9 people in a 3 × 3 grid', () => {
    const { slide, mine } = one(
      {
        blocks: [
          {
            type: 'people',
            title: 'Leadership',
            subtitle: 'Twelve years of freight',
            items: Array.from({ length: 9 }, (_, k) => ({
              name: `Person ${k}`,
              role: 'Role',
              bio: 'Ran dispatch for a fleet.',
            })),
          },
        ],
      },
      stripe,
    );
    expect(textOf(slide.elements.find((e) => e.slot === 'team-heading'))).toBe('Leadership');
    expect(textOf(slide.elements.find((e) => e.slot === 'team-subheading'))).toBe('Twelve years of freight');
    const names = slide.elements.filter((e) => /-name$/.test(e.id));
    expect(names).toHaveLength(9);
    expect(new Set(names.map((e) => e.frame.y)).size).toBe(3);
    expect(slide.elements.filter((e) => /-bio$/.test(e.id))).toHaveLength(9);
    expect(mine.filter((w) => w.check === 'capacity')).toEqual([]);
  });

  it('logos: the title, explicit rows (each centred), logo cards', () => {
    const { slide } = one(
      {
        blocks: [
          {
            type: 'logos',
            title: 'Trusted by',
            items: [
              { name: 'A', row: 0 },
              { name: 'B', row: 0 },
              { name: 'C', row: 0 },
              { name: 'D', row: 1 },
            ],
          },
        ],
      },
      stripe,
    );
    expect(textOf(slide.elements.find((e) => e.slot === 'logos-heading'))).toBe('Trusted by');
    const n = (k) => slide.elements.find((e) => e.id === `x-logos-${k}-name`);
    expect(n(0).frame.y).toBe(n(1).frame.y);
    expect(n(3).frame.y).toBeGreaterThan(n(0).frame.y);
    expect(n(3).frame.x).toBeCloseTo(n(1).frame.x, 0); // the single logo of row 2 sits under the middle of row 1
    const cards = one(
      {
        blocks: [
          {
            type: 'logos',
            items: [
              { heading: 'ISO', body: 'Audited every year.' },
              { heading: 'TAPA', body: 'Secure trucks.' },
            ],
          },
        ],
      },
      stripe,
    ).slide;
    expect(cards.elements.filter((e) => /-body$/.test(e.id))).toHaveLength(2);
  });

  it('timeline: a brand icon as the marker, lines as sub-points under the body', () => {
    const icon = stripe.mood.components.icon.items[0].name;
    const { slide, mine } = one(
      {
        blocks: [
          {
            type: 'timeline',
            items: [
              { when: 'Q1', heading: 'Start', body: 'Pilot.', icon, lines: ['Two terminals'] },
              { when: 'Q2', heading: 'Next', body: 'Rollout.' },
            ],
          },
        ],
      },
      stripe,
    );
    expect(slide.elements.filter((e) => e.name === 'icon')).toHaveLength(1);
    const text = slide.elements.find((e) => e.id === 'x-timeline-0-text').text.paragraphs;
    expect(text.map((p) => p.runs[0].text)).toEqual(['Pilot.', 'Two terminals']);
    expect(text[1].bullet.glyph).toBe(stripe.mood.type.bullets.glyph);
    expect(mine.filter((w) => w.check === 'content')).toEqual([]);
  });

  it('kpis.nested: three nested rings, largest first, each with its value and heading inside', () => {
    const { slide } = one(
      {
        blocks: [
          {
            type: 'kpis',
            nested: true,
            items: [
              { value: '€38B', heading: 'All' },
              { value: '€6B', heading: 'Ours' },
              { value: '€4M', heading: 'Now' },
            ],
          },
        ],
      },
      stripe,
    );
    expect(slide.layoutId).toBe('kpi-nested');
    const rings = slide.elements.filter((e) => e.name === 'nested ring');
    expect(rings.map((r) => r.frame.w)).toEqual([...rings.map((r) => r.frame.w)].sort((p, q) => q - p));
    rings.forEach((r, k) => {
      const v = slide.elements.find((e) => e.id === `x-kpis-${k}-value`);
      expect(v.frame.x).toBeGreaterThanOrEqual(r.frame.x);
      expect(v.frame.x + v.frame.w).toBeLessThanOrEqual(r.frame.x + r.frame.w);
      expect(v.frame.y).toBeGreaterThanOrEqual(r.frame.y);
    });
    // sharp brands draw rects
    expect(
      one(
        { blocks: [{ type: 'kpis', nested: true, items: [{ value: '1' }, { value: '2' }, { value: '3' }] }] },
        akg,
      ).slide.elements.find((e) => e.name === 'nested ring').shape.kind,
    ).toBe('rect');
  });

  it('negative: nested KPIs with 4 nodes fall back to the KPI row with a warning', () => {
    const { slide, mine } = one(
      {
        blocks: [
          { type: 'kpis', nested: true, items: [1, 2, 3, 4].map((k) => ({ value: `${k}`, heading: 'h' })) },
        ],
      },
      stripe,
    );
    expect(slide.layoutId).toBe('kpi');
    expect(slide.elements.some((e) => e.name === 'nested ring')).toBe(false);
    expect(mine.map((w) => w.message)).toContain('kpis.nested needs 3 nodes (has 4): drawn as a KPI row');
  });
});

describe('image treatments', () => {
  const imgs = (n, extra = {}) => ({
    type: 'image',
    ...extra,
    items: Array.from({ length: n }, (_, k) => ({ src: `assets/${k}.png`, caption: `Caption ${k}` })),
  });

  it('collage: 2–4 images on the gutter with captions under them', () => {
    for (const n of [2, 3, 4]) {
      const { slide } = one({ blocks: [imgs(n)] }, stripe);
      expect(slide.layoutId).toBe('image-collage');
      const pics = slide.elements.filter((e) => e.type === 'image' && e.slot === 'image');
      expect(pics).toHaveLength(n);
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) {
          const [a, b] = [pics[i].frame, pics[j].frame];
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
        }
      const caps = slide.elements.filter((e) => /-caption$/.test(e.id));
      expect(caps).toHaveLength(n);
      expect(caps[0].text.font.role).toBe('caption');
    }
  });

  it('negative: a collage of 5 images warns and draws 4', () => {
    const { slide, mine } = one({ blocks: [imgs(5)] }, stripe);
    expect(slide.elements.filter((e) => e.type === 'image' && e.slot === 'image')).toHaveLength(4);
    expect(mine.map((w) => w.message)).toContain('image has 5 images: drawn with the first 4');
  });

  it("device: the brand's border colour frame with the image inset as its screen", () => {
    const { slide } = one({ blocks: [imgs(1, { treatment: 'device' })] }, bosch);
    expect(slide.layoutId).toBe('image-device');
    const dev = slide.elements.find((e) => e.name === 'device frame');
    const screen = slide.elements.find((e) => e.type === 'image' && e.slot === 'image');
    expect(dev.style.fill).toBe(bosch.mood.palette.surfaces[0].border);
    expect(screen.frame.x).toBeGreaterThan(dev.frame.x);
    expect(screen.frame.x + screen.frame.w).toBeLessThan(dev.frame.x + dev.frame.w);
  });
});
