/**
 * S2.b layouts (docs/S2-layouts.md §8), built for every golden Mood (golden/expected/<id>/mood.json): the main + two
 * asides family (`<main>-asides-right`, `<main>-aside-below-2`), the agenda with descriptions (`agenda-rows`), the
 * table row height by density, items in two rows over four, a six-milestone timeline in one row.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue, contentFrame, itemLayout } from '../src/index.js';
import { contains, overlaps } from '../src/geometry.js';
import { mainAsides } from '../src/common.js';
import { DENSITY_ROW_SPACE, tableRowHeight } from '../src/kinds/table.js';
import { itemsGrid } from '../src/kinds/cards.js';
import { REPO, errorsOf, validateLayout } from './helpers.js';

const GOLDEN = join(REPO, 'golden', 'expected');
const MOODS = readdirSync(GOLDEN)
  .filter((id) => existsSync(join(GOLDEN, id, 'mood.json')))
  .sort()
  .map((id) => JSON.parse(readFileSync(join(GOLDEN, id, 'mood.json'), 'utf8')));

const block = (type, nodes, extra = {}) => ({
  type,
  nodes,
  fields: ['heading', 'body'],
  icons: [],
  chars: { text: 120, heading: 20, body: 50 },
  ...extra,
});
const v2 = (...blocks) => ({ v2: true, items: blocks[0]?.nodes ?? 0, blocks });
const build = (id, mood, summary) => {
  const def = catalogue.get(id);
  return def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind, ...summary } });
};
const best = (summary, kind) =>
  catalogue
    .forKind(kind)
    .map((d) => [d.id, d.match?.(summary) ?? 0])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

const THREE = catalogue.list().filter((d) => /-asides-right$|-aside-below-2$/.test(d.id));
const ASIDE_SETS = [
  [block('points', 3), block('paragraph', 1)],
  [block('paragraph', 1), block('points', 4)],
  [block('kpis', 2, { fields: ['value', 'heading'] }), block('paragraph', 1)],
  [block('items', 3, { title: true }), block('points', 3)],
  [block('kpis', 3, { fields: ['value', 'heading', 'body'] }), block('items', 2)],
  [block('points', 3), block('points', 2)],
];
const MAINS = {
  steps: [block('process', 3), block('process', 4, { shape: 'cycle' })],
  chart: [block('chart', 4)],
  table: [block('table', 4)],
  image: [block('image', 1), block('image', 3)],
};

/** Frame problems: a box outside the content frame, slotted boxes that overlap, a slot without its box. */
function problems(layout, mood) {
  const out = [];
  const c = contentFrame(mood.geometry);
  for (const b of layout.boxes) {
    if (['footer', 'logo', 'decor'].includes(b.role)) continue;
    if (!contains(c, b.frame)) out.push(`${b.id} leaves the content frame`);
  }
  const slotted = layout.boxes.filter((b) => b.slot);
  for (let i = 0; i < slotted.length; i += 1)
    for (let j = i + 1; j < slotted.length; j += 1)
      if (overlaps(slotted[i].frame, slotted[j].frame))
        out.push(`slot box ${slotted[i].id} overlaps ${slotted[j].id}`);
  for (const sl of layout.slots)
    if (!layout.boxes.some((b) => b.id === sl.box)) out.push(`slot ${sl.id} has no box`);
  return out;
}

