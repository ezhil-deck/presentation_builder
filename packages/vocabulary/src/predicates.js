/**
 * The predicate set the vocabulary's identification rules are written in (docs/PLAN-template-library.md §1.2).
 *
 * A rule is `{ id, order, when: [predicate, ...], why }`: every predicate of `when` must hold (AND). A predicate is an
 * object with exactly one key, its name; the value is its argument. The same set is implemented in Python by
 * `.claude/skills/slide-anatomy/scripts/vocabulary_rules.py`; `__tests__/python.test.js` runs both on every fixture.
 *
 * Subjects are plain records. Field values are read by name (dotted paths reach into objects: `termCount.label`).
 * Geometry is in % of the slide: `bbox` = [x0, y0, x1, y1] (x in % W, y in % H), `sizePctH` = the text size in % H.
 * `prepare()` (below) derives the standard fields every rule may use, so a measurement layer gives only what it
 * measured. Relational predicates (rank, stacked, nextTo, below, sibling*) read the other subjects of the same pass and
 * the terms already assigned to them: the evaluator runs the rules in order, each over every subject still unassigned
 * (identify.js), so "the largest free text" means "the largest text no earlier rule took".
 */

/** The value expressions a comparison may take as its right side. */
function valueOf(expr, subject, ctx) {
  if (typeof expr === 'number' || typeof expr === 'string' || typeof expr === 'boolean' || expr === null)
    return expr;
  if (expr && typeof expr === 'object') {
    if ('ctx' in expr) {
      const v = get(ctx, expr.ctx);
      if (v === undefined || v === null || v === 0) return undefined;
      return v * (expr.times ?? 1);
    }
    if ('field' in expr) {
      const v = get(subject, expr.field);
      if (v === undefined || v === null) return undefined;
      return v * (expr.times ?? 1);
    }
  }
  throw new Error(`vocabulary: bad value expression ${JSON.stringify(expr)}`);
}

/** Reads a dotted path. */
export function get(obj, path) {
  if (obj === undefined || obj === null) return undefined;
  if (!path.includes('.')) return obj[path];
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * A numeric comparison. `[field, expr]` or `[field, expr, missing]`: when the right side is missing (a context value
 * the slide does not have, e.g. no body size on a one-size slide) the comparison is `missing` ('pass' | 'fail',
 * default 'fail'). A missing left side always fails.
 */
function compare(op) {
  return (arg, s, ctx) => {
    const [field, expr, missing = 'fail'] = arg;
    const a = get(s, field);
    if (a === undefined || a === null || typeof a !== 'number') return false;
    const b = valueOf(expr, s, ctx);
    if (b === undefined) return missing === 'pass';
    if (op === 'gte') return a >= b;
    if (op === 'gt') return a > b;
    if (op === 'lte') return a <= b;
    return a < b;
  };
}

const truthy = (v) =>
  !(v === undefined || v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length));

/** Union box of a list of bboxes. */
const union = (bs) => [
  Math.min(...bs.map((b) => b[0])),
  Math.min(...bs.map((b) => b[1])),
  Math.max(...bs.map((b) => b[2])),
  Math.max(...bs.map((b) => b[3])),
];

/** Reading order inside one item: a box on the same row (vertical overlap >= half the lower box) reads left to right. */
export function readsBefore(a, b) {
  const ov = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const hmin = Math.min(a[3] - a[1], b[3] - b[1]);
  if (hmin > 0 && ov >= 0.5 * hmin) return a[0] < b[0];
  return a[1] < b[1] || (a[1] === b[1] && a[0] < b[0]);
}

const sameItem = (a, b) =>
  a !== b &&
  a.block !== undefined &&
  a.block !== null &&
  a.block === b.block &&
  a.item !== null &&
  a.item !== undefined &&
  a.item === b.item;

