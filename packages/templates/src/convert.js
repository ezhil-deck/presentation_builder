/**
 * Anatomy record (+ its raw objects) -> template record (schemas/template.schema.json; docs/PLAN-template-library.md §2,
 * docs/TEMPLATES.md). Pure: the measuring (browser, pixel pass, anatomy.py) happened before; this reads its numbers.
 * Every intent field names the measurement it rests on (intent.why); a value no measurement gives is null with its why.
 * No text is kept: word counts and metrics only.
 */
import { identify, terms, words } from '@pb/vocabulary';

const NS = new Map();
const nsOf = (term) => {
  if (!NS.size) for (const t of terms()) NS.set(t.term, t.namespace);
  return NS.get(term) || null;
};
const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : n);
const boxOf = (b) => ({ x: r2(b[0]), y: r2(b[1]), w: r2(b[2] - b[0]), h: r2(b[3] - b[1]) });
const overlap = (a, b) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0;

/** Image roles (E2) that carry a picture. */
export const IMAGE_ROLES = Object.freeze(['hero-image', 'cutout', 'picture', 'background-art', 'avatar']);
/** Header parts of the catalogue convention that are furniture (the title and its rule are not). */
export const FURNITURE_PARTS = Object.freeze(['k', 'src', 'ft', 'lg']);
/** measurements.md: covers, dividers and KPI slides set the title 3.5x body or more - size is then the emphasis. */
export const SIZE_EMPHASIS = 3.5;
/** A diagonal is the masses' side when its two corners carry 1.25x the other two (else even). */
export const DIAGONAL_RATIO = 1.25;
/** Tolerance (% of the slide) of a margin anchor and a margin break. */
export const ANCHOR_TOL = 0.6;

/** The 3 x 3 cells (row, col) a box [x0, y0, x1, y1] (%) overlaps. */
export function cellsOf(b) {
  const out = [];
  for (let r = 0; r < 3; r += 1)
    for (let c = 0; c < 3; c += 1) {
      const cell = [(c * 100) / 3, (r * 100) / 3, ((c + 1) * 100) / 3, ((r + 1) * 100) / 3];
      if (overlap(b, cell)) out.push([r, c]);
    }
  return out;
}

/** The zone of a box: `full` (>= 90 % of the slide) or vertical-horizontal third of its centre. */
export function zoneOf(b) {
  if ((b[2] - b[0]) * (b[3] - b[1]) >= 9000) return 'full';
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const v = cy < 100 / 3 ? 'top' : cy < 200 / 3 ? 'middle' : 'bottom';
  const h = cx < 100 / 3 ? 'left' : cx < 200 / 3 ? 'centre' : 'right';
  return `${v}-${h}`;
}

/** The margins a box is anchored to ('top-left', 'bottom-right', 'left' ...), or null. */
export function anchorOf(b, m) {
  if (!m) return null;
  const v = [];
  if (Math.abs(b[1] - m.top) <= ANCHOR_TOL) v.push('top');
  if (Math.abs(100 - b[3] - m.bottom) <= ANCHOR_TOL) v.push('bottom');
  const h = [];
  if (Math.abs(b[0] - m.left) <= ANCHOR_TOL) h.push('left');
  if (Math.abs(100 - b[2] - m.right) <= ANCHOR_TOL) h.push('right');
  const all = [...v, ...h];
  return all.length ? all.join('-') : null;
}

/** Whether a box passes a measured margin (a bleeding element does). */
export function breaksMargin(b, m) {
  if (!m) return false;
  return (
    b[0] < m.left - ANCHOR_TOL ||
    b[1] < m.top - ANCHOR_TOL ||
    b[2] > 100 - m.right + ANCHOR_TOL ||
    b[3] > 100 - m.bottom + ANCHOR_TOL
  );
}

/** The largest non-axis angle of an element (degrees from the horizontal, folded to 0..90), or null. */
export function angleOf(angles) {
  if (!angles) return null;
  let best = null;
  for (const [deg, len] of Object.entries(angles)) {
    let a = Math.abs(Number(deg)) % 180;
    a = Math.min(a, 180 - a);
    if (!best || len > best.len) best = { a, len };
  }
  return best ? r2(best.a) : null;
}

function layerOf(el, texts) {
  const over = texts.filter((t) => t !== el && overlap(t.bbox, el.bbox));
  const s = {
    kind: el.kind,
    behindText: over.some((t) => t.z > el.z),
    overText: over.some((t) => t.z < el.z),
  };
  const r = identify(s, {}, { scope: 'layer' });
  return r.term === 'unknown' ? null : r.term;
}

