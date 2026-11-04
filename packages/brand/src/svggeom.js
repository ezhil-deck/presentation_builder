/**
 * SVG geometry for BR-CAPABILITIES / BR-CLAIMS (docs/P1-rules.md §A): what an SVG file paints, as polygons, read with
 * rules only (no renderer). Supported: rect (rounded corners flattened), circle / ellipse (as 48-gons), polygon,
 * polyline, line, path (M L H V Z absolute + relative; C S Q T A flattened into short straight pieces and the shape
 * flagged `approx: true`), <use> of an element by id, <g> nesting with inherited fill / stroke / fill-rule / color,
 * presentation attributes, `style` attributes and simple <style> rules (.class, #id, tag selectors), every affine
 * transform (matrix, translate, scale, rotate, skewX, skewY: exact), the viewBox -> box mapping with
 * preserveAspectRatio, and a clip-path whose clipPath is one rect. Anything else that changes what is painted (an
 * <image>, <text>, a mask, a filter, a pattern fill, any other clip path) is not modelled: the result says so in
 * `notes` and carries `approx: true`. Pure: text in, numbers out.
 */

const NS_SKIP = new Set([
  'defs',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'lineargradient',
  'radialgradient',
  'marker',
  'title',
  'desc',
  'metadata',
  'style',
  'filter',
  'script',
  'foreignobject',
]);
const CURVE_STEPS = 8; // straight pieces per Bezier curve
const ARC_STEP = Math.PI / 12; // 15 degrees per arc piece
const ELLIPSE_STEPS = 48;
const EPS = 1e-6;

// ---------- a small XML reader (elements, attributes, text) ----------

const TAG =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!(?:DOCTYPE|doctype)[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** Parse XML text into `{ name, attrs, children, text }` nodes; returns the root element (or null). */
export function parseXml(text) {
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let last = 0;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(text))) {
    const top = stack[stack.length - 1];
    const between = text.slice(last, m.index);
    if (between.trim()) top.text += decodeEntities(between);
    last = TAG.lastIndex;
    if (m[1] !== undefined) {
      top.text += m[1];
      continue;
    }
    if (!m[3]) continue; // comment, declaration, doctype
    const name = m[3];
    if (m[2] === '/') {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = {};
    ATTR.lastIndex = 0;
    let a;
    while ((a = ATTR.exec(m[4] ?? ''))) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { name, attrs, children: [], text: '' };
    top.children.push(node);
    if (m[5] !== '/') stack.push(node);
  }
  return root.children.find((c) => c.name.toLowerCase().endsWith('svg')) ?? root.children[0] ?? null;
}

// ---------- numbers, colours, transforms ----------

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function numbers(s) {
  return (String(s ?? '').match(NUM) ?? []).map(Number);
}

function length(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const m = String(v)
    .trim()
    .match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px)?$/i);
  return m ? Number(m[1]) : fallback;
}

const NAMED = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  navy: [0, 0, 128],
  olive: [128, 128, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  lime: [0, 255, 0],
  orange: [255, 165, 0],
};

/**
 * A CSS colour -> `{ rgb: [r, g, b], alpha }`, `{ none: true }` (none / transparent), `{ current: true }`
 * (currentColor), `{ ref: id }` (url(#id)) or null when it cannot be read.
 */
export function parseColour(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (v === '') return null;
  const lower = v.toLowerCase();
  if (lower === 'none' || lower === 'transparent') return { none: true };
  if (lower === 'currentcolor') return { current: true };
  const ref = v.match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/);
  if (ref) return { ref: ref[1] };
  let m = lower.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      const rgb = [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
      return { rgb, alpha: h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      return { rgb, alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  }
  m = lower.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const rgb = parts
      .slice(0, 3)
      .map((p) =>
        p.endsWith('%') ? Math.round((Number(p.slice(0, -1)) / 100) * 255) : Math.round(Number(p)),
      );
    if (!rgb.every(Number.isFinite)) return null;
    let alpha = 1;
    if (parts[3] !== undefined)
      alpha = parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
    return { rgb: rgb.map((c) => Math.max(0, Math.min(255, c))), alpha: Number.isFinite(alpha) ? alpha : 1 };
  }
  if (NAMED[lower]) return { rgb: [...NAMED[lower]], alpha: 1 };
  return null;
}

