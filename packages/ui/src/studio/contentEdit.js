// The content commands of the Studio's editor (docs/P4-spec.md §1, §2 "Inline text", §3; P4.2): the content JSON
// document (schema content/2) is what text and slide edits change (ED-1 / ED-2); the Deck is always derived by the
// server. A content patch is `{slides?: {[id]: slide | null}, order?: [ids]}` (whole slides by id, null = removed;
// the slide order) and travels in a command's `args` / `inverse` beside the overrides patches (edit.js), so undo /
// redo and the persisted log work for both. Pure functions only: no rule is computed here.
import { BLOCKS, FAR_OVER, SLIDE_FIELDS } from '../../../engine/src/content/blocks.js';
import { getPointer, pointer, pointerSegments, setPointer } from '../../../engine/src/content/source.js';

/** Content PUTs are debounced this long (ms): one PUT for a burst of commands. */
export const CONTENT_DEBOUNCE_MS = 400;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const ids = (content) => (content?.slides ?? []).map((s) => s.id);

/** The content with a content patch applied (slides replaced / added / removed by id, then ordered). */
export function applyContentPatch(content, cp) {
  if (!content || !cp) return content;
  let slides = [...(content.slides ?? [])];
  for (const [id, v] of Object.entries(cp.slides ?? {})) {
    const k = slides.findIndex((s) => s.id === id);
    if (v === null || v === undefined) {
      if (k >= 0) slides.splice(k, 1);
    } else if (k >= 0) slides[k] = v;
    else slides.push(v);
  }
  if (Array.isArray(cp.order)) {
    const byId = new Map(slides.map((s) => [s.id, s]));
    const ordered = cp.order.map((id) => byId.get(id)).filter(Boolean);
    slides = [...ordered, ...slides.filter((s) => !cp.order.includes(s.id))];
  }
  return { ...content, slides };
}

/** The content patch that undoes `cp` on `content`: each touched slide back, and the order when it can change. */
export function contentInverse(content, cp) {
  const inv = {};
  const current = new Map((content?.slides ?? []).map((s) => [s.id, s]));
  let reorders = Array.isArray(cp?.order);
  if (cp?.slides) {
    inv.slides = {};
    for (const [id, v] of Object.entries(cp.slides)) {
      inv.slides[id] = current.get(id) ?? null;
      if (!current.has(id) || v === null) reorders = true;
    }
  }
  if (reorders) inv.order = ids(content);
  return inv;
}

/** True when the content patch changes nothing. */
export function contentNoop(content, cp) {
  if (!cp) return true;
  const current = new Map((content?.slides ?? []).map((s) => [s.id, s]));
  const slidesSame = Object.entries(cp.slides ?? {}).every(([id, v]) => same(current.get(id) ?? null, v));
  if (!slidesSame) return false;
  if (!Array.isArray(cp.order)) return true;
  return same(
    applyContentPatch(content, cp).slides.map((s) => s.id),
    ids(content),
  );
}

