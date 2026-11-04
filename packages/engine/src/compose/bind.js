/**
 * Bind Content blocks to layout slots, by type (P2-spec §3.5). Conventions a layout follows (see the P2 report):
 * - box.role 'title' | 'subtitle' | 'eyebrow' slots take the block of that type;
 * - slot.type 'richtext' | 'text' (box role body / list / none) takes every remaining paragraph, list and cta block;
 *   'list' takes the first list;
 * - slot.type kpis | chart | table | cards | steps | timeline | logos | quote | image take the first block of that type;
 *   'people' (layout schema v1.2) and 'images' take `people`;
 * - box.role 'attribution' takes the attribution (+ role) of the quote bound to the slide;
 * - a slot `<flow>-heading` takes the group heading (`title`) of the block bound to slot `<flow>` (content/2 items);
 *   likewise `<flow>-subheading` (its subtitle), `<flow>-caption`, `<flow>-label` and `<flow>-photo` (an image);
 * - slot type 'number' takes the content/2 slide's `number` (section "01"); slot `action` takes its `cta` key;
 * - slots `col<N>-title` / `col<N>-body` take column N of the `columns` block (its title / its blocks). Without a
 *   columns block, columns are formed from the slide: blocks before the first subtitle -> column 1, the subtitle ->
 *   column 2's title, the rest -> column 2 (no subtitle: images -> column 1, the rest -> column 2), with an info.
 * Unbound required slots (schema default: required) and blocks no slot took are warnings.
 * A content/2 slide binds through its aliases onto these blocks (content/lower.js, docs/S2-content-v2.md §5).
 * Each binding also carries `content` (the slide as given) and `sources` (lowered block -> where it comes from in
 * `content`, content/source.js), so the text elements made from it can name their content field (`source`, P4.2).
 */
import { lowerSlide } from '../content/lower.js';
import { blockFieldSource } from '../content/source.js';

const COL_RE = /^col(\d+)-(title|body)$/;
const HEADING_RE = /^(.+)-(heading|subheading|caption|label|photo)$/;
/** A `<flow>-<part>` slot shows this field of the block bound to slot `<flow>` (content/2, S2.a slices 2–3). */
const PART_FIELD = {
  heading: 'title',
  subheading: 'subtitle',
  caption: 'caption',
  label: 'label',
  photo: 'photo',
};
const TYPE_SLOT = {
  kpis: 'kpis',
  chart: 'chart',
  table: 'table',
  cards: 'cards',
  steps: 'steps',
  timeline: 'timeline',
  logos: 'logos',
  quote: 'quote',
  image: 'image',
  people: 'people',
  images: 'people',
  number: 'number',
};
const BODY_TYPES = new Set(['paragraph', 'list', 'cta']);
/** content/2 slide keys lowered to title / eyebrow / subtitle / cta blocks (content/lower.js). */
const SLIDE_KEYS = new Set(['title', 'label', 'number', 'subtitle', 'cta']);

function inferColumns(blocks) {
  const sub = blocks.findIndex((b) => b.type === 'subtitle');
  if (sub >= 0) {
    return [
      { blocks: blocks.slice(0, sub) },
      { title: blocks[sub].text, titleBlock: blocks[sub], blocks: blocks.slice(sub + 1) },
    ];
  }
  const images = blocks.filter((b) => b.type === 'image');
  if (images.length && images.length < blocks.length) {
    return [{ blocks: images }, { blocks: blocks.filter((b) => b.type !== 'image') }];
  }
  return [{ blocks }];
}

