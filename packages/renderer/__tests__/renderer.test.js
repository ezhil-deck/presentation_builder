import { renderDeckToHtml, renderSlideToHtml, applyCase, arcPath } from '../src/index.js';
import { ASSETS, count, deckValidator, elementHtml, loadDeck, parseStyle, tags } from './helpers.js';

const OPTS = { assetBase: 'assets/', fontBase: 'assets/' };
const px = (v) => `${Math.round(v * 1000) / 1000}px`;

describe('fixture', () => {
  it('validates against schemas/deck.schema.json', () => {
    const validate = deckValidator();
    const ok = validate(loadDeck());
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('renderDeckToHtml', () => {
  const deck = loadDeck();
  const html = renderDeckToHtml(deck, OPTS);

  it('is a standalone document with one section.slide per slide', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(count(html, '<section class="slide"')).toBe(2);
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('.slide{position:relative;display:block;width:1920px;height:1080px');
  });

  it('has print CSS: page = canvas, no margin, one slide per page; screen scale via transform', () => {
    expect(html).toContain('@page{size:1920px 1080px;margin:0}');
    expect(html).toMatch(/@media print\{[^]*break-after:page/);
    expect(html).toContain('transform:scale(var(--pb-scale))');
    expect(html).toContain('--pb-scale:1 !important');
  });

  it('emits one @font-face per font file with format from the extension and metric overrides', () => {
    const faces = html.match(/@font-face\{[^}]*\}/g);
    expect(faces).toHaveLength(2);
    expect(faces[0]).toContain('font-family:"Tiny"');
    expect(faces[0]).toContain('src:url("assets/fonts/Tiny-Regular.ttf") format("truetype")');
    expect(faces[0]).toContain('ascent-override:80%;descent-override:20%;line-gap-override:0%');
    expect(faces[1]).toContain('font-family:"TinyText"');
    expect(faces[1]).not.toContain('ascent-override');
  });

  it('places one span per fitted line at frame + line.x / line.y − ascent·size', () => {
    const el = deck.slides[0].elements[0];
    const box = elementHtml(html, 'title');
    const outer = parseStyle(/style="([^"]*)"/.exec(box)[1]);
    expect(outer.left).toBe('120px');
    expect(outer.top).toBe('160px');
    const lines = tags(box, /class="pb-line"/);
    expect(lines).toHaveLength(3);
    const ascent = deck.fonts[0].metrics.ascent;
    lines.forEach(({ style }, i) => {
      const line = el.text.lines[i];
      expect(style.left).toBe(px(line.x));
      expect(style.top).toBe(px(line.y - ascent * el.text.font.size));
      // slide-absolute position = frame + relative
      expect(el.frame.x + parseFloat(style.left)).toBeCloseTo(el.frame.x + line.x, 6);
      expect(el.frame.y + parseFloat(style.top)).toBeCloseTo(el.frame.y + line.y - ascent * 60, 6);
      expect(style['white-space']).toBe('pre');
      expect(style['line-height']).toBe('1'); // ascent − descent = 0.8 − (−0.2)
      expect(style['font-size']).toBe('60px');
      expect(style['font-family']).toBe('"Tiny", sans-serif');
    });
    expect(box).toContain('<span style="font-weight:700">bold</span>');
    expect(box).not.toContain('data-warning');
  });

  it('uses text.font.ascent/descent when the deck font has no metrics, and paints bullets at line.bullet.x (F4)', () => {
    const el = deck.slides[1].elements[2];
    const box = elementHtml(html, 'notes');
    expect(box).not.toContain('data-warning');
    const lines = tags(box, /class="pb-line"/);
    expect(lines.map((l) => l.style.top)).toEqual(el.text.lines.map((l) => px(l.y - 0.8 * 30)));
    const bullets = tags(box, /class="pb-bullet"/);
    expect(bullets).toHaveLength(2);
    expect(bullets[0].style.left).toBe(px(el.text.lines[0].bullet.x));
  });

  it('a bulleted paragraph whose line has no bullet geometry is flagged, never indented by the renderer', () => {
    const d = loadDeck();
    const notes = d.slides[1].elements[2];
    for (const l of notes.text.lines) delete l.bullet;
    const nb = elementHtml(renderDeckToHtml(d, OPTS), 'notes');
    expect(nb).toContain('paragraph 0 has a bullet but its line has no bullet geometry');
    expect(tags(nb, /class="pb-bullet"/)).toHaveLength(0);
  });

  it('flags a missing ascent (0.9 fallback) and missing lines instead of guessing silently', () => {
    const d = loadDeck();
    const notes = d.slides[1].elements[2];
    delete notes.text.font.ascent;
    delete notes.text.font.descent;
    const title = d.slides[0].elements[0];
    delete title.text.lines;
    const out = renderDeckToHtml(d, OPTS);
    const nb = elementHtml(out, 'notes');
    expect(nb).toMatch(/data-warning="no ascent for &quot;TinyText&quot;: used 0.9"/);
    expect(tags(nb, /class="pb-line"/)[0].style.top).toBe(px(notes.text.lines[0].y - 0.9 * 30));
    expect(elementHtml(out, 'title')).toContain('data-warning="no fitted lines"');
  });

  it('renders the image with object-fit and the asset path; crop and tint handled', () => {
    const box = elementHtml(html, 'photo');
    expect(box).toContain('src="assets/photo.png"');
    expect(box).toContain('object-fit:cover');
    expect(box).toContain('border-radius:16px');
    expect(box).toContain('overflow:hidden');
    const d = loadDeck();
    d.slides[0].elements[1].image.tint = '#FF0000';
    d.slides[0].elements[1].image.crop = { x: 0.25, y: 0, w: 0.5, h: 1 };
    const cropped = elementHtml(renderDeckToHtml(d, OPTS), 'photo');
    expect(cropped).toContain('data-warning="tint ignored"');
    expect(cropped).not.toContain('filter');
    expect(cropped).toContain('left:-200px;top:0px;width:800px;height:300px');
  });

  it('uses image.animated only with {animated:true}', () => {
    const d = loadDeck();
    d.assets['a-anim'] = { file: 'photo-anim.webp' };
    d.slides[0].elements[1].image.animated = 'a-anim';
    expect(elementHtml(renderDeckToHtml(d, OPTS), 'photo')).toContain('src="assets/photo.png"');
    expect(elementHtml(renderDeckToHtml(d, { ...OPTS, animated: true }), 'photo')).toContain(
      'src="assets/photo-anim.webp"',
    );
  });

  it('paints rect as a div and line as inline SVG', () => {
    const rect = elementHtml(html, 'bar');
    expect(rect).toContain('background-color:#533AFD');
    expect(rect).toContain('border-radius:8px');
    expect(rect).toContain('opacity:0.9');
    expect(rect).not.toContain('<svg');
    const line = elementHtml(html, 'rule');
    expect(line).toMatch(/<svg[^>]*><line x1="0" y1="0" x2="1680" y2="0" stroke="#50617A" stroke-width="2"/);
  });

  it('paints the gradient background from its stops', () => {
    expect(html).toContain('background-image:linear-gradient(135deg, #FFFFFF 0%, #E0DCFF 100%)');
    expect(html).toContain(
      'data-background="solid" style="position:absolute;left:0;top:0;width:100%;height:100%;background-color:#F8FAFD"',
    );
  });

  it('draws the chart purely from geometry: N bar rects, ticks, legend', () => {
    const chart = deck.slides[1].elements[0].chart;
    const box = elementHtml(html, 'chart');
    expect(count(box, '<rect class="pb-bar"')).toBe(chart.geometry.bars.length);
    expect(count(box, '<rect')).toBe(chart.geometry.bars.length + chart.geometry.legend.length);
    const first = chart.geometry.bars[0];
    expect(box).toContain(
      `x="${first.x}" y="${first.y}" width="${first.w}" height="${first.h}" rx="4" fill="#533AFD"`,
    );
    expect(count(box, 'class="pb-tick-x"')).toBe(3);
    expect(count(box, 'class="pb-tick-y"')).toBe(3);
    expect(count(box, 'class="pb-chart-line"')).toBe(3);
    expect(box).toContain('>100%</text>');
    expect(box).not.toContain('data-warning');
  });

  it('shows a flagged grey box for a chart without geometry', () => {
    const d = loadDeck();
    delete d.slides[1].elements[0].chart.geometry;
    const box = elementHtml(renderDeckToHtml(d, OPTS), 'chart');
    expect(box).toContain('data-warning="no geometry"');
    expect(box).toContain('border:1px dashed #9E9E9E');
    expect(box).not.toContain('<svg');
  });

  it('lays the table out as R×C absolutely positioned cells with fitted lines', () => {
    const t = deck.slides[1].elements[1].table;
    const box = elementHtml(html, 'table');
    const cells = tags(box, /class="pb-cell/);
    const R = 1 + t.rows.length;
    const C = t.colWidths.length;
    expect(cells).toHaveLength(R * C);
    expect(count(box, 'pb-cell-header')).toBe(C);
    // cell (2,1): left = 240, top = 160
    const c21 = cells.find((c) => c.tag.includes('data-row="2"') && c.tag.includes('data-col="1"'));
    expect(c21.style).toMatchObject({ left: '240px', top: '160px', width: '180px', height: '80px' });
    expect(c21.style['background-color']).toBe('#F8FAFD'); // body row 1 -> altFill
    expect(count(box, 'class="pb-line"')).toBe(R * C);
    expect(box).toContain('>10 USD</span>');
    expect(box).toContain('color:#FFFFFF'); // header cell font
  });

  it('is deterministic: the same deck gives identical HTML', () => {
    expect(renderDeckToHtml(loadDeck(), OPTS)).toBe(html);
    expect(renderDeckToHtml(JSON.parse(JSON.stringify(deck)), OPTS)).toBe(html);
  });

  it('inlines assets and fonts as data: URIs with inlineAssets', () => {
    const out = renderDeckToHtml(deck, {
      assetBase: `${ASSETS}/`,
      fontBase: `${ASSETS}/`,
      inlineAssets: true,
    });
    expect(out).toContain('src="data:image/png;base64,');
    expect(out).toContain('url("data:font/ttf;base64,');
    expect(out).not.toContain(ASSETS);
  });
});

describe('renderSlideToHtml', () => {
  it('renders one slide with the shared stylesheet and fonts', () => {
    const out = renderSlideToHtml(loadDeck(), 1, OPTS);
    expect(count(out, '<section class="slide"')).toBe(1);
    expect(out).toContain('data-index="1"');
    expect(out).toContain('@font-face');
    expect(() => renderSlideToHtml(loadDeck(), 5)).toThrow(RangeError);
  });
});

describe('editor attributes and hidden elements (P4.1)', () => {
  it('every element root carries data-element-id (and data-slot when the element has one)', () => {
    const deck = loadDeck();
    deck.slides[0].elements[0].slot = 'title';
    const html = renderDeckToHtml(deck, OPTS);
    for (const s of deck.slides)
      for (const el of s.elements) expect(html).toContain(`data-element-id="${el.id}"`);
    expect(elementHtml(html, deck.slides[0].elements[0].id)).toContain('data-slot="title"');
  });

  it('an element with hidden: true is not painted; the others are', () => {
    const deck = loadDeck();
    const [first, second] = deck.slides[0].elements;
    first.hidden = true;
    const validate = deckValidator();
    expect(validate(deck)).toBe(true);
    const html = renderDeckToHtml(deck, OPTS);
    expect(html).not.toContain(`data-element-id="${first.id}"`);
    if (second) expect(html).toContain(`data-element-id="${second.id}"`);
    // a hidden child of a group is not painted either
    const group = {
      id: 'g',
      type: 'group',
      frame: { x: 0, y: 0, w: 100, h: 100 },
      children: [
        {
          id: 'g-a',
          type: 'shape',
          frame: { x: 0, y: 0, w: 10, h: 10 },
          shape: { kind: 'rect' },
          hidden: true,
        },
        { id: 'g-b', type: 'shape', frame: { x: 0, y: 0, w: 10, h: 10 }, shape: { kind: 'rect' } },
      ],
    };
    deck.slides[1].elements.push(group);
    const html2 = renderDeckToHtml(deck, OPTS);
    expect(html2).not.toContain('data-element-id="g-a"');
    expect(html2).toContain('data-element-id="g-b"');
  });
});

describe('text case', () => {
  it('applies upper / lower / title at render', () => {
    expect(applyCase('hello world', 'upper')).toBe('HELLO WORLD');
    expect(applyCase('Hello World', 'lower')).toBe('hello world');
    const state = { prev: '' };
    expect(applyCase('brand ', 'title', state) + applyCase('bold title', 'title', state)).toBe(
      'Brand Bold Title',
    );
    const d = loadDeck();
    d.slides[0].elements[0].text.font.case = 'upper';
    expect(elementHtml(renderDeckToHtml(d, OPTS), 'title')).toContain('>THREE LINES</span>');
  });
});

describe('arcPath', () => {
  it('draws pie and donut sectors clockwise from 12 o’clock', () => {
    expect(arcPath({ cx: 100, cy: 100, r: 50, a0: 0, a1: 90 })).toBe(
      'M100,100 L100,50 A50,50 0 0 1 150,100 Z',
    );
    expect(arcPath({ cx: 100, cy: 100, r: 50, r0: 25, a0: 0, a1: 90 })).toBe(
      'M100,50 A50,50 0 0 1 150,100 L125,100 A25,25 0 0 0 100,75 Z',
    );
  });
});
