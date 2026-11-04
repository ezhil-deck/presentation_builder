// V3 matching (proposal PR-6, packages/templates/src/match.js): each need kind met / unmet / optional, the device
// usability rule, the image rotation, the disqualify rule, the content fit and the pin - on synthetic records and a
// synthetic brand (no browser, no golden files), plus the library file (data/authored.json) loading next to the
// catalogue.
import {
  needWeight,
  statementSample,
  authoredTemplates,
  candidates,
  contentFit,
  pickTemplate,
  resolveNeed,
  samplesOf,
  templateById,
  templatesFor,
  validateTemplate,
} from '../src/index.js';
import { capabilityIndex } from '../src/match.js';

const rec = (id, category, needs, extra = []) => ({
  id,
  category: 'section-slide',
  authoredCategory: category,
  provenance: { source: 'authored' },
  needs: needs.map(([key, optional], i) => ({
    key,
    optional: Boolean(optional),
    element: `o${i + 1}`,
    role: 'decor',
  })),
  elements: [
    ...needs.map((n, i) => ({
      id: `o${i + 1}`,
      role: 'decor',
      primitive: 'shape',
      box: { x: 0, y: 0, w: 1, h: 1 },
    })),
    { id: 'tt', role: 'title', primitive: 'text', mark: { part: 't' }, box: { x: 0, y: 0, w: 1, h: 1 } },
    ...extra,
  ],
});

const surfaces = {
  blue: { id: 'blue', tone: 'dark', bg: '#003366', role: 'accent' },
  white: { id: 'white', tone: 'light', bg: '#FFFFFF', role: 'default' },
};
const mood = {
  logo: {
    variants: { full: { file: 'l/full.png' }, monoLight: { file: 'l/mono.png' } },
    perSurface: { blue: 'monoLight', white: 'full' },
  },
  components: { button: { tokens: {} }, team: { tokens: {} } },
  decor: {
    elements: [
      {
        id: 'bands',
        file: 'e/bands.svg',
        type: 'shape',
        box: { x: 0, y: 0, w: 1920, h: 1080 },
        surfaces: ['blue'],
      },
      { id: 'swirl', file: 'e/swirl.png', type: 'illustration' },
      { id: 'leadRule', type: 'rule', thickness: 4, length: 80, color: '#FF0000' },
      { id: 'drawnShape', type: 'shape' },
      { id: 'tint', file: 'e/tint.svg', type: 'shape', blend: 'multiply' },
    ],
  },
};
const cap = (key, given = {}, extra = {}) => ({
  key,
  status: 'given',
  from: [`/x/${key}`],
  files: [],
  given,
  ...extra,
});
const brandSpec = {
  capabilities: [
    cap('device:bands', { type: 'shape', namedBy: ['title'], allowedOn: ['section'] }),
    cap('device:swirl', { type: 'illustration', allowedOn: ['section'] }),
    cap('device:leadRule', { type: 'rule', allowedOn: ['title'] }),
    cap('device:drawnShape', { type: 'shape', allowedOn: ['title'] }),
    cap('photo-area', {
      layouts: [
        {
          id: 'title',
          polygon: [
            [0, 0],
            [50, 0],
            [40, 100],
            [0, 100],
          ],
        },
      ],
    }),
    cap('text-zone', {
      layouts: [{ id: 'title', titleAlign: 'right', textPosition: 'bottom', maxWidthPct: 42 }],
    }),
    cap('overlay:tint', { layouts: [{ id: 'title' }] }),
    cap('image:photo-people', {}),
    cap('logo:full'),
    cap('logo:monoLight', { placements: [{ layout: 'title', box: { x: 60, y: 5, w: 30, h: 10 } }] }),
    cap('component:people', { sources: ['team'] }),
    cap('weight-contrast'),
    cap('mask:slant'),
    cap('cutout', {}, { files: ['c/a.png', 'c/b.png'], from: ['/imagery/samples/7', '/imagery/samples/8'] }),
  ],
  imagery: {
    samples: [
      { file: 'i/p0.jpg', kind: 'photo-people', tags: [] },
      { file: 'i/p1.jpg', kind: 'photo-people', tags: ['hero', 'wide'] },
      { file: 'i/x2.jpg', kind: 'photo-product', tags: ['hero', 'bleed', 'wide'] },
      { file: 'i/l3.png', kind: 'logo', tags: ['hero'] },
      { file: 'i/p4.jpg', kind: 'photo-people', tags: ['bleed'] },
    ],
  },
};
const ctx = (slide = {}, used = {}) => ({ caps: capabilityIndex(brandSpec), mood, brandSpec, slide, used });
const need = (key, kind = 'cover', slide = { surface: surfaces.blue }, used) =>
  resolveNeed(key, kind, ctx(slide, used));

