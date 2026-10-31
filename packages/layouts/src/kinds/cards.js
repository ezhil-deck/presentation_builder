/** Title + a row of cards (n = min(4, items)) filling the body area; each card is the `card-title-text` item. */
import { createBuilder, flowBox, flowCount, normSummary, standardTitle } from '../common.js';
import { bodyArea } from '../geometry.js';

export default {
  id: 'cards',
  kind: 'cards',
  version: 1,
  tags: ['cards', 'grid'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const n = flowCount('cards', normSummary(ctx.summary));
    standardTitle(b, 'cards');
    flowBox(b, {
      id: 'cards',
      f: bodyArea(b.mood),
      role: 'group',
      slotType: 'cards',
      kind: 'cards',
      n,
      itemLayout: 'card-title-text',
    });
    return b.finish();
  },
};
