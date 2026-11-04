/**
 * BR-CLAIMS (docs/P1-rules.md §A, docs/PLAN-template-library.md §3): a value the brand JSON claims about one of its
 * OWN files is compared with the file. Every claim the JSON makes is recorded at `spec.claims[]`
 * `{ id, pointer, inputPointer, file, claim, measured, pass: true | false | null, tolerance, why }` (`pass: null` =
 * the claim could not be measured, with the reason in `why`); a claim the JSON does not make is not checked (no
 * entry). A failing claim is a question on that pointer, never a corrected value.
 *
 * The questions are `optional` today: no template binds to these fields yet. V3 (the binding step) raises a failing
 * claim to `blocking` when a template binds to the field it is about (docs/PLAN-template-library.md §3-§4).
 */
import { escapeToken as esc } from './pointer.js';
import { decorGeometry, parsePolygonPoints } from './capabilities.js';
import { H, inputPointer, isSvg, round, W } from './measure.js';
import { borderMedian, diffBbox, nearShare, rgbDistance } from './pixels.js';
import {
  distanceToSegment,
  edges,
  paints,
  paintedColours,
  parsePath,
  parseColour,
  hexOf,
} from './svggeom.js';

/** Tolerances (each claim names the ones it uses). */
export const TOL = Object.freeze({
  photoVertexInside: 0.01 * W, // a photoArea vertex may lie this deep inside a painted shape (1 % W)
  photoEdgeDistance: 0.02 * W, // the photoArea edge nearest the shapes lies within this of a painted edge (2 % W)
  photoEdgeSamples: 64, // points sampled along each photoArea edge
  logoDiff: 48, // RGB distance from the ground colour (ring around the box + margin) that marks a lockup pixel
  logoFill: 0.5, // the lockup's box fills at least this share of the claimed box
  logoMargin: 0.02 * W, // the lockup lies within the claimed box + this margin (2 % W)
  samplePx: 1, // a sample's w / h may differ from the file by this many px
  sampleAspect: 0.02, // a sample's aspect may differ from the file's width / height by this share
  lightMark: 0.6, // monoLight: mean WCAG luminance of the opaque pixels at least this
  darkMark: 0.4, // monoDark: at most this
  decorAspect: 0.05, // a decor box's aspect vs its SVG viewBox aspect
  surfaceShare: 0.2, // share of an image background's pixels near its surface's bg
  surfaceDistance: 40, // RGB distance counted as "near" that bg
  decorColour: 16, // RGB distance from a brand colour a decor SVG colour may have
});

// `reverse` is the mark for a coloured ground and may be dark (a black reverse on red): no tone claim, its luminance is
// a capability measurement (logo:reverse)
const LIGHT_VARIANTS = ['monoLight'];
const DARK_VARIANTS = ['monoDark'];

function hexRgb(hex) {
  const c = parseColour(hex);
  return c?.rgb ?? null;
}

