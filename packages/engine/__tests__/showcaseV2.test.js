/**
 * S2.b showcase v2 (docs/PLAN-studio.md §3.4, golden/showcase/showcase.md - the golden deck since the owner's approval 2026-11-02): the review deck on the content/2
 * grammar parses with no parse warning, keeps every text inside its design range, and composes on every golden Mood
 * (golden/expected/<id>/mood.json + brand-spec.json) to a schema-valid deck with no overflow and no content warning.
 * Also the S2.b engine rules it relies on (docs/S2-layouts.md §8): taller table rows by the brand's density, three-block
 * slides bound to the main + two asides layouts, the KPI trend mark's room, node text under a card's top strip.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { BLOCKS, SLIDE_FIELDS } from '../src/content/blocks.js';
import { composeDeck, parseMarkdownResult, validateDeck } from '../src/index.js';
import { contrastRatio } from '../src/compose/resolve.js';
import { ROOT } from './helpers.js';

const FILE = join(ROOT, 'golden/showcase/showcase.md');
const md = () => readFileSync(FILE, 'utf8');
const read = (id, f) => JSON.parse(readFileSync(join(ROOT, 'golden/expected', id, f), 'utf8'));
const ALL = readdirSync(join(ROOT, 'golden/expected'))
  .filter((id) => existsSync(join(ROOT, 'golden/expected', id, 'mood.json')))
  .sort()
  .map((id) => ({ id, mood: read(id, 'mood.json'), brandSpec: read(id, 'brand-spec.json') }));
const byId = Object.fromEntries(ALL.map((b) => [b.id, b]));
const compose = (content, b) =>
  composeDeck({ content, mood: b.mood, brandSpec: b.brandSpec, catalogue, engineVersion: '0.0.0' });
const deckOf = (slides) => ({
  schema: 'content/2',
  slides: [{ id: 'cover', title: 'Cover', blocks: [] }, ...slides],
});
const hasTagline = (b) => typeof b.brandSpec.tagline === 'string' && b.brandSpec.tagline !== '';

/** The layout each slide takes (the same on every golden Mood). */
const LAYOUTS = [
  'cover',
  'agenda-rows',
  'section',
  'steps',
  'process-cycle',
  'process-funnel',
  'steps-aside-right',
  'steps-asides-right',
  'cards',
  'cards',
  'bullets',
  'cards',
  'kpi-hero',
  'kpi',
  'kpi',
  'chart',
  'chart',
  'chart',
  'chart',
  'chart-aside-below',
  'chart-aside-below-2',
  'table',
  'compare-columns',
  'compare-tiers',
  'quote-grid',
  'quote-photo',
  'team',
  'timeline',
  'timeline',
  'logos',
  'logos',
  'section',
  'image-collage',
  'steps-aside-left',
  'process-quadrant',
  'process-venn',
  'cards',
  'cta',
];

/** Every text of the document with its design range (BLOCKS / SLIDE_FIELDS): [where, text, {minChars?, maxChars}]. */
function rangedTexts(content) {
  const out = [];
  const add = (where, v, r) => typeof v === 'string' && r && out.push([where, v, r]);
  for (const s of content.slides) {
    for (const [k, r] of Object.entries(SLIDE_FIELDS)) add(`${s.id}.${k}`, s[k], r);
    for (const b of s.blocks) {
      const spec = BLOCKS[b.type];
      if (!spec) continue;
      for (const [k, r] of Object.entries(spec.block ?? {})) add(`${s.id}.${b.type}.${k}`, b[k], r);
      if (b.type === 'paragraph') {
        add(`${s.id}.paragraph`, b.text, spec.fields.text);
        continue;
      }
      (b.type === 'compare' ? b.columns : (b.items ?? [])).forEach((n, i) => {
        for (const [k, r] of Object.entries(spec.fields)) {
          const v = n[k];
          if (Array.isArray(v)) v.forEach((x, j) => add(`${s.id}.${b.type}[${i}].${k}[${j}]`, x, r));
          else add(`${s.id}.${b.type}[${i}].${k}`, v, r);
        }
        for (const [j, it] of (b.type === 'compare' ? (n.items ?? []) : []).entries())
          for (const [k, r] of Object.entries(spec.items))
            add(`${s.id}.compare[${i}].items[${j}].${k}`, it[k], r);
      });
    }
  }
  return out;
}

const outOfRange = (texts) =>
  texts
    .filter(([, v, r]) => v.length > r.maxChars || (r.minChars && v.length < r.minChars))
    .map(([w, v, r]) => `${w}: ${v.length} chars, range ${r.minChars ?? 1}–${r.maxChars}`);

