/**
 * BR-CAPABILITIES (docs/P1-rules.md §A, docs/PLAN-template-library.md §3): what the brand can supply, derived from the
 * BrandSpec alone (and the files it names), in the element vocabulary (@pb/vocabulary). One function per family, each
 * with its stated rule; nothing is defaulted: a capability the JSON cannot give is absent (no entry, never a question).
 *
 * Entry: `{ key, term (a vocabulary term, 'unknown', or null when the capability is not an element), from: [BrandSpec pointers], files: [brand-relative paths], given: {as given}, measured:
 * {numbers}, status: 'given' | 'offered', why }`. `status: 'offered'` when an input provenance under any `from`
 * pointer carries `inferred: true` without the owner's `verifiedAt` (D13: an inferred value needs verification).
 *
 * Key grammar (shared with the template records' needs, V1): device:<id>, photo-area, overlay:<id>, text-zone,
 * image:<kind>, cutout, colour-field:<surface id>, logo:<variant>, mask:<id>, component:<term>, angle,
 * second-face, weight-contrast, type-ladder; plus composition and motion (as given).
 */
import { termEntry, termFor } from '@pb/vocabulary';
import { escapeToken as esc, isUnder } from './pointer.js';
import { contrastRatio, relativeLuminance } from './tone.js';
import { boxPct, H, isSvg, round, W } from './measure.js';
import { geometry, polygonArea } from './svggeom.js';

/** The capability families in order (the Studio groups rows by these). */
export const FAMILIES = [
  'devices',
  'photo-areas',
  'imagery',
  'colour-fields',
  'type',
  'logos',
  'components',
  'shape',
  'composition',
];

/** Imagery sample kinds that are imagery capabilities (logo / icon / unknown samples are not). */
export const IMAGE_KINDS = ['photo-people', 'photo-product', 'product-ui', 'illustration', 'abstract'];
/** Tags the input reserves for a cut-out subject (imagery.samples[].tags). */
export const CUTOUT_TAGS = ['cutout', 'transparent'];
/** An edge shorter than this (canvas px, 1 % of the width) does not count towards the shape language. */
export const MIN_ANGLE_EDGE = W / 100;
/** A face offers weight contrast when two of its weights are at least this far apart (variable ranges count). */
export const WEIGHT_CONTRAST = 300;
/** Polygons are kept in the record up to this many vertices per element (beyond: bbox, share and angles only). */
export const MAX_POLYGON_VERTICES = 400;
/** The type ladder's chain of roles, largest first. */
export const LADDER = ['display', 'h1', 'h2', 'h3', 'body', 'bodySmall', 'caption'];

/**
 * A capability that is not an element (the type ladder, composition, motion, the shape language's angles) has
 * `term: null` and says so in `why`; `unknown` is kept for the vocabulary's own gaps (an element no term names).
 */
export const NOT_ELEMENT = 'not an element: a brand rule';

const named = (nsTerm) => (termEntry(nsTerm) ? nsTerm : 'unknown');

/** `E2:decor` for a schema / brand name through the vocabulary's maps, else 'unknown'. */
export function termOf(source, name) {
  if (name === undefined || name === null) return 'unknown';
  let hit = termFor('*', source, String(name));
  if (Array.isArray(hit)) hit = hit[0];
  return hit && hit.namespace && hit.term ? `${hit.namespace}:${hit.term}` : 'unknown';
}

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Is the provenance under any `from` pointer inferred and unverified? */
export function isOffered(provenance, from) {
  for (const [key, p] of Object.entries(provenance ?? {})) {
    const ip = p?.inputProvenance;
    if (!ip || ip.inferred !== true || ip.verifiedAt) continue;
    if (from.some((f) => isUnder(key, f))) return true;
  }
  return false;
}

/** Every BrandSpec pointer whose input provenance says `inferred: true` with no `verifiedAt`, sorted. */
export function unverifiedFields(spec) {
  return Object.entries(spec?.provenance ?? {})
    .filter(([, p]) => p?.inputProvenance?.inferred === true && !p.inputProvenance.verifiedAt)
    .map(([k]) => k)
    .sort();
}

