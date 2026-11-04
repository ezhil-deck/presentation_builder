// P4.3 (docs/P4-spec.md §2, §8): the `source` of charts, tables, images and flow nodes; a chart / table laid out again
// when its frame changes (an element override with the composed content); an image's focal point (a cover crop) and
// fit override; the new-node skeleton keeping a flow block valid. Composed on the stripe golden Mood (in git).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  BLOCKS,
  applyElementOverrides,
  composeDeck,
  focalCrop,
  focalOf,
  getPointer,
  nodeSkeleton,
  normalizeElementOverrides,
  parseMarkdownResult,
  resolveContentPlaceholders,
  validateBlockV2,
  validateDeck,
} from '../src/index.js';
import { ROOT, stripeBrandSpec, stripeMood } from './helpers.js';

const mood = stripeMood();
const brandSpec = stripeBrandSpec();
const showcase = () => {
  const md = readFileSync(join(ROOT, 'golden/showcase/showcase.md'), 'utf8');
  return parseMarkdownResult(md, { brandSpec }).content;
};
const compose = (content, spec = brandSpec) =>
  composeDeck({ content, mood, brandSpec: spec, catalogue, engineVersion: '0.0.0' });
const all = (els) => els.flatMap((e) => [e, ...all(e.children ?? [])]);
const slideNamed = (deck, id) => deck.slides.find((s) => s.id === id);

