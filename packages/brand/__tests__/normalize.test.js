import { normalize, slideSize } from '../src/normalize.js';
import { readMiniInput } from './helpers.js';

describe('BR-NORMALIZE field map (mini fixture)', () => {
  const input = readMiniInput();
  const { spec, provenance, warnings } = normalize(input);

  it('id, name, tagline', () => {
    expect(spec.schema).toBe('brand-spec/1');
    expect(spec.id).toBe('mini');
    expect(spec.name).toBe('Mini');
    expect(spec.tagline).toBe('Small but complete');
    expect(provenance['/name']).toEqual({ source: 'given', from: '/brand/name' });
  });

  it('logos: variants <- brand.logos, usage rules <- brand.logoRules', () => {
    expect(spec.logos.variants).toEqual({
      full: { file: 'assets/logo.svg' },
      monoLight: { file: 'assets/logo-white.png' },
    });
    expect(spec.logos).toMatchObject({
      height: 32,
      clearSpace: 16,
      position: 'bottom-left',
      onSurface: { page: 'full', ink: 'monoLight' },
    });
    expect(spec.logos.bleed).toBeUndefined(); // not in the field map
    expect(provenance['/logos/variants/full/file']).toEqual({ source: 'given', from: '/brand/logos/full' });
  });

  it('colors: as given, named <- colors.custom', () => {
    expect(spec.colors).toEqual({
      primary: '#1A1A2E',
      accent: '#E94560',
      secondary: '#0F3460',
      neutrals: ['#FFFFFF', '#D0D0D8', '#1A1A2E'],
      chart: ['#E94560', '#0F3460', '#16213E'],
      named: { glow: '#FFB4C2' },
    });
    expect(provenance['/colors/named/glow']).toEqual({ source: 'given', from: '/colors/custom/glow' });
    expect(provenance['/colors/neutrals/1']).toEqual({ source: 'given', from: '/colors/neutrals/1' });
  });

  it('colors.gradients <- gradients', () => {
    const r = normalize({ ...input, gradients: { policy: 'none', definitions: {} } });
    expect(r.spec.colors.gradients).toEqual({ policy: 'none', definitions: {} });
    expect(r.provenance['/colors/gradients/definitions']).toEqual({
      source: 'given',
      from: '/gradients/definitions',
    });
  });

  it('surfaces: every key kept, tone derived by BR-TONE', () => {
    expect(spec.surfaces[0]).toEqual({
      id: 'page',
      role: 'page',
      bg: '#FFFFFF',
      text: '#1A1A2E',
      heading: '#1A1A2E',
      accent: '#E94560',
      tone: 'light',
    });
    expect(spec.surfaces[1].tone).toBe('dark');
    expect(provenance['/surfaces/1/tone']).toEqual({
      source: 'derived',
      from: 'BR-TONE',
      signal: '/surfaces/1/text + /surfaces/1/bg',
    });
  });

  describe('BR-TONE v2 (E1) through normalize', () => {
    const withSurfaces = (surfaces) => normalize({ ...input, surfaces });

    it('bosch blue with white text -> dark, signal names text + bg', () => {
      const r = withSurfaces([{ id: 'blue', bg: '#007BC0', text: '#FFFFFF' }]);
      expect(r.spec.surfaces[0].tone).toBe('dark');
      expect(r.provenance['/surfaces/0/tone']).toEqual({
        source: 'derived',
        from: 'BR-TONE',
        signal: '/surfaces/0/text + /surfaces/0/bg',
      });
    });

    it('same bg without text -> light (v1 contrast path), signal names bg only', () => {
      const r = withSurfaces([{ id: 'blue', bg: '#007BC0' }]);
      expect(r.spec.surfaces[0].tone).toBe('light');
      expect(r.provenance['/surfaces/0/tone']).toEqual({
        source: 'derived',
        from: 'BR-TONE',
        signal: '/surfaces/0/bg',
      });
    });

    it('a given tone still wins', () => {
      const r = withSurfaces([{ id: 'blue', bg: '#007BC0', text: '#FFFFFF', tone: 'light' }]);
      expect(r.spec.surfaces[0].tone).toBe('light');
      expect(r.provenance['/surfaces/0/tone']).toEqual({ source: 'given', from: '/surfaces/0/tone' });
    });

    it('a light bg with dark text -> light', () => {
      const r = withSurfaces([{ id: 'paper', bg: '#F7F2F2', text: '#1A1A2E' }]);
      expect(r.spec.surfaces[0].tone).toBe('light');
      expect(r.provenance['/surfaces/0/tone'].signal).toBe('/surfaces/0/text + /surfaces/0/bg');
    });
  });

  it('backgrounds: default + variants as given, rhythm <- rhythm.sequence', () => {
    expect(spec.backgrounds).toEqual({
      default: { type: 'solid', surface: 'page' },
      variants: { ink: { type: 'solid', surface: 'ink' } },
      rhythm: ['page', 'ink'],
    });
    expect(provenance['/backgrounds/rhythm/1']).toEqual({
      source: 'given',
      from: '/backgrounds/rhythm/sequence/1',
    });
  });

  it('typography: faces (files come from BR-FONTFILES later), roles with face <- font', () => {
    expect(spec.typography.faces.heading).toEqual({
      family: 'Tiny',
      weights: [400],
      fallback: 'Arial, sans-serif',
    });
    expect(spec.typography.faces.body).toEqual({ family: 'Tiny' });
    expect(spec.typography.roles.h1).toEqual({
      face: 'heading',
      size: 64,
      weight: 400,
      lineHeight: 1.1,
      letterSpacing: -0.01,
    });
    // D4: a style's colour (a surface role name) is copied
    expect(spec.typography.roles.body).toEqual({ face: 'body', size: 28, lineHeight: 1.4, color: 'text' });
    expect(provenance['/typography/roles/body/color']).toEqual({
      source: 'given',
      from: '/typography/styles/body/color',
    });
    expect(spec.typography.slideScale).toBe(1);
    expect(spec.typography.alignment).toEqual({ title: 'left', body: 'left' });
    expect(spec.typography.bullets).toEqual({ char: '•', indent: 24 });
    expect(spec.typography.limits).toEqual({ maxWordsPerSlide: 60, minBodySize: 22 });
    expect(provenance['/typography/roles/h1/face']).toEqual({
      source: 'given',
      from: '/typography/styles/h1/font',
      inputProvenance: { source: 'fixture type page', inferred: false },
    });
  });

  it('layout: canvas <- width/height, other keys as given', () => {
    expect(spec.layout.canvas).toEqual({ width: 1920, height: 1080 });
    expect(spec.layout.margins).toEqual({ top: 80, right: 120, bottom: 80, left: 120 });
    expect(spec.layout.footer.hideOn).toEqual(['title']);
    expect(spec.layout.aspect).toBeUndefined();
    expect(spec.layout.width).toBeUndefined();
    expect(provenance['/layout/canvas/height']).toEqual({ source: 'given', from: '/layout/height' });
  });

  it('components, decor, brandLayouts and the whole blocks', () => {
    expect(spec.components).toEqual({
      chip: { radius: 999, fill: 'accent', text: '#FFFFFF' },
      icons: { set: 'custom', customPath: 'assets/icons/', style: 'line', color: 'accent', size: 24 },
    });
    expect(spec.decor.elements[0]).toMatchObject({
      id: 'corner',
      type: 'shape',
      file: 'assets/decor/corner.svg',
    });
    expect(spec.decor.maxElementsPerSlide).toBe(1);
    expect(provenance['/decor/elements/0/box/x']).toEqual({
      source: 'given',
      from: '/assets/elements/0/box/x',
    });
    expect(spec.brandLayouts).toEqual([
      { id: 'title', surface: 'ink', logo: 'large', titleStyle: 'display', footer: false },
    ]);
    expect(spec.composition).toEqual({ density: 'balanced', titleEverySlide: true });
    expect(spec.motion).toEqual({ transition: 'fade', duration: 300 });
    expect(spec.voice).toEqual({ tone: ['plain'], language: 'en' });
    expect(spec.rules[0].id).toBe('no-gradients');
    expect(spec.accessibility).toEqual({ minContrastBody: 4.5 });
    expect(spec.locale).toEqual({ rtl: false });
  });

  it('cards, icons, imagery, masks map into components / imagery', () => {
    const r = normalize({
      ...input,
      cards: { style: { kind: 'filled' } },
      icons: { set: 'lucide', size: 24 },
      imagery: { maxPerSlide: 2, provenance: { source: 'p' } },
      masks: { default: 'card' },
    });
    expect(r.spec.components.cards).toEqual({ style: { kind: 'filled' } });
    expect(r.spec.components.icons).toEqual({ set: 'lucide', size: 24 });
    expect(r.spec.imagery).toEqual({ maxPerSlide: 2, masks: { default: 'card' } });
    expect(r.provenance['/imagery/maxPerSlide']).toEqual({
      source: 'given',
      from: '/imagery/maxPerSlide',
      inputProvenance: { source: 'p' },
    });
    expect(r.provenance['/imagery/masks/default']).toEqual({ source: 'given', from: '/masks/default' });
  });

  it('input provenance blocks are lifted into the sidecar and stripped from the data', () => {
    expect(JSON.stringify(spec)).not.toMatch(/"provenance"/);
    expect(spec.backgrounds.default.provenance).toBeUndefined();
    expect(provenance['/backgrounds/default/surface'].inputProvenance).toEqual({
      source: 'fixture cover page',
      inferred: false,
    });
    expect(provenance['/logos/height'].inputProvenance).toEqual({
      source: 'fixture logo page',
      inferred: false,
    });
    // only the holding object's block counts: the surfaces have none
    expect(provenance['/surfaces/0/bg'].inputProvenance).toBeUndefined();
  });

  it('every copied leaf has a provenance entry', () => {
    const leaves = [];
    const walk = (v, p) => {
      if (Array.isArray(v)) return v.length ? v.forEach((x, i) => walk(x, `${p}/${i}`)) : leaves.push(p);
      if (v && typeof v === 'object') {
        const keys = Object.keys(v);
        return keys.length ? keys.forEach((k) => walk(v[k], `${p}/${k}`)) : leaves.push(p);
      }
      return leaves.push(p);
    };
    walk(spec, '');
    const missing = leaves.filter((p) => p !== '/schema' && !provenance[p]);
    expect(missing).toEqual([]);
  });

  it('unknown input keys are listed once each (per pattern)', () => {
    expect(warnings.map((w) => w.pointer)).toEqual([
      '/backgrounds/rhythm/darkEvery',
      '/brand/logoRules/bleed',
      '/layout/aspect',
      '/meta',
      '/typography/fonts/*/liveFamily',
    ]);
    const styles = input.typography.styles;
    const twice = normalize({
      ...input,
      typography: {
        ...input.typography,
        styles: { ...styles, h2: { ...styles.h2, maxLines: 2 }, h3: { ...styles.h3, maxLines: 3 } },
      },
    });
    const maxLines = twice.warnings.filter((w) => w.pointer === '/typography/styles/*/maxLines');
    expect(maxLines).toHaveLength(1);
    expect(maxLines[0].message).toMatch(/2 occurrence\(s\)/);
  });

  it('values set by answers.json get provenance `answered`', () => {
    const answered = normalize(input, { answers: ['/layout/margins'] });
    expect(answered.provenance['/layout/margins/top']).toEqual({
      source: 'answered',
      from: '/layout/margins',
    });
    expect(answered.provenance['/layout/grid/columns'].source).toBe('given');
  });

  it('adds nothing the input does not give', () => {
    const bare = normalize({
      id: 'bare',
      version: '1.4.0',
      brand: { name: 'Bare', logos: {} },
      colors: { primary: '#000000', accent: '#FF0000' },
      surfaces: [{ id: 's', bg: '#FFFFFF', text: '#000000' }],
      typography: { fonts: {}, styles: {} },
      layout: { aspect: '16:9' },
    });
    expect(Object.keys(bare.spec).sort()).toEqual([
      'colors',
      'id',
      'layout',
      'logos',
      'name',
      'schema',
      'surfaces',
      'typography',
    ]);
    expect(bare.spec.layout).toEqual({});
    expect(bare.spec.logos).toEqual({ variants: {} });
  });
});

