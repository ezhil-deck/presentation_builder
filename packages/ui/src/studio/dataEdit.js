// The data commands of the Studio's editor (docs/P4-spec.md §2 "Images", "Charts", "Tables", "Flow items"; P4.3):
// pure functions from the content document to a content patch (contentEdit.js's form: whole slides by id), found
// through an element's `source` (a JSON pointer into its content slide: `/blocks/<i>` for a chart / table,
// `/blocks/<i>/items/<k>/src` for an image, `/blocks/<i>/items/<k>` for a flow node). No rule is computed here: the
// server re-composes, re-fits and re-checks every change.
import { BLOCKS, CELL_TYPES, CHART_TYPES } from '../../../engine/src/content/blocks.js';
import { cellText } from '../../../engine/src/content/lower.js';
import { PLACEHOLDER, nodeSkeleton } from '../../../engine/src/content/placeholders.js';
import { getPointer, pointerSegments } from '../../../engine/src/content/source.js';
import { setFieldPatch } from './contentEdit.js';

export { CELL_TYPES, CHART_TYPES };

const slideOf = (content, id) => (content?.slides ?? []).find((s) => s.id === id) ?? null;
const copy = (v) => JSON.parse(JSON.stringify(v));

/** The block a pointer is under: {path: '/blocks/<i>', index} or null. */
export function blockPathOf(path) {
  const m = /^\/blocks\/(\d+)(?:\/|$)/.exec(path ?? '');
  return m ? { path: `/blocks/${m[1]}`, index: Number(m[1]) } : null;
}

/** A block replaced (content patch) - every chart / table edit writes the whole block. */
export function setBlockPatch(content, slideId, blockPath, block) {
  return setFieldPatch(content, slideId, blockPath, block);
}

// ---------------------------------------------------------------------------------------------------- images

const SRC_FIELDS = new Set(['src', 'image', 'photo', 'logo']);

/**
 * What an image element edits: {srcPath, src, nodePath, alt?, caption?, focal?, focalIn, canAlt, canCaption,
 * canFocal} - the string that names its file (the element's `source`); an image block's item (or a content/1 image
 * block) also has its alt text, caption and focal point in the content (`focalIn: 'content'`); any other image (a
 * compare column's, an item's image, a person's photo) keeps its focal point as an element override (`focalIn:
 * 'override'`: the content schema has no field for it). null when the element names no file in the content.
 */
export function imageTarget(el, slide) {
  if (el?.type !== 'image' || !el.source?.path) return null;
  const srcPath = el.source.path;
  const segs = pointerSegments(srcPath);
  const field = segs[segs.length - 1];
  const src = getPointer(slide, srcPath);
  if (!SRC_FIELDS.has(field) || typeof src !== 'string') return null;
  const nodePath = srcPath.slice(0, srcPath.length - field.length - 1);
  const node = getPointer(slide, nodePath);
  const block = getPointer(slide, blockPathOf(srcPath)?.path ?? '');
  // an image block's item (content/2) or a content/1 image block: src + alt + caption + focal
  const own = field === 'src' && block?.type === 'image';
  return {
    srcPath,
    src,
    nodePath,
    alt: own ? (node?.alt ?? '') : undefined,
    caption: own ? (node?.caption ?? '') : undefined,
    focal: own && node?.focal ? node.focal : undefined,
    focalIn: own ? 'content' : 'override',
    canAlt: own,
    canCaption: own,
    canFocal: true,
  };
}

/**
 * The part of an image a cover frame shows when no crop is set (the renderer centres it: object-fit cover): fractions
 * of the image, from its size {width, height}; the whole image when the size is unknown or the fit is not cover.
 */
