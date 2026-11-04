/** summarize(slide) -> what a layout needs to know about the content (P2-spec §3.1). Passed to layout.build(ctx). */
import { blockNodes } from '../content/blocks.js';
import { plainText } from '../content/inline.js';
import { lowerSlide } from '../content/lower.js';

const ITEM_TYPES = ['kpis', 'cards', 'steps', 'timeline', 'logos', 'people'];

function listStats(items, depth = 1) {
  let count = 0;
  let levels = 0;
  let chars = 0;
  for (const it of items ?? []) {
    count += 1;
    levels = Math.max(levels, depth);
    chars += plainText(it.text).length;
    if (it.children?.length) {
      const s = listStats(it.children, depth + 1);
      count += s.count;
      levels = Math.max(levels, s.levels);
      chars += s.chars;
    }
  }
  return { count, levels, chars };
}

function blockChars(b) {
  switch (b.type) {
    case 'title':
    case 'subtitle':
    case 'eyebrow':
    case 'paragraph':
    case 'cta':
      return plainText(b.text).length;
    case 'quote':
      return plainText(b.text).length + (b.attribution?.length ?? 0) + (b.role?.length ?? 0);
    case 'list':
      return listStats(b.items).chars;
    case 'columns':
      return b.items.reduce(
        (a, c) => a + (c.title?.length ?? 0) + c.blocks.reduce((x, y) => x + blockChars(y), 0),
        0,
      );
    case 'table':
      return [...(b.header ?? []), ...(b.rows ?? []).flat()].join('').length;
    default:
      if (Array.isArray(b.items)) {
        return b.items.reduce(
          (a, it) =>
            a +
            Object.values(it)
              .filter((v) => typeof v === 'string')
              .join('').length,
          0,
        );
      }
      return 0;
  }
}

const has = (v) => v !== undefined && v !== null && v !== '';

/** Plain characters of a list of strings read as one text (one space between the parts). */
const joinedLength = (list) => list.reduce((a, s) => a + plainText(s).length, 0) + list.length - 1;

/**
 * One content block as a layout sees it (docs/S2-layouts.md §1): {type, nodes, shape?, ordered?, title?, fields,
 * icons, chars} - `fields` = the node fields any node carries, `icons` = the icon names the nodes ask for, `chars` =
 * the longest text per node field (plain characters; layouts size boxes to it; a list of strings counts as one text,
 * and a compare column's rows as `rows`: the catalogue's length bands, packages/layouts catalogue-key.js).
 */
export function describeBlock(b) {
  const nodes =
    b.type === 'kpis' || b.type === 'items' || b.type === 'process' || b.type === 'points'
      ? (b.items ?? [])
      : blockNodes(b);
  const fields = new Set();
  const icons = [];
  const chars = {};
  for (const n of nodes) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
    for (const [k, v] of Object.entries(n)) {
      if (has(v)) fields.add(k);
      if (typeof v === 'string') chars[k] = Math.max(chars[k] ?? 0, plainText(v).length);
      // a list of strings (sub-point / timeline lines, tier features): its length as one text (catalogue bands, C3)
      else if (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string'))
        chars[k] = Math.max(chars[k] ?? 0, joinedLength(v));
    }
    // compare: a column's rows (features + item headings and bodies) as one text, the catalogue's side description
    if (b.type === 'compare' && n && typeof n === 'object') {
      const rows = [
        ...(n.features ?? []),
        ...(n.items ?? []).flatMap((it) => [it?.heading, it?.body]),
      ].filter((x) => typeof x === 'string' && x);
      if (rows.length) chars.rows = Math.max(chars.rows ?? 0, joinedLength(rows));
    }
    if (typeof n.icon === 'string' && n.icon) icons.push(n.icon);
  }
  // compare: a check on any row of any column is a field too (the compare layouts draw check marks)
  if (
    b.type === 'compare' &&
    nodes.some((c) => (c?.items ?? []).some((it) => typeof it?.check === 'boolean'))
  )
    fields.add('check');
  const out = { type: b.type, nodes: nodes.length, fields: [...fields].sort(), icons, chars };
  // the most sub-lines (a sub-point's / timeline's `lines`) any node carries: each is a line of its own (C3.2)
  const lineCount = Math.max(
    0,
    ...nodes.map((n) => (Array.isArray(n?.lines) ? n.lines.filter((x) => typeof x === 'string').length : 0)),
  );
  if (lineCount) out.lineCount = lineCount;
  if (typeof b.shape === 'string') out.shape = b.shape;
  if (b.tiers) out.tiers = true;
  // logos: the explicit rows (distinct `row` values) and the most logos in one row
  if (b.type === 'logos' && nodes.some((n) => Number.isInteger(n?.row))) {
    const per = new Map();
    for (const n of nodes) per.set(n?.row ?? 0, (per.get(n?.row ?? 0) ?? 0) + 1);
    out.rows = per.size;
    out.perRow = Math.max(...per.values());
  }
  // compare: the most rows (features + items) any column carries (the compare layouts size to it)
  if (b.type === 'compare')
    out.rows = Math.max(0, ...nodes.map((c) => (c?.features?.length ?? 0) + (c?.items?.length ?? 0)));
  if (b.nested) out.nested = true;
  if (typeof b.treatment === 'string') out.treatment = b.treatment;
  if (b.ordered) out.ordered = true;
  if (typeof b.title === 'string' && b.title) out.title = true;
  if (typeof b.subtitle === 'string' && b.subtitle) out.subtitle = true;
  return out;
}