describe('resolveNeed: every need kind', () => {
  it('logo:<variant> exact, logo:any = the surface variant; an absent variant is unmet', () => {
    expect(need('logo:full')).toMatchObject({ met: true, value: { variant: 'full' } });
    expect(need('logo:full').signal).toMatch(/^logo:full /);
    expect(need('logo:mark')).toMatchObject({ met: false });
    expect(need('logo:any')).toMatchObject({ met: true, value: { variant: 'monoLight' } });
    expect(need('logo:any').value.placements).toHaveLength(1);
  });

  it('component:<term> through the capability source; absent -> unmet', () => {
    expect(need('component:button')).toMatchObject({ met: true, value: { component: 'button' } });
    expect(need('component:people')).toMatchObject({ met: true, value: { component: 'team' } });
    expect(need('component:avatar')).toMatchObject({ met: false });
  });

  it('exact keys: weight-contrast, mask:<id>, cutout met; second-face, type-ladder, angle unmet', () => {
    expect(need('weight-contrast').met).toBe(true);
    expect(need('mask:slant').met).toBe(true);
    expect(need('mask:round').met).toBe(false);
    expect(need('second-face').met).toBe(false);
    expect(need('type-ladder').met).toBe(false);
    expect(need('angle').met).toBe(false);
    expect(need('cutout')).toMatchObject({ met: true, value: { file: 'c/a.png' } });
    // the cut-out rotates too
    const used = { samples: new Map([['c/a.png', 1]]) };
    expect(need('cutout', 'cover', { surface: surfaces.blue }, used).value.file).toBe('c/b.png');
  });

  it('device:<type>: usable when namedBy / allowedOn maps to the kind (kindMap), drawable, on its surfaces', () => {
    // named by layout title -> cover
    expect(need('device:shape')).toMatchObject({ met: true });
    expect(need('device:shape').value.el.id).toBe('bands');
    expect(need('device:shape').value.named).toBe(true);
    // allowedOn section -> section, not cover
    expect(need('device:illustration').met).toBe(false);
    expect(need('device:illustration', 'section').met).toBe(true);
    // a drawn rule (no file) is drawable
    expect(need('device:rule')).toMatchObject({ met: true, value: { drawn: true } });
    // the surface rule: bands shows on blue only
    expect(need('device:shape', 'cover', { surface: surfaces.white }).met).toBe(false);
    // device:any prefers the named device over an allowed one
    expect(need('device:any').value.el.id).toBe('bands');
    // a drawn shape (no file, not a rule) is never usable
    expect(need('device:shape', 'cover', { surface: surfaces.white }).why).toMatch(/no shape device/);
    // a device need naming the brand element id
    expect(need('device:bands').met).toBe(true);
    expect(need('device:swirl').met).toBe(false);
  });

  it('photo-area, text-zone, overlay:<id> come from the brand layout of THIS kind only', () => {
    expect(need('photo-area')).toMatchObject({ met: true, value: { layout: { id: 'title' } } });
    expect(need('photo-area', 'section').met).toBe(false);
    expect(need('text-zone').value.layout.maxWidthPct).toBe(42);
    expect(need('text-zone', 'cta').met).toBe(false);
    expect(need('overlay:any')).toMatchObject({ met: true, value: { id: 'tint' } });
    expect(need('overlay:tint').met).toBe(true);
    expect(need('overlay:other').met).toBe(false);
    expect(need('overlay:any', 'quote').met).toBe(false);
  });

  it('image:<kind>: the slide image first; else samples of that kind, hero / bleed / wide first, rotated; never another kind', () => {
    // the slide's own image
    const own = { surface: surfaces.blue, image: { src: 'c/me.jpg', pointer: '/background', kind: null } };
    expect(need('image:photo-people', 'cover', own)).toMatchObject({
      met: true,
      value: { file: 'c/me.jpg' },
    });
    // a slide image of another known kind is never swapped for a sample
    const product = { ...own, image: { ...own.image, kind: 'photo-product' } };
    expect(need('image:photo-people', 'cover', product).met).toBe(false);
    expect(need('image:any', 'cover', product).met).toBe(true);
    // samples: the tagged one first
    expect(need('image:photo-people').value.file).toBe('i/p1.jpg');
    // rotation: used samples go last
    const used = { samples: new Map([['i/p1.jpg', 1]]) };
    expect(need('image:photo-people', 'cover', { surface: surfaces.blue }, used).value.file).toBe('i/p4.jpg');
    // image:any never takes a logo sample (the tagged product photo wins)
    expect(need('image:any').value.file).toBe('i/x2.jpg');
    expect(samplesOf('any', brandSpec).map((s) => s.s.kind)).not.toContain('logo');
    // no sample of the kind
    expect(need('image:illustration').met).toBe(false);
    // only samples the brand tags hero / cover / bleed (an untagged one never; product-ui only when tagged hero)
    expect(samplesOf('photo-people', brandSpec).map((x) => x.s.file)).not.toContain('i/p0.jpg');
    expect(statementSample({ kind: 'photo-people', tags: ['cover'] })).toBe(true);
    expect(statementSample({ kind: 'photo-people', tags: ['wide'] })).toBe(false);
    expect(statementSample({ kind: 'product-ui', tags: ['bleed'] })).toBe(false);
    expect(statementSample({ kind: 'product-ui', tags: ['hero'] })).toBe(true);
  });

  it('colour-field:<dark | light | any | surface id> against the slide surface tone', () => {
    expect(need('colour-field:dark').met).toBe(true);
    expect(need('colour-field:light').met).toBe(false);
    expect(need('colour-field:any').met).toBe(true);
    expect(need('colour-field:blue').met).toBe(true);
    expect(need('colour-field:dark', 'cover', { surface: surfaces.white }).met).toBe(false);
  });
});