export function shownCrop(el, size) {
  if (el?.image?.crop) return el.image.crop;
  const f = el?.frame;
  if ((el?.image?.fit ?? 'cover') !== 'cover' || !(size?.width > 0) || !(size?.height > 0) || !(f?.w > 0))
    return { x: 0, y: 0, w: 1, h: 1 };
  const ia = size.width / size.height;
  const fa = f.w / f.h;
  const w = ia > fa ? fa / ia : 1;
  const h = ia > fa ? 1 : ia / fa;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** The image under a focal point: the frame point (fractions of the frame) as fractions of the image (its crop). */
export function focalFromFrame(px, py, crop) {
  const c =
    crop && crop.w > 0 && crop.h > 0 && crop.w <= 1 && crop.h <= 1 ? crop : { x: 0, y: 0, w: 1, h: 1 };
  const clamp = (v) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
  return { x: clamp(c.x + px * c.w), y: clamp(c.y + py * c.h) };
}

/** Where a focal point shows in the frame (fractions of the frame), given the image's crop. */
export function frameFromFocal(focal, crop) {
  const c =
    crop && crop.w > 0 && crop.h > 0 && crop.w <= 1 && crop.h <= 1 ? crop : { x: 0, y: 0, w: 1, h: 1 };
  return { x: (focal.x - c.x) / c.w, y: (focal.y - c.y) / c.h };
}

/** The slide with an `image` block added (a dropped file on a slide that shows no image): a content patch. */
export function addImageBlockPatch(content, slideId, src) {
  const slide = slideOf(content, slideId);
  if (!slide) return null;
  const n = (slide.blocks ?? []).length;
  return setFieldPatch(content, slideId, `/blocks/${n}`, { type: 'image', items: [{ src }] });
}

// ---------------------------------------------------------------------------------------------------- charts

/** The chart's grid: {categories, series: [{name, values}]} with every series as long as the categories. */
export function chartGrid(block) {
  const series = (block?.series ?? []).map((s) => ({ name: s.name ?? '', values: [...(s.values ?? [])] }));
  const n = block?.categories?.length ?? Math.max(0, ...series.map((s) => s.values.length));
  const categories = block?.categories
    ? [...block.categories]
    : Array.from({ length: n }, (_, k) => String(k + 1));
  for (const s of series) {
    while (s.values.length < n) s.values.push(0);
    s.values.length = n;
  }
  return { categories, series };
}

/** Whether the chart's `highlight` names a series (several series) or a category (one series). */
export const highlightsSeries = (block) => (block?.series?.length ?? 0) > 1;

const withGrid = (block, grid) => ({ ...block, categories: grid.categories, series: grid.series });

/** One chart edit on the block -> the new block (pure). `op` = {kind, ...}. */
export function chartEdit(block, op) {
  const b = copy(block);
  const g = chartGrid(b);
  const hl = Number.isInteger(b.highlight) ? b.highlight : null;
  const bySeries = highlightsSeries(b);
  switch (op.kind) {
    case 'value': {
      const v = Number(op.value);
      if (!Number.isFinite(v)) return block;
      g.series[op.series].values[op.row] = v;
      return withGrid(b, g);
    }
    case 'category':
      g.categories[op.row] = String(op.value ?? '');
      return withGrid(b, g);
    case 'seriesName':
      g.series[op.series].name = String(op.value ?? '');
      return withGrid(b, g);
    case 'addRow': {
      const at = Math.max(0, Math.min(g.categories.length, op.at ?? g.categories.length));
      g.categories.splice(at, 0, PLACEHOLDER.category);
      for (const s of g.series) s.values.splice(at, 0, 0);
      const out = withGrid(b, g);
      if (!bySeries && hl !== null && hl >= at) out.highlight = hl + 1;
      return out;
    }
    case 'removeRow': {
      if (g.categories.length <= 1) return block;
      g.categories.splice(op.row, 1);
      for (const s of g.series) s.values.splice(op.row, 1);
      const out = withGrid(b, g);
      if (!bySeries && hl !== null) {
        if (hl === op.row) delete out.highlight;
        else if (hl > op.row) out.highlight = hl - 1;
      }
      return out;
    }
    case 'addSeries': {
      const at = Math.max(0, Math.min(g.series.length, op.at ?? g.series.length));
      g.series.splice(at, 0, { name: PLACEHOLDER.series, values: g.categories.map(() => 0) });
      const out = withGrid(b, g);
      if (Array.isArray(out.text?.legend) && at <= out.text.legend.length)
        out.text = {
          ...out.text,
          legend: [...out.text.legend.slice(0, at), PLACEHOLDER.series, ...out.text.legend.slice(at)],
        };
      // one series -> two: a category highlight no longer reads as one (it would name a series)
      if (!bySeries && hl !== null) delete out.highlight;
      else if (bySeries && hl !== null && hl >= at) out.highlight = hl + 1;
      return out;
    }
    case 'removeSeries': {
      if (g.series.length <= 1) return block;
      g.series.splice(op.series, 1);
      const out = withGrid(b, g);
      if (Array.isArray(out.text?.legend)) {
        const legend = out.text.legend.filter((_, i) => i !== op.series);
        out.text = { ...out.text, legend };
        if (!legend.length) delete out.text.legend;
      }
      if (bySeries && hl !== null) {
        if (hl === op.series || g.series.length === 1) delete out.highlight;
        else if (hl > op.series) out.highlight = hl - 1;
      }
      return out;
    }
    case 'key': {
      const out = b;
      const v = op.value;
      if (op.key === 'chartType') {
        if (!CHART_TYPES.includes(v)) return block;
        out.chartType = v;
      } else if (op.key === 'highlight') {
        if (v === null || v === '' || v === undefined) delete out.highlight;
        else out.highlight = Number(v);
      } else if (op.key === 'unit') {
        if (v === null || v === '' || v === undefined) delete out.unit;
        else out.unit = String(v);
      }
      return out;
    }
    case 'text': {
      const out = b;
      const text = { ...(out.text ?? {}) };
      if (op.value === null || op.value === '' || op.value === undefined) delete text[op.key];
      else text[op.key] = String(op.value);
      if (Object.keys(text).length) out.text = text;
      else delete out.text;
      return out;
    }
    default:
      return block;
  }
}

// ---------------------------------------------------------------------------------------------------- tables

/** The table's column count (the widest of its header and rows). */
export const tableColumns = (block) =>
  Math.max(block?.header?.length ?? 0, ...(block?.rows ?? []).map((r) => r.length), 0);

/** The type of a content cell: 'text' (a string), 'check' (a boolean), else the rich cell's type. */
export function cellType(cell) {
  if (typeof cell === 'boolean') return 'check';
  if (cell && typeof cell === 'object') return cell.type ?? 'text';
  return 'text';
}

/** A cell with its text edited, keeping its type: a check reads ✓ / true / yes / x as on, a rating a number. */
export function cellWithText(cell, text) {
  const t = String(text ?? '').trim();
  const on = /^(✓|✔|true|yes|y|x|1)$/i.test(t);
  if (typeof cell === 'boolean') return on;
  if (!cell || typeof cell !== 'object') return String(text ?? '');
  switch (cell.type) {
    case 'check':
      return { ...cell, value: on };
    case 'rating': {
      const n = Math.round(Number(t));
      return Number.isFinite(n) ? { ...cell, value: Math.max(0, Math.min(10, n)) } : cell;
    }
    case 'image':
    case 'logo':
      return { ...cell, alt: String(text ?? '') };
    default:
      return { ...cell, text: String(text ?? '') };
  }
}

/**
 * A cell turned into another type (the cell type menu), from its shown text: text = a plain string, check = a bare
 * boolean, rating = {value} (its number, 0–10), image / logo = {src, alt} (`src` = the file the designer picked; null
 * without one), heading / number / chip = {type, text}.
 */
export function cellAsType(cell, type, { src } = {}) {
  const text = cellText(cell);
  switch (type) {
    case 'text':
      return text;
    case 'check':
      return /^(✓|✔|true|yes|y|x|1)$/i.test(text.trim());
    case 'rating': {
      const n = Math.round(Number(text));
      return { type: 'rating', value: Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0 };
    }
    case 'image':
    case 'logo':
      if (!src) return null;
      return { type, src, ...(text && text !== '✓' && text !== '✗' ? { alt: text } : {}) };
    default:
      return CELL_TYPES.includes(type) ? { type, text } : null;
  }
}

const TABLE_MAX = 8;

/** One table edit on the block -> the new block (pure). Rows are content rows (`-1` = the header). */
export function tableEdit(block, op) {
  const b = copy(block);
  const cols = tableColumns(b);
  const hl = Number.isInteger(b.highlightColumn) ? b.highlightColumn : null;
  const rowAt = (r) => (r < 0 ? b.header : b.rows[r]);
  switch (op.kind) {
    case 'cell': {
      const row = rowAt(op.row);
      if (!row) return block;
      while (row.length <= op.col) row.push('');
      row[op.col] = op.value;
      return b;
    }
    case 'cellText': {
      const row = rowAt(op.row);
      if (!row) return block;
      while (row.length <= op.col) row.push('');
      row[op.col] = cellWithText(row[op.col], op.value);
      return b;
    }
    case 'addRow': {
      if (b.rows.length >= TABLE_MAX) return block;
      const at = Math.max(0, Math.min(b.rows.length, op.at ?? b.rows.length));
      b.rows.splice(
        at,
        0,
        Array.from({ length: cols }, () => PLACEHOLDER.cell),
      );
      return b;
    }
    case 'removeRow': {
      if (b.rows.length <= 1) return block;
      b.rows.splice(op.row, 1);
      return b;
    }
    case 'addColumn': {
      if (cols >= TABLE_MAX) return block;
      const at = Math.max(0, Math.min(cols, op.at ?? cols));
      if (b.header) b.header.splice(Math.min(at, b.header.length), 0, PLACEHOLDER.column);
      for (const r of b.rows) {
        while (r.length < at) r.push('');
        r.splice(at, 0, PLACEHOLDER.cell);
      }
      if (Array.isArray(b.align) && at <= b.align.length)
        b.align.splice(at, 0, b.align[Math.max(0, at - 1)] ?? 'left');
      if (hl !== null && hl >= at) b.highlightColumn = hl + 1;
      return b;
    }
    case 'removeColumn': {
      if (cols <= 1) return block;
      if (b.header) b.header.splice(op.col, 1);
      for (const r of b.rows) r.splice(op.col, 1);
      if (Array.isArray(b.align)) {
        b.align.splice(op.col, 1);
        if (!b.align.length) delete b.align;
      }
      if (hl !== null) {
        if (hl === op.col) delete b.highlightColumn;
        else if (hl > op.col) b.highlightColumn = hl - 1;
      }
      return b;
    }
    case 'align': {
      const align = Array.from({ length: cols }, (_, c) => b.align?.[c] ?? 'left');
      align[op.col] = op.value;
      b.align = align;
      return b;
    }
    case 'key': {
      const v = op.value;
      if (op.key === 'highlightColumn') {
        if (v === null || v === '' || v === undefined) delete b.highlightColumn;
        else b.highlightColumn = Number(v);
      } else if (op.key === 'rowHeader') {
        if (v) b.rowHeader = true;
        else delete b.rowHeader;
      } else if (op.key === 'title' || op.key === 'subtitle') {
        if (v === null || v === '' || v === undefined) delete b[op.key];
        else b[op.key] = String(v);
      }
      return b;
    }
    default:
      return block;
  }
}

/**
 * A deck table cell -> its content cell: {row (content row, -1 = header), col}. `r` = the deck's cell row (the header
 * is row 0 when the table has one).
 */
export function contentCellOf(tableEl, r, c) {
  const hasHeader = Array.isArray(tableEl?.table?.header);
  return { row: hasHeader ? r - 1 : r, col: c };
}

/** The deck cell (row r, column c) of a table element at a canvas point, or null. */
export function cellAt(tableEl, x, y) {
  const t = tableEl?.table;
  if (!t?.cells) return null;
  const lx = x - tableEl.frame.x;
  const ly = y - tableEl.frame.y;
  for (let r = 0; r < t.cells.length; r += 1) {
    for (let c = 0; c < t.cells[r].length; c += 1) {
      const cell = t.cells[r][c];
      if (lx >= cell.x && lx < cell.x + cell.w && ly >= cell.y && ly < cell.y + cell.h) return { r, c };
    }
  }
  return null;
}

/**
 * A deck table cell as a text element the inline editor can lay over it: its frame on the canvas, its font, lines
 * and paragraphs, and the content field it shows (`source.path` = the cell's pointer). null when the cell is not there.
 */
export function cellElement(tableEl, r, c) {
  const cell = tableEl?.table?.cells?.[r]?.[c];
  if (!cell) return null;
  const { row, col } = contentCellOf(tableEl, r, c);
  const base = tableEl.source?.path;
  return {
    id: `${tableEl.id}::${r}:${c}`,
    type: 'text',
    frame: { x: tableEl.frame.x + cell.x, y: tableEl.frame.y + cell.y, w: cell.w, h: cell.h },
    text: {
      font: cell.font,
      lines: cell.lines ?? [],
      paragraphs: cell.paragraphs ?? [{ runs: [{ text: cell.text ?? '' }] }],
      align: cell.align ?? 'left',
    },
    source: base ? { path: row < 0 ? `${base}/header/${col}` : `${base}/rows/${row}/${col}` } : undefined,
    cell: { r, c, row, col },
  };
}

/** The next deck cell from (r, c): Tab (+1 column, wrapping to the next row), Shift+Tab (back), Enter (down). */
export function nextCell(tableEl, r, c, dir) {
  const cells = tableEl?.table?.cells ?? [];
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((x) => x.length));
  if (!rows || !cols) return null;
  if (dir === 'down') return r + 1 < rows ? { r: r + 1, c } : null;
  let k = r * cols + c + (dir === 'prev' ? -1 : 1);
  if (k < 0 || k >= rows * cols) return null;
  return { r: Math.floor(k / cols), c: k % cols };
}