export const hexOf = (rgb) =>
  `#${rgb
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** a ∘ b: apply b first, then a. Matrices are [a, b, c, d, e, f] as in SVG. */
export function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** An SVG transform list -> one matrix (every affine transform is exact). */
export function parseTransform(text) {
  let m = IDENTITY;
  if (!text) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(text))) {
    const n = numbers(t[2]);
    let op = IDENTITY;
    const rad = (deg) => (deg * Math.PI) / 180;
    switch (t[1]) {
      case 'matrix':
        if (n.length >= 6) op = n.slice(0, 6);
        break;
      case 'translate':
        op = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
        break;
      case 'scale':
        op = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = rad(n[0] ?? 0);
        const rot = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        if (n.length >= 3) {
          op = multiply([1, 0, 0, 1, n[1], n[2]], multiply(rot, [1, 0, 0, 1, -n[1], -n[2]]));
        } else op = rot;
        break;
      }
      case 'skewX':
        op = [1, 0, Math.tan(rad(n[0] ?? 0)), 1, 0, 0];
        break;
      case 'skewY':
        op = [1, Math.tan(rad(n[0] ?? 0)), 0, 1, 0, 0];
        break;
      default:
        break;
    }
    m = multiply(m, op);
  }
  return m;
}

// ---------- paths ----------

function cubic(p0, p1, p2, p3, out) {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(p0, p1, p2, out) {
  for (let i = 1; i <= CURVE_STEPS; i += 1) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    out.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
}

/** SVG arc (endpoint form) flattened into points after p0 (SVG 1.1 F.6.5 / F.6.6). */
function arc(p0, rx, ry, phiDeg, largeArc, sweep, p1, out) {
  if (Math.abs(p0[0] - p1[0]) < EPS && Math.abs(p0[1] - p1[1]) < EPS) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < EPS || ry < EPS) {
    out.push([p1[0], p1[1]]);
    return;
  }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (Boolean(largeArc) === Boolean(sweep)) coef = -coef;
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const angle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(dt) / ARC_STEP));
  for (let i = 1; i <= steps; i += 1) {
    const t = t1 + (dt * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push(i === steps ? [p1[0], p1[1]] : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
}

/**
 * Parse path data into subpaths `{ points: [[x,y]...], curve: [bool per edge i (points[i] -> points[i+1])],
 * closed }` and `approx` (true when any C S Q T A command was flattened).
 */
export function parsePath(d) {
  const tokens =
    String(d ?? '').match(/[MmLlHhVvZzCcSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subpaths = [];
  let approx = false;
  let i = 0;
  let cmd = null;
  let cur = [0, 0];
  let start = [0, 0];
  let sub = null;
  let lastCtrl = null; // for S / T reflection
  let lastCmd = null;
  const isCmd = (t) => /^[A-Za-z]$/.test(t);
  const num = () => Number(tokens[i++]);
  const has = (n) => {
    for (let k = 0; k < n; k += 1) if (i + k >= tokens.length || isCmd(tokens[i + k])) return false;
    return true;
  };
  const begin = (p) => {
    sub = { points: [[p[0], p[1]]], curve: [], closed: false };
    subpaths.push(sub);
  };
  const lineTo = (p, curve = false) => {
    if (!sub) begin(cur);
    sub.points.push([p[0], p[1]]);
    sub.curve.push(curve);
  };
  const pushMany = (pts) => {
    for (const p of pts) lineTo(p, true);
  };
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    else if (cmd === null) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const base = rel ? cur : [0, 0];
    if (C === 'Z') {
      if (sub) {
        sub.closed = true;
        const last = sub.points[sub.points.length - 1];
        if (Math.abs(last[0] - start[0]) > EPS || Math.abs(last[1] - start[1]) > EPS) {
          sub.points.push([start[0], start[1]]);
          sub.curve.push(false);
        }
      }
      cur = [start[0], start[1]];
      sub = null;
      lastCtrl = null;
      lastCmd = 'Z';
      continue;
    }
    if (C === 'M') {
      if (!has(2)) break;
      const p = [base[0] + num(), base[1] + num()];
      cur = p;
      start = p;
      begin(p);
      cmd = rel ? 'l' : 'L'; // following pairs are line-tos
      lastCtrl = null;
      lastCmd = 'M';
      continue;
    }
    if (C === 'L') {
      if (!has(2)) break;
      const p = [base[0] + num(), base[1] + num()];
      lineTo(p);
      cur = p;
    } else if (C === 'H') {
      if (!has(1)) break;
      const p = [(rel ? cur[0] : 0) + num(), cur[1]];
      lineTo(p);
      cur = p;
    } else if (C === 'V') {
      if (!has(1)) break;
      const p = [cur[0], (rel ? cur[1] : 0) + num()];
      lineTo(p);
      cur = p;
    } else if (C === 'C' || C === 'S') {
      if (!has(C === 'C' ? 6 : 4)) break;
      approx = true;
      let c1;
      if (C === 'C') c1 = [base[0] + num(), base[1] + num()];
      else
        c1 =
          lastCtrl && (lastCmd === 'C' || lastCmd === 'S')
            ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]]
            : [cur[0], cur[1]];
      const c2 = [base[0] + num(), base[1] + num()];
      const p = [base[0] + num(), base[1] + num()];
      const pts = [];
      cubic(cur, c1, c2, p, pts);
      pushMany(pts);
      lastCtrl = c2;
      cur = p;
      lastCmd = C;
      continue;
    } else if (C === 'Q' || C === 'T') {
      if (!has(C === 'Q' ? 4 : 2)) break;
      approx = true;
      let c1;
      if (C === 'Q') c1 = [base[0] + num(), base[1] + num()];
      else
        c1 =
          lastCtrl && (lastCmd === 'Q' || lastCmd === 'T')
            ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]]
            : [cur[0], cur[1]];
      const p = [base[0] + num(), base[1] + num()];
      const pts = [];
      quad(cur, c1, p, pts);
      pushMany(pts);
      lastCtrl = c1;
      cur = p;
      lastCmd = C;
      continue;
    } else if (C === 'A') {
      // flags may be written without separators ("a1 1 0 01-2 0"): read them one character at a time
      if (!has(1)) break;
      const rx = num();
      const ry = num();
      const rot = num();
      const flag = () => {
        const t = tokens[i];
        if (t === undefined) return NaN;
        if (/^[01]$/.test(t)) {
          i += 1;
          return Number(t);
        }
        if (/^[01]/.test(t)) {
          tokens[i] = t.slice(1);
          return Number(t[0]);
        }
        i += 1;
        return Number(t);
      };
      const large = flag();
      const sweep = flag();
      const p = [base[0] + num(), base[1] + num()];
      if (![rx, ry, rot, large, sweep, ...p].every(Number.isFinite)) break;
      approx = true;
      const pts = [];
      arc(cur, rx, ry, rot, large, sweep, p, pts);
      pushMany(pts);
      cur = p;
      lastCtrl = null;
      lastCmd = 'A';
      continue;
    } else {
      i += 1; // unknown token
    }
    lastCtrl = null;
    lastCmd = C;
  }
  return { subpaths: subpaths.filter((s) => s.points.length > 1), approx };
}

// ---------- shapes ----------

function ellipsePoints(cx, cy, rx, ry) {
  const pts = [];
  for (let k = 0; k <= ELLIPSE_STEPS; k += 1) {
    const t = (2 * Math.PI * k) / ELLIPSE_STEPS;
    pts.push(k === ELLIPSE_STEPS ? [...pts[0]] : [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return { points: pts, curve: pts.slice(1).map(() => true), closed: true };
}

function rectSubpath(x, y, w, h, rx, ry) {
  if (rx <= 0 && ry <= 0) {
    return {
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ],
      curve: [false, false, false, false],
      closed: true,
    };
  }
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  const pts = [[x + rx, y]];
  const curve = [];
  const corner = (cx, cy, a0) => {
    for (let k = 1; k <= 6; k += 1) {
      const t = a0 + (Math.PI / 2) * (k / 6);
      pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
      curve.push(true);
    }
  };
  pts.push([x + w - rx, y]);
  curve.push(false);
  corner(x + w - rx, y + ry, -Math.PI / 2);
  pts.push([x + w, y + h - ry]);
  curve.push(false);
  corner(x + w - rx, y + h - ry, 0);
  pts.push([x + rx, y + h]);
  curve.push(false);
  corner(x + rx, y + h - ry, Math.PI / 2);
  pts.push([x, y + ry]);
  curve.push(false);
  corner(x + rx, y + ry, Math.PI);
  return { points: pts, curve, closed: true };
}

function pointList(s) {
  const n = numbers(s);
  const pts = [];
  for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]);
  return pts;
}

/** The subpaths of one element (in its own user space) or null when it is not a basic shape. */
function elementGeometry(node) {
  const a = node.attrs;
  const tag = node.name.toLowerCase();
  if (tag === 'path') return parsePath(a.d);
  if (tag === 'rect') {
    const w = length(a.width);
    const h = length(a.height);
    if (w <= 0 || h <= 0) return { subpaths: [], approx: false };
    return {
      subpaths: [rectSubpath(length(a.x), length(a.y), w, h, length(a.rx, 0), length(a.ry, 0))],
      approx: false,
    };
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = tag === 'circle' ? length(a.r) : length(a.rx);
    const ry = tag === 'circle' ? length(a.r) : length(a.ry);
    if (rx <= 0 || ry <= 0) return { subpaths: [], approx: false };
    return { subpaths: [ellipsePoints(length(a.cx), length(a.cy), rx, ry)], approx: false };
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = pointList(a.points);
    if (pts.length < 2) return { subpaths: [], approx: false };
    const closed = tag === 'polygon';
    if (closed) pts.push([...pts[0]]);
    return { subpaths: [{ points: pts, curve: pts.slice(1).map(() => false), closed }], approx: false };
  }
  if (tag === 'line') {
    const pts = [
      [length(a.x1), length(a.y1)],
      [length(a.x2), length(a.y2)],
    ];
    return { subpaths: [{ points: pts, curve: [false], closed: false }], approx: false };
  }
  return null;
}

// ---------- styles ----------

const PAINT_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'fill-rule',
  'color',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'display',
  'visibility',
  'stop-color',
  'stop-opacity',
  'clip-path',
  'mask',
  'filter',
];
const INHERITED = [
  'fill',
  'stroke',
  'stroke-width',
  'fill-rule',
  'color',
  'fill-opacity',
  'stroke-opacity',
  'visibility',
];

function parseDecls(text) {
  const out = {};
  for (const part of String(text ?? '').split(';')) {
    const k = part.indexOf(':');
    if (k < 0) continue;
    const key = part.slice(0, k).trim().toLowerCase();
    const value = part
      .slice(k + 1)
      .replace(/!important/i, '')
      .trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Simple <style> rules: [{ sel: '.a' | '#b' | 'path', decls }]. Compound / descendant selectors are skipped. */
function styleRules(root) {
  const rules = [];
  let skipped = 0;
  const walk = (n) => {
    if (n.name.toLowerCase() === 'style') {
      const css = n.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const decls = parseDecls(m[2]);
        for (const raw of m[1].split(',')) {
          const sel = raw.trim();
          if (/^[.#]?[A-Za-z_][\w-]*$/.test(sel)) rules.push({ sel, decls });
          else if (sel) skipped += 1;
        }
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return { rules, skipped };
}

function ownStyle(node, rules) {
  const style = {};
  const a = node.attrs;
  for (const p of PAINT_PROPS) if (a[p] !== undefined) style[p] = a[p];
  const classes = String(a.class ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const tag = node.name.toLowerCase();
  for (const r of rules) {
    if (
      r.sel === tag ||
      (r.sel[0] === '.' && classes.includes(r.sel.slice(1))) ||
      (r.sel[0] === '#' && a.id === r.sel.slice(1))
    )
      Object.assign(style, r.decls);
  }
  Object.assign(style, parseDecls(a.style));
  return style;
}

function indexIds(root) {
  const ids = new Map();
  const walk = (n) => {
    if (n.attrs.id !== undefined && !ids.has(n.attrs.id)) ids.set(n.attrs.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return ids;
}

// ---------- the document ----------

/**
 * Parse an SVG text: `{ viewBox: {x,y,w,h} | null, width, height, preserveAspectRatio: {align, meetOrSlice},
 * shapes, approx, notes, gradients }`. Every shape is in the root's user space (viewBox units) with
 * `{ tag, id?, subpaths: [{points, curve, closed}], fill, stroke, strokeWidth, fillRule, opacity, approx }` where
 * fill / stroke are parseColour() results (null = not painted). `gradients`: id -> [colour of each stop].
 */
export function parseSvg(text) {
  const root = parseXml(String(text ?? ''));
  const empty = {
    viewBox: null,
    width: null,
    height: null,
    preserveAspectRatio: { align: 'xMidYMid', meetOrSlice: 'meet' },
    shapes: [],
    approx: true,
    notes: ['not an SVG document'],
    gradients: {},
  };
  if (!root || !root.name.toLowerCase().endsWith('svg')) return empty;
  const a = root.attrs;
  const vb = numbers(a.viewBox ?? a.viewbox);
  const width =
    a.width !== undefined && /%/.test(a.width) ? null : a.width !== undefined ? length(a.width, null) : null;
  const height =
    a.height !== undefined && /%/.test(a.height)
      ? null
      : a.height !== undefined
        ? length(a.height, null)
        : null;
  const viewBox =
    vb.length === 4 && vb[2] > 0 && vb[3] > 0
      ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
      : width && height
        ? { x: 0, y: 0, w: width, h: height }
        : null;
  const parTokens = String(a.preserveAspectRatio ?? 'xMidYMid meet')
    .trim()
    .split(/\s+/);
  const preserveAspectRatio = {
    align: parTokens[0] === 'defer' ? (parTokens[1] ?? 'xMidYMid') : (parTokens[0] ?? 'xMidYMid'),
    meetOrSlice: parTokens.includes('slice') ? 'slice' : 'meet',
  };
  const { rules, skipped } = styleRules(root);
  const ids = indexIds(root);
  const notes = new Set();
  if (skipped) notes.add(`${skipped} <style> selector(s) not read (only .class, #id and tag selectors are)`);
  const shapes = [];
  const gradients = {};

  // gradient stop colours (href inheritance followed once)
  const stopsOf = (node, depth = 0) => {
    const own = node.children.filter((c) => c.name.toLowerCase() === 'stop');
    if (own.length || depth > 3) return own;
    const href = node.attrs.href ?? node.attrs['xlink:href'];
    const target = href && href.startsWith('#') ? ids.get(href.slice(1)) : null;
    return target ? stopsOf(target, depth + 1) : [];
  };
  for (const [id, node] of ids) {
    const tag = node.name.toLowerCase();
    if (tag !== 'lineargradient' && tag !== 'radialgradient') continue;
    gradients[id] = stopsOf(node)
      .map((s) => parseColour(ownStyle(s, rules)['stop-color'] ?? 'black'))
      .filter((c) => c && c.rgb);
  }

  const visit = (node, ctm, inherited, opacity, clip, depth) => {
    if (depth > 32) return;
    const tag = node.name.toLowerCase().replace(/^svg:/, '');
    const style = ownStyle(node, rules);
    if (style.display === 'none') return;
    const state = { ...inherited };
    for (const p of INHERITED) if (style[p] !== undefined && style[p] !== 'inherit') state[p] = style[p];
    const op = style.opacity !== undefined ? Number(style.opacity) : 1;
    const nextOpacity = opacity * (Number.isFinite(op) ? op : 1);
    let m = node.attrs.transform ? multiply(ctm, parseTransform(node.attrs.transform)) : ctm;
    let nextClip = clip;
    if (style['clip-path'] && style['clip-path'] !== 'none') {
      const id = (style['clip-path'].match(/#([^'")\s]+)/) ?? [])[1];
      const cp = id ? ids.get(id) : null;
      const kids = (cp?.children ?? []).filter((c) => !['title', 'desc'].includes(c.name.toLowerCase()));
      const axisAligned = Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS;
      if (
        cp &&
        kids.length === 1 &&
        kids[0].name.toLowerCase() === 'rect' &&
        !kids[0].attrs.transform &&
        (cp.attrs.clipPathUnits ?? 'userSpaceOnUse') === 'userSpaceOnUse' &&
        axisAligned
      ) {
        const r = kids[0].attrs;
        const p0 = apply(m, [length(r.x), length(r.y)]);
        const p1 = apply(m, [length(r.x) + length(r.width), length(r.y) + length(r.height)]);
        const rect = {
          x0: Math.min(p0[0], p1[0]),
          y0: Math.min(p0[1], p1[1]),
          x1: Math.max(p0[0], p1[0]),
          y1: Math.max(p0[1], p1[1]),
        };
        nextClip = clip
          ? {
              x0: Math.max(clip.x0, rect.x0),
              y0: Math.max(clip.y0, rect.y0),
              x1: Math.min(clip.x1, rect.x1),
              y1: Math.min(clip.y1, rect.y1),
            }
          : rect;
      } else {
        notes.add('a clip-path other than one rect is not applied');
      }
    }
    if (style.mask && style.mask !== 'none') notes.add('a mask is not applied');
    if (style.filter && style.filter !== 'none') notes.add('a filter is not applied');

    if (tag === 'use') {
      const href = node.attrs.href ?? node.attrs['xlink:href'];
      const target = href && href.startsWith('#') ? ids.get(href.slice(1)) : null;
      if (!target) {
        notes.add('a <use> whose target is not in the file is not measured');
        return;
      }
      m = multiply(m, [1, 0, 0, 1, length(node.attrs.x), length(node.attrs.y)]);
      visit(target, m, state, nextOpacity, nextClip, depth + 1);
      return;
    }
    if (tag === 'image') {
      notes.add('an embedded <image> is not measured');
      return;
    }
    if (tag === 'text') {
      notes.add('<text> is not measured');
      return;
    }
    if (NS_SKIP.has(tag)) return;
    const geom = elementGeometry({ ...node, name: tag });
    if (geom) {
      if (state.visibility === 'hidden') return;
      const resolve = (value) => {
        const c = parseColour(value);
        if (c?.current) return parseColour(state.color ?? 'black');
        return c;
      };
      const fill = resolve(state.fill ?? 'black');
      const stroke = resolve(state.stroke ?? 'none');
      const strokeWidth = length(state['stroke-width'], 1);
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      const subpaths = geom.subpaths.map((s) => ({
        points: s.points.map((p) => apply(m, p)),
        curve: [...s.curve],
        closed: s.closed,
      }));
      if (tag === 'line' || tag === 'polyline') {
        // never filled as an area when open lines (a polyline's fill closes it; keep it but the line has none)
        if (tag === 'line') subpaths.forEach((s) => (s.fillable = false));
      }
      let shape = {
        tag,
        ...(node.attrs.id !== undefined ? { id: node.attrs.id } : {}),
        subpaths,
        fill: fill && !fill.none ? fill : null,
        stroke: stroke && !stroke.none && strokeWidth > 0 ? stroke : null,
        strokeWidth: strokeWidth * scale,
        fillRule: state['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
        opacity: nextOpacity,
        approx: geom.approx,
      };
      if (tag === 'line') shape.fill = null;
      if (shape.fill?.ref || shape.stroke?.ref) {
        const g = gradients[shape.fill?.ref ?? shape.stroke?.ref];
        if (!g) notes.add('a pattern / unknown paint server fill is not measured');
      }
      if (nextClip) shape = clipShape(shape, nextClip);
      if (shape.subpaths.length && (shape.fill || shape.stroke)) shapes.push(shape);
      return;
    }
    for (const c of node.children) visit(c, m, state, nextOpacity, nextClip, depth + 1);
  };

  const rootStyle = ownStyle(root, rules);
  const init = {};
  for (const p of INHERITED) if (rootStyle[p] !== undefined) init[p] = rootStyle[p];
  for (const c of root.children) visit(c, IDENTITY, init, 1, null, 0);

  const approx = shapes.some((s) => s.approx) || notes.size > 0;
  return {
    viewBox,
    width,
    height,
    preserveAspectRatio,
    shapes,
    approx,
    notes: [...notes].sort(),
    gradients,
  };
}

// ---------- mapping, clipping ----------

/**
 * The matrix from the SVG's user space (viewBox) to a box `{x, y, w, h}` honouring preserveAspectRatio
 * (`none` stretches; meet / slice scale uniformly and align by xMin / xMid / xMax, YMin / YMid / YMax).
 */
export function viewportMatrix(doc, box) {
  const vb = doc.viewBox ?? { x: 0, y: 0, w: box.w, h: box.h };
  const par = doc.preserveAspectRatio ?? { align: 'xMidYMid', meetOrSlice: 'meet' };
  let sx = box.w / vb.w;
  let sy = box.h / vb.h;
  let tx = box.x - vb.x * sx;
  let ty = box.y - vb.y * sy;
  if (par.align !== 'none') {
    const s = par.meetOrSlice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const extraX = box.w - vb.w * s;
    const extraY = box.h - vb.h * s;
    const ax = /xMin/.test(par.align) ? 0 : /xMax/.test(par.align) ? 1 : 0.5;
    const ay = /YMin/.test(par.align) ? 0 : /YMax/.test(par.align) ? 1 : 0.5;
    sx = s;
    sy = s;
    tx = box.x + extraX * ax - vb.x * s;
    ty = box.y + extraY * ay - vb.y * s;
  }
  return [sx, 0, 0, sy, tx, ty];
}

/** The viewport rect (in user space) of a parsed SVG: the viewBox. */
export function viewportRect(doc) {
  const vb = doc.viewBox;
  return vb ? { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h } : null;
}

export function transformShape(shape, m) {
  const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  return {
    ...shape,
    strokeWidth: shape.strokeWidth * scale,
    subpaths: shape.subpaths.map((s) => ({ ...s, points: s.points.map((p) => apply(m, p)) })),
  };
}

function clipEdge(points, inside, intersect) {
  const out = [];
  for (let k = 0; k < points.length; k += 1) {
    const cur = points[k];
    const prev = points[(k + points.length - 1) % points.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci) {
      if (!pi) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (pi) out.push(intersect(prev, cur));
  }
  return out;
}

/** Sutherland-Hodgman: one closed polygon (no repeated last point) clipped to a rect. */
export function clipPolygon(points, r) {
  let pts = points;
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const sides = [
    [(p) => p[0] >= r.x0 - EPS, (p, q) => lerp(p, q, (r.x0 - p[0]) / (q[0] - p[0]))],
    [(p) => p[0] <= r.x1 + EPS, (p, q) => lerp(p, q, (r.x1 - p[0]) / (q[0] - p[0]))],
    [(p) => p[1] >= r.y0 - EPS, (p, q) => lerp(p, q, (r.y0 - p[1]) / (q[1] - p[1]))],
    [(p) => p[1] <= r.y1 + EPS, (p, q) => lerp(p, q, (r.y1 - p[1]) / (q[1] - p[1]))],
  ];
  for (const [inside, intersect] of sides) {
    if (!pts.length) break;
    pts = clipEdge(pts, inside, intersect);
  }
  return pts;
}

const onRectSide = (p, q, r) =>
  (Math.abs(p[0] - r.x0) < 1e-4 && Math.abs(q[0] - r.x0) < 1e-4) ||
  (Math.abs(p[0] - r.x1) < 1e-4 && Math.abs(q[0] - r.x1) < 1e-4) ||
  (Math.abs(p[1] - r.y0) < 1e-4 && Math.abs(q[1] - r.y0) < 1e-4) ||
  (Math.abs(p[1] - r.y1) < 1e-4 && Math.abs(q[1] - r.y1) < 1e-4);

/**
 * A shape clipped to a rect: filled subpaths as polygons (edges the clip made are marked `clip`), open (stroke-only)
 * subpaths kept when any point is inside. Edge flags: `curve` from the path, `clip` for cut edges.
 */
export function clipShape(shape, r) {
  const subpaths = [];
  for (const s of shape.subpaths) {
    const pts = s.points.slice();
    const closedLoop =
      pts.length > 2 &&
      Math.abs(pts[0][0] - pts[pts.length - 1][0]) < EPS &&
      Math.abs(pts[0][1] - pts[pts.length - 1][1]) < EPS;
    const allInside = pts.every(
      (p) => p[0] >= r.x0 - EPS && p[0] <= r.x1 + EPS && p[1] >= r.y0 - EPS && p[1] <= r.y1 + EPS,
    );
    if (allInside) {
      subpaths.push({ ...s, clip: s.curve.map(() => false) });
      continue;
    }
    if (!shape.fill || s.fillable === false) {
      if (pts.some((p) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1))
        subpaths.push({ ...s, clip: s.curve.map(() => false) });
      continue;
    }
    // polygon clip: keep curve flags only roughly (an edge is "curve" when it came from a flattened curve)
    const ring = closedLoop ? pts.slice(0, -1) : pts;
    const curveOf = new Map();
    ring.forEach((p, k) => curveOf.set(`${p[0]},${p[1]}`, s.curve[k] ?? false));
    const clipped = clipPolygon(ring, r);
    if (clipped.length < 3) continue;
    const closedPts = [...clipped, [...clipped[0]]];
    const curve = [];
    const clipFlags = [];
    for (let k = 0; k + 1 < closedPts.length; k += 1) {
      const p = closedPts[k];
      const q = closedPts[k + 1];
      const isClip = onRectSide(p, q, r);
      clipFlags.push(isClip);
      curve.push(!isClip && (curveOf.get(`${p[0]},${p[1]}`) ?? false));
    }
    subpaths.push({ points: closedPts, curve, closed: true, clip: clipFlags });
  }
  return { ...shape, subpaths };
}

// ---------- measures ----------

/** Shoelace area (absolute) of a closed point list. */
export function polygonArea(points) {
  let s = 0;
  for (let k = 0; k < points.length; k += 1) {
    const p = points[k];
    const q = points[(k + 1) % points.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

/** Winding number of `p` around a closed ring. */
function winding(ring, p) {
  let wn = 0;
  const n = ring.length;
  for (let k = 0; k < n; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % n];
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) > 0) wn += 1;
    } else if (b[1] <= p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) < 0) wn -= 1;
  }
  return wn;
}

/** Is `p` inside a single polygon (point list, closed implicitly)? Nonzero rule. */
export function pointInPolygon(points, p) {
  return winding(points, p) !== 0;
}

function segDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(p[0] - x, p[1] - y);
}

export function distanceToSegment(p, a, b) {
  return segDistance(p, a, b);
}

/** Bounding box `{x, y, w, h}` of every point of the shapes (null when none). */
export function shapesBbox(shapes) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const pad = s.stroke ? s.strokeWidth / 2 : 0;
    for (const sp of s.subpaths)
      for (const [x, y] of sp.points) {
        x0 = Math.min(x0, x - pad);
        y0 = Math.min(y0, y - pad);
        x1 = Math.max(x1, x + pad);
        y1 = Math.max(y1, y + pad);
      }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function prepared(shape) {
  if (shape._prep) return shape._prep;
  const rings = shape.subpaths
    .filter((s) => s.fillable !== false)
    .map((s) => {
      const pts = s.points;
      const closed =
        pts.length > 1 &&
        Math.abs(pts[0][0] - pts[pts.length - 1][0]) < EPS &&
        Math.abs(pts[0][1] - pts[pts.length - 1][1]) < EPS;
      return closed ? pts.slice(0, -1) : pts;
    })
    .filter((r) => r.length >= 3)
    .map((pts) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      return { pts, x0, y0, x1, y1 };
    });
  const bbox = shapesBbox([shape]);
  const prep = { rings, bbox };
  Object.defineProperty(shape, '_prep', { value: prep, enumerable: false });
  return prep;
}

