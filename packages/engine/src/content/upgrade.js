/**
 * content/1 -> content/2 (docs/S2-content-v2.md §4). Deterministic and lossless where content/2 has the field; a v1
 * field content/2 has no place for is dropped with an info warning (kpis.delta, which no v1 layout showed either).
 *
 * Slide keys: the first `title` block -> `title`, the first `eyebrow` -> `label`, the first `subtitle` -> `subtitle`
 * (further ones become paragraphs), the first `cta` -> `cta` (its url / contact become paragraphs).
 * Blocks: list -> points, cards -> items, steps -> process (shape linear), kpis {value, label} -> {value, heading},
 * quote -> quotes (adjacent quotes merge into one block), image -> image (adjacent images merge), timeline {when,
 * title, text} -> {when, heading, body}, columns -> compare (a column's list items / paragraphs become its items, its
 * first image the column image), chart / table / people / logos / paragraph keep their fields (chartType stackedBar ->
 * stacked).
 */

const SLIDE_KEY_ORDER = [
  'id',
  'kind',
  'layout',
  'surface',
  'label',
  'title',
  'subtitle',
  'number',
  'background',
  'cta',
  'notes',
  'decor',
  'logo',
];

/** Copy the defined keys of `src` named in `keys` (in that order), mapping names with `rename`. */
function pick(src, keys, rename = {}) {
  const out = {};
  for (const k of keys) {
    const v = src?.[k];
    if (v !== undefined && v !== null && v !== '') out[rename[k] ?? k] = v;
  }
  return out;
}

const listNode = (it) => {
  const node = { text: it.text };
  if (it.children?.length) node.children = it.children.map(listNode);
  return node;
};

/** A v1 list item (with nested children) as a compare item: heading = text, body = the children's lines. */
const listItemToCompare = (it) => {
  const out = { heading: it.text };
  const lines = [];
  const walk = (items) =>
    items.forEach((c) => {
      lines.push(c.text);
      if (c.children?.length) walk(c.children);
    });
  walk(it.children ?? []);
  if (lines.length) out.body = lines.join('\n');
  return out;
};

const headingBody = (it) => {
  const out = {};
  if (it.title) out.heading = it.title;
  else if (it.text) out.heading = it.text;
  if (it.title && it.text) out.body = it.text;
  return out;
};

/**
 * One v1 block -> {block} (a content/2 block), {slide: {key: value}} or {merge: 'quotes' | 'image', node}.
 * `warn(message, severity)` for dropped v1 fields; `hoist(block)` receives v2 blocks found inside v1 columns.
 */
function upgradeBlock(b, warn, isV2, hoist) {
  if (isV2(b)) return [{ block: b }];
  switch (b.type) {
    case 'title':
      return [{ slide: { title: b.text } }];
    case 'eyebrow':
      return [{ slide: { label: b.text } }];
    case 'subtitle':
      return [{ slide: { subtitle: b.text } }];
    case 'cta': {
      const out = [{ slide: { cta: b.text } }];
      if (b.url) out.push({ block: { type: 'paragraph', text: b.url } });
      if (b.contact) out.push({ block: { type: 'paragraph', text: b.contact } });
      return out;
    }
    case 'paragraph':
      return [{ block: { type: 'paragraph', text: b.text } }];
    case 'list': {
      const block = { type: 'points' };
      if (b.ordered) block.ordered = true;
      block.items = (b.items ?? []).map(listNode);
      return [{ block }];
    }
    case 'cards':
      return [
        {
          block: {
            type: 'items',
            items: (b.items ?? []).map((it) => ({
              ...headingBody(it),
              ...pick(it, ['icon', 'image', 'number'], { number: 'label' }),
            })),
          },
        },
      ];
    case 'steps':
      return [{ block: { type: 'process', shape: 'linear', items: (b.items ?? []).map(headingBody) } }];
    case 'kpis': {
      if ((b.items ?? []).some((it) => it.delta))
        warn('kpis.delta has no content/2 field: dropped (no v1 layout showed it)', 'info');
      return [
        {
          block: {
            type: 'kpis',
            items: (b.items ?? []).map((it) => pick(it, ['value', 'label', 'trend'], { label: 'heading' })),
          },
        },
      ];
    }
    case 'timeline':
      return [
        {
          block: {
            type: 'timeline',
            items: (b.items ?? []).map((it) => ({ ...pick(it, ['when']), ...headingBody(it) })),
          },
        },
      ];
    case 'quote':
      return [
        {
          merge: 'quotes',
          node: pick(b, ['text', 'attribution', 'role', 'avatar'], { attribution: 'name', avatar: 'photo' }),
        },
      ];
    case 'image':
      return [{ merge: 'image', node: pick(b, ['src', 'alt', 'caption', 'focal']) }];
    case 'chart': {
      const block = { type: 'chart', ...pick(b, ['chartType', 'categories', 'series', 'highlight', 'unit']) };
      if (block.chartType === 'stackedBar') block.chartType = 'stacked';
      return [{ block }];
    }
    case 'table':
      return [{ block: { type: 'table', ...pick(b, ['header', 'rows', 'align']) } }];
    case 'people':
      return [
        {
          block: {
            type: 'people',
            items: (b.items ?? []).map((it) => pick(it, ['name', 'role', 'photo', 'bio'])),
          },
        },
      ];
    case 'logos':
      return [
        {
          block: {
            type: 'logos',
            items: (b.items ?? []).map((it) => pick(it, ['src', 'name', 'heading', 'body', 'row'])),
          },
        },
      ];
    case 'columns': {
      const columns = (b.items ?? []).map((col) => {
        const c = { header: col.title ?? '' };
        const items = [];
        for (const inner of col.blocks ?? []) {
          if (isV2(inner)) {
            hoist(inner);
            continue;
          }
          if (inner.type === 'list') items.push(...(inner.items ?? []).map(listItemToCompare));
          else if (inner.type === 'image' && !c.image) c.image = inner.src;
          else if (typeof inner.text === 'string') items.push({ heading: inner.text });
          else warn(`a ${inner.type} block inside a column has no compare field: dropped`, 'warn');
        }
        if (items.length) c.items = items;
        return c;
      });
      return [{ block: { type: 'compare', columns } }];
    }
    default:
      warn(`${b.type} block has no content/2 equivalent: dropped`, 'warn');
      return [];
  }
}

