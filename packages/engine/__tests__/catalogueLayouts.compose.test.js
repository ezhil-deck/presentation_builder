/**
 * C3 / C4 (docs/PLAN-catalogue.md): the catalogue layouts in compose. By default (C4; C3 needed the option `catalogue`)
 * pick() takes the exact family for each slide of golden/showcase/catalogue-review.md (one slide per plan + five
 * long-band slides), the slide records its catalogue id, and no required slot is left unbound; with the opt-out
 * `catalogue: false` the deck is the one the 68 layouts compose (no catalogue layout, no `source`). C4's matching:
 * every record's own slide, the nearest band, the variety tie-break, year labels, the fallback warning, content/1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { defFromRecord } from '../../layouts/src/catalogue-defs.js';
import {
  MIN_LITERAL_CONTRAST,
  composeDeck,
  contrastRatio,
  inferKind,
  parseMarkdownResult,
  pick,
  summarize,
  validateDeck,
} from '../src/index.js';
import { ROOT } from './helpers.js';

const read = (id, f) => JSON.parse(readFileSync(join(ROOT, 'golden/expected', id, f), 'utf8'));
const md = readFileSync(join(ROOT, 'golden/showcase/catalogue-review.md'), 'utf8');

/** The catalogue slide each review slide is written for (slide 1 is the cover); shared keys noted. */
const WANT = [
  null,
  'L1-3',
  'L2-13',
  'L3-5',
  'L4-3',
  'L5-49',
  'L6-3',
  'L7-3',
  'L8-49',
  'L9-9',
  'L10-14',
  'L11-16',
  'L12-1',
  'L13-3',
  'L14-13',
  'L15-1',
  'L18-13',
  'L19-13',
  'L20-3',
  'L21-7',
  'L22-1',
  'L23-3',
  'L24-7', // shares its key with L28-7: the first in catalogue order wins
  'L25-13',
  'L26-4',
  'L27-1',
  'L24-1', // written for plan 28 (L28-1): the same key as L24-1
  'L29-1',
  'L31-7',
  'L32-7', // shares its key with L22-1: no `lines`, so the plain timeline
  'L33-2',
  'L34-1',
  'L35-1',
  'L36-7',
  'L37-25',
  'L38-3',
  'L2-14',
  'L24-9',
  'L25-20',
  'L31-9',
  'L4-16',
];

describe.each(['stripe', 'bosch', 'headspace'])('the catalogue review deck on %s', (id) => {
  const mood = read(id, 'mood.json');
  const brandSpec = read(id, 'brand-spec.json');
  const { content } = parseMarkdownResult(md, { brandSpec });
  const compose = (options) =>
    composeDeck({
      content,
      mood,
      brandSpec,
      catalogue,
      engineVersion: '0.0.0',
      ...(options ? { options } : {}),
    });
  const on = compose({ catalogue: true });

  it('takes the exact family for every plan slide and records it on the slide', () => {
    expect(content.slides).toHaveLength(41);
    expect(validateDeck(on.deck)).toEqual([]);
    expect(on.catalogue.map((r) => r.catalogue)).toEqual(WANT);
    expect(on.catalogue.filter((r) => r.match === 'family')).toHaveLength(40);
    expect(on.deck.slides.map((s) => s.source?.catalogue ?? null)).toEqual(WANT);
    expect(on.deck.slides[1].layoutId).toBe('cat-l1-3');
  });

  it('leaves no required slot unbound on the exact-family slides', () => {
    const family = new Set(on.catalogue.filter((r) => r.match === 'family').map((r) => r.slide));
    const unbound = on.warnings.filter((w) => family.has(w.slide) && /required slot/.test(w.message));
    expect(unbound).toEqual([]);
  });

  it('composes on the catalogue without any option (C4); `catalogue: true` is the same deck', () => {
    const plain = compose();
    expect(JSON.stringify(plain)).toBe(JSON.stringify(on));
    expect(JSON.stringify(compose({}).deck)).toBe(JSON.stringify(on.deck));
  });

  it('composes the 68 layouts with the opt-out (no catalogue layout, no slide source, no catalogue warning)', () => {
    const off = compose({ catalogue: false });
    expect(off.catalogue).toHaveLength(41);
    expect(off.catalogue.filter((r) => r.layoutId.startsWith('cat-') || r.catalogue)).toEqual([]);
    expect(off.catalogue.every((r) => r.match === 'none')).toBe(true);
    expect(off.deck.slides.some((s) => s.layoutId.startsWith('cat-') || s.source)).toBe(false);
    expect(off.warnings.filter((w) => w.check === 'catalogue')).toEqual([]);
  });
});

