import {
  clipPolygon,
  edgeAngles,
  geometry,
  paintedColours,
  parseColour,
  parsePath,
  parseSvg,
  parseTransform,
  apply,
  paints,
  polygonArea,
  viewportMatrix,
} from '../src/svggeom.js';

const pts = (sp) => sp.points.map((p) => p.map((v) => Math.round(v * 1000) / 1000));
const svg = (body, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parsePath', () => {
  it('absolute M L H V Z', () => {
    const { subpaths, approx } = parsePath('M10 10L30 10H40V20Z');
    expect(approx).toBe(false);
    expect(pts(subpaths[0])).toEqual([
      [10, 10],
      [30, 10],
      [40, 10],
      [40, 20],
      [10, 10],
    ]);
    expect(subpaths[0].closed).toBe(true);
    expect(subpaths[0].curve).toEqual([false, false, false, false]);
  });

  it('relative m l h v z, implicit line-tos after m, and a second subpath', () => {
    const { subpaths } = parsePath('m10 10 20 0 v10 h-20 z m50 0 l10 0 0 10z');
    expect(pts(subpaths[0])).toEqual([
      [10, 10],
      [30, 10],
      [30, 20],
      [10, 20],
      [10, 10],
    ]);
    expect(pts(subpaths[1])).toEqual([
      [60, 10],
      [70, 10],
      [70, 20],
      [60, 10],
    ]);
  });

  it('numbers without separators (-, .5.5, exponents)', () => {
    const { subpaths } = parsePath('M0-5L.5.5l1e1 0');
    expect(pts(subpaths[0])).toEqual([
      [0, -5],
      [0.5, 0.5],
      [10.5, 0.5],
    ]);
  });

  it('a curve is flattened between its end points and flagged approx (negative: no curve, no approx)', () => {
    const c = parsePath('M0 0C0 10 10 10 10 0');
    expect(c.approx).toBe(true);
    const sp = c.subpaths[0];
    expect(sp.points[0]).toEqual([0, 0]);
    expect(sp.points[sp.points.length - 1]).toEqual([10, 0]);
    expect(sp.curve.every(Boolean)).toBe(true);
    expect(Math.max(...sp.points.map((p) => p[1]))).toBeCloseTo(7.5, 1); // the curve's bulge is kept
    expect(parsePath('M0 0L10 0').approx).toBe(false);
  });

  it('S, Q, T and arcs (compact flags) end where they should', () => {
    for (const d of [
      'M0 0c0 10 10 10 10 0s10-10 10 0',
      'M0 0Q5 10 10 0T20 0',
      'M0 0a5 5 0 1010 0',
      'M0 0A5 5 0 0 1 10 0',
    ]) {
      const { subpaths, approx } = parsePath(d);
      const last = subpaths[0].points[subpaths[0].points.length - 1];
      expect(approx).toBe(true);
      expect(last[1]).toBeCloseTo(0, 6);
      expect([10, 20]).toContain(Math.round(last[0]));
    }
    // a half circle arc reaches its radius
    const half = parsePath('M0 0A5 5 0 0 0 10 0').subpaths[0];
    expect(Math.max(...half.points.map((p) => Math.abs(p[1])))).toBeCloseTo(5, 1);
  });
});

describe('transforms and the viewport', () => {
  it('translate, scale, rotate and matrix compose in order', () => {
    expect(apply(parseTransform('translate(10 20)'), [1, 1])).toEqual([11, 21]);
    expect(apply(parseTransform('translate(10,0) scale(2)'), [1, 1])).toEqual([12, 2]);
    const r = apply(parseTransform('rotate(90)'), [1, 0]);
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(1, 9);
    expect(apply(parseTransform('matrix(1 0 0 1 5 5)'), [0, 0])).toEqual([5, 5]);
  });

  it('preserveAspectRatio none stretches; meet scales uniformly and centres', () => {
    const none = parseSvg(svg('', 'viewBox="0 0 100 50" preserveAspectRatio="none"'));
    expect(viewportMatrix(none, { x: 0, y: 0, w: 200, h: 200 })).toEqual([2, 0, 0, 4, 0, 0]);
    const meet = parseSvg(svg('', 'viewBox="0 0 100 50"'));
    expect(viewportMatrix(meet, { x: 0, y: 0, w: 200, h: 200 })).toEqual([2, 0, 0, 2, 0, 50]);
  });
});

