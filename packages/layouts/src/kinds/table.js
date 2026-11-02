/**
 * Title + one table filling the body area; capacity from mood.tables.maxRows / maxCols when given. A content/2 table
 * box carries the brand's row height (`table.rowHeight`, docs/S2-layouts.md §8): a short table takes taller rows instead
 * of leaving the lower half of the slide empty.
 */
import { createBuilder, standardTitle, v2Block } from '../common.js';
import { LINES, lineBox, pickRole, space } from '../geometry.js';

/** The spacing token a table row pads its cell line with, by the brand's density (signal: geometry.density). */
export const DENSITY_ROW_SPACE = Object.freeze({ sparse: 'xl', balanced: 'lg', dense: 'md' });

/**
 * The row height a content/2 table may grow to (signals: geometry.density → a spacing token, the cell role's line):
 * one cell line + that token above and below. No density → null (rows keep the fitted height). The engine caps it at
 * the table frame's height over the row count, so a long table never grows past its box.
 */
export function tableRowHeight(mood) {
  const token = DENSITY_ROW_SPACE[mood?.geometry?.density];
  if (!token) return null;
  const cell = pickRole(mood, mood.tables?.rows?.font, 'tableCell');
  const h = lineBox(mood, cell, LINES.one) + 2 * space(mood, token);
  return h > 0 ? Math.round(h) : null;
}

/** The table box + slot in frame `f` (capacity from mood.tables; the row height hint on content/2 slides). */
export function tableInto(b, f) {
  const { mood } = b;
  const rowHeight = v2Block(b.summary, 'table') ? tableRowHeight(mood) : null;
  b.box('table', f, { role: 'table', slot: 'table', ...(rowHeight ? { table: { rowHeight } } : {}) });
  const t = mood.tables ?? {};
  const capacity = {};
  if (Number.isInteger(t.maxRows)) capacity.maxRows = t.maxRows;
  if (Number.isInteger(t.maxCols)) capacity.maxCols = t.maxCols;
  b.slot('table', 'table', 'table', Object.keys(capacity).length ? { capacity } : {});
}

export default {
  id: 'table',
  kind: 'table',
  version: 1,
  tags: ['data', 'table'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'table');
    tableInto(b, b.area());
    return b.finish();
  },
};
