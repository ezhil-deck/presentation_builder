import { catalogue } from '@pb/layouts';
import { fixtureCatalogue } from '../__fixtures__/layouts.js';
import {
  KIND_ALIASES,
  composeDeck,
  createDecorState,
  parseMarkdown,
  placeDecor,
  summarize,
  surfaceFor,
  validateDeck,
  validateLayout,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, showcaseMd, stripeBrandSpec, stripeMood } from './helpers.js';

const mood = stripeMood();
const brandSpec = stripeBrandSpec();
const content = parseMarkdown(showcaseMd(), { brandSpec });
const compose = () => composeDeck({ content, mood, brandSpec, catalogue, engineVersion: '0.0.0' });
const { deck, warnings } = compose();
const assetFile = (id) => deck.assets[id]?.file;

describe('fixture catalogue', () => {
  it('every layout builds a schema-valid Layout for the stripe mood', () => {
    for (const def of fixtureCatalogue.list()) {
      const layout = def.build({ mood, geometry: mood.geometry, summary: { kind: def.kind, items: 4 } });
      expect([def.id, validateLayout(layout)]).toEqual([def.id, []]);
      expect(layout.kind).toBe(def.kind);
    }
    expect(fixtureCatalogue.forKind('chart').map((d) => d.id)).toEqual(['chart-full']);
    expect(fixtureCatalogue.get('kpi-row').kind).toBe('kpi');
  });
});

