// The design rules approved by the owner (docs/P2-spec.md §9): PR-1..3 on 2026-10-31, PR-F fill room and PR-C′
// recorded placement on 2026-11-03 - part of every compose, no option. Positive tests show the effect on the golden
// Moods (in git); the negatives show where the rule does not apply (text that is not short, a brand that asks for no
// initials, no chip component and no border signal, a try that would pull a pair down or add strain).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue } from '@pb/layouts';
import { catalogueDef, contentAlign, decorBand } from '../../layouts/src/catalogue-defs.js';
import {
  PLACE_SPARE,
  ROOM_RATIO,
  ROOM_RATIO_MAX,
  addsStrain,
  chooseRoom,
  composeDeck,
  contrastRatio,
  fitUpLadder,
  fitUpSteps,
  initialsOf,
  normalizeKind,
  parseMarkdown,
  placeOffset,
  roomTries,
  shiftDown,
  summarize,
  validateDeck,
} from '../src/index.js';
import { ROOT, goldenShowcaseMd, showcaseMd } from './helpers.js';

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

// ---------------------------------------------------------------------------------------------------------------
// R-FILLROOM / R-PLACE (approved 2026-11-03): the golden showcase (content/2, what `pb build` and the golden decks
// compose) on the golden Moods. "C4" = the default build before the two rules (engine 0.3.0), frozen per item flow in
// fixtures/c4-default-flows.json: the floor the owner approved the rules against (no heading or description smaller).

const md2 = goldenShowcaseMd();
const composeV2 = ({ mood, brandSpec }) =>
  composeDeck({
    content: parseMarkdown(md2, { brandSpec }),
    mood,
    brandSpec,
    catalogue,
    engineVersion: '0.0.0',
  });
const C4 = readJson('packages/engine/__tests__/fixtures/c4-default-flows.json');
const over = (d) => d.slides.flatMap((s) => s.elements).filter((e) => e.text?.fit?.overflow).length;

/** Per item flow with a heading and a description (item 0): its slide, the roles and px drawn. */
const flowsOf = (deck) =>
  deck.slides.flatMap((s, i) =>
    s.elements
      .filter((e) => /-0-title$/.test(e.id) && e.text)
      .map((t) => {
        const x = s.elements.find((e) => e.id === t.id.replace(/-title$/, '-text'));
        return x
          ? {
              index: i + 1,
              el: t.id,
              title: t.text.font.role,
              text: x.text.font.role,
              tpx: t.text.fit.appliedSize,
              xpx: x.text.fit.appliedSize,
            }
          : null;
      })
      .filter(Boolean),
  );

/** The catalogue layout slide `n` (1-based) of the golden showcase is drawn on, built again for its summary. */
const layoutOf = ({ mood, brandSpec }, deck, n) => {
  const cs = parseMarkdown(md2, { brandSpec }).slides[n - 1];
  const summary = summarize(cs, { kind: normalizeKind(cs.kind).kind, requestedKind: cs.kind });
  return catalogue.get(deck.slides[n - 1].layoutId).build({ mood, geometry: mood.geometry, summary });
};