/** The next free slide id `s<N>`: above every id of the content and of the overrides (a deleted slide's keep theirs). */
export function newSlideId(content, overrides) {
  let max = 0;
  const see = (id) => {
    const m = /^s(\d+)(?:-|$)/.exec(id ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  };
  ids(content).forEach(see);
  Object.keys(overrides?.slides ?? {}).forEach(see);
  Object.keys(overrides?.elements ?? {}).forEach(see);
  return `s${max + 1}`;
}

const slideOf = (content, id) => (content?.slides ?? []).find((s) => s.id === id) ?? null;

/** setField: one content field of a slide (a JSON pointer into the slide) set to `value` (undefined removes it). */
export function setFieldPatch(content, slideId, path, value) {
  const slide = slideOf(content, slideId);
  if (!slide) return null;
  const next = setPointer(slide, path, value);
  return same(next, slide) ? null : { slides: { [slideId]: next } };
}

/** setSlideKey: a slide key (title, subtitle, label, cta, kind, layout, notes …); null / '' removes it. */
export function setSlideKeyPatch(content, slideId, key, value) {
  return setFieldPatch(content, slideId, `/${key}`, value === null || value === '' ? undefined : value);
}

/** addSlide: `slide` (its id given or the next free one) inserted after `afterId` (null: first). */
export function addSlidePatch(content, afterId, slide, overrides) {
  const id = slide.id ?? newSlideId(content, overrides);
  const order = ids(content);
  const at = afterId ? order.indexOf(afterId) + 1 : 0;
  order.splice(at < 0 ? order.length : at, 0, id);
  return { id, patch: { slides: { [id]: { id, ...slide } }, order } };
}

/**
 * duplicateSlide: a copy of the slide right after it, under a new id; its slide override and element overrides
 * copied re-keyed to the new id (element ids start with the slide id). Returns {id, patch} (a full patch: content +
 * slides + elements) or null.
 */
export function duplicateSlidePatch(content, overrides, slideId) {
  const slide = slideOf(content, slideId);
  if (!slide) return null;
  const id = newSlideId(content, overrides);
  const copy = JSON.parse(JSON.stringify(slide));
  copy.id = id;
  const order = ids(content);
  order.splice(order.indexOf(slideId) + 1, 0, id);
  const patch = { content: { slides: { [id]: copy }, order } };
  const so = overrides?.slides?.[slideId];
  if (so) patch.slides = { [id]: so };
  const prefix = `${slideId}-`;
  const els = Object.entries(overrides?.elements ?? {}).filter(([eid]) => eid.startsWith(prefix));
  if (els.length)
    patch.elements = Object.fromEntries(els.map(([eid, o]) => [`${id}-${eid.slice(prefix.length)}`, o]));
  return { id, patch };
}

/** deleteSlide: the slide removed (its overrides stay: an undo brings the slide back as it was). Never the last. */
export function deleteSlidePatch(content, slideId) {
  if (!slideOf(content, slideId) || (content.slides ?? []).length < 2) return null;
  return { slides: { [slideId]: null }, order: ids(content).filter((x) => x !== slideId) };
}

/** moveSlide: the slide moved to `toIndex` (0-based, clamped). */
export function moveSlidePatch(content, slideId, toIndex) {
  const order = ids(content);
  const from = order.indexOf(slideId);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(order.length - 1, toIndex));
  if (to === from) return null;
  order.splice(from, 1);
  order.splice(to, 0, slideId);
  return { order };
}

// ---- text: inline runs <-> inline Markdown, and an edit written back through the element's `source` ----

/** Inline runs ({text, bold?, italic?, link?}) -> the inline Markdown the parser reads (`**b**`, `*i*`, `[t](u)`). */
export function runsToMarkdown(runs) {
  let out = '';
  for (const r of runs ?? []) {
    const text = String(r.text ?? '');
    if (!text) continue;
    // markers hug the words: leading / trailing spaces stay outside them
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    let core = m[2];
    if (!core) {
      out += text;
      continue;
    }
    if (r.link) core = `[${core}](${r.link})`;
    if (r.italic) core = `*${core}*`;
    if (r.bold) core = `**${core}**`;
    out += `${m[1]}${core}${m[3]}`;
  }
  return out;
}

/** An element's paragraphs as text units: one per paragraph (Markdown), or for join 'line' one per line. */
export function elementUnits(paragraphs, join) {
  const units = (paragraphs ?? []).map((p) => runsToMarkdown(p.runs));
  if (join === 'line') return units.flatMap((u) => u.split('\n'));
  return units;
}

/** The plain text of inline Markdown (what a reader counts). */
export const plainOf = (md) =>
  String(md ?? '').replace(/\*\*|[*_]|\[([^\]]*)\]\([^)]*\)/g, (m, t) => t ?? '');

const FIELD_PARAGRAPHS = new Set(['text', 'body']);
const LINE_ARRAYS = new Set(['lines', 'features']);

/** Where a pointer points: {field, array?, index?, parent} (array = the array a numbered segment is in). */
function lastField(path) {
  const segs = pointerSegments(path);
  const last = segs[segs.length - 1];
  if (/^\d+$/.test(last)) return { field: segs[segs.length - 2], array: true, index: Number(last), segs };
  return { field: last, segs };
}

/**
 * Whether Enter starts a new paragraph in this source (docs/P4-spec.md §2): a paragraph's / node's `text`, a `body`,
 * a node's `lines` / features; any other field (title, heading, label, name, value …) refuses it (Shift+Enter is a
 * line break everywhere).
 */
export function allowsParagraphs(source) {
  if (!source?.path) return false;
  if (source.join && source.join !== 'line') return false;
  const paths = source.paths ?? [source.path];
  return paths.every((p) => {
    const f = lastField(p);
    return f.array ? LINE_ARRAYS.has(f.field) : FIELD_PARAGRAPHS.has(f.field);
  });
}