describe('pick() and the catalogue option', () => {
  const mood = read('stripe', 'mood.json');
  const brandSpec = read('stripe', 'brand-spec.json');
  const { content } = parseMarkdownResult(md, { brandSpec });
  const slide = content.slides[1];
  const kind = inferKind(slide, { index: 1, count: content.slides.length });
  const summary = summarize(slide, { kind });

  it('picks the exact family by default (C4) and a layout of the 68 with the opt-out', () => {
    expect(kind).toBe('cards');
    expect(pick(kind, summary, mood, catalogue).id).toBe('cat-l1-3');
    expect(pick(kind, summary, mood, catalogue, { options: { catalogue: true } }).id).toBe('cat-l1-3');
    const plain = pick(kind, summary, mood, catalogue, { options: { catalogue: false } });
    expect(plain.id.startsWith('cat-')).toBe(false);
    expect(catalogue.get(plain.id)).toBeDefined();
  });

  it('keeps a pinned layout first, and a pinned catalogue layout works with the opt-out', () => {
    expect(pick(kind, summary, mood, catalogue, { layoutId: 'cards' }).id).toBe('cards');
    expect(pick(kind, summary, mood, catalogue, { layoutId: 'cards', options: { catalogue: true } }).id).toBe(
      'cards',
    );
    expect(
      pick(kind, summary, mood, catalogue, { layoutId: 'cat-l24-7', options: { catalogue: false } }).id,
    ).toBe('cat-l24-7');
  });
});

describe('C3.1: cards, numbers, scale and placement in the composed slides', () => {
  const composeOn = (id) => {
    const mood = read(id, 'mood.json');
    const brandSpec = read(id, 'brand-spec.json');
    const { content } = parseMarkdownResult(md, { brandSpec });
    return {
      mood,
      deck: composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: true } }).deck,
    };
  };
  const stripe = composeOn('stripe');
  const bosch = composeOn('bosch');
  const slideOf = (deck, cat) => deck.slides.find((s) => s.source?.catalogue === cat);

  it('draws the Mood’s card behind a statement and behind each KPI the catalogue sets on cards', () => {
    const statement = slideOf(stripe.deck, 'L34-1');
    const bg = statement.elements.find((e) => e.id.endsWith('-body-bg'));
    expect(bg).toBeDefined();
    const text = statement.elements.find((e) => e.id.endsWith('-body'));
    // the text sits inside the card, in a colour that reads on its fill
    expect(text.frame.x).toBeGreaterThan(bg.frame.x);
    expect(text.text.font.role).toBe('h1');
    const kpis = slideOf(stripe.deck, 'L36-7');
    expect(kpis.elements.filter((e) => /-kpis-\d+-bg$/.test(e.id))).toHaveLength(4);
    // C3.2 (D6): the KPIs the catalogue rules (L25-13) take the card too
    expect(slideOf(stripe.deck, 'L25-13').elements.filter((e) => /-kpis-\d+-bg$/.test(e.id))).toHaveLength(4);
    // a container the catalogue neither rules nor sets on a card gets none (negative): L31-7's numerals, no rule
    expect(slideOf(stripe.deck, 'L31-7').elements.some((e) => /-bg$/.test(e.id))).toBe(false);
  });

  it('numbers items the catalogue numbers when the brand’s marker is a number, not otherwise (negative)', () => {
    // L24-7: four columns under accent numerals; stripe's steps marker is circle-number, bosch's a dot
    const numbers = (deck) =>
      slideOf(deck, 'L24-7').elements.filter((e) => /-cards-\d+-number$/.test(e.id)).length;
    expect(numbers(stripe.deck)).toBe(4);
    expect(numbers(bosch.deck)).toBe(0);
  });

  it('draws the size-band roles, stepped up the ladder to fill the zone, the title larger than its text', () => {
    const s = slideOf(stripe.deck, 'L1-3');
    const role = (re) => s.elements.find((e) => re.test(e.id))?.text.font.role;
    const size = (r) => stripe.mood.type.roles[r].size;
    expect(size(role(/-cards-0-title$/))).toBeGreaterThanOrEqual(size('h2'));
    expect(size(role(/-cards-0-title$/))).toBeGreaterThan(size(role(/-cards-0-text$/)));
    // centred in the zone: the content does not hug the top of a tall cell
    const title = s.elements.find((e) => /-cards-0-title$/.test(e.id));
    const bg = s.elements.find((e) => /-cards-0-bg$/.test(e.id)) ?? null;
    if (bg) expect(title.frame.y - bg.frame.y).toBeGreaterThan(0);
  });
});