/**
 * summarize(slide, {kind, requestedKind, assetInfo}) (content/1 or content/2 slide) ->
 * { kind, requestedKind, v2, items, chars, blocks: [describeBlock(b) for the slide's blocks as written],
 *   blockCounts: {type: count} (lowered), hasTitle, hasSubtitle, hasImage, hasChart, hasTable, hasQuote, hasKpis,
 *   columns, listItems, listLevels, paragraphs, chartType, tableRows, tableCols, imageAspect }.
 * `v2` is true for a content/2 slide: only then do layouts read `blocks` (a content/1 deck composes as before).
 */
export function summarize(slide, { kind, requestedKind, assetInfo } = {}) {
  // a content/2 slide is summarised through its aliases onto today's blocks (content/lower.js)
  const written = slide?.blocks ?? [];
  const original = slide;
  const lowered = lowerSlide(slide);
  slide = lowered.slide;
  const blocks = slide?.blocks ?? [];
  const counts = {};
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1;
  const columnsBlock = blocks.find((b) => b.type === 'columns');
  const inner = [...blocks, ...(columnsBlock?.items.flatMap((c) => c.blocks) ?? [])];
  const lists = inner.filter((b) => b.type === 'list');
  const ls = lists.reduce(
    (a, l) => {
      const s = listStats(l.items);
      return { count: a.count + s.count, levels: Math.max(a.levels, s.levels), top: a.top + l.items.length };
    },
    { count: 0, levels: 0, top: 0 },
  );
  const itemBlock = blocks.find((b) => ITEM_TYPES.includes(b.type));
  const chart = inner.find((b) => b.type === 'chart');
  const table = inner.find((b) => b.type === 'table');
  const image = inner.find((b) => b.type === 'image');
  let items = 0;
  if (itemBlock) items = itemBlock.items.length;
  else if (columnsBlock) items = columnsBlock.items.length;
  else if (lists.length) items = ls.top;
  let imageAspect = null;
  if (image && assetInfo) {
    const info = assetInfo(image.src);
    if (info?.width && info?.height) imageAspect = Math.round((info.width / info.height) * 1000) / 1000;
  }
  const summary = {
    kind: kind ?? slide?.kind ?? null,
    requestedKind: requestedKind ?? slide?.kind ?? null,
    items,
    chars: blocks.reduce((a, b) => a + blockChars(b), 0),
    v2: lowered.changed,
    blocks: written.map(describeBlock),
    blockCounts: counts,
    hasTitle: !!counts.title,
    hasSubtitle: !!counts.subtitle,
    hasImage: !!image,
    hasChart: !!chart,
    hasTable: !!table,
    hasQuote: inner.some((b) => b.type === 'quote'),
    hasKpis: !!counts.kpis,
    columns: columnsBlock ? columnsBlock.items.length : 0,
    listItems: ls.count,
    listLevels: ls.levels,
    paragraphs: inner.filter((b) => b.type === 'paragraph').length,
    imageAspect,
  };
  if (lowered.changed) {
    // the content/2 slide keys a layout shows (docs/S2-layouts.md §5)
    const keys = {};
    for (const k of ['label', 'subtitle', 'number', 'cta']) if (has(original?.[k])) keys[k] = true;
    if (lowered.background) keys.background = true;
    summary.keys = keys;
    if (keys.subtitle) summary.subtitleChars = plainText(original.subtitle).length;
  }
  if (chart) summary.chartType = chart.chartType;
  if (table) {
    summary.tableRows = table.rows.length;
    summary.tableCols = Math.max(table.header?.length ?? 0, ...table.rows.map((r) => r.length));
  }
  return summary;
}