// ---------------------------------------------------------------------------------------------------- flow nodes

/** The flow blocks whose nodes the Studio adds / removes / reorders (docs/P4-spec.md §2 "Flow items"). */
export const FLOW_TYPES = Object.freeze([
  'items',
  'points',
  'subpoints',
  'kpis',
  'process',
  'timeline',
  'quotes',
  'people',
  'logos',
  'compare',
]);

/** The node fields the panel shows per flow type: [key, kind ('text' | 'lines' | 'trend')]. */
export const NODE_FIELDS = Object.freeze({
  points: [
    ['text', 'text'],
    ['icon', 'text'],
  ],
  items: [
    ['heading', 'text'],
    ['body', 'text'],
    ['label', 'text'],
    ['icon', 'text'],
  ],
  subpoints: [
    ['heading', 'text'],
    ['lines', 'lines'],
  ],
  kpis: [
    ['value', 'text'],
    ['heading', 'text'],
    ['body', 'text'],
    ['trend', 'trend'],
  ],
  process: [
    ['heading', 'text'],
    ['body', 'text'],
    ['icon', 'text'],
  ],
  timeline: [
    ['when', 'text'],
    ['heading', 'text'],
    ['body', 'text'],
    ['lines', 'lines'],
    ['icon', 'text'],
  ],
  quotes: [
    ['text', 'text'],
    ['name', 'text'],
    ['role', 'text'],
    ['label', 'text'],
  ],
  people: [
    ['name', 'text'],
    ['role', 'text'],
    ['bio', 'text'],
  ],
  logos: [
    ['name', 'text'],
    ['heading', 'text'],
    ['body', 'text'],
  ],
  compare: [
    ['header', 'text'],
    ['label', 'text'],
    ['price', 'text'],
    ['per', 'text'],
    ['features', 'lines'],
  ],
});