describe('sources of charts, tables, images and flow nodes', () => {
  const content = showcase();
  const { deck } = compose(content);
  const byId = new Map(content.slides.map((s) => [s.id, s]));

  it('every non-text source names a value of its content slide', () => {
    let n = 0;
    for (const s of deck.slides) {
      for (const el of all(s.elements)) {
        if (el.type === 'text' || !el.source) continue;
        n += 1;
        expect(getPointer(byId.get(s.contentSlideId ?? s.id), el.source.path)).not.toBeUndefined();
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(validateDeck(deck)).toEqual([]);
  });

  it('a chart and a table point at their block; their drawn parts too', () => {
    const chart = all(deck.slides[15].elements).find((e) => e.type === 'chart');
    expect(chart.source).toEqual({ path: '/blocks/0' });
    const table = all(deck.slides[21].elements).find((e) => e.type === 'table');
    expect(table.source).toEqual({ path: '/blocks/0' });
    const dots = deck.slides[21].elements.filter((e) => e.id.startsWith(`${table.id}-cell-`));
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.every((e) => e.source?.path === '/blocks/0')).toBe(true);
  });

  it('an image points at the string naming its file; node parts at their node', () => {
    const s23 = deck.slides[22];
    const img = s23.elements.find((e) => e.id === 's23-compare-0-image');
    expect(img.source).toEqual({ path: '/blocks/0/columns/0/image' });
    const s9 = deck.slides[8];
    expect(s9.elements.find((e) => e.id === 's9-cards-1-bg')?.source).toEqual({
      path: '/blocks/0/items/1',
    });
    // generated text (a step number) keeps no source; a node's text keeps its field
    expect(s9.elements.find((e) => e.id === 's9-cards-0-number')?.source).toBeUndefined();
    expect(s9.elements.find((e) => e.id === 's9-cards-0-title')?.source).toEqual({
      path: '/blocks/0/items/0/heading',
    });
  });

  it('an image block item points at its src (collage index)', () => {
    const c = {
      schema: 'content/2',
      slides: [
        {
          id: 'p',
          title: 'Photos',
          layout: 'image-collage',
          blocks: [
            {
              type: 'image',
              items: [
                { src: 'assets/a.png', alt: 'A' },
                { src: 'assets/b.png', alt: 'B' },
                { src: 'assets/c.png' },
              ],
            },
          ],
        },
      ],
    };
    const d = compose(c).deck;
    const imgs = d.slides[0].elements.filter((e) => e.type === 'image' && e.source);
    expect(imgs.map((e) => e.source.path)).toEqual([
      '/blocks/0/items/0/src',
      '/blocks/0/items/1/src',
      '/blocks/0/items/2/src',
    ]);
  });
});

describe('charts and tables laid out again for a new frame', () => {
  const content = resolveContentPlaceholders({ ...showcase(), slides: showcase().slides }, brandSpec).content;
  const { deck } = compose(content);
  const chart = all(deck.slides[15].elements).find((e) => e.type === 'chart');
  const table = all(deck.slides[21].elements).find((e) => e.type === 'table');

  it('a resized chart is drawn for its new frame (geometry from the frame)', () => {
    const frame = { ...chart.frame, w: 900, h: 500 };
    const r = applyElementOverrides(deck, { [chart.id]: { frame } }, { mood, brandSpec, content, catalogue });
    const next = all(slideNamed(r.deck, 's16').elements).find((e) => e.id === chart.id);
    expect(next.frame).toEqual(frame);
    expect(next.chart.geometry.plot.w).toBeLessThan(900);
    expect(next.chart.geometry.plot.w).toBeLessThan(chart.chart.geometry.plot.w);
    expect(next.chart.series[0].values).toEqual(chart.chart.series[0].values);
    expect(next.source).toEqual({ path: '/blocks/0' });
    // the chart's own title / source keep their place (their own elements)
    const title = (d) => all(slideNamed(d, 's16').elements).find((e) => e.id === `${chart.id}-title`);
    expect(title(r.deck).frame).toEqual(title(deck).frame);
    expect(r.warnings.filter((w) => /not resized/.test(w.message))).toEqual([]);
    expect(validateDeck(r.deck)).toEqual([]);
  });

  it('a resized table is laid out again: its columns fill the new width, its rich cells move with it', () => {
    const frame = { x: 300, y: table.frame.y, w: 1200, h: 600 };
    const r = applyElementOverrides(deck, { [table.id]: { frame } }, { mood, brandSpec, content, catalogue });
    const s = slideNamed(r.deck, 's22');
    const next = s.elements.find((e) => e.id === table.id);
    expect(next.frame).toEqual(frame);
    const sum = next.table.colWidths.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1200)).toBeLessThan(1);
    const dots = s.elements.filter((e) => e.id.startsWith(`${table.id}-cell-`));
    const before = slideNamed(deck, 's22').elements.filter((e) => e.id.startsWith(`${table.id}-cell-`));
    expect(dots.length).toBe(before.length);
    expect(dots.every((e) => e.frame.x >= 300 && e.frame.x <= 1500)).toBe(true);
    // no part left twice
    expect(new Set(s.elements.map((e) => e.id)).size).toBe(s.elements.length);
    expect(validateDeck(r.deck)).toEqual([]);
  });

  it('a moved table carries its drawn cell parts (they are laid out again at the new place)', () => {
    const frame = { ...table.frame, x: table.frame.x + 40 };
    const r = applyElementOverrides(deck, { [table.id]: { frame } }, { mood, brandSpec, content, catalogue });
    const dot = (d) => slideNamed(d, 's22').elements.find((e) => e.id === `${table.id}-cell-5-1-dot-0`);
    expect(dot(r.deck).frame.x).toBeCloseTo(dot(deck).frame.x + 40, 1);
  });

  it('without the content a chart moves only (the P4.1 behaviour, a note says why) - negative', () => {
    const frame = { ...chart.frame, w: 900, h: 500 };
    const r = applyElementOverrides(deck, { [chart.id]: { frame } }, { mood });
    const next = all(slideNamed(r.deck, 's16').elements).find((e) => e.id === chart.id);
    expect(next.frame.w).toBe(chart.frame.w);
    expect(r.warnings.some((w) => /moved, not resized/.test(w.message))).toBe(true);
  });
});