/** The design-intent range (`BLOCKS` / `SLIDE_FIELDS`) of the field a pointer names: {maxChars, minChars?} or null. */
export function fieldRange(slide, path) {
  const segs = pointerSegments(path);
  if (segs.length === 1) return SLIDE_FIELDS[segs[0]] ?? null;
  if (segs[0] !== 'blocks') return null;
  const block = slide?.blocks?.[Number(segs[1])];
  const spec = BLOCKS[block?.type];
  if (!spec) return null;
  if (segs.length === 3)
    return segs[2] === 'text' ? (spec.fields.text ?? null) : (spec.block?.[segs[2]] ?? null);
  if ((segs[2] === 'items' || segs[2] === 'columns') && segs.length >= 5) {
    const f = segs[4];
    if (block.type === 'compare' && f === 'items' && segs[6]) return spec.items?.[segs[6]] ?? null;
    if (f === 'children') return spec.fields.text ?? null;
    if (f === 'lines') return spec.fields.lines ?? null;
    return spec.fields[f] ?? null;
  }
  return null;
}

/**
 * The counter under the inline editor: the unit whose length is furthest over its field's range, as
 * {n, max, level: 'ok' | 'over' | 'far'} ('over' > maxChars = orange, 'far' > FAR_OVER × maxChars = red), or null
 * when no field of the source has a range.
 */
export function textCounter(slide, source, units) {
  if (!source?.path) return null;
  const paths = source.paths ?? [source.path];
  let best = null;
  units.forEach((u, i) => {
    const range = fieldRange(slide, paths[Math.min(i, paths.length - 1)]);
    if (!range?.maxChars) return;
    const n = plainOf(u).length;
    const ratio = n / range.maxChars;
    if (!best || ratio > best.ratio) best = { n, max: range.maxChars, ratio };
  });
  if (!best) return null;
  const level = best.n > best.max * FAR_OVER ? 'far' : best.n > best.max ? 'over' : 'ok';
  return { n: best.n, max: best.max, level };
}

/** Split `text` into `n` pieces at the first n − 1 separators (the last piece keeps the rest). */
function splitPieces(text, sep, n) {
  const out = [];
  let rest = text;
  for (let i = 0; i < n - 1; i += 1) {
    const k = rest.indexOf(sep);
    if (k < 0) {
      out.push(rest);
      rest = '';
    } else {
      out.push(rest.slice(0, k));
      rest = rest.slice(k + sep.length);
    }
  }
  out.push(rest);
  return out;
}

/**
 * setParagraphs: the content patch an inline edit makes (`units` = the edited text units, Markdown inline runs,
 * `original` = the units the element showed). Units map onto `source.paths`; an edit that changes their count follows
 * the structure: paragraph blocks are added / removed, a node's lines / features and a list's points become the new
 * array, a body + lines node keeps the first unit as its body; a single field takes extra paragraphs as line breaks.
 * Units the edit did not change are not written (a `{brand.*}` placeholder stays). Returns a content patch or null.
 */
export function textEditPatch(content, slideId, source, units, original = []) {
  const slide = slideOf(content, slideId);
  if (!slide || !source?.path) return null;
  const paths = source.paths ?? [source.path];
  let next = slide;
  const set = (p, v) => {
    next = setPointer(next, p, v);
  };
  if (source.join && source.join !== 'line') {
    const text = units.join(' ');
    if (text === original.join(' ')) return null;
    splitPieces(text, source.join, paths.length).forEach((v, i) => set(paths[i], v));
  } else if (units.length === paths.length) {
    units.forEach((u, i) => {
      if (u !== original[i]) set(paths[i], u);
    });
  } else {
    const fields = paths.map(lastField);
    const parentOf = (f) => pointer(...f.segs.slice(0, -1));
    const blockText = paths.map((p) => /^\/blocks\/(\d+)\/text$/.exec(p));
    const arrayParent = fields.every((f) => f.array) && new Set(fields.map(parentOf)).size === 1;
    const pointItems = paths.map((p) => /^(\/blocks\/\d+\/items)\/(\d+)\/text$/.exec(p));
    if (
      blockText.every(Boolean) &&
      blockText.every((m) => slide.blocks[Number(m[1])]?.type === 'paragraph')
    ) {
      // paragraph blocks: as many paragraph blocks as units, where the first one was
      const at = blockText.map((m) => Number(m[1]));
      const blocks = slide.blocks.filter((_, k) => !at.includes(k));
      blocks.splice(at[0], 0, ...units.map((text) => ({ type: 'paragraph', text })));
      next = { ...slide, blocks };
    } else if (arrayParent && LINE_ARRAYS.has(fields[0].field)) {
      set(parentOf(fields[0]), units);
    } else if (pointItems.every(Boolean) && new Set(pointItems.map((m) => m[1])).size === 1) {
      const base = pointItems[0][1];
      const old = getPointer(slide, base) ?? [];
      set(
        base,
        units.map((text, i) => ({ ...(old[i] ?? {}), text })),
      );
    } else if (
      !fields[0].array &&
      fields.slice(1).every((f) => f.array && LINE_ARRAYS.has(f.field)) &&
      fields.length > 1
    ) {
      set(paths[0], units[0] ?? '');
      set(parentOf(fields[1]), units.slice(1));
    } else if (paths.length === 1) {
      // one field (a node's body, a quote): extra paragraphs are line breaks inside it
      set(paths[0], units.join('\n'));
    } else {
      // no structure to grow / shrink: the first fields take a unit each, the last the rest (line breaks)
      paths.forEach((p, i) => {
        const v = i < paths.length - 1 ? (units[i] ?? '') : units.slice(i).join('\n');
        set(p, v);
      });
    }
  }
  return same(next, slide) ? null : { slides: { [slideId]: next } };
}