describe('candidates: score, disqualify, ties, pin, content fit', () => {
  const t = (id, needs, extra) => rec(id, 'cover-slide', needs, extra);
  const records = [
    t('a-device', [['device:shape'], ['photo-area'], ['logo:any'], ['text-zone', true]]),
    t('b-panel', [['image:any'], ['colour-field:any'], ['logo:any']]),
    t('c-type', [['colour-field:dark'], ['angle', true], ['weight-contrast', true]]),
    t('d-cut', [['cutout'], ['logo:mark']]),
    t('e-panel', [['image:any'], ['colour-field:any'], ['logo:any']]),
    rec('z-section', 'section-slide', [['colour-field:any']]),
  ];
  const run = (slide = { surface: surfaces.blue }, used = {}, bs = brandSpec) =>
    candidates('cover', { brandSpec: bs, mood, slide, used, records });
  // the same brand without devices: nothing gives the cover its own visual
  const plain = {
    ...brandSpec,
    capabilities: brandSpec.capabilities.filter((c) => !c.key.startsWith('device:')),
  };

  it("only the kind's category (authoredCategory); score = weighted needs met - optional unmet", () => {
    const list = run();
    expect(list.map((c) => c.template.id)).not.toContain('z-section');
    const byId = Object.fromEntries(list.map((c) => [c.template.id, c]));
    // device 2 + photo-area 2 + text-zone 2 + logo 1
    expect(byId['a-device'].score).toBe(7);
    expect(byId['c-type']).toMatchObject({ score: 1, qualified: true }); // 2 met, angle optional unmet: -1
    expect(byId['c-type'].needs.find((n) => n.key === 'angle')).toMatchObject({ met: false, optional: true });
  });

  it('a required need unmet disqualifies (logo:mark), nearest named when none qualifies', () => {
    const list = run();
    expect(list.find((c) => c.template.id === 'd-cut').qualified).toBe(false);
    expect(list[0].template.id).toBe('a-device');
    // on a light surface the bands device is not usable: a-device and c-type drop out
    const light = run({ surface: surfaces.white });
    expect(light.find((c) => c.template.id === 'a-device').qualified).toBe(false);
    const only = pickTemplate('cover', {
      brandSpec,
      mood,
      slide: { surface: surfaces.white },
      records: [records[0], records[3]],
    });
    expect(only.best).toBeNull();
    expect(only.nearest.template.id).toBe('a-device');
  });

  it("the brand's own visual for the kind (a device allowed / named there): a sample photo is unmet without that device", () => {
    const blue = Object.fromEntries(run().map((c) => [c.template.id, c]));
    expect(blue['b-panel'].qualified).toBe(false);
    expect(blue['b-panel'].needs[0].why).toMatch(/device:bands is named by the cover/);
    // the slide's own image still fills it
    const own = { surface: surfaces.blue, image: { src: 'c/me.jpg', pointer: '/background', kind: null } };
    expect(run(own).find((c) => c.template.id === 'b-panel').qualified).toBe(true);
    // a background hint naming an image variant is the brand's visual too
    const hinted = {
      ...mood,
      composition: { layoutHints: { cover: { background: 'art' } } },
    };
    const sf = { ...surfaces.white, background: { art: { type: 'image', image: 'b/art.jpg' } } };
    const r = candidates('cover', { brandSpec: plain, mood: hinted, slide: { surface: sf }, records });
    expect(r.find((c) => c.template.id === 'b-panel').needs[0].why).toMatch(/image variant "art"/);
    // without either, the tagged sample fills it
    expect(
      run({ surface: surfaces.white }, {}, plain).find((c) => c.template.id === 'b-panel').qualified,
    ).toBe(true);
  });

  it('ties go to the template used fewer times in the deck, then id order', () => {
    const slide = { surface: surfaces.white };
    expect(run(slide, {}, plain)[0].template.id).toBe('b-panel');
    expect(run(slide, { templates: new Map([['b-panel', 1]]) }, plain)[0].template.id).toBe('e-panel');
  });

  it('a pinned tpl-<id> wins among the qualified, never a disqualified one', () => {
    expect(run({ surface: surfaces.blue, layoutId: 'tpl-c-type' })[0].template.id).toBe('c-type');
    expect(run({ surface: surfaces.blue, layoutId: 'tpl-d-cut' })[0].template.id).toBe('a-device');
  });

  it('content fit: every content field needs an element (title, label, subtitle, number, action, one quote, picture)', () => {
    const num = { id: 'n', role: 'big-number', primitive: 'text', box: {} };
    const k = { id: 'k', role: 'label', primitive: 'text', mark: { part: 'k' }, box: {} };
    const sub = { id: 's', role: 'subtitle', primitive: 'text', box: {} };
    expect(contentFit(t('x', [['logo:any']]), 'section', { keys: { number: true } }).ok).toBe(false);
    expect(contentFit(t('x', [['logo:any']], [num]), 'section', { keys: { number: true } }).ok).toBe(true);
    expect(
      contentFit(t('x', [['logo:any']]), 'cover', { fields: { title: true, label: true } }).why[0],
    ).toMatch(/a label; the template has no element/);
    expect(
      contentFit(t('x', [['logo:any']], [k]), 'cover', { fields: { title: true, label: true } }).ok,
    ).toBe(true);
    expect(contentFit(t('x', [['logo:any']]), 'cover', { fields: { title: true, subtitle: true } }).ok).toBe(
      false,
    );
    expect(
      contentFit(t('x', [['logo:any']], [sub]), 'cover', { fields: { title: true, subtitle: true } }).ok,
    ).toBe(true);
    // a statement: its title is the header (mark t); a quote label needs a label element; one label holds one of two
    const st = rec('q', 'quote-slide', [['logo:any']], [k]);
    expect(contentFit(st, 'quote', { fields: { title: true, quoteLabel: true } }).ok).toBe(true);
    expect(contentFit(st, 'quote', { fields: { title: true, label: true, quoteLabel: true } }).ok).toBe(
      false,
    );
    expect(contentFit(t('x', [['logo:any']]), 'quote', { quotes: 3 }).why[0]).toMatch(/3 quotes/);
    const pic = { image: { src: 'a.jpg', pointer: '/blocks/0/items/0/photo' } };
    expect(contentFit(t('x', [['logo:any']]), 'quote', pic).ok).toBe(false);
    expect(contentFit(t('x', [['image:any', true]]), 'quote', pic).ok).toBe(true);
    // a background image stays the background: no photo element needed
    expect(contentFit(t('x', [['logo:any']]), 'cover', { image: { pointer: '/background' } }).ok).toBe(true);
    const dq = candidates('section', {
      brandSpec,
      mood,
      slide: { surface: surfaces.blue, keys: { number: true } },
      records,
    });
    expect(dq[0]).toMatchObject({ qualified: false });
    expect(dq[0].content.why[0]).toMatch(/section number/);
  });

  it('weights: a brand signature need counts 2, every other need 1', () => {
    expect(needWeight('device:shape')).toBe(2);
    expect(needWeight('photo-area')).toBe(2);
    expect(needWeight('text-zone')).toBe(2);
    expect(needWeight('overlay:any')).toBe(2);
    expect(needWeight('image:any')).toBe(1);
    expect(needWeight('logo:any')).toBe(1);
    expect(needWeight('colour-field:dark')).toBe(1);
  });
});