/** Is `p` painted by `shape` (its fill by its fill rule, or within half its stroke width of an edge)? */
export function paints(shape, p) {
  const { rings, bbox } = prepared(shape);
  if (
    !bbox ||
    p[0] < bbox.x - EPS ||
    p[0] > bbox.x + bbox.w + EPS ||
    p[1] < bbox.y - EPS ||
    p[1] > bbox.y + bbox.h + EPS
  )
    return false;
  if (shape.fill && rings.length) {
    let total = 0;
    let crossings = 0;
    for (const ring of rings) {
      // a ring whose box does not hold p has winding 0 around it
      if (p[0] < ring.x0 || p[0] > ring.x1 || p[1] < ring.y0 || p[1] > ring.y1) continue;
      const w = winding(ring.pts, p);
      total += w;
      crossings += Math.abs(w) % 2;
    }
    if (shape.fillRule === 'evenodd' ? crossings % 2 === 1 : total !== 0) return true;
  }
  if (shape.stroke) {
    const half = shape.strokeWidth / 2;
    for (const sp of shape.subpaths)
      for (let k = 0; k + 1 < sp.points.length; k += 1)
        if (segDistance(p, sp.points[k], sp.points[k + 1]) <= half) return true;
  }
  return false;
}

/** Every straight edge of the shapes `{a, b, curve, clip}` (stroke-only lines included). */
export function edges(shapes) {
  const out = [];
  for (const s of shapes)
    for (const sp of s.subpaths)
      for (let k = 0; k + 1 < sp.points.length; k += 1)
        out.push({
          a: sp.points[k],
          b: sp.points[k + 1],
          curve: Boolean(sp.curve[k]),
          clip: Boolean(sp.clip?.[k]),
        });
  return out;
}

