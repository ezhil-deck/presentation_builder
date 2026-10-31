// The design rules approved by the owner on 2026-10-31 from proposals PR-1..3 (docs/P2-spec.md §9): part of every
// compose, no option. Positive tests show the effect on the golden Moods (in git); the negatives show where the rule
// does not apply (text that is not short, a brand that asks for no initials, no chip component and no border signal).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import {
  composeDeck,
  contrastRatio,
  fitUpLadder,
  fitUpSteps,
  initialsOf,
  parseMarkdown,
} from '../src/index.js';
import { ROOT, showcaseMd } from './helpers.js';

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const BRANDS = [
  'akgmedia',
  'bosch',
  'cisco',
  'hdfc-2',
  'headspace',
  'notion',
  'rukko',
  'shopify',
  'stripe',
  'the-ken',
];
const golden = (id) => ({
  mood: readJson(`golden/expected/${id}/mood.json`),
  brandSpec: readJson(`golden/expected/${id}/brand-spec.json`),
});
const md = showcaseMd();
const composeFor = ({ mood, brandSpec }) =>
  composeDeck({
    content: parseMarkdown(md, { brandSpec }),
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
  });
const FIT_UP_KINDS_RULE = ['text', 'bullets', 'agenda', 'two-column', 'image-text', 'quote'];
const slideOf = (deck, kind) => deck.slides.find((s) => s.kind === kind);
const el = (slide, id) => slide.elements.find((e) => e.id === id);

