#!/usr/bin/env node
// HTML slide -> raw object list (exact, from the browser's layout). Same raw.json shape as extract_pdf.py.
//
// usage: node extract_html.mjs <file.html|url> <out_dir> [--selector .slide] [--index 0] [--width 1920]
// Run from the presentation_builder folder (uses its puppeteer). Writes <out_dir>/raw.json + render.png.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const puppeteer = require("puppeteer");

const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: node extract_html.mjs <file.html|url> <out_dir> [--selector .slide] [--index 0] [--width 1920]");
  process.exit(1);
}
const opt = { selector: ".slide", index: "0", width: "1920" };
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, "")] = rest[i + 1];
fs.mkdirSync(out, { recursive: true });

const url = /^https?:/.test(src) ? src : "file://" + path.resolve(src);
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: +opt.width, height: Math.round((+opt.width * 9) / 16), deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
await page.evaluate(() => document.fonts && document.fonts.ready);

const handles = await page.$$(opt.selector);
const el = handles[+opt.index];
if (!el) {
  console.error(`no element ${opt.selector}[${opt.index}] (found ${handles.length})`);
  process.exit(1);
}
await el.scrollIntoView();

const raw = await el.evaluate((slide) => {
  const S = slide.getBoundingClientRect();
  const scale = S.width / (slide.offsetWidth || S.width); // the page may scale slides with a transform
  const pct = (r) => [
    +(((r.left - S.left) / S.width) * 100).toFixed(2),
    +(((r.top - S.top) / S.height) * 100).toFixed(2),
    +(((r.right - S.left) / S.width) * 100).toFixed(2),
    +(((r.bottom - S.top) / S.height) * 100).toFixed(2),
  ];
  const hex = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const v = m[1].split(",").map((x) => parseFloat(x));
    if (v.length === 4 && v[3] === 0) return null;
    return "#" + v.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
  };
  const visible = (e, cs) => cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.01 && e.getClientRects().length;
  const objs = [];
  let z = 0;
  const walk = (e) => {
    const cs = getComputedStyle(e);
    if (!visible(e, cs)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const bg = hex(cs.backgroundColor);
    const bgImg = cs.backgroundImage && cs.backgroundImage !== "none";
    const border = ["Top", "Right", "Bottom", "Left"].filter((s) => parseFloat(cs["border" + s + "Width"]) > 0 && hex(cs["border" + s + "Color"]));
    if (e !== slide && (bg || bgImg || border.length || cs.clipPath !== "none" || cs.boxShadow !== "none")) {
      objs.push({
        kind: bgImg && !bg ? "image" : "shape", bbox: pct(r), z: z++, fill: bg, stroke: border.length ? hex(cs["border" + border[0] + "Color"]) : null,
        strokeW: border.length ? parseFloat(cs["border" + border[0] + "Width"]) * scale : null, borderSides: border.map((s) => s.toLowerCase()),
        radius: cs.borderRadius, clipPath: cs.clipPath !== "none" ? cs.clipPath : null, shadow: cs.boxShadow !== "none" ? cs.boxShadow : null,
        gradient: bgImg && /gradient/.test(cs.backgroundImage) ? cs.backgroundImage.slice(0, 160) : null, opacity: +cs.opacity, tag: e.tagName.toLowerCase(),
        cls: (e.className && e.className.baseVal === undefined ? e.className : "").slice(0, 60),
      });
    }
    if (/^(IMG|SVG|CANVAS|VIDEO|PICTURE)$/i.test(e.tagName)) {
      objs.push({ kind: e.tagName === "svg" || e.tagName === "SVG" ? "vectorgroup" : "image", bbox: pct(r), z: z++, objectFit: cs.objectFit,
        clipPath: cs.clipPath !== "none" ? cs.clipPath : null, radius: cs.borderRadius, src: (e.currentSrc || "").slice(0, 120),
        px: e.naturalWidth ? [e.naturalWidth, e.naturalHeight] : null, cls: (typeof e.className === "string" ? e.className : "").slice(0, 60) });
      return;
    }
    // text owned directly by this element -> one text object (lines from client rects)
    const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (own.length) {
      const range = document.createRange();
      range.selectNodeContents(e);
      const rects = [...range.getClientRects()].filter((q) => q.width > 0.5);
      const lines = [];
      for (const q of rects) {
        const l = lines.find((L) => Math.abs(L.top - q.top) < parseFloat(cs.fontSize) * 0.5);
        if (l) { l.left = Math.min(l.left, q.left); l.right = Math.max(l.right, q.right); l.bottom = Math.max(l.bottom, q.bottom); }
        else lines.push({ left: q.left, right: q.right, top: q.top, bottom: q.bottom });
      }
      const box = lines.reduce((a, l) => ({ left: Math.min(a.left, l.left), top: Math.min(a.top, l.top), right: Math.max(a.right, l.right), bottom: Math.max(a.bottom, l.bottom) }),
        { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
      const fs = parseFloat(cs.fontSize) * scale;
      const pitch = lines.length > 1 ? (lines[lines.length - 1].top - lines[0].top) / (lines.length - 1) : null;
      const kids = [...e.children].filter((k) => k.textContent.trim()).map((k) => ({ text: k.textContent.trim().slice(0, 40), weight: getComputedStyle(k).fontWeight, colour: hex(getComputedStyle(k).color) }));
      objs.push({
        kind: "text", bbox: pct(box), z: z++, text: e.textContent.replace(/\s+/g, " ").trim().slice(0, 300),
        pt: +fs.toFixed(1), sizePctH: +((fs / S.height) * 100).toFixed(2), font: cs.fontFamily.split(",")[0].replace(/"/g, ""), weight: cs.fontWeight,
        colour: hex(cs.color), lines: lines.length, linePitchPctH: pitch ? +((pitch / S.height) * 100).toFixed(2) : null,
        leading: pitch ? +(pitch / fs).toFixed(2) : null, align: cs.textAlign, transform: cs.textTransform, letterSpacing: cs.letterSpacing,
        caps: cs.textTransform === "uppercase", emphasisRuns: kids.filter((k) => k.weight !== cs.fontWeight || k.colour !== hex(cs.color)).map((k) => k.text),
        tag: e.tagName.toLowerCase(), cls: (typeof e.className === "string" ? e.className : "").slice(0, 60),
      });
      // children that are inline runs are already inside this text object
      [...e.children].forEach((k) => { if (getComputedStyle(k).display !== "inline") walk(k); });
      return;
    }
    [...e.children].forEach(walk);
  };
  const scs = getComputedStyle(slide);
  objs.push({ kind: "shape", bbox: [0, 0, 100, 100], z: z++, fill: hex(scs.backgroundColor), gradient: scs.backgroundImage !== "none" ? scs.backgroundImage.slice(0, 160) : null, tag: "slide" });
  [...slide.children].forEach(walk);
  return { w: S.width, h: S.height, objs };
});

const png = path.join(out, "render.png");
await el.screenshot({ path: png });
raw.objs.forEach((o, i) => {
  o.id = "o" + (i + 1);
  const b = o.bbox;
  o.bleed = [["left", b[0] <= 0.3], ["top", b[1] <= 0.3], ["right", b[2] >= 99.7], ["bottom", b[3] >= 99.7]].filter((x) => x[1]).map((x) => x[0]);
});
fs.writeFileSync(path.join(out, "raw.json"), JSON.stringify({
  source: { kind: "html", file: src, selector: opt.selector, index: +opt.index, exact: true },
  slide: { w: raw.w, h: raw.h, unit: "css px", aspect: +(raw.w / raw.h).toFixed(3) }, render: png, objects: raw.objs,
}, null, 1));
console.log(`raw.json: ${raw.objs.length} objects`);
await browser.close();
