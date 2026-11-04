/**
 * composeDeck (P2-spec §3.5): Content + Mood + layout catalogue -> Deck (schemas/deck.schema.json), deterministic
 * (same inputs -> identical JSON, keys sorted). Order per slide: kind -> layout -> surface / background -> bind ->
 * resolve -> fit -> elements (z: decor-behind 10, shapes 20, text / images 30, logo 40, footer 50, decor-front 60;
 * the background is the slide's `background`) -> logo -> footer -> decor.
 */
import { lowerSlide } from '../content/lower.js';
import { inferKind } from '../content/parse.js';
import { normalizeMetrics } from '../fit/metrics.js';
import { stableStringify, sha1, sortKeys } from '../util/stable.js';
import { validateDeck } from '../validate.js';
import { createAssets } from './assets.js';
import { bindSlots } from './bind.js';
import { createDecorState, placeDecor } from './decor.js';
import { footerElements, footerShown, placeLogo } from './logoFooter.js';
import { normalizeKind, pick } from './pick.js';
import {
  CLEAR_OF_DECOR_KINDS,
  PROPOSALS,
  anyProposal,
  clearOfDecor,
  contentFrame,
  frontBoxedDecor,
  normalizeProposals,
} from './proposals.js';
import { placeAfterFill } from './place.js';
import { FIT_UP_BOX_ROLES, FIT_UP_KINDS, applyFitUp } from './fitup.js';
import { MIN_LITERAL_CONTRAST, contrastRatio, resolve } from './resolve.js';
import { hugTitle, imageBackground, textOnBackground } from './keys.js';
import { boxShapeElement, slotElements } from './slots.js';
import { summarize } from './summary.js';
import { backgroundFor, createSurfaceState, surfaceFor } from './surface.js';

const r4 = (v) => Math.round(v * 10000) / 10000;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Does this face have a bold file? (a weight ≥ 600, or a variable range reaching 700) */
function faceHasBold(face) {
  return (face?.files ?? []).some((f) => {
    const w = String(f.weight ?? '');
    const range = w.split(/\s+/).map(Number).filter(Number.isFinite);
    if (range.length === 2) return range[0] <= 700 && range[1] >= 700;
    return range.length === 1 && range[0] >= 600;
  });
}

function deckFonts(mood, families) {
  const byFamily = new Map();
  for (const id of Object.keys(mood.type?.faces ?? {}).sort()) {
    const face = mood.type.faces[id];
    if (!families.has(face.family)) continue;
    const entry = byFamily.get(face.family) ?? { family: face.family, files: [] };
    for (const f of face.files ?? []) {
      if (!entry.files.some((x) => x.file === f.file)) entry.files.push({ ...f });
    }
    if (face.fallback && !entry.fallback) entry.fallback = face.fallback;
    // vertical metrics (em) the fitter used, so the renderer puts each baseline where the fitter did
    const m = normalizeMetrics(face.metrics);
    if (m && !entry.metrics) entry.metrics = { ascent: r4(m.ascent), descent: r4(m.descent) };
    byFamily.set(face.family, entry);
  }
  return [...byFamily.values()].sort((a, b) => a.family.localeCompare(b.family));
}

function walkElements(elements, fn) {
  for (const el of elements) {
    fn(el);
    if (el.children) walkElements(el.children, fn);
  }
}

const inside = (a, b) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
const TEXT_BOX_ROLES = new Set(['title', 'subtitle', 'eyebrow', 'body', 'list', 'quote', 'attribution']);

/**
 * Text boxes keep clear of the decor placed on the slide: a text box a decor frame overlaps ends one gutter
 * (geometry.grid.gutter, else spacing.lg) before a decor on its right half (or starts one gutter after a decor on its
 * left half) when at least half its width is left; otherwise the overlap stays and is reported (info).
 * PR-4 (`clear`: {frontBoxed, content, narrowed}): front-layer brand-boxed decor on cover / section / cta narrows the
 * box to the free side instead, down to 50 % of the content width (`narrowed` collects the box ids it narrowed).
 */
