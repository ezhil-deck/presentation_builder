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
  // (opts.cells: the composer's resolved look of rich cells, below)
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
  // content/2 rich tables (S2.a slice 3): cell specs per row (header first), the row header, the highlighted column;
  // `opts.cells` carries the brand look the composer resolved (check glyphs / icons, highlight fill + text colour,
  // chip font + padding, rating colour, thumbnail ratio, asset sizes)
  const rowHeader = block.rowHeader === true;
  const hl =
    Number.isInteger(block.highlightColumn) && block.highlightColumn < nCols ? block.highlightColumn : null;
  const richRows = block.rich
    ? [...(header ? [block.rich.header ?? []] : []), ...(block.rich.rows ?? [])]
    : hl !== null || rowHeader
      ? []
      : null;
  const look = opts.cells ?? {};
  const lineOf = (f) => f.lineHeight * f.size;

  /** One cell: {kind: text | icon | rating | image | logo | chip, text, font, align, color?, gw?, gh?, …}. */
  const specOf = (row, ri, c, hf, cf) => {
    const text = row.cells[c] ?? '';
    const rich = richRows?.[ri]?.[c] ?? null;
    const heading = row.header || rich?.type === 'heading' || (rowHeader && c === 0);
    // a heading cell in a body row: the header role, in the body rows' colour (the header colour is for its fill)
    const font = row.header ? hf : heading ? { ...hf, color: cf.color } : cf;
    const a = row.header
      ? headerAlign(c)
      : rich?.type === 'number' && block.align?.[c] === undefined
        ? 'right'
        : align[c];
    const sp = { kind: 'text', text, font, align: a, heading };
    switch (rich?.type) {
      case 'check': {
        const on = rich.value === true || rich.value === 'true';
        const mark = (on ? look.check?.on : look.check?.off) ?? {};
        if (mark.icon) {
          const side = lineOf(font);
          return { ...sp, kind: 'icon', text: '', icon: mark.icon, gw: side, gh: side };
        }
        return { ...sp, text: mark.text ?? (on ? '✓' : '✗'), color: mark.color };
      }
      case 'rating': {
        const n = Math.max(0, Math.min(10, Math.round(Number(rich.value) || 0)));
        if (Number(rich.value) > 10) warn(`rating ${rich.value} drawn as 10 dots`);
        const d = r2(0.6 * font.size);
        const gap = r2(d / 2);
        return { ...sp, kind: 'rating', text: '', n, d, gap, gw: n ? n * d + (n - 1) * gap : 0, gh: d };
      }
      case 'image':
      case 'logo': {
        const gh = 2 * lineOf(cf);
        const info = rich.src ? look.assetInfo?.(rich.src) : null;
        const own = info?.width && info?.height ? info.width / info.height : null;
        const ratio = rich.type === 'image' ? (look.thumbRatio ?? own ?? 1) : (own ?? 1);
        const out = { ...sp, kind: rich.type, text: '', gw: gh * ratio, gh };
        if (rich.src) out.src = rich.src;
        if (rich.alt ?? rich.text) out.alt = rich.alt ?? rich.text;
        if (!rich.src) return { ...sp, text: String(rich.alt ?? rich.text ?? '') };
        return out;
      }
      case 'chip': {
        const chip = look.chip;
        if (!chip || !text) return sp;
        const f = chip.font ?? font;
        return {
          ...sp,
          kind: 'chip',
          chipFont: f,
          gw: measure(text, f) + 2 * chip.padH,
          gh: lineOf(f) + 2 * chip.padV,
        };
      }
      default:
        return sp;
    }
  };

  const compute = (k) => {
    const hf = { ...hBase, size: sizesFor(hBase, k) };
    const cf = { ...cBase, size: sizesFor(cBase, k) };
    const all = [
      ...(header ? [{ cells: header, header: true }] : []),
      ...rows.map((r) => ({ cells: r, header: false })),
    ];
    const specs = all.map((row, ri) => Array.from({ length: nCols }, (_, c) => specOf(row, ri, c, hf, cf)));
    const need = (sp) =>
      sp.kind === 'text' || sp.kind === 'chip' ? measure(sp.text, sp.chipFont ?? sp.font) : 0;
    const minW = Array.from(
      { length: nCols },
      (_, c) => (header ? measure(header[c] ?? '', hf) : 0) + 2 * pad,
    );
    const natural = Array.from({ length: nCols }, (_, c) =>
      Math.max(
        minW[c],
        ...specs
          .filter((_, ri) => !all[ri].header)
          .map((r) => (r[c].kind === 'text' ? need(r[c]) : r[c].gw) + 2 * pad),
      ),
    );
    const raw = proportionalWidths(natural, minW, frame.w);
    const colWidths = raw.map(r2);
    colWidths[nCols - 1] = r2(frame.w - colWidths.slice(0, -1).reduce((a, b) => a + b, 0));
    const cells = [];
    const rowHeights = [];
    let y = 0;
    all.forEach((row, ri) => {
      const laid = Array.from({ length: nCols }, (_, c) => {
        const sp = specs[ri][c];
        if (sp.kind !== 'text') return { lines: [], height: sp.gh };
        const bold = firstBold && c === 0 && !row.header;
        const runs = [{ text: sp.text, ...(bold ? { bold: true } : {}) }];
        return layoutText([{ runs }], { x: 0, y: 0, w: colWidths[c] - 2 * pad, h: Infinity }, sp.font, {
          align: sp.align,
          warnings: opts.warnings,
        });
      });
      const h = Math.max(
        minH,
        ...laid.map((l, c) => Math.max(l.height, lineOf(specs[ri][c].font)) + 2 * pad),
      );
      let x = 0;
      cells.push(
        laid.map((l, c) => {
          const sp = specs[ri][c];
          const dy = (h - 2 * pad - l.height) / 2;
          const cell = {
            text: sp.text,
            x: r2(x),
            y: r2(y),
            w: colWidths[c],
            h: r2(h),
            size: sp.font.size,
            align: sp.align,
            lines: l.lines.map((ln) => ({
              ...ln,
              x: r2(ln.x + pad),
              y: r2(ln.y + pad + dy),
              runs: ln.runs.map((r) => ({ ...r, x: r2(r.x + pad) })),
            })),
          };
          if (row.header) cell.header = true;
          if (firstBold && c === 0 && !row.header) cell.bold = true;
          if (richRows) {
            // a heading / row-header cell in a body row takes the header font; a check glyph its colour; the
            // highlighted column its fill and text colour
            const color = c === hl && look.highlight?.color ? look.highlight.color : sp.color;
            if ((sp.heading && !row.header) || color)
              cell.font = deckFont({ ...sp.font, ...(color ? { color } : {}) });
            if (c === hl && look.highlight?.fill) cell.fill = look.highlight.fill;
            if (sp.kind !== 'text') {
              const inner = colWidths[c] - 2 * pad;
              const gw = Math.min(sp.gw, inner);
              const gx = sp.align === 'center' ? (inner - gw) / 2 : sp.align === 'right' ? inner - gw : 0;
              cell.kind = sp.kind;
              cell.graphic = {
                x: r2(x + pad + gx),
                y: r2(y + (h - sp.gh) / 2),
                w: r2(gw),
                h: r2(sp.gh),
              };
              for (const key of ['icon', 'n', 'd', 'gap', 'src', 'alt'])
                if (sp[key] !== undefined) cell[key] = sp[key];
              if (sp.kind === 'chip') cell.chipText = row.cells[c];
            }
          }
          x += colWidths[c];
          return cell;
        }),
      );
      rowHeights.push(r2(h));
      y += h;
    });
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
  // a rich table: the deck's rows / header are the cells' own text ('' where a graphic stands for the cell)
  const texts = block.rich ? cells.map((r) => r.map((c) => c.text)) : null;
  const table = {
    rows: texts ? texts.slice(block.header ? 1 : 0) : block.rows,
    colWidths: g.colWidths,
    rowHeights: g.rowHeights,
    align: g.align,
    style,
    cells,
  };
  if (block.header) table.header = texts ? texts[0] : block.header;
  return { table, overflow: g.overflow };
}
