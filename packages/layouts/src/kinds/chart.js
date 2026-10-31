/** Title + one chart filling the body area (the engine lays out axes / legend inside it). */
import { createBuilder, standardTitle } from '../common.js';
import { bodyArea } from '../geometry.js';

export default {
  id: 'chart',
  kind: 'chart',
  version: 1,
  tags: ['data', 'chart'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'chart');
    b.box('chart', bodyArea(b.mood), { role: 'chart', slot: 'chart' });
    b.slot('chart', 'chart', 'chart');
    return b.finish();
  },
};