/** The node fields the content schema requires per flow type (never emptied from the panel). */
export const NODE_REQUIRED = Object.freeze({
  points: ['text'],
  items: ['heading'],
  subpoints: ['heading', 'lines'],
  kpis: ['value'],
  process: ['heading'],
  timeline: ['heading'],
  quotes: ['text'],
  people: ['name'],
  logos: [],
  compare: ['header'],
});

/**
 * The flow node an element belongs to: {blockPath, container, k, nodePath, type, count, min, max, node} - from its
 * `source` (`/blocks/<i>/items/<k>…`, `/blocks/<i>/columns/<c>…`) in a flow block of the content slide; null else.
 */
export function flowNodeOf(el, slide) {
  const m = /^(\/blocks\/(\d+))\/(items|columns)\/(\d+)(?:\/|$)/.exec(el?.source?.path ?? '');
  if (!m) return null;
  const block = getPointer(slide, m[1]);
  if (!block || !FLOW_TYPES.includes(block.type)) return null;
  const container = block.type === 'compare' ? 'columns' : 'items';
  if (m[3] !== container) return null;
  const list = block[container] ?? [];
  const k = Number(m[4]);
  if (!list[k]) return null;
  const range = BLOCKS[block.type]?.nodes ?? { min: 1, max: 20 };
  return {
    blockPath: m[1],
    container,
    k,
    nodePath: `${m[1]}/${container}/${k}`,
    type: block.type,
    count: list.length,
    min: Math.max(1, range.min),
    max: range.max,
    node: list[k],
  };
}