/** Distance from `p` to the nearest painted edge (curve pieces included, clip edges left out). */
export function distanceToEdges(p, shapes) {
  let best = Infinity;
  for (const e of edges(shapes)) {
    if (e.clip) continue;
    best = Math.min(best, segDistance(p, e.a, e.b));
  }
  return best;
}

/**
 * The non-axis angles of the straight edges (curve and clip pieces left out) at least `minLength` long, folded to
 * 0-90 degrees from horizontal and rounded to `step` (0.5): sorted, distinct; 0 and 90 are axis edges and left out.
 */
export function edgeAngles(shapes, { minLength = 0, step = 0.5 } = {}) {
  const set = new Set();
  for (const e of edges(shapes)) {
    if (e.curve || e.clip) continue;
    const dx = Math.abs(e.b[0] - e.a[0]);
    const dy = Math.abs(e.b[1] - e.a[1]);
    if (Math.hypot(dx, dy) < Math.max(minLength, EPS)) continue;
    const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI / step) * step;
    if (deg <= 0 || deg >= 90) continue;
    set.add(deg);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Point-sample the shapes over `rect` {x, y, w, h} on a grid of at most `samples` points along the long side
 * (cell centres). Returns { cols, rows, paintedShare, bbox (of painted cells' centres, padded by half a cell),
 * colours: the topmost painted shape's fill / stroke colour per painted cell (null when not a plain colour) }.
 */
export function sample(shapes, rect, { samples = 160 } = {}) {
  const long = Math.max(rect.w, rect.h);
  const cell = long / samples;
  const cols = Math.max(1, Math.round(rect.w / cell));
  const rows = Math.max(1, Math.round(rect.h / cell));
  const cw = rect.w / cols;
  const ch = rect.h / rows;
  let painted = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const colours = [];
  for (let r = 0; r < rows; r += 1) {
    const y = rect.y + (r + 0.5) * ch;
    for (let c = 0; c < cols; c += 1) {
      const x = rect.x + (c + 0.5) * cw;
      for (let k = shapes.length - 1; k >= 0; k -= 1) {
        const s = shapes[k];
        if (!paints(s, [x, y])) continue;
        painted += 1;
        x0 = Math.min(x0, x - cw / 2);
        y0 = Math.min(y0, y - ch / 2);
        x1 = Math.max(x1, x + cw / 2);
        y1 = Math.max(y1, y + ch / 2);
        const paint = s.fill ?? s.stroke;
        colours.push(paint?.rgb ? paint.rgb : null);
        break;
      }
    }
  }
  return {
    cols,
    rows,
    paintedShare: painted / (cols * rows),
    bbox: Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null,
    colours,
  };
}

/**
 * The painted geometry of an SVG mapped into `box` ({x, y, w, h}; default: the viewBox itself), clipped to the
 * viewport: `{ shapes, bbox, areaShare (painted share of the box), angles, approx, notes, viewBox }`.
 */
export function geometry(doc, box, { minAngleEdge = 0, samples = 160 } = {}) {
  const vb = doc.viewBox;
  const target = box ?? (vb ? { x: vb.x, y: vb.y, w: vb.w, h: vb.h } : null);
  if (!target || !vb) {
    return {
      shapes: [],
      bbox: null,
      areaShare: null,
      angles: [],
      approx: true,
      notes: [...doc.notes, 'no viewBox or size'],
    };
  }
  const m = viewportMatrix(doc, target);
  const vr = viewportRect(doc);
  const shapes = doc.shapes
    .map((s) => clipShape(s, vr))
    .filter((s) => s.subpaths.length)
    .map((s) => transformShape(s, m));
  const s = sample(shapes, target, { samples });
  return {
    shapes,
    bbox: shapesBbox(shapes),
    areaShare: s.paintedShare,
    angles: edgeAngles(shapes, { minLength: minAngleEdge }),
    approx: doc.approx,
    notes: doc.notes,
    viewBox: vb,
  };
}

/** Every colour an SVG paints: fills and strokes of its shapes, and the stops of the gradients they name. */
export function paintedColours(doc) {
  const out = [];
  const seen = new Set();
  const add = (c, where) => {
    if (!c?.rgb) return;
    const hex = hexOf(c.rgb);
    if (seen.has(hex)) return;
    seen.add(hex);
    out.push({ hex, rgb: c.rgb, where });
  };
  for (const s of doc.shapes) {
    for (const [paint, where] of [
      [s.fill, 'fill'],
      [s.stroke, 'stroke'],
    ]) {
      if (!paint) continue;
      if (paint.ref)
        for (const stop of doc.gradients[paint.ref] ?? []) add(stop, `${where} gradient #${paint.ref}`);
      else add(paint, where);
    }
  }
  return out;
}
