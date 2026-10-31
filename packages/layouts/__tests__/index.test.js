import {
  ALIASES,
  CANVAS,
  KINDS,
  MAX_ITEMS,
  buildLayout,
  catalogue,
  contentFrame,
  itemLayout,
  items,
  layouts,
  safe,
  titleBox,
} from '../src/index.js';
import { contains, overlaps } from '../src/geometry.js';
import { errorsOf, loadMood, outMoods, validateLayout } from './helpers.js';

const MOODS = ['stripe', 'rukko', 'hdfc-2'].map(loadMood);
const BLEED = new Set(['cover', 'section', 'cta', 'image']);
const TEXT_ROLES = new Set([
  'title',
  'subtitle',
  'eyebrow',
  'body',
  'list',
  'quote',
  'attribution',
  'number',
  'footer',
]);
const CANVAS_FRAME = { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h };
const FLOW_KIND = {
  cards: 'cards',
  kpi: 'kpi',
  steps: 'steps',
  team: 'team',
  logos: 'logos',
  timeline: 'timeline',
};

/** Summaries each kind is built with: empty, the showcase's counts, over capacity, and the image / column variants. */
const SUMMARIES = [
  {},
  { items: 3, chars: 240 },
  { items: 4, columns: 2 },
  { items: 12, chars: 900 },
  { hasImage: true, columns: 2, items: 1 },
  { columns: 3 },
];

/** Layout-level invariants; returns a list of problems (empty = fine). Used for both positive and negative tests. */
export function problems(layout, mood) {
  const out = [];
  const c = contentFrame(mood.geometry);
  const s = safe(mood);
  const ids = new Set();
  for (const b of layout.boxes) {
    if (ids.has(b.id)) out.push(`duplicate box ${b.id}`);
    ids.add(b.id);
    if (!contains(CANVAS_FRAME, b.frame)) out.push(`${b.id} leaves the canvas`);
    if (b.role === 'decor') continue;
    if (b.role === 'footer' || b.role === 'logo') {
      if (!contains(s, b.frame)) out.push(`${b.id} leaves the safe area`);
    } else if (BLEED.has(layout.kind)) {
      if (TEXT_ROLES.has(b.role) && !contains(s, b.frame)) out.push(`${b.id} (text) leaves the safe area`);
    } else if (!contains(c, b.frame)) out.push(`${b.id} leaves the content frame`);
  }
  for (const sl of layout.slots) if (!ids.has(sl.box)) out.push(`slot ${sl.id} → missing box ${sl.box}`);
  for (const b of layout.boxes)
    if (b.slot && !layout.slots.some((sl) => sl.id === b.slot))
      out.push(`box ${b.id} → missing slot ${b.slot}`);
  const solid = layout.boxes.filter((b) => b.role !== 'decor');
  for (const z of layout.decor?.zones ?? []) {
    if (!contains(CANVAS_FRAME, z)) out.push('zone leaves the canvas');
    for (const b of solid) if (overlaps(z, b.frame)) out.push(`zone overlaps ${b.id}`);
  }
  return out;
}

describe('catalogue', () => {
  it('has one LayoutDef per v1 kind, with id / kind / version 1 / tags / build', () => {
    expect(catalogue.list().map((d) => d.kind)).toEqual(KINDS);
    for (const d of catalogue.list()) {
      expect(d).toMatchObject({ id: d.kind, kind: d.kind, version: 1 });
      expect(Array.isArray(d.tags)).toBe(true);
      expect(typeof d.build).toBe('function');
      expect(catalogue.get(d.id)).toBe(d);
      expect(catalogue.forKind(d.kind)).toEqual([d]);
    }
    expect(layouts).toHaveLength(KINDS.length);
  });

  it('resolves the aliases diagram → steps, comparison → two-column, blank → text', () => {
    expect(ALIASES).toEqual({ diagram: 'steps', comparison: 'two-column', blank: 'text' });
    expect(catalogue.forKind('diagram')[0].id).toBe('steps');
    expect(catalogue.forKind('comparison')[0].id).toBe('two-column');
    expect(catalogue.forKind('blank')[0].id).toBe('text');
    expect(buildLayout('comparison', MOODS[0], { columns: 2 }).kind).toBe('two-column');
  });

  it('returns nothing for an unknown kind or id', () => {
    expect(catalogue.forKind('nope')).toEqual([]);
    expect(catalogue.get('nope')).toBeUndefined();
    expect(buildLayout('nope', MOODS[0])).toBeNull();
  });
});