function avoidDecor(layout, decor, mood, warn, clear = null) {
  if (!decor.length) return layout;
  const gutter = mood.geometry?.grid?.gutter ?? mood.geometry?.spacing?.lg ?? 0;
  const boxes = (layout.boxes ?? []).map((box) => {
    if (!box.slot || !TEXT_BOX_ROLES.has(box.role)) return box;
    let f = { ...box.frame };
    for (const d of decor) {
      if (!overlaps(f, d.frame)) continue;
      if (clear?.frontBoxed.has(d.name)) {
        const nf = clearOfDecor(f, d.frame, clear.content);
        if (nf) {
          f = nf;
          clear.narrowed.add(box.id);
        } else warn('decor-overlap', `decor "${d.name}" overlaps the ${box.role} box "${box.id}"`, 'info');
        continue;
      }
      const mid = f.x + f.w / 2;
      if (d.frame.x >= mid && d.frame.x - gutter - f.x >= box.frame.w / 2) {
        f = { ...f, w: Math.round((d.frame.x - gutter - f.x) * 100) / 100 };
      } else if (
        d.frame.x + d.frame.w <= mid &&
        f.x + f.w - (d.frame.x + d.frame.w + gutter) >= box.frame.w / 2
      ) {
        const x = d.frame.x + d.frame.w + gutter;
        f = { ...f, x, w: Math.round((f.x + f.w - x) * 100) / 100 };
      } else {
        warn('decor-overlap', `decor "${d.name}" overlaps the ${box.role} box "${box.id}"`, 'info');
      }
    }
    const same = ['x', 'y', 'w', 'h'].every((k) => f[k] === box.frame[k]);
    return same ? box : { ...box, frame: f };
  });
  return { ...layout, boxes };
}

const GRADIENT_ANGLE = { bottom: 180, top: 0, left: 270, right: 90 };

/**
 * Text placed on a content image (e.g. the image layout's title on its full-bleed photo): the brand's
 * decor.imagery.textOverImage overlay (colour, opacity; gradient towards `direction`, default bottom) is laid over the
 * image, under the text; a text colour below 3:1 on the overlay takes the brand surface text colour that contrasts most.
 */