describe('fill room rule (R-FILLROOM, was PR-F)', () => {
  it('roomTries: monotone over the base pick, heading strictly larger, heading : text <= 2.3 or the base pair', () => {
    const { mood } = golden('bosch');
    // bosch 4: the base pick h1 / bodyLarge - only tries with text >= bodyLarge and heading >= h1
    expect(roomTries(mood, { title: 'h3', text: 'body' }, { title: 'h1', text: 'bodyLarge' })).toEqual([
      [3, 3],
      [3, 2],
      [3, 1],
    ]);
    // the box's roles as the base (nothing stepped): every step that keeps the heading larger
    expect(roomTries(mood, { title: 'h3', text: 'body' })).toEqual([
      [3, 3],
      [3, 2],
      [1, 2],
      [3, 1],
      [1, 1],
      [0, 1],
      [1, 0],
      [0, 0],
    ]);
    // notion: the base pair h1 60 / h2 29.7 (2.02 : 1) is the only pair at least as large - kept, never pulled down
    expect(
      roomTries(golden('notion').mood, { title: 'h2', text: 'body' }, { title: 'h1', text: 'h2' }),
    ).toEqual([[3, 3]]);
    expect([ROOM_RATIO, ROOM_RATIO_MAX]).toEqual([2, 2.3]);
  });

  it('chooseRoom: the largest text; then the largest heading within 2 : 1, else the smallest ratio', () => {
    const mood = {
      type: {
        roles: { a: { size: 20 }, b: { size: 30 }, c: { size: 44 }, d: { size: 64 }, e: { size: 66 } },
      },
    };
    const p = (title, text) => ({ roles: { title, text } });
    // text 30 is the largest: d (64 / 30 = 2.13) and c (1.47) - c is within 2 : 1
    expect(chooseRoom(mood, [p('d', 'b'), p('c', 'b'), p('e', 'a')]).roles).toEqual({
      title: 'c',
      text: 'b',
    });
    // only pairs over 2 : 1 at the largest text: the smallest ratio
    expect(chooseRoom(mood, [p('e', 'b'), p('d', 'b'), p('c', 'a')]).roles).toEqual({
      title: 'd',
      text: 'b',
    });
    expect(chooseRoom(mood, [])).toBeNull();
  });

  it('addsStrain: only strain the try adds (new overflow, more steps, a collapsed box with text) rejects it', () => {
    const t = (id, fit, h = 100) => ({ id, type: 'text', frame: { x: 0, y: 0, w: 100, h }, text: { fit } });
    const ok = { overflow: false, steps: 0, height: 40 };
    const base = [t('a', ok), t('when', { overflow: false, steps: 14, height: 40 })];
    expect(addsStrain([t('a', ok), t('when', { overflow: false, steps: 14, height: 40 })], base)).toBe(false);
    // negative: the same element shrunk further, a new overflow, a text box the parts left no room
    expect(addsStrain([t('a', ok), t('when', { overflow: false, steps: 15, height: 40 })], base)).toBe(true);
    expect(addsStrain([t('a', { ...ok, overflow: true }), base[1]], base)).toBe(true);
    expect(addsStrain([t('a', ok, 0), base[1]], base)).toBe(true);
    expect(addsStrain([t('a', { ...ok, steps: 1 })], [t('a', { ...ok, steps: 1 })])).toBe(false);
  });

  it('positive (bosch 4, L31-7): the description steps up (C4 bodyLarge -> h3) in the room its title leaves', () => {
    const { deck } = composeV2(golden('bosch'));
    const was = C4.flows.bosch.find((x) => x.el === 's4-steps-0-title');
    expect([was.title, was.text, was.xpx]).toEqual(['h1', 'bodyLarge', 26.6]);
    const b = el(deck.slides[3], 's4-steps-0-text');
    expect([b.text.font.role, b.text.fit.appliedSize]).toEqual(['h3', 31.92]);
    expect(el(deck.slides[3], 's4-steps-0-title').text.font.role).toBe('h1');
    // the text box is taller than C4's: it takes the room the title's unused second line leaves
    expect(b.frame.h).toBeGreaterThan(C4.frames['bosch/s4-steps-0-text'].h);
    expect(deck.slides[3].elements.some((e) => e.text?.fit?.overflow || e.text?.fit?.steps)).toBe(false);
  });

  it('positive (rukko 28): a year label shrunk in the base layout no longer blocks the description (body -> h3)', () => {
    const on = composeV2(golden('rukko')).deck.slides[27];
    const was = C4.flows.rukko.find((x) => x.el === 's28-timeline-0-title');
    expect([was.title, was.text]).toEqual(['h3', 'body']);
    // the year (`when`) stays stepped down 14 steps: the fill never touched it, so it does not block the try
    expect(el(on, 's28-timeline-0-when').text.fit.steps).toBe(14);
    expect(el(on, 's28-timeline-0-text').text.font.role).toBe('h3');
    expect(el(on, 's28-timeline-0-title').text.font.role).toBe('h2');
  });

  it('negative (bosch 4): the first try, which adds strain (h2 text stepped down 4 steps), is rejected', () => {
    const g = golden('bosch');
    expect(roomTries(g.mood, { title: 'h3', text: 'body' })[0]).toEqual([3, 3]);
    const { deck } = composeV2(g);
    expect(el(deck.slides[3], 's4-steps-0-text').text.font.role).not.toBe('h2');
  });

  it("every golden brand: no heading and no description smaller than C4, no pair at or under its text unless C4 was, pairs over 2.3 : 1 only C4's own, no overflow added", () => {
    for (const id of BRANDS) {
      const { deck } = composeV2(golden(id));
      const a = C4.flows[id];
      const b = flowsOf(deck);
      expect(b.map((x) => x.el)).toEqual(a.map((x) => x.el));
      b.forEach((x, i) => {
        const was = a[i];
        expect([id, x.el, x.xpx >= was.xpx, x.tpx >= was.tpx]).toEqual([id, x.el, true, true]);
        if (x.tpx <= x.xpx) expect([id, x.el, was.tpx <= was.xpx]).toEqual([id, x.el, true]);
        if (x.tpx / x.xpx > ROOM_RATIO_MAX + 1e-9)
          expect([id, x.el, x.title, x.text]).toEqual([id, x.el, was.title, was.text]);
      });
      expect([id, over(deck)]).toEqual([id, C4.overflow[id] ?? 0]);
      expect([id, validateDeck(deck)]).toEqual([id, []]);
    }
    // descriptions the rule draws larger than C4: 17 here (the golden Moods in git measure with avgCharWidth); the
    // full-metric `pb build` decks the owner approved grow 18 of their 80 catalogue item descriptions
    const grown = BRANDS.flatMap((id) => {
      const a = C4.flows[id];
      return flowsOf(composeV2(golden(id)).deck).filter((x, i) => x.xpx > a[i].xpx);
    });
    expect(grown).toHaveLength(17);
  });

  it('negative (notion 12): a try breaking monotony is never chosen even though it fits (h2 / body, the base layout)', () => {
    const g = golden('notion');
    const on = composeV2(g).deck.slides[11];
    const was = C4.flows.notion.find((x) => x.el === 's12-cards-0-title');
    // the base pick h1 / h2 is drawn; [0, 0] (h2 / body, the box as laid out: it fits by construction) is not a try
    expect([was.title, was.text]).toEqual(['h1', 'h2']);
    expect([
      el(on, 's12-cards-0-title').text.font.role,
      el(on, 's12-cards-0-text').text.font.role,
      el(on, 's12-cards-0-title').text.fit.appliedSize,
      el(on, 's12-cards-0-text').text.fit.appliedSize,
    ]).toEqual(['h1', 'h2', was.tpx, was.xpx]);
    expect(roomTries(g.mood, { title: 'h2', text: 'body' }, { title: 'h1', text: 'h2' })).not.toContainEqual([
      0, 0,
    ]);
  });
});

