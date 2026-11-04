#!/usr/bin/env node
// HTML slide -> raw object list (exact, from the browser's layout). Same raw.json shape as extract_pdf.py.
//
// usage: node extract_html.mjs <file.html|url> <out_dir> [--selector .slide] [--index 0] [--width 1920]
// Run from the presentation_builder folder (uses its puppeteer). Writes <out_dir>/raw.json + render.png.
//
// `rawObjects(slide, options)` is the page function (plain, no closures: puppeteer serialises it), exported so the
// template record scripts (scripts/catalogue-records.mjs, scripts/template-records.mjs) measure with the same code.
// What it reads, per element of the slide (DOM order = draw order `z`):
// - a paint (background colour / image, border, clip-path, shadow) -> a shape (an image when only a background image
//   paints it). A border on one to three sides and nothing else is drawn as that many thin lines (one `shape` each,
//   the side's box), not as a box: a ruled-off column is not a panel. A clip-path polygon gives its non-axis edges as
//   `angles` {deg from the horizontal: edge length % W} (as extract_pdf.py), and its outline as `mask`.
// - an <img> / <svg> / <canvas> / <video> -> an image or a vectorgroup; an svg counts its drawn `pieces`; an img
//   drawn from a same-origin source is read for transparency (`transparent`: 1 % of its pixels or more see-through).
// - the text an element owns directly -> one text object (inline children are its runs: `emphasisRuns`); ::before /
//   ::after content strings of it and its inline descendants are part of the text (a footer's brand name).
// - opacity below 1 is kept (`opacity`), as the vocabulary's faded rules read it.
// With `options.marks`, every object carries the marks of the template convention (docs/TEMPLATES.md): `marks` =
// {c, f, i, type} of the nearest marked field / container, `part` (the slide child's header part class: k, t, r, src,
// ft, lg), and the element's own intent marks (role, need, needOptional, treatment) - never read by a rule.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** The page function: the raw objects of one slide element. */
export function rawObjects(slide, options = {}) {
  const S = slide.getBoundingClientRect();
  const scale = S.width / (slide.offsetWidth || S.width); // the page may scale slides with a transform
  const r2 = (n) => +n.toFixed(2);
  const pct = (r) => [
    r2(((r.left - S.left) / S.width) * 100),
    r2(((r.top - S.top) / S.height) * 100),
    r2(((r.right - S.left) / S.width) * 100),
    r2(((r.bottom - S.top) / S.height) * 100),
  ];
  const hex = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(',').map((x) => parseFloat(x));
    if (v.length === 4 && v[3] === 0) return null;
    return (
      '#' +
      v
        .slice(0, 3)
        .map((x) => Math.round(x).toString(16).padStart(2, '0'))
        .join('')
    );
  };
  const visible = (e, cs) =>
    cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.01 && e.getClientRects().length;
  const cls = (e) => (typeof e.className === 'string' ? e.className : '').slice(0, 60);
  const PARTS = ['k', 't', 'r', 'src', 'ft', 'lg'];
  const marksOf = (e) => {
    if (!options.marks) return {};
    const out = {};
    const near = (attr) => {
      for (let a = e; a && a !== slide.parentElement; a = a.parentElement)
        if (a.hasAttribute && a.hasAttribute(attr)) return a;
      return null;
    };
    const fld = near('data-f');
    const cont = (() => {
      for (let a = e; a && a !== slide.parentElement; a = a.parentElement)
        if (a.hasAttribute && a.hasAttribute('data-type') && a.hasAttribute('data-c')) return a;
      return null;
    })();
    const m = {};
    if (fld) {
      m.c = Number(fld.dataset.c);
      m.f = fld.dataset.f;
      if (fld.dataset.i !== undefined) m.i = Number(fld.dataset.i);
    }
    if (cont) {
      if (m.c === undefined) m.c = Number(cont.dataset.c);
      if (Number(cont.dataset.c) === m.c) m.type = cont.dataset.type;
    }
    if (Object.keys(m).length) out.marks = m;
    let top = e;
    while (top.parentElement && top.parentElement !== slide) top = top.parentElement;
    if (top !== slide) {
      const p = PARTS.find((k) => top.classList && top.classList.contains(k));
      if (p) out.part = p;
    }
    // intent marks: the element's own (never an ancestor's: a text inside a panel is not the panel)
    const own = {};
    if (e.dataset) {
      if (e.dataset.role) own.role = e.dataset.role;
      if (e.dataset.need) own.need = e.dataset.need;
      if (e.hasAttribute('data-need-optional')) own.needOptional = true;
      if (e.dataset.treatment) own.treatment = e.dataset.treatment;
    }
    if (Object.keys(own).length) out.authored = own;
    return out;
  };
  // non-axis edges of a clip-path polygon (in % of the element box) -> {deg: edge length % W}
  const polygonOf = (clip, r) => {
    const m = /^polygon\((.*)\)$/.exec(clip || '');
    if (!m) return null;
    const pts = m[1].split(',').map((p) => {
      const [x, y] = p.trim().split(/\s+/);
      const v = (s, len) => (s.endsWith('%') ? (parseFloat(s) / 100) * len : parseFloat(s) * scale);
      return [r.left + v(x, r.width), r.top + v(y, r.height)];
    });
    return pts.every((p) => p.every(Number.isFinite)) && pts.length >= 3 ? pts : null;
  };
  const anglesOf = (pts) => {
    if (!pts) return null;
    const out = {};
    for (let k = 0; k < pts.length; k += 1) {
      const [a, b] = [pts[k], pts[(k + 1) % pts.length]];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      deg = ((deg % 180) + 180) % 180; // 0..180 from the horizontal
      if (Math.min(deg % 90, 90 - (deg % 90)) <= 1) continue; // an axis edge
      const key = String(Math.round(deg * 10) / 10);
      out[key] = r2((out[key] || 0) + (len / S.width) * 100);
    }
    return Object.keys(out).length ? out : null;
  };
  const maskOf = (cs, r) => {
    const c = cs.clipPath;
    if (c && c !== 'none') {
      if (c.startsWith('polygon(')) return 'polygon';
      if (c.startsWith('ellipse(') || c.startsWith('circle(')) return 'ellipse';
      if (c.startsWith('path(') || c.startsWith('url(')) return 'svg';
      if (c.startsWith('inset(')) return 'rect';
    }
    const rad = parseFloat(cs.borderRadius) || 0;
    if (rad > 0 && rad >= Math.min(r.width, r.height) / 2 - 0.5) return 'ellipse';
    return null;
  };
  const pseudo = (e) => {
    let t = '';
    for (const which of ['::before', '::after']) {
      const c = getComputedStyle(e, which).content;
      if (c && /^".*"$/.test(c)) t += (which === '::before' ? '' : ' ') + c.slice(1, -1);
    }
    return t;
  };
  const textOf = (e) => {
    const parts = [];
    const rec = (n) => {
      const b = getComputedStyle(n, '::before').content;
      if (b && /^".*"$/.test(b)) parts.push(b.slice(1, -1) + ' ');
      for (const k of n.childNodes) {
        if (k.nodeType === 3) parts.push(k.textContent);
        else if (k.nodeType === 1 && getComputedStyle(k).display === 'inline') rec(k);
      }
      const a = getComputedStyle(n, '::after').content;
      if (a && /^".*"$/.test(a)) parts.push(' ' + a.slice(1, -1));
    };
    rec(e);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };
  const transparency = (img) => {
    try {
      if (!img.complete || !img.naturalWidth) return null;
      const w = Math.min(img.naturalWidth, 200);
      const h = Math.max(1, Math.round((img.naturalHeight * w) / img.naturalWidth));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let see = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k] < 250) see += 1;
      return see / (w * h) >= 0.01;
    } catch {
      return null; // a cross-origin source cannot be read
    }
  };
  const objs = [];
  let z = 0;
  const push = (o, e) => objs.push({ ...o, z: z++, ...marksOf(e) });
  const walk = (e) => {
    const cs = getComputedStyle(e);
    if (!visible(e, cs)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) {
      if (cs.display === 'contents') [...e.children].forEach(walk);
      return;
    }
    const opacity = +cs.opacity;
    const bg = hex(cs.backgroundColor);
    const bgImg = cs.backgroundImage && cs.backgroundImage !== 'none';
    const border = ['Top', 'Right', 'Bottom', 'Left'].filter(
      (s) =>
        parseFloat(cs['border' + s + 'Width']) > 0 &&
        !['none', 'hidden'].includes(cs['border' + s + 'Style']) &&
        hex(cs['border' + s + 'Color']),
    );
    const clip = cs.clipPath !== 'none' ? cs.clipPath : null;
    const shadow = cs.boxShadow !== 'none' ? cs.boxShadow : null;
    const isMedia = /^(IMG|SVG|CANVAS|VIDEO|PICTURE)$/i.test(e.tagName);
    if (e !== slide && !isMedia && !bg && !bgImg && !clip && !shadow && border.length && border.length < 4) {
      // a border on some sides only: each side is a thin line
      for (const s of border) {
        const w = parseFloat(cs['border' + s + 'Width']);
        const side =
          s === 'Top'
            ? { left: r.left, right: r.right, top: r.top, bottom: r.top + w }
            : s === 'Bottom'
              ? { left: r.left, right: r.right, top: r.bottom - w, bottom: r.bottom }
              : s === 'Left'
                ? { left: r.left, right: r.left + w, top: r.top, bottom: r.bottom }
                : { left: r.right - w, right: r.right, top: r.top, bottom: r.bottom };
        push(
          {
            kind: 'shape',
            bbox: pct(side),
            fill: hex(cs['border' + s + 'Color']),
            stroke: null,
            strokeW: null,
            borderSides: [s.toLowerCase()],
            borderLine: true,
            opacity: opacity < 1 ? opacity : undefined,
            tag: e.tagName.toLowerCase(),
            cls: cls(e),
          },
          e,
        );
      }
    } else if (e !== slide && !isMedia && (bg || bgImg || border.length || clip || shadow)) {
      const pts = polygonOf(clip, r);
      push(
        {
          kind: bgImg && !bg ? 'image' : 'shape',
          bbox: pct(r),
          fill: bg,
          stroke: border.length ? hex(cs['border' + border[0] + 'Color']) : null,
          strokeW: border.length ? parseFloat(cs['border' + border[0] + 'Width']) * scale : null,
          borderSides: border.map((s) => s.toLowerCase()),
          radius: cs.borderRadius,
          clipPath: clip,
          mask: maskOf(cs, r),
          angles: anglesOf(pts),
          shadow,
          gradient: bgImg && /gradient/.test(cs.backgroundImage) ? cs.backgroundImage.slice(0, 160) : null,
          opacity,
          tag: e.tagName.toLowerCase(),
          cls: cls(e),
        },
        e,
      );
    }
    if (isMedia) {
      const svg = /^svg$/i.test(e.tagName);
      push(
        {
          kind: svg ? 'vectorgroup' : 'image',
          bbox: pct(r),
          objectFit: cs.objectFit,
          clipPath: clip,
          mask: maskOf(cs, r),
          angles: anglesOf(polygonOf(clip, r)),
          radius: cs.borderRadius,
          src: (e.currentSrc || '').slice(0, 120),
          px: e.naturalWidth ? [e.naturalWidth, e.naturalHeight] : null,
          pieces: svg
            ? e.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, use, text').length
            : undefined,
          transparent: /^img$/i.test(e.tagName) ? transparency(e) : undefined,
          opacity: opacity < 1 ? opacity : undefined,
          cls: cls(e),
        },
        e,
      );
      return;
    }
    // text owned directly by this element -> one text object (lines from client rects)
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const ownPseudo = !own.length && pseudo(e).trim() && ![...e.children].length;
    if (own.length || ownPseudo) {
      const range = document.createRange();
      range.selectNodeContents(e);
      let rects = [...range.getClientRects()].filter((q) => q.width > 0.5);
      if (!rects.length) rects = [r];
      const lines = [];
      for (const q of rects) {
        const l = lines.find((L) => Math.abs(L.top - q.top) < parseFloat(cs.fontSize) * 0.5);
        if (l) {
          l.left = Math.min(l.left, q.left);
          l.right = Math.max(l.right, q.right);
          l.bottom = Math.max(l.bottom, q.bottom);
        } else lines.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom });
      }
      const box = lines.reduce(
        (a, l) => ({
          left: Math.min(a.left, l.left),
          top: Math.min(a.top, l.top),
          right: Math.max(a.right, l.right),
          bottom: Math.max(a.bottom, l.bottom),
        }),
        { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 },
      );
      const fs = parseFloat(cs.fontSize) * scale;
      const pitch =
        lines.length > 1 ? (lines[lines.length - 1].top - lines[0].top) / (lines.length - 1) : null;
      const kids = [...e.children]
        .filter((k) => k.textContent.trim())
        .map((k) => ({
          text: k.textContent.trim().slice(0, 40),
          weight: getComputedStyle(k).fontWeight,
          colour: hex(getComputedStyle(k).color),
          font: getComputedStyle(k).fontFamily.split(',')[0].replace(/"/g, ''),
        }));
      const font = cs.fontFamily.split(',')[0].replace(/"/g, '');
      const runs = kids.filter(
        (k) => k.weight !== cs.fontWeight || k.colour !== hex(cs.color) || k.font !== font,
      );
      push(
        {
          kind: 'text',
          bbox: pct(box),
          text: textOf(e).slice(0, 300),
          pt: +fs.toFixed(1),
          sizePctH: +((fs / S.height) * 100).toFixed(2),
          font,
          weight: cs.fontWeight,
          colour: hex(cs.color),
          lines: lines.length,
          linePitchPctH: pitch ? +((pitch / S.height) * 100).toFixed(2) : null,
          leading: pitch ? +(pitch / fs).toFixed(2) : null,
          align: cs.textAlign,
          transform: cs.textTransform,
          letterSpacing: cs.letterSpacing,
          caps: cs.textTransform === 'uppercase',
          emphasisRuns: runs.map((k) => k.text),
          runWeights: runs.map((k) => Number(k.weight)),
          opacity: opacity < 1 ? opacity : undefined,
          tag: e.tagName.toLowerCase(),
          cls: cls(e),
        },
        e,
      );
      // children that are inline runs are already inside this text object
      [...e.children].forEach((k) => {
        if (getComputedStyle(k).display !== 'inline') walk(k);
      });
      return;
    }
    [...e.children].forEach(walk);
  };
  const scs = getComputedStyle(slide);
  push(
    {
      kind: 'shape',
      bbox: [0, 0, 100, 100],
      fill: hex(scs.backgroundColor),
      gradient: scs.backgroundImage !== 'none' ? scs.backgroundImage.slice(0, 160) : null,
      tag: 'slide',
    },
    slide,
  );
  [...slide.children].forEach(walk);
  for (const o of objs) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return { w: S.width, h: S.height, objs };
}