function textOverImage(elements, ctx) {
  const toi = ctx.mood.decor?.imagery?.textOverImage;
  const images = elements.filter((e) => e.type === 'image' && e.z === 30);
  for (const img of images) {
    const texts = elements.filter((e) => e.type === 'text' && e.z === 30 && inside(e.frame, img.frame));
    if (!texts.length) continue;
    if (!toi || !(toi.opacity > 0) || toi.overlay === 'transparent') continue;
    const color = ctx.R.color(toi.overlay);
    if (!color) continue;
    const hex = color.slice(0, 7);
    const alpha = Math.round(Math.min(1, toi.opacity) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    const style = {};
    if (toi.gradient && toi.direction !== 'none') {
      style.fill = {
        type: 'linear',
        angle: GRADIENT_ANGLE[toi.direction] ?? 180,
        stops: [
          { color: `${hex}00`, at: 0 },
          { color: `${hex}${alpha}`, at: 1 },
        ],
      };
    } else {
      style.fill = hex;
      style.opacity = Math.min(1, toi.opacity);
    }
    const overlay = {
      id: `${img.id}-overlay`,
      type: 'shape',
      role: 'overlay',
      name: 'text over image overlay',
      frame: { ...img.frame },
      z: 30,
      shape: { kind: 'rect' },
      style,
    };
    elements.splice(elements.indexOf(img) + 1, 0, overlay);
    for (const t of texts) {
      const c = t.text.font.color;
      if (!c || contrastRatio(c, hex) >= MIN_LITERAL_CONTRAST) continue;
      const best = (ctx.mood.palette?.surfaces ?? [])
        .map((sf) => ctx.R.color(sf.text) ?? null)
        .filter(Boolean)
        .sort((a, b) => contrastRatio(b, hex) - contrastRatio(a, hex))[0];
      if (best && contrastRatio(best, hex) >= MIN_LITERAL_CONTRAST) {
        ctx.warn(
          'contrast',
          `"${t.id}" colour ${c} on the image overlay ${hex}: used the brand surface text colour ${best}`,
          'info',
        );
        t.text.font.color = best;
      }
    }
  }
}

/**
 * `proposals` (docs/P3-proposals.md; default all off): {titleClearOfDecor}, `'all'` or a list ('pr4', 'PR-4', …).
 * With any proposal on, the result also carries `proposals: {options, effects}` (effects: one entry per element a
 * proposal changed, with its slide). The approved rules fit-up (PR-1), avatar initials (PR-2), logo chips (PR-3),
 * fill room (PR-F) and recorded placement (PR-C′) are part of every compose (docs/P2-spec.md §9).
 * `options.catalogue` (docs/PLAN-catalogue.md C3 / C4; default on, `false` composes with the 68 layouts only): the
 * catalogue layouts are the first layout source of every content/2 slide in pick() (the deck's use of each catalogue
 * id is passed as `options.used`, the variety tie-break); a slide composed on one records its catalogue id
 * (`slide.source.catalogue`), and the result always carries `catalogue: [{slide, index, layoutId, catalogue, key,
 * slideKey, match: 'family' | 'combination' | 'none'}]` (one entry per slide).
 */
export function composeDeck({
  content,
  mood,
  brandSpec,
  catalogue,
  engineVersion = '0.0.0',
  proposals: proposalsOpt,
  options = {},
} = {}) {
  if (!mood || (mood.schema !== 'mood/1' && mood.kind !== 'Mood')) {
    throw new Error('composeDeck() expects a Mood (schema "mood/1")');
  }
  if (!content || !Array.isArray(content.slides)) {
    throw new Error('composeDeck() needs Content ({schema: "content/1", slides})');
  }
  if (!catalogue || typeof catalogue.forKind !== 'function') {
    throw new Error('composeDeck() needs a layout catalogue ({list, forKind, get})');
  }

  const warnings = [];
  const catalogueLog = [];
  // catalogue id -> slides composed on it so far (pick's variety tie-break, C4)
  const catalogueUsed = new Map();
  const catalogueOn = options.catalogue !== false;
  const proposals = normalizeProposals(proposalsOpt);
  const effects = [];
  const frontBoxed = proposals.titleClearOfDecor ? frontBoxedDecor(mood) : null;
  const assets = createAssets(brandSpec);
  const surfaceState = createSurfaceState();
  const decorState = createDecorState();
  const families = new Set();
  const slides = content.slides ?? [];
  const total = slides.length;
  let boldWarned = false;

  const deckSlides = slides.map((cslide, i) => {
    const slideId = cslide.id ?? `s${i + 1}`;
    const slideWarnings = [];
    const warn = (check, message, severity = 'warn', extra = {}) => {
      const w = { check, severity, message, slide: slideId, ...extra };
      slideWarnings.push(w);
      warnings.push(w);
    };
    surfaceState.warn = warn;

    const requested = cslide.kind ?? inferKind(cslide, { index: i, count: total });
    const norm = normalizeKind(requested);
    const kind = norm.kind;
    // kinds this slide answers to, most specific first: the kind as written (when known) and the catalogue kind
    const kinds = norm.known ? [...new Set([requested, kind])] : [kind];
    const summary = summarize(cslide, { kind, requestedKind: requested, assetInfo: assets.info });
    const layout = pick(requested, summary, mood, catalogue, {
      warn: (c, m, s) => warn(c, m, s),
      layoutId: cslide.layout,
      options: {
        catalogue: catalogueOn,
        used: catalogueUsed,
      },
    });
    // a catalogue layout (C3): the slide records its catalogue id
    const catDef = layout?.id?.startsWith('cat-') ? catalogue.get(layout.id) : null;
    if (catDef?.catalogue)
      catalogueUsed.set(catDef.catalogue, (catalogueUsed.get(catDef.catalogue) ?? 0) + 1);
    // the catalogue log row (C3 / C4): how the slide matched, one row per slide
    let slideKey = null;
    let slideShape = null;
    try {
      if (summary.v2 && catalogue.combinationKey) {
        slideKey = catalogue.combinationKey(summary.blocks);
        slideShape = catalogue.combinationShape(summary.blocks);
      }
    } catch {
      slideKey = null;
    }
    const match = !catDef?.catalogue
      ? 'none'
      : catDef.key === slideKey
        ? 'family'
        : catalogue.combinationShape(catDef.record.combination) === slideShape
          ? 'combination'
          : 'none';
    catalogueLog.push({
      slide: slideId,
      index: i + 1,
      layoutId: layout?.id ?? null,
      catalogue: catDef?.catalogue ?? null,
      key: catDef?.key ?? null,
      slideKey,
      match,
    });

    const surface = surfaceFor(
      i,
      { kind: kinds[0], layoutKind: kind, surface: cslide.surface },
      mood,
      surfaceState,
      layout,
    );
    const R = resolve(mood, surface, { warn: (c, m, s) => warn(c, m, s) });
    // a content/2 background image (the `background` key, or an image block with treatment background)
    const bgSrc = summary.v2 ? lowerSlide(cslide).background : undefined;
    const background = bgSrc
      ? imageBackground(bgSrc, surface, { mood, R, assets, warn: (c, m, s) => warn(c, m, s) })
      : backgroundFor(kinds, surface, mood, R, assets, { rhythmStep: surfaceState.step });
    const note = (key, effect) =>
      effects.push({ proposal: PROPOSALS[key], key, slide: slideId, index: i + 1, ...effect });
    const ctx = {
      mood,
      R,
      slideId,
      assets,
      warn: (c, m, s) => warn(c, m, s),
      surface,
      catalogue,
      kind,
      note,
      layoutId: layout?.id,
    };

    const elements = [];
    // decor first: brand-boxed decor this slide shows narrows the text boxes it would sit under / over
    // (a content slide carrying `decor: false` - the Studio's per-slide override - gets none; the placement still
    // runs so the brand's frequency count stays the same and the other slides keep their decor)
    const placed = layout
      ? placeDecor({ kinds, surface, layout, mood, assets, warn: ctx.warn, state: decorState, slideId })
      : [];
    const decor = cslide.decor !== false ? placed : [];
    if (layout) {
      const clear =
        proposals.titleClearOfDecor && kinds.some((k) => CLEAR_OF_DECOR_KINDS.has(k))
          ? { frontBoxed, content: contentFrame(mood), narrowed: new Set() }
          : null;
      const lay = avoidDecor(layout, decor, mood, ctx.warn, clear);
      for (const box of lay.boxes ?? []) {
        if (box.shape && !box.slot && !(lay.slots ?? []).some((s) => s.box === box.id)) {
          elements.push(boxShapeElement(box, ctx));
        }
      }
      const original = new Map((layout.boxes ?? []).map((b) => [b.id, b]));
      const mains = [];
      for (const binding of bindSlots(cslide, lay, { warn: ctx.warn })) {
        const quiet = { ...ctx, warn: () => {} };
        const narrowed = binding.box && original.get(binding.box.id) !== binding.box;
        let els = slotElements(binding, narrowed ? quiet : ctx);
        if (narrowed && els.some((e) => e.text?.fit?.overflow)) {
          // the narrowed box does not hold the text: keep the layout's box (the decor overlap is reported)
          const box = original.get(binding.box.id);
          ctx.warn(
            'decor-overlap',
            `the ${box.role} box "${box.id}" keeps its width: the text needs it (it overlaps decor)`,
            'info',
          );
          els = slotElements({ ...binding, box }, ctx);
        } else if (narrowed) {
          els = slotElements(binding, ctx);
          if (clear?.narrowed.has(binding.box.id)) {
            const box = original.get(binding.box.id);
            ctx.note('titleClearOfDecor', {
              element: els[0]?.id ?? binding.slot.id,
              box: box.id,
              from: { x: box.frame.x, w: box.frame.w },
              to: { x: binding.box.frame.x, w: binding.box.frame.w },
            });
          }
        }
        // recorded placement rule (R-PLACE): a steps / timeline flow is placed in its zone after its fill
        placeAfterFill(binding, els, elements, slideId);
        if (
          FIT_UP_KINDS.has(kind) &&
          FIT_UP_BOX_ROLES.has(binding.box?.role) &&
          typeof binding.box?.fill !== 'number' &&
          els.length === 1 &&
          els[0].type === 'text'
        ) {
          mains.push(els[0]);
        }
        elements.push(...els);
      }
      applyFitUp(mains, ctx); // fit-up rule: recorded on each element's text.fit.upSteps / upRole
      if (summary.v2) hugTitle(elements, ctx);
      textOverImage(elements, ctx);
      textOnBackground(elements, background, ctx);
    }

    // logo (the footer's own logo stands in for a small slide logo)
    const showFooter = layout ? footerShown(kinds, layout, mood) : false;
    // (a content slide carrying `logo: false` - the Studio's per-slide override - gets no slide logo)
    const logo =
      layout && cslide.logo !== false
        ? placeLogo({
            kinds,
            surface,
            layout,
            mood,
            assets,
            warn: ctx.warn,
            slideId,
            brandName: brandSpec?.name ?? mood.name,
          })
        : null;
    if (logo && !(logo.size === 'small' && showFooter && (mood.footer?.items ?? []).includes('logo'))) {
      const clear = mood.logo?.clearSpace ?? 0;
      const f = logo.element.frame;
      const guard = { x: f.x - clear, y: f.y - clear, w: f.w + 2 * clear, h: f.h + 2 * clear };
      for (const el of elements) {
        if (el.z === 30 && overlaps(guard, el.frame)) {
          ctx.warn(
            'logo-clearspace',
            `element "${el.id}" is inside the logo's clear space (${clear}px)`,
            'warn',
            {
              elementId: el.id,
            },
          );
        }
      }
      elements.push(logo.element);
    }
    if (layout) {
      elements.push(
        ...footerElements({
          kinds,
          layout,
          mood,
          R,
          assets,
          warn: ctx.warn,
          slideId,
          number: i + 1,
          total,
          meta: content.meta,
          said: decorState.said,
        }),
      );
      elements.push(...decor);
    }

    // element warnings -> the slide report; fonts used; bold without a bold face (once per deck)
    walkElements(elements, (el) => {
      for (const w of el.warnings ?? []) {
        slideWarnings.push({ ...w, slide: slideId });
        warnings.push({ ...w, slide: slideId });
      }
      if (el.text?.font?.family) families.add(el.text.font.family);
      if (el.chart?.style?.font?.family) families.add(el.chart.style.font.family);
      if (el.table?.style?.font?.family) families.add(el.table.style.font.family);
      if (el.table?.style?.header?.font?.family) families.add(el.table.style.header.font.family);
      const bold =
        el.text?.paragraphs?.some((p) => p.runs?.some((r) => r.bold)) ||
        el.table?.cells?.some((row) => row.some((c) => c.bold));
      if (bold && !boldWarned) {
        const role = el.text?.font?.role ?? el.table?.style?.font?.role;
        const face = mood.type?.faces?.[mood.type?.roles?.[role]?.face];
        if (face && !faceHasBold(face)) {
          boldWarned = true;
          ctx.warn(
            'bold',
            `face "${face.family}" has no bold file: bold runs are measured with the regular metrics`,
            'info',
          );
        }
      }
    });

    // stable z order: background (slide) < decor-behind < shapes < text / images < logo < footer < decor-front
    const ordered = elements
      .map((el, k) => ({ el, k }))
      .sort((a, b) => (a.el.z ?? 0) - (b.el.z ?? 0) || a.k - b.k);
    const slide = {
      id: slideId,
      contentSlideId: cslide.id ?? slideId,
      kind,
      layoutId: layout?.id,
      surfaceId: surface?.id,
      background,
      elements: ordered.map((o) => o.el),
    };
    if (requested !== kind) slide.requestedKind = requested;
    if (catDef?.catalogue) slide.source = { catalogue: catDef.catalogue };
    if (cslide.notes) slide.notes = cslide.notes;
    if (mood.motion?.transition) {
      slide.transition = { name: mood.motion.transition };
      if (typeof mood.motion.duration === 'number')
        slide.transition.duration = Math.round(mood.motion.duration);
    }
    if (slideWarnings.length) slide.warnings = slideWarnings;
    return slide;
  });

  const contentHash = sha1(stableStringify(content));
  const deck = {
    schema: 'deck/1',
    id: `${mood.id}-${contentHash.slice(0, 8)}`,
    engineVersion,
    canvas: { width: 1920, height: 1080 },
    source: { brandId: mood.brandId, moodId: mood.id, moodHash: sha1(stableStringify(mood)), contentHash },
    fonts: deckFonts(mood, families),
    assets: assets.map,
    slides: deckSlides,
  };
  if (content.title) deck.title = content.title;
  if (warnings.length) deck.warnings = warnings;
  const sorted = sortKeys(deck);
  const errors = validateDeck(sorted);
  if (errors.length) {
    throw new Error(
      `composed Deck is invalid against schemas/deck.schema.json:\n${errors
        .slice(0, 10)
        .map((e) => `  ${e.pointer} ${e.message}`)
        .join('\n')}`,
    );
  }
  const result = { deck: sorted, warnings: sortKeys(warnings) };
  if (anyProposal(proposals)) result.proposals = { options: proposals, effects };
  result.catalogue = catalogueLog;
  return result;
}
