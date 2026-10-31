/**
 * Bind Content blocks to layout slots, by type (P2-spec §3.5). Conventions a layout follows (see the P2 report):
 * - box.role 'title' | 'subtitle' | 'eyebrow' slots take the block of that type;
 * - slot.type 'richtext' | 'text' (box role body / list / none) takes every remaining paragraph, list and cta block;
 *   'list' takes the first list;
 * - slot.type kpis | chart | table | cards | steps | timeline | logos | quote | image take the first block of that type;
 *   'people' (layout schema v1.2) and 'images' take `people`;
 * - box.role 'attribution' takes the attribution (+ role) of the quote bound to the slide;
 * - slots `col<N>-title` / `col<N>-body` take column N of the `columns` block (its title / its blocks). Without a
 *   columns block, columns are formed from the slide: blocks before the first subtitle -> column 1, the subtitle ->
 *   column 2's title, the rest -> column 2 (no subtitle: images -> column 1, the rest -> column 2), with an info.
 * Unbound required slots (schema default: required) and blocks no slot took are warnings.
 */
const COL_RE = /^col(\d+)-(title|body)$/;
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
};
const BODY_TYPES = new Set(['paragraph', 'list', 'cta']);

function inferColumns(blocks) {
  const sub = blocks.findIndex((b) => b.type === 'subtitle');
  if (sub >= 0) {
    return [{ blocks: blocks.slice(0, sub) }, { title: blocks[sub].text, blocks: blocks.slice(sub + 1) }];
  }
  const images = blocks.filter((b) => b.type === 'image');
  if (images.length && images.length < blocks.length) {
    return [{ blocks: images }, { blocks: blocks.filter((b) => b.type !== 'image') }];
  }
  return [{ blocks }];
}

export function bindSlots(slide, layout, { warn = () => {} } = {}) {
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
    let columns = take((b) => b.type === 'columns')?.items;
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
      const col = columns[Number(n) - 1];
      const blocks = !col
        ? []
        : part === 'title'
          ? col.title
            ? [{ type: 'subtitle', text: col.title }]
            : []
          : col.blocks;
      if (blocks.length) bindings.push({ slot, box: boxes.get(slot.box), blocks });
      else missing(slot);
    }
    columns
      .slice(maxN)
      .forEach((c, k) =>
        warn('binding', `column ${maxN + k + 1} has no slot in layout "${layout.id}": dropped`),
      );
  }

  const deferred = [];
  for (const slot of layout.slots ?? []) {
    if (COL_RE.test(slot.id)) continue;
    const box = boxes.get(slot.box);
    const role = box?.role;
    if (role === 'attribution') {
      deferred.push(slot);
      continue;
    }
    let blocks = [];
    if (role === 'title' || role === 'subtitle' || role === 'eyebrow') {
      const b = take((x) => x.type === role);
      if (b) blocks = [b];
    } else if (TYPE_SLOT[slot.type]) {
      const b = take((x) => x.type === TYPE_SLOT[slot.type]);
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
    const quote = bindings.flatMap((b) => b.blocks).find((b) => b.type === 'quote');
    const text = quote ? [quote.attribution, quote.role].filter(Boolean).join(', ') : '';
    if (text) bindings.push({ slot, box: boxes.get(slot.box), blocks: [{ type: 'paragraph', text }] });
    else missing(slot);
  }
  for (const b of pool) {
    if (!used.has(b)) warn('binding', `${b.type} block has no slot in layout "${layout.id}": not shown`);
  }
  // keep the layout's slot order
  const order = new Map((layout.slots ?? []).map((s, k) => [s.id, k]));
  bindings.sort((a, b) => order.get(a.slot.id) - order.get(b.slot.id));
  return bindings;
}