/** Why a node cannot be added / removed / moved (the disabled button's tooltip), or null when it can. */
export function nodeLimit(info, action) {
  if (!info) return 'no node selected';
  if (action === 'add' && info.count >= info.max)
    return `${info.type} takes ${info.min}–${info.max} nodes: this one has ${info.count}`;
  if (action === 'remove' && info.count <= info.min)
    return `${info.type} takes ${info.min}–${info.max} nodes: this one has ${info.count}`;
  if (action === 'up' && info.k === 0) return 'already the first';
  if (action === 'down' && info.k >= info.count - 1) return 'already the last';
  return null;
}

/** A node added before / after node k: {patch, k} (the new node's index) or null at the range's end. */
export function addNodePatch(content, slideId, info, where = 'after') {
  if (nodeLimit(info, 'add')) return null;
  const slide = slideOf(content, slideId);
  const list = getPointer(slide, `${info.blockPath}/${info.container}`) ?? [];
  const fresh = nodeSkeleton(info.type, list[info.k]);
  if (!fresh) return null;
  const at = where === 'before' ? info.k : info.k + 1;
  const next = [...list.slice(0, at), fresh, ...list.slice(at)];
  const patch = setFieldPatch(content, slideId, `${info.blockPath}/${info.container}`, next);
  return patch ? { patch, k: at } : null;
}

