/** Title + one table filling the body area; capacity from mood.tables.maxRows / maxCols when given. */
import { createBuilder, standardTitle } from '../common.js';
import { bodyArea } from '../geometry.js';

export default {
  id: 'table',
  kind: 'table',
  version: 1,
  tags: ['data', 'table'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    standardTitle(b, 'table');
    b.box('table', bodyArea(b.mood), { role: 'table', slot: 'table' });
    const t = b.mood.tables ?? {};
    const capacity = {};
    if (Number.isInteger(t.maxRows)) capacity.maxRows = t.maxRows;
    if (Number.isInteger(t.maxCols)) capacity.maxCols = t.maxCols;
    b.slot('table', 'table', 'table', Object.keys(capacity).length ? { capacity } : {});
    return b.finish();
  },
};