describe('C3.2: cards by rule on every block type, numeral zones, process labels', () => {
  const mood = read('stripe', 'mood.json');
  const brandSpec = read('stripe', 'brand-spec.json');
  const { content } = parseMarkdownResult(md, { brandSpec });
  const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5;
  /** One review slide (1-based) composed on the record of `cat`, every container set on the Mood's card. */
  const onCards = (n, cat) => {
    const rec = JSON.parse(JSON.stringify(catalogue.get(`cat-${cat.toLowerCase()}`).record));
    for (const c of rec.containers) if (c.block) Object.assign(c, { card: true, cardSource: 'rule' });
    const def = defFromRecord(rec);
    const cat2 = { ...catalogue, get: (id) => (id === def.id ? def : catalogue.get(id)) };
    const slide = { ...content.slides[n - 1], layout: def.id };
    const c = { ...content, slides: [slide] };
    return composeDeck({ content: c, mood, brandSpec, catalogue: cat2, options: { catalogue: true } }).deck
      .slides[0];
  };

  it.each([
    ['items', 27, 'L24-1'],
    ['points', 22, 'L23-3'],
    ['paragraph', 32, 'L34-1'],
    ['kpis', 24, 'L25-13'],
    ['process (steps)', 29, 'L31-7'],
    ['timeline', 30, 'L32-7'],
    ['compare', 28, 'L29-1'],
  ])(
    'draws the Mood’s card for %s, the text inside its padding in a colour that reads on it',
    (_, n, cat) => {
      const s = onCards(n, cat);
      expect(s.source.catalogue).toBe(cat);
      const cards = s.elements.filter((e) => /-bg$/.test(e.id) && e.type === 'shape');
      expect(cards.length).toBeGreaterThan(0);
      let checked = 0;
      for (const t of s.elements.filter((e) => e.type === 'text' && !/title|footer/.test(e.id))) {
        const card = cards.find((b) => inside(t.frame, b.frame));
        // a number on the brand's marker reads on the marker, not on the card
        const k = /-(\d+)-number$/.exec(t.id)?.[1];
        if (!card || (k && s.elements.some((e) => e.id.endsWith(`-${k}-marker`)))) continue;
        checked += 1;
        expect(t.frame.x).toBeGreaterThan(card.frame.x);
        if (card.style?.fill)
          expect(contrastRatio(t.text.font.color, card.style.fill)).toBeGreaterThanOrEqual(
            MIN_LITERAL_CONTRAST,
          );
      }
      expect(checked).toBeGreaterThan(0);
    },
  );

  it('draws the steps number / the timeline year at the numeral’s size band in its zone (D7)', () => {
    const deck = composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: true } }).deck;
    const slideOf = (cat) => deck.slides.find((s) => s.source?.catalogue === cat);
    const hero = Math.max(mood.type.roles.display.size, mood.type.roles.stat.size);
    const steps = slideOf('L31-7');
    const number = steps.elements.find((e) => /-steps-0-number$/.test(e.id));
    expect(number.text.font.size).toBe(hero);
    const title = steps.elements.find((e) => /-steps-0-title$/.test(e.id));
    expect(title.frame.y).toBeGreaterThan(number.frame.y + number.frame.h);
    const when = slideOf('L32-7').elements.find((e) => /-timeline-0-when$/.test(e.id));
    expect(when.text.font.size).toBeGreaterThan(mood.type.roles.eyebrow.size);
  });

  it('draws a process node’s label in place of its number marker, without the marker shape (D8)', () => {
    const deck = composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: true } }).deck;
    const s = deck.slides.find((x) => x.source?.catalogue === 'L18-13');
    const label = s.elements.find((e) => /-steps-0-label$/.test(e.id));
    expect(label.text.paragraphs[0].runs.map((r) => r.text).join('')).toBe('Now');
    expect(label.source).toEqual(
      expect.objectContaining({ path: expect.stringMatching(/items\/0\/label$/) }),
    );
    expect(s.elements.some((e) => /-steps-\d+-number$/.test(e.id))).toBe(false);
    expect(s.elements.some((e) => /-steps-\d+-marker$/.test(e.id))).toBe(false);
    // the plain build (the 68 layouts) draws the labels too
    const plain = composeDeck({ content, mood, brandSpec, catalogue }).deck.slides[16];
    expect(plain.elements.find((e) => /-steps-1-label$/.test(e.id)).text.paragraphs[0].runs[0].text).toBe(
      '2027',
    );
    // a slide without labels keeps its numbers on the marker (negative)
    const numbered = deck.slides.find((x) => x.source?.catalogue === 'L31-7');
    expect(numbered.elements.some((e) => /-steps-0-number$/.test(e.id))).toBe(true);
    expect(numbered.elements.some((e) => /-steps-0-label$/.test(e.id))).toBe(false);
  });

  it('a label of two characters or fewer sits in the brand’s marker', () => {
    const md2 =
      '---\nschema: content/2\n---\n\n# Deck\n\n# Phases\n\n```process\n- label: Q1\n  heading: Start\n  body: First.\n- label: Q2\n  heading: Grow\n  body: Next.\n- label: Q3\n  heading: Scale\n  body: Then.\n```\n';
    const { content: c } = parseMarkdownResult(md2, { brandSpec });
    // slide 1 is the cover
    const s = composeDeck({ content: c, mood, brandSpec, catalogue }).deck.slides[1];
    const n = s.elements.find((e) => /-steps-0-number$/.test(e.id));
    expect(n.text.paragraphs[0].runs[0].text).toBe('Q1');
    expect(s.elements.some((e) => /-steps-0-marker$/.test(e.id))).toBe(
      String(mood.components?.steps?.tokens?.marker ?? '').startsWith('circle') ||
        String(mood.components?.steps?.tokens?.marker ?? '').startsWith('square'),
    );
  });

  it('a text card hugs its text; a bullet or a role colour keeps to what reads on the card', () => {
    const deckOf = (id) => {
      const m = read(id, 'mood.json');
      const bs = read(id, 'brand-spec.json');
      const { content: c } = parseMarkdownResult(md, { brandSpec: bs });
      return composeDeck({ content: c, mood: m, brandSpec: bs, catalogue, options: { catalogue: true } })
        .deck;
    };
    const slideIn = (deck, cat) => deck.slides.find((x) => x.source?.catalogue === cat);
    // L34-1: the statement's card is its text and padding, not the whole zone
    const st = slideIn(
      composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: true } }).deck,
      'L34-1',
    );
    const bg = st.elements.find((e) => /-body-bg$/.test(e.id));
    const text = st.elements.find((e) => /-body$/.test(e.id));
    expect(bg.frame.h).toBeLessThan(400);
    expect(bg.frame.h).toBeGreaterThanOrEqual(text.text.fit.height);
    expect(text.frame.y).toBeGreaterThanOrEqual(bg.frame.y);
    expect(text.frame.y + text.text.fit.height).toBeLessThanOrEqual(bg.frame.y + bg.frame.h + 0.5);
    // headspace L4-3: a white bullet on a dark slide takes the card's text colour on the white card
    const hs = slideIn(deckOf('headspace'), 'L4-3');
    const listBg = hs.elements.find((e) => /-list-bg$/.test(e.id));
    const list = hs.elements.find((e) => /-list$/.test(e.id));
    for (const p of list.text.paragraphs)
      expect(contrastRatio(p.bullet.color, listBg.style.fill)).toBeGreaterThanOrEqual(MIN_LITERAL_CONTRAST);
    // bosch L25-13: the KPI value keeps the brand's figure colour on the card (it reads on it)
    const bo = slideIn(deckOf('bosch'), 'L25-13');
    const value = bo.elements.find((e) => /-kpis-0-value$/.test(e.id));
    const body = bo.elements.find((e) => /-kpis-0-body$/.test(e.id));
    expect(value.text.font.color).not.toBe(body.text.font.color);
  });

  it('item cards are numbered only where the catalogue numbers them; titles step one rung over their text', () => {
    const deck = composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: true } }).deck;
    const slideIn = (cat) => deck.slides.find((x) => x.source?.catalogue === cat);
    expect(slideIn('L24-7').elements.filter((e) => /-cards-\d+-number$/.test(e.id))).toHaveLength(4);
    // negative: L24-1's columns carry no numeral -> no number on their cards
    expect(slideIn('L24-1').elements.some((e) => /-cards-\d+-number$/.test(e.id))).toBe(false);
    const s = slideIn('L24-7');
    const role = (re) => s.elements.find((e) => re.test(e.id)).text.font.size;
    expect(role(/-cards-0-title$/)).toBeGreaterThan(role(/-cards-0-text$/));
  });
});

