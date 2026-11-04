/**
 * Where a deck text element's words come from (docs/P4-spec.md §2 "Inline text", P4.2): JSON pointers into the content
 * slide the element was bound from, so the editor can write an edit back to the content field (the Deck is derived,
 * ED-1 / ED-2). A bound text element carries `source: {path, paths?, join?}`:
 * - `path`: the pointer of the (first) content string it shows, e.g. `/title`, `/blocks/0/items/2/body`;
 * - `paths`: every content string it shows, in reading order, when it shows more than one (a list, a body of several
 *   paragraphs, a node's lines);
 * - `join`: how those strings are joined in the element - absent = one paragraph each, `'line'` = one paragraph with a
 *   line break ('\n') between them, any other string = that separator inside one paragraph (an attribution
 *   "name, role" joins with ', ').
 *
 * The descriptors below are kept by `lowerSlide` / `bindSlots` beside the lowered blocks (never serialised); slots.js
 * turns them into `source` and keeps one only when every string it names is the text the element shows.
 */
import { plainText } from './inline.js';

const esc = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');
const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** A JSON pointer from its segments: pointer('blocks', 0, 'text') -> '/blocks/0/text'. */
export const pointer = (...segs) => segs.map((s) => `/${esc(s)}`).join('');

/** A JSON pointer's segments ('' -> []). */
export function pointerSegments(ptr) {
  if (ptr === '' || ptr === undefined || ptr === null) return [];
  if (typeof ptr !== 'string' || !ptr.startsWith('/')) throw new Error(`not a JSON pointer: "${ptr}"`);
  return ptr.slice(1).split('/').map(unesc);
}