/** Every literal brand colour: colors.* (named, neutrals, chart, semantic, gradient stops) and every surface colour. */
export function brandColours(spec) {
  const out = new Map();
  const walk = (v, where) => {
    if (typeof v === 'string') {
      if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(v)) out.set(v.slice(0, 7).toUpperCase(), where);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}/${i}`));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) walk(x, `${where}/${esc(k)}`);
  };
  walk(spec.colors ?? {}, '/colors');
  walk(spec.surfaces ?? [], '/surfaces');
  return [...out.entries()].map(([hex, where]) => ({ hex, rgb: hexRgb(hex), where }));
}

const record = (c) => ({ inputPointer: inputPointer(c.pointer), ...c });

// ---------- 1. photoArea vs the device ----------

function photoAreaClaim(spec, ctx, l, li) {
  const c = l.composition;
  const pointer = `/brandLayouts/${li}/composition/photoArea`;
  const area = c.photoArea;
  const base = {
    id: `photoArea.${l.id}`,
    pointer,
    claim: { photoArea: area, device: c.device ?? null },
    tolerance: { vertexInsidePx: TOL.photoVertexInside, edgeDistancePx: TOL.photoEdgeDistance },
  };
  const elements = spec.decor?.elements ?? [];
  const el = elements.find((e) => e.id === c.device);
  if (!c.device || !el) {
    return {
      ...base,
      file: null,
      measured: {},
      pass: null,
      why: c.device
        ? `the device ${c.device} is not a decor element`
        : 'no device named: nothing to compare with',
    };
  }
  const g = decorGeometry(ctx, el);
  if (!g || g.error) {
    return {
      ...base,
      file: el.file ?? null,
      measured: {},
      pass: null,
      why: g?.error ?? `the device ${el.id} has no SVG file to measure`,
    };
  }
  const shapes = g.shapes.filter((s) => s.fill);
  if (!shapes.length) {
    return {
      ...base,
      file: el.file,
      measured: {},
      pass: null,
      why: `the device ${el.id} paints no filled shape inside its viewport`,
    };
  }
  // vertices: outside every painted shape (or within the tolerance of its boundary)
  let deepest = 0;
  let deepestVertex = null;
  for (const v of area) {
    for (const s of shapes) {
      if (!paints(s, v)) continue;
      let d = Infinity;
      for (const e of edges([s])) d = Math.min(d, distanceToSegment(v, e.a, e.b));
      if (d > deepest) {
        deepest = d;
        deepestVertex = v;
      }
    }
  }
  // the edge nearest the shapes: mean distance of its samples to the painted (not clipped) edges
  const painted = edges(shapes).filter((e) => !e.clip);
  const distTo = (p) => painted.reduce((m, e) => Math.min(m, distanceToSegment(p, e.a, e.b)), Infinity);
  let best = null;
  for (let k = 0; k < area.length; k += 1) {
    const a = area[k];
    const b = area[(k + 1) % area.length];
    const ds = [];
    for (let s = 0; s <= TOL.photoEdgeSamples; s += 1) {
      const t = s / TOL.photoEdgeSamples;
      ds.push(distTo([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
    const mean = ds.reduce((x, y) => x + y, 0) / ds.length;
    if (!best || mean < best.mean) best = { a, b, ds, mean };
  }
  const max = Math.max(...best.ds);
  const within = best.ds.filter((d) => d <= TOL.photoEdgeDistance).length / best.ds.length;
  const vertexOk = deepest <= TOL.photoVertexInside;
  const edgeOk = max <= TOL.photoEdgeDistance;
  const measured = {
    vertexInsidePx: round(deepest),
    vertexInsidePctW: round((deepest / W) * 100),
    ...(deepestVertex && deepest > 0 ? { deepestVertex } : {}),
    nearestEdge: [best.a, best.b],
    edgeMaxDistancePx: round(max),
    edgeMaxDistancePctW: round((max / W) * 100),
    edgeMeanDistancePx: round(best.mean),
    edgeWithinShare: round(within, 3),
    ...(g.approx ? { approx: true } : {}),
  };
  const parts = [];
  if (!vertexOk)
    parts.push(
      `a vertex lies ${measured.vertexInsidePctW} % W inside the device's painted shapes (tolerance 1 %)`,
    );
  if (!edgeOk)
    parts.push(
      `the edge nearest the device runs up to ${measured.edgeMaxDistancePctW} % W from a painted edge ` +
        `(tolerance 2 %; ${round(within * 100, 1)} % of its length within)`,
    );
  return {
    ...base,
    file: el.file,
    measured,
    pass: vertexOk && edgeOk,
    why: parts.length
      ? `photoArea vs ${el.file} (device ${el.id}): ${parts.join('; ')}`
      : `photoArea vs ${el.file} (device ${el.id}): every vertex outside the painted shapes, its nearest edge along a painted edge`,
  };
}

// ---------- 2. composition.logo.box vs the background raster ----------

function backgroundOf(spec, id) {
  if (!id) return null;
  if (id === 'default') return { bg: spec.backgrounds?.default, pointer: '/backgrounds/default' };
  const bg = spec.backgrounds?.variants?.[id];
  return bg ? { bg, pointer: `/backgrounds/variants/${esc(id)}` } : null;
}

/** Canvas px -> image px for a background image of `imageFit` (cover / contain; same size: identity). */
function canvasToImage(img, fit) {
  if (img.width === W && img.height === H) return { k: 1, ox: 0, oy: 0 };
  if (fit !== 'cover' && fit !== 'contain') return null;
  const k =
    fit === 'cover' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height);
  return { k, ox: (W - img.width * k) / 2, oy: (H - img.height * k) / 2 };
}

