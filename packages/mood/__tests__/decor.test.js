import { KINDS } from '../src/kindMap.js';
import { rule } from '../src/rules/decor.js';
import { load, messages } from './fixtures.js';

describe('MD-DECOR', () => {
  it('stripe: elements with allowedOn as kinds, maxPerSlide, imagery defaults named by the brand', () => {
    const { decor } = rule(load('stripe')).patch;
    expect(decor.elements).toHaveLength(2);
    expect(decor.elements[0]).toEqual({
      id: 'rays',
      type: 'texture',
      file: 'assets/decor/rays.png',
      layer: 'behind',
      box: { x: 0, y: 560, w: 1920, h: 520 },
      opacity: 0.85,
      placement: 'bottom-center',
      allowedOn: ['section', 'cta'],
      surfaces: ['navy'],
      frequency: 'often',
      colorable: false,
    });
    expect(decor.maxPerSlide).toBe(2);
    expect(decor.imagery).toEqual({
      treatment: 'natural',
      mask: 'card',
      textOverImage: { overlay: 'primary', opacity: 0.55, gradient: true, minContrast: 4.5 },
      crop: { defaultRatio: '16:9', focus: 'faces' },
    });
  });

  it('no decor and no imagery -> absent', () => {
    expect(rule(load('minimal')).patch).toEqual({});
  });

  it('a drawn element (no file, D2) keeps its type + draw keys as given', () => {
    const b = load('stripe');
    b.decor.elements.push({
      id: 'titleRule',
      type: 'rule',
      placement: 'under-title',
      color: 'accent',
      length: 120,
      thickness: 6,
      allowedOn: ['content'],
    });
    const el = rule(b).patch.decor.elements[2];
    expect(el).toEqual({
      id: 'titleRule',
      type: 'rule',
      placement: 'under-title',
      color: 'accent',
      length: 120,
      thickness: 6,
      // G1: content -> bullets, plus every catalogue kind stripe names no layout for
      allowedOn: ['bullets', 'text', 'steps', 'timeline', 'table', 'logos'],
    });
  });

  describe('E3: every brand-given element key is carried verbatim', () => {
    it('stripe dotGrid keeps tile + scale; an animated element keeps animated + anchor', () => {
      const b = load('stripe');
      Object.assign(b.decor.elements[0], {
        animated: 'assets/decor/rays-anim.webp',
        video: 'assets/decor/rays.mp4',
        anchor: 'fixed',
        blend: 'multiply',
        thickness: 6,
      });
      const [rays, dotGrid] = rule(b).patch.decor.elements;
      expect(dotGrid).toMatchObject({ tile: true, scale: 10 });
      expect(rays).toMatchObject({
        file: 'assets/decor/rays.png',
        animated: 'assets/decor/rays-anim.webp',
        video: 'assets/decor/rays.mp4',
        anchor: 'fixed',
        blend: 'multiply',
        thickness: 6,
      });
    });

    it("BR-ASSET's reading of the file (mime, width, height) is not a brand-given key", () => {
      const b = load('stripe');
      Object.assign(b.decor.elements[0], { mime: 'image/png', width: 1440, height: 507 });
      b.provenance = {};
      for (const k of ['mime', 'width', 'height'])
        b.provenance[`/decor/elements/0/${k}`] = { source: 'derived', from: 'BR-ASSET' };
      const el = rule(b).patch.decor.elements[0];
      expect(el.mime).toBeUndefined();
      expect(el.width).toBeUndefined();
      expect(el.height).toBeUndefined();
    });

    it('negative: a key the brand does not give is not invented', () => {
      const el = rule(load('stripe')).patch.decor.elements[0];
      expect(Object.keys(el).sort()).toEqual(
        [
          'id',
          'type',
          'file',
          'layer',
          'box',
          'opacity',
          'placement',
          'allowedOn',
          'surfaces',
          'frequency',
          'colorable',
        ].sort(),
      );
    });
  });

  describe('E2: elements with no allowed layouts', () => {
    const MSG = (id) => `decor element "${id}" has no allowed layouts (allowedOn missing or empty)`;

    it('allowedOn absent (bosch supergraphic-like, rare) -> kept with allowedOn [], unused, warned', () => {
      const b = load('stripe');
      delete b.decor.elements[0].allowedOn;
      b.decor.elements[0].frequency = 'rare';
      const r = rule(b);
      const el = r.patch.decor.elements[0];
      expect(el).toMatchObject({ id: 'rays', file: 'assets/decor/rays.png', allowedOn: [], unused: true });
      expect(r.warnings).toContainEqual({
        rule: 'MD-DECOR',
        pointer: '/decor/elements/0/allowedOn',
        message: MSG('rays'),
      });
      expect(r.provenance['/decor/elements/0'].note).toMatch(/unused: no allowed layouts/);
    });

    it('allowedOn empty, frequency sometimes or absent -> unused, warned, no question', () => {
      for (const frequency of ['sometimes', undefined]) {
        const b = load('stripe');
        b.decor.elements[0].allowedOn = [];
        if (frequency) b.decor.elements[0].frequency = frequency;
        else delete b.decor.elements[0].frequency;
        const r = rule(b);
        expect(r.patch.decor.elements[0]).toMatchObject({ allowedOn: [], unused: true });
        expect(messages(r)).toContainEqual(MSG('rays'));
        expect(r.questions).toEqual([]);
      }
    });

    it('a drawn element without allowedOn is unused too', () => {
      const b = load('stripe');
      b.decor.elements.push({ id: 'dots', type: 'pattern', color: 'accent' });
      const r = rule(b);
      expect(r.patch.decor.elements[2]).toEqual({
        id: 'dots',
        type: 'pattern',
        color: 'accent',
        allowedOn: [],
        unused: true,
      });
      expect(messages(r)).toContainEqual(MSG('dots'));
    });

    it("allowedOn ['section'] -> not unused, no warning", () => {
      const b = load('stripe');
      b.decor.elements[0].allowedOn = ['section'];
      const r = rule(b);
      expect(r.patch.decor.elements[0].allowedOn).toEqual(['section']);
      expect(r.patch.decor.elements[0].unused).toBeUndefined();
      expect(messages(r).filter((m) => /no allowed layouts/.test(m))).toEqual([]);
    });
  });

  describe('E4: a wanted element (always|often) with no allowed layouts -> optional question', () => {
    const MSG = (id) => `decor element "${id}" has no allowed layouts (allowedOn missing or empty)`;

    it.each([
      ['often, allowedOn empty', 'often', []],
      ['always, allowedOn absent', 'always', undefined],
    ])('%s -> question at the input pointer, unused, no E2 warning', (_, frequency, allowedOn) => {
      const b = load('stripe');
      b.decor.elements[1].frequency = frequency;
      if (allowedOn) b.decor.elements[1].allowedOn = allowedOn;
      else delete b.decor.elements[1].allowedOn;
      const r = rule(b);
      expect(r.patch.decor.elements[1]).toMatchObject({ id: 'dotGrid', allowedOn: [], unused: true });
      expect(r.questions).toEqual([
        {
          id: 'decor.dotGrid.allowedOn',
          pointer: '/assets/elements/1/allowedOn',
          question: 'Which layouts may dotGrid appear on?',
          neededBy: ['MD-DECOR'],
          severity: 'optional',
          options: [...KINDS],
        },
      ]);
      expect(messages(r)).not.toContainEqual(MSG('dotGrid'));
      expect(r.provenance['/decor/elements/1'].note).toMatch(/unused until answered/);
    });

    it('negative: a wanted element with allowed layouts asks nothing', () => {
      const r = rule(load('stripe'));
      expect(r.questions).toEqual([]);
      expect(r.patch.decor.elements.every((e) => !e.unused)).toBe(true);
    });

    it('an answer naming layout kinds (incl. image-text) makes it placeable, no unknown-id warning', () => {
      const b = load('stripe');
      b.decor.elements[1].allowedOn = ['image-text', 'cover'];
      const r = rule(b);
      expect(r.patch.decor.elements[1].allowedOn).toEqual(['image-text', 'cover']);
      expect(r.patch.decor.elements[1].unused).toBeUndefined();
      expect(r.questions).toEqual([]);
      expect(messages(r).filter((m) => /unknown layout id/.test(m))).toEqual([]);
    });
  });

  it('unknown surface warned', () => {
    const b = load('stripe');
    b.decor.elements[0].surfaces = ['nowhere'];
    expect(messages(rule(b))).toContainEqual(expect.stringMatching(/unknown surface "nowhere"/));
  });
});