describe('main + two asides: the catalogue and the pick', () => {
  it('adds 8 layouts (process / chart / table / image × asides right, asides below), each with a label and tags', () => {
    expect(THREE.map((d) => d.id).sort()).toEqual(
      ['chart', 'image', 'steps', 'table'].flatMap((k) => [`${k}-aside-below-2`, `${k}-asides-right`]).sort(),
    );
    for (const d of THREE) {
      expect(d.label.length).toBeLessThanOrEqual(30);
      expect(d.tags).toEqual(expect.arrayContaining(['asides']));
    }
    // a three-block slide is inferred as either block's kind: the family is listed under the aside kinds too
    for (const k of ['bullets', 'cards', 'text', 'kpi'])
      expect(catalogue.forKind(k).map((d) => d.id)).toEqual(
        expect.arrayContaining(['steps-asides-right', 'chart-aside-below-2']),
      );
  });

  it('mainAsides splits main (most graphic) + two asides in written order; pick prefers below for a KPI aside', () => {
    const p = mainAsides(v2(block('points', 3), block('chart', 4), block('kpis', 2)));
    expect(p.main.type).toBe('chart');
    expect(p.asides.map((a) => a.type)).toEqual(['points', 'kpis']);
    expect(best(v2(block('process', 3), block('points', 3), block('paragraph', 1)), 'steps')).toBe(
      'steps-asides-right',
    );
    expect(best(v2(block('chart', 4), block('kpis', 2), block('paragraph', 1)), 'kpi')).toBe(
      'chart-aside-below-2',
    );
    expect(best(v2(block('table', 4), block('items', 2), block('points', 2)), 'cards')).toBe(
      'table-asides-right',
    );
    expect(best(v2(block('image', 1), block('paragraph', 1), block('points', 2)), 'image-text')).toBe(
      'image-asides-right',
    );
  });

  it('negative: two blocks, two paragraphs, a non-graphic main or a non-aside block do not match', () => {
    expect(mainAsides(v2(block('process', 3), block('points', 3)))).toBeNull();
    expect(mainAsides(v2(block('process', 3), block('paragraph', 1), block('paragraph', 1)))).toBeNull();
    expect(mainAsides(v2(block('items', 3), block('points', 3), block('paragraph', 1)))).toBeNull();
    expect(mainAsides(v2(block('chart', 3), block('table', 3), block('points', 2)))).toBeNull();
    expect(mainAsides({ blocks: [block('chart', 3), block('points', 3), block('kpis', 2)] })).toBeNull();
    for (const d of THREE) expect(d.match(v2(block('chart', 3), block('points', 3)))).toBe(0);
  });
});

describe.each(MOODS.map((m) => [m.id, m]))('S2.b layouts for the golden Mood %s', (_id, mood) => {
  it.each(THREE.map((d) => [d.id, d]))(
    '%s: schema-valid, inside the content frame, no slotted boxes overlapping, for every aside pair',
    (_d, def) => {
      const key = def.id.split('-')[0];
      const summaries = [{}, { items: 3 }];
      for (const main of MAINS[key])
        for (const [a, b] of ASIDE_SETS) {
          summaries.push(v2(main, a, b));
          summaries.push(v2(a, main, b));
        }
      for (const summary of summaries) {
        const layout = build(def.id, mood, summary);
        if (!validateLayout(layout)) throw new Error(`${def.id}: ${errorsOf(validateLayout)}`);
        expect([def.id, problems(layout, mood)]).toEqual([def.id, []]);
        for (const s of layout.slots) if (s.role) expect(mood.type.roles[s.role]).toBeDefined();
        // both asides have a slot; a paragraph's body slot comes after the list slots (it takes every body block left)
        const ids = layout.slots.map((s) => s.id);
        expect(ids).toEqual(expect.arrayContaining(['aside-1', 'aside-2']));
        const rich = layout.slots.findIndex((s) => s.type === 'richtext');
        const list = layout.slots.findIndex((s) => s.type === 'list' && /^aside-/.test(s.id));
        if (rich >= 0 && list >= 0) expect(list).toBeLessThan(rich);
      }
    },
  );

  it('asides right: main 7 / asides 5 stacked; asides below: main above, two asides side by side under it', () => {
    const s = v2(block('process', 3), block('points', 3), block('paragraph', 1));
    const r = build('steps-asides-right', mood, s);
    const f = (l, id) => l.boxes.find((b) => b.id === id).frame;
    expect(f(r, 'aside-1').x).toBeGreaterThan(f(r, 'steps').x + f(r, 'steps').w);
    expect(f(r, 'aside-2').y).toBeGreaterThan(f(r, 'aside-1').y + f(r, 'aside-1').h);
    expect(f(r, 'aside-1').x).toBe(f(r, 'aside-2').x);
    const b = build(
      'chart-aside-below-2',
      mood,
      v2(block('chart', 4), block('kpis', 2), block('paragraph', 1)),
    );
    expect(f(b, 'aside-1').y).toBeGreaterThan(f(b, 'chart').y + f(b, 'chart').h);
    expect(f(b, 'aside-1').y).toBe(f(b, 'aside-2').y);
    expect(f(b, 'aside-2').x).toBeGreaterThan(f(b, 'aside-1').x + f(b, 'aside-1').w);
  });

  it('agenda-rows: one numbered row per item down the body area, inside the content frame', () => {
    const layout = build('agenda-rows', mood, v2(block('items', 5)));
    if (!validateLayout(layout)) throw new Error(errorsOf(validateLayout));
    expect(problems(layout, mood)).toEqual([]);
    const flow = layout.boxes.find((b) => b.id === 'cards').flow;
    expect(flow).toMatchObject({ direction: 'column', columns: 1, itemLayout: 'agenda-row' });
    expect(layout.slots.find((s) => s.id === 'cards').capacity.maxItems).toBeGreaterThanOrEqual(5);
    for (const [w, h] of [
      [1600, 120],
      [300, 120],
    ]) {
      const it = itemLayout('agenda-row', { mood, w, h });
      for (const b of it.boxes) expect(contains({ x: 0, y: 0, w, h }, b.frame)).toBe(true);
      expect(it.slots.map((s) => s.id)).toEqual(['number', 'title', 'text']);
    }
  });

  it('table: a content/2 table box carries the density row height; a content/1 one does not', () => {
    const t = build('table', mood, v2(block('table', 4))).boxes.find((b) => b.id === 'table');
    expect(t.table.rowHeight).toBe(tableRowHeight(mood));
    const r = catalogue.get('table-aside-right');
    const ta = r
      .build({ mood, geometry: mood.geometry, summary: v2(block('table', 4), block('paragraph', 1)) })
      .boxes.find((b) => b.id === 'table');
    expect(ta.table.rowHeight).toBe(tableRowHeight(mood));
    expect(build('table', mood, { items: 4 }).boxes.find((b) => b.id === 'table').table).toBeUndefined();
  });

  it('items over four take two rows of ceil(n / 2); a six-milestone timeline keeps one row', () => {
    const cards = build('cards', mood, v2(block('items', 6)));
    expect(cards.boxes.find((b) => b.id === 'cards').flow.columns).toBe(3);
    expect(cards.slots.find((s) => s.id === 'cards').capacity.maxItems).toBe(6);
    const tl = build('timeline', mood, v2(block('timeline', 6)));
    expect(tl.boxes.find((b) => b.id === 'timeline').flow.columns).toBe(6);
    expect(tl.slots.find((s) => s.id === 'timeline').capacity.maxItems).toBe(6);
    // four or fewer items: the v1 row
    expect(build('cards', mood, v2(block('items', 4))).boxes.find((b) => b.id === 'cards').flow.columns).toBe(
      4,
    );
  });
});