// ---------- devices ----------

/** The painted geometry of a decor element's SVG mapped into its box (or its own viewBox when it has none). */
export function decorGeometry(ctx, el) {
  if (!el.file || !isSvg(el.file)) return null;
  const key = `decor|${el.file}|${JSON.stringify(el.box ?? null)}`;
  if (ctx.cache?.has(key)) return ctx.cache.get(key);
  const doc = ctx.svg(el.file);
  let out;
  if (!doc || !doc.viewBox) out = { error: 'SVG without a viewBox or size' };
  else {
    const box = el.box ? { x: el.box.x, y: el.box.y, w: el.box.w, h: el.box.h } : null;
    // edges under 1 % of the frame width (the canvas through the box, else the SVG viewport) are not shape language
    const g = geometry(doc, box, { minAngleEdge: box ? MIN_ANGLE_EDGE : doc.viewBox.w / 100 });
    out = { doc, box, ...g };
  }
  ctx.cache?.set(key, out);
  return out;
}

function geometryRecord(g) {
  const frame = g.box ? { w: W, h: H, x: 0, y: 0 } : { ...g.viewBox };
  const px = ([x, y]) => [round(((x - frame.x) / frame.w) * 100), round(((y - frame.y) / frame.h) * 100)];
  const vertices = g.shapes.reduce((n, s) => n + s.subpaths.reduce((m, sp) => m + sp.points.length, 0), 0);
  const out = {
    frame: g.box ? 'canvas' : 'element',
    shapes: g.shapes.length,
    areaShare: round(g.areaShare, 4),
    angles: g.angles,
    approx: Boolean(g.approx),
  };
  if (g.bbox) {
    const [x0, y0] = px([g.bbox.x, g.bbox.y]);
    const [x1, y1] = px([g.bbox.x + g.bbox.w, g.bbox.y + g.bbox.h]);
    out.bbox = { x: x0, y: y0, w: round(x1 - x0), h: round(y1 - y0) };
  }
  if (g.box) out.canvasShare = round((g.areaShare * g.box.w * g.box.h) / (W * H), 4);
  if (vertices <= MAX_POLYGON_VERTICES)
    out.polygons = g.shapes.flatMap((s) =>
      s.subpaths.filter((sp) => sp.closed || s.fill).map((sp) => sp.points.slice(0, -1).map(px)),
    );
  else out.vertices = vertices;
  if (g.notes?.length) out.notes = g.notes;
  return out;
}

const DRAW_SKIP = new Set([
  'id',
  'type',
  'file',
  'layer',
  'colorable',
  'box',
  'opacity',
  'placement',
  'allowedOn',
  'surfaces',
  'frequency',
  'animated',
  'video',
  'previewSurface',
]);

/**
 * devices: every decor element is `device:<id>`. Term: E2:device when the brand names it as a composition's device
 * (brandLayouts[].composition.device) or gives it `frequency: always` on at least one layout (`allowedOn`) - the
 * vocabulary's device rule; otherwise its decor type through the `brand.decor.type` map (no type: unknown).
 */
