import {
  BLOCKS,
  BLOCK_TYPES,
  FAR_OVER,
  blockWarnings,
  inferKind,
  lowerSlide,
  parseMarkdown,
  parseMarkdownResult,
  slideWarnings,
  upgradeContent,
  validateBlockV2,
  validateContent,
} from '../src/index.js';
import { showcaseMd, stripeBrandSpec } from './helpers.js';

/**
 * One content/2 slide: `# T` + body after a cover slide (so the cover's paragraph-subtitle rule does not apply);
 * returns {slide, warnings (of that slide), content}.
 */
const one = (body, opts = {}) => {
  const { content, warnings } = parseMarkdownResult(`# Cover\n\n# T\n${body}\n`, {
    schema: 'content/2',
    ...opts,
  });
  return { slide: content.slides[1], warnings: warnings.filter((w) => w.slide === 's2'), content };
};
const fence = (name, yaml) => `\`\`\`${name}\n${yaml}\n\`\`\``;

describe('content/2 grammar: version decision', () => {
  it('a P2-grammar document stays content/1 (the showcase, unchanged)', () => {
    const { content } = parseMarkdownResult(showcaseMd(), { brandSpec: stripeBrandSpec() });
    expect(content.schema).toBe('content/1');
    expect(content.slides[0].blocks[0]).toEqual({ type: 'title', text: 'Stripe' });
  });

  it.each([
    ['a slide front', '# A\n---\nlabel: Eyebrow\n---\nText'],
    ['a content/2 fence', '# A\n```points\n- one\n- two\n```'],
    ['a v1 name fence for a new type (quote)', '# A\n```quote\ntext: Hi\n```'],
    ['a content/2 field in a shared fence', '# A\n```kpis\n- value: 1\n  heading: one\n```'],
    ['the front matter', '---\nschema: content/2\n---\n# A\nText'],
  ])('%s makes the document content/2', (_, md) => {
    expect(parseMarkdown(md).schema).toBe('content/2');
  });

  it('the `schema` option forces content/2; a P2 shared fence stays P2 without it', () => {
    expect(parseMarkdown('# A\n- one', { schema: 'content/2' }).schema).toBe('content/2');
    expect(parseMarkdown('# A\n```kpis\n- value: 1\n  label: one\n```').schema).toBe('content/1');
  });
});

describe('content/2 grammar: slide keys', () => {
  it('reads the slide front (failsafe YAML: "01" stays "01"; decor / logo are booleans)', () => {
    const { slide, warnings } = one(
      '---\nlabel: Investor update\nsubtitle: A line\nnumber: 01\nbackground: assets/bg.png\ncta: Book a call\nkind: section\nsurface: dark\nlayout: section\nnotes: say hi\ndecor: false\nlogo: true\n---',
    );
    expect(slide).toEqual({
      id: 's2',
      kind: 'section',
      layout: 'section',
      surface: 'dark',
      label: 'Investor update',
      title: 'T',
      subtitle: 'A line',
      number: '01',
      background: 'assets/bg.png',
      cta: 'Book a call',
      notes: 'say hi',
      decor: false,
      logo: true,
      blocks: [],
    });
    expect(warnings).toEqual([]);
  });

  it('reads the front as Prettier writes it (blank lines inside the fence)', () => {
    expect(one('\n---\n\nlabel: L\nnumber: "02"\n---\n\nBody').slide).toEqual({
      id: 's2',
      label: 'L',
      title: 'T',
      number: '02',
      blocks: [{ type: 'paragraph', text: 'Body' }],
    });
  });

  it('warns on unknown front keys, a front title and invalid YAML (never throws)', () => {
    expect(one('---\ncolour: red\ntitle: X\n---').warnings.map((w) => w.message)).toEqual([
      'slide front: unknown key "colour" ignored',
      'slide front "title" ignored: the "# " heading is the title',
    ]);
    const bad = one('---\nlabel: [unclosed\n---\nBody');
    expect(bad.warnings[0].message).toMatch(/slide front is not valid YAML/);
    expect(bad.slide.blocks).toEqual([{ type: 'paragraph', text: 'Body' }]);
  });

  it('`## x` is the subtitle, the first paragraph of a cover / section / cta too; <!-- kind --> stays accepted', () => {
    expect(one('## Sub\nBody').slide).toMatchObject({ subtitle: 'Sub', blocks: [{ type: 'paragraph' }] });
    const s = one('<!-- kind: section -->\nPart 1').slide;
    expect(s).toEqual({ id: 's2', kind: 'section', title: 'T', subtitle: 'Part 1', blocks: [] });
    // the front wins over the comment and over a paragraph-subtitle
    const f = one('---\nkind: cta\nsubtitle: Front\n---\n<!-- kind: text -->\nBody').slide;
    expect(f).toMatchObject({
      kind: 'cta',
      subtitle: 'Front',
      blocks: [{ type: 'paragraph', text: 'Body' }],
    });
  });

  it('resolves {brand.*} in slide keys; an unresolvable key is dropped with a warning', () => {
    const { slide, warnings } = one('---\nlabel: "{brand.name}"\nsubtitle: "{brand.nope}"\n---', {
      brandSpec: { name: 'Acme' },
    });
    expect(slide.label).toBe('Acme');
    expect(slide.subtitle).toBeUndefined();
    expect(warnings[0].message).toMatch(/slide key "subtitle" dropped/);
  });
});

