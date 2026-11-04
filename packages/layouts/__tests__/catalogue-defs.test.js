/**
 * C3 (docs/PLAN-catalogue.md): every catalogue layout (1,077) built for every golden Mood (10) - all 10,770 builds,
 * about 1 s - is schema-valid, keeps every box on the canvas, has one required slot per container of a block, and no
 * two containers overlap (a flow with its own cells counts by its cells). The 68 and their listings are unchanged
 * unless the catalogue layouts are asked for; their `match` scores by default (C4) and 0 with the opt-out.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue, itemLayout } from '../src/index.js';
import {
  contentAlign,
  fillOf,
  fittingRole,
  giveToGraphic,
  groupScale,
  itemNeed,
  recordRoles,
  resolveNumeral,
  zoneNeed,
} from '../src/catalogue-defs.js';
import { numeralZone, timelineLineY } from '../src/items.js';
import { REPO, errorsOf, validateLayout } from './helpers.js';

const GOLDEN = join(REPO, 'golden', 'expected');
const MOODS = readdirSync(GOLDEN)
  .filter((id) => existsSync(join(GOLDEN, id, 'mood.json')))
  .sort()
  .map((id) => JSON.parse(readFileSync(join(GOLDEN, id, 'mood.json'), 'utf8')));
const DEFS = catalogue.list({ catalogue: true }).filter((d) => d.catalogue);

const onCanvas = (f) => f.x >= -0.5 && f.y >= -0.5 && f.x + f.w <= 1920.5 && f.y + f.h <= 1080.5;
const overlap = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
const NOT_CONTENT = new Set(['title', 'footer', 'logo', 'divider', 'eyebrow', 'subtitle']);

describe('the catalogue layouts', () => {
  it('are listed only with the catalogue option: 68 + 1,077', () => {
    expect(MOODS).toHaveLength(10);
    expect(catalogue.list()).toHaveLength(68);
    expect(catalogue.list({ catalogue: true })).toHaveLength(1145);
    expect(DEFS).toHaveLength(1077);
    expect(catalogue.forKind('kpi').some((d) => d.catalogue)).toBe(false);
    const kpi = catalogue.forKind('kpi', { catalogue: true });
    expect(kpi[0].id).toBe('kpi');
    expect(kpi.findIndex((d) => d.catalogue)).toBe(catalogue.forKind('kpi').length);
    expect(catalogue.get('cat-l8-13').catalogue).toBe('L8-13');
    expect(catalogue.get('cat-l99-1')).toBeUndefined();
  });

  it('build schema-valid layouts on the canvas, one required slot per block container, no overlaps (every Mood)', () => {
    const problems = [];
    for (const mood of MOODS) {
      for (const def of DEFS) {
        const layout = def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind } });
        const at = `${mood.id} ${def.id}`;
        if (!validateLayout(layout)) problems.push(`${at}: ${errorsOf(validateLayout)}`);
        for (const b of layout.boxes) {
          if (!onCanvas(b.frame)) problems.push(`${at}: box ${b.id} leaves the canvas`);
          for (const c of b.flow?.cells ?? [])
            if (!onCanvas(c)) problems.push(`${at}: a cell of ${b.id} leaves the canvas`);
        }
        const containers = def.record.containers.filter((c) => c.block).length;
        const required = layout.slots.filter((s) => s.required && s.id !== 'title').length;
        if (required !== containers)
          problems.push(`${at}: ${required} required slots for ${containers} containers`);
        const parts = layout.boxes
          .filter((b) => !NOT_CONTENT.has(b.role) && b.slot)
          .flatMap((b) => (b.flow?.cells ? b.flow.cells.map((f) => [b.id, f]) : [[b.id, b.frame]]));
        for (let i = 0; i < parts.length; i += 1)
          for (let j = i + 1; j < parts.length; j += 1)
            if (
              parts[i][0] !== parts[j][0] &&
              !parts[j][0].endsWith('-heading') &&
              overlap(parts[i][1], parts[j][1])
            )
              problems.push(`${at}: ${parts[i][0]} overlaps ${parts[j][0]}`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it('score 0 with the opt-out (catalogue: false); exact key 100, same combination 60 minus the band distance', () => {
    const summary = {
      v2: true,
      blocks: [
        { type: 'items', nodes: 2, fields: ['heading', 'body'], chars: { heading: 12, body: 60 } },
        { type: 'points', nodes: 2, fields: ['text'], chars: { text: 40 } },
      ],
    };
    const on = { options: { catalogue: true } };
    const def = catalogue.get('cat-l1-1');
    // C4: on by default (no ctx, no option); `catalogue: false` turns it off (negative)
    expect(def.match(summary)).toBe(100);
    expect(def.match(summary, { options: {} })).toBe(100);
    expect(def.match(summary, { options: { catalogue: false } })).toBe(0);
    expect(def.match({ ...summary, v2: false })).toBe(0);
    expect(def.match(summary, on)).toBe(100);
    // the same blocks with long bullets: L1-2 is the family, L1-1 the same combination one band step away
    const long = { ...summary, blocks: [summary.blocks[0], { ...summary.blocks[1], chars: { text: 120 } }] };
    expect(catalogue.get('cat-l1-2').match(long, on)).toBe(100);
    expect(def.match(long, on)).toBe(57);
    expect(catalogue.get('cat-l4-1').match(summary, on)).toBe(0);
    // a shaped process is drawn by the shape layouts, never by a roadmap
    const cycle = {
      v2: true,
      blocks: [{ type: 'process', nodes: 2, shape: 'cycle', chars: { heading: 8, body: 30 } }],
    };
    expect(catalogue.get('cat-l31-1').match(cycle, on)).toBe(0);
  });

  it('prefers a roadmap record with year labels for a process whose nodes carry a label, and the reverse (C4, D8)', () => {
    // process:4, heading 1-20, description 71-140: no record has the key; L31-9 (heading 1-20, description 141-220)
    // and L31-11 (heading 21-60, description 71-140, labels: 'year') lie one longer band step away (58 each)
    const slide = (fields) => ({
      v2: true,
      blocks: [{ type: 'process', nodes: 4, fields, chars: { heading: 12, body: 100 } }],
    });
    const labelled = slide(['body', 'heading', 'label']);
    const plain = slide(['body', 'heading']);
    const l31x9 = catalogue.get('cat-l31-9');
    const l31x11 = catalogue.get('cat-l31-11');
    expect(l31x11.labels).toBe('year');
    expect(l31x9.labels).toBeUndefined();
    expect(l31x11.match(labelled)).toBe(58.5);
    expect(l31x9.match(labelled)).toBe(58);
    // negative: without labels the record with year labels is not preferred
    expect(l31x11.match(plain)).toBe(58);
    expect(l31x9.match(plain)).toBe(58.5);
    // a record without a process container takes no label tie-break (an exact key stays 100)
    const items = {
      v2: true,
      blocks: [{ type: 'items', nodes: 2, fields: ['heading', 'body'], chars: { heading: 12, body: 60 } }],
    };
    expect(catalogue.get('cat-l24-1').match(items)).toBe(100);
    // the generator's 20 roadmap records with year labels are read from their containers
    expect(DEFS.filter((d) => d.labels === 'year')).toHaveLength(20);
  });
});

describe('C3.1: scale, placement, cards and numbers on the layout', () => {
  const stripe = MOODS.find((m) => m.id === 'stripe');
  const build = (id, mood = stripe) =>
    catalogue.get(id).build({ mood, geometry: mood.geometry, summary: { kind: catalogue.get(id).kind } });

  it('passes the size-band roles to the item slots (a 190 px figure: the larger of display / stat)', () => {
    const kpis = build('cat-l8-13').boxes.find((b) => b.id === 'kpis');
    expect(kpis.flow.itemRoles).toEqual({ value: 'display', label: 'h3', body: 'body' });
    expect(recordRoles(stripe, catalogue.get('cat-l1-1').record.containers[0])).toEqual({
      title: 'h2',
      text: 'body',
    });
    // a role the Mood does not define is left to the item layout (negative)
    const c = {
      block: 'items',
      fields: [
        { f: 'heading', role: 'h7' },
        { f: 'description', role: 'body' },
      ],
    };
    expect(recordRoles(stripe, c)).toEqual({ text: 'body' });
  });

  it('the item layouts honour a role override the Mood defines, and ignore one it does not (negative)', () => {
    const own = itemLayout('kpi-value-label', { mood: stripe, w: 400, h: 300 });
    const big = itemLayout('kpi-value-label', { mood: stripe, w: 400, h: 300, roles: { value: 'display' } });
    const none = itemLayout('kpi-value-label', { mood: stripe, w: 400, h: 300, roles: { value: 'nope' } });
    const role = (l, id) => l.slots.find((s) => s.id === id).role;
    expect([role(own, 'value'), role(big, 'value'), role(none, 'value')]).toEqual([
      'stat',
      'display',
      'stat',
    ]);
    const col = itemLayout('compare-column', { mood: stripe, w: 400, h: 300, fields: { number: true } });
    expect(col.slots.map((s) => s.id)).toEqual(['number', 'title', 'text']);
    expect(itemLayout('compare-column', { mood: stripe, w: 400, h: 300 }).slots.map((s) => s.id)).toEqual([
      'title',
      'text',
    ]);
  });

  it('marks cards, numbers, placement and the fill target on the container boxes', () => {
    const l11 = build('cat-l1-1');
    const cards = l11.boxes.find((b) => b.id === 'cards');
    // L1-1 records its cards at the bottom: drawn at the bottom since the recorded placement rule (C3.1: middle)
    expect(cards.flow).toEqual(
      expect.objectContaining({ itemLayout: 'item-card', numbered: true, valign: 'bottom' }),
    );
    expect(cards.container).toBe(1);
    expect(cards.fill).toBeGreaterThan(0.3);
    const statement = build('cat-l34-1').boxes.find((b) => b.id === 'body');
    expect(statement).toEqual(expect.objectContaining({ card: true, container: 1 }));
    expect(statement.align.v).toBe('middle');
    // the recorded placement rule (R-PLACE, 2026-11-03): the record as recorded (C3.1 mapped bottom -> middle, fill -> top)
    expect(contentAlign({ place: { align: 'bottom' } })).toBe('bottom');
    expect(contentAlign({ place: { align: 'fill' } })).toBe('middle');
    // a chart is drawn to its box: no fill target (negative)
    expect(fillOf({ block: 'chart', place: { align: 'fill', empty: 0 } })).toBeUndefined();
  });

  it('keeps the catalogue’s share of the area for short text and grows it to what long text needs', () => {
    const rec = catalogue.get('cat-l24-7').record;
    const area = { x: 0, y: 300, w: 1600, h: 700 };
    const blocks = (body) => ({
      v2: true,
      blocks: [{ type: 'items', nodes: 4, fields: ['heading', 'body'], chars: { heading: 10, body } }],
    });
    const b = { mood: stripe };
    // without its numeral zone (C3.2 D7) the short text keeps the catalogue's share exactly
    const plain = { ...rec, containers: rec.containers.map((c) => ({ ...c, numeral: undefined })) };
    expect(groupScale(b, area, plain, blocks(20), 24).s).toBeCloseTo(rec.group.h, 3);
    // the numeral's room is part of what the items need: the group grows for it
    const short = groupScale(b, area, rec, blocks(20), 24);
    const long = groupScale(b, area, rec, blocks(600), 24);
    expect(short.s).toBeGreaterThan(rec.group.h);
    expect(long.s).toBeGreaterThan(short.s);
    expect(long.s).toBeLessThanOrEqual(1);
    expect(zoneNeed(stripe, rec.containers[0], 1600, { heading: 10, description: 600 }, 24)).toBeGreaterThan(
      zoneNeed(stripe, rec.containers[0], 1600, { heading: 10, description: 20 }, 24),
    );
  });
});

describe('C3.2 (D7, D8): the numeral zone and the label box in the item layouts', () => {
  const stripe = MOODS.find((m) => m.brandId === 'stripe');
  const box = (sub, id) => sub.boxes.find((b) => b.id === id)?.frame;
  const numeral = { role: 'h2', place: 'above', share: 0.3 };

  it('a numeral above its fields gives the step its share of the item height, at its size band', () => {
    const sub = itemLayout('step-number-title-text', { mood: stripe, w: 400, h: 600, numeral });
    expect(box(sub, 'title').y).toBeCloseTo(0.3 * 600, 5);
    expect(sub.slots.find((x) => x.id === 'number').role).toBe('h2');
    // the number sits in the zone
    expect(box(sub, 'number').y + box(sub, 'number').h).toBeLessThanOrEqual(0.3 * 600);
    expect(numeralZone(stripe, 400, 600, numeral)).toEqual(
      expect.objectContaining({ size: 180, place: 'above' }),
    );
  });

  it('beside its fields the zone takes the share of the item width', () => {
    const sub = itemLayout('step-number-title-text', {
      mood: stripe,
      w: 1000,
      h: 200,
      numeral: { role: 'h2', place: 'beside', share: 0.2 },
    });
    expect(box(sub, 'title')).toEqual(expect.objectContaining({ x: 200, y: 0 }));
  });

  it('a record without a numeral builds the item as before (negative)', () => {
    for (const id of ['step-number-title-text', 'timeline-when-title-text', 'compare-column', 'item-card']) {
      const args = { mood: stripe, w: 400, h: 600, fields: { number: true } };
      expect(itemLayout(id, { ...args, numeral: null })).toEqual(itemLayout(id, args));
    }
    expect(timelineLineY(stripe, 0, { h: 600 })).toBe(timelineLineY(stripe));
    // a role the Mood lacks: no zone
    expect(numeralZone(stripe, 400, 600, { role: 'nope', place: 'above', share: 0.3 })).toBeNull();
    expect(resolveNumeral(stripe, null)).toBeNull();
  });

  it('a timeline puts its when at the numeral role and its dot / line under the zone', () => {
    const sub = itemLayout('timeline-when-title-text', { mood: stripe, w: 400, h: 600, numeral });
    expect(sub.slots.find((x) => x.id === 'when').role).toBe('h2');
    expect(box(sub, 'title').y).toBeCloseTo(180, 5);
    expect(timelineLineY(stripe, 0, { h: 600, numeral })).toBeGreaterThan(timelineLineY(stripe));
    expect(timelineLineY(stripe, 0, { h: 600, numeral })).toBeLessThan(180);
  });

  it('numbered cards and columns give the number the zone; the item needs the zone', () => {
    for (const id of ['item-card', 'compare-column']) {
      const sub = itemLayout(id, { mood: stripe, w: 400, h: 600, fields: { number: true }, numeral });
      expect(sub.slots.find((x) => x.id === 'number').role).toBe('h2');
    }
    const r = resolveNumeral(stripe, { role: 'display', place: 'above', share: 0.4 });
    expect(['display', 'stat']).toContain(r.role);
    expect(itemNeed(stripe, 'process', { numeral: r })).toBeGreaterThan(itemNeed(stripe, 'process'));
  });

  it('a process node’s label gets a label box at the marker role (D8)', () => {
    const sub = itemLayout('step-number-title-text', {
      mood: stripe,
      w: 400,
      h: 600,
      fields: { label: true },
    });
    const label = sub.slots.find((x) => x.id === 'label');
    expect(label.role).toBe('h3');
    expect(box(sub, 'label').w).toBe(400);
    const zoned = itemLayout('step-number-title-text', {
      mood: stripe,
      w: 400,
      h: 600,
      fields: { label: true },
      numeral,
    });
    expect(zoned.slots.find((x) => x.id === 'label').role).toBe('h2');
    // without a label: no label slot (negative)
    expect(
      itemLayout('step-number-title-text', { mood: stripe, w: 400, h: 600 }).slots.some(
        (x) => x.id === 'label',
      ),
    ).toBe(false);
  });
});

describe('C3.2: room for the Mood’s card (text roles that fit, a paragraph over a graphic, KPI values)', () => {
  const stripe = MOODS.find((m) => m.brandId === 'stripe');
  const rukko = MOODS.find((m) => m.brandId === 'rukko');
  const frameOf = (x, y, w, h) => ({ x, y, w, h });

  it('a text steps down the ladder to the largest role that fits its box; one that fits keeps its role', () => {
    const size = (r) => stripe.type.roles[r].size;
    const down = fittingRole(stripe, 'h2', 400, 600, 90);
    expect(size(down)).toBeLessThan(size('h2'));
    // negative: room enough, or an unknown length -> the role asked for
    expect(fittingRole(stripe, 'h2', 40, 1600, 400)).toBe('h2');
    expect(fittingRole(stripe, 'h2', 0, 600, 10)).toBe('h2');
  });

  it('a paragraph under a graphic too low for its text (on a card) takes the shortfall from the graphic', () => {
    const chart = {
      c: { block: 'chart', grid: { col: 0, span: 12 }, flow: {} },
      f: frameOf(0, 300, 1600, 500),
    };
    const para = {
      c: {
        block: 'paragraph',
        card: true,
        grid: { col: 0, span: 12 },
        flow: {},
        fields: [{ f: 'paragraph', role: 'h2' }],
      },
      f: frameOf(0, 820, 1600, 30),
    };
    const rec = {
      containers: [chart.c, para.c],
      combination: [{ type: 'chart' }, { type: 'paragraph', bands: { paragraph: '1-80' } }],
    };
    const placed = [chart, para];
    giveToGraphic({ mood: stripe }, placed, {}, rec);
    expect(para.f.h).toBeGreaterThan(30);
    expect(para.f.y + para.f.h).toBeCloseTo(850, 5);
    expect(chart.f.h).toBeGreaterThanOrEqual(250);
    expect(chart.f.y + chart.f.h).toBeLessThanOrEqual(para.f.y + 0.01);
    // negative: a paragraph with the room it needs leaves the graphic alone
    const roomy = { ...para, f: frameOf(0, 820, 1600, 200) };
    const chart2 = { ...chart, f: frameOf(0, 300, 1600, 500) };
    giveToGraphic({ mood: stripe }, [chart2, roomy], {}, rec);
    expect(chart2.f.h).toBe(500);
  });

  it('a KPI value steps down from the hero role where the card leaves its cell too low (rukko L5-49)', () => {
    const at = (mood) =>
      catalogue
        .get('cat-l5-49')
        .build({ mood, geometry: mood.geometry, summary: { kind: 'kpi' } })
        .boxes.find((b) => b.id === 'kpis').flow.itemRoles.value;
    const size = (m, r) => m.type.roles[r].size;
    expect(size(rukko, at(rukko))).toBeLessThan(Math.max(size(rukko, 'display'), size(rukko, 'stat')));
    // negative: stripe's figures fit their cells and keep the hero role
    expect(['display', 'stat']).toContain(at(stripe));
  });
});
