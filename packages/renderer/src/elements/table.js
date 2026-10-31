import { cssColor, h, px, warn } from '../util.js';
import { elementProps } from './common.js';
import { renderLines } from './lines.js';

/**
 * Table element: absolutely positioned cells from `table.colWidths` / `table.rowHeights` (px, from the fitter).
 *
 * Grid rows = the header row (when `table.header` is present) followed by `table.rows`; `rowHeights` and
 * `cells` use the same indexing (header first). `cells[r][c] = {lines, font, paragraphs?}`: the fitted lines of
 * that cell, placed exactly like text (lines.js) relative to the cell's top-left. A cell with text but no lines is
 * left empty and flagged.
 *
 * `table.style` (literals):
 *   header      {fill?, font?}            fill of the header row
 *   firstColumn {fill?, font?}            fill of body cells in column 0
 *   rows        {fill?, altFill?, font?}  body fill; `altFill` on every 2nd body row (1, 3, ...)
 *   border      {color, width, vertical?} lines on every cell edge (outer + inner); `vertical: false` keeps only the
 *                                         horizontal ones
 *   font        default cell font when a cell has none (then header.font / firstColumn.font / rows.font first)
 *   radius      corner radius of the whole table (clips the cells)
 */
export function TableElement(el, ctx, origin) {
  const t = el.table ?? {};
  const st = t.style ?? {};
  const grid = [...(t.header ? [t.header] : []), ...(t.rows ?? [])];
  const hasHeader = Boolean(t.header);
  const colWidths = t.colWidths ?? [];
  const rowHeights = t.rowHeights ?? [];
  const warnings = [];
  if (!colWidths.length || rowHeights.length < grid.length) warnings.push('no colWidths/rowHeights');

  const box = {};
  if (typeof st.radius === 'number' && st.radius > 0) {
    box.borderRadius = px(st.radius);
    box.overflow = 'hidden';
  }
  const cells = [];
  if (!warnings.length) {
    const xs = [0];
    colWidths.forEach((cw, i) => xs.push(xs[i] + cw));
    let y = 0;
    grid.forEach((row, r) => {
      const rh = rowHeights[r];
      const isHeader = hasHeader && r === 0;
      const bodyIndex = r - (hasHeader ? 1 : 0);
      for (let c = 0; c < colWidths.length; c += 1) {
        const cell = t.cells?.[r]?.[c] ?? {};
        let fill;
        let rowFont;
        if (isHeader) {
          fill = st.header?.fill;
          rowFont = st.header?.font;
        } else if (c === 0 && st.firstColumn) {
          fill =
            st.firstColumn.fill ??
            (bodyIndex % 2 === 1 && st.rows?.altFill ? st.rows.altFill : st.rows?.fill);
          rowFont = st.firstColumn.font ?? st.rows?.font;
        } else {
          fill = bodyIndex % 2 === 1 && st.rows?.altFill ? st.rows.altFill : st.rows?.fill;
          rowFont = st.rows?.font;
        }
        const font = cell.font ?? rowFont ?? st.font;
        const text = row?.[c];
        const cellWarnings = [];
        let nodes = [];
        if (Array.isArray(cell.lines) && cell.lines.length && font) {
          const out = renderLines(ctx, { lines: cell.lines, paragraphs: cell.paragraphs ?? [], font });
          nodes = out.nodes;
          if (out.warning) cellWarnings.push(out.warning);
        } else if (text) {
          cellWarnings.push(font ? 'no fitted lines' : 'no cell font');
        }
        const css = {
          position: 'absolute',
          left: px(xs[c]),
          top: px(y),
          width: px(colWidths[c]),
          height: px(rh),
        };
        if (fill) css.backgroundColor = cssColor(fill);
        const props = {
          key: `c${r}-${c}`,
          className: isHeader ? 'pb-cell pb-cell-header' : 'pb-cell',
          'data-row': r,
          'data-col': c,
          style: css,
        };
        const w = warn(cellWarnings);
        if (w) props['data-warning'] = w;
        cells.push(h('div', props, ...nodes));
      }
      y += rh;
    });

    const b = st.border;
    if (b?.color && b.width) {
      const color = cssColor(b.color);
      const total = { w: xs[xs.length - 1], h: y };
      const rule = (key, left, top, width, height) =>
        h('div', {
          key,
          className: 'pb-rule',
          style: {
            position: 'absolute',
            left: px(left),
            top: px(top),
            width: px(width),
            height: px(height),
            backgroundColor: color,
          },
        });
      let ry = 0;
      for (let r = 0; r <= grid.length; r += 1) {
        cells.push(rule(`hr${r}`, 0, ry - b.width / 2, total.w, b.width));
        ry += rowHeights[r] ?? 0;
      }
      if (b.vertical !== false)
        xs.forEach((x, c) => cells.push(rule(`vr${c}`, x - b.width / 2, 0, b.width, total.h)));
    }
  }
  return h(
    'div',
    elementProps(el, origin, {
      extraStyle: box,
      warning: warn(warnings),
      attrs: { 'data-rows': grid.length, 'data-cols': colWidths.length },
    }),
    ...cells,
  );
}