describe('content/2 grammar: every block type (positive)', () => {
  it.each([
    [
      'points (- list)',
      '1. One\n2. Two\n   - nested',
      {
        type: 'points',
        ordered: true,
        items: [{ text: 'One' }, { text: 'Two', children: [{ text: 'nested' }] }],
      },
    ],
    [
      'points (fence)',
      fence('points', '- text: One\n  icon: route\n- Two'),
      { type: 'points', items: [{ text: 'One', icon: 'route' }, { text: 'Two' }] },
    ],
    [
      'items',
      fence(
        'items',
        'title: Why\nitems:\n  - heading: A\n    body: a\n    icon: i\n    image: x.png\n    label: L\n  - B',
      ),
      {
        type: 'items',
        title: 'Why',
        items: [{ heading: 'A', body: 'a', icon: 'i', image: 'x.png', label: 'L' }, { heading: 'B' }],
      },
    ],
    [
      'subpoints',
      fence('subpoints', '- heading: A\n  lines: [one, two]\n- heading: B\n  body: "x\\ny"'),
      {
        type: 'subpoints',
        items: [
          { heading: 'A', lines: ['one', 'two'] },
          { heading: 'B', lines: ['x', 'y'] },
        ],
      },
    ],
    [
      'kpis',
      fence(
        'kpis',
        'nested: true\nitems:\n  - value: 1.50\n    heading: h\n    body: b\n    image: i.png\n    trend: up',
      ),
      {
        type: 'kpis',
        nested: true,
        items: [{ value: '1.50', heading: 'h', body: 'b', image: 'i.png', trend: 'up' }],
      },
    ],
    [
      'process',
      fence('process', 'shape: funnel\nitems:\n  - heading: A\n    body: a\n    icon: i\n  - heading: B'),
      { type: 'process', shape: 'funnel', items: [{ heading: 'A', body: 'a', icon: 'i' }, { heading: 'B' }] },
    ],
    [
      'timeline',
      fence(
        'timeline',
        '- when: Q1\n  heading: A\n  body: a\n  lines: [x]\n  icon: i\n- when: Q2\n  heading: B',
      ),
      {
        type: 'timeline',
        items: [
          { when: 'Q1', heading: 'A', body: 'a', lines: ['x'], icon: 'i' },
          { when: 'Q2', heading: 'B' },
        ],
      },
    ],
    [
      'chart',
      fence(
        'chart',
        'type: stacked%\ncategories: [a, b]\nseries:\n  - name: s\n    values: [1, 2]\ntext:\n  title: T\n  xAxis: x\n  yAxis: y\n  legend: [s]\n  source: S\nhighlight: 1\nunit: "%"',
      ),
      {
        type: 'chart',
        chartType: 'stacked%',
        categories: ['a', 'b'],
        series: [{ name: 's', values: [1, 2] }],
        text: { title: 'T', xAxis: 'x', yAxis: 'y', source: 'S', legend: ['s'] },
        highlight: 1,
        unit: '%',
      },
    ],
    [
      'table',
      fence(
        'table',
        'title: T\nsubtitle: S\nheader: [A, B]\nrows:\n  - [x, true]\n  - [{type: rating, value: 4}, {type: image, src: a.png, alt: logo}]\nhighlightColumn: 1\nrowHeader: true',
      ),
      {
        type: 'table',
        title: 'T',
        subtitle: 'S',
        header: ['A', 'B'],
        rows: [
          ['x', { type: 'check', value: true }],
          [
            { type: 'rating', value: 4 },
            { type: 'image', src: 'a.png', alt: 'logo' },
          ],
        ],
        highlightColumn: 1,
        rowHeader: true,
      },
    ],
    [
      'quotes',
      fence('quotes', '- text: Q1\n  name: N\n  role: R\n  photo: p.png\n  label: L\n- text: Q2'),
      {
        type: 'quotes',
        items: [{ text: 'Q1', name: 'N', role: 'R', photo: 'p.png', label: 'L' }, { text: 'Q2' }],
      },
    ],
    [
      'quotes (> markdown, adjacent quotes merge; the attribution may be the last > line)',
      '> One\n— Ann, CEO\n\n> Two\n> -- Bo',
      {
        type: 'quotes',
        items: [
          { text: 'One', name: 'Ann', role: 'CEO' },
          { text: 'Two', name: 'Bo' },
        ],
      },
    ],
    [
      'people',
      fence(
        'people',
        'title: Team\nsubtitle: S\nitems:\n  - name: A\n    role: r\n    photo: p.png\n    bio: b',
      ),
      {
        type: 'people',
        title: 'Team',
        subtitle: 'S',
        items: [{ name: 'A', role: 'r', photo: 'p.png', bio: 'b' }],
      },
    ],
    [
      'logos (rows)',
      fence('logos', 'title: Clients\nrows:\n  - [A, B]\n  - [{src: c.png, name: C}]'),
      {
        type: 'logos',
        title: 'Clients',
        items: [
          { name: 'A', row: 0 },
          { name: 'B', row: 0 },
          { src: 'c.png', name: 'C', row: 1 },
        ],
      },
    ],
    [
      'compare (tiers)',
      fence(
        'compare',
        'tiers: true\ncolumns:\n  - header: Free\n    price: €0\n    features: [one]\n  - header: Pro\n    label: Best\n    image: p.png\n    price: €10\n    per: per month\n    items:\n      - heading: Support\n        body: email\n        check: true',
      ),
      {
        type: 'compare',
        tiers: true,
        columns: [
          { header: 'Free', price: '€0', features: ['one'] },
          {
            header: 'Pro',
            label: 'Best',
            image: 'p.png',
            price: '€10',
            per: 'per month',
            items: [{ heading: 'Support', body: 'email', check: true }],
          },
        ],
      },
    ],
    [
      'compare (## columns)',
      '## Before\n- slow\n  - very\n![x](a.png)\n## After\n- fast\nNote',
      {
        type: 'compare',
        columns: [
          { header: 'Before', image: 'a.png', items: [{ heading: 'slow', body: 'very' }] },
          { header: 'After', items: [{ heading: 'fast' }, { heading: 'Note' }] },
        ],
      },
    ],
    [
      'paragraph (fence)',
      fence('paragraph', 'A paragraph: with a colon.'),
      { type: 'paragraph', text: 'A paragraph: with a colon.' },
    ],
    ['paragraph (plain line)', 'Just text', { type: 'paragraph', text: 'Just text' }],
    [
      'image (fence)',
      fence('image', 'treatment: collage\nitems:\n  - src: a.png\n    alt: A\n    caption: c\n  - b.png'),
      {
        type: 'image',
        treatment: 'collage',
        items: [{ src: 'a.png', alt: 'A', caption: 'c' }, { src: 'b.png' }],
      },
    ],
    [
      'image (markdown, adjacent images merge)',
      '![A](a.png)\n![B](b.png)',
      {
        type: 'image',
        items: [
          { src: 'a.png', alt: 'A' },
          { src: 'b.png', alt: 'B' },
        ],
      },
    ],
  ])('%s', (_, body, block) => {
    const { slide, warnings } = one(body);
    expect(slide.blocks).toEqual([block]);
    expect(validateBlockV2(block)).toEqual([]);
    expect(warnings.filter((w) => w.severity === 'warn' && !/range/.test(w.message))).toEqual([]);
  });

  it('covers all 14 block types', () => {
    expect([...BLOCK_TYPES].sort()).toEqual(
      [
        'chart',
        'compare',
        'image',
        'items',
        'kpis',
        'logos',
        'paragraph',
        'people',
        'points',
        'process',
        'quotes',
        'subpoints',
        'table',
        'timeline',
      ].sort(),
    );
  });
});