function logoBoxClaim(spec, ctx, l, li) {
  const lg = l.composition.logo;
  const pointer = `/brandLayouts/${li}/composition/logo`;
  const base = {
    id: `logoBox.${l.id}`,
    pointer,
    claim: { variant: lg.variant, box: lg.box, background: l.background ?? null },
    tolerance: { diff: TOL.logoDiff, fill: TOL.logoFill, marginPx: TOL.logoMargin },
  };
  const variantExists = Boolean(spec.logos?.variants?.[lg.variant]);
  const found = backgroundOf(spec, l.background);
  const file = found?.bg?.image ?? null;
  if (!file) {
    return {
      ...base,
      file: null,
      measured: { variantExists },
      pass: variantExists ? null : false,
      why: `${variantExists ? '' : `the variant ${lg.variant} is not in logos.variants; `}no background image named for layout ${l.id} to measure the box on`,
    };
  }
  const img = ctx.image(file);
  if (!img.ok) {
    return {
      ...base,
      file,
      measured: { variantExists },
      pass: variantExists ? null : false,
      why: `${img.reason}${variantExists ? '' : `; the variant ${lg.variant} is not in logos.variants`}`,
    };
  }
  const map = canvasToImage(img, found.bg.imageFit);
  if (!map) {
    return {
      ...base,
      file,
      measured: { variantExists },
      pass: variantExists ? null : false,
      why: `the image is ${img.width}x${img.height}, not 1920x1080, and gives no cover / contain fit`,
    };
  }
  const toImg = (b) => ({
    x: (b.x - map.ox) / map.k,
    y: (b.y - map.oy) / map.k,
    w: b.w / map.k,
    h: b.h / map.k,
  });
  const toCanvas = (b) => ({
    x: b.x * map.k + map.ox,
    y: b.y * map.k + map.oy,
    w: b.w * map.k,
    h: b.h * map.k,
  });
  const box = lg.box;
  const m = TOL.logoMargin;
  const search = { x: box.x - m, y: box.y - m, w: box.w + 2 * m, h: box.h + 2 * m };
  // the ground the lockup sits on: the median of the ring around the box + margin (a lockup that fills its box
  // exactly would otherwise be its own reference)
  const ref = borderMedian(img, toImg(search));
  const { bbox } = diffBbox(img, toImg(search), ref, TOL.logoDiff);
  if (!bbox) {
    return {
      ...base,
      file,
      measured: { variantExists, borderColour: hexOf(ref), lockup: null, fill: 0 },
      pass: false,
      why: `nothing inside the claimed box differs from the ground colour ${hexOf(ref)} around it: no lockup there`,
    };
  }
  const lock = toCanvas(bbox);
  const ix = Math.max(0, Math.min(lock.x + lock.w, box.x + box.w) - Math.max(lock.x, box.x));
  const iy = Math.max(0, Math.min(lock.y + lock.h, box.y + box.h) - Math.max(lock.y, box.y));
  const fill = (ix * iy) / (box.w * box.h);
  // the lockup continues past the box + margin when its box touches the search border (an image edge excepted)
  const eps = map.k * 1.5;
  const sx0 = Math.max(search.x, map.ox);
  const sy0 = Math.max(search.y, map.oy);
  const sx1 = Math.min(search.x + search.w, map.ox + img.width * map.k);
  const sy1 = Math.min(search.y + search.h, map.oy + img.height * map.k);
  const touches =
    (lock.x <= sx0 + eps && sx0 > map.ox + eps && sx0 > 0) ||
    (lock.y <= sy0 + eps && sy0 > map.oy + eps && sy0 > 0) ||
    (lock.x + lock.w >= sx1 - eps && sx1 < Math.min(W, map.ox + img.width * map.k) - eps) ||
    (lock.y + lock.h >= sy1 - eps && sy1 < Math.min(H, map.oy + img.height * map.k) - eps);
  const fillOk = fill >= TOL.logoFill;
  const measured = {
    variantExists,
    borderColour: hexOf(ref),
    lockup: { x: round(lock.x), y: round(lock.y), w: round(lock.w), h: round(lock.h) },
    fill: round(fill, 3),
    beyondMargin: touches,
  };
  const parts = [];
  if (!variantExists) parts.push(`the variant ${lg.variant} is not in logos.variants`);
  if (!fillOk) parts.push(`the lockup fills ${round(fill * 100, 1)} % of the box (needs 50 %)`);
  if (touches) parts.push('the lockup continues beyond the box + 2 % W');
  return {
    ...base,
    file,
    measured,
    pass: variantExists && fillOk && !touches,
    why: parts.length
      ? `logo box vs ${file}: ${parts.join('; ')}`
      : `logo box vs ${file}: the lockup (pixels unlike the ground colour ${hexOf(ref)}) fills ${round(fill * 100, 1)} % of the box and stays within it`,
  };
}

