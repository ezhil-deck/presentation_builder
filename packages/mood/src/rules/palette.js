// MD-PALETTE: brand colours (G2), surfaces (+ role, tone, contrast, background), rhythm (+ rhythmBackgrounds, G9),
// perKind (exact layout ids; the G1 `content` expansion only when the brand gives no rhythm, G7), semantic, chart,
// gradients.
import { contrast, contrastRatio, isHexColor, sameColor, toneOf } from '../color.js';
import {
  brandVocabulary,
  CONTENT_ID,
  kindsViaContent,
  toKind,
  unknownKindMessage,
  viaContentNote,
} from '../kindMap.js';
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-PALETTE';

/** D8: a surface whose bg is one of these brand colours is the accent surface (secondary no longer counts). */
const BRAND_COLOURS = ['primary', 'accent'];
/** G2: the brand colour names a token may use (palette.brand, from colors.*). */
export const BRAND_COLOR_NAMES = Object.freeze(['primary', 'secondary', 'accent', 'tertiary']);
/** Every background type other than solid (image, pattern, video, gradient, linear-/radial-/mesh-gradient). */
const isNonSolid = (type) => typeof type === 'string' && type !== 'solid';

/** The surface a background id (`default`, a variant id or a surface id) lands on. */
export function surfaceOfBackground(brandSpec, id) {
  const bgs = brandSpec.backgrounds ?? {};
  const surfaceIds = (brandSpec.surfaces ?? []).map((s) => s.id);
  if (id === 'default' && bgs.default?.surface)
    return { surface: bgs.default.surface, from: ptr('backgrounds', 'default', 'surface') };
  if (surfaceIds.includes(id)) return { surface: id, from: ptr('surfaces', surfaceIds.indexOf(id), 'id') };
  if (has(bgs.variants, id) && bgs.variants[id].surface) {
    return { surface: bgs.variants[id].surface, from: ptr('backgrounds', 'variants', id, 'surface') };
  }
  return null;
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const surfacesIn = brandSpec.surfaces ?? [];
  const colors = brandSpec.colors ?? {};
  const bgs = brandSpec.backgrounds ?? {};
  const ids = surfacesIn.map((s) => s.id);
  const palette = {};

  // --- default surface
  let defaultIdx = -1;
  const named = bgs.default?.surface;
  if (named !== undefined && ids.includes(named)) {
    defaultIdx = ids.indexOf(named);
  } else if (surfacesIn.length) {
    defaultIdx = 0;
    c.warn(
      ptr('backgrounds', 'default', 'surface'),
      named === undefined
        ? `backgrounds.default.surface not given: surfaces[0] ("${ids[0]}") is the default surface`
        : `backgrounds.default.surface "${named}" is not a surface id: surfaces[0] ("${ids[0]}") is the default surface`,
    );
  }

  // --- surfaces: copy every role, tone, contrast
  const minBody = brandSpec.accessibility?.minContrastBody;
  const surfaces = surfacesIn.map((s, i) => {
    const sp = ptr('surfaces', i);
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'logo') out.logoVariant = v;
      else if (k !== 'tone') out[k] = clone(v);
    }
    c.prov(ptr('palette', 'surfaces', i), [sp], 'surface colour roles copied as given (logo -> logoVariant)');
    for (const req of ['heading', 'accent']) {
      if (!has(s, req)) {
        c.ask(ptr('surfaces', i, req), `Which colour is "${req}" on surface "${s.id}"?`);
      }
    }
    if (s.tone === 'light' || s.tone === 'dark') {
      out.tone = s.tone;
      c.prov(ptr('palette', 'surfaces', i, 'tone'), [ptr('surfaces', i, 'tone')]);
    } else if (isHexColor(s.bg)) {
      out.tone = toneOf(s.bg);
      c.prov(
        ptr('palette', 'surfaces', i, 'tone'),
        [ptr('surfaces', i, 'bg')],
        `BR-TONE: WCAG luminance of bg ${s.bg}`,
      );
    }
    if (isHexColor(s.bg)) {
      const ct = {};
      for (const k of ['text', 'heading', 'accent']) if (isHexColor(s[k])) ct[k] = contrast(s[k], s.bg);
      out.contrast = ct;
      const from = ['text', 'heading', 'accent']
        .filter((k) => isHexColor(s[k]))
        .map((k) => ptr('surfaces', i, k));
      c.prov(
        ptr('palette', 'surfaces', i, 'contrast'),
        [ptr('surfaces', i, 'bg'), ...from],
        'WCAG contrast ratio vs bg',
      );
      const min = typeof minBody === 'number' ? minBody : 4.5;
      if (isHexColor(s.text) && contrastRatio(s.text, s.bg) < min) {
        c.warn(
          ptr('surfaces', i, 'text'),
          `text on surface "${s.id}" contrasts ${ct.text}:1, below ${min}:1 (${typeof minBody === 'number' ? 'accessibility.minContrastBody' : 'WCAG AA body'})`,
        );
      }
    }
    return out;
  });

  // --- roles
  if (defaultIdx >= 0) {
    const def = surfaces[defaultIdx];
    def.role = 'default';
    c.prov(
      ptr('palette', 'surfaces', defaultIdx, 'role'),
      [named === ids[defaultIdx] ? ptr('backgrounds', 'default', 'surface') : ptr('surfaces', 0)],
      named === ids[defaultIdx]
        ? `backgrounds.default.surface = "${named}"`
        : 'first surface (backgrounds.default.surface missing or unknown)',
    );
    surfaces.forEach((s, i) => {
      if (i === defaultIdx) return;
      const rp = ptr('palette', 'surfaces', i, 'role');
      const match = BRAND_COLOURS.find((k) => sameColor(s.bg, colors[k]));
      if (match) {
        s.role = 'accent';
        c.prov(rp, [ptr('surfaces', i, 'bg'), ptr('colors', match)], `bg ${s.bg} equals colors.${match}`);
      } else if (s.tone && def.tone && s.tone !== def.tone) {
        s.role = s.tone === 'dark' ? 'dark' : 'alt';
        c.prov(
          rp,
          [ptr('surfaces', i, 'bg'), ptr('surfaces', defaultIdx, 'bg')],
          `tone ${s.tone} opposite to the default surface's ${def.tone}`,
        );
      } else {
        s.role = 'alt';
        c.prov(
          rp,
          [ptr('surfaces', i, 'bg'), ptr('surfaces', defaultIdx, 'bg')],
          `same tone (${s.tone}) as the default surface`,
        );
      }
    });
  }

  // --- non-solid backgrounds attached to the surface they name
  if (isObj(bgs.default) && isNonSolid(bgs.default.type)) {
    c.warn(
      ptr('backgrounds', 'default', 'type'),
      `backgrounds.default is "${bgs.default.type}": only variants are attached to surfaces`,
    );
  }
  for (const [vid, v] of Object.entries(bgs.variants ?? {})) {
    if (!isNonSolid(v?.type)) continue;
    const idx = ids.indexOf(v.surface);
    if (idx < 0) {
      c.warn(
        ptr('backgrounds', 'variants', vid, 'surface'),
        `background variant "${vid}" names no known surface ("${v.surface}"): not attached`,
      );
      continue;
    }
    surfaces[idx].background = { ...(surfaces[idx].background ?? {}), [vid]: clone(v) };
    c.prov(
      ptr('palette', 'surfaces', idx, 'background', vid),
      [ptr('backgrounds', 'variants', vid)],
      `variant.surface = "${v.surface}"`,
    );
  }
  palette.surfaces = surfaces;

  // --- rhythm
  const rhythm = [];
  const rhythmFrom = [];
  // G9: a rhythm step that names a background variant carries that variant onto its slide (step -> variant id)
  const rhythmBackgrounds = {};
  (bgs.rhythm ?? []).forEach((id, j) => {
    const at = ptr('backgrounds', 'rhythm', j);
    const hit = surfaceOfBackground(brandSpec, id);
    if (hit && ids.includes(hit.surface)) {
      // a surface id, a variant id (-> its surface) or "default" (-> backgrounds.default.surface)
      rhythm.push(hit.surface);
      rhythmFrom.push(at);
      if (hit.surface !== id) rhythmFrom.push(hit.from);
      if (id !== 'default' && !ids.includes(id) && has(bgs.variants, id)) {
        const step = rhythm.length - 1;
        rhythmBackgrounds[step] = id;
        c.prov(
          ptr('palette', 'rhythmBackgrounds', step),
          [at, ptr('backgrounds', 'variants', id)],
          `rhythm step ${step} names background variant "${id}" (G9)`,
        );
      }
    } else {
      c.warn(
        at,
        `rhythm entry "${id}" is neither a surface id, a variant with a known surface nor "default": dropped`,
      );
    }
  });
  if (!has(bgs, 'rhythm'))
    c.warn(ptr('backgrounds', 'rhythm'), 'backgrounds.rhythm not given: palette.rhythm is empty');
  palette.rhythm = rhythm;
  if (Object.keys(rhythmBackgrounds).length) palette.rhythmBackgrounds = rhythmBackgrounds;
  c.prov(
    ptr('palette', 'rhythm'),
    rhythmFrom.length ? rhythmFrom : [ptr('backgrounds', 'rhythm')],
    'variant ids mapped to their surface; "default" to backgrounds.default.surface',
  );

  // --- perKind from brandLayouts via the kind map
  const perKind = {};
  let contentEntry = null;
  (brandSpec.brandLayouts ?? []).forEach((l, i) => {
    const { kind, known } = toKind(l.id);
    if (!known) c.warn(ptr('brandLayouts', i, 'id'), unknownKindMessage(l.id));
    let surface = null;
    let from = [];
    if (l.surface !== undefined) {
      surface = l.surface;
      from = [ptr('brandLayouts', i, 'surface')];
    } else if (l.background !== undefined) {
      const hit = surfaceOfBackground(brandSpec, l.background);
      if (hit) {
        surface = hit.surface;
        from = [ptr('brandLayouts', i, 'background'), hit.from];
      }
    }
    if (surface === null) return;
    if (!ids.includes(surface)) {
      c.warn(from[0], `layout "${l.id}" names surface "${surface}", which is not a surface id: not used`);
      return;
    }
    if (has(perKind, kind)) {
      c.warn(
        ptr('brandLayouts', i, 'id'),
        `layout "${l.id}" maps to kind "${kind}" already set by an earlier layout: first kept`,
      );
      return;
    }
    perKind[kind] = surface;
    if (l.id === CONTENT_ID) contentEntry = { surface, from: [ptr('brandLayouts', i, 'id'), ...from] };
    c.prov(
      ptr('palette', 'perKind', kind),
      [ptr('brandLayouts', i, 'id'), ...from],
      `layout "${l.id}" -> kind "${kind}"`,
    );
  });
  // G7: rhythm wins for content surfaces. A kind the brand names no layout for cycles palette.rhythm (no perKind entry);
  // only when the brand gives no rhythm does it take the `content` layout's surface (the G1 expansion).
  if (contentEntry && !rhythm.length) {
    for (const kind of kindsViaContent(brandVocabulary(brandSpec))) {
      if (has(perKind, kind)) continue;
      perKind[kind] = contentEntry.surface;
      c.prov(
        ptr('palette', 'perKind', kind),
        [...contentEntry.from, ptr('backgrounds', 'rhythm')],
        `${viaContentNote(kind)}; the brand gives no rhythm (G7)`,
      );
    }
  }
  if (Object.keys(perKind).length) palette.perKind = perKind;

  // --- G2: the brand colours by name (tokens may say primary | secondary | accent | tertiary)
  const brand = {};
  for (const k of BRAND_COLOR_NAMES) {
    if (!isHexColor(colors[k])) continue;
    brand[k] = colors[k];
    c.prov(ptr('palette', 'brand', k), [ptr('colors', k)]);
  }
  if (Object.keys(brand).length) palette.brand = brand;

  // --- semantic, chart, gradients
  if (isObj(colors.semantic) && Object.keys(colors.semantic).length) {
    palette.semantic = clone(colors.semantic);
    c.prov(ptr('palette', 'semantic'), [ptr('colors', 'semantic')]);
  }
  const chart = {};
  if (Array.isArray(colors.chart)) {
    chart.categorical = clone(colors.chart);
    c.prov(ptr('palette', 'chart', 'categorical'), [ptr('colors', 'chart')]);
  }
  if (Array.isArray(colors.chartSequential)) {
    chart.sequential = clone(colors.chartSequential);
    c.prov(ptr('palette', 'chart', 'sequential'), [ptr('colors', 'chartSequential')]);
  }
  if (isHexColor(colors.chartMuted)) {
    chart.muted = colors.chartMuted;
    c.prov(ptr('palette', 'chart', 'muted'), [ptr('colors', 'chartMuted')]);
  }
  const hlColor = brandSpec.charts?.highlightMode?.color;
  if (isHexColor(hlColor)) {
    chart.highlight = hlColor;
    c.prov(ptr('palette', 'chart', 'highlight'), [ptr('charts', 'highlightMode', 'color')]);
  } else if (isHexColor(colors.accent)) {
    chart.highlight = colors.accent;
    c.prov(
      ptr('palette', 'chart', 'highlight'),
      [ptr('colors', 'accent')],
      'charts.highlightMode.color not given: colors.accent',
    );
  }
  if (Object.keys(chart).length) palette.chart = chart;

  const grad = colors.gradients;
  if (
    isObj(grad) &&
    grad.policy !== 'none' &&
    isObj(grad.definitions) &&
    Object.keys(grad.definitions).length
  ) {
    palette.gradients = clone(grad.definitions);
    c.prov(
      ptr('palette', 'gradients'),
      [ptr('colors', 'gradients', 'definitions'), ptr('colors', 'gradients', 'policy')],
      `policy ${grad.policy ?? '(not given)'} != none`,
    );
  }

  c.res.patch = { palette };
  return c.res;
}