/**
 * The predicate set. `doc` and `args` are the documentation the generated page prints (docs/vocabulary.md);
 * `fn(arg, subject, ctx, pass)` decides. `pass` = { subjects, termOf(subject) -> {term, rule} | null (live), free(subject)
 * -> whether it was unassigned when the current rule began }.
 */
export const PREDICATES = {
  kind: {
    args: '[kinds]',
    doc: 'The subject kind is one of the list (text, image, shape, vectorgroup, region, line, group, chart, table, block, slide, structure, fill, ...).',
    fn: (arg, s) => arg.includes(s.kind),
  },
  has: {
    args: 'field',
    doc: 'The field is set and not false / 0 / empty.',
    fn: (arg, s) => truthy(get(s, arg)),
  },
  lacks: {
    args: 'field',
    doc: 'The field is unset, false, 0 or empty.',
    fn: (arg, s) => !truthy(get(s, arg)),
  },
  eq: {
    args: '[field, value]',
    doc: 'The field equals the value.',
    fn: (arg, s) => get(s, arg[0]) === arg[1],
  },
  in: {
    args: '[field, [values]]',
    doc: 'The field is one of the values.',
    fn: (arg, s) => arg[1].includes(get(s, arg[0])),
  },
  gte: { args: '[field, value | {ctx|field, times}, missing?]', doc: 'field >= value.', fn: compare('gte') },
  gt: { args: '[field, value | {ctx|field, times}, missing?]', doc: 'field > value.', fn: compare('gt') },
  lte: { args: '[field, value | {ctx|field, times}, missing?]', doc: 'field <= value.', fn: compare('lte') },
  lt: { args: '[field, value | {ctx|field, times}, missing?]', doc: 'field < value.', fn: compare('lt') },
  near: {
    args: '[field, value | {ctx|field, times}, tolerance]',
    doc: '|field - value| < tolerance (a missing right side fails).',
    fn: (arg, s, ctx) => {
      const a = get(s, arg[0]);
      const b = valueOf(arg[1], s, ctx);
      return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < arg[2];
    },
  },
  text: {
    args: 'pattern name',
    doc: "The subject's trimmed text matches the named pattern (vocabulary.json `patterns`).",
    fn: (arg, s, ctx) => typeof s.text === 'string' && ctx.patterns[arg].test(s.text.trim()),
  },
  notText: {
    args: 'pattern name',
    doc: 'The subject has no text, or its trimmed text does not match the named pattern.',
    fn: (arg, s, ctx) => !(typeof s.text === 'string' && ctx.patterns[arg].test(s.text.trim())),
  },
  match: {
    args: '[field, pattern name]',
    doc: "The named text field of the subject (e.g. a block's `labelText`) matches the named pattern.",
    fn: (arg, s, ctx) => {
      const v = get(s, arg[0]);
      return typeof v === 'string' && ctx.patterns[arg[1]].test(v.trim());
    },
  },
  any: {
    args: '[[predicates], [predicates], ...]',
    doc: 'At least one of the predicate lists holds as a whole (OR of ANDs).',
    fn: (arg, s, ctx, pass) => arg.some((all) => all.every((p) => test(p, s, ctx, pass))),
  },
  not: {
    args: 'predicate',
    doc: 'The predicate does not hold.',
    fn: (arg, s, ctx, pass) => !test(arg, s, ctx, pass),
  },
  rank: {
    args: '{by, among: {kind, minWords}, tol, tie: "top"}',
    doc: 'The subject is the one with the largest `by` among the subjects unassigned when the rule began that match `among` (a tie within `tol` goes to the topmost): one winner per pass.',
    fn: (arg, s, ctx, pass) => {
      const pool = pass.subjects.filter(
        (o) =>
          pass.free(o) &&
          (!arg.among.kind || arg.among.kind.includes(o.kind)) &&
          (o.words ?? 0) >= (arg.among.minWords ?? 0) &&
          typeof get(o, arg.by) === 'number',
      );
      if (!pool.includes(s)) return false;
      const top = Math.max(...pool.map((o) => get(o, arg.by)));
      const ties = pool.filter((o) => get(o, arg.by) >= top - (arg.tol ?? 0));
      ties.sort((a, b) => a.bbox[1] - b.bbox[1]);
      return ties[0] === s;
    },
  },
  stacked: {
    args: '{on: term, side: "below" | "above", gapTimesSize, edgeTol, centreTol, grow: [terms]}',
    doc: 'The subject sits directly below / above the subject assigned `on` (the first), on its left edge (within `edgeTol` % W) or centred alike when that one is centred (within `centreTol`), at a gap under `gapTimesSize` x its text size, and is smaller than it. With `grow`, the reference box below grows by each subject already assigned one of those terms (a subtitle stack).',
    fn: (arg, s, ctx, pass) => {
      const ref = pass.subjects.find((o) => pass.termOf(o)?.term === arg.on);
      if (!ref || ref === s || typeof s.sizePctH !== 'number' || !(s.sizePctH < ref.sizePctH)) return false;
      let tb = ref.bbox;
      if (arg.grow) {
        for (const o of pass.subjects) {
          const t = pass.termOf(o);
          if (o !== s && t && arg.grow.includes(t.term))
            tb = [tb[0], tb[1], Math.max(tb[2], o.bbox[2]), Math.max(tb[3], o.bbox[3])];
        }
      }
      const b = s.bbox;
      const nearX =
        Math.abs(b[0] - tb[0]) < arg.edgeTol ||
        (ref.align === 'centre' && Math.abs((b[0] + b[2]) / 2 - (tb[0] + tb[2]) / 2) < arg.centreTol);
      if (!nearX) return false;
      const gap = arg.side === 'below' ? b[1] - tb[3] : tb[1] - b[3];
      return gap >= 0 && gap < ref.sizePctH * arg.gapTimesSize;
    },
  },
  nextTo: {
    args: '{rule, below: {dy, dx}, right: {dx, dy}}',
    doc: "A subject the named rule identified lies just above-left of this one (this one's top within `below.dy` of its bottom, left edges within `below.dx`) or just left of it (this one's left within `right.dx` of its right edge, tops within `right.dy`).",
    fn: (arg, s, ctx, pass) => {
      const b = s.bbox;
      return pass.subjects.some((l) => {
        const t = pass.termOf(l);
        if (!t || t.rule !== arg.rule) return false;
        const lb = l.bbox;
        return (
          (Math.abs(b[1] - lb[3]) < arg.below.dy && Math.abs(b[0] - lb[0]) < arg.below.dx) ||
          (Math.abs(b[0] - lb[2]) < arg.right.dx && Math.abs(b[1] - lb[1]) < arg.right.dy)
        );
      });
    },
  },
  below: {
    args: '{kind: [kinds], minArea, gap, overlap}',
    doc: 'The subject sits directly under a subject of one of `kind` covering at least `minArea` % of the slide: its top within `gap` % H under that bottom, overlapping it horizontally by at least `overlap` x its own width.',
    fn: (arg, s, ctx, pass) => {
      const b = s.bbox;
      const w = b[2] - b[0];
      return pass.subjects.some((o) => {
        if (o === s || !arg.kind.includes(o.kind) || (o.areaPct ?? 0) < arg.minArea) return false;
        const g = b[1] - o.bbox[3];
        const ov = Math.min(b[2], o.bbox[2]) - Math.max(b[0], o.bbox[0]);
        return g >= -0.2 && g <= arg.gap && w > 0 && ov >= arg.overlap * w;
      });
    },
  },
  belowText: {
    args: '{pattern, gap, smaller}',
    doc: 'The subject sits directly under a text matching the named pattern: its top within `gap` % H under that bottom, overlapping it horizontally (with `smaller`, set smaller than it).',
    fn: (arg, s, ctx, pass) =>
      pass.subjects.some(
        (o) =>
          o !== s &&
          o.kind === 'text' &&
          typeof o.text === 'string' &&
          ctx.patterns[arg.pattern].test(o.text.trim()) &&
          (!arg.smaller ||
            (typeof s.sizePctH === 'number' && typeof o.sizePctH === 'number' && s.sizePctH < o.sizePctH)) &&
          s.bbox[1] - o.bbox[3] >= -0.2 &&
          s.bbox[1] - o.bbox[3] <= arg.gap &&
          Math.min(s.bbox[2], o.bbox[2]) - Math.max(s.bbox[0], o.bbox[0]) > 0,
      ),
  },
  sibling: {
    args: 'term',
    doc: 'Another field of the same item (same block and item index) has been assigned the term.',
    fn: (arg, s, ctx, pass) => pass.subjects.some((o) => sameItem(s, o) && pass.termOf(o)?.term === arg),
  },
  siblingBefore: {
    args: 'term',
    doc: 'A field of the same item that reads before this one (above it, or left of it on the same row) has been assigned the term.',
    fn: (arg, s, ctx, pass) =>
      pass.subjects.some(
        (o) => sameItem(s, o) && pass.termOf(o)?.term === arg && readsBefore(o.bbox, s.bbox),
      ),
  },
  leads: {
    args: 'true',
    doc: "The subject leads its item: of the item's texts unassigned when the rule began (it and at least one other) it has the heaviest weight, and on equal weight it reads first (above, or left on the same row). One leader per item.",
    fn: (arg, s, ctx, pass) => {
      const mates = pass.subjects.filter((o) => sameItem(s, o) && o.kind === 'text' && pass.free(o));
      if (!mates.length) return false;
      const w = (o) => o.weight ?? 400;
      return mates.every((o) => w(s) > w(o) || (w(s) === w(o) && readsBefore(s.bbox, o.bbox)));
    },
  },
};

