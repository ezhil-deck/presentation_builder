import { rule, spacingScale } from '../src/rules/geometry.js';
import { load, messages } from './fixtures.js';

describe('MD-GEOMETRY', () => {
  it('stripe: canvas, margins, safeArea, grid, titleZone, spacing, density', () => {
    const res = rule(load('stripe'));
    const g = res.patch.geometry;
    expect(g.canvas).toEqual({ width: 1920, height: 1080 });
    expect(g.margins).toEqual({ top: 80, right: 138, bottom: 80, left: 138 });
    expect(g.grid).toEqual({ columns: 12, gutter: 24 });
    expect(g.titleZone).toMatchObject({ y: 80, height: 120 });
    // D9: [4,8,12,16,24,32,48,64] -> indices round(7 x 0, .25, .5, .75, 1) = 0, 2, 4, 5, 7
    expect(g.spacing).toEqual({ xs: 4, sm: 12, md: 24, lg: 32, xl: 64 });
    expect(g.density).toBe('balanced');
    expect(res.provenance['/geometry/density'].from).toEqual(['/composition/density']);
    expect(res.warnings).toEqual([]);
  });

  it('fewer than 5 spacing entries: sorted, from sm upward, warned', () => {
    const res = rule(load('minimal'));
    expect(res.patch.geometry.spacing).toEqual({ sm: 8, md: 16, lg: 32 });
    expect(messages(res)).toContainEqual(expect.stringMatching(/absent: xs, xl/));
    expect(res.patch.geometry.density).toBeUndefined();
  });

  it('spacingScale sorts before picking (D9 quantile indices)', () => {
    // n = 6: indices round(5 x 0, .25, .5, .75, 1) = 0, 1, 3, 4, 5 (Math.round: 1.25 -> 1, 2.5 -> 3, 3.75 -> 4)
    expect(spacingScale([64, 4, 32, 8, 16, 12]).scale).toEqual({ xs: 4, sm: 8, md: 16, lg: 32, xl: 64 });
    expect(spacingScale([10, 20, 30, 40, 50]).scale).toEqual({ xs: 10, sm: 20, md: 30, lg: 40, xl: 50 });
  });

  it('D9 negative: never the first four + last (the superseded rule)', () => {
    expect(spacingScale([4, 8, 12, 16, 24, 32, 48, 64]).scale).not.toEqual({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 64,
    });
  });

  it('no margins -> blocking question; no spacing -> warning', () => {
    const b = load('minimal');
    delete b.layout.margins;
    delete b.layout.spacing;
    const res = rule(b);
    expect(res.patch.geometry.margins).toBeUndefined();
    expect(res.questions).toContainEqual(
      expect.objectContaining({
        pointer: '/layout/margins',
        neededBy: ['MD-GEOMETRY'],
        severity: 'blocking',
      }),
    );
    expect(messages(res)).toContain('layout.spacing not given: geometry.spacing absent');
  });
});
