#!/usr/bin/env node
// The Rich Slide Catalogue geometry (C2, docs/PLAN-catalogue.md): renders every catalogue slide alone, unscaled, at
// 1920 x 1080 in headless Chrome and writes golden/catalogue/geometry.json - the box, size, weight and alignment of
// every header part, marked container (data-c), field (data-f) and zone (data-zone), and for slides without fields the
// regions (the slide's children, one level down). A build step run once per catalogue version; the result is checked
// in so C3 generates layouts from boxes without a browser. Offline: every request other than about:blank / data: is
// aborted (the page links Google Fonts), so a face the page does not embed falls back - the faces seen are recorded.
// `validateGeometry(index, geometry)` (pure) is exported for the test and run at the end; any problem exits 1.
//
//   node scripts/catalogue-geometry.mjs            (npm run catalogue:geometry wraps it in caffeinate -d -u -i:
//                                                   display sleep hangs puppeteer on the owner's machine)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseAttrs } from './catalogue-index.mjs';

export const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };
/** The root dataset the catalogue's inline script sets (its defaults: no localStorage in a fresh page). */
export const ROOT_DATASET = { brand: 'headspace', scheme: 'crimson', ground: 'light', style: 'classic' };
/** Header parts, by class, measured when they are direct children of `.slide`. */
export const HEADER_PARTS = ['k', 't', 'r', 'src', 'ft', 'lg'];
const PAGES = 4;
/**
 * C3.2 (D6, D7) rule and numeral detection: a rule is at most `ruleMax` px thick and at least `ruleMin` px long; it
 * belongs to a container when it lies within `RULE_NEAR` px outside the container's extent (top / bottom / left /
 * right; up to `RULE_IN` px inside counts as the edge), or inside it between two items (`between`) or within an item
 * (`inner`: sub-points on hairlines); on a roadmap / timeline a line crossing two items or more is its `axis`. A
 * numeral / label is a short unmarked text of at most `LABEL_MAX` characters.
 */
/** The sides a container's `rules` may name (`axis` only on a roadmap / timeline). */
export const RULE_KEYS = Object.freeze(['top', 'bottom', 'left', 'right', 'between', 'inner', 'axis']);
export const RULE_OPTS = Object.freeze({
  ruleMax: 4,
  ruleMin: 48,
  RULE_NEAR: 48,
  RULE_IN: 6,
  AXIS_TYPES: ['roadmap', 'timeline', 'timeline_with_list'],
  NO_NUMERAL_TYPES: ['chart', 'table', 'paragraph', 'kpi_block', 'kpi_vb', 'title'],
  LABEL_MAX: 24,
});
const REGION_CAP = 400;

/**
 * V1 (docs/PLAN-template-library.md §9, the V0 geometry gap): the connector of a container, measured for EVERY
 * container whatever its `data-type` (so the vocabulary's block chain can read the visible sequence sign without the
 * hidden type). Pure: `lines` = the thin lines of the container's scope ({dir: 'h' | 'v', at, from, to} in px, already
 * at least `ruleMin` long; lines inside another container left out), `itemBoxes` = the union box of each item's fields,
 * `extent` = the container's extent; opts = {RULE_NEAR, RULE_IN} (RULE_OPTS). A line is ALONG the container when it
 * overlaps the extent by half its length (or half the extent) and lies within RULE_NEAR px of it, as for `rules`.
 * Returns null when no line runs along the container, else:
 *   lines       the number of lines along it;
 *   crossing    the greatest number of items one line crosses: items whose span along the line it covers by half or
 *               more, counted at distinct places (16 px apart; a column of items under one rule is one place) - the
 *               measure `rules.axis` uses on a roadmap / timeline;
 *   orientation 'h' | 'v' of that line (of the longest line when none crosses an item);
 *   inner       the line pieces inside items: lines crossing fewer than two places that lie within an item (more than
 *               RULE_IN px inside its edges across the line) - ticks, a ruled baseline, sub-point hairlines.
 * On a roadmap / timeline, `rules.axis` = crossing >= 2 or inner > 0 (the same two tests).
 */
export function measureConnector(lines, itemBoxes, extent, { RULE_NEAR, RULE_IN }) {
  const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  const E = extent;
  let along = 0;
  let inner = 0;
  let best = null;
  for (const s of lines) {
    const h = s.dir === 'h';
    const [e0, e1, p0, p1] = h ? [E.x, E.x + E.w, E.y, E.y + E.h] : [E.y, E.y + E.h, E.x, E.x + E.w];
    if (over(s.from, s.to, e0, e1) < 0.5 * Math.min(s.to - s.from, e1 - e0)) continue;
    if (s.at < p0 - RULE_NEAR || s.at > p1 + RULE_NEAR) continue;
    along += 1;
    const span = (ib) => (h ? [ib.x, ib.x + ib.w] : [ib.y, ib.y + ib.h]);
    const crossed = itemBoxes.filter((ib) => {
      const [i0, i1] = span(ib);
      return i1 > i0 && over(s.from, s.to, i0, i1) >= 0.5 * (i1 - i0);
    });
    const places = new Set(crossed.map((ib) => Math.round(span(ib)[0] / 16))).size;
    const len = s.to - s.from;
    if (!best || places > best.places || (places === best.places && len > best.len))
      best = { places, len, dir: s.dir };
    if (places >= 2) continue;
    const start = (ib) => (h ? ib.y : ib.x);
    const end = (ib) => (h ? ib.y + ib.h : ib.x + ib.w);
    const touched = itemBoxes.filter((ib) => over(s.from, s.to, ...span(ib)) > 0);
    if (touched.some((ib) => start(ib) < s.at - RULE_IN && end(ib) > s.at + RULE_IN)) inner += 1;
  }
  if (!along) return null;
  return { lines: along, crossing: best.places, orientation: best.dir, inner };
}
/** Tolerance (px) of the containment and overlap checks: boxes are rounded to whole pixels, edges by half a pixel. */
const TOL = 2;

