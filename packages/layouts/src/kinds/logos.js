/**
 * Title + a logo wall (n = min(8, items) per row). With components.logoWall.tokens.height the row is logo + label
 * tall, centred in the body area; without it the row fills the body area.
 */
import {
  createBuilder,
  flowBox,
  flowCount,
  nodesOf,
  normSummary,
  standardTitle,
  v2Block,
  estimateLines,
} from '../common.js';
import { LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

/**
 * A content/2 logos block: its title ("Trusted by", eyebrow else h3) right above the wall; logo cards (items with a
 * body: the card component, up to 4 a row, each as tall as its logo, heading and longest body need) or a wall of logo
 * chips in the block's own rows (`rows`; the fullest row sets the logo size); the group centred in the body area when
 * its height is known (logo cards; components.logoWall.tokens.height).
 */
function logosV2(b, block, area, n) {
  const { mood } = b;
  const md = space(mood, 'md');
  const sm = space(mood, 'sm');
  const t = mood.components?.logoWall?.tokens ?? {};
  const f = new Set(block.fields ?? []);
  const count = nodesOf(block) || n;
  const hr = pickRole(mood, 'eyebrow', 'h3');
  const hh = block.title ? lineBox(mood, hr, hr === 'eyebrow' ? LINES.one : LINES.heading) : 0;
  const head = hh ? hh + md : 0;
  const cards = f.has('body');
  const cols = cards ? Math.min(4, count) : block.rows ? Number(block.perRow) || n : n;
  const rowsN = block.rows ? Number(block.rows) : Math.ceil(count / Math.max(1, cols));
  let wallH = null;
  if (cards) {
    const ct = mood.components?.card?.tokens ?? {};
    const p = typeof ct.padding === 'number' ? ct.padding : md;
    const cw = (area.w - md * (cols - 1)) / cols;
    const bodyRole = pickRole(mood, ct.bodyRole, 'body');
    const logoH = f.has('src')
      ? (typeof t.height === 'number' ? t.height : lineBox(mood, 'h3', LINES.heading)) + md
      : 0;
    const bodyLines = estimateLines(mood, bodyRole, block.chars?.body, cw - 2 * p) ?? 3;
    const cardH =
      2 * p +
      logoH +
      lineBox(mood, pickRole(mood, ct.titleRole, 'h3'), LINES.heading) +
      sm +
      lineBox(mood, bodyRole, bodyLines);
    wallH = rowsN * cardH + (rowsN - 1) * md;
  } else if (typeof t.height === 'number') {
    const one = t.height + sm + lineBox(mood, pickRole(mood, t.labelStyle, 'caption'), LINES.one);
    wallH = rowsN * one + (rowsN - 1) * md;
  }
  const total = wallH === null ? area.h : Math.min(area.h, head + wallH);
  const y0 = area.y + (area.h - total) / 2;
  if (hh) {
    b.box('logos-heading', frame(area.x, y0, area.w, hh), {
      role: 'subtitle',
      slot: 'logos-heading',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('logos-heading', 'text', 'logos-heading', { role: hr });
  }
  const wall = frame(area.x, y0 + head, area.w, total - head);
  flowBox(b, {
    id: 'logos',
    f: wall,
    role: 'group',
    slotType: 'logos',
    kind: 'logos',
    n: cols,
    itemLayout: cards ? 'logo-card' : 'logo-chip',
    maxItems: 20,
  });
  const lg = space(mood, 'lg');
  b.zone(frame(area.x, area.y, area.w, y0 - lg - area.y));
  b.zone(frame(area.x, bottom(wall) + lg, area.w, bottom(area) - bottom(wall) - lg));
}

export default {
  id: 'logos',
  kind: 'logos',
  version: 1,
  tags: ['logos', 'proof'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('logos', normSummary(ctx.summary));
    standardTitle(b, 'logos');
    const area = b.area();
    const t = mood.components?.logoWall?.tokens ?? {};
    // content/2: the block's title above the wall, logo cards, explicit rows (logosV2)
    const block = v2Block(ctx.summary, 'logos');
    if (block) {
      logosV2(b, block, area, n);
      return b.finish();
    }
    let f = area;
    if (typeof t.height === 'number') {
      const labelRole = pickRole(mood, t.labelStyle, 'caption');
      const h = Math.min(area.h, t.height + space(mood, 'sm') + lineBox(mood, labelRole, LINES.one));
      f = frame(area.x, area.y + (area.h - h) / 2, area.w, h);
      const lg = space(mood, 'lg');
      b.zone(frame(area.x, area.y, area.w, f.y - lg - area.y));
      b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    }
    flowBox(b, {
      id: 'logos',
      f,
      role: 'group',
      slotType: 'logos',
      kind: 'logos',
      n,
      itemLayout: 'logo-chip',
    });
    return b.finish();
  },
};