describe('content/2 grammar: v1 fence names as aliases', () => {
  it.each([
    [
      'cards',
      '- title: A\n  text: a\n  number: "01"',
      { type: 'items', items: [{ heading: 'A', body: 'a', label: '01' }] },
    ],
    [
      'steps',
      '- title: A\n  text: a\n- title: B',
      { type: 'process', shape: 'linear', items: [{ heading: 'A', body: 'a' }, { heading: 'B' }] },
    ],
    [
      'steps (text only)',
      '- text: Only text',
      { type: 'process', shape: 'linear', items: [{ heading: 'Only text' }] },
    ],
    ['kpis', '- value: 12\n  label: things', { type: 'kpis', items: [{ value: '12', heading: 'things' }] }],
    [
      'timeline',
      '- when: P0\n  title: A\n  text: a',
      { type: 'timeline', items: [{ when: 'P0', heading: 'A', body: 'a' }] },
    ],
    [
      'quote',
      'text: Hi\nattribution: Ann\navatar: a.png',
      { type: 'quotes', items: [{ text: 'Hi', name: 'Ann', photo: 'a.png' }] },
    ],
    ['people', '- name: A\n  role: r', { type: 'people', items: [{ name: 'A', role: 'r' }] }],
    ['logos', '- name: A\n- src: b.png', { type: 'logos', items: [{ name: 'A' }, { src: 'b.png' }] }],
    [
      'chart',
      'chartType: stackedBar\nseries:\n  - name: s\n    values: [1]',
      { type: 'chart', chartType: 'stacked', series: [{ name: 's', values: [1] }] },
    ],
    ['table', 'header: [A]\nrows:\n  - [1]', { type: 'table', header: ['A'], rows: [['1']] }],
  ])('```%s```', (label, yaml, block) => {
    expect(one(fence(label.split(' ')[0], yaml)).slide.blocks).toEqual([block]);
  });

  it('upgrades a P2 doc read as content/2 the same way upgradeContent upgrades its content/1 parse', () => {
    const md = showcaseMd();
    const brandSpec = stripeBrandSpec();
    const v1 = parseMarkdown(md, { brandSpec });
    const forced = parseMarkdown(md, { brandSpec, schema: 'content/2' });
    expect(forced).toEqual(upgradeContent(v1).content);
    expect(validateContent(forced)).toEqual([]);
  });
});