// ---- the contenteditable overlay: paragraphs <-> DOM ----

/** Fill `root` with one block per paragraph (runs as <b> / <i> / <a>, '\n' as <br>). */
export function fillEditable(root, paragraphs) {
  const doc = root.ownerDocument;
  root.textContent = '';
  for (const p of paragraphs ?? []) {
    const block = doc.createElement('div');
    block.setAttribute('data-p', '');
    for (const r of p.runs ?? []) {
      let node = block;
      const wrap = (tag, attrs = {}) => {
        const e = doc.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        node.appendChild(e);
        node = e;
      };
      if (r.link) wrap('a', { href: r.link });
      if (r.bold) wrap('b');
      if (r.italic) wrap('i');
      String(r.text ?? '')
        .split('\n')
        .forEach((t, k) => {
          if (k > 0) node.appendChild(doc.createElement('br'));
          if (t) node.appendChild(doc.createTextNode(t));
        });
    }
    if (!block.childNodes.length) block.appendChild(doc.createElement('br'));
    root.appendChild(block);
  }
  if (!root.childNodes.length) {
    const block = doc.createElement('div');
    block.setAttribute('data-p', '');
    block.appendChild(doc.createElement('br'));
    root.appendChild(block);
  }
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** The editable's content as paragraphs of runs: each block a paragraph, <br> a '\n', <b> / <i> / <a> run styles. */
export function readEditable(root) {
  const paragraphs = [];
  let cur = null;
  const push = (text, style) => {
    if (!cur) {
      cur = { runs: [] };
      paragraphs.push(cur);
    }
    if (!text) return;
    const last = cur.runs[cur.runs.length - 1];
    if (
      last &&
      !!last.bold === !!style.bold &&
      !!last.italic === !!style.italic &&
      last.link === style.link
    ) {
      last.text += text;
      return;
    }
    const run = { text };
    if (style.bold) run.bold = true;
    if (style.italic) run.italic = true;
    if (style.link) run.link = style.link;
    cur.runs.push(run);
  };
  const walk = (node, style) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) push(n.nodeValue.replace(/\u00a0/g, ' '), style);
      else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'BR') {
          // a lone <br> in an empty block is the block itself, not a line break
          const lone = n.parentNode !== root && n.parentNode.childNodes.length === 1;
          if (!lone) push('\n', style);
          continue;
        }
        const s = { ...style };
        const weight = n.style?.fontWeight;
        if (tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600) s.bold = true;
        if (tag === 'I' || tag === 'EM' || n.style?.fontStyle === 'italic') s.italic = true;
        if (tag === 'A' && n.getAttribute('href')) s.link = n.getAttribute('href');
        if (BLOCK_TAGS.has(tag) && node === root) {
          cur = { runs: [] };
          paragraphs.push(cur);
          walk(n, s);
          cur = null;
        } else walk(n, s);
      }
    }
  };
  walk(root, {});
  return paragraphs.map((p) => {
    // a trailing line break the browser keeps at the end of a block is not text
    const runs = p.runs.filter((r) => r.text !== '');
    const last = runs[runs.length - 1];
    if (last?.text.endsWith('\n')) last.text = last.text.slice(0, -1);
    return { runs: runs.filter((r) => r.text !== '') };
  });
}

/** The units an edit gives for a source: paragraphs as Markdown, or for join 'line' every line. */
export function editedUnits(paragraphs, source) {
  // a line break left at the end of a paragraph is not text
  const md = paragraphs.map((p) => runsToMarkdown(p.runs).replace(/\n+$/, ''));
  if (source?.join === 'line') return md.flatMap((u) => u.split('\n'));
  if (source?.join) return [md.join(' ')];
  return md;
}