/** The value at a JSON pointer (undefined when the path does not exist). */
export function getPointer(doc, ptr) {
  let cur = doc;
  for (const seg of pointerSegments(ptr)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
}

/**
 * `doc` with the value at `ptr` replaced (copied along the path, never mutated); `undefined` removes an object key.
 * A missing object on the way is created; an array index must exist or be the array's length (append).
 */
export function setPointer(doc, ptr, value) {
  const segs = pointerSegments(ptr);
  if (!segs.length) return value;
  const walk = (node, i) => {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (Array.isArray(node)) {
      const k = Number(seg);
      if (!Number.isInteger(k) || k < 0 || k > node.length) throw new Error(`no index ${seg} at ${ptr}`);
      const out = [...node];
      if (last) {
        if (value === undefined) out.splice(k, 1);
        else out[k] = value;
      } else out[k] = walk(node[k] ?? {}, i + 1);
      return out;
    }
    const out = { ...(node ?? {}) };
    if (last) {
      if (value === undefined) delete out[seg];
      else out[seg] = value;
    } else out[seg] = walk(out[seg] ?? {}, i + 1);
    return out;
  };
  return walk(doc, 0);
}

const isStr = (v) => typeof v === 'string' && v !== '';
const first = (obj, keys) => keys.find((k) => isStr(obj?.[k]));

/** The strings a v1 list shows (depth first): pointers of each item's text, then its children's. */
function listPaths(items, base, sources) {
  const out = [];
  (items ?? []).forEach((it, i) => {
    const at = sources?.get(it)?.path ?? `${base}/${i}/text`;
    out.push(at);
    if (it.children?.length)
      out.push(...listPaths(it.children, `${at.replace(/\/text$/, '')}/children`, sources));
  });
  return out;
}

/**
 * The strings a whole lowered block shows (an element bound to the slot): {paths, join?} or null.
 * `desc` = the block's descriptor ({key} | {paths, join} | {type, path, orig}); `block` = the lowered block.
 */
export function wholeSource(desc, block, sources) {
  if (!desc) return null;
  if (desc.paths) return { paths: desc.paths, ...(desc.join ? { join: desc.join } : {}) };
  if (desc.key) return { paths: [pointer(desc.key)] };
  const base = desc.path;
  const orig = desc.orig ?? block;
  switch (block.type) {
    case 'title':
    case 'subtitle':
    case 'eyebrow':
    case 'number':
    case 'paragraph':
      return isStr(block.text) ? { paths: [`${base}/text`] } : null;
    case 'cta':
      return { paths: ['text', 'url', 'contact'].filter((k) => isStr(block[k])).map((k) => `${base}/${k}`) };
    case 'list':
      return { paths: listPaths(block.items, `${base}/items`, sources) };
    case 'quote':
      return desc.type === 'quotes' ? { paths: [`${base}/items/0/text`] } : { paths: [`${base}/text`] };
    default:
      return orig && isStr(orig.text) ? { paths: [`${base}/text`] } : null;
  }
}

/** The part names a lowered item shows, mapped to the content node fields they come from (first present wins). */
const ITEM_FIELDS = {
  items: { title: ['heading'], text: ['body'], label: ['label'] },
  // a node's label (content v2.1) shows in the label box, or in the number marker when it is short
  process: { title: ['heading', 'title'], text: ['body', 'text'], label: ['label'], number: ['label'] },
  kpis: {
    value: ['value'],
    label: ['heading', 'label'],
    heading: ['heading', 'label'],
    body: ['body'],
    delta: ['delta'],
  },
  timeline: { when: ['when'], title: ['heading', 'title'] },
  quotes: { text: ['text'], attribution: ['name'], name: ['name'], role: ['role'], label: ['label'] },
  people: { name: ['name'], role: ['role'], bio: ['bio'] },
  logos: { name: ['name', 'heading'], heading: ['heading'], body: ['body'] },
  compare: { title: ['header'], header: ['header'], label: ['label'], price: ['price'], per: ['per'] },
  image: { caption: ['caption'] },
};

/**
 * The strings item `k`'s part `part` shows (an element `<slot>-<k>-<part>` of a flow): {paths, join?} or null.
 * The node fields follow the content type the block was lowered from (`desc.type`): items -> cards (heading / body),
 * subpoints -> cards (lines, one per line), process -> steps, quotes -> quote cards, compare -> columns (header,
 * features + item rows), points -> list (a node and its children, one per line).
 */
export function itemSource(desc, block, k, part) {
  if (!desc?.path || !desc.type) return null;
  const orig = desc.orig ?? block;
  const container = desc.type === 'compare' ? 'columns' : 'items';
  const node = orig?.[container]?.[k];
  if (!node || typeof node !== 'object') return null;
  const at = `${desc.path}/${container}/${k}`;
  const type = desc.type;
  if (type === 'points' || type === 'list') {
    if (part !== 'text') return null;
    return {
      paths: [`${at}/text`, ...(node.children ?? []).map((_, j) => `${at}/children/${j}/text`)],
      join: 'line',
    };
  }
  if (type === 'subpoints') {
    if (part === 'title') return isStr(node.heading) ? { paths: [`${at}/heading`] } : null;
    if (part === 'text') return { paths: (node.lines ?? []).map((_, j) => `${at}/lines/${j}`), join: 'line' };
    return null;
  }
  if (type === 'timeline' && part === 'text') {
    const body = first(node, ['body', 'text']);
    return {
      paths: [...(body ? [`${at}/${body}`] : []), ...(node.lines ?? []).map((_, j) => `${at}/lines/${j}`)],
    };
  }
  if (type === 'compare' && part === 'text') {
    const paths = (node.features ?? []).map((_, j) => `${at}/features/${j}`);
    (node.items ?? []).forEach((it, j) => {
      paths.push(`${at}/items/${j}/heading`);
      if (isStr(it.body)) paths.push(`${at}/items/${j}/body`);
    });
    return { paths };
  }
  if (type === 'columns' && part === 'title') return isStr(node.title) ? { paths: [`${at}/title`] } : null;
  // content/1 nodes (cards, steps, kpis, timeline, people, logos as written) show their own field names
  const keys = ITEM_FIELDS[type]?.[part] ?? [part];
  const key = first(node, keys);
  return key ? { paths: [`${at}/${key}`] } : null;
}

/** The pointer of a block-level text field (a group heading, a chart's title / source, a table's subtitle…). */
export function blockFieldSource(desc, block, field) {
  if (!desc?.path) return null;
  const orig = desc.orig ?? block;
  if (orig?.type === 'chart' && (field === 'title' || field === 'source' || field === 'subtitle'))
    return isStr(orig.text?.[field]) ? { paths: [`${desc.path}/text/${field}`] } : null;
  if (isStr(orig?.[field])) return { paths: [`${desc.path}/${field}`] };
  const container = orig?.type === 'compare' ? 'columns' : 'items';
  if (isStr(orig?.[container]?.[0]?.[field])) return { paths: [`${desc.path}/${container}/0/${field}`] };
  return null;
}

/** The text units an element shows for a source's `join`: paragraphs, the lines of its one paragraph, or the pieces. */
export function sourceUnits(paragraphs, join) {
  const texts = (paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join(''));
  if (!join) return texts;
  if (texts.length !== 1) return null;
  return join === 'line' ? texts[0].split('\n') : null;
}

/**
 * The `source` of an element showing `paragraphs`, when every unit is the content string its pointer names (plain
 * text equal, or the unit holding it - a check mark or a button glyph around it): {path, paths?, join?} or null.
 * `slide` = the content slide the element was bound from. More pointers than units (a field the layout does not
 * show) are cut to the units; fewer is no source.
 */
export function verifiedSource(found, paragraphs, slide) {
  if (!found?.paths?.length) return null;
  const { join } = found;
  let paths = found.paths;
  let units;
  if (join && join !== 'line') {
    // inline pieces ("name, role"): the whole paragraph is the pieces joined
    const texts = sourceUnits(paragraphs);
    if (texts?.length !== 1) return null;
    const values = paths.map((p) => getPointer(slide, p));
    if (!values.every((v) => typeof v === 'string')) return null;
    if (values.map((v) => plainText(v)).join(join) !== texts[0]) return null;
    units = null;
  } else {
    units = sourceUnits(paragraphs, join);
    if (!units || units.length > paths.length) return null;
    paths = paths.slice(0, units.length);
    for (let i = 0; i < units.length; i += 1) {
      const v = getPointer(slide, paths[i]);
      if (typeof v !== 'string') return null;
      const plain = plainText(v);
      if (units[i] !== plain && !(plain && units[i].includes(plain))) return null;
    }
  }
  const out = { path: paths[0] };
  if (paths.length > 1) out.paths = paths;
  if (join && paths.length > 1) out.join = join;
  return out;
}

/** The deck with every text `source` pointer under `/blocks/<i>` renumbered by `blockIndex[slideId][i]` (kept blocks). */
export function remapSourcePaths(deck, blockIndex) {
  if (!blockIndex || !Object.keys(blockIndex).length) return deck;
  const fix = (slideId, p) => {
    const map = blockIndex[slideId];
    const m = /^\/blocks\/(\d+)(\/.*)?$/.exec(p);
    if (!map || !m) return p;
    const to = map[Number(m[1])];
    return to === undefined ? p : `/blocks/${to}${m[2] ?? ''}`;
  };
  const walk = (els, slideId) =>
    els.map((el) => {
      let next = el;
      if (el.source?.path) {
        next = { ...el, source: { ...el.source, path: fix(slideId, el.source.path) } };
        if (el.source.paths) next.source.paths = el.source.paths.map((p) => fix(slideId, p));
      }
      if (Array.isArray(el.children)) next = { ...next, children: walk(el.children, slideId) };
      return next;
    });
  return {
    ...deck,
    slides: deck.slides.map((s) =>
      blockIndex[s.contentSlideId ?? s.id]
        ? { ...s, elements: walk(s.elements ?? [], s.contentSlideId ?? s.id) }
        : s,
    ),
  };
}