/** Order a content/2 slide's keys (id, kind, layout, surface, label, title, …, blocks last). */
export function orderSlide(slide) {
  const out = {};
  for (const k of SLIDE_KEY_ORDER) if (slide[k] !== undefined) out[k] = slide[k];
  for (const k of Object.keys(slide)) if (!(k in out) && k !== 'blocks') out[k] = slide[k];
  out.blocks = slide.blocks ?? [];
  return out;
}

/**
 * upgradeSlide(v1Slide, {isV2, warn, keys}) -> content/2 slide. `keys` = slide keys already set (the Markdown slide
 * front): they win, a v1 subtitle that collides becomes a paragraph. `isV2(block)` marks blocks that are content/2
 * already (the parser's v2 fences), passed through unchanged.
 */
export function upgradeSlide(slide, { isV2 = () => false, warn = () => {}, keys = {} } = {}) {
  const out = {};
  for (const k of ['id', 'kind', 'layout', 'surface', 'notes', 'decor', 'logo']) {
    if (slide[k] !== undefined) out[k] = slide[k];
  }
  Object.assign(out, keys);
  const blocks = [];
  const hoisted = [];
  const hoist = (b) => {
    hoisted.push(b);
    warn(`a ${b.type} block inside a "##" column is shown as its own block (columns hold items)`, 'info');
  };
  let last = null; // the merge kind of the previous block ('quotes' | 'image')
  for (const b of slide.blocks ?? []) {
    for (const r of upgradeBlock(b, warn, isV2, hoist)) {
      if (r.slide) {
        const [k, v] = Object.entries(r.slide)[0];
        if (out[k] === undefined) out[k] = v;
        else if (k === 'subtitle' || k === 'cta') {
          blocks.push({ type: 'paragraph', text: v });
          if (k === 'subtitle') warn('a second subtitle is kept as a paragraph', 'info');
        } else warn(`a second ${k} is dropped`, 'warn');
        last = null;
        continue;
      }
      if (r.merge) {
        const prev = blocks[blocks.length - 1];
        if (last === r.merge && prev?.type === r.merge) prev.items.push(r.node);
        else blocks.push({ type: r.merge, items: [r.node] });
        last = r.merge;
        continue;
      }
      blocks.push(r.block);
      last = null;
    }
    blocks.push(...hoisted.splice(0));
  }
  out.blocks = blocks;
  return orderSlide(out);
}

/**
 * upgradeContent(doc) -> {content, warnings}: a content/1 document as content/2 (content/2 is returned unchanged).
 * Warnings: [{check: 'content', severity, message, slide}].
 */
export function upgradeContent(doc) {
  if (!doc || doc.schema === 'content/2') return { content: doc, warnings: [] };
  const warnings = [];
  const slides = (doc.slides ?? []).map((s, i) =>
    upgradeSlide(s, {
      warn: (message, severity = 'warn') =>
        warnings.push({ check: 'content', severity, message, slide: s.id ?? `s${i + 1}` }),
    }),
  );
  const content = { schema: 'content/2' };
  if (doc.title !== undefined) content.title = doc.title;
  if (doc.meta !== undefined) content.meta = doc.meta;
  content.slides = slides;
  return { content, warnings };
}