/** Evaluates one predicate. */
export function test(pred, subject, ctx, pass) {
  const keys = Object.keys(pred);
  if (keys.length !== 1)
    throw new Error(`vocabulary: a predicate has exactly one key, got ${JSON.stringify(pred)}`);
  const p = PREDICATES[keys[0]];
  if (!p) throw new Error(`vocabulary: unknown predicate "${keys[0]}"`);
  return p.fn(pred[keys[0]], subject, ctx, pass);
}

/* ------------------------------------------------------------------------------------------------ prepare */

/** Word count: runs of letters, digits and underscore (Python's `\w+`, Unicode-aware). */
export const words = (t) => ((t || '').match(/[\p{L}\p{N}_]+/gu) || []).length;

const inside = (a, b, pad = 0.5) =>
  a[0] >= b[0] - pad && a[1] >= b[1] - pad && a[2] <= b[2] + pad && a[3] <= b[3] + pad;

/**
 * The derived fields (documented in the generated page): words, commas, hasDigit, capitalShare, x0, y0, x1, y1, w, h, areaPct,
 * aspect, inCorner, thin, length, spansSide, bleedCount, holdsText, heldTexts, heldWords, heldText, sidesWithContent, itemFields,
 * blockItems, inBlock. A field the
 * measurement already gives is kept. `subjects` = every subject of the pass (the relational fields need them).
 */