describe('content/2 grammar: malformed YAML (negative)', () => {
  it.each([
    ['points', 'text: [unclosed'],
    ['items', '- heading: [unclosed'],
    ['subpoints', '- heading: A\n  lines: [x'],
    ['kpis', 'items:\n  - value: [1'],
    ['process', 'shape: cycle\nitems: {'],
    ['timeline', '- when: "Q1\n  heading: A'],
    ['chart', 'type: column\nseries: [{'],
    ['table', 'rows:\n  - [a, b'],
    ['quotes', '- text: "x'],
    ['people', '- name: [A'],
    ['logos', 'rows: [[A'],
    ['compare', 'columns: [{header: A'],
    ['image', 'items:\n  - src: [a'],
  ])('```%s``` with broken YAML -> kept as a paragraph + a warning', (name, yaml) => {
    const { slide, warnings } = one(fence(name, yaml));
    expect(slide.blocks).toEqual([{ type: 'paragraph', text: yaml }]);
    expect(warnings.map((w) => w.message).join('\n')).toMatch(new RegExp(`fenced block "${name}"`));
  });

  it('```paragraph``` that is not YAML text is read as plain text (info)', () => {
    const { slide, warnings } = one(fence('paragraph', 'key: value: "x'));
    expect(slide.blocks).toEqual([{ type: 'paragraph', text: 'key: value: "x' }]);
    expect(warnings[0].severity).toBe('info');
  });

  it('a block of the wrong shape for its type is dropped with a warning; unknown fields are ignored with one', () => {
    const wrong = one(fence('items', '- body: only a body\n  colour: red\n  size: 3'));
    // body-only node: the body is its heading; the unknown fields warn
    expect(wrong.slide.blocks).toEqual([{ type: 'items', items: [{ heading: 'only a body' }] }]);
    expect(wrong.warnings.map((w) => w.message)).toEqual([
      'fenced block "items": unknown field "colour" ignored',
      'fenced block "items": unknown field "size" ignored',
      'items has 1 nodes, under its range 2–10',
    ]);
    const invalid = one(fence('kpis', '- heading: no value'));
    expect(invalid.slide.blocks).toEqual([]);
    expect(invalid.warnings[0].message).toMatch(/kpis block dropped: not a valid content block .*value/);
    const badShape = one(fence('process', 'shape: spiral\nitems: [A, B]'));
    expect(badShape.slide.blocks).toEqual([]);
    expect(badShape.warnings[0].message).toMatch(/process block dropped/);
  });

  it('a list fence written as a scalar is kept as a paragraph', () => {
    const { slide, warnings } = one(fence('points', 'just one line'));
    expect(slide.blocks[0].type).toBe('paragraph');
    expect(warnings[0].message).toMatch(/must be a YAML list/);
  });
});

