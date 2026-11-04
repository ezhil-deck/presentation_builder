// Element overrides and one-click fixes (docs/P4-spec.md §1, §2, §4; P4.1): applied after compose on the stripe
// golden deck (in git), text re-fitted by the fitter in its new frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyElementOverrides,
  clampFrame,
  contrastRatio,
  findDeckElement,
  fixCommand,
  moveInside,
  normalizeElementOverrides,
  paintedDeck,
  snapColour,
  surfaceColours,
  validateDeck,
} from '../src/index.js';
import { ROOT, stripeBrandSpec, stripeMood } from './helpers.js';

const goldenDeck = () => JSON.parse(readFileSync(join(ROOT, 'golden/expected/stripe/deck.json'), 'utf8'));
const el = (deck, id) => findDeckElement(deck, id)?.el;

let mood;
let deck;
beforeEach(() => {
  mood = stripeMood();
  deck = goldenDeck();
});

describe('normalizeElementOverrides', () => {
  it('keeps frame / locked / hidden / color, upper-cases colours and drops defaults', () => {
    expect(
      normalizeElementOverrides({
        b: { frame: { x: 1.234, y: 2, w: 3, h: 4 }, locked: false, hidden: true },
        a: { color: '#ff00aa' },
        c: { locked: false },
        d: null,
      }),
    ).toEqual({ a: { color: '#FF00AA' }, b: { frame: { x: 1.23, y: 2, w: 3, h: 4 }, hidden: true } });
    expect(normalizeElementOverrides(undefined)).toEqual({});
  });

  it('refuses unknown keys, invalid colours, bad frames and non-booleans (negative)', () => {
    expect(() => normalizeElementOverrides({ a: { colour: '#000000' } })).toThrow(/unknown element override/);
    expect(() => normalizeElementOverrides({ a: { color: 'red' } })).toThrow(/not a #RRGGBB/);
    expect(() => normalizeElementOverrides({ a: { color: '#12345' } })).toThrow(/not a #RRGGBB/);
    expect(() => normalizeElementOverrides({ a: { frame: { x: 0, y: 0, w: 0, h: 10 } } })).toThrow(
      /w and h > 0/,
    );
    expect(() => normalizeElementOverrides({ a: { frame: { x: 0, y: 0, w: 'x', h: 10 } } })).toThrow(/frame/);
    expect(() => normalizeElementOverrides({ a: { hidden: 'yes' } })).toThrow(/boolean/);
    expect(() => normalizeElementOverrides([])).toThrow(/object/);
  });
});

describe('applyElementOverrides', () => {
  it('without overrides returns the deck itself (golden decks stay byte-identical)', () => {
    const r = applyElementOverrides(deck, {}, { mood });
    expect(r.deck).toBe(deck);
    expect(r.warnings).toEqual([]);
  });

  it('a narrower title frame re-fits the text (the fitter steps the role down) and never mutates the input', () => {
    const before = el(deck, 's4-title');
    const frame = { ...before.frame, w: 400 };
    const r = applyElementOverrides(deck, { 's4-title': { frame } }, { mood, brandSpec: stripeBrandSpec() });
    const t = el(r.deck, 's4-title');
    expect(t.frame).toEqual(frame);
    expect(t.text.lines.length).toBeGreaterThan(before.text.lines.length);
    expect(t.text.fit.requestedSize).toBe(before.text.fit.requestedSize);
    expect(t.text.fit.appliedSize).toBeLessThanOrEqual(before.text.fit.appliedSize);
    expect(t.text.font.role).toBe(before.text.font.role);
    expect(t.text.align).toBe(before.text.align);
    expect(t.text.valign).toBe(before.text.valign);
    expect(el(deck, 's4-title').frame.w).toBe(1644); // input untouched
    expect(validateDeck(r.deck)).toEqual([]);
  });

  it('a text frame too small for the text overflows: the overflow warning is kept on the element, slide and deck', () => {
    const before = el(deck, 's4-title');
    const frame = { ...before.frame, w: 120, h: 30 };
    const r = applyElementOverrides(deck, { 's4-title': { frame } }, { mood });
    const t = el(r.deck, 's4-title');
    expect(t.text.fit.overflow).toBe(true);
    expect(t.warnings.some((w) => w.check === 'overflow')).toBe(true);
    expect(r.warnings.some((w) => w.check === 'overflow' && w.elementId === 's4-title')).toBe(true);
    expect(r.deck.slides[3].warnings.some((w) => w.check === 'overflow' && w.elementId === 's4-title')).toBe(
      true,
    );
    expect(r.deck.warnings.some((w) => w.check === 'overflow' && w.elementId === 's4-title')).toBe(true);
    // moved back to a roomy frame: the stale overflow warning goes
    const back = applyElementOverrides(r.deck, { 's4-title': { frame: before.frame } }, { mood });
    expect(el(back.deck, 's4-title').text.fit.overflow).toBe(false);
    expect((back.deck.warnings ?? []).some((w) => w.elementId === 's4-title')).toBe(false);
  });

  it('a move only translates the frame (lines are frame-relative and stay)', () => {
    const before = el(deck, 's4-title');
    const frame = { ...before.frame, x: before.frame.x + 40, y: before.frame.y + 10 };
    const t = el(applyElementOverrides(deck, { 's4-title': { frame } }, { mood }).deck, 's4-title');
    expect(t.frame).toEqual(frame);
    expect(t.text.lines).toEqual(before.text.lines);
  });

  it('a frame larger than the canvas is clamped to it (negative), with an info', () => {
    const r = applyElementOverrides(
      deck,
      { 's4-connector': { frame: { x: -50, y: 900, w: 4000, h: 400 } } },
      { mood },
    );
    expect(el(r.deck, 's4-connector').frame).toEqual({ x: 0, y: 680, w: 1920, h: 400 });
    expect(r.warnings.some((w) => /clamped/.test(w.message))).toBe(true);
    expect(clampFrame({ x: 1900, y: -5, w: 100, h: 10 })).toEqual({ x: 1820, y: 0, w: 100, h: 10 });
  });

  it('an unknown element id is a warning, never an error (negative)', () => {
    const r = applyElementOverrides(deck, { ghost: { hidden: true } }, { mood });
    expect(r.warnings).toEqual([expect.objectContaining({ check: 'override', elementId: 'ghost' })]);
    expect(JSON.stringify(r.deck)).toBe(JSON.stringify(deck));
  });

  it('an invalid colour is refused with a warning, the other keys of the override still apply (negative)', () => {
    const r = applyElementOverrides(deck, { 's4-title': { color: 'blue', locked: true } }, { mood });
    expect(r.warnings.some((w) => /not a #RRGGBB/.test(w.message))).toBe(true);
    const t = el(r.deck, 's4-title');
    expect(t.text.font.color).toBe(el(deck, 's4-title').text.font.color);
    expect(t.locked).toBe(true);
  });

  it("a locked element's frame override still applies (locking is an editor affordance, not a rule)", () => {
    const before = el(deck, 's4-title');
    const frame = { ...before.frame, y: 300 };
    const t = el(
      applyElementOverrides(deck, { 's4-title': { frame, locked: true } }, { mood }).deck,
      's4-title',
    );
    expect(t.locked).toBe(true);
    expect(t.frame).toEqual(frame);
  });

  it('colour: a text font colour, a shape fill, a line stroke; an image cannot take one', () => {
    const shape = deck.slides[3].elements.find((e) => e.type === 'shape');
    const image = deck.slides[3].elements.find((e) => e.type === 'image');
    const r = applyElementOverrides(
      deck,
      {
        's4-title': { color: '#ff0000' },
        [shape.id]: { color: '#00ff00' },
        's4-connector': { color: '#0000ff' },
        [image.id]: { color: '#000000' },
      },
      { mood },
    );
    expect(el(r.deck, 's4-title').text.font.color).toBe('#FF0000');
    expect(el(r.deck, shape.id).style.fill).toBe('#00FF00');
    expect(el(r.deck, 's4-connector').style.stroke.color).toBe('#0000FF');
    expect(r.warnings.some((w) => w.elementId === image.id && /colour override/.test(w.message))).toBe(true);
  });

  it('hidden: kept in the deck JSON with hidden: true, left out of the painted deck', () => {
    const r = applyElementOverrides(deck, { 's4-title': { hidden: true } }, { mood });
    expect(el(r.deck, 's4-title').hidden).toBe(true);
    expect(validateDeck(r.deck)).toEqual([]);
    const painted = paintedDeck(r.deck);
    expect(findDeckElement(painted, 's4-title')).toBeNull();
    expect(painted.slides[3].elements).toHaveLength(deck.slides[3].elements.length - 1);
    expect(paintedDeck(deck)).toBe(deck);
  });

  it('a group moves and scales its children (a child text re-fitted)', () => {
    const t = structuredClone(el(deck, 's4-title'));
    const group = {
      id: 'g1',
      type: 'group',
      frame: { x: 100, y: 100, w: 1000, h: 200 },
      z: 30,
      children: [{ ...t, id: 'g1-t', frame: { x: 100, y: 100, w: 1000, h: 200 } }],
    };
    deck.slides[3].elements.push(group);
    const r = applyElementOverrides(deck, { g1: { frame: { x: 200, y: 300, w: 500, h: 200 } } }, { mood });
    const child = el(r.deck, 'g1-t');
    expect(child.frame).toEqual({ x: 200, y: 300, w: 500, h: 200 });
    expect(child.text.lines.length).toBeGreaterThanOrEqual(t.text.lines.length);
  });
});

describe('fixCommand', () => {
  it('refit drops the frame override (other keys kept); nothing to refit without one', () => {
    const item = { elementId: 's4-title', fix: { command: 'refit' } };
    const frame = { x: 138, y: 80, w: 300, h: 40 };
    expect(
      fixCommand(deck, item, { mood, overrides: { 's4-title': { frame, locked: true } } }).elements,
    ).toEqual({ 's4-title': { locked: true } });
    expect(fixCommand(deck, item, { mood, overrides: { 's4-title': { frame } } }).elements).toEqual({
      's4-title': null,
    });
    const none = fixCommand(deck, item, { mood, overrides: {} });
    expect(none.elements).toEqual({});
    expect(none.message).toMatch(/fitter/);
  });

  it('move-inside shifts the frame into the content frame, shrinking only an axis larger than it', () => {
    const c = { x: 138, y: 80, w: 1644, h: 920 };
    expect(moveInside({ x: 10, y: 1000, w: 200, h: 50 }, c)).toEqual({ x: 138, y: 950, w: 200, h: 50 });
    expect(moveInside({ x: 0, y: 0, w: 1920, h: 100 }, c)).toEqual({ x: 138, y: 80, w: 1644, h: 100 });
    const moved = applyElementOverrides(
      deck,
      { 's4-title': { frame: { x: 20, y: 80, w: 600, h: 120 } } },
      { mood },
    );
    const r = fixCommand(
      moved.deck,
      { elementId: 's4-title', fix: { command: 'move-inside' } },
      { mood, overrides: { 's4-title': { frame: { x: 20, y: 80, w: 600, h: 120 }, locked: true } } },
    );
    expect(r.elements['s4-title']).toEqual({ frame: { x: 138, y: 80, w: 600, h: 120 }, locked: true });
    // already inside: nothing to change
    expect(
      fixCommand(deck, { elementId: 's4-title', fix: { command: 'move-inside' } }, { mood }).elements,
    ).toEqual({});
  });

  it('snap-colour picks the nearest brand surface colour reaching the required contrast', () => {
    expect(surfaceColours(mood)).toEqual(
      expect.arrayContaining(['#FFFFFF', '#061B31', '#533AFD', '#0D1738']),
    );
    const item = {
      elementId: 's4-title',
      fix: { command: 'snap-colour' },
      data: { color: '#9AA5B1', background: '#FFFFFF', min: 4.5 },
    };
    const r = fixCommand(deck, item, { mood, overrides: {} });
    const c = r.elements['s4-title'].color;
    expect(contrastRatio(c, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(surfaceColours(mood)).toContain(c);
    // the nearest of the passing colours: the muted text, not the darkest navy
    expect(c).toBe('#50617A');
    // no brand colour reaches 21:1 on mid grey (negative)
    expect(snapColour(mood, { color: '#777777', background: '#777777', min: 21 })).toBeNull();
    const none = fixCommand(
      deck,
      { ...item, data: { ...item.data, background: '#777777', min: 21 } },
      { mood },
    );
    expect(none.elements).toEqual({});
    expect(none.message).toMatch(/no brand surface colour/);
  });

  it('reset removes every override of the element', () => {
    const item = { elementId: 's4-title', fix: { command: 'reset' } };
    expect(fixCommand(deck, item, { mood, overrides: { 's4-title': { hidden: true } } }).elements).toEqual({
      's4-title': null,
    });
    expect(fixCommand(deck, item, { mood, overrides: {} }).elements).toEqual({});
  });

  it('refuses unknown commands, items without an element and elements not in the deck (negative)', () => {
    expect(() => fixCommand(deck, { elementId: 's4-title', fix: { command: 'fitText' } }, { mood })).toThrow(
      /not supported/,
    );
    expect(() => fixCommand(deck, { fix: { command: 'refit' } }, { mood })).toThrow(/elementId/);
    expect(() => fixCommand(deck, { elementId: 'ghost', fix: { command: 'reset' } }, { mood })).toThrow(
      /not in the deck/,
    );
    expect(() =>
      fixCommand(deck, { elementId: 's4-title', fix: { command: 'snap-colour' }, data: {} }, { mood }),
    ).toThrow(/data.background/);
  });
});