export function devices(spec, ctx) {
  const out = [];
  const layouts = spec.brandLayouts ?? [];
  (spec.decor?.elements ?? []).forEach((el, i) => {
    const ptr = `/decor/elements/${i}`;
    const namedBy = [];
    layouts.forEach((l, li) => {
      if (l.composition?.device === el.id)
        namedBy.push({ layout: l.id, pointer: `/brandLayouts/${li}/composition/device` });
    });
    const always = el.frequency === 'always' && (el.allowedOn ?? []).length > 0;
    const typeTerm = termOf('brand.decor.type', el.type);
    const term = namedBy.length || always ? named('E2:device') : typeTerm;
    const draw = {};
    for (const [k, v] of Object.entries(el)) if (!DRAW_SKIP.has(k)) draw[k] = v;
    const given = defined({
      type: el.type,
      typeTerm,
      layer: el.layer,
      layerTerm: el.layer ? termOf('brand.decor.layer', el.layer) : undefined,
      frequency: el.frequency,
      allowedOn: el.allowedOn,
      surfaces: el.surfaces,
      placement: el.placement,
      colorable: el.colorable,
      namedBy: namedBy.length ? namedBy.map((n) => n.layout) : undefined,
      draw: !el.file && Object.keys(draw).length ? draw : undefined,
    });
    const measured = defined({
      box: el.box ? boxPct(el.box) : undefined,
      opacity: el.opacity,
      width: el.width,
      height: el.height,
    });
    let why;
    try {
      const g = decorGeometry(ctx, el);
      if (g?.error) why = g.error;
      else if (g) measured.geometry = geometryRecord(g);
    } catch (err) {
      why = `the SVG could not be measured: ${err.message}`;
    }
    const reason = namedBy.length
      ? `named as the device of layout ${namedBy.map((n) => n.layout).join(', ')} (composition.device)`
      : always
        ? `frequency always on ${el.allowedOn.join(', ')}`
        : `decor type ${el.type ?? '(none)'}`;
    out.push({
      key: `device:${el.id}`,
      term,
      from: [ptr, ...namedBy.map((n) => n.pointer)],
      files: [el.file, el.animated, el.video].filter(Boolean),
      given,
      measured,
      why: `decor element ${el.id}: ${reason}${why ? `; ${why}` : ''}`,
    });
  });
  return out;
}

// ---------- photo areas, overlays, text zones (layouts with a composition) ----------

function mergeLayout(map, entry, layoutFacts) {
  const prev = map.get(entry.key);
  if (!prev) {
    map.set(entry.key, { ...entry, given: { ...entry.given, layouts: [layoutFacts] } });
    return;
  }
  for (const f of entry.from) if (!prev.from.includes(f)) prev.from.push(f);
  for (const f of entry.files) if (!prev.files.includes(f)) prev.files.push(f);
  prev.given.layouts.push(layoutFacts);
}

/**
 * photo areas: per brandLayouts[] entry carrying `composition`: `photo-area` (the polygon in % of the canvas, its
 * area share), `overlay:<id>` per composition.overlays id (term E4:blend when that element blends, else its decor
 * type), `text-zone` from the layout's titleAlign / textPosition / textAnchor / textMaxWidth. The composition's logo
 * box is recorded on `logo:<variant>` (logos()). Several layouts with a composition share one entry per key.
 */
export function compositions(spec) {
  const map = new Map();
  const elements = spec.decor?.elements ?? [];
  (spec.brandLayouts ?? []).forEach((l, li) => {
    const c = l.composition;
    if (!c || typeof c !== 'object') return;
    const base = `/brandLayouts/${li}`;
    if (Array.isArray(c.photoArea) && c.photoArea.length >= 3) {
      const poly = c.photoArea.map(([x, y]) => [round((x / W) * 100), round((y / H) * 100)]);
      const share = polygonArea(c.photoArea) / (W * H);
      mergeLayout(
        map,
        {
          key: 'photo-area',
          term: named('E3:zone'),
          from: [`${base}/composition/photoArea`],
          files: [],
          given: {},
          measured: {},
          why: 'brandLayouts[].composition.photoArea: where the photo shows, under the device',
        },
        { id: l.id, polygon: poly, areaShare: round(share, 4), ...(c.device ? { device: c.device } : {}) },
      );
    }
    (c.overlays ?? []).forEach((id, k) => {
      const ei = elements.findIndex((e) => e.id === id);
      const el = elements[ei];
      const term =
        el?.blend && el.blend !== 'normal' ? named('E4:blend') : termOf('brand.decor.type', el?.type);
      mergeLayout(
        map,
        {
          key: `overlay:${id}`,
          term,
          from: [`${base}/composition/overlays/${k}`, ...(ei >= 0 ? [`/decor/elements/${ei}`] : [])],
          files: el?.file ? [el.file] : [],
          given: defined({ blend: el?.blend, element: el ? undefined : 'not in decor.elements' }),
          measured: defined({ box: el?.box ? boxPct(el.box) : undefined, opacity: el?.opacity }),
          why: `brandLayouts[].composition.overlays: ${id} is drawn over the photo only`,
        },
        { id: l.id },
      );
    });
    const zoneKeys = ['titleAlign', 'textPosition', 'textAnchor', 'textMaxWidth'].filter(
      (k) => l[k] !== undefined,
    );
    if (zoneKeys.length) {
      mergeLayout(
        map,
        {
          key: 'text-zone',
          term: named('E3:zone'),
          from: zoneKeys.map((k) => `${base}/${k}`),
          files: [],
          given: {},
          measured: {},
          why: 'the text zone of a layout with a composition (titleAlign / textPosition / textAnchor / textMaxWidth)',
        },
        defined({
          id: l.id,
          titleAlign: l.titleAlign,
          textPosition: l.textPosition,
          textAnchor: l.textAnchor,
          maxWidthPct: typeof l.textMaxWidth === 'number' ? round(l.textMaxWidth * 100) : undefined,
        }),
      );
    }
  });
  for (const e of map.values()) e.measured.layouts = e.given.layouts.length;
  return [...map.values()];
}