describe('image focal point and fit', () => {
  it('focalCrop keeps the focal point as central as the image allows (fractions of the source)', () => {
    // a 400 × 300 image in a square frame: 75 % of the width shows
    expect(focalCrop({ x: 0.5, y: 0.5 }, { width: 400, height: 300 }, { w: 100, h: 100 })).toEqual({
      x: 0.125,
      y: 0,
      w: 0.75,
      h: 1,
    });
    expect(focalCrop({ x: 1, y: 0 }, { width: 400, height: 300 }, { w: 100, h: 100 }).x).toBe(0.25);
    expect(focalCrop({ x: 0, y: 0.5 }, { width: 400, height: 300 }, { w: 100, h: 100 }).x).toBe(0);
    // a wide frame: the height is cropped
    expect(focalCrop({ x: 0.5, y: 0.9 }, { width: 400, height: 300 }, { w: 400, h: 100 })).toEqual({
      x: 0,
      y: 0.6667,
      w: 1,
      h: 0.3333,
    });
    // no size, no focal, no crop (negative)
    expect(focalCrop({ x: 0.5, y: 0.5 }, null, { w: 1, h: 1 })).toBeNull();
    expect(focalCrop(null, { width: 1, height: 1 }, { w: 1, h: 1 })).toBeNull();
    expect(focalOf({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    expect(focalOf({ x: 'a', y: 1 })).toBeNull();
  });

  const content = {
    schema: 'content/2',
    slides: [
      {
        id: 'p',
        title: 'Photo',
        layout: 'image',
        blocks: [{ type: 'image', items: [{ src: 'content/assets/d/a.png', focal: { x: 0.9, y: 0.5 } }] }],
      },
    ],
  };
  const spec = { ...brandSpec, studioAssets: [{ file: 'content/assets/d/a.png', width: 400, height: 300 }] };

  it('an image with a focal point and a known size is cropped around it; resizing crops again', () => {
    const { deck } = compose(content, spec);
    const img = all(deck.slides[0].elements).find((e) => e.type === 'image' && e.source);
    expect(img.image.focal).toEqual({ x: 0.9, y: 0.5 });
    expect(img.image.crop).toEqual(focalCrop({ x: 0.9, y: 0.5 }, { width: 400, height: 300 }, img.frame));
    const frame = { x: 100, y: 100, w: 300, h: 600 };
    const r = applyElementOverrides(deck, { [img.id]: { frame } }, { mood, brandSpec: spec, content });
    const next = all(r.deck.slides[0].elements).find((e) => e.id === img.id);
    expect(next.image.crop).toEqual(focalCrop({ x: 0.9, y: 0.5 }, { width: 400, height: 300 }, frame));
  });

  it('fit: contain shows the whole file (no crop); cover keeps the focal crop; refused on a text', () => {
    const { deck } = compose(content, spec);
    const img = all(deck.slides[0].elements).find((e) => e.type === 'image' && e.source);
    const contain = applyElementOverrides(deck, { [img.id]: { fit: 'contain' } }, { mood });
    const c = all(contain.deck.slides[0].elements).find((e) => e.id === img.id);
    expect(c.image.fit).toBe('contain');
    expect(c.image.crop).toBeUndefined();
    const title = all(deck.slides[0].elements).find((e) => e.type === 'text');
    const r = applyElementOverrides(deck, { [title.id]: { fit: 'cover' } }, { mood });
    expect(r.warnings.some((w) => /fit override applies to images only/.test(w.message))).toBe(true);
  });

  it('a focal override crops an image whose content has no focal field; refused outside 0–1 (negative)', () => {
    const c = {
      schema: 'content/2',
      slides: [
        {
          id: 'p',
          title: 'Before and after',
          layout: 'compare-columns',
          blocks: [
            {
              type: 'compare',
              columns: [
                { header: 'Before', image: 'content/assets/d/a.png', items: [{ heading: 'x' }] },
                { header: 'After', image: 'content/assets/d/a.png', items: [{ heading: 'y' }] },
              ],
            },
          ],
        },
      ],
    };
    const { deck } = compose(c, spec);
    const photo = all(deck.slides[0].elements).find((e) => e.type === 'image' && e.source);
    expect(photo.source.path).toBe('/blocks/0/columns/0/image');
    const r = applyElementOverrides(deck, { [photo.id]: { focal: { x: 0, y: 0.5 } } }, { mood });
    const next = all(r.deck.slides[0].elements).find((e) => e.id === photo.id);
    expect(next.image.focal).toEqual({ x: 0, y: 0.5 });
    expect(next.image.crop).toEqual(focalCrop({ x: 0, y: 0.5 }, { width: 400, height: 300 }, photo.frame));
    expect(() => normalizeElementOverrides({ a: { focal: { x: 2, y: 0 } } })).toThrow(/focal/);
    expect(() => normalizeElementOverrides({ a: { focal: 'centre' } })).toThrow(/focal/);
  });

  it('normalizeElementOverrides keeps fit cover / contain and refuses anything else (negative)', () => {
    expect(normalizeElementOverrides({ a: { fit: 'contain' } })).toEqual({ a: { fit: 'contain' } });
    expect(() => normalizeElementOverrides({ a: { fit: 'fill' } })).toThrow(/fit/);
    expect(() => normalizeElementOverrides({ a: { fit: 3 } })).toThrow(/fit/);
  });
});

describe('a new flow node keeps the block valid', () => {
  const BLOCKS_OF = {
    points: { type: 'points', items: [{ text: 'A' }, { text: 'B' }] },
    items: { type: 'items', items: [{ heading: 'A', body: 'a', label: 'L' }, { heading: 'B' }] },
    subpoints: { type: 'subpoints', items: [{ heading: 'A', lines: ['x'] }] },
    kpis: { type: 'kpis', items: [{ value: '1', heading: 'A', trend: 'up' }] },
    process: { type: 'process', shape: 'cycle', items: [{ heading: 'A' }, { heading: 'B' }] },
    timeline: { type: 'timeline', items: [{ when: 'Q1', heading: 'A', lines: ['x'] }, { heading: 'B' }] },
    quotes: { type: 'quotes', items: [{ text: 'Q', name: 'N' }] },
    people: { type: 'people', items: [{ name: 'A', role: 'R', photo: 'p.png' }] },
    logos: { type: 'logos', items: [{ name: 'A', row: 1 }, { src: 'x.svg' }] },
    compare: {
      type: 'compare',
      columns: [
        { header: 'A', items: [{ heading: 'x', check: true }] },
        { header: 'B', items: [{ heading: 'y' }] },
      ],
    },
    tiers: {
      type: 'compare',
      tiers: true,
      columns: [
        { header: 'A', price: '1', per: 'mo', features: ['x'] },
        { header: 'B', price: '2', features: ['y'] },
      ],
    },
  };

  for (const [name, block] of Object.entries(BLOCKS_OF)) {
    it(`${name}: a node added after the first, then the list validates; removing / moving keeps it valid`, () => {
      const key = block.type === 'compare' ? 'columns' : 'items';
      const node = nodeSkeleton(block.type, block[key][0]);
      expect(node).not.toBeNull();
      expect(node.icon).toBeUndefined();
      expect(node.photo ?? node.image ?? node.src).toBeUndefined();
      const added = { ...block, [key]: [block[key][0], node, ...block[key].slice(1)] };
      expect(validateBlockV2(added)).toEqual([]);
      const moved = { ...added, [key]: [...added[key]].reverse() };
      expect(validateBlockV2(moved)).toEqual([]);
      const removed = { ...added, [key]: added[key].slice(1) };
      expect(validateBlockV2(removed)).toEqual([]);
      expect(added[key].length).toBeLessThanOrEqual(BLOCKS[block.type].nodes.max);
    });
  }

  it('a type without nodes has no skeleton (negative)', () => {
    expect(nodeSkeleton('chart')).toBeNull();
    expect(nodeSkeleton('paragraph')).toBeNull();
  });
});