function treatmentOf(e, raw, ctx) {
  if (e.kind === 'image' && IMAGE_ROLES.includes(e.role)) {
    const s = {
      kind: 'image',
      bbox: e.bbox,
      bleed: e.bleed || raw.bleed || [],
      transparent: raw.transparent === true,
      mask: raw.mask || null,
      textOver: ctx.texts.some((t) => t.z > e.z && overlap(t.bbox, e.bbox)),
    };
    const r = identify(s, {}, { scope: 'image-treatment' });
    return r.term === 'unknown' ? null : r.term;
  }
  if (['panel', 'card', 'callout'].includes(e.role)) {
    const s = {
      kind: e.kind,
      fillDiffers: Boolean(raw.fill) && raw.fill !== ctx.background,
      border: Boolean(raw.stroke),
      shadow: Boolean(raw.shadow),
    };
    const r = identify(s, {}, { scope: 'card-style' });
    return r.term === 'unknown' ? null : r.term;
  }
  if (e.role === 'cut-shape' && e.angles) return 'angle';
  return null;
}

/**
 * One template record. `record` = anatomy.py's record.json, `raw` = its raw.json (the objects, with their marks);
 * `source` {kind, ref, layout?}; `shapeCode` (catalogue shapes); `composition` (no needs: a composition only);
 * `provenance`; `options` [{kind, ref}]; `questions` (authored role conflicts, from the caller).
 */