export function prepare(subjects, ctx = {}) {
  const aspect = ctx.aspect ?? 16 / 9;
  for (const s of subjects) {
    if (typeof s.text === 'string') {
      const tx = s.text.trim();
      s.words ??= words(tx);
      s.commas ??= (tx.match(/,/g) || []).length;
      s.hasDigit ??= /\d/.test(tx);
      if (s.capitalShare === undefined) {
        const ws = tx.match(/[\p{L}\p{N}_]+/gu) || [];
        s.capitalShare = s.words ? ws.filter((w) => w[0] !== w[0].toLowerCase()).length / s.words : 0;
      }
    }
    if (Array.isArray(s.bbox)) {
      const [x0, y0, x1, y1] = s.bbox;
      s.x0 ??= x0;
      s.y0 ??= y0;
      s.x1 ??= x1;
      s.y1 ??= y1;
      s.w ??= x1 - x0;
      s.h ??= y1 - y0;
      s.areaPct ??= Math.round(((Math.max(0, s.w) * Math.max(0, s.h)) / 100) * 100) / 100;
      s.aspect ??= (s.w / Math.max(s.h, 0.01)) * aspect;
      s.inCorner ??= (y0 < 22 || y1 > 78) && (x0 < 30 || x1 > 70);
      s.thin ??= s.h < 0.8 || s.w < 0.5;
      s.length ??= Math.max(s.w, s.h);
      s.spansSide ??= (s.w > 95 && s.h <= 30) || (s.h > 95 && s.w <= 40);
    }
    if (Array.isArray(s.bleed)) s.bleedCount ??= s.bleed.length;
    if (s.block !== undefined && s.block !== null) s.inBlock ??= true;
  }
  const texts = subjects.filter((o) => o.kind === 'text' && !o.hidden && Array.isArray(o.bbox));
  for (const s of subjects) {
    if (!Array.isArray(s.bbox) || s.kind === 'text') continue;
    const held = texts.filter((t) => t !== s && inside(t.bbox, s.bbox));
    s.holdsText ??= held.length > 0;
    s.heldTexts ??= held.filter((t) => !t.furniture).length;
    s.heldWords ??= held.reduce((n, t) => n + (t.words ?? words(t.text)), 0);
    s.heldText ??= held.map((t) => (t.text || '').trim()).join(' ');
    if (s.thin && s.sidesWithContent === undefined) s.sidesWithContent = sidesWithContent(s, subjects);
  }
  for (const s of subjects) {
    if (!s.inBlock) continue;
    const mates = subjects.filter((o) => o.block === s.block);
    s.itemFields ??=
      s.item === null || s.item === undefined ? 1 : mates.filter((o) => o.item === s.item).length;
    s.blockItems ??= new Set(
      mates.filter((o) => o.item !== null && o.item !== undefined).map((o) => o.item),
    ).size;
  }
  return subjects;
}

