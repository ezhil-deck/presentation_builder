/**
 * S2.a slice 2 layouts (docs/S2-layouts.md): main + aside layouts, the 11 process shapes, the single-KPI hero and
 * points in two columns, built for every golden Mood (golden/expected/<id>/mood.json).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  KINDS,
  SHAPES,
  SHAPE_RANGES,
  catalogue,
  contentFrame,
  processShape,
  shapeFits,
} from '../src/index.js';
import { bodyArea, contains, overlaps } from '../src/geometry.js';
import { mainAside } from '../src/common.js';
import { REPO, errorsOf, validateLayout } from './helpers.js';

const GOLDEN = join(REPO, 'golden', 'expected');
const MOODS = readdirSync(GOLDEN)
  .filter((id) => existsSync(join(GOLDEN, id, 'mood.json')))
  .sort()
  .map((id) => JSON.parse(readFileSync(join(GOLDEN, id, 'mood.json'), 'utf8')));

const NEW_DEFS = catalogue.list().slice(KINDS.length);
const TEXT_ROLES = new Set([
  'title',
  'subtitle',
  'eyebrow',
  'body',
  'list',
  'quote',
  'attribution',
  'number',
]);

const block = (type, nodes, extra = {}) => ({
  type,
  nodes,
  fields: ['heading', 'body'],
  icons: [],
  ...extra,
});
const v2 = (...blocks) => ({ v2: true, items: blocks[0]?.nodes ?? 0, blocks });

/** Summaries the new layouts are built with: the picker's (no blocks), and the content they are picked for. */
const SUMMARIES = [
  { items: 3 },
  {},
  v2(block('process', 4, { shape: 'cycle' }), block('points', 3)),
  v2(block('points', 3), block('process', 5)),
  v2(block('chart', 4), block('kpis', 3, { fields: ['heading', 'value', 'trend'] })),
  v2(block('items', 2, { title: true }), block('items', 2, { title: true })),
  v2(block('paragraph', 1), block('points', 3)),
  v2(block('table', 3), block('paragraph', 1)),
  v2(block('image', 1), block('items', 3, { fields: ['heading', 'body', 'label'] })),
  v2(block('kpis', 2, { fields: ['value', 'heading', 'body'] }), block('items', 2)),
  v2(block('kpis', 1, { fields: ['value', 'heading', 'body'] })),
  v2(block('points', 9)),
  v2(block('process', 5, { shape: 'hub' })),
  v2(block('process', 9, { shape: 'cycle' })),
];

/** Whether the segment (x1, y1)–(x2, y2) passes through the inside of frame `r` (Liang–Barsky clipping, 0.5 px in). */
function crosses(m, r) {
  const e = 0.5;
  const [x0, y0, x1, y1] = [r.x + e, r.y + e, r.x + r.w - e, r.y + r.h - e];
  const dx = m.x2 - m.x1;
  const dy = m.y2 - m.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, m.x1 - x0],
    [dx, x1 - m.x1],
    [-dy, m.y1 - y0],
    [dy, y1 - m.y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1;
}

/** Frame problems of a built layout (content frame, schema, text boxes that overlap). */
function problems(layout, mood) {
  const out = [];
  const c = contentFrame(mood.geometry);
  for (const b of layout.boxes) {
    if (['footer', 'logo', 'decor'].includes(b.role)) continue;
    if (!contains(c, b.frame)) out.push(`${b.id} leaves the content frame`);
  }
  const texts = layout.boxes.filter((b) => b.slot && TEXT_ROLES.has(b.role));
  for (let i = 0; i < texts.length; i += 1)
    for (let j = i + 1; j < texts.length; j += 1)
      if (overlaps(texts[i].frame, texts[j].frame)) out.push(`${texts[i].id} overlaps ${texts[j].id}`);
  const slotted = layout.boxes.filter((b) => b.slot);
  for (let i = 0; i < slotted.length; i += 1)
    for (let j = i + 1; j < slotted.length; j += 1)
      if (overlaps(slotted[i].frame, slotted[j].frame))
        out.push(`slot box ${slotted[i].id} overlaps ${slotted[j].id}`);
  for (const sl of layout.slots)
    if (!layout.boxes.some((b) => b.id === sl.box)) out.push(`slot ${sl.id} has no box`);
  return out;
}