/* ------------------------------------------------------------------------------------------------ validation */

const inCanvas = (b) => b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1920 && b.y + b.h <= 1080;
const inside = (a, b, tol = TOL) =>
  a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
const overlap = (a, b) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > TOL &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOL;
const fmt = (b) => `${b.x},${b.y} ${b.w}x${b.h}`;

/**
 * Fields the catalogue itself paints outside their container, by slide (docs/PLAN-catalogue.md §4 C2): a value set
 * `white-space: nowrap` is wider than its grid column, so the grid's last column runs past the container's box.
 * Only these fields are excused; any other field outside its container is a problem.
 */
export const KNOWN_OVERFLOWS = {
  'L5-71': ['1.value.4', '1.heading.4', '1.body.4'],
  'L38-63': ['1.value.3', '1.body.3', '1.value.6', '1.body.6'],
};

/**
 * A chart's axis labels (`point` fields) are placed absolutely under the chart frame; where the frame's height leaves
 * out part of the label row (or a label is wider than its slot), the label hangs outside the container. Allowed by
 * less than the label's own height on every side.
 */
export function isHangingChartLabel(field, container) {
  if (field.f !== 'point' || container.type !== 'chart') return false;
  const b = field.box;
  const c = container.box;
  const over = Math.max(c.x - b.x, c.y - b.y, b.x + b.w - (c.x + c.w), b.y + b.h - (c.y + c.h));
  return over < b.h;
}