/**
 * How many sides of a thin line carry content along its length (0, 1 or 2): for a horizontal line, a text or image
 * above it and one below it within 15 % H, each overlapping the line's span by half the line's length or more; the
 * line separates them only when it is at least half as long as the wider of the two (a short accent rule under a
 * long title separates nothing). Vertical lines alike, sideways.
 */
export function sidesWithContent(s, subjects) {
  const [x0, y0, x1, y1] = s.bbox;
  const horizontal = x1 - x0 >= y1 - y0;
  const len = horizontal ? x1 - x0 : y1 - y0;
  const content = subjects.filter(
    (o) =>
      o !== s &&
      Array.isArray(o.bbox) &&
      (o.kind === 'text' || o.kind === 'image') &&
      !o.hidden &&
      (o.areaPct ?? 0) < 90,
  );
  const span = (b) => (horizontal ? [b[0], b[2]] : [b[1], b[3]]);
  const overlapLen = (b) =>
    Math.min(span(b)[1], horizontal ? x1 : y1) - Math.max(span(b)[0], horizontal ? x0 : y0);
  const side = (before) =>
    content.filter((o) => {
      const b = o.bbox;
      const gap = horizontal ? (before ? y0 - b[3] : b[1] - y1) : before ? x0 - b[2] : b[0] - x1;
      return gap >= -0.2 && gap <= 15 && overlapLen(b) >= 0.5 * Math.min(len, span(b)[1] - span(b)[0]);
    });
  const a = side(true);
  const z = side(false);
  if (!a.length || !z.length) return a.length || z.length ? 1 : 0;
  const ext = (list) => {
    const u = union(list.map((o) => o.bbox));
    return horizontal ? u[2] - u[0] : u[3] - u[1];
  };
  return len >= 0.5 * Math.max(ext(a), ext(z)) ? 2 : 1;
}
