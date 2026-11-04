// P4.2: the `source` of a deck text element (the content field it was bound from, so an inline edit writes back
// there), the JSON pointer helpers, the content placeholders resolved for a JSON document, and the slide-kind
// picker's skeletons + placeholder copy.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  PLACEHOLDER_TEXTS,
  composeDeck,
  getPointer,
  isPlaceholderText,
  parseMarkdownResult,
  plainText,
  pointer,
  pointerSegments,
  remapSourcePaths,
  resolveContentPlaceholders,
  setPointer,
  slideSkeleton,
  validateContent,
  validateDeck,
  validateSlideV2,
} from '../src/index.js';
import { verifiedSource } from '../src/content/source.js';
import { ROOT, goldenShowcaseMd, showcaseMd, stripeBrandSpec, stripeMood } from './helpers.js';

const mood = stripeMood();
const brandSpec = stripeBrandSpec();
const compose = (content, options) =>
  composeDeck({
    content,
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
    ...(options ? { options } : {}),
  });
const sampleMd = () => readFileSync(join(ROOT, 'content/samples/all-blocks.md'), 'utf8');

/** Text the layout makes itself (no content field): step / agenda numbers, point markers, initials, a gauge value, table cells. */
const GENERATED = /-\d+-(number|marker|initials)$|-chart-value$|-cell-|-dot-/;

function texts(deck) {
  const out = [];
  const walk = (els, slide) => {
    for (const el of els ?? []) {
      if (el.type === 'text') out.push({ el, slide });
      walk(el.children, slide);
    }
  };
  for (const s of deck.slides) walk(s.elements, s);
  return out;
}
const unitsOf = (el) => {
  const t = el.text.paragraphs.map((p) => p.runs.map((r) => r.text).join(''));
  return el.source?.join === 'line' ? t.flatMap((x) => x.split('\n')) : t;
};

describe('JSON pointers', () => {
  it('escape / read / write: set copies along the path, undefined removes, an index may append', () => {
    expect(pointer('blocks', 0, 'a/b', 'c~d')).toBe('/blocks/0/a~1b/c~0d');
    expect(pointerSegments('/blocks/0/a~1b/c~0d')).toEqual(['blocks', '0', 'a/b', 'c~d']);
    expect(pointerSegments('')).toEqual([]);
    expect(() => pointerSegments('blocks')).toThrow(/pointer/);
    const doc = { title: 'A', blocks: [{ type: 'points', items: [{ text: 'x' }] }] };
    expect(getPointer(doc, '/blocks/0/items/0/text')).toBe('x');
    expect(getPointer(doc, '/blocks/3/items')).toBeUndefined();
    const next = setPointer(doc, '/blocks/0/items/1', { text: 'y' });
    expect(next.blocks[0].items).toEqual([{ text: 'x' }, { text: 'y' }]);
    expect(doc.blocks[0].items).toHaveLength(1); // never mutated
    expect(next.title).toBe('A');
    expect(setPointer(doc, '/title', undefined)).toEqual({ blocks: doc.blocks });
    expect(() => setPointer(doc, '/blocks/5/text', 'z')).toThrow(/index/);
  });
});