describe('the S2.a catalogue', () => {
  it('lists 11 process shapes, 21 main + aside layouts, the KPI hero and two columns of points, each with a label and tags', () => {
    const ids = NEW_DEFS.map((d) => d.id);
    expect(ids.filter((id) => id.startsWith('process-'))).toHaveLength(11);
    expect(ids.filter((id) => /-aside-(right|left|below)$/.test(id))).toHaveLength(21);
    expect(ids).toEqual(expect.arrayContaining(['kpi-hero', 'bullets-columns']));
    for (const d of catalogue.list()) {
      expect(typeof d.label).toBe('string');
      expect(d.label.length).toBeLessThanOrEqual(30);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });

  it('forKind keeps the v1 default first and lists every layout that can take the kind', () => {
    for (const k of KINDS) expect(catalogue.forKind(k)[0].id).toBe(k);
    const steps = catalogue.forKind('steps').map((d) => d.id);
    expect(steps).toEqual(expect.arrayContaining(['process-cycle', 'process-venn', 'steps-aside-left']));
    // a process + items slide is inferred as `cards`: its layouts are listed there too
    expect(catalogue.forKind('cards').map((d) => d.id)).toEqual(
      expect.arrayContaining(['cards-aside-right', 'steps-aside-right', 'chart-aside-below']),
    );
    expect(catalogue.forKind('bullets').map((d) => d.id)).toEqual(
      expect.arrayContaining(['bullets-columns', 'bullets-aside-left']),
    );
  });

  it('match picks the aside side from the content order (kpis below), the shape, the hero, two columns', () => {
    const best = (summary, kind) =>
      catalogue
        .forKind(kind)
        .map((d) => [d.id, d.match?.(summary) ?? 0])
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(best(v2(block('process', 4), block('points', 3)), 'steps')).toBe('steps-aside-right');
    expect(best(v2(block('points', 3), block('process', 4)), 'steps')).toBe('steps-aside-left');
    expect(best(v2(block('chart', 4), block('kpis', 3)), 'chart')).toBe('chart-aside-below');
    expect(best(v2(block('items', 2), block('items', 2)), 'cards')).toBe('cards-aside-right');
    expect(best(v2(block('paragraph', 1), block('points', 3)), 'bullets')).toBe('bullets-aside-left');
    expect(best(v2(block('process', 4, { shape: 'funnel' })), 'steps')).toBe('process-funnel');
    expect(best(v2(block('kpis', 1)), 'kpi')).toBe('kpi-hero');
    expect(best(v2(block('points', 9)), 'bullets')).toBe('bullets-columns');
    // image + paragraph stays the image-text layout's own composition
    expect(best(v2(block('image', 1), block('paragraph', 1)), 'image-text')).toBeUndefined();
    // content/1 summaries never match (no v2 flag)
    expect(best({ blocks: [block('process', 4, { shape: 'funnel' })] }, 'steps')).toBeUndefined();
    expect(mainAside(v2(block('chart', 3), block('table', 2)))).toBeNull();
  });
});

describe.each(MOODS.map((m) => [m.id, m]))('S2.a layouts for the golden Mood %s', (_id, mood) => {
  it.each(NEW_DEFS.map((d) => [d.id, d]))(
    '%s builds a schema-valid layout inside the content frame',
    (_d, def) => {
      for (const summary of SUMMARIES) {
        const layout = def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind, ...summary } });
        if (!validateLayout(layout)) throw new Error(`${def.id}: ${errorsOf(validateLayout)}`);
        expect([def.id, problems(layout, mood)]).toEqual([def.id, []]);
        expect(layout.slots.find((s) => s.id === 'title')).toMatchObject({ type: 'text', required: true });
        for (const s of layout.slots) if (s.role) expect(mood.type.roles[s.role]).toBeDefined();
      }
    },
  );

  it.each(SHAPES.filter((s) => s !== 'linear'))(
    '%s: nodes and marks stay in the main frame, node text frames never overlap',
    (shape) => {
      const F = bodyArea(mood);
      const { min, max } = SHAPE_RANGES[shape];
      for (let n = min; n <= max; n += 1) {
        for (const body of [true, false]) {
          const arr = processShape(shape, { mood, frame: F, n, body });
          expect(arr.nodes).toHaveLength(n);
          for (const nd of arr.nodes) {
            expect([shape, n, contains(F, nd.frame, 1)]).toEqual([shape, n, true]);
            expect(contains(nd.frame, nd.text, 1) || nd.paint === null).toBe(true);
            expect(nd.text.w).toBeGreaterThan(0);
            expect(nd.text.h).toBeGreaterThan(0);
          }
          for (let i = 0; i < n; i += 1)
            for (let j = i + 1; j < n; j += 1)
              expect([shape, n, i, j, overlaps(arr.nodes[i].frame, arr.nodes[j].frame)]).toEqual([
                shape,
                n,
                i,
                j,
                false,
              ]);
          for (const m of arr.marks) {
            if (m.kind === 'line') {
              const f = {
                x: Math.min(m.x1, m.x2),
                y: Math.min(m.y1, m.y2),
                w: Math.abs(m.x2 - m.x1),
                h: Math.abs(m.y2 - m.y1),
              };
              expect([shape, n, m.id, contains(F, f, 1)]).toEqual([shape, n, m.id, true]);
              // a connector never runs through a node's text
              for (const nd of arr.nodes)
                expect([shape, n, m.id, crosses(m, nd.text)]).toEqual([shape, n, m.id, false]);
            } else expect([shape, m.id, contains(F, m.frame, 1)]).toEqual([shape, m.id, true]);
            // colours are the brand's refs only: surface roles, the divider colour, the arrow colour
            const allowed = [
              'accent',
              'border',
              mood.shape?.divider?.color,
              mood.components?.arrow?.tokens?.color,
            ];
            for (const k of ['stroke', 'fill']) if (m[k]) expect(allowed).toContain(m[k]);
            if (m.paint) expect(m.paint).toBe('card');
          }
        }
      }
    },
  );
});

