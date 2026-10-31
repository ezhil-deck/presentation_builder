import { rule } from '../src/rules/logo.js';
import { load, messages } from './fixtures.js';

describe('MD-LOGO', () => {
  const res = rule(load('stripe'));
  const { logo } = res.patch;

  it('variants with sizes, perSurface, perKind via the kind map', () => {
    expect(logo.variants.full).toEqual({ file: 'assets/logo.svg', width: 60, height: 25 });
    expect(logo.perSurface).toEqual({ page: 'monoDark', light: 'monoDark', navy: 'monoLight' });
    // G1: text, steps, timeline, table, logos are named by no stripe layout -> perLayout.content
    expect(logo.perKind).toEqual({
      cover: 'large',
      cta: 'large',
      bullets: 'small',
      text: 'small',
      steps: 'small',
      timeline: 'small',
      table: 'small',
      logos: 'small',
    });
    expect(res.provenance['/logo/perKind/cover'].from).toEqual(['/logos/perLayout/title']);
    expect(res.provenance['/logo/perKind/steps']).toMatchObject({
      from: ['/logos/perLayout/content'],
      note: expect.stringMatching(/^via content/),
    });
  });

  it('height.small from logos.height; height.large is an optional question', () => {
    expect(logo.height).toEqual({ small: 28 });
    expect(res.questions).toEqual([
      expect.objectContaining({ id: 'logos.heightLarge', severity: 'optional', neededBy: ['MD-LOGO'] }),
    ]);
    expect(logo.clearSpace).toBe(24);
    expect(logo.position).toBe('bottom-left');
  });

  it('negatives: onSurface vs surface logo conflict warned (onSurface kept); unknown variant warned; no full -> blocking question', () => {
    const b = load('stripe');
    b.surfaces[2].logo = 'full';
    b.logos.onSurface.light = 'ghost';
    delete b.logos.variants.full;
    const r = rule(b);
    expect(r.patch.logo.perSurface.navy).toBe('monoLight');
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/differs from the surface's own logo "full"/),
        expect.stringMatching(/"ghost" for surface "light" is not in logos.variants/),
      ]),
    );
    expect(r.questions).toContainEqual(
      expect.objectContaining({ pointer: '/brand/logos/full', severity: 'blocking' }), // D5 input pointer
    );
  });

  it('height.large: optional question at the input pointer (D5) until answered; the answer is used', () => {
    const r = rule(load('stripe'));
    expect(r.patch.logo.height).toEqual({ small: 28 });
    expect(r.questions).toContainEqual(
      expect.objectContaining({
        id: 'logos.heightLarge',
        pointer: '/brand/logoRules/heightLarge',
        severity: 'optional',
      }),
    );
    const b = load('stripe');
    b.logos.heightLarge = 96;
    const a = rule(b);
    expect(a.patch.logo.height).toEqual({ small: 28, large: 96 });
    expect(a.provenance['/logo/height/large'].from).toEqual(['/logos/heightLarge']);
    expect(a.questions.map((q) => q.id)).not.toContain('logos.heightLarge');
  });
});