describe('BLOCKS (design-intent ranges)', () => {
  it('has node counts and field ranges for every block type', () => {
    for (const type of BLOCK_TYPES) {
      const b = BLOCKS[type];
      expect(b.nodes.min).toBeLessThanOrEqual(b.nodes.max);
      for (const r of Object.values(b.fields)) expect(r.maxChars).toBeGreaterThan(0);
    }
    expect(BLOCKS.items.fields.heading).toEqual({ maxChars: 40 });
    expect(BLOCKS.kpis.fields.value).toEqual({ maxChars: 8 });
    expect(BLOCKS.paragraph.fields.text).toEqual({ minChars: 150, maxChars: 400 });
  });

  it('a block over its node max or a field far over its range is a content warning, never an error', () => {
    const many = { type: 'points', items: Array.from({ length: 14 }, (_, k) => ({ text: `p${k}` })) };
    expect(blockWarnings(many)).toEqual([
      { severity: 'warn', message: 'points has 14 nodes, over its range 2–12' },
    ]);
    const long = 'x'.repeat(Math.ceil(40 * FAR_OVER) + 1);
    const items = { type: 'items', items: [{ heading: long }, { heading: 'ok' }] };
    expect(blockWarnings(items)[0].message).toBe(
      `items[0].heading is ${long.length} characters, far over its design range (≤ 40)`,
    );
    // just over (not far over) is fine: the fitter measures
    expect(blockWarnings({ type: 'items', items: [{ heading: 'x'.repeat(45) }, { heading: 'y' }] })).toEqual(
      [],
    );
    expect(slideWarnings({ title: 'x'.repeat(100), blocks: [1, 2, 3, 4] }).map((w) => w.message)).toEqual([
      'title is 100 characters, far over its design range (≤ 60)',
      '4 content blocks on one slide (a slide holds up to 3)',
    ]);
    const { content, warnings } = parseMarkdownResult(
      `# T\n${fence('points', many.items.map((i) => `- ${i.text}`).join('\n'))}`,
    );
    expect(content.slides[0].blocks[0].items).toHaveLength(14);
    expect(warnings).toEqual([
      {
        check: 'content',
        severity: 'warn',
        message: 'points has 14 nodes, over its range 2–12',
        slide: 's1',
      },
    ]);
  });
});

describe('content schema v2.0', () => {
  const v2 = (blocks, extra = {}) => ({
    schema: 'content/2',
    slides: [{ id: 's1', title: 'T', ...extra, blocks }],
  });

  it('accepts content/1 and content/2 documents', () => {
    expect(validateContent(parseMarkdown(showcaseMd(), { brandSpec: stripeBrandSpec() }))).toEqual([]);
    expect(validateContent(v2([{ type: 'paragraph', text: 'x' }], { label: 'L', decor: false }))).toEqual([]);
  });

  it.each([
    ['a v1 block in content/2', v2([{ type: 'list', items: [{ text: 'x' }] }])],
    ['an unknown node field', v2([{ type: 'items', items: [{ heading: 'a', colour: 'red' }] }])],
    ['an unknown slide key', v2([], { colour: 'red' })],
    ['a non-boolean decor', v2([], { decor: 'no' })],
    ['an unknown process shape', v2([{ type: 'process', shape: 'spiral', items: [{ heading: 'a' }] }])],
    [
      'an unknown chart type',
      v2([{ type: 'chart', chartType: 'kagi', series: [{ name: 's', values: [1] }] }]),
    ],
    ['a rich cell without type', v2([{ type: 'table', rows: [[{ text: 'x' }]] }])],
    ['a compare with one column', v2([{ type: 'compare', columns: [{ header: 'A' }] }])],
    ['a logo with nothing to show', v2([{ type: 'logos', items: [{ row: 1 }] }])],
    [
      'a v2-only block in content/1',
      { schema: 'content/1', slides: [{ id: 's1', blocks: [{ type: 'points', items: [{ text: 'x' }] }] }] },
    ],
    ['an unknown schema', { schema: 'content/3', slides: [{ id: 's1', blocks: [] }] }],
  ])('rejects %s', (_, doc) => {
    expect(validateContent(doc).length).toBeGreaterThan(0);
  });
});

