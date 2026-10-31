import { rule } from '../src/rules/palette.js';
import { load, messages } from './fixtures.js';

describe('MD-PALETTE on stripe', () => {
  const res = rule(load('stripe'));
  const { palette } = res.patch;
  const byId = Object.fromEntries(palette.surfaces.map((s) => [s.id, s]));

  it('copies every surface with its colour roles; logo -> logoVariant', () => {
    expect(palette.surfaces.map((s) => s.id)).toEqual(['page', 'light', 'navy']);
    expect(byId.navy).toMatchObject({
      bg: '#0D1738',
      text: '#FFFFFF',
      heading: '#FFFFFF',
      accent: '#7F7DFC',
      card: '#1A2651',
      logoVariant: 'monoLight',
    });
    expect(byId.navy.logo).toBeUndefined();
  });

  it('roles (D8): default from backgrounds.default.surface, alt for same tone, dark for the opposite dark tone', () => {
    expect(byId.page.role).toBe('default');
    expect(byId.light.role).toBe('alt');
    // navy bg #0D1738 equals colors.secondary, which no longer makes an accent surface (D8): dark, opposite tone.
    expect(byId.navy.role).toBe('dark');
    expect(res.provenance['/palette/surfaces/0/role'].from).toEqual(['/backgrounds/default/surface']);
    expect(res.provenance['/palette/surfaces/2/role']).toMatchObject({
      rule: 'MD-PALETTE',
      from: ['/surfaces/2/bg', '/surfaces/0/bg'],
    });
    expect(res.provenance['/palette/surfaces/2/role'].note).toMatch(/opposite/);
  });

  it('D8: a surface whose bg equals colors.primary or colors.accent is the accent surface', () => {
    for (const key of ['primary', 'accent']) {
      const b = load('stripe');
      b.colors[key] = b.surfaces[2].bg;
      const r = rule(b);
      expect(r.patch.palette.surfaces[2].role).toBe('accent');
      expect(r.provenance['/palette/surfaces/2/role'].from).toEqual(['/surfaces/2/bg', `/colors/${key}`]);
    }
  });

  it('tone as given and WCAG contrast vs bg', () => {
    expect([byId.page.tone, byId.light.tone, byId.navy.tone]).toEqual(['light', 'light', 'dark']);
    expect(byId.page.contrast).toEqual({ text: 17.37, heading: 17.37, accent: 6.19 });
  });

  it('attaches non-solid variants to the surface they name', () => {
    expect(byId.page.background.heroRibbon).toMatchObject({
      type: 'image',
      image: 'assets/art-hero-slide.png',
    });
    expect(byId.light.background).toBeUndefined();
  });

  it('rhythm, perKind, semantic, chart', () => {
    expect(palette.rhythm).toEqual(['page', 'light', 'page', 'navy', 'page', 'light']);
    expect(palette.perKind).toMatchObject({
      cover: 'page',
      section: 'navy',
      cta: 'navy',
      quote: 'light',
      bullets: 'page',
      'two-column': 'page',
    });
    expect(palette.perKind['image-text']).toBe('page'); // imageText -> image-text (D10)
    expect(palette.perKind.kpi).toBe('page'); // stat -> kpi (D10)
    expect(palette.semantic.success).toBe('#15BE53');
    expect(palette.chart).toEqual({
      categorical: ['#7F7DFC', '#533AFD', '#F44BCC', '#FFCF5E', '#839BC8'],
      sequential: ['#E0DCFF', '#B2A6FE', '#533AFD', '#3A29B1', '#211765'],
      muted: '#E5EDF5',
      highlight: '#533AFD',
    });
    expect(res.provenance['/palette/chart/highlight']).toMatchObject({ from: ['/colors/accent'] });
    expect(res.provenance['/palette/chart/highlight'].note).toMatch(/highlightMode\.color not given/);
    expect(palette.gradients).toBeUndefined();
  });

  it('every stripe layout id is in the kind map (D10): no unknown-id warning', () => {
    expect(messages(res).filter((m) => /unknown layout id/.test(m))).toEqual([]);
    expect(res.questions).toEqual([]);
  });

  it('warns about an unknown layout id it reads (kept verbatim)', () => {
    const b = load('stripe');
    b.brandLayouts[0].id = 'mosaic';
    const r = rule(b);
    expect(messages(r).filter((m) => /unknown layout id/.test(m))).toEqual([
      expect.stringContaining('"mosaic"'),
    ]);
    expect(r.patch.palette.perKind.mosaic).toBeDefined();
  });
});

