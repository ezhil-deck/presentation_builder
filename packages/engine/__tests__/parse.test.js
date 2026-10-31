import { inferKind, parseInline, parseMarkdown, parseMarkdownResult, validateContent } from '../src/index.js';
import { showcaseMd, stripeBrandSpec } from './helpers.js';

describe('parseMarkdown on golden/showcase/showcase.md (stripe BrandSpec)', () => {
  const md = showcaseMd();
  const brandSpec = stripeBrandSpec();
  const { content, warnings } = parseMarkdownResult(md, { brandSpec });
  const byId = Object.fromEntries(content.slides.map((s) => [s.id, s]));

  it('is valid Content with one slide per "# " heading (24 in the showcase)', () => {
    expect(validateContent(content)).toEqual([]);
    const headings = md.split('\n').filter((l) => /^#\s/.test(l)).length;
    expect(content.slides).toHaveLength(headings);
    expect(content.slides).toHaveLength(24);
    expect(content.title).toBe('Showcase deck');
  });

  it('keeps every slide kind as annotated', () => {
    const annotated = [...md.matchAll(/<!-- kind: ([\w-]+) -->/g)].map((m) => m[1]);
    expect(content.slides.map((s) => s.kind)).toEqual(annotated);
  });

  it('builds a columns block for the two-column slides with ≥ 2 "##"', () => {
    for (const id of ['s6', 's23']) {
      const cols = byId[id].blocks.find((b) => b.type === 'columns');
      expect(cols.items).toHaveLength(2);
      expect(cols.items.every((c) => c.blocks[0].type === 'list')).toBe(true);
    }
    expect(byId.s6.blocks.find((b) => b.type === 'columns').items.map((c) => c.title)).toEqual([
      'Before',
      'After',
    ]);
    // a single "##" is a subtitle, not a column
    expect(byId.s18.blocks.map((b) => b.type)).toEqual(['title', 'image', 'subtitle', 'paragraph']);
  });

  it('resolves {brand.*} placeholders and never leaves braces', () => {
    expect(byId.s1.blocks).toEqual([
      { type: 'title', text: 'Stripe' },
      { type: 'subtitle', text: 'Build what matters' },
    ]);
    expect(byId.s17.blocks[1]).toEqual({
      type: 'image',
      src: 'assets/vis-payments.png',
      alt: 'Brand imagery sample',
    });
    expect(byId.s18.blocks[1].src).toBe('assets/vis-billing.png');
    expect(byId.s24.blocks.slice(1)).toEqual([
      { type: 'subtitle', text: 'Questions and next steps' },
      { type: 'paragraph', text: 'Stripe · Build what matters' },
    ]);
    expect(JSON.stringify(content)).not.toMatch(/\{brand\./);
  });

  it('parses fenced YAML into typed blocks', () => {
    const kpis = byId.s11.blocks[1];
    expect(kpis.type).toBe('kpis');
    expect(kpis.items.map((i) => i.value)).toEqual(['12', '<10 s', '100%', '0']);
    expect(byId.s12.blocks[1]).toEqual({
      type: 'chart',
      chartType: 'column',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Conversions', values: [12, 19, 27, 41] },
        { name: 'Edits', values: [4, 7, 9, 12] },
      ],
      highlight: 0,
    });
    const table = byId.s15.blocks[1];
    expect(table.header).toEqual(['Phase', 'Goal', 'Weeks', 'Status']);
    expect(table.rows[0]).toEqual(['P0', 'Foundations', '1', 'In progress']);
    expect(table.align).toEqual(['left', 'left', 'right', 'left']);
    // the showcase quotes its values that contain ": " (P2-spec §7 F3): no parse infos
    expect(byId.s7.blocks[1].items[1].text).toBe(
      'Tested rules turn the brand into a mood: palette, type, geometry, shapes.',
    );
    expect(byId.s8.blocks[1].items).toHaveLength(3);
    expect(warnings.filter((w) => w.severity === 'info')).toEqual([]);
    expect(byId.s20.blocks[1].type).toBe('people');
    expect(byId.s21.blocks[1].items).toHaveLength(6);
  });

  it('reads an unquoted value with ": " inside as a string, with an info (lenient YAML)', () => {
    const md = '# Cards\n<!-- kind: cards -->\n```cards\n- title: A\n  text: One folder: the JSON.\n```\n';
    const r = parseMarkdownResult(md, { brandSpec });
    expect(r.content.slides[0].blocks[1].items[0].text).toBe('One folder: the JSON.');
    expect(r.warnings.filter((w) => w.severity === 'info').map((w) => w.slide)).toEqual(['s1']);
  });

  it('parses lists (ordered, nested), quotes with attribution, and section subtitles', () => {
    expect(byId.s2.blocks[1].ordered).toBe(true);
    expect(byId.s2.blocks[1].items).toHaveLength(5);
    const bullets = byId.s5.blocks[1];
    expect(bullets.ordered).toBeUndefined();
    expect(bullets.items[2].children).toEqual([
      { text: "Sub-points use the brand's nested glyph and indent" },
    ]);
    expect(byId.s19.blocks[1]).toMatchObject({
      type: 'quote',
      attribution: 'A reviewer',
      role: 'Design team',
    });
    expect(byId.s3.blocks[1]).toEqual({ type: 'subtitle', text: 'Part 1 · Surfaces and type' });
    expect(byId.s4.blocks[1].type).toBe('paragraph');
  });
});

describe('parseMarkdown negative cases', () => {
  it('drops a block whose placeholder cannot be resolved, with a warning', () => {
    const warnings = [];
    const content = parseMarkdown('# Hi\n<!-- kind: text -->\nKeep me\n\nUnknown {brand.colour}\n', {
      brandSpec: { name: 'X' },
      warnings,
    });
    expect(content.slides[0].blocks).toEqual([
      { type: 'title', text: 'Hi' },
      { type: 'paragraph', text: 'Keep me' },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        check: 'content',
        slide: 's1',
        message: expect.stringMatching(/\{brand\.colour\}/),
      }),
    ]);
  });

  it('drops a placeholder the BrandSpec does not carry (no tagline -> no cover subtitle)', () => {
    const { content, warnings } = parseMarkdownResult('# {brand.name}\n{brand.tagline}\n', {
      brandSpec: { name: 'X' },
    });
    expect(content.slides[0].blocks).toEqual([{ type: 'title', text: 'X' }]);
    expect(warnings[0].message).toMatch(/brand\.tagline/);
  });

  it('keeps an unknown fence as a paragraph with a warning', () => {
    const { content, warnings } = parseMarkdownResult(
      '# A\n<!-- kind: text -->\n```mermaid\ngraph TD\n```\n',
    );
    expect(content.slides[0].blocks[1]).toEqual({ type: 'paragraph', text: 'graph TD' });
    expect(warnings[0].message).toMatch(/unknown fenced block "mermaid"/);
  });

  it('keeps a fence whose YAML does not fit its type as a paragraph', () => {
    const { content, warnings } = parseMarkdownResult('# A\n<!-- kind: text -->\n```kpis\nvalue: 1\n```\n');
    expect(content.slides[0].blocks[1].type).toBe('paragraph');
    expect(warnings[0].message).toMatch(/kpis/);
  });

  it('throws when there is no slide', () => {
    expect(() => parseMarkdown('just text')).toThrow(/no slides/);
  });
});