describe('composeDeck: stripe mood + showcase + the real catalogue (@pb/layouts)', () => {
  it('writes a schema-valid deck, one slide per content slide', () => {
    expect(validateDeck(deck)).toEqual([]);
    expect(deck.schema).toBe('deck/1');
    expect(deck.slides).toHaveLength(content.slides.length);
    expect(deck.canvas).toEqual({ width: 1920, height: 1080 });
    expect(deck.source).toMatchObject({ brandId: 'stripe', moodId: 'stripe' });
    expect(deck.fonts.map((f) => f.family)).toEqual(['Sohne']);
    expect(deck.title).toBe('Showcase deck');
  });

  it('the deck / layout validators reject broken documents (negative)', () => {
    const bad = { ...deck, slides: [{ ...deck.slides[0], background: { type: 'solid', color: 'red' } }] };
    expect(validateDeck(bad).length).toBeGreaterThan(0);
    expect(validateDeck({ ...deck, canvas: { width: 1280, height: 720 } }).length).toBeGreaterThan(0);
    expect(
      validateLayout({ schema: 'layout/1', id: 'Bad Id', kind: 'cover', boxes: [], slots: [] }).length,
    ).toBeGreaterThan(0);
  });

  it('G8: deck schema accepts image.animated (an asset id) and rejects a non-string', () => {
    const withAnimated = (value) => {
      const d = structuredClone(deck);
      const el = d.slides.flatMap((s) => s.elements).find((e) => e.type === 'image');
      el.image.animated = value;
      return d;
    };
    expect(validateDeck(withAnimated(Object.keys(deck.assets)[0]))).toEqual([]);
    expect(validateDeck(withAnimated(5)).length).toBeGreaterThan(0);
  });

  it('is deterministic (byte-identical JSON) and keys are sorted', () => {
    expect(JSON.stringify(compose())).toBe(JSON.stringify({ deck, warnings }));
    expect(Object.keys(deck)).toEqual([...Object.keys(deck)].sort());
  });

  it('surfaces follow pinned -> perKind -> rhythm (cover/section/cta never take a rhythm step)', () => {
    const { perKind, rhythm } = mood.palette;
    let j = 0;
    const expected = content.slides.map((s) => {
      const kinds = [s.kind, KIND_ALIASES[s.kind]].filter(Boolean);
      const hit = kinds.map((k) => perKind[k]).find(Boolean);
      if (hit) return hit;
      if (['cover', 'section', 'cta'].includes(s.kind)) return 'page';
      const id = rhythm[j % rhythm.length];
      j += 1;
      return id;
    });
    expect(deck.slides.map((s) => s.surfaceId)).toEqual(expected);
    const by = Object.fromEntries(deck.slides.map((s) => [s.id, s.surfaceId]));
    // G7: text (s4), steps (s8) and table (s15) are named by no stripe layout, so they cycle the rhythm
    // (page, light, page, navy, ...) instead of taking the content layout's surface
    expect([by.s1, by.s3, by.s4, by.s8, by.s15, by.s19, by.s24]).toEqual([
      'page',
      'navy',
      'page',
      'light',
      'navy',
      'light',
      'navy',
    ]);
  });

  it('G7 on akgmedia: content slides cycle its rhythm; cover / section / cta / quote keep their named surfaces', () => {
    const read = (f) => JSON.parse(readFileSync(join(ROOT, 'golden/expected/akgmedia', f), 'utf8'));
    const akgSpec = read('brand-spec.json');
    const akgMood = read('mood.json');
    const akgContent = parseMarkdown(showcaseMd(), { brandSpec: akgSpec });
    const build = (m) =>
      composeDeck({ content: akgContent, mood: m, brandSpec: akgSpec, catalogue, engineVersion: '0.0.0' })
        .deck;
    const slides = build(akgMood).slides;
    const named = { cover: 'black', section: 'ultramarine', cta: 'black', quote: 'pink' };
    for (const s of slides) if (named[s.kind]) expect([s.kind, s.surfaceId]).toEqual([s.kind, named[s.kind]]);
    const rest = slides.filter((s) => !named[s.kind]).map((s) => s.surfaceId);
    for (const id of ['black', 'snow', 'pink', 'ultramarine', 'white']) expect(rest).toContain(id);
    // negative: the G1 expansion on palette.perKind (every unnamed content kind -> the content layout's white)
    // collapses the content slides to white + the kpi's named snow
    const g1 = structuredClone(akgMood);
    for (const k of ['text', 'steps', 'timeline', 'table', 'team', 'logos']) g1.palette.perKind[k] = 'white';
    const collapsed = build(g1)
      .slides.filter((s) => !named[s.kind] && s.kind !== 'image')
      .map((s) => s.surfaceId);
    expect(new Set(collapsed)).toEqual(new Set(['white', 'snow']));
  });

  it('kinds with no perKind entry take rhythm steps; cover/section/cta never do', () => {
    const m = structuredClone(mood);
    m.palette.perKind = { cover: 'page', section: 'navy', cta: 'navy' };
    m.palette.rhythm = ['page', 'light'];
    const d = composeDeck({ content, mood: m, brandSpec, catalogue, engineVersion: '0.0.0' }).deck;
    let j = 0;
    const expected = content.slides.map((s) => {
      if (m.palette.perKind[s.kind]) return m.palette.perKind[s.kind];
      const id = m.palette.rhythm[j % 2];
      j += 1;
      return id;
    });
    expect(d.slides.map((s) => s.surfaceId)).toEqual(expected);
    expect(new Set(expected)).toEqual(new Set(['page', 'light', 'navy']));
  });

  it('uses the layoutHints background variant when the surface carries it (cover -> heroRibbon image)', () => {
    const cover = deck.slides[0];
    expect(cover.background.type).toBe('image');
    expect(assetFile(cover.background.asset)).toBe('assets/art-hero-slide.png');
    expect(deck.slides[3].background).toEqual({ type: 'solid', color: '#FFFFFF' });
    expect(deck.slides[2].background).toEqual({ type: 'solid', color: '#0D1738' });
  });

  it('picks the logo variant per surface and the size per kind', () => {
    const logos = deck.slides.flatMap((s) =>
      s.elements
        .filter((e) => e.type === 'image' && (e.role === 'logo' || e.id.endsWith('-footer-logo')))
        .map((e) => ({ s, e })),
    );
    expect(logos.length).toBeGreaterThan(10);
    for (const { s, e } of logos) {
      expect([s.id, assetFile(e.image.asset)]).toEqual([
        s.id,
        mood.logo.variants[mood.logo.perSurface[s.surfaceId]].file,
      ]);
      expect(e.frame.h).toBe(mood.logo.height.small);
    }
    const ctaLogo = deck.slides[23].elements.find((e) => e.role === 'logo');
    expect(assetFile(ctaLogo.image.asset)).toBe('assets/logo-light.svg'); // navy -> monoLight
    // bullets: perKind small + the footer shows the logo -> one logo only
    expect(
      deck.slides[4].elements.filter((e) => e.type === 'image' && /logo/.test(e.name ?? '')),
    ).toHaveLength(1);
  });

  it('hides the footer on cover / section / cta and shows it elsewhere', () => {
    for (const s of deck.slides) {
      const footer = s.elements.filter((e) => e.role === 'footer');
      if (['cover', 'section', 'cta'].includes(s.kind)) expect([s.id, footer]).toEqual([s.id, []]);
      else expect(footer.map((e) => e.id)).toEqual([`${s.id}-footer-logo`, `${s.id}-footer-pageNumber`]);
    }
    const pn = deck.slides[3].elements.find((e) => e.id === 's4-footer-pageNumber');
    expect(pn.text.lines[0].text).toBe('4');
    expect(pn.frame.y).toBe(1080 - mood.geometry.margins.bottom);
  });

  it('places decor "rays" only on section / cta slides on the navy surface, every 2nd eligible slide', () => {
    const withRays = deck.slides.filter((s) => s.elements.some((e) => e.name === 'rays'));
    expect(withRays.length).toBeGreaterThan(0);
    for (const s of withRays) {
      expect(['section', 'cta']).toContain(s.kind);
      expect(s.surfaceId).toBe('navy');
    }
    // eligible: s3, s10, s16 (section) and s24 (cta) -> frequency "often" places on the 1st and 3rd
    expect(withRays.map((s) => s.id)).toEqual(['s3', 's16']);
    const rays = withRays[0].elements.find((e) => e.name === 'rays');
    expect(rays).toMatchObject({
      z: 10,
      role: 'decor',
      frame: { x: 0, y: 560, w: 1920, h: 520 },
      style: { opacity: 0.85 },
    });
  });

  it('orders elements by z and lays text out as fitted lines', () => {
    for (const s of deck.slides) {
      const zs = s.elements.map((e) => e.z);
      expect([...zs].sort((a, b) => a - b)).toEqual(zs);
    }
    const title = deck.slides[3].elements.find((e) => e.role === 'title');
    expect(title.text.font).toMatchObject({ family: 'Sohne', size: 56, color: '#061B31' });
    expect(title.text.lines[0].text).toBe('A title and a short statement');
    const kpi = deck.slides[10].elements.filter((e) => e.slot === 'kpis' && e.id.endsWith('-value'));
    expect(new Set(kpi.map((e) => e.text.fit.appliedSize)).size).toBe(1); // shared sizing in a flow
    expect(deck.slides[11].elements.find((e) => e.type === 'chart').chart.geometry.bars).toHaveLength(8);
    const table = deck.slides[14].elements.find((e) => e.type === 'table').table;
    expect(table.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1644, 6);
  });

  it('fills a two-column slide from its columns block (col<N>-title / col<N>-body, F5); image-text binds image + text', () => {
    const s6 = deck.slides[5].elements.map((e) => e.slot).filter(Boolean);
    expect(s6).toEqual(expect.arrayContaining(['col1-title', 'col1-body', 'col2-title', 'col2-body']));
    const s18 = deck.slides[17];
    expect(s18).toMatchObject({ kind: 'image-text', layoutId: 'image-text' });
    expect(s18.elements.find((e) => e.slot === 'image').type).toBe('image');
    expect(s18.elements.find((e) => e.slot === 'subtitle').text.lines[0].text).toBe(
      "Pictures follow the brand's imagery direction",
    );
    expect(s18.elements.find((e) => e.slot === 'body').type).toBe('text');
    expect(warnings.filter((w) => w.slide === 's18' && w.check === 'binding')).toEqual([]);
  });

  it('every kind of the showcase has its own layout; aliases resolve (diagram -> steps)', () => {
    expect(deck.slides.map((s) => s.layoutId)).toEqual(deck.slides.map((s) => s.kind));
    expect(warnings.filter((w) => w.check === 'layout' || w.check === 'layout-schema')).toEqual([]);
    expect(deck.slides[21]).toMatchObject({ kind: 'steps', requestedKind: 'diagram' });
  });

  it('flow items are stamped from the catalogue item layouts (F6) with one shared size per slot', () => {
    const cards = deck.slides[6].elements.filter((e) => e.slot === 'cards');
    expect(cards.filter((e) => e.type === 'shape')).toHaveLength(4); // the card background per item
    const titles = cards.filter((e) => e.id.endsWith('-title'));
    expect(titles).toHaveLength(4);
    expect(new Set(titles.map((e) => e.text.fit.appliedSize)).size).toBe(1);
    // the title sits inside its card, at the card padding (components.card.tokens.padding)
    const bg = cards.find((e) => e.id === 's7-cards-0-bg');
    expect(titles[0].frame.x).toBeCloseTo(bg.frame.x + mood.components.card.tokens.padding, 2);
    const people = deck.slides[19].elements.filter((e) => e.slot === 'team');
    expect(people.filter((e) => e.id.endsWith('-name')).map((e) => e.text.lines[0].text)).toEqual([
      'First Person',
      'Second Person',
      'Third Person',
    ]);
    expect(people.filter((e) => e.name === 'avatar placeholder')).toHaveLength(3);
    const steps = deck.slides[7].elements.filter((e) => e.slot === 'steps');
    expect(steps.filter((e) => e.id.endsWith('-number')).map((e) => e.text.lines[0].text)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(deck.slides[7].elements.some((e) => e.type === 'line' && e.role === 'divider')).toBe(true);
  });

  it('list items carry the engine bullet geometry (F4)', () => {
    const list = deck.slides[4].elements.find((e) => e.slot === 'list');
    const firsts = list.text.lines.filter((l, k, all) => k === 0 || all[k - 1].paragraph !== l.paragraph);
    for (const l of firsts) {
      expect(l.bullet).toMatchObject({ text: expect.any(String), x: expect.any(Number) });
      expect(l.bullet.x + l.bullet.width).toBeLessThanOrEqual(l.x);
    }
  });

  it('charts carry the renderer geometry shape (F8)', () => {
    const chart = deck.slides[11].elements.find((e) => e.type === 'chart').chart;
    expect(chart.geometry.bars).toHaveLength(8);
    expect(Array.isArray(chart.geometry.ticks.y)).toBe(true);
    expect(Array.isArray(chart.geometry.legend)).toBe(true);
    const donut = deck.slides[13].elements.find((e) => e.type === 'chart').chart;
    expect(donut.geometry.arcs[0].a0).toBe(0);
  });
});

describe('composeDeck negative cases', () => {
  const one = (slide) =>
    composeDeck({
      content: {
        schema: 'content/1',
        slides: [{ id: 'a', kind: 'cover', blocks: [{ type: 'title', text: 'Cover' }] }, slide],
      },
      mood,
      brandSpec,
      catalogue,
    });

  it('an unknown kind is composed as "text" with a warning', () => {
    const { deck: d, warnings: w } = one({
      id: 'x',
      kind: 'mystery',
      blocks: [{ type: 'title', text: 'T' }],
    });
    expect(d.slides[1]).toMatchObject({ kind: 'text', layoutId: 'text', requestedKind: 'mystery' });
    expect(w).toContainEqual(
      expect.objectContaining({
        slide: 'x',
        check: 'kind',
        message: expect.stringMatching(/unknown slide kind "mystery"/),
      }),
    );
  });

  it('a required title slot with no title block is a warning (the slide still composes)', () => {
    const { deck: d, warnings: w } = one({
      id: 'x',
      kind: 'text',
      blocks: [{ type: 'paragraph', text: 'Body only' }],
    });
    expect(w).toContainEqual(
      expect.objectContaining({
        slide: 'x',
        check: 'binding',
        message: expect.stringMatching(/required slot "title"/),
      }),
    );
    expect(d.slides[1].elements.some((e) => e.slot === 'body')).toBe(true);
  });

  it('a block no slot takes is a warning', () => {
    const { warnings: w } = one({
      id: 'x',
      kind: 'chart',
      blocks: [
        { type: 'title', text: 'T' },
        { type: 'paragraph', text: 'stray' },
      ],
    });
    expect(w).toContainEqual(
      expect.objectContaining({ slide: 'x', message: expect.stringMatching(/paragraph block has no slot/) }),
    );
  });

  it('text that cannot fit at fit.min is an overflow warning with the fitText fix', () => {
    const long = Array.from({ length: 1500 }, (_, k) => `word${k}`).join(' ');
    const { deck: d, warnings: w } = one({
      id: 'x',
      kind: 'text',
      blocks: [
        { type: 'title', text: 'T' },
        { type: 'paragraph', text: long },
      ],
    });
    const body = d.slides[1].elements.find((e) => e.slot === 'body');
    // F1: 22.4 -> 20.4 -> fit.min 19.6 (the step that would pass fit.min lands on it)
    expect(body.text.fit).toMatchObject({ overflow: true, requestedSize: 22.4, appliedSize: 19.6, steps: 2 });
    expect(w).toContainEqual(
      expect.objectContaining({
        check: 'overflow',
        elementId: 'x-body',
        fix: { command: 'fitText', args: { allowBelowMin: true } },
      }),
    );
  });

  it('needs a Mood, Content and a catalogue (the P0 stub is gone, F9)', () => {
    expect(() => composeDeck({ content })).toThrow(/expects a Mood/);
    expect(() => composeDeck({ content, mood })).toThrow(/catalogue/);
    expect(() => composeDeck({ mood, catalogue })).toThrow(/needs Content/);
  });
});

describe('text over images and decor (golden moods)', () => {
  const load = (id) => JSON.parse(readFileSync(join(ROOT, 'golden', 'expected', id, 'mood.json'), 'utf8'));
  const slide = (kind, blocks) => ({
    schema: 'content/1',
    slides: [
      { id: 'a', kind: 'cover', blocks: [{ type: 'title', text: 'Cover' }] },
      { id: 'x', kind, blocks },
    ],
  });

  it('a title on a full-bleed image gets the brand overlay (decor.imagery.textOverImage) under it', () => {
    const m = load('hdfc-2');
    const { deck: d } = composeDeck({
      content: slide('image', [
        { type: 'title', text: 'Short title' },
        { type: 'image', src: 'assets/photo.jpg' },
      ]),
      mood: m,
      catalogue,
    });
    const els = d.slides[1].elements;
    const overlay = els.find((e) => e.role === 'overlay');
    const toi = m.decor.imagery.textOverImage;
    expect(overlay.style.fill.stops.at(-1).color.slice(0, 7)).toBe(toi.overlay.toUpperCase());
    const order = els.map((e) => e.role);
    expect(order.indexOf('image')).toBeLessThan(order.indexOf('overlay'));
    expect(order.indexOf('overlay')).toBeLessThan(order.indexOf('title'));
    // negative: no overlay when the brand gives opacity 0 (akgmedia)
    const { deck: d2 } = composeDeck({
      content: slide('image', [
        { type: 'title', text: 'Short title' },
        { type: 'image', src: 'assets/photo.jpg' },
      ]),
      mood: load('akgmedia'),
      catalogue,
    });
    expect(d2.slides[1].elements.some((e) => e.role === 'overlay')).toBe(false);
  });

  it('a text box ends one gutter before a brand-boxed decor on its right; kept when the text needs the width', () => {
    const m = load('akgmedia');
    const sphere = m.decor.elements.find((e) => e.id === 'swirlSection');
    const compose1 = (title) =>
      composeDeck({ content: slide('section', [{ type: 'title', text: title }]), mood: m, catalogue }).deck
        .slides[1];
    const short = compose1('Short');
    expect(short.surfaceId).toBe(sphere.surfaces[0]); // the decor shows on this surface only
    expect(short.elements.some((e) => e.name === 'swirlSection')).toBe(true);
    const t = short.elements.find((e) => e.role === 'title');
    expect(t.frame.x + t.frame.w).toBeCloseTo(sphere.box.x - m.geometry.grid.gutter, 2);
    const long = compose1('Section dividers carry the brand strongest surface across every deck');
    const lt = long.elements.find((e) => e.role === 'title');
    expect(lt.text.fit.overflow).toBe(false);
  });
});

describe('surfaceFor / placeDecor units', () => {
  it('a pinned surface wins; the layout prefer (dark) applies when perKind is silent', () => {
    expect(surfaceFor(0, { kind: 'text', surface: 'navy' }, mood).id).toBe('navy');
    const noPerKind = { ...mood, palette: { ...mood.palette, perKind: {} } };
    expect(surfaceFor(0, { kind: 'section' }, noPerKind, undefined, { surface: { prefer: 'dark' } }).id).toBe(
      'navy',
    );
    expect(surfaceFor(0, { kind: 'section' }, noPerKind).id).toBe('page');
  });

  it('decor without a box goes into the first free zone, scaled to fit and centred; frequency counts eligible slides', () => {
    const m = {
      ...mood,
      decor: {
        elements: [
          {
            id: 'blob',
            file: 'assets/blob.png',
            allowedOn: ['text'],
            frequency: 'sometimes',
            layer: 'front',
          },
        ],
      },
    };
    const assets = {
      info: () => ({ width: 200, height: 100 }),
      add: (f) => `id:${f}`,
    };
    const layout = { id: 'l', decor: { zones: [{ x: 1000, y: 0, w: 400, h: 400 }] } };
    const state = createDecorState();
    const placed = [0, 1, 2, 3].map((i) =>
      placeDecor({
        kinds: ['text'],
        surface: { id: 'page' },
        layout,
        mood: m,
        assets,
        warn: () => {},
        state,
        slideId: `s${i}`,
      }),
    );
    expect(placed.map((p) => p.length)).toEqual([1, 0, 0, 1]);
    expect(placed[0][0]).toMatchObject({
      z: 60,
      frame: { x: 1000, y: 100, w: 400, h: 200 },
      image: { asset: 'id:assets/blob.png', fit: 'contain' },
    });
  });

  it('summarize counts items, columns and list depth', () => {
    const s5 = summarize(content.slides[4], { kind: 'bullets' });
    expect(s5).toMatchObject({ kind: 'bullets', items: 5, listItems: 6, listLevels: 2, hasTitle: true });
    expect(summarize(content.slides[5])).toMatchObject({ columns: 2, items: 2 });
    expect(summarize(content.slides[10])).toMatchObject({ items: 4, hasKpis: true });
    expect(summarize(content.slides[14])).toMatchObject({ hasTable: true, tableRows: 5, tableCols: 4 });
  });
});

describe('flow items (cards / steps / timeline / team / logos) with ad-hoc flow layouts', () => {
  const flowDef = (kind, slotType, max) => ({
    id: `${kind}-flow`,
    kind,
    build: ({ summary }) => ({
      schema: 'layout/1',
      id: `${kind}-flow`,
      kind,
      boxes: [
        { id: 'title', role: 'title', frame: { x: 138, y: 80, w: 1644, h: 120 } },
        {
          id: 'items',
          role: 'group',
          frame: { x: 138, y: 232, w: 1644, h: 768 },
          flow: { direction: 'row', gap: 'md', columns: Math.min(max, summary.items) },
        },
      ],
      slots: [
        { id: 'title', type: 'text', box: 'title', role: 'h1', required: true },
        { id: 'items', type: slotType, box: 'items', required: false, capacity: { maxItems: max } },
      ],
    }),
  });
  const extra = [
    flowDef('cards', 'cards', 4),
    flowDef('steps', 'steps', 5),
    flowDef('timeline', 'timeline', 5),
    flowDef('team', 'images', 4),
    flowDef('logos', 'logos', 8),
  ];
  const catalogue = {
    list: () => [...fixtureCatalogue.list(), ...extra],
    forKind: (k) => [...fixtureCatalogue.forKind(k), ...extra.filter((d) => d.kind === k)],
    get: (id) => fixtureCatalogue.get(id) ?? extra.find((d) => d.id === id),
  };
  const { deck: d, warnings: w } = composeDeck({ content, mood, brandSpec, catalogue });

  it('composes a valid deck with every flow item placed in its cell', () => {
    expect(validateDeck(d)).toEqual([]);
    const items = (id) => d.slides.find((s) => s.id === id).elements.filter((e) => e.slot === 'items');
    const cards = items('s7');
    expect(cards.filter((e) => e.type === 'shape')).toHaveLength(4); // outlined card per item
    expect(cards.filter((e) => e.id.endsWith('-title'))).toHaveLength(4);
    expect(new Set(cards.filter((e) => e.id.endsWith('-text')).map((e) => e.text.fit.appliedSize)).size).toBe(
      1,
    );
    expect(items('s8').filter((e) => e.shape?.kind === 'ellipse')).toHaveLength(3); // circle-number markers
    expect(items('s8').filter((e) => e.type === 'line')).toHaveLength(2); // connectors between 3 steps
    expect(
      items('s9')
        .filter((e) => e.id.endsWith('-when'))
        .map((e) => e.text.lines[0].text),
    ).toEqual(['P0', 'P1', 'P2', 'P4']);
    expect(items('s20').filter((e) => e.name === 'avatar placeholder')).toHaveLength(3);
    expect(items('s21').filter((e) => e.id.endsWith('-name'))).toHaveLength(6);
    expect(w).toContainEqual(expect.objectContaining({ slide: 's21', check: 'logos', severity: 'info' }));
    for (const e of [...cards, ...items('s8'), ...items('s20')]) {
      expect(e.frame.x).toBeGreaterThanOrEqual(138 - 0.01);
      expect(e.frame.x + e.frame.w).toBeLessThanOrEqual(1782 + 0.01);
    }
  });
});

describe('per-slide overrides decor: false / logo: false (the Studio, PLAN-studio §2)', () => {
  const withFlags = (id, flags) => ({
    ...content,
    slides: content.slides.map((s) => (s.id === id ? { ...s, ...flags } : s)),
  });
  const roles = (d, id) => d.slides.find((s) => s.id === id).elements.map((e) => e.role);

  it('decor: false leaves that slide without decor; the other slides keep theirs', () => {
    expect(roles(deck, 's3')).toContain('decor'); // the section slide carries the rays without the flag
    const { deck: d } = composeDeck({
      content: withFlags('s3', { decor: false }),
      mood,
      brandSpec,
      catalogue,
    });
    expect(validateDeck(d)).toEqual([]);
    expect(roles(d, 's3')).not.toContain('decor');
    expect(d.slides.find((s) => s.id === 's3').elements.length).toBeGreaterThan(0);
    // decor: true (or absent) is the default, not an override
    const { deck: same } = composeDeck({
      content: withFlags('s3', { decor: true }),
      mood,
      brandSpec,
      catalogue,
    });
    expect(roles(same, 's3')).toContain('decor');
  });

  it('decor: false on one slide does not move decor onto other slides (the frequency count is unchanged)', () => {
    const { deck: d } = composeDeck({
      content: withFlags('s3', { decor: false }),
      mood,
      brandSpec,
      catalogue,
    });
    const withDecor = (dk) =>
      dk.slides.filter((s) => s.id !== 's3' && s.elements.some((e) => e.role === 'decor'));
    expect(withDecor(d).map((s) => s.id)).toEqual(withDecor(deck).map((s) => s.id));
  });

  it('a pinned surface changes that slide only: the rhythm of the other slides is unchanged', () => {
    const pinned = mood.palette.surfaces.find((s) => s.id !== deck.slides[3].surfaceId).id;
    const { deck: d } = composeDeck({
      content: withFlags('s4', { surface: pinned }),
      mood,
      brandSpec,
      catalogue,
    });
    expect(d.slides[3].surfaceId).toBe(pinned);
    const others = (dk) => dk.slides.filter((s) => s.id !== 's4').map((s) => [s.id, s.surfaceId]);
    expect(others(d)).toEqual(others(deck));
  });

  it('logo: false leaves that slide without the slide logo; the other slides keep theirs', () => {
    expect(roles(deck, 's1')).toContain('logo');
    const { deck: d } = composeDeck({
      content: withFlags('s1', { logo: false }),
      mood,
      brandSpec,
      catalogue,
    });
    expect(validateDeck(d)).toEqual([]);
    expect(roles(d, 's1')).not.toContain('logo');
    const withLogo = (dk) =>
      dk.slides.filter((s) => s.id !== 's1' && s.elements.some((e) => e.role === 'logo'));
    expect(withLogo(d).map((s) => s.id)).toEqual(withLogo(deck).map((s) => s.id));
  });
});