// ---------- imagery ----------

/**
 * imagery: `image:<kind>` per distinct imagery.samples[].kind among photo-people | photo-product | product-ui |
 * illustration | abstract (count, distinct aspects from the files' sizes, tags; the brand's treatment options,
 * textOverImage rule and crop as given), `cutout` when samples carry a cutout / transparent tag, `mask:<id>` per
 * imagery.masks.options (type, its polygon in % when a polygon, its SVG's painted share when svg).
 */
export function imagery(spec, ctx) {
  const out = [];
  const im = spec.imagery ?? {};
  const samples = im.samples ?? [];
  const shared = defined({
    treatments: im.treatments?.options ? Object.keys(im.treatments.options) : undefined,
    treatmentDefault: im.treatments?.default,
    textOverImage: im.textOverImage,
    crop: im.crop,
  });
  for (const kind of IMAGE_KINDS) {
    const idx = samples.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const aspects = new Set();
    const tags = new Set();
    for (const i of idx) {
      const s = samples[i];
      const w = s.width ?? s.w;
      const h = s.height ?? s.h;
      if (w && h) aspects.add(round(w / h));
      for (const t of s.tags ?? []) tags.add(t);
    }
    out.push({
      key: `image:${kind}`,
      term: termOf('brand.imagery.sample.kind', kind),
      from: [
        ...idx.map((i) => `/imagery/samples/${i}`),
        ...['treatments', 'textOverImage', 'crop']
          .filter((k) => im[k] !== undefined)
          .map((k) => `/imagery/${k}`),
      ],
      files: idx.map((i) => samples[i].file),
      given: { ...shared, tags: [...tags].sort() },
      measured: { count: idx.length, aspects: [...aspects].sort((a, b) => a - b) },
      why: `imagery.samples of kind ${kind}`,
    });
  }
  const cut = samples
    .map((s, i) => ((s.tags ?? []).some((t) => CUTOUT_TAGS.includes(t)) ? i : -1))
    .filter((i) => i >= 0);
  if (cut.length) {
    out.push({
      key: 'cutout',
      term: named('E2:cutout'),
      from: cut.map((i) => `/imagery/samples/${i}`),
      files: cut.map((i) => samples[i].file),
      given: {},
      measured: { count: cut.length },
      why: `imagery.samples tagged ${CUTOUT_TAGS.join(' / ')}`,
    });
  }
  for (const [id, mask] of Object.entries(im.masks?.options ?? {})) {
    const ptr = `/imagery/masks/options/${esc(id)}`;
    const measured = {};
    const given = defined({ type: mask?.type, radius: mask?.radius, aspect: mask?.aspect });
    if (mask?.type === 'polygon' && typeof mask.points === 'string') {
      const pts = parsePolygonPoints(mask.points);
      if (pts) {
        measured.polygon = pts;
        measured.areaShare = round(polygonArea(pts) / 10000, 4);
      }
    }
    let why = `imagery.masks.options.${id}`;
    if (mask?.type === 'svg' && mask.file && isSvg(mask.file)) {
      try {
        const doc = ctx.svg(mask.file);
        if (doc?.viewBox) {
          const g = geometry(doc, null);
          measured.areaShare = round(g.areaShare, 4);
          measured.shapes = g.shapes.length;
          if (g.approx) measured.approx = true;
        }
      } catch (err) {
        why += `; the SVG could not be measured: ${err.message}`;
      }
    }
    out.push({
      key: `mask:${id}`,
      term: termOf('brand.mask.type', mask?.type),
      from: [ptr],
      files: mask?.file ? [mask.file] : [],
      given,
      measured,
      why,
    });
  }
  return out;
}