describe.each(MOODS.map((m) => [m.id, m]))('every kind for %s', (_id, mood) => {
  it.each(KINDS)('%s builds, validates and stays in its frames', (kind) => {
    for (const summary of SUMMARIES) {
      const layout = catalogue
        .forKind(kind)[0]
        .build({ mood, geometry: mood.geometry, summary: { kind, ...summary } });
      const ok = validateLayout(layout);
      if (!ok) throw new Error(`${kind} ${JSON.stringify(summary)}: ${errorsOf(validateLayout)}`);
      expect(problems(layout, mood)).toEqual([]);
      expect(Array.isArray(layout.decor.zones)).toBe(true);
      const title = layout.slots.find((s) => s.id === 'title');
      expect(title).toMatchObject({ type: 'text', required: true });
      expect(mood.type.roles[title.role]).toBeDefined();
      for (const s of layout.slots) {
        if (s.id !== 'title') expect(s.required).toBe(false);
        if (s.role) expect(mood.type.roles[s.role]).toBeDefined();
      }
    }
  });

  it('is deterministic', () => {
    for (const kind of KINDS)
      expect(JSON.stringify(buildLayout(kind, mood, { items: 3 }))).toBe(
        JSON.stringify(buildLayout(kind, mood, { items: 3 })),
      );
  });

  it('flow boxes get columns = min(maxItems, summary.items) (a column flow = 1 column)', () => {
    for (const [kind, key] of Object.entries(FLOW_KIND)) {
      for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 20]) {
        const layout = buildLayout(kind, mood, { items: n });
        const flows = layout.boxes.filter((b) => b.flow);
        expect(flows).toHaveLength(1);
        const { flow } = flows[0];
        expect(flow.gap).toBe('md');
        expect(items[flow.itemLayout]).toBeDefined();
        expect(flow.columns).toBe(flow.direction === 'column' ? 1 : Math.min(MAX_ITEMS[key], n));
        const slot = layout.slots.find((s) => s.box === flows[0].id);
        expect(slot.capacity).toEqual({ minItems: 1, maxItems: MAX_ITEMS[key] });
      }
    }
  });

  it('missing summary fields count as 0 / false (one flow column, no image variant)', () => {
    expect(buildLayout('cards', mood).boxes.find((b) => b.flow).flow.columns).toBe(1);
    expect(buildLayout('two-column', mood).slots.some((s) => s.type === 'image')).toBe(false);
  });

  it('content titles sit in the title zone', () => {
    const t = titleBox(mood);
    const tz = mood.geometry.titleZone;
    expect(t).toEqual({
      x: mood.geometry.margins.left,
      y: tz.y,
      w: contentFrame(mood.geometry).w,
      h: tz.height,
    });
    for (const kind of [
      'agenda',
      'bullets',
      'text',
      'two-column',
      'cards',
      'steps',
      'timeline',
      'kpi',
      'chart',
      'table',
      'image-text',
      'quote',
      'team',
      'logos',
    ]) {
      expect(buildLayout(kind, mood, { items: 3 }).boxes.find((b) => b.id === 'title').frame).toEqual(t);
    }
  });
});

describe('title zone', () => {
  it('stripe: y 80, h 120; hdfc-2: y 226, h 160; rukko: y 104, h 150', () => {
    const [stripe, rukko, hdfc] = MOODS;
    expect(titleBox(stripe)).toMatchObject({ y: 80, h: 120 });
    expect(titleBox(hdfc)).toMatchObject({ y: 226, h: 160 });
    expect(titleBox(rukko)).toMatchObject({ y: 104, h: 150 });
  });

  it('without a titleZone: y = margins.top, h = 2 × h1.size × h1.lineHeight', () => {
    const m = structuredClone(MOODS[2]);
    delete m.geometry.titleZone;
    const h1 = m.type.roles.h1;
    expect(titleBox(m)).toEqual({ x: 85, y: 226, w: 1750, h: 2 * h1.size * h1.lineHeight });
  });
});