describe('the template library (data/authored.json)', () => {
  it('loads next to the catalogue; 15 records (12 templates + 3 options), all valid, authored category per kind', () => {
    const lib = authoredTemplates();
    expect(lib).toHaveLength(15);
    for (const r of lib) expect([r.id, validateTemplate(r).errors]).toEqual([r.id, []]);
    expect(templateById('cover-device-photo-field')).not.toBeNull();
    const n = (k) => templatesFor(k).map((r) => r.id.split('~')[0]);
    expect(new Set(n('cover')).size).toBe(5);
    expect(new Set(n('section')).size).toBe(3);
    expect(new Set(n('cta')).size).toBe(2);
    expect(new Set(n('quote')).size).toBe(2);
    for (const r of lib) expect(r.provenance.basis).toMatch(/%/);
  });

  it('the hdfc-shaped cover template needs device:shape, photo-area, image:photo-people, logo:any, colour-field:dark', () => {
    const t = templateById('cover-device-photo-field');
    const req = t.needs
      .filter((x) => !x.optional)
      .map((x) => x.key)
      .sort();
    expect(req).toEqual([
      'colour-field:dark',
      'device:shape',
      'image:photo-people',
      'logo:any',
      'photo-area',
    ]);
    expect(
      t.needs
        .filter((x) => x.optional)
        .map((x) => x.key)
        .sort(),
    ).toEqual(['overlay:any', 'text-zone']);
  });
});
