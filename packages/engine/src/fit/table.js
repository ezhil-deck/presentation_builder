/**
 * Table geometry (P2-spec §3.4): column widths proportional to the widest measured cell of each column (never below
 * the header's width), row heights from the fitted cells. Header and body roles step down together (each by its own
 * fit.step, never below its fit.min) until the table fits the frame height; what is left is an `overflow` warning.
 * Coordinates are relative to the table element's frame; cell lines are relative to their cell box.
 */
import { deckFont } from '../compose/resolve.js';
import { r2 } from '../util/stable.js';
import { layoutText } from './lines.js';
import { measure, ruleWidth } from './metrics.js';

function sizesFor(font, k) {
  const min = font.fit?.min ?? font.size;
  const step = font.fit?.step ?? font.size - min;
  return Math.max(min, r2(font.size - (step > 0 ? step * k : 0)));
}

/** Widths proportional to `natural`, each ≥ its `min`, summing to `total`. */
export function proportionalWidths(natural, min, total) {
  const n = natural.length;
  const sumMin = min.reduce((a, b) => a + b, 0);
  if (sumMin >= total) return min.map((w) => (w / sumMin) * total);
  const fixed = new Array(n).fill(false);
  let widths = [];
  for (let pass = 0; pass <= n; pass += 1) {
    const fixedSum = min.reduce((a, w, i) => a + (fixed[i] ? w : 0), 0);
    const freeNat = natural.reduce((a, w, i) => a + (fixed[i] ? 0 : w), 0);
    widths = natural.map((w, i) => (fixed[i] ? min[i] : (w / freeNat) * (total - fixedSum)));
    const low = widths.findIndex((w, i) => !fixed[i] && w < min[i] - 1e-9);
    if (low < 0) break;
    widths.forEach((w, i) => {
      if (!fixed[i] && w < min[i] - 1e-9) fixed[i] = true;
    });
  }
  return widths;
}

/**
 * layoutTable(block, frame, mood, R, {warnings}) ->
 * { colWidths, rowHeights, cells: [[{text, x, y, w, h, lines, size, align, header?, bold?}]], overflow, headerFont,
 *   cellFont }  (rowHeights / cells include the header row first when the block has a header)
 */