/** Node k removed: a content patch or null at the range's start. */
export function removeNodePatch(content, slideId, info) {
  if (nodeLimit(info, 'remove')) return null;
  const slide = slideOf(content, slideId);
  const list = getPointer(slide, `${info.blockPath}/${info.container}`) ?? [];
  const next = list.filter((_, i) => i !== info.k);
  return setFieldPatch(content, slideId, `${info.blockPath}/${info.container}`, next);
}

/** Node `from` moved to index `to` (clamped): a content patch or null. */
export function moveNodePatch(content, slideId, info, to) {
  const slide = slideOf(content, slideId);
  const list = [...(getPointer(slide, `${info.blockPath}/${info.container}`) ?? [])];
  const from = info.k;
  const t = Math.max(0, Math.min(list.length - 1, to));
  if (from === t || !list[from]) return null;
  const [node] = list.splice(from, 1);
  list.splice(t, 0, node);
  return setFieldPatch(content, slideId, `${info.blockPath}/${info.container}`, list);
}

/** The painted bounds of every node of a flow ({k -> {x, y, w, h}}): the union of the elements under its pointer. */
export function nodeBoxes(slideEls, blockPath, container) {
  const prefix = `${blockPath}/${container}/`;
  const boxes = new Map();
  const walk = (els) => {
    for (const el of els ?? []) {
      const p = el.source?.path ?? '';
      if (p.startsWith(prefix) && !el.hidden) {
        const k = Number(p.slice(prefix.length).split('/')[0]);
        const f = el.frame;
        const b = boxes.get(k);
        boxes.set(
          k,
          b
            ? {
                x: Math.min(b.x, f.x),
                y: Math.min(b.y, f.y),
                r: Math.max(b.r, f.x + f.w),
                b: Math.max(b.b, f.y + f.h),
              }
            : { x: f.x, y: f.y, r: f.x + f.w, b: f.y + f.h },
        );
      }
      if (Array.isArray(el.children)) walk(el.children);
    }
  };
  walk(slideEls);
  return new Map([...boxes].map(([k, b]) => [k, { x: b.x, y: b.y, w: b.r - b.x, h: b.b - b.y }]));
}

/** The node index a canvas point falls on (the node whose painted bounds hold it), or null. */
export function nodeAtPoint(slideEls, blockPath, container, x, y) {
  for (const [k, b] of nodeBoxes(slideEls, blockPath, container))
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
  return null;
}
