import { rule } from '../src/rules/components.js';
import { load, messages } from './fixtures.js';

describe('MD-COMPONENTS', () => {
  const res = rule(load('stripe'));
  const c = res.patch.components;

  it('card: variant from cards.style.kind, named tokens only, nested values flattened', () => {
    expect(c.card).toEqual({
      variant: 'outlined',
      tokens: {
        fill: 'card',
        radius: 'tile',
        shadow: 'none',
        padding: 24,
        'border.width': 1,
        'border.style': 'solid',
        'border.color': '#E5EDF5',
        'border.sides': 'all',
        titleRole: 'h2',
        bodyRole: 'body',
      },
    });
  });

  it('blocks without style|kind|variant get variant "default"; tokens are the rest', () => {
    expect(c.chip.variant).toBe('default');
    expect(c.chip.tokens).toMatchObject({
      fill: '#E2E4FF',
      text: '#533AFD',
      'padding.0': 4,
      'padding.1': 10,
      radius: 'button',
    });
    expect(c.callout.tokens['accentBar.width']).toBe(4);
    expect(Object.keys(c).sort()).toEqual(
      [
        'arrow',
        'avatar',
        'button',
        'buttonSecondary',
        'callout',
        'card',
        'chip',
        'ctaChevron',
        'icon',
        'kpi',
        'logoWall',
        'quote',
        'steps',
        'timeline',
      ].sort(),
    );
  });

  it('logoWall (D12): logos copied as items, never flattened into logos.N.* tokens', () => {
    const wall = load('stripe').components.logoWall;
    expect(c.logoWall.items).toEqual(wall.logos);
    expect(c.logoWall.items[0]).toEqual({
      file: 'assets/logos/home-w0-01.svg',
      name: 'OpenAI',
      w: 142,
      h: 34,
    });
    expect(Object.keys(c.logoWall.tokens ?? {}).filter((k) => k.startsWith('logos.'))).toEqual([]);
    expect(res.provenance['/components/logoWall/items'].from).toEqual(['/components/logoWall/logos']);
  });

  it('D12 negative: other blocks still flatten their lists into dotted tokens', () => {
    expect(c.chip.items).toBeUndefined();
    expect(c.chip.tokens['padding.0']).toBe(4);
  });

  it('kpi from charts.kpi (variant <- style), icon from components.icons', () => {
    expect(c.kpi.variant).toBe('stat');
    expect(c.kpi.tokens).toMatchObject({
      labelStyle: 'eyebrow',
      'deltaColors.up': 'semantic.success',
      sparkline: true,
    });
    expect(c.kpi.tokens.style).toBeUndefined();
    expect(c.icon.tokens).toMatchObject({ set: 'custom', size: 24, 'container.size': 40 });
    expect(res.provenance['/components/kpi'].from).toEqual(['/charts/kpi']);
  });

  it('E5: icon set (components.icons.files) -> icon.items [{name, file, variants}], not tokens', () => {
    const b = load('stripe');
    b.components.icons.files = [
      {
        file: 'assets/icons/a.svg',
        name: 'a',
        mime: 'image/svg+xml',
        width: 24,
        height: 24,
        variants: { white: 'assets/icons/a-white.svg' },
      },
      { file: 'assets/icons/b.png', name: 'b', mime: 'image/png', variants: {} },
    ];
    const r = rule(b);
    const icon = r.patch.components.icon;
    expect(icon.items).toEqual([
      { name: 'a', file: 'assets/icons/a.svg', variants: { white: 'assets/icons/a-white.svg' } },
      { name: 'b', file: 'assets/icons/b.png', variants: {} },
    ]);
    expect(Object.keys(icon.tokens).filter((k) => k.startsWith('files'))).toEqual([]);
    expect(icon.tokens.customPath).toBe('assets/icons/');
    expect(r.provenance['/components/icon/items'].from).toEqual(['/components/icons/files']);
  });

  it('E5 negative: no icon set -> no icon.items', () => {
    expect(c.icon.items).toBeUndefined();
  });

  it('absent blocks do not exist', () => {
    const r = rule(load('minimal'));
    expect(r.patch).toEqual({});
    expect(r.questions).toEqual([]);
  });

  it('negatives: unknown card kind kept + warned; card without kind -> optional question; null token dropped', () => {
    const b = load('stripe');
    b.components.cards.style.kind = 'accent';
    b.components.chip.extra = null;
    const r = rule(b);
    expect(r.patch.components.card.variant).toBe('accent');
    expect(messages(r)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/card kind "accent" is not one of/),
        expect.stringMatching(/token "extra"/),
      ]),
    );
    delete b.components.cards.style.kind;
    const r2 = rule(b);
    expect(r2.patch.components.card).toBeUndefined();
    expect(r2.questions).toContainEqual(
      expect.objectContaining({ pointer: '/cards/style/kind', severity: 'optional' }), // D5 input pointer
    );
  });
});
