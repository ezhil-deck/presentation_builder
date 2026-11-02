/**
 * Title + a row of cards (n = min(4, items)) filling the body area; each card is the `card-title-text` item. A
 * content/2 `items` block adds its group heading (`title`) above the row and takes the rich `item-card` when its
 * items carry icons, images or labels (docs/S2-layouts.md §3).
 */
import {
  createBuilder,
  flowBox,
  flowCount,
  nodesOf,
  normSummary,
  standardTitle,
  v2Block,
} from '../common.js';
import { cardItemLayout, groupHeading } from './aside.js';

/** Items per row before a content/2 items block takes two rows (the v1 card row's maximum, MAX_ITEMS.cards). */
export const CARDS_PER_ROW = 4;

/**
 * A content/2 items block over CARDS_PER_ROW items: two rows of ceil(n / 2) cards (5–6 items → 3 columns, 7–8 → 4,
 * 9–10 → 5), every item shown (maxItems = n, up to the block's 10). null for ≤ 4 items (one row, as v1).
 */
export function itemsGrid(block) {
  const n = nodesOf(block);
  if (n <= CARDS_PER_ROW) return null;
  const maxItems = Math.min(n, 10);
  return { columns: Math.ceil(maxItems / 2), maxItems };
}

export default {
  id: 'cards',
  kind: 'cards',
  version: 1,
  label: 'Cards',
  tags: ['cards', 'grid'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const block = v2Block(ctx.summary, 'items');
    const grid = itemsGrid(block);
    const n = grid?.columns ?? flowCount('cards', normSummary(ctx.summary));
    standardTitle(b, 'cards');
    flowBox(b, {
      id: 'cards',
      f: groupHeading(b, b.area(), 'cards', block),
      role: 'group',
      slotType: 'cards',
      kind: 'cards',
      n,
      itemLayout: block ? cardItemLayout(b.mood, block) : 'card-title-text',
      ...(grid ? { maxItems: grid.maxItems } : {}),
    });
    return b.finish();
  },
};