describe('inferKind', () => {
  const s = (...types) => ({
    blocks: types.map((type) => ({
      type,
      text: 'x',
      items: [],
      src: 'a',
      rows: [],
      series: [],
      chartType: 'bar',
    })),
  });
  it.each([
    [s('title'), 'text'],
    [s('title', 'subtitle'), 'section'],
    [s('title', 'kpis'), 'kpi'],
    [s('title', 'chart'), 'chart'],
    [s('title', 'table'), 'table'],
    [s('title', 'cards'), 'cards'],
    [s('title', 'steps'), 'steps'],
    [s('title', 'timeline'), 'timeline'],
    [s('title', 'logos'), 'logos'],
    [s('title', 'people'), 'team'],
    [s('title', 'quote'), 'quote'],
    [s('title', 'columns'), 'two-column'],
    [s('title', 'image', 'paragraph'), 'image-text'],
    [s('title', 'image'), 'image'],
    [s('title', 'list'), 'bullets'],
    [s('title', 'paragraph', 'paragraph'), 'text'],
  ])('%j -> %s', (slide, kind) => expect(inferKind(slide, { index: 3, count: 10 })).toBe(kind));

  it('first slide -> cover; last slide with a cta block -> cta', () => {
    expect(inferKind(s('title', 'list'), { index: 0, count: 5 })).toBe('cover');
    expect(inferKind(s('title', 'cta'), { index: 4, count: 5 })).toBe('cta');
    expect(inferKind(s('title', 'cta'), { index: 2, count: 5 })).toBe('text');
  });
});

describe('parseInline', () => {
  it('splits bold, italic and links into runs', () => {
    expect(parseInline('a **b** *c* [d](http://x) e')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', link: 'http://x' },
      { text: ' e' },
    ]);
  });
  it('leaves unclosed markers literal', () => {
    expect(parseInline('2 * 3 and **open')).toEqual([{ text: '2 * 3 and **open' }]);
  });
});