describe('hints (cover / section / cta)', () => {
  const [stripe, rukko, hdfc] = MOODS;
  const box = (l, id) => l.boxes.find((b) => b.id === id);

  it('cover: display title in the lower half, footer and logo from the hint', () => {
    for (const m of MOODS) {
      const l = buildLayout('cover', m);
      const c = contentFrame(m.geometry);
      expect(l.slots.find((s) => s.id === 'title').role).toBe('display');
      expect(box(l, 'title').frame.y).toBeGreaterThanOrEqual(c.y + c.h / 2);
      expect(l.footer).toBe('hide');
      expect(box(l, 'footer')).toBeUndefined();
    }
    expect(buildLayout('cover', stripe).logo).toBe('large');
    expect(buildLayout('cover', hdfc).logo).toBe('none');
    expect(box(buildLayout('cover', hdfc), 'logo')).toBeUndefined();
    expect(buildLayout('cover', rukko).surface).toEqual({ allow: ['red'], prefer: 'accent' });
  });

  it('cover: a non-display title role puts the title at the top', () => {
    const m = structuredClone(stripe);
    m.composition.layoutHints.cover.titleRole = 'h1';
    const l = buildLayout('cover', m);
    expect(box(l, 'title').frame.y).toBe(contentFrame(m.geometry).y);
    expect(l.slots.find((s) => s.id === 'title').role).toBe('h1');
  });

  it('cta: a hint role the Mood does not define (hdfc-2 closingTitle) falls back to display', () => {
    expect(hdfc.type.roles.closingTitle).toBeUndefined();
    expect(buildLayout('cta', hdfc).slots.find((s) => s.id === 'title').role).toBe('display');
  });

  it('section: hinted surface; prefer dark only when palette.perKind.section is absent', () => {
    expect(buildLayout('section', stripe).surface).toEqual({ allow: ['navy'], prefer: 'dark' });
    const noHint = structuredClone(stripe);
    delete noHint.composition.layoutHints.section;
    expect(buildLayout('section', noHint).surface).toBeUndefined();
    delete noHint.palette.perKind.section;
    expect(buildLayout('section', noHint).surface).toEqual({ prefer: 'dark' });
  });

  it('logo box: at logo.position inside the safe area, height = logo.height[size]', () => {
    const l = buildLayout('section', hdfc); // hint logo small, position top-right, small 72
    const f = box(l, 'logo').frame;
    const s = safe(hdfc);
    expect(f.h).toBe(72);
    expect(f.y).toBe(s.y);
    expect(f.x + f.w).toBeCloseTo(s.x + s.w, 1);
    // stripe bullets: small logo bottom-left; the footer band gives way to it.
    const b = buildLayout('bullets', stripe);
    expect(overlaps(box(b, 'logo').frame, box(b, 'footer').frame)).toBe(false);
  });
});

describe('component tokens', () => {
  const [stripe, rukko, hdfc] = MOODS;
  it('quote alignment from components.quote.tokens.align (stripe center, rukko / hdfc-2 left)', () => {
    const q = (m) => buildLayout('quote', m).boxes.find((b) => b.id === 'quote');
    expect(q(stripe).align.h).toBe('center');
    expect(q(rukko).align.h).toBe('left');
    expect(q(rukko).frame.x).toBe(contentFrame(rukko.geometry).x);
    expect(q(hdfc).align.h).toBe('left');
    const m = structuredClone(stripe);
    delete m.components.quote;
    expect(q(m).align.h).toBe('center'); // layout default (P2-spec §2)
  });

  it('steps direction from components.steps.tokens.orientation (stripe vertical, rukko horizontal)', () => {
    expect(buildLayout('steps', stripe, { items: 3 }).boxes.find((b) => b.flow).flow.direction).toBe(
      'column',
    );
    expect(buildLayout('steps', rukko, { items: 3 }).boxes.find((b) => b.flow).flow.direction).toBe('row');
    expect(buildLayout('steps', hdfc, { items: 3 }).boxes.find((b) => b.id === 'connector')).toBeUndefined(); // line: false
    expect(buildLayout('steps', rukko, { items: 3 }).boxes.find((b) => b.id === 'connector')).toBeDefined();
  });

  it('bullets capacity from type.bullets (maxPerSlide, maxDepth)', () => {
    expect(buildLayout('bullets', hdfc).slots.find((s) => s.id === 'list').capacity).toEqual({
      minItems: 1,
      maxItems: 6,
      maxLevels: 2,
    });
  });

  it('two-column with an image: left column is the image slot', () => {
    const l = buildLayout('two-column', stripe, { hasImage: true, columns: 2 });
    expect(l.slots.map((s) => s.id)).toEqual(['title', 'image', 'subtitle', 'body']);
  });
});

