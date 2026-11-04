/**
 * C3 (docs/PLAN-catalogue.md): the catalogue layout generator (scripts/catalogue-layouts.mjs) on real geometry records
 * (L1-1, L8-13, L35-1) with exact zones / grid / flow, the checked-in data file is current, and the loader
 * (catalogue-defs.js) rejects a malformed record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRecords,
  cardSource,
  layoutRecord,
  measureGrid,
  numeralZone,
  placement,
  roleFor,
  snapGrid,
  specBands,
  yearLabel,
} from '../../../scripts/catalogue-layouts.mjs';
import { catalogueDefs, defFromRecord, recordProblems } from '../src/catalogue-defs.js';
import { REPO } from './helpers.js';

const read = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));
const index = read('golden/catalogue/index.json');
const geometry = read('golden/catalogue/geometry.json');
const data = read('packages/layouts/data/catalogue-layouts.json');
const GRID = { columns: 12, gutter: 32 };
const record = (id) =>
  layoutRecord(
    index.slides.find((s) => s.id === id),
    geometry.slides[id],
    GRID,
  );
const brief = (c) => ({
  c: c.c,
  block: c.block,
  zone: c.zone,
  grid: c.grid,
  flow: c.flow,
  card: c.card,
  fields: c.fields.map((f) => `${f.f}:${f.role}`),
});

describe('the generator on real geometry', () => {
  it('L1-1: two cards in the left eight columns, a bullet column in the right four', () => {
    const r = record('L1-1');
    expect(r).toEqual(
      expect.objectContaining({
        id: 'cat-l1-1',
        catalogue: 'L1-1',
        plan: 1,
        key: 'items:2(heading 1-20,description 1-70)+points:2(bullet 1-70)',
        kind: 'cards',
        kinds: ['cards', 'bullets'],
        group: { y: 0.1979, h: 0.6305 },
      }),
    );
    expect(r.combination).toEqual([
      { type: 'items', nodes: 2, bands: { heading: '1-20', description: '1-70' } },
      { type: 'points', nodes: 2, bands: { bullet: '1-70' } },
    ]);
    expect(r.containers.map(brief)).toEqual([
      {
        c: 1,
        block: 'items',
        zone: { x: 0, y: 0.1979, w: 0.6613, h: 0.6305 },
        grid: { col: 0, span: 8 },
        flow: { direction: 'row', columns: 2, rows: 1 },
        card: true,
        fields: ['heading:h2', 'description:body'],
      },
      {
        c: 2,
        block: 'points',
        zone: { x: 0.6769, y: 0.1979, w: 0.3231, h: 0.6305 },
        grid: { col: 8, span: 4 },
        flow: { direction: 'column', columns: 1, rows: 2 },
        card: false,
        fields: ['bullet:body'],
      },
    ]);
    // the heading's box in the first card (fractions of the card)
    expect(r.containers[0].fields[0]).toEqual({
      f: 'heading',
      role: 'h2',
      align: 'left',
      lines: 1,
      box: { x: 0.0693, y: 0.5395, w: 0.8614, h: 0.1209 },
    });
  });

  it('L8-13: KPIs flank the chart, so they keep their own cells on the grid', () => {
    const r = record('L8-13');
    expect(r.key).toBe('chart:2+kpis:2(value 1-6,heading 1-20,body 1-70)');
    expect([r.kind, r.kinds]).toEqual(['kpi', ['kpi', 'chart']]);
    expect(r.containers.map(brief)).toEqual([
      {
        c: 1,
        block: 'chart',
        zone: { x: 0.3785, y: 0.2097, w: 0.3018, h: 0.607 },
        grid: { col: 4, span: 4 },
        flow: { direction: 'row', columns: 2, rows: 1 },
        card: false,
        fields: ['point:body'],
      },
      {
        c: 2,
        block: 'kpis',
        zone: { x: 0, y: 0.2097, w: 1, h: 0.5645 },
        grid: { col: 0, span: 12 },
        flow: {
          direction: 'row',
          columns: 2,
          rows: 1,
          cells: [
            { col: 0, span: 4, y: 0, h: 1 },
            { col: 8, span: 4, y: 0, h: 1 },
          ],
        },
        // C3.2 (D6): the catalogue rules the KPIs (their cards come from the rule)
        card: true,
        fields: ['value:display', 'heading:h3', 'body:body'],
      },
    ]);
  });

  it('L35-1: the title is the only container - no block, no slot, key "title"', () => {
    const r = record('L35-1');
    expect(r.combination).toEqual([]);
    expect([r.key, r.kind, r.kinds]).toEqual(['title', 'text', ['text']]);
    expect(r.containers).toHaveLength(1);
    expect(r.containers[0]).toEqual(expect.objectContaining({ type: 'title', block: null, fields: [] }));
  });

  it('measures a 12-column grid with a 32 px gutter, and the checked-in file is current', () => {
    const plan = index.slides.filter((s) => s.section === 'plan');
    const grid = measureGrid(plan.map((s) => geometry.slides[s.id]));
    expect([grid.columns, grid.gutter]).toEqual([12, 32]);
    const built = buildRecords(index, geometry);
    expect(built.records).toHaveLength(1077);
    expect(built.grid).toEqual(data.grid);
    expect(built.roles).toEqual(data.roles);
    expect(built.records).toEqual(data.records);
  });

  it('snaps edges and sizes to the rules', () => {
    expect(snapGrid(0, 577, 1786, 32)).toEqual({ col: 0, span: 4 });
    expect(snapGrid(1212, 574, 1786, 32)).toEqual({ col: 8, span: 4 });
    expect(['heading', 'value', 'description', 'paragraph', 'label'].map((f) => roleFor(f, 90))).toEqual([
      'display',
      'display',
      'display',
      'display',
      'eyebrow',
    ]);
    // C3.1: at least the slide title's size -> the title's scale (h1; a figure: stat)
    expect([
      roleFor('paragraph', 64),
      roleFor('value', 60),
      roleFor('heading', 56.23),
      roleFor('heading', 56),
    ]).toEqual(['h1', 'stat', 'h1', 'h2']);
    expect([
      roleFor('heading', 50),
      roleFor('heading', 30),
      roleFor('body', 30),
      roleFor('body', 27),
    ]).toEqual(['h2', 'h3', 'body', 'bodySmall']);
  });

  it('records placement, numbered items and the text-only share of card containers (C3.1)', () => {
    expect(placement({ y: 0, h: 100 }, { y: 0, h: 95 })).toEqual({ align: 'fill', empty: 0.05 });
    expect(placement({ y: 0, h: 100 }, { y: 0, h: 50 })).toEqual({ align: 'top', empty: 0.5 });
    expect(placement({ y: 0, h: 100 }, { y: 24, h: 50 })).toEqual({ align: 'middle', empty: 0.5 });
    expect(placement({ y: 0, h: 100 }, { y: 50, h: 50 })).toEqual({ align: 'bottom', empty: 0.5 });
    const r = record('L1-1');
    // the cards carry a numeral (01, 02) above the heading and are drawn on cards; the bullets are not numbered
    expect(r.containers.map((c) => [c.numbered, c.card])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(r.containers[0].place).toEqual({ align: 'fill', empty: 0, text: expect.any(Number) });
    // C3.2 (D7): the numerals (01, 02) over the headings count as content, so the text-only share is the fields and
    // the numerals together
    expect(r.containers[0].numeral).toEqual({ role: 'display', place: 'above', share: expect.any(Number) });
    expect(r.containers[0].place.text).toBeGreaterThan(0.1);
    expect(r.containers[0].place.text).toBeLessThan(0.3);
    expect(r.containers[0].itemAlign).toBe('bottom');
    expect(record('L8-13').containers[0].place).toEqual({ align: 'fill', empty: 0 });
  });

  it('fails on a band the key module does not know or a container of unknown type (negative)', () => {
    expect(() => specBands('X', '2 items · heading 1–25')).toThrow(/heading 1-25 is not in catalogue-key.js/);
    expect(() => specBands('X', '2 items · colour 1–20')).toThrow(/unknown band field "colour"/);
    const s = index.slides.find((x) => x.id === 'L1-1');
    const g = JSON.parse(JSON.stringify(geometry.slides['L1-1']));
    g.containers[1].type = 'sparkline';
    expect(() => layoutRecord(s, g, GRID)).toThrow(/container 2 has unknown type "sparkline"/);
  });
});

describe('C3.2: rules make cards, numerals get a zone, roadmaps keep year labels', () => {
  const none = { top: false, bottom: false, left: false, right: false, between: false, inner: false };

  it('a container the catalogue separates with rules takes the card (D6); its axis, a chart or a table does not', () => {
    expect(cardSource({ rules: { ...none, between: true } }, 'items')).toBe('rule');
    expect(cardSource({ rules: { ...none, inner: true } }, 'subpoints')).toBe('rule');
    expect(cardSource({ classes: ['card', 'd'], rules: none }, 'points')).toBe('class');
    // negative: no rule and no card class -> no card; a roadmap's own axis is not a separator; charts / tables keep
    // their box
    expect(cardSource({ classes: ['x'], itemClasses: [], rules: none }, 'kpis')).toBeNull();
    expect(cardSource({ rules: { ...none, axis: true } }, 'process')).toBeNull();
    expect(cardSource({ rules: { ...none, top: true } }, 'chart')).toBeNull();
    expect(cardSource({ rules: { ...none, top: true } }, 'table')).toBeNull();
  });

  it('real records: ruled cells / columns / rows take the card, an unruled roadmap keeps none', () => {
    expect(record('L1-3').containers.map((c) => [c.card, c.cardSource ?? null])).toEqual([
      [true, 'rule'],
      [true, 'class'],
    ]);
    expect(record('L23-3').containers[0]).toEqual(
      expect.objectContaining({ card: true, cardSource: 'rule' }),
    );
    expect(record('L14-13').containers.map((c) => c.cardSource ?? null)).toEqual(['rule', null]);
    const roadmap = record('L18-13').containers[0];
    expect(roadmap.rules.axis).toBe(true);
    expect(roadmap.card).toBe(false);
    expect(record('L31-7').containers[0].card).toBe(false);
  });

  it('a numeral larger than the running text gets a zone of its size band and share (D7)', () => {
    const first = [
      { f: 'heading', fontSize: 40 },
      { f: 'description', fontSize: 28 },
    ];
    const numeral = (fontSize, extra = {}) => ({
      numeral: {
        box: { x: 0, y: 0, w: 100, h: 90 },
        fontSize,
        text: '01',
        fields: { x: 0, y: 120, w: 400, h: 180 },
      },
      numeralAlign: 'top',
      ...extra,
    });
    // share = (fields top − numeral top) / (fields bottom − numeral top) = 120 / 300
    expect(numeralZone(numeral(104), 'process', first)).toEqual({
      role: 'display',
      place: 'above',
      share: 0.4,
    });
    expect(numeralZone(numeral(60), 'timeline', first).role).toBe('h1');
    expect(numeralZone(numeral(50), 'process', first).role).toBe('h2');
    expect(numeralZone(numeral(30), 'process', first).role).toBe('h3');
    expect(numeralZone({ ...numeral(104), numeralAlign: 'left' }, 'process', first).place).toBe('beside');
    // numbered items: only an ordinal numeral; a figure (58 %) over a card is not a number marker
    expect(numeralZone(numeral(104, { numbered: true }), 'items', first)).not.toBeNull();
    expect(numeralZone(numeral(104), 'items', first)).toBeNull();
    // negative: a numeral no larger than the body text gets no zone
    expect(numeralZone(numeral(28), 'process', first)).toBeNull();
    expect(numeralZone(numeral(19), 'timeline', first)).toBeNull();
    expect(numeralZone({}, 'process', first)).toBeNull();
  });

  it('real records: big numerals and years have zones; small labels and plain records none', () => {
    expect(record('L24-7').containers[0].numeral).toEqual({
      role: 'display',
      place: 'above',
      share: expect.any(Number),
    });
    expect(record('L31-7').containers[0].numeral.role).toBe('display');
    expect(record('L18-13').containers[0].numeral.share).toBeGreaterThan(0.4);
    // a timeline's year inside its heading field (plan 32: display: contents)
    expect(record('L32-7').containers[0].numeral.role).toBe('display');
    // "Step 1" labels in the eyebrow size: no zone
    expect(record('L31-9').containers[0].numeral).toBeUndefined();
    expect(record('L14-13').containers[0].numeral).toBeUndefined();
  });

  it('roadmaps whose labels name a year, a time or a region keep them (D8); ordinals stay numbers', () => {
    expect(
      ['2026', 'Now', 'Today', 'Near term', 'UK and Europe', 'Phase 1 · 2026', 'Feb 2025'].map(yearLabel),
    ).toEqual([true, true, true, true, true, true, true]);
    expect(['01', '1', 'Step 1', 'Phase 2', 'First', 'Last', '', undefined].map(yearLabel)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(record('L18-13').containers[0].labels).toBe('year');
    expect(record('L18-1').containers[0].labels).toBe('year');
    expect(record('L31-7').containers[0].labels).toBeUndefined();
    expect(record('L31-9').containers[0].labels).toBeUndefined();
    const years = data.records.filter((r) => r.containers.some((c) => c.labels === 'year'));
    expect(years).toHaveLength(20);
  });
});

describe('the loader', () => {
  it('builds a def per record', () => {
    expect(catalogueDefs()).toHaveLength(1077);
    for (const r of data.records) expect(recordProblems(r)).toEqual([]);
  });

  it('rejects a record with a container of unknown type, a block that does not match or a wrong key (negative)', () => {
    const r = JSON.parse(JSON.stringify(data.records[0]));
    r.containers[0].type = 'sparkline';
    expect(() => defFromRecord(r)).toThrow(/container 1 has unknown type "sparkline"/);
    const b = JSON.parse(JSON.stringify(data.records[0]));
    b.containers[1].block = 'items';
    expect(() => defFromRecord(b)).toThrow(/must take block points/);
    const k = JSON.parse(JSON.stringify(data.records[0]));
    k.key = 'items:3';
    expect(() => defFromRecord(k)).toThrow(/is not the combination's key/);
  });
});