/** "x,y x,y ..." (percentages) -> [[x, y], ...] or null when it does not parse into 3+ finite points. */
export function parsePolygonPoints(text) {
  const pairs = String(text).trim().split(/\s+/);
  const pts = pairs.map((p) => p.split(',').map(Number));
  if (pts.length < 3 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) return null;
  return pts;
}

// ---------- colour fields ----------

const safeContrast = (a, b) => {
  try {
    return round(contrastRatio(a, b));
  } catch {
    return undefined;
  }
};

/**
 * colour fields: `colour-field:<surface id>` per surface (term E2:background: a surface is a slide ground) with its
 * tone, bg, text and the WCAG contrast of its text / heading / accent on bg, and the backgrounds.variants that name
 * the surface; plus `colour-field:<id>` per colors.gradients.definitions entry when the policy is not none (term by
 * the gradient type).
 */
export function colourFields(spec) {
  const out = [];
  const variants = Object.entries(spec.backgrounds?.variants ?? {});
  const ids = new Set();
  (spec.surfaces ?? []).forEach((s, i) => {
    if (!s?.id) return;
    ids.add(s.id);
    const bgs = variants.filter(([, v]) => v?.surface === s.id);
    const measured = defined({
      bgLuminance: (() => {
        try {
          return round(relativeLuminance(s.bg), 4);
        } catch {
          return undefined;
        }
      })(),
      contrastText: s.text ? safeContrast(s.bg, s.text) : undefined,
      contrastHeading: s.heading ? safeContrast(s.bg, s.heading) : undefined,
      contrastAccent: s.accent ? safeContrast(s.bg, s.accent) : undefined,
    });
    out.push({
      key: `colour-field:${s.id}`,
      term: named('E2:background'),
      from: [`/surfaces/${i}`, ...bgs.map(([k]) => `/backgrounds/variants/${esc(k)}`)],
      files: bgs.map(([, v]) => v.image).filter(Boolean),
      given: defined({
        kind: 'surface',
        tone: s.tone,
        bg: s.bg,
        text: s.text,
        backgrounds: bgs.length
          ? bgs.map(([k, v]) => ({ id: k, type: v.type, term: termOf('brand.background.type', v.type) }))
          : undefined,
      }),
      measured,
      why: `surfaces[${i}] (${s.id})`,
    });
  });
  const g = spec.colors?.gradients;
  if (g && g.policy !== 'none') {
    for (const [id, def] of Object.entries(g.definitions ?? {})) {
      const key = ids.has(id) ? `colour-field:${id}~gradient` : `colour-field:${id}`;
      out.push({
        key,
        term: termOf('brand.gradient.type', def?.type),
        from: [`/colors/gradients/definitions/${esc(id)}`],
        files: [],
        given: defined({
          kind: 'gradient',
          type: def?.type,
          policy: g.policy,
          stops: def?.stops?.map((s) => s.color),
        }),
        measured: defined({ angle: def?.angle, stops: def?.stops?.length }),
        why: `colors.gradients.definitions.${id} (policy ${g.policy ?? 'not given'})`,
      });
    }
  }
  return out;
}

// ---------- type ----------

