/** summarize(slide) -> what a layout needs to know about the content (P2-spec §3.1). Passed to layout.build(ctx). */
import { plainText } from '../content/inline.js';

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

/**
 * summarize(slide, {kind, requestedKind, assetInfo}) ->
 * { kind, requestedKind, items, chars, blocks: {type: count}, hasTitle, hasSubtitle, hasImage, hasChart, hasTable,
 *   hasQuote, hasKpis, columns, listItems, listLevels, paragraphs, chartType, tableRows, tableCols, imageAspect }
 */
export function summarize(slide, { kind, requestedKind, assetInfo } = {}) {
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
    blocks: counts,
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
  if (chart) summary.chartType = chart.chartType;
  if (table) {
    summary.tableRows = table.rows.length;
    summary.tableCols = Math.max(table.header?.length ?? 0, ...table.rows.map((r) => r.length));
  }
  return summary;
}