describe('recorded placement rule (R-PLACE, was PR-C′)', () => {
  /** The content extent of item k (its card left out) and its card. */
  const item = (slide, base, k) => {
    const own = slide.elements.filter((e) => e.id.startsWith(`${base}-${k}-`));
    const bg = own.find((e) => /-bg$/.test(e.id));
    const parts = own.filter((e) => e !== bg);
    const top = Math.min(...parts.map((e) => e.frame.y));
    const end = Math.max(
      ...parts.map((e) => (e.text?.fit ? e.frame.y + e.text.fit.height : e.frame.y + e.frame.h)),
    );
    return { bg: bg?.frame, top, end };
  };

  it('contentAlign: the record as recorded - fill -> middle, top -> top, middle -> middle, bottom -> bottom', () => {
    const c = (align) => ({ place: { align }, itemAlign: align });
    for (const item of [false, true])
      expect(['fill', 'top', 'middle', 'bottom'].map((a) => contentAlign(c(a), { item }))).toEqual([
        'middle',
        'top',
        'middle',
        'bottom',
      ]);
    expect(contentAlign({})).toBe('top');
  });

  it('positive (rukko, items without a card rect): a fill container is centred in its cells (10), a bottom one set at the bottom (9), rows level', () => {
    const g = golden('rukko');
    const { deck } = composeV2(g);
    for (const [n, valign] of [
      [10, 'middle'],
      [9, 'bottom'],
    ]) {
      expect(layoutOf(g, deck, n).boxes.find((x) => x.id === 'cards').flow.valign).toBe(valign);
      const ys = [0, 1, 2].map((k) => el(deck.slides[n - 1], `s${n}-cards-${k}-title`).frame.y);
      expect(new Set(ys).size).toBe(1);
    }
    // 10: C4 (C3.1: fill -> top) drew the row at the top of its cells; the rule centres it, so it sits lower
    expect(el(deck.slides[9], 's10-cards-0-title').frame.y).toBeGreaterThan(
      C4.frames['rukko/s10-cards-0-title'].y + 0.5,
    );
    // 9: at the bottom - the tallest item ends as far from the box's bottom as the content's top inset, closer to it
    // than the row's top is to the box's top (C4 centred it: bottom -> middle)
    const box = layoutOf(g, deck, 9).boxes.find((x) => x.id === 'cards').frame;
    const parts = deck.slides[8].elements.filter(
      (e) => /^s9-cards-\d-/.test(e.id) && !/-bg(-border-top)?$/.test(e.id),
    );
    const top = Math.min(...parts.map((e) => e.frame.y));
    const end = Math.max(
      ...parts.map((e) => (e.text?.fit ? e.frame.y + e.text.fit.height : e.frame.y + e.frame.h)),
    );
    expect(box.y + box.h - end).toBeLessThan(top - box.y);
  });

  it('inside a card the card is the anchor (bosch 9 / 10 / 12): content at the card top padding, the card fills its cell; a hugging list card moves with its text (11)', () => {
    const g = golden('bosch');
    const { deck } = composeV2(g);
    const pad = g.mood.components.card.tokens.padding;
    for (const [n, base, ks, valign] of [
      [9, 's9-cards', [0, 1, 2], 'bottom'],
      [10, 's10-cards', [0, 1, 2, 3, 4, 5], 'middle'],
      [12, 's12-cards', [0, 1, 2], 'middle'],
    ]) {
      const box = layoutOf(g, deck, n).boxes.find((x) => x.id === 'cards');
      // negative: the record places the group lower (9 bottom; 10 / 12 fill -> middle), yet the content stays put
      expect([n, box.flow.valign]).toEqual([n, valign]);
      for (const k of ks) {
        const x = item(deck.slides[n - 1], base, k);
        expect([n, k, Math.round((x.top - x.bg.y) * 100) / 100]).toEqual([n, k, pad]);
      }
      if (n === 9) {
        const bg = item(deck.slides[8], base, 0).bg;
        expect([bg.y, bg.h]).toEqual([box.frame.y, box.frame.h]);
      }
    }
    // a text box (11: a fill list on the Mood's card, which hugs its text) sits in the middle of its zone, card too
    const box = layoutOf(g, deck, 11).boxes.find((x) => x.id === 'list');
    expect(box.align.v).toBe('middle');
    const card = el(deck.slides[10], 's11-list-bg').frame;
    expect(card.y + card.h / 2).toBeCloseTo(box.frame.y + box.frame.h / 2, 1);
    expect(el(deck.slides[10], 's11-list').frame.y).toBeGreaterThan(card.y);
  });

  it('a steps flow is filled in its whole zone, then placed in the middle; its connector moves with it (akgmedia 4)', () => {
    const g = golden('akgmedia');
    const { deck } = composeV2(g);
    const s = deck.slides[3];
    const lay = layoutOf(g, deck, 4);
    const zone = lay.boxes.find((x) => x.id === 'steps');
    expect(zone.flow.place).toEqual({ valign: 'middle', lines: ['connector'] });
    // the connector moved down by dy; the flow's content box (PLACE_SPARE x its height) is centred in the zone
    const dy = el(s, 's4-connector').frame.y - lay.boxes.find((x) => x.id === 'connector').frame.y;
    expect(dy).toBeGreaterThan(0.5);
    const steps = s.elements.filter((e) => e.id.startsWith('s4-steps-') && !/-bg$/.test(e.id));
    const end = Math.max(
      ...steps.map((e) => (e.text?.fit ? e.frame.y + e.text.fit.height : e.frame.y + e.frame.h)),
    );
    const h = PLACE_SPARE * (end - dy - zone.frame.y);
    expect(dy).toBeCloseTo((zone.frame.h - h) / 2, 1);
    // placement changes no size: every moved text keeps its fitted height inside its box and the zone
    for (const x of steps) {
      if (x.text?.fit) {
        expect(x.text.fit.overflow).toBe(false);
        expect(x.frame.h).toBeGreaterThanOrEqual(x.text.fit.height - 0.01);
      }
      expect(x.frame.y + x.frame.h).toBeLessThanOrEqual(zone.frame.y + zone.frame.h + 0.01);
    }
  });

  it('L31-7: the flow keeps its whole zone and leaves the placement to the engine (`flow.place`)', () => {
    const { mood } = golden('akgmedia');
    const lay = catalogueDef('cat-l31-7').build({
      mood,
      geometry: mood.geometry,
      summary: { v2: true, kind: 'steps', blocks: [] },
    });
    expect(lay.boxes.find((x) => x.id === 'steps').flow.place).toEqual({
      valign: 'middle',
      lines: ['connector'],
    });
  });

  it('placeOffset / shiftDown: a flow box of 1.35 x its content set at the alignment; text boxes kept in the zone', () => {
    const zone = { x: 0, y: 100, w: 400, h: 500 };
    const els = [
      {
        id: 'n',
        type: 'text',
        frame: { x: 0, y: 100, w: 100, h: 50 },
        text: { fit: { height: 50 }, valign: 'top' },
      },
      {
        id: 't',
        type: 'text',
        frame: { x: 0, y: 160, w: 100, h: 440 },
        text: { fit: { height: 40 }, valign: 'top' },
      },
    ];
    // content 100 px: box 135 px; middle (500 - 135) / 2, bottom 500 - 135, top none
    expect(PLACE_SPARE).toBe(1.35);
    expect(placeOffset(els, zone, 'middle')).toBe(182.5);
    expect(placeOffset(els, zone, 'bottom')).toBe(365);
    expect(placeOffset(els, zone, 'top')).toBe(0);
    // negative: content filling the zone moves nothing
    expect(
      placeOffset(
        [{ ...els[0], frame: { ...els[0].frame, h: 500 }, text: { fit: { height: 500 } } }],
        zone,
        'middle',
      ),
    ).toBe(0);
    shiftDown(els, 182.5, zone);
    expect(els[0].frame.y).toBe(282.5);
    expect(els[1].frame).toEqual({ x: 0, y: 342.5, w: 100, h: 257.5 });
  });

  it('decorBand: the band between the title and the content group is a decor zone only when wider than 2 x spacing.lg', () => {
    const b = {
      mood: { geometry: { spacing: { lg: 40 } } },
      boxById: (id) => (id === 'title' ? { frame: { x: 0, y: 80, w: 100, h: 120 } } : undefined),
    };
    const area = { x: 160, y: 200, w: 1600, h: 700 };
    expect(decorBand(b, area, [{ f: { y: 290 } }], 40)).toEqual({ x: 160, y: 240, w: 1600, h: 10 });
    // negative: a group 80 px (2 x lg) under the title leaves no band
    expect(decorBand(b, area, [{ f: { y: 280 } }], 40)).toBeNull();
    // the layout: L31-7 on bosch carries the band as a decor zone between the title and the steps
    const { mood } = golden('bosch');
    const lay = catalogueDef('cat-l31-7').build({
      mood,
      geometry: mood.geometry,
      summary: { v2: true, kind: 'steps', blocks: [] },
    });
    const title = lay.boxes.find((x) => x.id === 'title').frame;
    const steps = lay.boxes.find((x) => x.id === 'steps').frame;
    const bands = lay.decor.zones.filter((z) => z.y >= title.y + title.h && z.y + z.h <= steps.y);
    expect(bands).toHaveLength(1);
    expect(bands[0].h).toBeGreaterThan(0);
  });
});