describe('parseSvg', () => {
  it('reads basic shapes, inherited fills, <style> classes and <use>', () => {
    const doc = parseSvg(
      svg(
        '<style>.a{fill:#ff0000}</style><defs><rect id="r" width="10" height="10"/></defs>' +
          '<g fill="#00ff00"><rect class="a" x="0" y="0" width="10" height="10"/><circle cx="50" cy="50" r="10"/></g>' +
          '<use href="#r" x="80" y="80" fill="#0000ff"/><polygon points="0,90 10,90 5,100" style="fill:#123456"/>',
      ),
    );
    expect(doc.shapes.map((s) => s.tag)).toEqual(['rect', 'circle', 'rect', 'polygon']);
    expect(doc.shapes.map((s) => s.fill.rgb)).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [0x12, 0x34, 0x56],
    ]);
    expect(doc.shapes[2].subpaths[0].points[0]).toEqual([80, 80]); // the <use> offset
    expect(doc.approx).toBe(false);
  });

  it('notes what it does not model (image, text, mask) and is approx then', () => {
    const doc = parseSvg(
      svg(
        '<image href="x.png" width="10" height="10"/><text>a</text><rect width="5" height="5" mask="url(#m)"/>',
      ),
    );
    expect(doc.approx).toBe(true);
    expect(doc.notes).toEqual([
      '<text> is not measured',
      'a mask is not applied',
      'an embedded <image> is not measured',
    ]);
  });

  it('applies a one-rect clip-path; painted colours include gradient stops', () => {
    const doc = parseSvg(
      svg(
        '<defs><clipPath id="c"><rect width="50" height="100"/></clipPath>' +
          '<linearGradient id="g"><stop stop-color="#111111"/><stop offset="1" style="stop-color:#eeeeee"/></linearGradient></defs>' +
          '<rect width="100" height="100" fill="url(#g)" clip-path="url(#c)"/>',
      ),
    );
    expect(polygonArea(doc.shapes[0].subpaths[0].points.slice(0, -1))).toBeCloseTo(5000, 6);
    expect(paintedColours(doc).map((c) => c.hex)).toEqual(['#111111', '#EEEEEE']);
  });

  it('colours: hex, rgb(), names, none, currentColor, url()', () => {
    expect(parseColour('#abc').rgb).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseColour('rgb(0, 128, 255)').rgb).toEqual([0, 128, 255]);
    expect(parseColour('white').rgb).toEqual([255, 255, 255]);
    expect(parseColour('none')).toEqual({ none: true });
    expect(parseColour('currentColor')).toEqual({ current: true });
    expect(parseColour('url(#p)')).toEqual({ ref: 'p' });
    expect(parseColour('nonsense')).toBeNull();
  });
});

describe('geometry', () => {
  it('maps the painted shapes into a box, measures area share and slant angles', () => {
    const doc = parseSvg(
      svg('<path d="M0 0H100V100Z" fill="#000"/>', 'viewBox="0 0 100 100" preserveAspectRatio="none"'),
    );
    const g = geometry(doc, { x: 0, y: 0, w: 200, h: 100 }, { minAngleEdge: 1 });
    expect(g.areaShare).toBeCloseTo(0.5, 2);
    expect(g.bbox).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(g.angles).toEqual([26.5]); // atan(100 / 200) = 26.57 -> 26.5
  });

  it('clips to the viewBox: the viewport cut is not an angle, the slant is', () => {
    const doc = parseSvg(svg('<path d="M-100 -100L200 200L200 -100Z" fill="#000"/>'));
    const g = geometry(doc, null);
    expect(g.areaShare).toBeCloseTo(0.5, 2);
    expect(g.angles).toEqual([45]);
  });

  it('paints() honours evenodd holes; edgeAngles leaves axis and short edges out', () => {
    const ring = 'M0 0H100V100H0Z M25 25H75V75H25Z';
    const evenodd = parseSvg(svg(`<path d="${ring}" fill-rule="evenodd" fill="#000"/>`)).shapes[0];
    const nonzero = parseSvg(svg(`<path d="${ring}" fill="#000"/>`)).shapes[0];
    expect(paints(evenodd, [50, 50])).toBe(false);
    expect(paints(nonzero, [50, 50])).toBe(true);
    expect(paints(evenodd, [10, 10])).toBe(true);
    expect(edgeAngles([nonzero])).toEqual([]);
    const short = parseSvg(svg('<path d="M0 0L3 4L0 4Z" fill="#000"/>')).shapes;
    expect(edgeAngles(short, { minLength: 10 })).toEqual([]);
    expect(edgeAngles(short, { minLength: 1 })).toEqual([53]);
  });

  it('clipPolygon (Sutherland-Hodgman)', () => {
    const out = clipPolygon(
      [
        [-10, -10],
        [20, -10],
        [20, 20],
        [-10, 20],
      ],
      { x0: 0, y0: 0, x1: 10, y1: 10 },
    );
    expect(polygonArea(out)).toBeCloseTo(100, 6);
  });
});
