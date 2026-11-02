/** Title + one chart filling the body area (the engine lays out axes / legend inside it). */
import { createBuilder, standardTitle } from '../common.js';

export default {
  id: 'chart',
  kind: 'chart',
  version: 1,
  tags: ['data', 'chart'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'chart');
    b.box('chart', b.area(), { role: 'chart', slot: 'chart' });
    b.slot('chart', 'chart', 'chart');
    return b.finish();
  },
};
