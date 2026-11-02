/** Title + the agenda list (one level, h3 role). Column = the measure of that role; the rest is decor zone. */
import { createBuilder, flowBox, nodesOf, sideZone, standardTitle, v2Block, v2Blocks } from '../common.js';
import { frame, gutter, lineBox, measure, pickRole, space } from '../geometry.js';

export default {
  id: 'agenda',
  kind: 'agenda',
  version: 1,
  tags: ['opening', 'list'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'agenda');
    const area = b.area();
    const r = pickRole(mood, 'h3', 'body');
    const f = b.box('list', frame(area.x, area.y, measure(mood, r, area.w), area.h), {
      role: 'list',
      slot: 'list',
      ...b.bodyAlign({ v: 'top' }),
    });
    b.slot('list', 'list', 'list', { role: r, capacity: { minItems: 1, maxLevels: 1 } });
    sideZone(b, f, area, gutter(mood));
    return b.finish();
  },
};

/**
 * An agenda with descriptions (content/2: one `items` block of headings + bodies on an agenda slide, docs/S2-layouts.md
 * §8): one numbered `agenda-row` per item down the body area (number marker, heading 5 / description 7 columns),
 * rows as tall as the area allows up to three h3 lines each, top-aligned.
 */
export const agendaRows = {
  id: 'agenda-rows',
  kind: 'agenda',
  version: 1,
  label: 'Agenda with descriptions',
  tags: ['opening', 'list', 'rows'],
  match(summary) {
    const blocks = v2Blocks(summary);
    return blocks.length === 1 && blocks[0].type === 'items' ? 20 : 0;
  },
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    standardTitle(b, 'agenda');
    const area = b.area();
    const block = v2Block(ctx.summary, 'items');
    const n = Math.max(1, nodesOf(block) || Number(ctx.summary?.items) || 4);
    const gap = space(mood, 'md');
    const rowH = Math.min((area.h - gap * (n - 1)) / n, lineBox(mood, pickRole(mood, 'h3', 'body'), 3));
    flowBox(b, {
      id: 'cards',
      f: frame(area.x, area.y, area.w, n * rowH + (n - 1) * gap),
      role: 'group',
      slotType: 'cards',
      kind: 'cards',
      n: 1,
      itemLayout: 'agenda-row',
      direction: 'column',
      maxItems: 10,
    });
    return b.finish();
  },
};