/** Every problem of `geometry` against `index` (both parsed JSON), as messages naming the slide id. [] = clean. */
export function validateGeometry(index, geometry) {
  const problems = [];
  const geo = geometry.slides || {};
  const ids = new Set(index.slides.map((s) => s.id));
  for (const s of index.slides) if (!geo[s.id]) problems.push(`${s.id}: no geometry entry`);
  for (const id of Object.keys(geo))
    if (!ids.has(id)) problems.push(`${id}: geometry entry not in the index`);

  for (const s of index.slides) {
    const g = geo[s.id];
    if (!g) continue;
    const p = (msg) => problems.push(`${s.id}: ${msg}`);
    const header = g.header || {};
    if (s.title && !header.t) p('the index has a title, the geometry no .t');
    for (const [part, h] of Object.entries(header))
      if (!inCanvas(h.box)) p(`header .${part} box ${fmt(h.box)} is outside the canvas or empty`);
    // The body is the slide minus its header, so a slide without a title (cover, section, quote, full graphic) has
    // none; a slide whose title is its only container (Title only) has no body content to hold.
    const titleOnly = (s.fields || []).some((c) => c.type === 'title');
    if (header.t && !g.body) p('no body box');
    if (!header.t && g.body) p('a body box without a title');
    if (g.body && !titleOnly && g.body.h < 400) p(`body box ${fmt(g.body)} is lower than 400 px`);
    if (g.body && !inCanvas(g.body)) p(`body box ${fmt(g.body)} is outside the canvas or empty`);

    if (s.section === 'plan') {
      const containers = g.containers || [];
      const fields = g.fields || [];
      const want = s.fields.map((c) => `${c.c}:${c.type}`).join(' ');
      const got = containers.map((c) => `${c.c}:${c.type}`).join(' ');
      if (want !== got) p(`containers ${got || '(none)'} differ from the index ${want}`);
      const count = (list) => {
        const m = {};
        for (const f of list) m[`${f.c}.${f.f}`] = (m[`${f.c}.${f.f}`] || 0) + 1;
        return m;
      };
      const wantF = {};
      for (const c of s.fields) for (const [f, n] of Object.entries(c.fields)) wantF[`${c.c}.${f}`] = n;
      const gotF = count(fields);
      for (const k of new Set([...Object.keys(wantF), ...Object.keys(gotF)]))
        if (wantF[k] !== gotF[k]) p(`field ${k}: ${gotF[k] || 0} measured, the index has ${wantF[k] || 0}`);
      const seen = new Set();
      for (const f of fields) {
        const key = `${f.c}.${f.f}.${f.i}`;
        if (seen.has(key)) p(`field ${key} appears twice`);
        seen.add(key);
      }
      for (const c of containers)
        if (!inCanvas(c.box)) p(`container ${c.c} box ${fmt(c.box)} is outside the canvas or empty`);
      // C3.2: a container's rules are booleans by side; its numeral lies on the canvas, above or left of its fields
      for (const c of containers) {
        if (c.rules)
          for (const [k, v] of Object.entries(c.rules))
            if (!RULE_KEYS.includes(k) || typeof v !== 'boolean')
              p(`container ${c.c}: rules.${k} must be one of ${RULE_KEYS.join(' / ')} and a boolean`);
        if (c.connector) {
          const k = c.connector;
          if (
            ![k.lines, k.crossing, k.inner].every((n) => Number.isInteger(n) && n >= 0) ||
            k.lines < 1 ||
            !['h', 'v'].includes(k.orientation)
          )
            p(`container ${c.c}: connector must be {lines >= 1, crossing, orientation h / v, inner} or null`);
        }
        if (c.numeral) {
          if (!inCanvas(c.numeral.box))
            p(`container ${c.c}: numeral box ${fmt(c.numeral.box)} is outside the canvas or empty`);
          if (!['top', 'left'].includes(c.numeralAlign))
            p(`container ${c.c}: numeralAlign must be top or left, is ${c.numeralAlign}`);
        }
      }
      for (const f of fields) {
        const name = `field ${f.c}.${f.f}.${f.i ?? '-'}`;
        if (!inCanvas(f.box)) {
          p(`${name} box ${fmt(f.box)} is outside the canvas or empty`);
          continue;
        }
        const c = containers.find((x) => x.c === f.c);
        // A field of an unmarked sibling item (a card beside the marked first card) lies in the container's extent.
        const excused =
          (KNOWN_OVERFLOWS[s.id] || []).includes(`${f.c}.${f.f}.${f.i}`) || (c && isHangingChartLabel(f, c));
        if (c && !excused && !inside(f.box, c.box) && !(c.extent && inside(f.box, c.extent)))
          p(`${name} box ${fmt(f.box)} lies outside its container ${c.c} (${fmt(c.extent || c.box)})`);
      }
    }

    const zones = g.zones || [];
    for (const z of zones)
      if (!inCanvas(z.box)) p(`zone ${z.zone} box ${fmt(z.box)} is outside the canvas or empty`);
    if (s.section === 'shapes') {
      if (zones.length === 0) p('a shape slide without zones');
      for (let i = 0; i < zones.length; i += 1)
        for (let j = i + 1; j < zones.length; j += 1)
          if (overlap(zones[i].box, zones[j].box))
            p(
              `zones ${zones[i].zone} and ${zones[j].zone} overlap (${fmt(zones[i].box)} / ${fmt(zones[j].box)})`,
            );
      if (g.body)
        for (const z of zones)
          if (!inside(z.box, g.body))
            p(`zone ${z.zone} (${fmt(z.box)}) lies outside the body (${fmt(g.body)})`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------------------------------------ measuring */

const strip = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');

/** The catalogue page reduced to what a slide needs: every <style> block, the SVG symbol sprite, and the figures. */
export function readCataloguePage(raw) {
  const styles = [...raw.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const html = strip(raw);
  const sprites = [...html.matchAll(/<svg\b[^>]*>\s*<symbol\b[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  const figures = [];
  for (const m of html.matchAll(/<figure\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/figure>/g)) {
    const id = parseAttrs(m[1]).id;
    const cap = m[2].indexOf('<figcaption>');
    if (!id || cap < 0) throw new Error(`catalogue: a figure without an id or a figcaption (${m[1].trim()})`);
    const fr = /^\s*<div class="fr">([\s\S]*)<\/div>\s*$/.exec(m[2].slice(0, cap));
    if (!fr || !/^\s*<div class="slide\b/.test(fr[1]))
      throw new Error(
        `catalogue: ${id}: the figure is not <div class="fr"><div class="slide …">…</div></div>`,
      );
    figures.push({ id, html: fr[1].trim() });
  }
  return { styles, sprites, figures };
}

/** The measurement document: the page's styles and root dataset, the sprite, an empty host for one slide. */
export function shellHtml({ styles, sprites }) {
  const data = Object.entries(ROOT_DATASET)
    .map(([k, v]) => ` data-${k}="${v}"`)
    .join('');
  return (
    `<!doctype html><html${data}><head><meta charset="utf-8">` +
    styles.map((s) => `<style>${s}</style>`).join('\n') +
    `</head><body>${sprites.join('')}<div id="host"></div></body></html>`
  );
}

/** Runs in the page: measures the slide in #host. Plain function (serialised by puppeteer), no closures. */
function measureInPage(headerParts, regionCap, ruleOpts, connectorSrc) {
  const { ruleMax, ruleMin, RULE_NEAR, RULE_IN, AXIS_TYPES, NO_NUMERAL_TYPES, LABEL_MAX } = ruleOpts;
  // measureConnector (module scope, pure) arrives as its source: puppeteer serialises this function without closures
  // eslint-disable-next-line no-new-func
  const measureConnector = new Function(`return (${connectorSrc})`)();
  const slide = document.querySelector('#host > .slide');
  const S = slide.getBoundingClientRect();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left - S.left);
    const y = Math.round(r.top - S.top);
    return { x, y, w: Math.round(r.right - S.left) - x, h: Math.round(r.bottom - S.top) - y };
  };
  const union = (boxes) => {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const r = Math.max(...boxes.map((b) => b.x + b.w));
    const btm = Math.max(...boxes.map((b) => b.y + b.h));
    return { x, y, w: r - x, h: btm - y };
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const lineHeightPx = (el, cs) => {
    if (cs.lineHeight !== 'normal') return parseFloat(cs.lineHeight);
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;line-height:normal';
    for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch'])
      probe.style[k] = cs[k];
    probe.textContent = 'x';
    slide.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  };
  const contentHeight = (el, cs) =>
    el.getBoundingClientRect().height -
    ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
      (n, k) => n + (parseFloat(cs[k]) || 0),
      0,
    );
  const style = (el, b) => {
    const cs = getComputedStyle(el);
    const lh = lineHeightPx(el, cs);
    return {
      box: b,
      fontSize: r2(parseFloat(cs.fontSize)),
      fontWeight: Number(cs.fontWeight),
      lineHeight: r2(lh),
      textAlign: cs.textAlign,
      color: cs.color,
      // Lines from the content height (the border box less padding and borders), so a padded field counts its text only.
      lines: lh > 0 ? Math.round(contentHeight(el, cs) / lh) : 0,
    };
  };
  // An element with display: contents has no box of its own (the catalogue's timeline headings group a year and a
  // label that way): its box is the union of its child elements' boxes, its text style that of the child with the
  // longest text, and every child with text is kept as a part.
  const text = (el) => {
    if (getComputedStyle(el).display !== 'contents') return style(el, box(el));
    const kids = [...el.children].filter((k) => box(k).w > 0 || box(k).h > 0);
    const parts = kids.filter((k) => k.textContent.trim()).map((k) => style(k, box(k)));
    const main = kids
      .filter((k) => k.textContent.trim())
      .reduce((a, k) => (k.textContent.trim().length > a.textContent.trim().length ? k : a));
    const b = union(kids.map(box));
    return { ...style(main, b), lines: style(main, box(main)).lines, parts };
  };
  const cls = (el) => el.getAttribute('class');
  const own = (c) => [...slide.children].find((el) => el.classList.contains(c)) || null;

  const out = {
    background: getComputedStyle(slide).backgroundColor,
    ground: [...slide.classList].filter((c) => c !== 'slide'),
    titleFont: null,
    header: {},
  };
  for (const part of headerParts) {
    const el = own(part);
    if (!el) continue;
    const { box: b, fontSize, fontWeight, lineHeight, textAlign, color } = text(el);
    out.header[part] = { box: b, fontSize, fontWeight, lineHeight, textAlign, color };
    if (part === 't') out.titleFont = getComputedStyle(el).fontFamily;
  }
  const h = out.header;
  const top = h.r ? h.r.box.y + h.r.box.h : h.t ? h.t.box.y + h.t.box.h : null;
  const bottoms = [h.src, h.ft].filter(Boolean).map((p) => p.box.y);
  // Horizontally: the title's column, widened to the mirror of its left margin (a title at the left margin is narrower
  // than the content measure below it; a header set in a side column keeps that column).
  const left = h.t ? h.t.box.x : null;
  const right = h.t ? Math.max(h.t.box.x + h.t.box.w, 1920 - left) : null;
  out.body =
    top === null || left === null
      ? null
      : {
          x: left,
          y: top,
          w: right - left,
          h: (bottoms.length ? Math.min(...bottoms) : 1080) - top,
        };

  const byC = new Map();
  for (const el of slide.querySelectorAll('[data-c][data-type]')) {
    const c = Number(el.dataset.c);
    if (!byC.has(c)) byC.set(c, { c, type: el.dataset.type, els: [], boxes: [] });
    byC.get(c).els.push(el);
    byC.get(c).boxes.push(box(el));
  }
  out.fieldFaces = [...slide.querySelectorAll('[data-f]')].map((el) =>
    getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^"|"$/g, ''),
  );
  out.fields = [...slide.querySelectorAll('[data-f]')].map((el) => ({
    c: Number(el.dataset.c),
    f: el.dataset.f,
    i: el.dataset.i === undefined ? null : Number(el.dataset.i),
    ...text(el),
  }));
  // A container's box is the union of the elements carrying its data-c + data-type. The catalogue marks only the
  // first of a row of item elements (cards, columns): the container's other fields sit in parallel elements. The item
  // of such a field: take the marked element M with the deepest common ancestor P with the field; the item is the
  // field's ancestor at M's depth below P (M's parallel), or, when that element holds another container's marker,
  // the outermost of its descendants toward the field that does not. `items` = those item boxes (in field order,
  // once each), `extent` = the union of the box and the items.
  const fieldEls = [...slide.querySelectorAll('[data-f]')];
  const chainUp = (el) => {
    const up = [];
    for (let a = el; a && a !== slide; a = a.parentElement) up.push(a);
    return up.reverse(); // from the slide's child down to el
  };
  // C3.2 (D6): every thin line the slide draws outside its header - a border side 0 < width <= RULE_MAX px (.rt, .rb,
  // .kp, .nl > div, .ks > div, .card.tb, inline border-top / border-left …), or an element at most RULE_MAX px thick
  // painted with a background (a rule div: `height: 1.5px; background: var(--ln)`) - at least RULE_MIN px long.
  // Pseudo-elements (list ticks, dashes) and SVG internals (chart axes) are not read.
  const headerEls = headerParts.map(own).filter(Boolean);
  const alphaOf = (c) => {
    if (!c || c === 'transparent') return 0;
    const slash = /\/\s*([\d.]+%?)\s*\)$/.exec(c);
    if (slash) return slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1]);
    const rgba = /^rgba\(([^)]+)\)$/.exec(c);
    return rgba ? parseFloat(rgba[1].split(',')[3]) : 1;
  };
  const selOf = (el) =>
    `${el.tagName.toLowerCase()}${[...el.classList].map((k) => `.${k}`).join('')}${el.getAttribute('style') ? '[style]' : ''}`;
  const ruleLines = [];
  const ruleTally = {};
  for (const el of slide.querySelectorAll('*')) {
    if (el.closest('svg') || headerEls.some((x) => x.contains(el))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = box(el);
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
      const w = parseFloat(cs[`border${side}Width`]) || 0;
      const st = cs[`border${side}Style`];
      if (!(w > 0 && w <= ruleMax) || st === 'none' || st === 'hidden') continue;
      if (alphaOf(cs[`border${side}Color`]) === 0) continue;
      const h = side === 'Top' || side === 'Bottom';
      const at = side === 'Top' ? b.y : side === 'Bottom' ? b.y + b.h : side === 'Left' ? b.x : b.x + b.w;
      ruleLines.push({
        el,
        dir: h ? 'h' : 'v',
        at,
        from: h ? b.x : b.y,
        to: h ? b.x + b.w : b.y + b.h,
        how: `border-${side.toLowerCase()}`,
        sel: selOf(el),
      });
    }
    const paint = alphaOf(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none';
    if (paint && b.h <= ruleMax && b.w > ruleMax)
      ruleLines.push({
        el,
        dir: 'h',
        at: b.y + b.h / 2,
        from: b.x,
        to: b.x + b.w,
        how: 'background',
        sel: selOf(el),
      });
    else if (paint && b.w <= ruleMax && b.h > ruleMax)
      ruleLines.push({
        el,
        dir: 'v',
        at: b.x + b.w / 2,
        from: b.y,
        to: b.y + b.h,
        how: 'background',
        sel: selOf(el),
      });
  }
  for (let i = ruleLines.length - 1; i >= 0; i -= 1)
    if (ruleLines[i].to - ruleLines[i].from < ruleMin) ruleLines.splice(i, 1);
  const scopes = new Map();
  out.containers = [...byC.values()]
    .sort((a, b) => a.c - b.c)
    .map(({ c, type, els, boxes }) => {
      const b = union(boxes);
      const items = [];
      for (const f of fieldEls) {
        if (Number(f.dataset.c) !== c || els.some((e) => e.contains(f))) continue;
        const fc = chainUp(f);
        let best = null;
        for (const m of els) {
          const mc = chainUp(m);
          let k = 0;
          while (k < mc.length && k < fc.length && mc[k] === fc[k]) k += 1;
          if (!best || k > best.k) best = { k, d: mc.length - 1 - k };
        }
        const below = fc.slice(best.k); // A (the child of P toward the field) ... the field
        let j = Math.min(best.d, below.length - 1);
        const foreign = (el) =>
          [el, ...el.querySelectorAll('[data-type]')].some(
            (x) => x.dataset.type && Number(x.dataset.c) !== c,
          );
        while (j < below.length - 1 && foreign(below[j])) j += 1;
        if (!items.includes(below[j])) items.push(below[j]);
      }
      // The class list of the marked element(s), in document order and once each (C3 reads `card` from it: the
      // catalogue's card containers carry it on the marked first card).
      const classes = [];
      for (const e of els) for (const k of e.classList) if (!classes.includes(k)) classes.push(k);
      // The classes from the container's first field up to its item (the marked element, or the field's parallel item
      // element), field first: the catalogue often draws the cards inside an unmarked wrapper or on the field itself.
      const first = fieldEls.find((f) => Number(f.dataset.c) === c);
      const itemClasses = [];
      if (first) {
        const marked = els.find((e) => e.contains(first));
        const stop = marked || items.find((it) => it.contains(first)) || null;
        for (let a = first; a && a !== slide; a = a.parentElement) {
          if (a === marked) break;
          for (const k of a.classList) if (!itemClasses.includes(k)) itemClasses.push(k);
          if (a === stop) break;
        }
      }
      // Whether the first item carries an unmarked numeral (01, 1, Step 1, Phase 1 …): the catalogue numbers its items.
      let numbered = false;
      if (first) {
        const marked = els.find((e) => e.contains(first));
        let item = marked || items.find((it) => it.contains(first)) || null;
        if (marked && !items.length && marked !== first) {
          // the marked element wraps every item: the item is its child on the way to the first field
          let a = first;
          while (a.parentElement && a.parentElement !== marked) a = a.parentElement;
          item = a.parentElement === marked ? a : marked;
        }
        const NUMERAL = /^(?:0?[1-9]|[1-9][0-9])\.?$|^(?:step|phase|stage|level|move|part) [0-9]+$/i;
        if (item)
          numbered = [item, ...item.querySelectorAll('*')].some(
            (el) =>
              !el.hasAttribute('data-f') &&
              !el.querySelector('[data-f]') &&
              !el.closest('[data-f]') &&
              el.children.length === 0 &&
              NUMERAL.test(el.textContent.trim()),
          );
      }
      const rec = { c, type, box: b, elements: boxes.length, classes, itemClasses, numbered };
      if (items.length) {
        rec.items = items.map(box);
        rec.extent = union([b, ...rec.items]);
      }
      scopes.set(c, [...els, ...items]);
      return rec;
    });

  // C3.2 (D6, D7): the rules a container is separated or framed by, and the numeral / year / label of its first item.
  const inScope = (el, c) => scopes.get(c).some((s) => s.contains(el));
  // an element inside another container's marked element or item (and not inside this one's) is that container's
  const foreign = (el, c) => !inScope(el, c) && [...scopes.keys()].some((d) => d !== c && inScope(el, d));
  const fieldBox = (el) => {
    if (getComputedStyle(el).display !== 'contents') return box(el);
    const kids = [...el.children].map(box).filter((k) => k.w > 0 || k.h > 0);
    return kids.length ? union(kids) : box(el);
  };
  const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  for (const rec of out.containers) {
    const own = fieldEls.filter((f) => Number(f.dataset.c) === rec.c);
    const byI = new Map();
    for (const f of own) {
      const k = f.dataset.i === undefined ? 0 : Number(f.dataset.i);
      if (!byI.has(k)) byI.set(k, []);
      byI.get(k).push(f);
    }
    const order = [...byI.keys()].sort((a, b) => a - b);
    const itemBoxes = order.map((k) => union(byI.get(k).map(fieldBox)));
    const E = rec.extent ?? rec.box;
    const axisType = AXIS_TYPES.includes(rec.type);
    const r = { top: false, bottom: false, left: false, right: false, between: false, inner: false };
    let axis = false;
    for (const s of ruleLines) {
      if (foreign(s.el, rec.c)) continue;
      const h = s.dir === 'h';
      const [e0, e1, p0, p1] = h ? [E.x, E.x + E.w, E.y, E.y + E.h] : [E.y, E.y + E.h, E.x, E.x + E.w];
      if (over(s.from, s.to, e0, e1) < 0.5 * Math.min(s.to - s.from, e1 - e0)) continue;
      if (s.at < p0 - RULE_NEAR || s.at > p1 + RULE_NEAR) continue;
      const span = (ib) => (h ? [ib.x, ib.x + ib.w] : [ib.y, ib.y + ib.h]);
      // a line along a roadmap / timeline crossing two items or more is its axis (our steps connector / line)
      const along = itemBoxes.filter((ib) => {
        const [i0, i1] = span(ib);
        return i1 > i0 && over(s.from, s.to, i0, i1) >= 0.5 * (i1 - i0);
      });
      // (items at two places along the line at least: a column of phases under one rule is not crossed by it)
      const places = new Set(along.map((ib) => Math.round(span(ib)[0] / 16)));
      if (axisType && places.size >= 2) {
        axis = true;
        continue;
      }
      // by the items the line crosses: above them all -> top (left), below them all -> bottom (right), items on both
      // sides -> between, inside an item -> inner; crossing none: the side of the extent it lies on
      const cross = itemBoxes.filter((ib) => over(s.from, s.to, ...span(ib)) > 0);
      const end = (ib) => (h ? ib.y + ib.h : ib.x + ib.w);
      const start = (ib) => (h ? ib.y : ib.x);
      const before = cross.some((ib) => end(ib) <= s.at + RULE_IN);
      const after = cross.some((ib) => start(ib) >= s.at - RULE_IN);
      const within = cross.some((ib) => start(ib) < s.at - RULE_IN && end(ib) > s.at + RULE_IN);
      let side;
      if (within) side = 'inner';
      else if (before && after) side = 'between';
      else if (after) side = h ? 'top' : 'left';
      else if (before) side = h ? 'bottom' : 'right';
      else side = s.at < (p0 + p1) / 2 ? (h ? 'top' : 'left') : h ? 'bottom' : 'right';
      // a roadmap's / timeline's lines inside its items are the pieces of its axis (ticks, a ruled baseline)
      if (axisType && side === 'inner') {
        axis = true;
        continue;
      }
      r[side] = true;
      ruleTally[`${s.how} ${s.sel}`] = (ruleTally[`${s.how} ${s.sel}`] || 0) + 1;
    }
    rec.rules = axisType ? { ...r, axis } : r;
    // V1: the connector, for every container whatever its type (the lines of its own scope, as above)
    rec.connector = measureConnector(
      ruleLines.filter((s) => !foreign(s.el, rec.c)).map(({ dir, at, from, to }) => ({ dir, at, from, to })),
      itemBoxes,
      E,
      ruleOpts,
    );

    if (NO_NUMERAL_TYPES.includes(rec.type) || !order.length) continue;
    // the numeral / year / label of the first item: a short unmarked text (or a block part of a field)
    // repeated for the items (a group of at least two with one tag, class and size), above or left of the first
    // item's fields; of several groups the largest text
    const cands = [];
    for (const S of scopes.get(rec.c))
      for (const el of [S, ...S.querySelectorAll('*')]) {
        if (el.closest('svg') || cands.some((x) => x.contains(el))) continue;
        if ([...el.children].some((k) => getComputedStyle(k).display !== 'inline')) continue;
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (!t || t.length > LABEL_MAX) continue;
        // inside a field only as one of its block parts (a year over the heading's label, L19 / L32)
        const f = el.closest('[data-f]');
        if (f && (f === el || el.parentElement !== f || getComputedStyle(el).display === 'inline')) continue;
        if (el.querySelector('[data-f]') || foreign(el, rec.c)) continue;
        if (!cands.includes(el)) cands.push(el);
      }
    const keyOf = (el) => `${el.tagName}.${cls(el)}|${getComputedStyle(el).fontSize}`;
    const groups = new Map();
    for (const el of cands) {
      if (!groups.has(keyOf(el))) groups.set(keyOf(el), []);
      groups.get(keyOf(el)).push(el);
    }
    const firstFields = byI.get(order[0]);
    let best = null;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      for (const el of list) {
        const nb = box(el);
        // the first item's fields without the candidate (a display: contents field: its other parts)
        const rest = union(
          firstFields.flatMap((f) =>
            f.contains(el)
              ? [...f.children]
                  .filter((k) => k !== el)
                  .map(box)
                  .filter((k) => k.w > 0 && k.h > 0)
              : [fieldBox(f)],
          ),
        );
        let align = null;
        let gap = 0;
        if (nb.y + nb.h <= rest.y + 4 && over(nb.x, nb.x + nb.w, rest.x, rest.x + rest.w) > 0) {
          align = 'top';
          gap = rest.y - (nb.y + nb.h);
        } else if (nb.x + nb.w <= rest.x + 4 && over(nb.y, nb.y + nb.h, rest.y, rest.y + rest.h) > 0) {
          align = 'left';
          gap = rest.x - (nb.x + nb.w);
        }
        if (!align) continue;
        const size = r2(parseFloat(getComputedStyle(el).fontSize));
        if (!best || size > best.size || (size === best.size && gap < best.gap))
          best = { el, nb, align, gap, size, rest };
      }
    }
    if (best) {
      rec.numeral = {
        box: best.nb,
        fontSize: best.size,
        text: best.el.textContent.replace(/\s+/g, ' ').trim(),
        class: cls(best.el),
        fields: best.rest,
      };
      rec.numeralAlign = best.align;
    }
  }
  out.ruleTally = ruleTally;
  out.zones = [...slide.querySelectorAll('[data-zone]')].map((el) => ({
    zone: el.dataset.zone,
    box: box(el),
  }));

  out.regions = null;
  out.regionsTruncated = false;
  if (out.fields.length === 0) {
    const regions = [];
    let n = 0;
    for (const el of slide.children) {
      if (headerParts.some((p) => el.classList.contains(p)) || el.hasAttribute('data-zone')) continue;
      if (n >= regionCap) {
        out.regionsTruncated = true;
        break;
      }
      const reg = { tag: el.tagName.toLowerCase(), class: cls(el), box: box(el) };
      n += 1;
      const kids = [];
      for (const k of el.children) {
        if (!cls(k)) continue;
        if (n >= regionCap) {
          out.regionsTruncated = true;
          break;
        }
        kids.push({ tag: k.tagName.toLowerCase(), class: cls(k), box: box(k) });
        n += 1;
      }
      if (kids.length) reg.children = kids;
      regions.push(reg);
    }
    out.regions = regions;
  }
  return out;
}

/** The faces Chrome actually painted for the text of the slide in #host, as glyph counts per face (CDP). */
async function paintedFonts(cdp, tally) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: '#host > .slide, #host > .slide *',
  });
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    for (const f of fonts) {
      const key = `${f.familyName}${f.isCustomFont ? ' (embedded)' : ' (system)'}`;
      tally[key] = (tally[key] || 0) + f.glyphCount;
    }
  }
}