// ---------- 3. imagery samples' size ----------

function sampleClaims(spec) {
  const out = [];
  (spec.imagery?.samples ?? []).forEach((s, i) => {
    const claim = {};
    for (const k of ['w', 'h', 'aspect']) if (typeof s[k] === 'number') claim[k] = s[k];
    if (!Object.keys(claim).length) return;
    const base = {
      id: `sample.${i}`,
      pointer: `/imagery/samples/${i}`,
      file: s.file,
      claim,
      tolerance: { px: TOL.samplePx, aspect: TOL.sampleAspect },
    };
    if (!(s.width > 0 && s.height > 0)) {
      out.push({
        ...base,
        measured: {},
        pass: null,
        why: `the size of ${s.file} could not be read from its header`,
      });
      return;
    }
    const aspect = s.width / s.height;
    const bad = [];
    if (claim.w !== undefined && Math.abs(claim.w - s.width) > TOL.samplePx)
      bad.push(`w ${claim.w} vs ${s.width}`);
    if (claim.h !== undefined && Math.abs(claim.h - s.height) > TOL.samplePx)
      bad.push(`h ${claim.h} vs ${s.height}`);
    if (claim.aspect !== undefined && Math.abs(claim.aspect / aspect - 1) > TOL.sampleAspect)
      bad.push(`aspect ${claim.aspect} vs ${round(aspect, 3)}`);
    out.push({
      ...base,
      measured: {
        width: s.width,
        height: s.height,
        aspect: round(aspect, 3),
        // file px per claimed px: a uniform 2 means a 2x (retina) file of the claimed size
        ...(claim.w ? { scaleW: round(s.width / claim.w, 3) } : {}),
        ...(claim.h ? { scaleH: round(s.height / claim.h, 3) } : {}),
      },
      pass: bad.length === 0,
      why: bad.length ? `${s.file}: ${bad.join(', ')}` : `${s.file}: the claimed size matches the file`,
    });
  });
  return out;
}

// ---------- 4. mono logo tone ----------

function logoToneClaims(spec, ctx) {
  const out = [];
  for (const [variant, v] of Object.entries(spec.logos?.variants ?? {})) {
    const light = LIGHT_VARIANTS.includes(variant);
    if (!light && !DARK_VARIANTS.includes(variant)) continue;
    const base = {
      id: `logoTone.${variant}`,
      pointer: `/logos/variants/${esc(variant)}`,
      file: v.file,
      claim: { tone: light ? 'light' : 'dark' },
      tolerance: light ? { minLuminance: TOL.lightMark } : { maxLuminance: TOL.darkMark },
    };
    const m = ctx.mark(v.file);
    if (!m.ok || m.meanLuminance === null) {
      out.push({
        ...base,
        measured: {},
        pass: null,
        why: m.ok ? `${v.file}: no opaque pixel` : `${v.file}: ${m.reason}`,
      });
      continue;
    }
    const pass = light ? m.meanLuminance >= TOL.lightMark : m.meanLuminance <= TOL.darkMark;
    out.push({
      ...base,
      measured: { meanLuminance: m.meanLuminance, ...(m.approx ? { approx: true } : {}) },
      pass,
      why: `${variant} ${v.file}: mean luminance of the opaque pixels ${m.meanLuminance} (${light ? `light needs >= ${TOL.lightMark}` : `dark needs <= ${TOL.darkMark}`})`,
    });
  }
  return out;
}

// ---------- 5. decor box aspect vs viewBox; 8. decor SVG colours ----------

