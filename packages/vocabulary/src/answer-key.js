/**
 * The catalogue answer key (docs/PLAN-template-library.md §1.3): runs `identify` over every plan slide of
 * golden/catalogue/geometry.json with the marks hidden (catalogue.js) and compares each answer with the map of the
 * hidden mark (maps.json `catalogue`). `unknown` counts as a miss. Pure: the caller reads the two files (the HTML is
 * 10.8 MB: read it once).
 */
import data from './data.cjs';
import { blockSubjects, catalogueFurniture, readCatalogueText, slideSubjects } from './catalogue.js';
import { identifyAll } from './identify.js';
import { readsBefore } from './predicates.js';

/** A hit: the answer is the mapped term, or one of them when the map accepts a list (roadmap: timeline or process). */
const same = (got, want) =>
  Array.isArray(want)
    ? want.some((w) => same(got, w))
    : want.none
      ? Boolean(got.none)
      : !got.none && got.namespace === want.namespace && got.term === want.term;
const name = (r) =>
  Array.isArray(r)
    ? r.map(name).join(' or ')
    : r.none
      ? 'none'
      : r.hidden
        ? 'hidden'
        : `${r.namespace ?? '-'}:${r.term}`;

/** Counts a mark; a hit also counts the term it resolved to (`resolved`, by term). */
function tally(table, key, hit, got) {
  const row = (table[key] ??= { n: 0, hit: 0, resolved: {} });
  row.n += 1;
  if (hit) {
    row.hit += 1;
    row.resolved[got] = (row.resolved[got] || 0) + 1;
  }
}

/**
 * Runs the answer key (`transform` rewrites rules for this run: the negative test). Returns { blocks, fields, header, blockRegions?, misses: {blocks, fields, header} } where each
 * table is {mark: {n, hit, expect, resolved: {term: count}}}; `resolved` lists, for a mark the map accepts several terms
 * for, which record resolved to which term ({mark: {term: ['slide/cN']}}); misses list {slide, mark, expect, got, rule, why, text?}.
 */
export function runAnswerKey(geometry, html, { transform = null } = {}) {
  const maps = data.maps().catalogue;
  const text = readCatalogueText(html, geometry.rootDataset.brand);
  const furniture = catalogueFurniture(geometry, text);
  const out = {
    blocks: {},
    fields: {},
    header: {},
    resolved: {},
    misses: { blocks: [], fields: [], header: [] },
  };
  for (const [id, g] of Object.entries(geometry.slides)) {
    if (g.section !== 'plan') continue;
    const { elements, answers, context } = slideSubjects(id, geometry, text, furniture);
    const results = identifyAll(elements, context, { scope: 'element', transform });
    elements.forEach((e, k) => {
      const a = answers[k];
      const r = results[k];
      if (a.header) {
        const want = maps.header[a.header];
        const hit = same(r, want);
        tally(out.header, a.header, hit, name(r));
        if (!hit)
          out.misses.header.push({
            slide: id,
            mark: a.header,
            expect: name(want),
            got: name(r),
            rule: r.rule,
            why: r.why,
            text: e.text,
          });
      } else {
        const want = maps.fields[a.field];
        const hit = same(r, want);
        tally(out.fields, a.field, hit, name(r));
        if (!hit)
          out.misses.fields.push({
            slide: id,
            mark: a.field,
            c: a.c,
            i: a.i,
            expect: name(want),
            got: name(r),
            rule: r.rule,
            why: r.why,
            text: e.text,
          });
      }
    });
    const blocks = blockSubjects(id, geometry, elements, results, readsBefore);
    const bres = identifyAll(blocks, {}, { scope: 'block', transform });
    (g.containers || []).forEach((c, k) => {
      const want = maps.containerTypes[c.type];
      const r = bres[k];
      const hit = same(r, want);
      tally(out.blocks, c.type, hit, name(r));
      if (hit && Array.isArray(want)) ((out.resolved[c.type] ??= {})[name(r)] ??= []).push(`${id}/c${c.c}`);
      if (!hit)
        out.misses.blocks.push({
          slide: id,
          mark: c.type,
          c: c.c,
          expect: name(want),
          got: name(r),
          rule: r.rule,
          why: r.why,
          labelText: blocks[k].labelText,
          headText: blocks[k].headText,
        });
    });
  }
  for (const [sec, key] of [
    ['blocks', 'containerTypes'],
    ['fields', 'fields'],
    ['header', 'header'],
  ])
    for (const [mark, row] of Object.entries(out[sec])) row.expect = name(maps[key][mark]);
  return out;
}

/**
 * The identify role table over the block slides (no answer key there: the role counts only): their header parts, and
 * their regions (the slide's children: tag, class and box only - no font, no fill). A region drawn as an svg is a
 * vector drawing; a `.card` region is a filled box (the catalogue's card paints a fill) holding its text; any other
 * region is a layout box with no fill of its own, which no E2 rule names (unknown: it is an E3 structure, not a thing).
 */
export function blockSlideRoles(geometry, html) {
  const text = readCatalogueText(html, geometry.rootDataset.brand);
  const furniture = catalogueFurniture(geometry, text);
  const table = {};
  for (const [id, g] of Object.entries(geometry.slides)) {
    if (g.section !== 'blocks') continue;
    const { elements, answers, context } = slideSubjects(id, geometry, text, furniture);
    const regionTexts = text.slides[id]?.regions || [];
    for (const [k, r] of (g.regions || []).entries()) {
      const b = r.box;
      const bbox = [
        (b.x / 1920) * 100,
        (b.y / 1080) * 100,
        ((b.x + b.w) / 1920) * 100,
        ((b.y + b.h) / 1080) * 100,
      ];
      const held = Boolean(regionTexts[k]?.text);
      const kind =
        r.tag === 'svg' ? 'vectorgroup' : (r.class || '').split(/\s+/).includes('card') ? 'shape' : 'box';
      elements.push({ id: `r${k}`, kind, bbox, holdsText: held, heldTexts: held ? 1 : 0 });
      answers.push({ region: `${r.tag}.${(r.class || '').split(/\s+/)[0] || '-'} (${kind})` });
    }
    const results = identifyAll(elements, context, { scope: 'element' });
    elements.forEach((e, k) => {
      const key = answers[k].header
        ? `.${answers[k].header}`
        : answers[k].region
          ? `region ${kind(answers[k].region)}`
          : 'field';
      table[key] ??= {};
      table[key][name(results[k])] = (table[key][name(results[k])] || 0) + 1;
    });
  }
  return table;
}

const kind = (label) => label.slice(label.lastIndexOf('(') + 1, -1);

/** Hit rate as a percentage with one decimal. */
export const rate = (row) => Math.round((row.hit / row.n) * 1000) / 10;