export function bindSlots(slide, layout, { warn = () => {} } = {}) {
  // content/2: bind the slide's aliases onto today's blocks; each field no v1 slot shows is one content warning
  const lowered = lowerSlide(slide);
  for (const n of lowered.notes) warn('content', n.message);
  const content = slide;
  const { sources } = lowered;
  slide = lowered.slide;
  const pool = slide.blocks ?? [];
  const used = new Set();
  const boxes = new Map((layout.boxes ?? []).map((b) => [b.id, b]));
  const take = (pred) => {
    const b = pool.find((x) => !used.has(x) && pred(x));
    if (b) used.add(b);
    return b;
  };
  const takeAll = (pred) => {
    const list = pool.filter((x) => !used.has(x) && pred(x));
    list.forEach((b) => used.add(b));
    return list;
  };
  const bindings = [];
  const missing = (slot) => {
    if (slot.required ?? true)
      warn('binding', `required slot "${slot.id}" (${slot.type}) of layout "${layout.id}" has no content`);
  };

  const colSlots = (layout.slots ?? []).filter((s) => COL_RE.test(s.id));
  if (colSlots.length) {
    const colsBlock = take((b) => b.type === 'columns');
    const colsDesc = colsBlock ? sources.get(colsBlock) : null;
    let columns = colsBlock?.items;
    if (!columns) {
      const rest = takeAll((b) => b.type !== 'title' && b.type !== 'columns');
      if (rest.length) {
        columns = inferColumns(rest);
        warn(
          'binding',
          `layout "${layout.id}" has columns but the slide has no "##" columns: formed from its blocks`,
          'info',
        );
      } else columns = [];
    }
    const maxN = Math.max(...colSlots.map((s) => Number(COL_RE.exec(s.id)[1])));
    for (const slot of colSlots) {
      const [, n, part] = COL_RE.exec(slot.id);
      const c = Number(n) - 1;
      const col = columns[c];
      let blocks = [];
      if (col && part === 'title' && col.title) {
        const sub = { type: 'subtitle', text: col.title };
        // the column title: the compare header, a "##" column title, or the subtitle the columns were formed at
        if (col.titleBlock) sources.set(sub, sources.get(col.titleBlock));
        else if (colsDesc?.type === 'compare')
          sources.set(sub, { paths: [`${colsDesc.path}/columns/${c}/header`] });
        else if (colsDesc?.path) sources.set(sub, { paths: [`${colsDesc.path}/items/${c}/title`] });
        blocks = [sub];
      } else if (col && part === 'body') {
        blocks = col.blocks;
        // a content/1 "##" column's own blocks
        if (colsDesc?.type === 'columns')
          blocks.forEach((blk, j) =>
            sources.set(blk, { type: blk.type, path: `${colsDesc.path}/items/${c}/blocks/${j}`, orig: blk }),
          );
      }
      if (blocks.length) bindings.push({ slot, box: boxes.get(slot.box), blocks });
      else missing(slot);
    }
    columns
      .slice(maxN)
      .forEach((c, k) =>
        warn('binding', `column ${maxN + k + 1} has no slot in layout "${layout.id}": dropped`),
      );
  }

  // content/2: the slide's `cta` key is the action (button) of a layout that has one (the cta layout)
  const action = (layout.slots ?? []).find((s) => s.id === 'action');
  const ctaKey = action && take((x) => x.type === 'cta' && lowered.origin.get(x) === 'cta');
  if (ctaKey) bindings.push({ slot: action, box: boxes.get(action.box), blocks: [ctaKey] });

  const deferred = [];
  for (const slot of layout.slots ?? []) {
    if (COL_RE.test(slot.id) || (ctaKey && slot === action)) continue;
    const box = boxes.get(slot.box);
    const role = box?.role;
    if (role === 'attribution' || HEADING_RE.test(slot.id)) {
      deferred.push(slot);
      continue;
    }
    let blocks = [];
    if (role === 'title' || role === 'subtitle' || role === 'eyebrow') {
      const b = take((x) => x.type === role);
      if (b) blocks = [b];
    } else if (TYPE_SLOT[slot.type]) {
      // a flow slot `compare` (the compare layouts) takes the compare block's columns
      const want = slot.id === 'compare' ? 'columns' : TYPE_SLOT[slot.type];
      const b = take((x) => x.type === want);
      if (b) blocks = [b];
    } else if (slot.type === 'list') {
      const b = take((x) => x.type === 'list');
      if (b) blocks = [b];
    } else if (slot.type === 'richtext' || slot.type === 'text') {
      blocks = takeAll((x) => BODY_TYPES.has(x.type));
    }
    if (blocks.length) bindings.push({ slot, box, blocks });
    else missing(slot);
  }
  for (const slot of deferred) {
    const head = HEADING_RE.exec(slot.id);
    if (head) {
      const of = bindings.find((x) => x.slot.id === head[1])?.blocks[0];
      const text = of?.[PART_FIELD[head[2]]];
      if (typeof text === 'string' && text) {
        const block =
          head[2] === 'photo'
            ? { type: 'image', src: text, ...(of.attribution ? { alt: of.attribution } : {}) }
            : { type: 'paragraph', text };
        const src = blockFieldSource(sources.get(of), of, PART_FIELD[head[2]]);
        if (src) sources.set(block, src);
        bindings.push({ slot, box: boxes.get(slot.box), blocks: [block] });
      } else missing(slot);
      continue;
    }
    const quote = bindings.flatMap((b) => b.blocks).find((b) => b.type === 'quote');
    const text = quote ? [quote.attribution, quote.role].filter(Boolean).join(', ') : '';
    if (text) {
      const block = { type: 'paragraph', text };
      const q = sources.get(quote);
      if (q?.path) {
        const at = q.type === 'quotes' ? `${q.path}/items/0` : q.path;
        const keys = q.type === 'quotes' ? ['name', 'role'] : ['attribution', 'role'];
        const paths = keys.filter((k, i) => [quote.attribution, quote.role][i]).map((k) => `${at}/${k}`);
        sources.set(block, { paths, join: ', ' });
      }
      bindings.push({ slot, box: boxes.get(slot.box), blocks: [block] });
    } else missing(slot);
  }
  for (const b of pool) {
    if (used.has(b)) continue;
    const from = lowered.origin.get(b);
    if (SLIDE_KEYS.has(from))
      warn('content', `${from} not rendered on layout "${layout.id}" until S2.a layouts land`);
    else warn('binding', `${from ?? b.type} block has no slot in layout "${layout.id}": not shown`);
  }
  // keep the layout's slot order
  const order = new Map((layout.slots ?? []).map((s, k) => [s.id, k]));
  bindings.sort((a, b) => order.get(a.slot.id) - order.get(b.slot.id));
  for (const b of bindings) {
    b.content = content;
    b.sources = sources;
  }
  return bindings;
}
