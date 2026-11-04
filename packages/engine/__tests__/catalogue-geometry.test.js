// The Rich Slide Catalogue geometry (golden/catalogue/geometry.json, measured once in headless Chrome by
// `npm run catalogue:geometry`): every slide of the index has its boxes, every plan field sits inside the canvas and
// its container, the shape slides' zones lie in the body without overlapping - checked here without a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_OVERFLOWS, validateGeometry } from '../../../scripts/catalogue-geometry.mjs';
import { ROOT } from './helpers.js';

const index = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/index.json'), 'utf8'));
const geometry = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/geometry.json'), 'utf8'));
const g = geometry.slides;

describe('catalogue geometry', () => {
  test('validateGeometry finds no problem in the checked-in geometry', () => {
    expect(validateGeometry(index, geometry)).toEqual([]);
  });

  test('one entry per index slide, in index order; measured from the same HTML', () => {
    expect(Object.keys(g)).toEqual(index.slides.map((s) => s.id));
    expect(Object.keys(g)).toHaveLength(1646);
    expect(geometry.source.sha256).toBe(index.source.sha256);
    expect(geometry.viewport).toEqual({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  });

  test('plan fields and containers add up to the index totals', () => {
    let fields = 0;
    let containers = 0;
    for (const s of index.slides.filter((x) => x.section === 'plan'))
      for (const c of s.fields) {
        containers += 1;
        fields += Object.values(c.fields).reduce((a, b) => a + b, 0);
      }
    const measured = (k) => Object.values(g).reduce((n, s) => n + (s[k] ? s[k].length : 0), 0);
    expect(measured('fields')).toBe(fields);
    expect(measured('fields')).toBe(10520);
    expect(measured('containers')).toBe(containers);
  });

  test('L1-1: two containers, the first a list with two headings + two descriptions in the left two thirds', () => {
    const s = g['L1-1'];
    expect(s.containers.map((c) => c.type)).toEqual(['list_with_description', 'simple_list']);
    const first = s.fields.filter((f) => f.c === 1);
    expect(first.map((f) => `${f.f}.${f.i}`).sort()).toEqual([
      'description.1',
      'description.2',
      'heading.1',
      'heading.2',
    ]);
    const { box, extent } = s.containers[0];
    expect(box.x + box.w).toBeLessThanOrEqual(1280);
    expect(extent.x + extent.w).toBeLessThanOrEqual(1280);
    // The catalogue marks the first card only; the second card is the container's other item.
    expect(s.containers[0].items).toHaveLength(1);
    for (const f of first) expect(f.fontSize).toBeGreaterThan(0);
  });

  test('S1 (F1): one full zone across the body; every shape slide has zones inside its body', () => {
    const s = g.S1;
    expect(s.zones.map((z) => z.zone)).toEqual(['c1']);
    expect(s.zones[0].box.x).toBe(s.body.x);
    expect(s.zones[0].box.w).toBe(s.body.w);
    expect(s.body).toMatchObject({ x: 67, w: 1786 });
    const shapes = index.slides.filter((x) => x.section === 'shapes');
    for (const sh of shapes) expect(g[sh.id].zones.length).toBeGreaterThan(0);
  });

  test('a display: contents field is measured from its parts (L32-1 timeline headings)', () => {
    const h = g['L32-1'].fields.find((f) => f.f === 'heading' && f.i === 1);
    expect(h.parts.length).toBe(2);
    expect(h.box.w).toBeGreaterThan(0);
    expect(h.box.h).toBeGreaterThan(h.parts[1].box.h);
  });

  test('the title face is the embedded brand face; the serif fields fall back offline (recorded)', () => {
    expect(Object.keys(geometry.fontFamily.title)).toEqual([
      '"Headspace Apercu", Outfit, Arial, Helvetica, sans-serif',
    ]);
    expect(Object.keys(geometry.fontFamily.painted)).toContain('Headspace Apercu (embedded)');
    expect(geometry.fontFamily.blockedRequests).toEqual([]);
  });

  test('C3.2 (D6): the rules that separate / frame a container, found by border sides and thin painted lines', () => {
    const rules = (id, c = 1) => g[id].containers.find((x) => x.c === c).rules;
    const none = { top: false, bottom: false, left: false, right: false, between: false, inner: false };
    // L1-3: `.rb` between the two stacked points; the dark checklist card has no rule
    expect(rules('L1-3')).toEqual({ ...none, between: true });
    expect(rules('L1-3', 2)).toEqual(none);
    // L13-3: sub-points on hairlines (inside the items); the bullets across a vertical hairline, ruled rows
    expect(rules('L13-3')).toEqual({ ...none, inner: true });
    expect(rules('L13-3', 2)).toEqual({ ...none, left: true, between: true });
    // L23-3: a 2 x 2 grid of `.rt` cells; L12-1: the paragraph under an inline border-top
    expect(rules('L23-3')).toEqual({ ...none, top: true, between: true });
    expect(rules('L12-1', 2)).toEqual({ ...none, top: true });
    // a roadmap's rule across its phases is its axis, not a separator; L31-7 has no line at all (negative)
    expect(rules('L18-13')).toEqual({ ...none, axis: true });
    expect(rules('L31-7')).toEqual({ ...none, axis: false });
    for (const k of ['border-top div.rt[style]', 'border-bottom li.rb[style]', 'background div[style]'])
      expect(geometry.ruleSources[k]).toBeGreaterThan(0);
  });

  test('C3.2 (D7): the numeral / year of the first item, its size and where it sits', () => {
    const n = (id) => g[id].containers[0];
    expect(n('L24-7').numeral).toEqual(expect.objectContaining({ fontSize: 104, text: '01', class: 'fig' }));
    expect(n('L24-7').numeralAlign).toBe('top');
    // a separate row of years over the phases; a year inside its heading field (display: contents parts)
    expect(n('L18-13').numeral).toEqual(expect.objectContaining({ fontSize: 104, text: '2026' }));
    expect(n('L32-7').numeral).toEqual(expect.objectContaining({ fontSize: 120, text: '2022' }));
    // the numeral lies above its fields
    const { box: b, fields: f } = n('L31-7').numeral;
    expect(b.y + b.h).toBeLessThanOrEqual(f.y);
    // small labels are recorded too (the generator decides the zone); a list without numerals has none
    expect(n('L31-9').numeral).toEqual(expect.objectContaining({ text: 'Step 1', class: 'lab' }));
    expect(n('L23-3').numeral).toBeUndefined();
  });

  test('the known overflows are the only excused fields', () => {
    expect(Object.keys(KNOWN_OVERFLOWS).sort()).toEqual(['L38-63', 'L5-71']);
  });
});

describe('validateGeometry on fixtures', () => {
  const box = (x, y, w, h) => ({ x, y, w, h });
  const header = { t: { box: box(67, 112, 1360, 116) }, r: { box: box(67, 286, 150, 8) } };
  const fixtureIndex = () => ({
    slides: [
      {
        id: 'L1-1',
        section: 'plan',
        title: 'A title',
        fields: [{ c: 1, type: 'simple_list', fields: { bullet: 2 } }],
      },
      { id: 'S1', section: 'shapes', title: 'A title' },
    ],
  });
  const fixtureGeometry = () => ({
    slides: {
      'L1-1': {
        section: 'plan',
        header,
        body: box(67, 294, 1786, 688),
        containers: [{ c: 1, type: 'simple_list', box: box(67, 330, 800, 500), elements: 1 }],
        fields: [
          { c: 1, f: 'bullet', i: 1, box: box(80, 340, 700, 80) },
          { c: 1, f: 'bullet', i: 2, box: box(80, 440, 700, 80) },
        ],
      },
      S1: {
        section: 'shapes',
        header,
        body: box(67, 294, 1786, 688),
        zones: [
          { zone: 'c1', box: box(67, 330, 881, 600) },
          { zone: 'c2', box: box(972, 330, 881, 600) },
        ],
      },
    },
  });

  test('a clean fixture has no problem', () => {
    expect(validateGeometry(fixtureIndex(), fixtureGeometry())).toEqual([]);
  });

  test('a field outside the canvas', () => {
    const geo = fixtureGeometry();
    geo.slides['L1-1'].fields[1].box = box(1800, 440, 200, 80);
    const problems = validateGeometry(fixtureIndex(), geo);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^L1-1: field 1\.bullet\.2 .* outside the canvas/);
  });

  test('a field outside its container', () => {
    const geo = fixtureGeometry();
    geo.slides['L1-1'].fields[1].box = box(900, 440, 700, 80);
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([
      expect.stringMatching(/^L1-1: field 1\.bullet\.2 .* lies outside its container 1/),
    ]);
  });

  test('a field inside an item of its container (the extent) passes; outside the extent it fails', () => {
    const geo = fixtureGeometry();
    const c = geo.slides['L1-1'].containers[0];
    geo.slides['L1-1'].fields[1].box = box(900, 440, 700, 80);
    c.items = [box(880, 330, 800, 500)];
    c.extent = box(67, 330, 1613, 500);
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([]);
    geo.slides['L1-1'].fields[1].box = box(900, 900, 700, 80);
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([
      expect.stringMatching(/^L1-1: field 1\.bullet\.2 .* lies outside its container 1/),
    ]);
  });

  test('overlapping zones and a zone outside the body', () => {
    const geo = fixtureGeometry();
    geo.slides.S1.zones[1].box = box(900, 330, 881, 600);
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([
      expect.stringMatching(/^S1: zones c1 and c2 overlap/),
    ]);
    geo.slides.S1.zones[1].box = box(972, 200, 881, 600);
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([
      expect.stringMatching(/^S1: zone c2 .* lies outside the body/),
    ]);
  });

  test('a missing slide, an extra slide, a field count off the index', () => {
    const geo = fixtureGeometry();
    delete geo.slides.S1;
    geo.slides.X9 = geo.slides['L1-1'];
    geo.slides['L1-1'] = { ...geo.slides['L1-1'], fields: geo.slides['L1-1'].fields.slice(0, 1) };
    const problems = validateGeometry(fixtureIndex(), geo);
    expect(problems).toContain('S1: no geometry entry');
    expect(problems).toContain('X9: geometry entry not in the index');
    expect(problems).toContain('L1-1: field 1.bullet: 1 measured, the index has 2');
  });

  test('a missing title and a short body', () => {
    const geo = fixtureGeometry();
    geo.slides['L1-1'] = { ...geo.slides['L1-1'], header: {}, body: null };
    geo.slides.S1.body = box(67, 294, 1786, 300);
    const problems = validateGeometry(fixtureIndex(), geo);
    expect(problems).toContain('L1-1: the index has a title, the geometry no .t');
    expect(problems).toContain('S1: body box 67,294 1786x300 is lower than 400 px');
  });

  test('C3.2: a rule side that is not a boolean, a numeral off the canvas or beside nothing', () => {
    const geo = fixtureGeometry();
    const c = geo.slides['L1-1'].containers[0];
    c.rules = { top: true, between: false, inner: false };
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([]);
    c.rules = { top: 'yes', diagonal: false };
    c.numeral = { box: box(1900, 330, 80, 60), fontSize: 104, text: '01' };
    c.numeralAlign = 'right';
    expect(validateGeometry(fixtureIndex(), geo)).toEqual([
      expect.stringMatching(/^L1-1: container 1: rules\.top must be one of/),
      expect.stringMatching(/^L1-1: container 1: rules\.diagonal must be one of/),
      expect.stringMatching(/^L1-1: container 1: numeral box .* outside the canvas/),
      'L1-1: container 1: numeralAlign must be top or left, is right',
    ]);
  });

  test('a body box with no width (a header set right of the mirror margin, measured the wrong way)', () => {
    const geo = fixtureGeometry();
    geo.slides.S1.body = box(1000, 294, -80, 688);
    expect(validateGeometry(fixtureIndex(), geo)).toContain(
      'S1: body box 1000,294 -80x688 is outside the canvas or empty',
    );
  });
});