function decorClaims(spec, ctx) {
  const out = [];
  const colours = brandColours(spec);
  (spec.decor?.elements ?? []).forEach((el, i) => {
    if (!el.file || !isSvg(el.file)) return;
    const doc = ctx.svg(el.file);
    // a tiled element's box is the area the tile repeats over, not the file's frame: no aspect claim
    if (el.box && el.box.w > 0 && el.box.h > 0 && !el.tile) {
      const base = {
        id: `decorAspect.${el.id}`,
        pointer: `/decor/elements/${i}/box`,
        file: el.file,
        claim: { box: el.box },
        tolerance: { aspect: TOL.decorAspect },
      };
      if (!doc?.viewBox)
        out.push({ ...base, measured: {}, pass: null, why: `${el.file}: no viewBox or size` });
      else {
        const boxAspect = el.box.w / el.box.h;
        const vbAspect = doc.viewBox.w / doc.viewBox.h;
        const off = Math.abs(boxAspect / vbAspect - 1);
        out.push({
          ...base,
          measured: { boxAspect: round(boxAspect, 4), viewBoxAspect: round(vbAspect, 4), off: round(off, 4) },
          pass: off <= TOL.decorAspect,
          why: `box ${round(boxAspect, 3)} vs viewBox ${round(vbAspect, 3)}: ${round(off * 100, 1)} % off (tolerance 5 %)`,
        });
      }
    }
    if (el.colorable === true) return; // the renderer recolours it: its file colours are not a claim
    const base = {
      id: `decorColours.${el.id}`,
      pointer: `/decor/elements/${i}/file`,
      file: el.file,
      claim: { colours: 'the brand colours' },
      tolerance: { rgbDistance: TOL.decorColour },
    };
    if (!doc) {
      out.push({ ...base, measured: {}, pass: null, why: `${el.file}: not readable as SVG` });
      return;
    }
    const painted = paintedColours(doc);
    if (!painted.length) {
      out.push({
        ...base,
        measured: { colours: 0 },
        pass: null,
        why: `${el.file}: paints no plain colour this reader can see`,
      });
      return;
    }
    const off = [];
    const checked = painted.map((p) => {
      let best = null;
      for (const c of colours) {
        const d = rgbDistance(p.rgb, c.rgb);
        if (!best || d < best.d) best = { d, hex: c.hex };
      }
      const row = { hex: p.hex, nearest: best?.hex ?? null, distance: best ? round(best.d, 1) : null };
      if (!best || best.d > TOL.decorColour) off.push(row);
      return row;
    });
    out.push({
      ...base,
      measured: { colours: checked },
      pass: off.length === 0,
      why: off.length
        ? `${el.file} paints ${off.map((o) => `${o.hex} (nearest brand colour ${o.nearest ?? 'none'}, ${o.distance})`).join(', ')}: not a brand colour`
        : `${el.file}: every painted colour is a brand colour`,
    });
  });
  return out;
}

// ---------- 6. an image background shows its surface's colour field ----------

function backgroundClaims(spec, ctx) {
  const out = [];
  const list = [];
  if (spec.backgrounds?.default) list.push(['default', spec.backgrounds.default, '/backgrounds/default']);
  for (const [k, v] of Object.entries(spec.backgrounds?.variants ?? {}))
    list.push([k, v, `/backgrounds/variants/${esc(k)}`]);
  for (const [id, bg, ptr] of list) {
    if (bg?.type !== 'image' || !bg.surface || !bg.image) continue;
    const surface = (spec.surfaces ?? []).find((s) => s.id === bg.surface);
    const base = {
      id: `backgroundSurface.${id}`,
      pointer: `${ptr}/surface`,
      file: bg.image,
      claim: { surface: bg.surface, bg: surface?.bg ?? null },
      tolerance: { share: TOL.surfaceShare, rgbDistance: TOL.surfaceDistance },
    };
    if (!surface?.bg) {
      out.push({
        ...base,
        measured: {},
        pass: null,
        why: `the surface ${bg.surface} is not among the surfaces`,
      });
      continue;
    }
    if (bg.overlay !== undefined) {
      out.push({
        ...base,
        measured: {},
        pass: null,
        why: 'the variant gives an overlay: the surface colour comes from the overlay, not the image',
      });
      continue;
    }
    const img = ctx.image(bg.image);
    if (!img.ok) {
      out.push({ ...base, measured: {}, pass: null, why: `${bg.image}: ${img.reason}` });
      continue;
    }
    const share = nearShare(img, hexRgb(surface.bg), TOL.surfaceDistance);
    out.push({
      ...base,
      measured: { share: round(share, 3) },
      pass: share >= TOL.surfaceShare,
      why: `${round(share * 100, 1)} % of ${bg.image} lies within RGB ${TOL.surfaceDistance} of ${surface.id} bg ${surface.bg} (needs 20 %)`,
    });
  }
  return out;
}

// ---------- 7. masks ----------

