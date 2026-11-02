/**
 * S2.a slice 3 layouts (docs/S2-layouts.md §5–§6): the content/2 slide keys (label, subtitle, number) on every layout,
 * the compare / quote / image / nested-KPI layouts, people grids and logo walls - built for every golden Mood.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KINDS, catalogue, contentFrame, itemLayout } from '../src/index.js';
import { contains, overlaps } from '../src/geometry.js';
import { NESTED_NODES } from '../src/kinds/kpi-nested.js';
import { peopleColumns } from '../src/kinds/team.js';
import { REPO, errorsOf, validateLayout } from './helpers.js';

const GOLDEN = join(REPO, 'golden', 'expected');
const MOODS = readdirSync(GOLDEN)
  .filter((id) => existsSync(join(GOLDEN, id, 'mood.json')))
  .sort()
  .map((id) => JSON.parse(readFileSync(join(GOLDEN, id, 'mood.json'), 'utf8')));

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
const SLICE3 = [
  'compare-columns',
  'compare-tiers',
  'image-collage',
  'image-device',
  'quote-grid',
  'quote-photo',
  'kpi-nested',
];

const block = (type, nodes, extra = {}) => ({ type, nodes, fields: [], icons: [], chars: {}, ...extra });
const v2 = (keys, ...blocks) => ({
  v2: true,
  keys,
  subtitleChars: 140,
  items: blocks[0]?.nodes ?? 0,
  blocks,
});
const KEYS = { label: true, subtitle: true, number: true };

/** Summaries with the slice-3 blocks (at the catalogue's longest texts) and every slide key. */
const SUMMARIES = [
  v2(KEYS),
  v2({}, block('compare', 2, { fields: ['header', 'label', 'image', 'items', 'check'], rows: 3 })),
  v2(
    KEYS,
    block('compare', 3, { tiers: true, fields: ['header', 'label', 'price', 'per', 'features'], rows: 4 }),
  ),
  v2(KEYS, block('quotes', 3, { fields: ['text', 'name', 'role'], chars: { text: 200 } })),
  v2(KEYS, block('quotes', 4, { fields: ['text', 'name', 'role', 'label'], chars: { text: 200 } })),
  v2(KEYS, block('quotes', 1, { fields: ['text', 'name', 'photo', 'label'], chars: { text: 200 } })),
  v2(KEYS, block('people', 9, { title: true, subtitle: true, fields: ['name', 'role', 'bio'] })),
  v2(KEYS, block('logos', 6, { title: true, rows: 2, perRow: 3, fields: ['name', 'row'] })),
  v2(KEYS, block('logos', 3, { title: true, fields: ['src', 'heading', 'body'], chars: { body: 90 } })),
  v2(KEYS, block('kpis', 3, { nested: true, fields: ['value', 'heading', 'body'] })),
  v2(KEYS, block('image', 3, { fields: ['src', 'caption'] })),
  v2(KEYS, block('image', 1, { treatment: 'device', fields: ['src', 'caption'] })),
  v2(KEYS, block('timeline', 4, { fields: ['when', 'heading', 'body', 'icon', 'lines'] })),
];

/** Frame problems of a built layout (content frame, overlapping text / slot boxes, slots without a box). */
function problems(layout, mood) {
  const out = [];
  const c = contentFrame(mood.geometry);
  for (const b of layout.boxes) {
    if (['footer', 'logo', 'decor'].includes(b.role)) continue;
    // the full-bleed image box is the canvas by design
    if (b.id === 'image' && layout.id === 'image') continue;
    if (!contains(c, b.frame)) out.push(`${b.id} leaves the content frame`);
  }
  const slotted = layout.boxes.filter((b) => b.slot && TEXT_ROLES.has(b.role));
  for (let i = 0; i < slotted.length; i += 1)
    for (let j = i + 1; j < slotted.length; j += 1)
      if (overlaps(slotted[i].frame, slotted[j].frame))
        out.push(`${slotted[i].id} overlaps ${slotted[j].id}`);
  for (const sl of layout.slots)
    if (!layout.boxes.some((b) => b.id === sl.box)) out.push(`slot ${sl.id} has no box`);
  return out;
}