describe('every text element bound from content names its content field (source)', () => {
  const cases = [
    ['golden/showcase/showcase.md (content/2)', goldenShowcaseMd()],
    ['content/samples/all-blocks.md (content/2)', sampleMd()],
    ['golden/showcase/showcase-v1.md (content/1)', showcaseMd()],
  ];
  it.each(cases)('%s: source.path resolves to the string the element shows', (name, md) => {
    const { content } = parseMarkdownResult(md, { brandSpec });
    const { deck } = compose(content);
    expect(validateDeck(deck)).toEqual([]);
    const bound = texts(deck).filter(({ el }) => el.slot && !GENERATED.test(el.id));
    expect(bound.length).toBeGreaterThan(50);
    const missing = bound.filter(({ el }) => !el.source).map(({ el }) => el.id);
    expect(missing).toEqual([]);
    for (const { el, slide } of bound) {
      const cslide = content.slides.find((s) => s.id === slide.contentSlideId);
      const paths = el.source.paths ?? [el.source.path];
      expect(paths[0]).toBe(el.source.path);
      const values = paths.map((p) => getPointer(cslide, p));
      for (const v of values) expect(typeof v).toBe('string');
      if (el.source.join && el.source.join !== 'line') {
        expect(values.map(plainText).join(el.source.join)).toBe(unitsOf(el)[0]);
      } else {
        const units = unitsOf(el);
        expect(units).toHaveLength(paths.length);
        values.forEach((v, i) => expect(units[i]).toContain(plainText(v)));
      }
    }
    // the generated texts carry none
    for (const { el } of texts(deck).filter(({ el }) => GENERATED.test(el.id)))
      expect(el.source).toBeUndefined();
  });

  it('names the content/2 fields by their own names (slide keys, node fields, lines, block titles)', () => {
    const { content } = parseMarkdownResult(sampleMd(), { brandSpec });
    const { deck } = compose(content);
    const byId = new Map(texts(deck).map(({ el }) => [el.id, el.source]));
    expect(byId.get('s1-title')).toEqual({ path: '/title' });
    expect(byId.get('s1-label')).toEqual({ path: '/label' });
    expect(byId.get('s4-cards-heading')).toEqual({ path: '/blocks/0/title' });
    expect(byId.get('s4-cards-1-text')).toEqual({ path: '/blocks/0/items/1/body' });
    expect(byId.get('s5-cards-0-text')).toMatchObject({
      join: 'line',
      paths: ['/blocks/0/items/0/lines/0', '/blocks/0/items/0/lines/1', '/blocks/0/items/0/lines/2'],
    });
    expect(byId.get('s6-kpis-0-label')).toEqual({ path: '/blocks/0/items/0/heading' });
    expect(byId.get('s11-chart-title')).toEqual({ path: '/blocks/0/text/title' });
    expect(byId.get('s25-attribution')).toEqual({
      path: '/blocks/0/items/0/name',
      paths: ['/blocks/0/items/0/name', '/blocks/0/items/0/role'],
      join: ', ',
    });
    expect(byId.get('s21-compare-0-price')).toEqual({ path: '/blocks/0/columns/0/price' });
  });

  it('keeps no source when the text is not what the pointer names (negative)', () => {
    const slide = { title: 'Hello', blocks: [{ type: 'paragraph', text: 'One **two**' }] };
    const p = (t) => [{ runs: [{ text: t }] }];
    expect(verifiedSource({ paths: ['/title'] }, p('Hello'), slide)).toEqual({ path: '/title' });
    expect(verifiedSource({ paths: ['/title'] }, p('Goodbye'), slide)).toBeNull();
    expect(verifiedSource({ paths: ['/blocks/0/text'] }, p('One two'), slide)).toEqual({
      path: '/blocks/0/text',
    });
    expect(verifiedSource({ paths: ['/blocks/0/items/0/text'] }, p('x'), slide)).toBeNull();
    // more paragraphs than pointers: no source
    expect(verifiedSource({ paths: ['/title'] }, [...p('Hello'), ...p('Hello')], slide)).toBeNull();
  });
});