describe('negative tests', () => {
  const mood = MOODS[0];

  it('no density, no row height; the token follows the density', () => {
    expect(DENSITY_ROW_SPACE).toEqual({ sparse: 'xl', balanced: 'lg', dense: 'md' });
    const none = { ...mood, geometry: { ...mood.geometry, density: undefined } };
    expect(tableRowHeight(none)).toBeNull();
    expect(
      build('table', none, v2(block('table', 4))).boxes.find((b) => b.id === 'table').table,
    ).toBeUndefined();
    const dense = tableRowHeight({ ...mood, geometry: { ...mood.geometry, density: 'dense' } });
    const sparse = tableRowHeight({ ...mood, geometry: { ...mood.geometry, density: 'sparse' } });
    expect(dense).toBeLessThan(tableRowHeight(mood));
    expect(sparse).toBeGreaterThan(tableRowHeight(mood));
  });

  it('agenda-rows matches one items block only; itemsGrid leaves four or fewer items to the v1 row', () => {
    const def = catalogue.get('agenda-rows');
    expect(def.match(v2(block('items', 5)))).toBeGreaterThan(0);
    expect(def.match(v2(block('points', 5)))).toBe(0);
    expect(def.match(v2(block('items', 3), block('points', 2)))).toBe(0);
    expect(def.match({ blocks: [block('items', 5)] })).toBe(0);
    expect(itemsGrid(block('items', 4))).toBeNull();
    expect(itemsGrid(block('items', 10))).toEqual({ columns: 5, maxItems: 10 });
  });

  it('the frame check catches an aside pushed onto the main', () => {
    const layout = structuredClone(
      build('steps-asides-right', mood, v2(block('process', 3), block('points', 3), block('paragraph', 1))),
    );
    layout.boxes.find((b) => b.id === 'aside-1').frame.x -= 400;
    expect(problems(layout, mood).some((p) => /overlaps/.test(p))).toBe(true);
  });
});