describe('golden/showcase/showcase.md (showcase v2)', () => {
  const { content, warnings } = parseMarkdownResult(md(), { brandSpec: byId.stripe.brandSpec });

  it('parses as content/2 with no parse warning, 38 slides', () => {
    expect(content.schema).toBe('content/2');
    expect(warnings).toEqual([]);
    expect(content.slides).toHaveLength(38);
  });

  it('keeps every text inside its design range (BLOCKS maxChars / minChars, slide title / subtitle / label)', () => {
    const texts = rangedTexts(content);
    expect(texts.length).toBeGreaterThan(150);
    expect(outOfRange(texts)).toEqual([]);
    // negative: the check catches a heading over its range and a body under it
    const broken = structuredClone(content);
    broken.slides[3].blocks[0].items[0].heading = 'x'.repeat(31);
    broken.slides[3].blocks[0].items[1].body = 'Too short.';
    expect(outOfRange(rangedTexts(broken))).toHaveLength(2);
  });

  it('reads as the brand’s own deck: no placeholder voice, no fictional company, brand keys only on the cover and cta', () => {
    const text = md();
    expect(text).not.toMatch(/\bAdd (a|an|your)\b|Lorem|Describe |Explain |Replace /);
    expect(text).not.toMatch(/\b(Larkspur|Inc\.|Ltd\b|GmbH|Corp\b)/);
    const keys = text.match(/\{brand\.(name|tagline)\}/g);
    expect(keys).toEqual(['{brand.name}', '{brand.tagline}', '{brand.name}']);
    // images cycle over the brand's first four samples
    const samples = new Set(text.match(/\{brand\.imagery\.samples\[(\d+)\]\}/g));
    expect([...samples].sort()).toEqual([0, 1, 2, 3].map((n) => `{brand.imagery.samples[${n}]}`));
  });

  it('tells one consistent business story (ARR bridge, customers, quarterly revenue)', () => {
    const text = md();
    // ARR $18.4M + $4.4M new + $4.3M expansion - 5.4 % churn of $18.4M ($1.0M) = $26.1M; growth 42 %; NRR 118 %
    expect(Math.round((18.4 + 4.4 + 4.3 - 0.054 * 18.4) * 10) / 10).toBe(26.1);
    expect(Math.round((26.1 / 18.4 - 1) * 100)).toBe(42);
    expect(Math.round(((18.4 + 4.3 - 0.054 * 18.4) / 18.4) * 100)).toBe(118);
    // the stacked chart's quarters add up to the two KPIs beside it
    const stacked = content.slides.find((s) => s.title === 'Where the new revenue came from');
    const sum = (k) => Math.round(stacked.blocks[0].series[k].values.reduce((a, b) => a + b, 0) * 10) / 10;
    expect([sum(0), sum(1)]).toEqual([4.4, 4.3]);
    // customers by segment add up to the year-end count
    const bar = content.slides.find((s) => s.title === 'Customers by segment').blocks[0];
    expect(bar.series[0].values.reduce((a, b) => a + b, 0)).toBe(1610);
    for (const v of ['$26.1M', '1,610', '118%', '14 days', '42%']) expect(text).toContain(v);
  });
});

describe.each(ALL.map((b) => [b.id, b]))('showcase v2 on the golden Mood %s', (_id, b) => {
  const parsed = parseMarkdownResult(md(), { brandSpec: b.brandSpec });
  const { deck, warnings } = compose(parsed.content, b);

  it('parses with no warning but the dropped tagline of a brand that gives none', () => {
    const expected = hasTagline(b)
      ? []
      : ['slide key "subtitle" dropped: unresolvable placeholder {brand.tagline}'];
    expect(parsed.warnings.map((w) => w.message)).toEqual(expected);
  });

  it('composes to a schema-valid deck: 0 overflow, no content / binding / capacity warning', () => {
    expect(validateDeck(deck)).toEqual([]);
    const msg = (w) => `${w.slide} ${w.check} ${w.message}`;
    expect(warnings.filter((w) => w.check === 'overflow').map(msg)).toEqual([]);
    expect(warnings.filter((w) => w.check === 'content').map(msg)).toEqual([]);
    expect(
      warnings.filter((w) => ['binding', 'capacity'].includes(w.check) && w.severity !== 'info').map(msg),
    ).toEqual([]);
  });

  it('picks the layout planned for each slide', () => {
    expect(deck.slides.map((s) => s.layoutId)).toEqual(LAYOUTS);
  });
});