function maskClaims(spec, ctx) {
  const out = [];
  for (const [id, mask] of Object.entries(spec.imagery?.masks?.options ?? {})) {
    const pointer = `/imagery/masks/options/${esc(id)}`;
    if (mask?.type === 'svg') {
      const base = { id: `mask.${id}`, pointer, claim: { type: 'svg' }, tolerance: { minPaths: 1 } };
      if (mask.file) {
        const abs = ctx.abs(mask.file);
        const doc = abs ? ctx.svg(mask.file) : null;
        const n = doc?.shapes?.length ?? 0;
        out.push({
          ...base,
          file: mask.file,
          measured: { shapes: n },
          pass: n >= 1,
          why:
            n >= 1
              ? `${mask.file}: ${n} painted shape(s)`
              : `${mask.file}: ${doc ? 'no path or shape' : 'not readable as SVG'}`,
        });
      } else if (typeof mask.path === 'string') {
        const n = parsePath(mask.path).subpaths.length;
        out.push({
          ...base,
          file: null,
          measured: { subpaths: n },
          pass: n >= 1,
          why: n >= 1 ? `inline path: ${n} subpath(s)` : 'the inline path draws nothing',
        });
      } else {
        out.push({
          ...base,
          file: null,
          measured: {},
          pass: false,
          why: 'an svg mask with neither a file nor a path',
        });
      }
    } else if (mask?.type === 'polygon') {
      const pts = typeof mask.points === 'string' ? parsePolygonPoints(mask.points) : null;
      const inRange = pts?.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100) ?? false;
      out.push({
        id: `mask.${id}`,
        pointer,
        file: null,
        claim: { type: 'polygon', points: mask.points ?? null },
        measured: { points: pts ? pts.length : 0 },
        tolerance: { minPoints: 3, range: [0, 100] },
        pass: Boolean(pts) && inRange,
        why: !pts
          ? 'the points do not parse into 3+ "x,y" pairs'
          : inRange
            ? `${pts.length} points`
            : 'a point lies outside 0-100 %',
      });
    }
  }
  return out;
}

/** The optional question a failing claim raises (on its input pointer). */
export function claimQuestion(c) {
  return {
    id: `claim.${c.id}`,
    pointer: c.inputPointer,
    question: `The brand JSON's claim at ${c.inputPointer} does not match ${c.file ?? 'its file'}: ${c.why}. Correct the value or the file.`,
    neededBy: ['BR-CLAIMS'],
    // optional today; V3 raises it to blocking when a template binds to this field
    severity: 'optional',
  };
}

/** Run one claim builder; a builder that throws records `pass: null` with the error, never stops the read. */
function safely(fn, id, pointer) {
  try {
    return fn();
  } catch (err) {
    return [
      {
        id,
        pointer,
        file: null,
        claim: {},
        measured: {},
        pass: null,
        tolerance: {},
        why: `could not be measured: ${err.message}`,
      },
    ];
  }
}

/** BR-CLAIMS over the BrandSpec data: `{ claims, questions }` (one optional question per failing claim). */
export function deriveClaims(spec, ctx) {
  const list = [];
  (spec.brandLayouts ?? []).forEach((l, li) => {
    const c = l.composition;
    if (!c || typeof c !== 'object') return;
    if (Array.isArray(c.photoArea))
      list.push(
        ...safely(
          () => [photoAreaClaim(spec, ctx, l, li)],
          `photoArea.${l.id}`,
          `/brandLayouts/${li}/composition/photoArea`,
        ),
      );
    if (c.logo?.box)
      list.push(
        ...safely(
          () => [logoBoxClaim(spec, ctx, l, li)],
          `logoBox.${l.id}`,
          `/brandLayouts/${li}/composition/logo`,
        ),
      );
  });
  list.push(...safely(() => sampleClaims(spec), 'samples', '/imagery/samples'));
  list.push(...safely(() => logoToneClaims(spec, ctx), 'logoTone', '/logos/variants'));
  list.push(...safely(() => decorClaims(spec, ctx), 'decor', '/decor/elements'));
  list.push(...safely(() => backgroundClaims(spec, ctx), 'backgrounds', '/backgrounds'));
  list.push(...safely(() => maskClaims(spec, ctx), 'masks', '/imagery/masks'));
  const claims = list.map(record).map((c) => ({
    id: c.id,
    pointer: c.pointer,
    inputPointer: c.inputPointer,
    file: c.file ?? null,
    claim: c.claim,
    measured: c.measured,
    pass: c.pass,
    tolerance: c.tolerance,
    why: c.why,
  }));
  return { claims, questions: claims.filter((c) => c.pass === false).map(claimQuestion) };
}