export function layoutTable(block, frame, mood, R, opts = {}) {
  const warn = (message, check = 'table') => opts.warnings?.push({ check, severity: 'warn', message });
  const t = mood.tables ?? {};
  const headerRole = t.header?.font ?? t.header?.role ?? 'tableHeader';
  const cellRole = t.rows?.font ?? 'tableCell';
  const hBase = R.font(headerRole) ?? R.font('tableHeader');
  const cBase = R.font(cellRole) ?? R.font('tableCell');
  if (!hBase || !cBase) throw new Error('layoutTable(): the Mood has no table header / cell role');
  if (typeof t.header?.weight === 'number') hBase.weight = t.header.weight;
  const hFillRef = t.header?.fill ?? t.header?.bg;
  const hFill = R.color(hFillRef);
  const hColor = R.color(t.header?.text);
  if (hColor) {
    hBase.color = R.readableOn
      ? R.readableOn(
          hColor,
          t.header.text,
          'tables.header.text',
          hFill && !(hFill.length === 9 && hFill.endsWith('00')) ? hFill : undefined, // #RRGGBB00 = transparent
        )
      : hColor;
  }
  if (t.header?.case)
    hBase.case = ['upper', 'lower', 'title'].includes(t.header.case) ? t.header.case : 'none';
  const pad = typeof t.rows?.padding === 'number' ? t.rows.padding : R.spacing('sm');
  const minH = t.rows?.minHeight ?? t.rows?.height ?? 0;
  const header = block.header ?? null;
  const rows = block.rows ?? [];
  const nCols = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  if (t.maxRows && rows.length > t.maxRows) warn(`${rows.length} rows exceed tables.maxRows ${t.maxRows}`);
  if (t.maxCols && nCols > t.maxCols) warn(`${nCols} columns exceed tables.maxCols ${t.maxCols}`);
  // column alignment: the content's own (block.align), else tables.align.number for an all-numeric column, else
  // tables.align.text; a header cell follows its column when the content aligns it, else tables.align.header
  const numeric = (c) =>
    rows.length > 0 && rows.every((r) => /^[-+]?[\d.,]+\s?%?$/.test(String(r[c] ?? '').trim()));
  const align = Array.from(
    { length: nCols },
    (_, c) => block.align?.[c] ?? (numeric(c) ? t.align?.number : undefined) ?? t.align?.text ?? 'left',
  );
  const headerAlign = (c) => block.align?.[c] ?? t.align?.header ?? align[c];
  const firstBold = t.firstColumn?.bold === true;

  const compute = (k) => {
    const hf = { ...hBase, size: sizesFor(hBase, k) };
    const cf = { ...cBase, size: sizesFor(cBase, k) };
    const minW = Array.from(
      { length: nCols },
      (_, c) => (header ? measure(header[c] ?? '', hf) : 0) + 2 * pad,
    );
    const natural = Array.from({ length: nCols }, (_, c) =>
      Math.max(minW[c], ...rows.map((r) => measure(r[c] ?? '', cf) + 2 * pad)),
    );
    const raw = proportionalWidths(natural, minW, frame.w);
    const colWidths = raw.map(r2);
    colWidths[nCols - 1] = r2(frame.w - colWidths.slice(0, -1).reduce((a, b) => a + b, 0));
    const all = [
      ...(header ? [{ cells: header, header: true }] : []),
      ...rows.map((r) => ({ cells: r, header: false })),
    ];
    const cells = [];
    const rowHeights = [];
    let y = 0;
    for (const row of all) {
      const font = row.header ? hf : cf;
      const L = font.lineHeight * font.size;
      const laid = Array.from({ length: nCols }, (_, c) => {
        const text = row.cells[c] ?? '';
        const runs = [{ text, ...(firstBold && c === 0 && !row.header ? { bold: true } : {}) }];
        return layoutText([{ runs }], { x: 0, y: 0, w: colWidths[c] - 2 * pad, h: Infinity }, font, {
          align: row.header ? headerAlign(c) : align[c],
          warnings: opts.warnings,
        });
      });
      const h = Math.max(minH, ...laid.map((l) => Math.max(l.height, L) + 2 * pad));
      let x = 0;
      cells.push(
        laid.map((l, c) => {
          const dy = (h - 2 * pad - l.height) / 2;
          const cell = {
            text: row.cells[c] ?? '',
            x: r2(x),
            y: r2(y),
            w: colWidths[c],
            h: r2(h),
            size: font.size,
            align: row.header ? headerAlign(c) : align[c],
            lines: l.lines.map((ln) => ({
              ...ln,
              x: r2(ln.x + pad),
              y: r2(ln.y + pad + dy),
              runs: ln.runs.map((r) => ({ ...r, x: r2(r.x + pad) })),
            })),
          };
          if (row.header) cell.header = true;
          if (firstBold && c === 0 && !row.header) cell.bold = true;
          x += colWidths[c];
          return cell;
        }),
      );
      rowHeights.push(r2(h));
      y += h;
    }
    const overflowX = minW.reduce((a, b) => a + b, 0) > frame.w + 0.5;
    return { colWidths, rowHeights, cells, height: y, overflowX, hf, cf };
  };

  let k = 0;
  let res = compute(0);
  const canStep = (f, kk) => sizesFor(f, kk + 1) < sizesFor(f, kk);
  while ((res.height > frame.h + 0.5 || res.overflowX) && (canStep(hBase, k) || canStep(cBase, k))) {
    k += 1;
    res = compute(k);
  }
  const overflow = res.height > frame.h + 0.5 || res.overflowX;
  if (overflow) {
    opts.warnings?.push({
      check: 'overflow',
      severity: 'warn',
      message: `table needs ${r2(res.height)}px of ${r2(frame.h)}px at the minimum sizes`,
      fix: { command: 'fitText', args: { allowBelowMin: true } },
    });
  }
  return {
    colWidths: res.colWidths,
    rowHeights: res.rowHeights,
    cells: res.cells,
    overflow,
    align,
    height: r2(res.height),
    headerFont: deckFont(res.hf),
    cellFont: deckFont(res.cf),
  };
}

/**
 * The deck `table` object, styled in the renderer's shape (packages/renderer/src/elements/table.js): header {fill,
 * font}, rows {font, altFill?}, border {color, width, vertical} (tables.rows.border; `borderStyle: 'horizontal'` →
 * no vertical rules; width ruleWidth: shape.divider.weight, else borderWidth, else 1), firstColumn, radius. Each cell carries its paragraph runs (bold
 * first column) so the renderer styles the fitted lines.
 */
export function tableElement(block, frame, mood, R, opts = {}) {
  const t = mood.tables ?? {};
  const g = layoutTable(block, frame, mood, R, opts);
  const style = { font: g.cellFont, header: { font: g.headerFont }, rows: { font: g.cellFont } };
  const hFill = R.color(t.header?.fill ?? t.header?.bg);
  if (hFill) style.header.fill = hFill;
  if (g.headerFont.color) style.header.color = g.headerFont.color;
  if (t.rows?.border) {
    const color = R.color(t.rows.border);
    if (color) {
      style.border = {
        color,
        width: ruleWidth(mood),
        vertical: t.rows.borderStyle !== 'horizontal',
      };
    }
  }
  const striped = t.rows?.striped ?? t.rows?.stripe;
  if (striped === true) {
    const alt = R.color(t.rows?.stripeColor);
    if (alt) style.rows.altFill = alt;
    else
      opts.warnings?.push({
        check: 'table',
        severity: 'info',
        message: 'tables.rows.striped without stripeColor: no stripes',
      });
  }
  if (t.firstColumn) style.firstColumn = { ...t.firstColumn };
  if (t.radius !== undefined && typeof t.radius !== 'object') style.radius = R.radius(t.radius);
  const cells = g.cells.map((row) =>
    row.map((cell) => ({
      ...cell,
      paragraphs: [{ runs: [{ text: cell.text, ...(cell.bold ? { bold: true } : {}) }] }],
    })),
  );
  const table = {
    rows: block.rows,
    colWidths: g.colWidths,
    rowHeights: g.rowHeights,
    align: g.align,
    style,
    cells,
  };
  if (block.header) table.header = block.header;
  return { table, overflow: g.overflow };
}