describe('MD-PALETTE on minimal and negatives', () => {
  it('derives tone (BR-TONE) and the dark role; empty rhythm warned', () => {
    const res = rule(load('minimal'));
    const ink = res.patch.palette.surfaces[1];
    expect(ink).toMatchObject({ tone: 'dark', role: 'dark' });
    expect(res.provenance['/palette/surfaces/1/tone'].note).toMatch(/BR-TONE/);
    expect(res.patch.palette.rhythm).toEqual([]);
    expect(messages(res)).toContain('backgrounds.rhythm not given: palette.rhythm is empty');
    expect(res.patch.palette.perKind).toBeUndefined();
    expect(res.patch.palette.chart).toBeUndefined();
  });

  it('unknown rhythm id -> warning and dropped', () => {
    const b = load('stripe');
    b.backgrounds.rhythm = ['page', 'mystery', 'navy'];
    const res = rule(b);
    expect(res.patch.palette.rhythm).toEqual(['page', 'navy']);
    expect(res.warnings).toContainEqual(
      expect.objectContaining({
        pointer: '/backgrounds/rhythm/1',
        message: expect.stringMatching(/"mystery".*dropped/),
      }),
    );
  });

  it('variant id in the rhythm maps to its surface', () => {
    const b = load('stripe');
    b.backgrounds.rhythm = ['heroRibbon', 'navy'];
    expect(rule(b).patch.palette.rhythm).toEqual(['page', 'navy']);
  });

  it('no default surface named -> surfaces[0] + warning', () => {
    const b = load('stripe');
    delete b.backgrounds.default;
    b.surfaces = [b.surfaces[2], b.surfaces[0]];
    const res = rule(b);
    expect(res.patch.palette.surfaces[0]).toMatchObject({ id: 'navy', role: 'default' });
    expect(res.patch.palette.surfaces[1]).toMatchObject({ id: 'page', role: 'alt' }); // light vs dark default: light -> alt
    expect(messages(res)).toContainEqual(expect.stringMatching(/surfaces\[0\] \("navy"\) is the default/));
  });

  it('surface without heading -> blocking question', () => {
    const b = load('minimal');
    delete b.surfaces[1].heading;
    const res = rule(b);
    expect(res.questions).toContainEqual(
      expect.objectContaining({
        pointer: '/surfaces/1/heading',
        neededBy: ['MD-PALETTE'],
        severity: 'blocking',
      }),
    );
  });

  it('low body contrast -> warning against accessibility.minContrastBody', () => {
    const b = load('stripe');
    b.surfaces[1].text = '#C0C0C0';
    const res = rule(b);
    expect(res.warnings).toContainEqual(
      expect.objectContaining({
        pointer: '/surfaces/1/text',
        message: expect.stringMatching(/minContrastBody/),
      }),
    );
  });

  it('gradients copied when policy is not none (D2 input enum); dropped when none', () => {
    const b = load('minimal');
    b.colors.gradients = {
      policy: 'backgrounds',
      definitions: { hero: { type: 'linear', angle: 90, stops: [{ color: '#0A7C59', at: 0 }] } },
    };
    expect(rule(b).patch.palette.gradients.hero.angle).toBe(90);
    b.colors.gradients.policy = 'none';
    expect(rule(b).patch.palette.gradients).toBeUndefined();
  });

  it('highlightMode.color wins when given as hex', () => {
    const b = load('stripe');
    b.charts.highlightMode = { color: '#F44BCC' };
    const res = rule(b);
    expect(res.patch.palette.chart.highlight).toBe('#F44BCC');
    expect(res.provenance['/palette/chart/highlight'].from).toEqual(['/charts/highlightMode/color']);
  });
});

describe('MD-PALETTE rhythm and backgrounds', () => {
  it('a rhythm entry "default" maps to backgrounds.default.surface; an unknown id is dropped + warned', () => {
    const b = load('stripe');
    b.backgrounds.rhythm = ['default', 'navy', 'nope'];
    const r = rule(b);
    expect(r.patch.palette.rhythm).toEqual(['page', 'navy']);
    expect(messages(r)).toContainEqual(expect.stringMatching(/rhythm entry "nope"/));
  });

  it('every non-solid variant type (linear-gradient, video, ...) attaches to its surface', () => {
    const b = load('stripe');
    b.backgrounds.variants.glow = { type: 'linear-gradient', surface: 'navy', overlay: 'accent' };
    b.backgrounds.variants.film = { type: 'video', surface: 'navy' };
    const navy = rule(b).patch.palette.surfaces[2];
    expect(Object.keys(navy.background).sort()).toEqual(['film', 'glow']);
  });
});

describe('G2: palette.brand', () => {
  it('the four brand colours by name, from colors.*', () => {
    const res = rule(load('stripe'));
    expect(res.patch.palette.brand).toEqual({
      primary: '#533AFD',
      secondary: '#0D1738',
      accent: '#533AFD',
      tertiary: '#F44BCC',
    });
    expect(res.provenance['/palette/brand/primary'].from).toEqual(['/colors/primary']);
  });

  it('negative: only hex colours are carried; none -> absent', () => {
    const b = load('stripe');
    b.colors.tertiary = 'pink';
    delete b.colors.secondary;
    expect(Object.keys(rule(b).patch.palette.brand).sort()).toEqual(['accent', 'primary']);
    for (const k of ['primary', 'secondary', 'accent', 'tertiary']) delete b.colors[k];
    expect(rule(b).patch.palette.brand).toBeUndefined();
  });
});