describe('the slice 3 catalogue', () => {
  it('adds the compare, quote, image and nested-KPI layouts, each with a label and tags', () => {
    const ids = catalogue.list().map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(SLICE3));
    expect(catalogue.list()).toHaveLength(68); // 59 + S2.b: 8 main + two asides, agenda-rows
    for (const id of SLICE3) expect(catalogue.get(id).label.length).toBeLessThanOrEqual(30);
  });

  it('match picks the layout from the blocks present', () => {
    const best = (summary, kind) =>
      catalogue
        .forKind(kind)
        .map((d) => [d.id, d.match?.(summary) ?? 0])
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(best(SUMMARIES[1], 'two-column')).toBe('compare-columns');
    expect(best(SUMMARIES[2], 'two-column')).toBe('compare-tiers');
    expect(best(v2({}, block('compare', 2, { fields: ['header', 'items'] })), 'two-column')).toBeUndefined();
    expect(best(SUMMARIES[3], 'quote')).toBe('quote-grid');
    expect(best(SUMMARIES[5], 'quote')).toBe('quote-photo');
    expect(best(v2({}, block('quotes', 1, { fields: ['text'] })), 'quote')).toBeUndefined();
    expect(best(SUMMARIES[9], 'kpi')).toBe('kpi-nested');
    // nested KPIs with another node count than three: the KPI row
    expect(best(v2({}, block('kpis', 4, { nested: true })), 'kpi')).toBeUndefined();
    expect(best(SUMMARIES[10], 'image')).toBe('image-collage');
    expect(best(SUMMARIES[11], 'image')).toBe('image-device');
    expect(NESTED_NODES).toBe(3);
    expect([1, 4, 5, 6, 9].map(peopleColumns)).toEqual([1, 4, 3, 3, 3]);
  });
});

describe.each(MOODS.map((m) => [m.id, m]))('slice 3 layouts for the golden Mood %s', (_id, mood) => {
  it.each(catalogue.list().map((d) => [d.id, d]))(
    '%s builds a schema-valid layout inside the content frame with every slide key',
    (_d, def) => {
      for (const summary of SUMMARIES) {
        const layout = def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind, ...summary } });
        if (!validateLayout(layout)) throw new Error(`${def.id}: ${errorsOf(validateLayout)}`);
        expect([def.id, problems(layout, mood)]).toEqual([def.id, []]);
        for (const s of layout.slots)
          if (s.role)
            expect([def.id, s.role, mood.type.roles[s.role] !== undefined]).toEqual([def.id, s.role, true]);
      }
    },
  );

  it('the label (eyebrow) sits above the title and a content subtitle under it; the body area starts below both', () => {
    const plain = catalogue.get('cards').build({ mood, geometry: mood.geometry, summary: { kind: 'cards' } });
    const keyed = catalogue
      .get('cards')
      .build({ mood, geometry: mood.geometry, summary: { kind: 'cards', ...v2(KEYS) } });
    const box = (l, id) => l.boxes.find((b) => b.id === id);
    if (mood.type.roles.eyebrow) {
      expect(box(keyed, 'label').frame.y).toBeLessThan(box(keyed, 'title').frame.y);
      expect(keyed.slots.find((s) => s.id === 'label').role).toBe('eyebrow');
    } else expect(box(keyed, 'label')).toBeUndefined();
    expect(box(keyed, 'title-subtitle').frame.y).toBeGreaterThanOrEqual(
      box(keyed, 'title').frame.y + box(keyed, 'title').frame.h,
    );
    expect(box(keyed, 'cards').frame.y).toBeGreaterThan(box(plain, 'cards').frame.y);
    // content/1 (no v2 flag) never grows a label / subtitle / number
    const v1 = catalogue
      .get('section')
      .build({ mood, geometry: mood.geometry, summary: { kind: 'section', keys: KEYS } });
    expect(v1.boxes.some((b) => ['label', 'number', 'title-subtitle'].includes(b.id))).toBe(false);
    const sec = catalogue
      .get('section')
      .build({ mood, geometry: mood.geometry, summary: { kind: 'section', ...v2(KEYS) } });
    expect(box(sec, 'number').frame.y).toBeLessThan(box(sec, 'title').frame.y);
  });

  it('item layouts of slice 3 keep every box inside the item', () => {
    const fields = {
      image: true,
      label: true,
      price: true,
      per: true,
      photo: true,
      role: true,
      bio: true,
      logo: true,
      body: true,
    };
    for (const id of ['compare-column', 'tier-card', 'quote-card', 'person-card', 'logo-card'])
      for (const [w, h] of [
        [520, 700],
        [560, 200],
        [300, 300],
      ]) {
        const it = itemLayout(id, { mood, w, h, fields });
        for (const b of it.boxes)
          expect([id, w, h, b.id, contains({ x: 0, y: 0, w, h }, b.frame)]).toEqual([id, w, h, b.id, true]);
      }
  });
});

describe('negative: a box out of the content frame is caught', () => {
  it('a label pushed above the margin fails the frame check', () => {
    const mood = MOODS[0];
    const layout = structuredClone(
      catalogue
        .get('cards')
        .build({ mood, geometry: mood.geometry, summary: { kind: 'cards', ...v2(KEYS) } }),
    );
    layout.boxes.find((b) => b.id === 'label').frame.y = 0;
    expect(problems(layout, mood).some((p) => /label leaves/.test(p))).toBe(true);
  });
});

it('KINDS stay the v1 defaults', () => {
  for (const k of KINDS) expect(catalogue.forKind(k)[0].id).toBe(k);
});