function weightRange(face) {
  const ws = [];
  for (const w of face.weights ?? []) if (Number.isFinite(w)) ws.push(w);
  for (const f of face.files ?? [])
    ws.push(
      ...String(f.weight ?? '')
        .split(/\s+/)
        .map(Number)
        .filter(Number.isFinite),
    );
  return ws.length ? { min: Math.min(...ws), max: Math.max(...ws) } : null;
}

/**
 * type: `type-ladder` (the sizes of display h1 h2 h3 body bodySmall caption as given, the ratio of each step to the
 * next, title (h1) : body and display : body, the face family per role, typography.alignment), `second-face` when
 * the roles are set in two or more face families, `weight-contrast` when a face offers two weights >= 300 apart
 * (its `weights` and its files' weight ranges).
 */
export function type(spec) {
  const out = [];
  const t = spec.typography ?? {};
  const roles = t.roles ?? {};
  const faces = t.faces ?? {};
  const ladder = LADDER.filter((r) => typeof roles[r]?.size === 'number');
  if (ladder.length) {
    const sizes = Object.fromEntries(ladder.map((r) => [r, roles[r].size]));
    const steps = [];
    for (let k = 0; k + 1 < ladder.length; k += 1) {
      steps.push({
        from: ladder[k],
        to: ladder[k + 1],
        ratio: round(sizes[ladder[k]] / sizes[ladder[k + 1]], 3),
      });
    }
    const facesByRole = {};
    for (const [r, role] of Object.entries(roles))
      if (faces[role.face]?.family) facesByRole[r] = faces[role.face].family;
    out.push({
      key: 'type-ladder',
      term: null,
      from: [
        ...ladder.map((r) => `/typography/roles/${esc(r)}/size`),
        ...(t.alignment ? ['/typography/alignment'] : []),
      ],
      files: [],
      given: defined({ faces: facesByRole, alignment: t.alignment }),
      measured: defined({
        sizes,
        steps,
        titleToBody: sizes.h1 && sizes.body ? round(sizes.h1 / sizes.body, 3) : undefined,
        displayToBody: sizes.display && sizes.body ? round(sizes.display / sizes.body, 3) : undefined,
      }),
      why: `${NOT_ELEMENT}; typography.roles sizes (${ladder.join(' > ')})`,
    });
  }
  const families = new Map();
  for (const [r, role] of Object.entries(roles)) {
    const fam = faces[role.face]?.family;
    if (!fam) continue;
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(r);
  }
  if (families.size >= 2) {
    const used = [
      ...new Set(
        Object.values(roles)
          .map((r) => r.face)
          .filter((f) => faces[f]),
      ),
    ];
    out.push({
      key: 'second-face',
      term: named('E4:face-run'),
      from: used.map((f) => `/typography/faces/${esc(f)}/family`),
      files: [],
      given: { families: Object.fromEntries([...families.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) },
      measured: { families: families.size },
      why: `the roles are set in ${families.size} face families`,
    });
  }
  const contrast = [];
  for (const [key, face] of Object.entries(faces)) {
    const r = weightRange(face);
    if (r && r.max - r.min >= WEIGHT_CONTRAST) contrast.push({ face: key, ...r });
  }
  if (contrast.length) {
    out.push({
      key: 'weight-contrast',
      term: named('E4:weight-run'),
      from: contrast.flatMap((c) => [
        `/typography/faces/${esc(c.face)}/weights`,
        `/typography/faces/${esc(c.face)}/files`,
      ]),
      files: [],
      given: { faces: contrast.map((c) => c.face) },
      measured: {
        spread: Math.max(...contrast.map((c) => c.max - c.min)),
        ranges: contrast.map(({ face, min, max }) => ({ face, min, max })),
      },
      why: `a face offers weights >= ${WEIGHT_CONTRAST} apart`,
    });
  }
  return out;
}

// ---------- logos ----------

/**
 * logos: `logo:<variant>` per logos.variants (term E2:brand-logo): file, size, aspect, and for PNG / JPEG / SVG the
 * opaque box and the mean WCAG luminance of the opaque pixels (measure.js mark()); the boxes a composition places the
 * variant at (in % of the canvas).
 */
export function logos(spec, ctx) {
  const out = [];
  const placements = new Map();
  (spec.brandLayouts ?? []).forEach((l, li) => {
    const lg = l.composition?.logo;
    if (!lg?.variant) return;
    if (!placements.has(lg.variant)) placements.set(lg.variant, []);
    placements
      .get(lg.variant)
      .push({ layout: l.id, box: lg.box, pointer: `/brandLayouts/${li}/composition/logo` });
  });
  for (const [variant, v] of Object.entries(spec.logos?.variants ?? {})) {
    const ptr = `/logos/variants/${esc(variant)}`;
    const measured = defined({
      width: v.width,
      height: v.height,
      aspect: v.width && v.height ? round(v.width / v.height, 3) : undefined,
    });
    let why = `logos.variants.${variant}`;
    try {
      const m = ctx.mark(v.file);
      if (m.ok) {
        measured.opaqueBbox = m.bboxPct;
        measured.meanLuminance = m.meanLuminance;
        if (m.approx) measured.approx = true;
      } else why += `; not measured: ${m.reason}`;
    } catch (err) {
      why += `; not measured: ${err.message}`;
    }
    const places = placements.get(variant) ?? [];
    out.push({
      key: `logo:${variant}`,
      term: named('E2:brand-logo'),
      from: [ptr, ...places.map((p) => p.pointer)],
      files: [v.file],
      given: defined({
        placements: places.length
          ? places.map((p) => ({ layout: p.layout, box: p.box ? boxPct(p.box) : null }))
          : undefined,
      }),
      measured,
      why,
    });
  }
  return out;
}

// ---------- components ----------

/**
 * components: `component:<term>` per components.* key through the `brand.components` map (several keys of one term
 * share the entry: button + buttonSecondary ...); a key the map does not name is `component:<key>` with term
 * unknown. cards: the style kind (`brand.cardStyle.kind`) and the recipes' kinds (`brand.cardRecipe.kind`).
 */
export function components(spec) {
  const map = new Map();
  for (const [key, block] of Object.entries(spec.components ?? {})) {
    const term = termOf('brand.components', key);
    const name = term === 'unknown' ? key : term.split(':')[1];
    const k = `component:${name}`;
    if (!map.has(k))
      map.set(k, {
        key: k,
        term,
        from: [],
        files: [],
        given: { sources: [] },
        measured: {},
        why: `components.${key}`,
      });
    const e = map.get(k);
    e.from.push(`/components/${esc(key)}`);
    e.given.sources.push(key);
    if (key === 'cards' && block && typeof block === 'object') {
      if (block.style?.kind) {
        e.given.style = block.style.kind;
        e.given.styleTerm = termOf('brand.cardStyle.kind', block.style.kind);
      }
      if (Array.isArray(block.recipes)) {
        e.measured.recipes = block.recipes.length;
        e.given.recipes = block.recipes.map((r) =>
          defined({
            id: r.id,
            kind: r.kind,
            term: r.kind ? termOf('brand.cardRecipe.kind', r.kind) : undefined,
          }),
        );
      }
    }
    if (key === 'icons' && Array.isArray(block?.files)) e.measured.files = block.files.length;
  }
  for (const e of map.values()) e.why = `components: ${e.given.sources.join(', ')}`;
  return [...map.values()];
}

// ---------- shape language ----------

/**
 * shape: one `angle` capability (the grammar's bare key, as the template needs name it) listing every distinct
 * non-axis edge angle (0-90 from horizontal, 0.5 steps) across the decor elements' SVGs, measured in canvas space
 * through each element's box (edges under 1 % of the frame width and curve pieces left out), and the elements per
 * angle. One angle or several is itself the signal (measured.count).
 */
export function shapeLanguage(spec, ctx) {
  const byAngle = new Map();
  (spec.decor?.elements ?? []).forEach((el, i) => {
    let g;
    try {
      g = decorGeometry(ctx, el);
    } catch {
      return;
    }
    if (!g || g.error) return;
    for (const a of g.angles) {
      if (!byAngle.has(a)) byAngle.set(a, []);
      byAngle.get(a).push({ i, el });
    }
  });
  if (!byAngle.size) return [];
  const angles = [...byAngle.keys()].sort((a, b) => a - b);
  const idx = [...new Set([...byAngle.values()].flat().map(({ i }) => i))].sort((a, b) => a - b);
  const els = spec.decor.elements;
  return [
    {
      key: 'angle',
      term: null,
      from: idx.map((i) => `/decor/elements/${i}`),
      files: idx.map((i) => els[i].file),
      given: {
        byAngle: Object.fromEntries(angles.map((a) => [String(a), byAngle.get(a).map(({ el }) => el.id)])),
      },
      measured: { angles, count: angles.length },
      why: `${NOT_ELEMENT}; straight painted edges at ${angles.join(', ')} degrees from horizontal in ${idx.map((i) => els[i].id).join(', ')}`,
    },
  ];
}

// ---------- composition, motion (as given) ----------

/** composition density / whitespace / limits and motion, as given (no vocabulary term names them yet). */
export function asGiven(spec) {
  const out = [];
  const c = spec.composition;
  if (c && typeof c === 'object' && Object.keys(c).length) {
    out.push({
      key: 'composition',
      term: null,
      from: ['/composition'],
      files: [],
      given: defined({
        density: c.density,
        titleEverySlide: c.titleEverySlide,
        sectionDividers: c.sectionDividers,
      }),
      measured: defined({
        minWhitespacePct: typeof c.minWhitespace === 'number' ? round(c.minWhitespace * 100) : undefined,
        maxElementsPerSlide: c.maxElementsPerSlide,
        maxAccentsPerSlide: c.maxAccentsPerSlide,
      }),
      why: `${NOT_ELEMENT}; composition (density, whitespace, limits) as given`,
    });
  }
  const m = spec.motion;
  if (m && typeof m === 'object' && Object.keys(m).length) {
    out.push({
      key: 'motion',
      term: null,
      from: ['/motion'],
      files: [],
      given: defined({ transition: m.transition, build: m.build, easing: m.easing }),
      measured: defined({ duration: m.duration, stagger: m.stagger }),
      why: `${NOT_ELEMENT}; motion as given`,
    });
  }
  return out;
}

/** The family of a capability key (for grouping). */
export function familyOf(key) {
  if (key.startsWith('device:')) return 'devices';
  if (key === 'photo-area' || key === 'text-zone' || key.startsWith('overlay:')) return 'photo-areas';
  if (key.startsWith('image:') || key === 'cutout' || key.startsWith('mask:')) return 'imagery';
  if (key.startsWith('colour-field:')) return 'colour-fields';
  if (['type-ladder', 'second-face', 'weight-contrast'].includes(key)) return 'type';
  if (key.startsWith('logo:')) return 'logos';
  if (key.startsWith('component:')) return 'components';
  if (key === 'angle' || key.startsWith('angle:')) return 'shape';
  return 'composition';
}

/**
 * BR-CAPABILITIES: every family over the BrandSpec data. `provenance` is the BrandSpec provenance sidecar (read for
 * `inferred`); it is not changed here. Returns the capability list (status set), in family order.
 */
export function deriveCapabilities(spec, provenance, ctx) {
  const list = [
    ...devices(spec, ctx),
    ...compositions(spec),
    ...imagery(spec, ctx),
    ...colourFields(spec),
    ...type(spec),
    ...logos(spec, ctx),
    ...components(spec),
    ...shapeLanguage(spec, ctx),
    ...asGiven(spec),
  ];
  return list.map((c) => ({
    key: c.key,
    term: c.term,
    from: c.from,
    files: c.files,
    given: c.given,
    measured: c.measured,
    status: isOffered(provenance, c.from) ? 'offered' : 'given',
    why: c.why,
  }));
}