export function toTemplate({
  id,
  record,
  raw,
  source,
  shapeCode = null,
  composition = false,
  provenance,
  options = [],
}) {
  const rawById = new Map(raw.objects.map((o) => [o.id, o]));
  const L1 = record.L1_elements.filter((e) => e.role !== 'hidden');
  const slideObj = raw.objects.find((o) => o.tag === 'slide');
  const background = slideObj?.fill ?? record.L2_composition?.background ?? null;
  const all = L1.map((e) => ({ ...e, raw: rawById.get(e.id) || {} }));
  const texts = all.filter((e) => e.kind === 'text');
  const ctx = { background, texts };
  const L2 = record.L2_composition || {};
  const L3 = record.L3_balance || {};
  const margins = L2.margins || null;

  const elements = all.map((e) => {
    const out = { id: e.id, z: e.z ?? 0 };
    const ns = nsOf(e.role);
    if (ns === 'E2') out.role = e.role;
    else if (ns === 'E3') {
      out.role = 'unknown';
      out.structure = e.role;
    } else out.role = 'unknown';
    out.why = e.rule || e.why || 'no rule of the element chain holds';
    const prim = identify({ kind: e.kind, bbox: e.bbox }, {}, { scope: 'primitive' });
    out.primitive = prim.term === 'unknown' ? 'group' : prim.term;
    out.box = boxOf(e.bbox);
    const t = treatmentOf(e, e.raw, ctx);
    if (t) out.treatment = t;
    if (e.kind === 'text') {
      out.text = {
        sizePctH: r2(e.sizePctH ?? 0),
        weight: Number(e.weight ?? e.raw.weight ?? 400),
        lines: e.lines ?? 1,
        words: words(e.raw.text ?? ''),
        align: e.align ?? 'left',
        caps: Boolean(e.caps),
        leading: e.leading ?? null,
      };
    }
    if (e.furniture) out.furniture = true;
    const m = e.raw.marks;
    if (m || e.raw.part) {
      out.mark = { ...(m || {}) };
      if (e.raw.part) out.mark.part = e.raw.part;
    }
    if (e.raw.authored) out.authored = { ...e.raw.authored };
    return out;
  });
  const byId = new Map(elements.map((e) => [e.id, e]));

  // --- zones, rhythm, hierarchy, balance
  const z = L2.zones || {};
  const zones = {
    text: z.text ? boxOf(z.text) : null,
    visual: z.visual ? boxOf(z.visual) : null,
    split: z.split ?? null,
    textAreaPct: r2(z.textAreaPct ?? 0),
    visualAreaPct: r2(z.visualAreaPct ?? 0),
  };
  const rh = L2.rhythm;
  const rhythm = rh
    ? {
        steps: rh.steps.map((s) => ({
          from: s.from,
          to: s.to,
          gapPctH: s.gapPctH,
          gapInTitleSize: s.gapInTitleSize,
        })),
        groups: rh.groups,
        innerGap: rh.innerGap ?? null,
      }
    : null;
  const ts = L3.typeScale || {};
  const hierarchy = {
    sizesPctH: ts.sizesPctH || [],
    ratios: ts.ratios || [],
    titleToBody: ts.titleToBody ?? null,
    titleWords: ts.titleWords ?? null,
    titleLines: ts.titleLines ?? null,
    emphasisRuns: (ts.emphasisRuns || []).length,
  };
  const g = L3.weight?.grid3x3;
  let diagonal = null;
  if (g) {
    const tlbr = r2(g[0][0] + g[2][2]);
    const trbl = r2(g[0][2] + g[2][0]);
    const side =
      tlbr >= DIAGONAL_RATIO * trbl && tlbr > 0
        ? 'tl-br'
        : trbl >= DIAGONAL_RATIO * tlbr && trbl > 0
          ? 'tr-bl'
          : 'even';
    diagonal = { tlbr, trbl, side };
  }
  const balance = {
    weightCentre: L3.weight?.centre ?? null,
    leftRight: L3.weight?.leftRight ?? null,
    emptySpace: L3.ink?.emptySpace ?? null,
    diagonal,
    busy3x3: L3.busy3x3 ?? null,
  };

  // --- intent
  const why = {};
  const devices = all.filter((e) => e.role === 'device').sort((a, b) => (b.areaPct ?? 0) - (a.areaPct ?? 0));
  let device = null;
  if (devices.length) {
    const d = devices[0];
    device = {
      id: d.id,
      role: 'device',
      zone: zoneOf(d.bbox),
      angle: angleOf(d.angles || d.raw.angles),
      layer: layerOf(d, texts),
      breaksMargin: breaksMargin(d.bbox, margins),
    };
    why.device = `element ${d.id} is identified as the device (${d.rule}); zone by its centre, angle from its edges, layer from the texts it overlaps`;
  } else {
    const authored = all.filter((e) => e.raw.authored?.role === 'device');
    why.device = authored.length
      ? `no element is identified as a device; the authored device ${authored.map((e) => e.id).join(', ')} is a question until the owner verifies it (D13)`
      : source.kind === 'catalogue'
        ? 'the catalogue draws no brand device: no element is identified as a device'
        : 'no element is identified as a device';
  }
  let quiet = null;
  if (z.text && L3.busy3x3) {
    const cells = cellsOf(z.text).map(([r, c]) => ({ r, c, busy: L3.busy3x3[r][c] }));
    quiet = { box: boxOf(z.text), busy: Math.max(...cells.map((c) => c.busy)), cells };
    why.quiet = 'the busy3x3 cells (edge energy 0-100) the text zone overlaps; busy = the busiest of them';
  } else why.quiet = z.text ? 'no pixel pass (no busyness grid)' : 'no text zone';
  const pics = all
    .filter((e) => IMAGE_ROLES.includes(e.role))
    .sort((a, b) => (b.areaPct ?? 0) - (a.areaPct ?? 0));
  let image = null;
  if (pics.length) {
    const p = pics[0];
    const t = byId.get(p.id).treatment ?? null;
    image = {
      id: p.id,
      treatment: t,
      bleed: p.bleed || p.raw.bleed || [],
      mask: p.raw.mask || (p.raw.transparent ? null : 'rect'),
      faces: null,
    };
    why.image = `the largest picture (${p.id}, ${p.role}); treatment by the image-treatment chain; mask from its clip / radius${
      image.mask === null ? ' (none: its outline is its own transparency)' : ''
    }; faces: no measurement gives it (no model in the pipeline)`;
  } else why.image = 'no element is a picture';

  const numerals = all.filter((e) => e.role === 'big-number');
  const weightRuns = texts.filter((e) =>
    (e.raw.runWeights || []).some((w) => w > Number(e.raw.weight ?? 400)),
  );
  const colourFields = all.filter((e) => e.role === 'panel');
  const ttb = hierarchy.titleToBody;
  const carrier = numerals.length
    ? 'numeral'
    : weightRuns.length
      ? 'weight-run'
      : colourFields.length
        ? 'colour-field'
        : ttb !== null && ttb >= SIZE_EMPHASIS
          ? 'size'
          : null;
  const emphasis = {
    carrier,
    measurement: {
      numerals: numerals.length,
      weightRuns: weightRuns.length,
      colourFields: colourFields.length,
      titleToBody: ttb,
    },
  };
  why.emphasis =
    'first that holds: a big-number (numeral), a run set heavier than its text (weight-run), a panel holding text ' +
    `(colour-field), title >= ${SIZE_EMPHASIS}x body (size); else none`;
  const furniture = all
    .filter((e) => FURNITURE_PARTS.includes(e.raw.part) || e.furniture)
    .map((e) => ({ id: e.id, role: byId.get(e.id).role, anchor: anchorOf(e.bbox, margins) }));
  why.furniture =
    'the header parts k / src / ft / lg and the repeated objects, each with the margins it sits on';

  const rec = {
    schema: 'template/1',
    id,
    category: record.category?.term && nsOf(record.category.term) === 'E3' ? record.category.term : 'unknown',
    categoryWhy: record.category?.why ?? 'no rule of the kind chain holds',
    source: { ...source, shapeCode },
    elements,
    zones,
    margins: margins
      ? {
          left: margins.left,
          top: margins.top,
          right: margins.right,
          bottom: margins.bottom,
          open: margins.open,
        }
      : null,
    edges: L2.edges || [],
    mainEdge: L2.mainEdge ?? null,
    rhythm,
    hierarchy,
    balance,
    intent: { device, quiet, image, emphasis, furniture, why },
    needs: [],
    options,
    provenance,
  };
  if (composition) rec.composition = true;
  return rec;
}

/** Recursively sorted keys, numbers rounded to 2 decimals (deterministic output). */
export function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonical(v[k]);
    return out;
  }
  return r2(v);
}

/** The records file: sorted keys, one record per line (compact, diffable). */
export function stringifyRecords(records, source = null) {
  const lines = records.map((r) => JSON.stringify(canonical(r)));
  const tail = source ? `,"source":${JSON.stringify(canonical(source))}` : '';
  return `{"records":[\n${lines.join(',\n')}\n]${tail}}\n`;
}