describe('a JSON content document for one brand', () => {
  it('parseMarkdownResult keepPlaceholders leaves {brand.*} as written', () => {
    const { content } = parseMarkdownResult(goldenShowcaseMd(), { keepPlaceholders: true });
    expect(content.slides[0].title).toBe('{brand.name}');
    expect(validateContent(content)).toEqual([]);
    const resolved = parseMarkdownResult(goldenShowcaseMd(), { brandSpec }).content;
    expect(resolved.slides[0].title).toBe(brandSpec.name);
  });

  it('resolveContentPlaceholders resolves keys and blocks; unresolvable ones are dropped with a warning, the block index kept', () => {
    const doc = {
      schema: 'content/2',
      slides: [
        {
          id: 's1',
          kind: 'text',
          title: '{brand.name}',
          subtitle: '{brand.nope}',
          blocks: [
            { type: 'paragraph', text: 'A' },
            { type: 'image', items: [{ src: '{brand.imagery.samples[99]}' }] },
            { type: 'paragraph', text: 'B {brand.name}' },
          ],
        },
      ],
    };
    const r = resolveContentPlaceholders(doc, brandSpec);
    expect(r.content.slides[0].title).toBe(brandSpec.name);
    expect(r.content.slides[0].subtitle).toBeUndefined();
    expect(r.content.slides[0].blocks.map((b) => b.text ?? b.type)).toEqual(['A', `B ${brandSpec.name}`]);
    expect(r.blockIndex).toEqual({ s1: [0, 2] });
    expect(r.warnings.map((w) => w.message)).toEqual([
      'slide key "subtitle" dropped: unresolvable placeholder {brand.nope}',
      'image block dropped: unresolvable placeholder {brand.imagery.samples[99]}',
    ]);
    expect(doc.slides[0].title).toBe('{brand.name}'); // not mutated
    // the composed deck's pointers are renumbered to the stored blocks
    const { deck } = compose(r.content);
    const remapped = remapSourcePaths(deck, r.blockIndex);
    const paths = texts(remapped)
      .map(({ el }) => el.source?.paths ?? (el.source ? [el.source.path] : []))
      .flat();
    expect(paths).toEqual(expect.arrayContaining(['/title', '/blocks/0/text', '/blocks/2/text']));
    expect(paths).not.toContain('/blocks/1/text');
    expect(texts(deck).flatMap(({ el }) => el.source?.paths ?? [])).toContain('/blocks/1/text');
  });
});

describe('the slide-kind picker skeletons (placeholders.js)', () => {
  const defs = catalogue.list();
  const isDefault = (d) => catalogue.forKind(d.kind)[0]?.id === d.id;
  const slides = defs.map((d, i) => ({ id: `s${i + 1}`, ...slideSkeleton({ ...d, default: isDefault(d) }) }));

  it('gives every catalogue layout a valid content/2 slide of placeholder copy only', () => {
    for (const s of slides) expect(validateSlideV2(s)).toEqual([]);
    const strings = [];
    const walk = (v, key) => {
      if (typeof v === 'string') {
        if (!['id', 'kind', 'layout', 'type', 'chartType', 'shape', 'treatment', 'src'].includes(key))
          strings.push(v);
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    slides.forEach((s) => walk(s));
    expect(strings.length).toBeGreaterThan(100);
    for (const t of strings) expect(isPlaceholderText(t)).toBe(true);
    expect(new Set(PLACEHOLDER_TEXTS).size).toBe(PLACEHOLDER_TEXTS.length);
    expect(isPlaceholderText('Slide title')).toBe(true);
    expect(isPlaceholderText('Slide title of mine')).toBe(false);
  });

  it('composes each skeleton onto the layout it was picked for', () => {
    const r = resolveContentPlaceholders({ schema: 'content/2', slides }, brandSpec);
    // C4: the skeletons are those of the 68 (a kind's default is not pinned, so the catalogue would take it): opted out
    const { deck } = compose(r.content, { catalogue: false });
    const off = deck.slides
      .map((s, i) => [defs[i].id, s.layoutId])
      .filter(([want, got]) => want !== got)
      // an image skeleton needs the brand's sample images: a brand without them gets the slide without the image
      .filter(
        ([want]) => !(r.blockIndex[`s${defs.findIndex((d) => d.id === want) + 1}`] && /image/.test(want)),
      );
    expect(off).toEqual([]);
    expect(slides.find((s) => s.layout === 'process-cycle').blocks[0]).toMatchObject({
      type: 'process',
      shape: 'cycle',
    });
    expect(slides[0]).toMatchObject({ kind: 'cover', title: 'Slide title', subtitle: 'Add a subtitle' });
    expect(slides[0].layout).toBeUndefined(); // the kind's default layout is not pinned
  });
});