describe('upgradeContent (content/1 -> content/2) and lowering', () => {
  const v1 = parseMarkdown(showcaseMd(), { brandSpec: stripeBrandSpec() });
  const { content, warnings } = upgradeContent(v1);
  const by = Object.fromEntries(content.slides.map((s) => [s.id, s]));

  it('is a valid content/2 document with the same slides', () => {
    expect(content.schema).toBe('content/2');
    expect(validateContent(content)).toEqual([]);
    expect(content.slides.map((s) => s.kind)).toEqual(v1.slides.map((s) => s.kind));
    expect(warnings).toEqual([]);
    expect(upgradeContent(content).content).toBe(content);
  });

  it('maps title / subtitle to slide keys and P2 blocks to content/2 blocks', () => {
    expect(by.s1).toEqual({
      id: 's1',
      kind: 'cover',
      title: 'Stripe',
      subtitle: 'Build what matters',
      blocks: [],
    });
    expect(by.s2.blocks[0]).toMatchObject({ type: 'points', ordered: true });
    expect(by.s6.blocks[0].type).toBe('compare');
    expect(by.s7.blocks[0].type).toBe('items');
    expect(by.s8.blocks[0]).toMatchObject({ type: 'process', shape: 'linear' });
    expect(by.s11.blocks[0].items[0]).toEqual({ value: '12', heading: 'layouts in the first catalogue' });
    expect(by.s19.blocks[0]).toEqual({
      type: 'quotes',
      items: [
        {
          text: "The mood is the brand's guidelines, applied the same way on every slide, without anyone having to remember them.",
          name: 'A reviewer',
          role: 'Design team',
        },
      ],
    });
    // the "Thank you" slide: the paragraph-subtitle is the subtitle, the second line a paragraph
    expect(by.s24).toMatchObject({ subtitle: 'Questions and next steps', blocks: [{ type: 'paragraph' }] });
  });

  it('kpis.delta (no content/2 field) is dropped with an info warning', () => {
    const { content: c, warnings: w } = upgradeContent({
      schema: 'content/1',
      slides: [{ id: 'a', blocks: [{ type: 'kpis', items: [{ value: '1', label: 'x', delta: '+2' }] }] }],
    });
    expect(c.slides[0].blocks[0].items).toEqual([{ value: '1', heading: 'x' }]);
    expect(w).toEqual([
      { check: 'content', severity: 'info', message: expect.stringMatching(/kpis.delta/), slide: 'a' },
    ]);
  });

  it('lowerSlide returns a content/1 slide itself (the golden path is untouched)', () => {
    for (const s of v1.slides) expect(lowerSlide(s).slide).toBe(s);
  });

  it('inferKind reads content/2 slides through the aliases', () => {
    const kinds = content.slides.map((s, index) =>
      inferKind({ ...s, kind: undefined }, { index, count: content.slides.length }),
    );
    const v1Kinds = v1.slides.map((s, index) =>
      inferKind({ ...s, kind: undefined }, { index, count: v1.slides.length }),
    );
    expect(kinds).toEqual(v1Kinds);
    const k = (blocks, extra = {}) =>
      inferKind({ id: 'x', title: 'T', ...extra, blocks }, { index: 2, count: 9 });
    expect(k([], { subtitle: 'S', label: 'L', number: '01' })).toBe('section');
    expect(k([{ type: 'subpoints', items: [{ heading: 'a', lines: ['b'] }] }])).toBe('cards');
    expect(k([{ type: 'quotes', items: [{ text: 'q' }] }])).toBe('quote');
    expect(k([{ type: 'image', treatment: 'side', items: [{ src: 'a.png' }] }])).toBe('image-text');
    expect(k([{ type: 'image', treatment: 'full', items: [{ src: 'a.png' }] }])).toBe('image');
    expect(k([{ type: 'paragraph', text: 'p' }])).toBe('text');
    expect(inferKind({ id: 'x', title: 'T', cta: 'Go', blocks: [] }, { index: 8, count: 9 })).toBe('cta');
  });
});
