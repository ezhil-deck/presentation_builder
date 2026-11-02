/**
 * Title + a row of people (n = min(4, items)). With components.avatar.tokens.size the row is avatar + name + role
 * tall, centred in the body area; without it the row fills the body area. Slot type `people` (layout schema v1.2,
 * P2-spec §7 F5): the engine binds the content's `people` block here.
 */
import {
  createBuilder,
  flowBox,
  flowCells,
  flowCount,
  nodesOf,
  normSummary,
  standardTitle,
  v2Block,
} from '../common.js';
import { LINES, bottom, frame, lineBox, pickRole, space } from '../geometry.js';

/** People per row in a grid: up to 4 in one row, else 3 (a 3 × 2 or 3 × 3 grid; catalogue: team up to 9). */
export const peopleColumns = (n) => (n <= 4 ? Math.max(1, n) : 3);

/**
 * The content/2 team: the block's title (h3) and subtitle (body) above the grid (slots team-heading /
 * team-subheading), then the people as `person-card` items, up to 9 in rows of peopleColumns(n).
 */
export function peopleGrid(b, block) {
  const { mood } = b;
  let area = b.area();
  const sm = space(mood, 'sm');
  for (const [part, on, r, lines] of [
    ['heading', block.title, pickRole(mood, 'h3', 'body'), LINES.one],
    ['subheading', block.subtitle, pickRole(mood, 'body'), LINES.label],
  ]) {
    if (!on) continue;
    const h = lineBox(mood, r, lines);
    const id = `team-${part}`;
    b.box(id, frame(area.x, area.y, area.w, h), { role: 'subtitle', slot: id, ...b.bodyAlign({ v: 'top' }) });
    b.slot(id, 'text', id, { role: r });
    area = frame(area.x, area.y + h + sm, area.w, area.h - h - sm);
  }
  if (block.title || block.subtitle) area = frame(area.x, area.y + sm, area.w, area.h - sm);
  const n = Math.min(9, nodesOf(block) || 3);
  flowBox(b, {
    id: 'team',
    f: area,
    role: 'group',
    slotType: 'people',
    kind: 'team',
    n: peopleColumns(n),
    itemLayout: 'person-card',
    maxItems: 9,
  });
}

export default {
  id: 'team',
  kind: 'team',
  version: 1,
  tags: ['people'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const n = flowCount('team', normSummary(ctx.summary));
    standardTitle(b, 'team');
    // content/2 people with a title / subtitle, a bio or more than four people: the person cards in a grid
    const block = v2Block(ctx.summary, 'people');
    const f2 = new Set(block?.fields ?? []);
    if (block && (block.title || block.subtitle || f2.has('bio') || nodesOf(block) > 4)) {
      peopleGrid(b, block);
      return b.finish();
    }
    const area = b.area();
    const size = mood.components?.avatar?.tokens?.size;
    let f = area;
    if (typeof size === 'number') {
      const cellW = flowCells(area, n, space(mood, 'md'))[0].w;
      const sm = space(mood, 'sm');
      const h = Math.min(
        area.h,
        Math.min(size, cellW) +
          sm +
          lineBox(mood, 'h3', LINES.one) +
          sm +
          lineBox(mood, 'bodySmall', LINES.label),
      );
      f = frame(area.x, area.y + (area.h - h) / 2, area.w, h);
      const lg = space(mood, 'lg');
      b.zone(frame(area.x, area.y, area.w, f.y - lg - area.y));
      b.zone(frame(area.x, bottom(f) + lg, area.w, bottom(area) - bottom(f) - lg));
    }
    flowBox(b, {
      id: 'team',
      f,
      role: 'group',
      slotType: 'people',
      kind: 'team',
      n,
      itemLayout: 'person-avatar-name-role',
    });
    return b.finish();
  },
};
