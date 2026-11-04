// V1 geometry item (docs/PLAN-template-library.md §9): the connector is measured for every catalogue container
// whatever its type (scripts/catalogue-geometry.mjs measureConnector, pure), so the block chain reads the visible
// sequence sign without the hidden type. Synthetic containers here; the real geometry is checked below.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULE_OPTS, measureConnector } from '../../../scripts/catalogue-geometry.mjs';
import data from '../src/data.cjs';

const box = (x, y, w, h) => ({ x, y, w, h });
const H = (at, from, to) => ({ dir: 'h', at, from, to });
const V = (at, from, to) => ({ dir: 'v', at, from, to });

describe('measureConnector (synthetic containers)', () => {
  // two items side by side, 400 px wide each, 32 px apart; the extent holds both
  const items = [box(100, 300, 400, 200), box(532, 300, 400, 200)];
  const extent = box(100, 260, 832, 240);

  test('one line across two items -> crossing 2, horizontal', () => {
    expect(measureConnector([H(280, 100, 932)], items, extent, RULE_OPTS)).toEqual({
      lines: 1,
      crossing: 2,
      orientation: 'h',
      inner: 0,
    });
  });

  test('a list with no lines -> null (negative)', () => {
    expect(measureConnector([], items, extent, RULE_OPTS)).toBeNull();
  });

  test('a line far from the container is not along it -> null', () => {
    expect(measureConnector([H(900, 100, 932)], items, extent, RULE_OPTS)).toBeNull();
  });

  test('a column of rows under one rule is one place, not a crossing', () => {
    const rows = [box(100, 300, 800, 100), box(100, 432, 800, 100)];
    const k = measureConnector(
      [H(290, 100, 900), H(416, 100, 900)],
      rows,
      box(100, 290, 800, 242),
      RULE_OPTS,
    );
    expect(k).toEqual({ lines: 2, crossing: 1, orientation: 'h', inner: 0 });
  });

  test('a vertical rule between two items crosses each at one place: no crossing', () => {
    const k = measureConnector([V(516, 300, 500)], items, extent, RULE_OPTS);
    expect(k).toEqual({ lines: 1, crossing: 1, orientation: 'v', inner: 0 });
  });

  test('ticks inside items are inner pieces', () => {
    const k = measureConnector([H(400, 120, 300), H(400, 560, 740)], items, extent, RULE_OPTS);
    expect(k).toEqual({ lines: 2, crossing: 0, orientation: 'h', inner: 2 });
  });
});

describe('the measured geometry', () => {
  const geometry = JSON.parse(readFileSync(join(data.REPO_ROOT, 'golden/catalogue/geometry.json'), 'utf8'));
  const containers = Object.values(geometry.slides).flatMap((s) => s.containers || []);

  test('every container carries a connector key (null or the measure)', () => {
    expect(containers.length).toBeGreaterThan(2000);
    for (const c of containers) expect(c).toHaveProperty('connector');
  });

  test('on a roadmap / timeline the connector agrees with rules.axis (the same two tests)', () => {
    const axisTyped = containers.filter((c) => RULE_OPTS.AXIS_TYPES.includes(c.type));
    expect(axisTyped.length).toBeGreaterThan(100);
    const differ = axisTyped.filter(
      (c) => c.rules.axis !== Boolean(c.connector && (c.connector.crossing >= 2 || c.connector.inner > 0)),
    );
    expect(differ).toEqual([]);
  });
});