describe('item layouts', () => {
  it.each(Object.keys(items))('%s stays inside its item frame, slots point at boxes', (id) => {
    for (const mood of MOODS) {
      for (const [w, h] of [
        [400, 500],
        [1700, 120],
        [200, 160],
      ]) {
        const it = itemLayout(id, { mood, w, h });
        expect(it.id).toBe(id);
        for (const b of it.boxes) expect(contains({ x: 0, y: 0, w, h }, b.frame)).toBe(true);
        for (const s of it.slots) expect(it.boxes.some((b) => b.id === s.box)).toBe(true);
        for (const s of it.slots) if (s.role) expect(mood.type.roles[s.role]).toBeDefined();
      }
    }
  });

  it('unknown item layout throws', () => {
    expect(() => itemLayout('nope', { mood: MOODS[0], w: 1, h: 1 })).toThrow('unknown item layout');
  });
});

describe('negative tests (the checks catch broken output)', () => {
  const mood = MOODS[0];
  it('schema rejects an unknown box role and a missing frame', () => {
    const l = structuredClone(buildLayout('bullets', mood));
    l.boxes[0].role = 'banner';
    expect(validateLayout(l)).toBe(false);
    const l2 = structuredClone(buildLayout('bullets', mood));
    delete l2.boxes[0].frame;
    expect(validateLayout(l2)).toBe(false);
  });

  it('the frame checks catch a box pushed off the canvas / out of the content frame / a dirty zone', () => {
    const l = structuredClone(buildLayout('bullets', mood));
    l.boxes.find((b) => b.id === 'list').frame.x = 1900;
    expect(problems(l, mood)).toEqual(
      expect.arrayContaining(['list leaves the canvas', 'list leaves the content frame']),
    );
    const l2 = structuredClone(buildLayout('bullets', mood));
    l2.decor.zones.push(l2.boxes.find((b) => b.id === 'title').frame);
    expect(problems(l2, mood)).toContain('zone overlaps title');
    const l3 = structuredClone(buildLayout('cover', mood));
    l3.boxes.find((b) => b.id === 'subtitle').frame.y = 1060;
    expect(problems(l3, mood)).toContain('subtitle (text) leaves the safe area');
  });
});

describe('every Mood in out/ (when present)', () => {
  const moods = outMoods();
  (moods.length ? it : it.skip)(`builds every kind for ${moods.length} Moods`, () => {
    for (const mood of moods) {
      for (const kind of KINDS) {
        const layout = buildLayout(kind, mood, { items: 4, columns: 2 });
        if (!validateLayout(layout)) throw new Error(`${mood.id} ${kind}: ${errorsOf(validateLayout)}`);
        expect([mood.id, kind, problems(layout, mood)]).toEqual([mood.id, kind, []]);
      }
    }
  });
});

describe('engine conventions (P2-spec §7 F5 / F6)', () => {
  const mood = MOODS[0];
  it('two-column slots are col<N>-title / col<N>-body', () => {
    const ids = buildLayout('two-column', mood, { columns: 2 }).slots.map((s) => s.id);
    expect(ids).toEqual(['title', 'col1-title', 'col1-body', 'col2-title', 'col2-body']);
    expect(buildLayout('two-column', mood, { columns: 3 }).slots.map((s) => s.id)).toContain('col3-body');
  });
  it('team binds a `people` slot (layout schema v1.2); a schema without it rejects the layout (negative)', () => {
    const team = buildLayout('team', mood, { items: 3 });
    expect(team.slots.find((s) => s.box === 'team').type).toBe('people');
    expect(validateLayout(team)).toBe(true);
    const bad = structuredClone(team);
    bad.slots.find((s) => s.box === 'team').type = 'persons';
    expect(validateLayout(bad)).toBe(false);
  });
  it('the catalogue stamps item layouts for flow cells (itemLayout + flowCells)', () => {
    const cells = catalogue.flowCells({ x: 0, y: 0, w: 1000, h: 200 }, 4, 20, 'row');
    expect(cells.map((c) => c.w)).toEqual([235, 235, 235, 235]);
    const item = catalogue.itemLayout('card-title-text', { mood, w: cells[0].w, h: cells[0].h });
    expect(item.slots.map((s) => s.id)).toEqual(['title', 'text']);
    expect(() => catalogue.itemLayout('nope', { mood, w: 1, h: 1 })).toThrow('unknown item layout');
  });
});