describe('negative tests: a shape outside its node range', () => {
  const mood = MOODS[0];
  it.each(SHAPES.filter((s) => s !== 'linear'))(
    '%s: processShape refuses 1 and 9 nodes, the layout falls back to linear steps',
    (shape) => {
      const { min, max } = SHAPE_RANGES[shape];
      for (const n of [1, 9, min - 1, max + 1]) {
        expect(shapeFits(shape, n)).toBe(false);
        expect(processShape(shape, { mood, frame: bodyArea(mood), n })).toBeNull();
        const layout = catalogue
          .get(`process-${shape}`)
          .build({ mood, geometry: mood.geometry, summary: v2(block('process', n, { shape })) });
        expect(layout.boxes.some((b) => b.flow?.shape)).toBe(false);
        expect(layout.boxes.find((b) => b.id === 'steps').flow.itemLayout).toBe('step-number-title-text');
      }
      expect(catalogue.get(`process-${shape}`).match(v2(block('process', max + 1, { shape })))).toBe(0);
    },
  );

  it('linear and unknown shapes are not drawn by processShape', () => {
    expect(processShape('linear', { mood, frame: bodyArea(mood), n: 4 })).toBeNull();
    expect(processShape('spiral', { mood, frame: bodyArea(mood), n: 4 })).toBeNull();
  });

  it('the frame check catches a node pushed out of the main frame', () => {
    const F = bodyArea(mood);
    const arr = processShape('cycle', { mood, frame: F, n: 4 });
    arr.nodes[0].frame = { ...arr.nodes[0].frame, x: F.x + F.w };
    expect(contains(F, arr.nodes[0].frame, 1)).toBe(false);
    const layout = structuredClone(
      catalogue.get('steps-aside-right').build({ mood, geometry: mood.geometry, summary: {} }),
    );
    layout.boxes.find((b) => b.id === 'aside').frame.x -= 300;
    expect(problems(layout, mood).some((p) => /overlaps/.test(p))).toBe(true);
  });
});