describe('S2.b engine rules', () => {
  const stripe = byId.stripe;
  const tableSlide = (rows) => ({
    id: 't',
    title: 'Plans',
    blocks: [
      {
        type: 'table',
        header: ['Plan', 'Users', 'Price'],
        rows: Array.from({ length: rows }, (_, k) => [`Plan ${k + 1}`, `${10 * (k + 1)}`, `$${k + 12}`]),
      },
    ],
  });
  const tableOf = (deck) => deck.slides[1].elements.find((e) => e.type === 'table');

  it('a short content/2 table grows its rows to the density row height; a long one fills its frame, never past it', () => {
    const rowHeight = catalogue
      .get('table')
      .build({
        mood: stripe.mood,
        geometry: stripe.mood.geometry,
        summary: { v2: true, blocks: [{ type: 'table', nodes: 3, fields: [] }] },
      })
      .boxes.find((x) => x.id === 'table').table.rowHeight;
    const short = tableOf(compose(deckOf([tableSlide(3)]), stripe).deck);
    expect(short.table.rowHeights.every((h) => h === rowHeight)).toBe(true);
    expect(rowHeight).toBeGreaterThan(stripe.mood.tables.rows.minHeight);
    const long = compose(deckOf([tableSlide(8)]), stripe);
    const t = tableOf(long.deck);
    const total = t.table.rowHeights.reduce((a, h) => a + h, 0);
    expect(total).toBeLessThanOrEqual(t.frame.h + 0.5);
    expect(long.warnings.filter((w) => w.check === 'overflow')).toEqual([]);
  });

  it('negative: a content/1 table keeps its fitted rows (no row height on its box)', () => {
    const { content: v1 } = parseMarkdownResult(
      '# Cover\n\n# Plans\n\n```table\nheader: [Plan, Users]\nrows:\n  - [A, "1"]\n```\n',
      { brandSpec: stripe.brandSpec },
    );
    expect(v1.schema).toBe('content/1');
    const t = tableOf(compose(v1, stripe).deck);
    expect(Math.max(...t.table.rowHeights)).toBeLessThan(80);
  });

  it('a three-block slide binds its main and both asides (no block left without a slot)', () => {
    const slide = {
      id: 'x',
      title: 'Three blocks',
      blocks: [
        {
          type: 'paragraph',
          text: 'A paragraph that explains the process on the left of it in two sentences.',
        },
        {
          type: 'process',
          items: [
            { heading: 'One', body: 'The first step of three.' },
            { heading: 'Two', body: 'The second step of three.' },
            { heading: 'Three', body: 'The third step of three.' },
          ],
        },
        { type: 'points', items: [{ text: 'First point' }, { text: 'Second point' }] },
      ],
    };
    for (const b of ALL) {
      const r = compose(deckOf([slide]), b);
      expect(r.deck.slides[1].layoutId).toBe('steps-asides-right');
      expect(r.warnings.filter((w) => w.check === 'binding' && w.severity !== 'info')).toEqual([]);
      const els = r.deck.slides[1].elements;
      expect(els.some((e) => e.slot === 'aside-1' && e.type === 'text')).toBe(true);
      expect(els.some((e) => e.slot === 'aside-2')).toBe(true);
    }
  });

  it('a KPI trend mark stays inside its KPI cell (the value is fitted beside the mark)', () => {
    const slide = {
      id: 'k',
      title: 'Four',
      blocks: [
        {
          type: 'kpis',
          items: ['$126.4M', '$126.4M', '12,345', '14 days'].map((value) => ({
            value,
            heading: 'A label',
            trend: 'up',
          })),
        },
      ],
    };
    let checked = 0;
    for (const b of ALL) {
      const els = compose(deckOf([slide]), b).deck.slides[1].elements;
      const marks = els.filter((e) => e.id.endsWith('-trend'));
      for (const m of marks) {
        const k = m.id.replace(/-trend$/, '');
        const next = els.find((e) => e.id === `${k.replace(/\d+$/, (n) => String(Number(n) + 1))}-value`);
        if (next) {
          // inside its own cell: the cells are spacing.md apart
          expect(m.frame.x + m.frame.w).toBeLessThanOrEqual(next.frame.x - b.mood.geometry.spacing.md + 0.5);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('text on a content/2 card reads on the card fill, also on an accent surface (bosch logo cards)', () => {
    const b = byId.bosch;
    const { deck } = compose(parseMarkdownResult(md(), { brandSpec: b.brandSpec }).content, b);
    const slide = deck.slides.find(
      (s) => s.layoutId === 'logos' && s.elements.some((e) => /-bg$/.test(e.id)),
    );
    const cards = slide.elements.filter((e) => /-\d+-bg$/.test(e.id) && typeof e.style?.fill === 'string');
    expect(cards.length).toBe(3);
    for (const card of cards) {
      const texts = slide.elements.filter(
        (e) => e.type === 'text' && e.id.startsWith(card.id.replace(/bg$/, '')) && e.text.font.color,
      );
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts)
        expect(
          contrastRatio(t.text.font.color.slice(0, 7), card.style.fill.slice(0, 7)),
        ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('process node text starts under a card top strip (rukko); its colour reads on the slide, not on the strip', () => {
    const slide = {
      id: 'c',
      title: 'Cycle',
      blocks: [
        {
          type: 'process',
          shape: 'cycle',
          items: ['Request', 'Approve', 'Pay', 'Record'].map((heading) => ({
            heading,
            body: 'One short sentence for the node.',
          })),
        },
      ],
    };
    const b = byId.rukko;
    const els = compose(deckOf([slide]), b).deck.slides[1].elements;
    const strip = els.find((e) => e.id === 'c-steps-0-bg-border-top');
    const title = els.find((e) => e.id === 'c-steps-0-title');
    expect(strip).toBeDefined();
    expect(title.frame.y).toBeGreaterThanOrEqual(strip.frame.y + strip.frame.h);
    // rukko's card is flat on the near-black slide: the node text takes the slide's own text colour, not black
    expect(contrastRatio(title.text.font.color.slice(0, 7), '#0B0B0B')).toBeGreaterThanOrEqual(4.5);
  });
});