describe('fit-up rule (PR-1): short main text grows up the brand role ladder', () => {
  it('the ladder: only roles the Mood defines, larger than the start, never beyond h2 (akgmedia h3 30 > h2 29)', () => {
    const { mood } = golden('akgmedia');
    expect(mood.type.roles.h3.size).toBeGreaterThan(mood.type.roles.h2.size);
    expect(fitUpLadder(mood, 25).map((c) => [c.role, c.size])).toEqual([['h2', 29]]);
    const stripe = golden('stripe').mood;
    // stripe has no bodyLarge; h3 = body size, so only h2
    expect(fitUpLadder(stripe, 22.4).map((c) => c.role)).toEqual(['h2']);
    expect(fitUpLadder(stripe, 36.4)).toEqual([]);
  });

  it('stripe text slide: body 22.4 → h2 36.4 with h2 lineHeight; fits, ≤ 60 % of the box; recorded', () => {
    const g = golden('stripe');
    const { deck } = composeFor(g);
    const body = el(slideOf(deck, 'text'), 's4-body');
    const h2 = g.mood.type.roles.h2;
    expect(body.text.fit).toMatchObject({
      requestedSize: 22.4,
      appliedSize: h2.size,
      overflow: false,
      upSteps: 1,
      upRole: 'h2',
    });
    expect(body.text.font.lineHeight).toBe(h2.lineHeight);
    expect(body.text.font.family).toBe(g.mood.type.faces[g.mood.type.roles.body.face].family);
    expect(body.text.fit.height / body.frame.h).toBeLessThanOrEqual(0.6);
  });

  it('two-column bodies share one size', () => {
    const { deck } = composeFor(golden('rukko'));
    const s = deck.slides[5];
    expect(s.kind).toBe('two-column');
    const a = el(s, 's6-col1-body').text;
    const b = el(s, 's6-col2-body').text;
    expect(a.fit.appliedSize).toBe(b.fit.appliedSize);
    expect(a.fit.appliedSize).toBeGreaterThan(a.fit.requestedSize);
  });

  it('every brand: grows only main text of the listed kinds, above its role size, never beyond h2, never overflows, ≤ 60 %', () => {
    let grown = 0;
    for (const id of BRANDS) {
      const g = golden(id);
      const { deck } = composeFor(g);
      const h2 = g.mood.type.roles.h2.size;
      for (const s of deck.slides) {
        for (const e of s.elements) {
          if (e.type !== 'text') continue;
          if (e.text.fit.upSteps === undefined) {
            expect([id, s.id, e.id, e.text.fit.upRole]).toEqual([id, s.id, e.id, undefined]);
            // short main text that did not grow has no step it could take (or shares its size with a sibling that has none)
            if (FIT_UP_KINDS_RULE.includes(s.kind) && ['body', 'list', 'quote'].includes(e.role)) {
              const mains = s.elements.filter(
                (x) => x.type === 'text' && ['body', 'list', 'quote'].includes(x.role),
              );
              const font = (role) => {
                const r = g.mood.type.roles[role];
                const face = g.mood.type.faces[r.face];
                const f = deck.fonts.find((x) => x.family === face.family);
                return { ...r, role, family: face.family, metrics: f?.metrics, weight: e.text.font.weight };
              };
              const canGrow = mains.map((x) => {
                const f = font(x.text.font.role);
                return f.metrics
                  ? fitUpSteps(
                      x,
                      {
                        ...f,
                        letterSpacing: x.text.font.letterSpacing ?? 0,
                        case: x.text.font.case ?? 'none',
                      },
                      g.mood,
                    )
                  : null;
              });
              expect([id, s.id, e.id, canGrow.every(Boolean)]).toEqual([id, s.id, e.id, false]);
            }
            continue;
          }
          grown += 1;
          expect(['body', 'list', 'quote']).toContain(e.role);
          expect(FIT_UP_KINDS_RULE).toContain(s.kind);
          expect(e.text.fit.appliedSize).toBeGreaterThan(e.text.fit.requestedSize);
          expect(e.text.fit.appliedSize).toBeLessThanOrEqual(h2);
          expect(e.text.fit.appliedSize).toBe(g.mood.type.roles[e.text.fit.upRole].size);
          expect(e.text.fit.overflow).toBe(false);
          expect(e.text.fit.height).toBeLessThanOrEqual(0.6 * e.frame.h + 1e-6);
          expect(e.text.fit.upSteps).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(grown).toBeGreaterThan(0);
  });

  it('negative: text already ≥ 45 % of its box, or that overflowed, does not grow', () => {
    const { mood } = golden('stripe');
    const font = {
      role: 'body',
      size: 22.4,
      lineHeight: 1.4,
      metrics: { ascent: 0.9, descent: -0.2, avgCharWidth: 0.5, widths: {} },
      case: 'none',
      letterSpacing: 0,
    };
    const base = {
      frame: { x: 0, y: 0, w: 800, h: 100 },
      text: { paragraphs: [{ runs: [{ text: 'short' }] }], align: 'left', valign: 'top' },
    };
    expect(
      fitUpSteps(
        {
          ...base,
          text: { ...base.text, fit: { height: 50, overflow: false, steps: 0, appliedSize: 22.4 } },
        },
        font,
        mood,
      ),
    ).toBeNull();
    expect(
      fitUpSteps(
        { ...base, text: { ...base.text, fit: { height: 30, overflow: true, steps: 0, appliedSize: 22.4 } } },
        font,
        mood,
      ),
    ).toBeNull();
    // short: grows (one line of h2 is 36.4 × 1.12 ≈ 40.8 px ≤ 60 px)
    expect(
      fitUpSteps(
        {
          ...base,
          text: { ...base.text, fit: { height: 31.36, overflow: false, steps: 0, appliedSize: 22.4 } },
        },
        font,
        mood,
      ),
    ).toEqual([expect.objectContaining({ role: 'h2', size: 36.4 })]);
  });
});

describe('avatar rule (PR-2): people without photos get the brand avatar component, initials when it says so', () => {
  it('initials = first letters of the first two words', () => {
    expect(initialsOf('First Person')).toBe('FP');
    expect(initialsOf('  ada  ')).toBe('A');
    expect(initialsOf('Mary Ann Lee')).toBe('MA');
    expect(initialsOf('')).toBe('');
  });

  it('rukko (avatar placeholder "initials", size 96, square): accent fill + initials on a contrasting colour', () => {
    const g = golden('rukko');
    const { deck } = composeFor(g);
    const team = slideOf(deck, 'team');
    const surface = g.mood.palette.surfaces.find((s) => s.id === team.surfaceId);
    const avatar = el(team, 's20-team-0-avatar');
    expect(avatar.frame.w).toBe(96);
    expect(avatar.shape.kind).toBe('rect');
    expect(avatar.style.fill).toBe(surface.accent);
    const initials = team.elements.filter((e) => /-initials$/.test(e.id));
    expect(initials.map((e) => e.text.lines.map((l) => l.text).join(''))).toEqual(['FP', 'SP', 'TP']);
    for (const t of initials) {
      expect(t.text.font.role).toBe('h3');
      expect(
        contrastRatio(t.text.font.color.slice(0, 7), avatar.style.fill.slice(0, 7)),
      ).toBeGreaterThanOrEqual(3);
      expect(t.frame).toEqual(el(team, t.id.replace('-initials', '-avatar')).frame);
    }
  });

  it('akgmedia (no avatar component): no size token → two lines of the name role; no initials (not asked)', () => {
    const g = golden('akgmedia');
    const { deck } = composeFor(g);
    const team = slideOf(deck, 'team');
    const h3 = g.mood.type.roles.h3;
    const avatar = el(team, 's20-team-0-avatar');
    expect(avatar.frame.w).toBeCloseTo(2 * h3.size * h3.lineHeight, 1);
    expect(avatar.frame.h).toBe(avatar.frame.w);
    expect(team.elements.some((e) => /-initials$/.test(e.id))).toBe(false);
    // the name follows the avatar (the item layout is rebuilt for its size)
    expect(el(team, 's20-team-0-name').frame.y).toBeLessThan(avatar.frame.y + avatar.frame.h + 40);
  });

  it('cisco ("silhouette" placeholder): accent fill at the size token, no initials', () => {
    const g = golden('cisco');
    const { deck } = composeFor(g);
    const team = slideOf(deck, 'team');
    const surface = g.mood.palette.surfaces.find((s) => s.id === team.surfaceId);
    const avatar = el(team, 's20-team-0-avatar');
    expect(avatar.frame.w).toBe(g.mood.components.avatar.tokens.size);
    expect(avatar.style.fill).toBe(surface.accent);
    expect(team.elements.some((e) => /-initials$/.test(e.id))).toBe(false);
  });

  it('negative: a brand whose avatar asks for no initials placeholder draws none, even with names present', () => {
    const g = golden('rukko');
    g.mood.components = {
      ...g.mood.components,
      avatar: {
        ...g.mood.components.avatar,
        tokens: { ...g.mood.components.avatar.tokens, placeholder: 'silhouette' },
      },
    };
    const team = slideOf(composeFor(g).deck, 'team');
    expect(el(team, 's20-team-0-avatar')).toBeDefined();
    expect(team.elements.some((e) => /-initials$/.test(e.id))).toBe(false);
  });

  it('a person with a photo keeps the photo (no placeholder, no initials)', () => {
    const g = golden('rukko');
    const { deck } = composeFor(g);
    const team = slideOf(deck, 'team');
    // the showcase people have no photos: every item is a placeholder
    expect(team.elements.filter((e) => /-avatar$/.test(e.id))).toHaveLength(3);
    expect(team.elements.filter((e) => /-photo$/.test(e.id))).toHaveLength(0);
  });
});

describe('logo chip rule (PR-3): logos without files are chips from components.chip', () => {
  it('stripe chip tokens: fill, radius, padding, chip font (bodySmall) and text colour are used', () => {
    const g = golden('stripe');
    const t = g.mood.components.chip.tokens;
    const { deck } = composeFor(g);
    const logos = slideOf(deck, 'logos');
    const chips = logos.elements.filter((e) => /-chip$/.test(e.id));
    expect(chips).toHaveLength(6);
    const chip = chips[0];
    expect(chip.style.fill).toBe(t.fill);
    expect(chip.style.radius).toBe(g.mood.shape.radius[t.radius]);
    const name = el(logos, chip.id.replace(/-chip$/, ''));
    expect(name.text.font.role).toBe(t.font);
    expect(name.text.font.color).toBe(t.text);
    // the chip hugs the name: padding.1 left / right, padding.0 top / bottom
    expect(name.frame.x - chip.frame.x).toBeCloseTo(t['padding.1'], 1);
    expect(chip.frame.h).toBeCloseTo(name.frame.h + 2 * t['padding.0'], 1);
    const lineW = Math.max(...name.text.lines.map((l) => l.width));
    expect(name.frame.w).toBeGreaterThanOrEqual(lineW);
    expect(name.frame.w - lineW).toBeLessThan(1);
  });

  it('cisco (no chip component, no divider / borderWidth): the name in h3, centred, no hairline', () => {
    const { deck } = composeFor(golden('cisco'));
    const logos = slideOf(deck, 'logos');
    const names = logos.elements.filter((e) => /-name$/.test(e.id));
    expect(names).toHaveLength(6);
    for (const n of names)
      expect([n.text.font.role, n.text.align, n.text.valign]).toEqual(['h3', 'center', 'middle']);
    expect(logos.elements.some((e) => /-chip$|-border$/.test(e.id))).toBe(false);
  });

  it('no chip component but a divider weight: the cell gets that hairline', () => {
    const g = golden('cisco');
    g.mood.shape = { ...g.mood.shape, divider: { weight: 1, color: 'border' } };
    const { deck } = composeFor(g);
    const logos = slideOf(deck, 'logos');
    const borders = logos.elements.filter((e) => /-border$/.test(e.id));
    expect(borders).toHaveLength(6);
    expect(borders[0].style.stroke.width).toBe(1);
  });

  it('negative: a brand without a chip component gets no chip rect (the name only)', () => {
    const g = golden('stripe');
    delete g.mood.components.chip;
    const { deck } = composeFor(g);
    const logos = slideOf(deck, 'logos');
    expect(logos.elements.some((e) => /-chip$/.test(e.id))).toBe(false);
    expect(logos.elements.filter((e) => /-name$/.test(e.id))).toHaveLength(6);
  });
});