async function openWorker(browser, shell) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.setRequestInterception(true);
  const blocked = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url === 'about:blank' || url.startsWith('data:')) req.continue();
    else {
      blocked.push(url);
      req.abort();
    }
  });
  await page.setContent(shell, { waitUntil: 'load' });
  // Load every face the page embeds (all data: URIs) once, so a slide never measures before its face arrives.
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
  });
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  return { page, cdp, blocked };
}

async function measureAll(figures, shell, onProgress) {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--allow-file-access-from-files', '--font-render-hinting=none'],
  });
  const results = new Array(figures.length);
  const fonts = {};
  const blocked = [];
  let next = 0;
  let done = 0;
  try {
    const workers = await Promise.all(Array.from({ length: PAGES }, () => openWorker(browser, shell)));
    await Promise.all(
      workers.map(async (w) => {
        while (next < figures.length) {
          const i = next;
          next += 1;
          await w.page.evaluate(async (html) => {
            document.getElementById('host').innerHTML = html;
            await document.fonts.ready;
          }, figures[i].html);
          results[i] = await w.page.evaluate(
            measureInPage,
            HEADER_PARTS,
            REGION_CAP,
            RULE_OPTS,
            measureConnector.toString(),
          );
          await paintedFonts(w.cdp, fonts);
          done += 1;
          onProgress(done);
        }
      }),
    );
    for (const w of workers) blocked.push(...w.blocked);
  } finally {
    await browser.close();
  }
  return { results, fonts, blocked };
}