describe('BR-NORMALIZE D3: role sizes in canvas px', () => {
  const base = readMiniInput();
  const withUnits = (sizeUnits, slideScale) => {
    const input = JSON.parse(JSON.stringify(base));
    if (sizeUnits === undefined) delete input.typography.sizeUnits;
    else input.typography.sizeUnits = sizeUnits;
    if (slideScale === undefined) delete input.typography.slideScale;
    else input.typography.slideScale = slideScale;
    return normalize(input);
  };
  const sizes = (spec) =>
    Object.fromEntries(Object.entries(spec.typography.roles).map(([k, r]) => [k, r.size]));

  it('slide: sizes as given, provenance given, no warning', () => {
    const { spec, provenance, warnings } = withUnits('slide', 1.5);
    expect(sizes(spec)).toEqual({ display: 96, h1: 64, h2: 48, h3: 36, body: 28, caption: 20 });
    expect(spec.typography.limits.minBodySize).toBe(22);
    expect(provenance['/typography/roles/body/size']).toEqual({
      source: 'given',
      from: '/typography/styles/body/size',
    });
    expect(warnings.filter((w) => w.pointer === '/typography/sizeUnits')).toEqual([]);
  });

  it('site: every size x slideScale (0.01 px), minBodySize too, provenance derived, one padding warning', () => {
    const { spec, provenance, warnings } = withUnits('site', 1.53);
    expect(sizes(spec)).toEqual({
      display: 146.88,
      h1: 97.92,
      h2: 73.44,
      h3: 55.08,
      body: 42.84,
      caption: 30.6,
    });
    expect(spec.typography.limits.minBodySize).toBe(33.66);
    expect(spec.typography.sizeUnits).toBe('site');
    expect(provenance['/typography/roles/body/size']).toMatchObject({
      source: 'derived',
      from: 'BR-NORMALIZE',
      signal: expect.stringMatching(
        /sizeUnits = site .*slideScale = 1.53.*given 28 at \/typography\/styles\/body\/size/,
      ),
    });
    const w = warnings.filter((x) => x.pointer === '/typography/sizeUnits');
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/paddings .* kept as given/);
  });

  it('legacy (no sizeUnits): sizes <= 40 scaled, larger as given', () => {
    const { spec } = withUnits(undefined, 1.4);
    expect(sizes(spec)).toEqual({ display: 96, h1: 64, h2: 48, h3: 50.4, body: 39.2, caption: 28 });
    expect(spec.typography.limits.minBodySize).toBe(30.8);
  });

  it('no slideScale: sizes stay as given (BR-QUESTIONS asks for it)', () => {
    const { spec } = withUnits('site', undefined);
    expect(sizes(spec).body).toBe(28);
  });

  it('slideSize() is the rule for one size', () => {
    expect(slideSize(16, 'site', 1.53)).toEqual({ size: 24.48, scaled: true, needs: true });
    expect(slideSize(16, 'slide', 1.53)).toEqual({ size: 16, scaled: false });
    expect(slideSize(41, undefined, 1.53)).toEqual({ size: 41, scaled: false, needs: false });
    expect(slideSize(40, undefined, 1.53)).toEqual({ size: 61.2, scaled: true, needs: true });
    expect(slideSize(16, 'site', undefined)).toEqual({ size: 16, scaled: false, needs: true });
  });
});

describe('BR-NORMALIZE D2: typography.scriptFallbacks at typography level', () => {
  it('is copied to typography.scriptFallbacks, never onto a face', () => {
    const input = readMiniInput();
    input.typography.scriptFallbacks = { cjk: 'Noto Sans CJK' };
    const { spec, provenance, warnings } = normalize(input);
    expect(spec.typography.scriptFallbacks).toEqual({ cjk: 'Noto Sans CJK' });
    expect(spec.typography.faces.heading.scriptFallbacks).toBeUndefined();
    expect(provenance['/typography/scriptFallbacks/cjk'].from).toBe('/typography/scriptFallbacks/cjk');
    expect(warnings.map((w) => w.pointer)).not.toContain('/typography/scriptFallbacks');
  });
});