describe('C4: matching (the catalogue first, the 68 the fallback)', () => {
  const mood = read('stripe', 'mood.json');
  const brandSpec = read('stripe', 'brand-spec.json');
  const RECORDS = catalogue.list({ catalogue: true }).filter((d) => d.catalogue);
  const mid = (band) => {
    const [a, b] = band.split('-').map(Number);
    return Math.floor((a + b) / 2);
  };
  /** A content/2 summary written for a record: each block at its counts, each field at the middle of its band. */
  const summaryOf = (rec) => {
    const details = rec.containers.some((c) => c.type === 'timeline_with_list');
    const blocks = rec.combination.map((b) => {
      const x = b.bands;
      const chars = {};
      if (b.type === 'points') chars.text = mid(x.bullet);
      else if (b.type === 'paragraph') chars.text = mid(x.paragraph);
      else if (b.type === 'subpoints')
        Object.assign(chars, { heading: mid(x.heading), lines: mid(x.description) });
      else if (b.type === 'compare')
        Object.assign(chars, { header: mid(x.heading), rows: mid(x.description) });
      else if (b.type === 'timeline' && details)
        Object.assign(chars, { heading: mid(x.heading), body: 30, lines: mid(x.description) - 30 });
      else if (['items', 'process', 'timeline'].includes(b.type))
        Object.assign(chars, { heading: mid(x.heading), body: mid(x.description) });
      else if (b.type === 'kpis') {
        chars.value = mid(x.value);
        // value + body KPIs (plans 36-38): content/2 writes the line under the figure as its heading
        if (x.heading) Object.assign(chars, { heading: mid(x.heading), body: mid(x.body) });
        else chars.heading = mid(x.body);
      }
      const fields = Object.keys(chars).filter((k) => !['header', 'rows'].includes(k));
      if (rec.containers.some((c) => c.block === 'process' && c.labels === 'year')) fields.push('label');
      return { type: b.type, nodes: b.nodes, fields: fields.sort(), chars };
    });
    return { v2: true, kind: rec.kind, blocks };
  };
  const sharers = (d) => RECORDS.filter((r) => r.key === d.key);

  it('every record’s own slide picks its family by default, without any option (all 1,077, every plan)', () => {
    const plans = new Set();
    const off = [];
    for (const d of RECORDS) {
      const got = pick(d.kind, summaryOf(d.record), mood, catalogue).id;
      // a key two plans share goes to the first in catalogue order on first use (2 / 14, 24 / 28); the timelines
      // sharing keys (22 / 32) go by the flavour (milestones with `lines`: the timeline with details)
      const timeline = d.record.combination.some((b) => b.type === 'timeline');
      const want = timeline ? d.id : sharers(d)[0].id;
      if (got !== want) off.push(`${d.id}: ${got} (want ${want})`);
      else plans.add(catalogue.get(got).record.plan);
    }
    expect(off).toEqual([]);
    // 35 plans less 28 (every key of it belongs to 24 first); 14 has counts 2 lacks. A second use takes 14 / 28
    // (the variety test below)
    expect(plans.size).toBe(34);
    expect(plans.has(28)).toBe(false);
    expect(plans.has(14)).toBe(true);
  });

  it('a band change picks the next family: the same combination at the nearest band, the longer winning (negative: not the shorter)', () => {
    const items = (heading, body) => ({
      v2: true,
      blocks: [{ type: 'items', nodes: 6, fields: ['body', 'heading'], chars: { heading, body } }],
    });
    expect(pick('cards', items(12, 50), mood, catalogue).id).toBe('cat-l24-13'); // items:6 (1-20, 1-70)
    // a 40-character heading: no record keys items:6 (21-60, 1-70); L24-17 (its description one band longer, 58)
    // beats L24-13 (its heading one band shorter, 57)
    expect(catalogue.get('cat-l24-17').match(items(40, 50))).toBe(58);
    expect(catalogue.get('cat-l24-13').match(items(40, 50))).toBe(57);
    expect(pick('cards', items(40, 50), mood, catalogue).id).toBe('cat-l24-17');
    // equal scores (L24-15 and L24-17, both one band longer): catalogue order
    expect(pick('cards', items(12, 100), mood, catalogue).id).toBe('cat-l24-15');
  });

  it('the variety rule: a key two plans share takes the record used fewer times in the deck', () => {
    const rec = catalogue.get('cat-l2-1');
    const summary = summaryOf(rec.record);
    expect(pick(rec.kind, summary, mood, catalogue).id).toBe('cat-l2-1');
    expect(pick(rec.kind, summary, mood, catalogue, { options: { used: { 'L2-1': 1 } } }).id).toBe(
      'cat-l14-1',
    );
    expect(
      pick(rec.kind, summary, mood, catalogue, {
        options: {
          used: new Map([
            ['L2-1', 1],
            ['L14-1', 1],
          ]),
        },
      }).id,
    ).toBe('cat-l2-1');
    // composed: three slides of that key -> L2-1, L14-1, L2-1; a key only one record has repeats it (negative)
    const md2 = [
      '---',
      'schema: content/2',
      '---',
      '',
      '# Deck',
      ...[1, 2, 3].flatMap((n) => [
        '',
        `# Two items ${n}`,
        '',
        '```items',
        '- heading: First item',
        '  body: One short line for the first item of two.',
        '- heading: Second item',
        '  body: One short line for the second item of two.',
        '```',
        '',
        '```paragraph',
        'A short paragraph under the items.',
        '```',
      ]),
      '',
      '# Chart',
      '',
      '```chart',
      'chartType: bar',
      'categories: [A, B, C]',
      'series:',
      '  - name: S',
      '    values: [1, 2, 3]',
      '```',
      '',
      '# Chart again',
      '',
      '```chart',
      'chartType: bar',
      'categories: [A, B, C]',
      'series:',
      '  - name: S',
      '    values: [3, 2, 1]',
      '```',
      '',
    ].join('\n');
    const { content } = parseMarkdownResult(md2, { brandSpec });
    const r = composeDeck({ content, mood, brandSpec, catalogue });
    expect(r.catalogue.slice(1).map((x) => x.catalogue)).toEqual(['L2-1', 'L14-1', 'L2-1', 'L26-2', 'L26-2']);
    expect(r.catalogue.slice(1, 4).every((x) => x.match === 'family')).toBe(true);
  });

  it('year labels prefer a roadmap record with labels; a process without labels the one without (D8)', () => {
    const md2 = (label) =>
      [
        '---',
        'schema: content/2',
        '---',
        '',
        '# Deck',
        '',
        '# Phases',
        '',
        '```process',
        ...['Plan', 'Build', 'Ship', 'Grow'].flatMap((h, k) => [
          `- ${label ? `label: "${2026 + k}"\n  ` : ''}heading: ${h}`,
          '  body: A description of this phase that runs past seventy characters, so the band is the middle one.',
        ]),
        '```',
        '',
      ].join('\n');
    const slide = (label) => {
      const { content } = parseMarkdownResult(md2(label), { brandSpec });
      return composeDeck({ content, mood, brandSpec, catalogue }).deck.slides[1];
    };
    expect(slide(true).layoutId).toBe('cat-l31-11');
    expect(catalogue.get('cat-l31-11').labels).toBe('year');
    expect(slide(false).layoutId).toBe('cat-l31-9');
    expect(catalogue.get('cat-l31-9').labels).toBeUndefined();
  });

  it('a combination outside the plans falls back to the 68 with a catalogue warning naming the nearest record', () => {
    const { content } = parseMarkdownResult(readFileSync(join(ROOT, 'golden/showcase/showcase.md'), 'utf8'), {
      brandSpec,
    });
    const r = composeDeck({ content, mood, brandSpec, catalogue });
    const notes = (id) =>
      r.warnings.filter((w) => w.check === 'catalogue' && w.slide === id).map((w) => w.message);
    // process + points (main + aside): no plan has it; the nearest is the points record one block away
    const aside = r.deck.slides.find((s) => s.layoutId === 'steps-aside-right');
    expect(notes(aside.id)).toEqual([
      'no catalogue slide for "process:3(heading 1-20,description 1-70)+points:3(bullet 1-70)": nearest L23-4 "points:3(bullet 71-220)" (a bullets layout)',
    ]);
    expect(r.warnings.find((w) => w.check === 'catalogue').severity).toBe('info');
    // blocks no plan has: named as such
    const quotes = r.deck.slides.find((s) => s.layoutId === 'quote-grid');
    expect(notes(quotes.id)).toEqual(['no catalogue slide for "quotes:3": the plans have no quotes block']);
    // negative: a family slide, the cover / section / cta and the shaped processes carry none
    const family = r.catalogue.filter((x) => x.match !== 'none').map((x) => x.slide);
    expect(family.length).toBe(15);
    for (const id of family) expect(notes(id)).toEqual([]);
    for (const s of r.deck.slides.filter(
      (x) => ['cover', 'section', 'cta'].includes(x.kind) || /^process-/.test(x.layoutId),
    ))
      expect(notes(s.id)).toEqual([]);
    // with the opt-out nothing is warned
    const off = composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: false } });
    expect(off.warnings.filter((w) => w.check === 'catalogue')).toEqual([]);
  });

  it('a content/1 deck is unchanged: the same deck with and without the opt-out, no catalogue layout', () => {
    const { content } = parseMarkdownResult(
      readFileSync(join(ROOT, 'golden/showcase/showcase-v1.md'), 'utf8'),
      { brandSpec },
    );
    expect(content.schema).toBe('content/1');
    const on1 = composeDeck({ content, mood, brandSpec, catalogue });
    const off1 = composeDeck({ content, mood, brandSpec, catalogue, options: { catalogue: false } });
    expect(JSON.stringify(on1.deck)).toBe(JSON.stringify(off1.deck));
    expect(on1.catalogue.every((x) => x.match === 'none' && !x.layoutId.startsWith('cat-'))).toBe(true);
    expect(on1.warnings.filter((w) => w.check === 'catalogue')).toEqual([]);
  });
});