/* ------------------------------------------------------------------------------------------------ output */

/** One slide's record with its keys in a fixed order (empty parts left out). */
function slideRecord(section, m) {
  const rec = { section, background: m.background, ground: m.ground, header: m.header, body: m.body };
  if (m.containers.length) rec.containers = m.containers;
  if (m.fields.length) rec.fields = m.fields;
  if (m.zones.length) rec.zones = m.zones;
  if (m.regions) rec.regions = m.regions;
  if (m.regionsTruncated) rec.regionsTruncated = true;
  return rec;
}

/** JSON with small objects / arrays on one line (prettier keeps them; it re-wraps what is too long). */
export function stringifyCompact(value, indent = '') {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== 'object') return flat;
  const oneLine = Array.isArray(value)
    ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
    : `{ ${Object.entries(value)
        .map(([k, v]) => `${JSON.stringify(k)}: ${stringifyCompact(v, '')}`)
        .join(', ')} }`;
  const isLeaf = Object.values(value).every(
    (v) => v === null || typeof v !== 'object' || Object.values(v).every((x) => typeof x !== 'object'),
  );
  if (isLeaf && indent.length + oneLine.length <= 100 && !oneLine.includes('\n'))
    return Object.keys(value).length ? oneLine : flat;
  const inner = `${indent}  `;
  const parts = Array.isArray(value)
    ? value.map((v) => `${inner}${stringifyCompact(v, inner)}`)
    : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyCompact(v, inner)}`);
  if (!parts.length) return flat;
  return Array.isArray(value) ? `[\n${parts.join(',\n')}\n${indent}]` : `{\n${parts.join(',\n')}\n${indent}}`;
}

async function main() {
  const t0 = Date.now();
  const root = resolve(dirname(process.argv[1]), '..');
  const src = join(root, 'golden/catalogue/rich-slide-catalogue.html');
  const indexFile = join(root, 'golden/catalogue/index.json');
  const out = join(root, 'golden/catalogue/geometry.json');
  const raw = readFileSync(src, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));
  if (index.source.sha256 !== sha256)
    throw new Error(
      'catalogue: index.json was read from another version of the HTML: run npm run catalogue:index',
    );

  const page = readCataloguePage(raw);
  const order = page.figures.map((f) => f.id).join(' ');
  if (order !== index.slides.map((s) => s.id).join(' '))
    throw new Error('catalogue: the figures differ from index.json (ids or order)');
  const { results, fonts, blocked } = await measureAll(page.figures, shellHtml(page), (n) => {
    if (n % 100 === 0 || n === page.figures.length)
      console.log(
        `catalogue geometry: ${n} / ${page.figures.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
      );
  });

  const titleFonts = {};
  const fieldFaces = {};
  const ruleSources = {};
  const slides = {};
  index.slides.forEach((s, i) => {
    const m = results[i];
    if (m.titleFont) titleFonts[m.titleFont] = (titleFonts[m.titleFont] || 0) + 1;
    for (const f of m.fieldFaces) fieldFaces[f] = (fieldFaces[f] || 0) + 1;
    for (const [k, n] of Object.entries(m.ruleTally)) ruleSources[k] = (ruleSources[k] || 0) + n;
    slides[s.id] = slideRecord(s.section, m);
  });
  const sortedTally = (t) =>
    Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  const body = {
    viewport: VIEWPORT,
    rootDataset: ROOT_DATASET,
    fontFamily: {
      title: sortedTally(titleFonts),
      fields: sortedTally(fieldFaces),
      painted: sortedTally(fonts),
      blockedRequests: [...new Set(blocked)].sort(),
    },
    // C3.2 (D6): the lines (border side / background, element selector) that separate or frame a container, counted
    // per container they were found for
    ruleSources: sortedTally(ruleSources),
    slides,
  };

  // Keep the measurement date while nothing else changed, so a re-run does not churn the checked-in file.
  let measured = new Date().toISOString().slice(0, 10);
  if (existsSync(out)) {
    const prev = JSON.parse(readFileSync(out, 'utf8'));
    const { source: ps, measured: pm, ...prevBody } = prev;
    if (ps?.sha256 === sha256 && pm && JSON.stringify(prevBody) === JSON.stringify(body)) measured = pm;
  }
  const geometry = { source: { sha256, title: index.source.title }, measured, ...body };
  writeFileSync(out, `${stringifyCompact(geometry)}\n`);

  const count = (k) => Object.values(slides).reduce((n, g) => n + (g[k] ? g[k].length : 0), 0);
  const regionEntries = Object.values(slides).reduce(
    (n, g) => n + (g.regions || []).reduce((m, r) => m + 1 + (r.children ? r.children.length : 0), 0),
    0,
  );
  console.log(
    `catalogue geometry: ${index.slides.length} slides, ${count('containers')} containers, ${count('fields')} fields, ` +
      `${count('zones')} zones, ${regionEntries} region entries -> ${out} ` +
      `(${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  );
  console.log(
    `catalogue geometry: title faces ${JSON.stringify(titleFonts)}; field faces ${JSON.stringify(fieldFaces)}; ` +
      `painted ${JSON.stringify(fonts)}`,
  );
  const problems = validateGeometry(index, geometry);
  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`catalogue geometry: ${problems.length} problem(s)`);
    process.exit(1);
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'catalogue-geometry.mjs')
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