/** Numbers the objects (o1 ..) and adds their bleed sides, as raw.json carries them. */
export function finishObjects(objs) {
  objs.forEach((o, i) => {
    o.id = 'o' + (i + 1);
    const b = o.bbox;
    o.bleed = [
      ['left', b[0] <= 0.3],
      ['top', b[1] <= 0.3],
      ['right', b[2] >= 99.7],
      ['bottom', b[3] >= 99.7],
    ]
      .filter((x) => x[1])
      .map((x) => x[0]);
  });
  return objs;
}

async function main() {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const puppeteer = require('puppeteer');
  const [src, out, ...rest] = process.argv.slice(2);
  if (!src || !out) {
    console.error(
      'usage: node extract_html.mjs <file.html|url> <out_dir> [--selector .slide] [--index 0] [--width 1920]',
    );
    process.exit(1);
  }
  const opt = { selector: '.slide', index: '0', width: '1920' };
  for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
  fs.mkdirSync(out, { recursive: true });

  const url = /^https?:/.test(src) ? src : 'file://' + path.resolve(src);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({
    width: +opt.width,
    height: Math.round((+opt.width * 9) / 16),
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const handles = await page.$$(opt.selector);
  const el = handles[+opt.index];
  if (!el) {
    console.error(`no element ${opt.selector}[${opt.index}] (found ${handles.length})`);
    process.exit(1);
  }
  await el.scrollIntoView();
  const raw = await el.evaluate(rawObjects, {});
  const png = path.join(out, 'render.png');
  await el.screenshot({ path: png });
  finishObjects(raw.objs);
  fs.writeFileSync(
    path.join(out, 'raw.json'),
    JSON.stringify(
      {
        source: { kind: 'html', file: src, selector: opt.selector, index: +opt.index, exact: true },
        slide: { w: raw.w, h: raw.h, unit: 'css px', aspect: +(raw.w / raw.h).toFixed(3) },
        render: png,
        objects: raw.objs,
      },
      null,
      1,
    ),
  );
  console.log(`raw.json: ${raw.objs.length} objects`);
  await browser.close();
}

if (process.argv[1] && path.basename(process.argv[1]) === 'extract_html.mjs') main();
