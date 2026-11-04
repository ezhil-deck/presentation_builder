/**
 * The Studio's new-slide skeletons and their placeholder copy (docs/P4-spec.md §3, P4.2): a slide added from the
 * slide-kind picker gets the block skeleton of the layout family picked, with short copy that is clearly placeholder.
 * The content schema stays as it is (no "placeholder" flag): the text itself is the mark. The `placeholder` check
 * (packages/checks) lists the slides that still show one of these strings, so placeholder copy is never exported
 * silently. One list, shared by the picker (UI), the skeletons and the check.
 */

/** Placeholder copy, by the field it stands in. */
export const PLACEHOLDER = Object.freeze({
  title: 'Slide title',
  subtitle: 'Add a subtitle',
  label: 'Label',
  number: '00',
  point: 'Add a point',
  heading: 'Heading',
  body: 'Add a short description',
  step: 'Step',
  value: 'Value',
  kpiLabel: 'What the number measures',
  when: 'When',
  quote: 'Add a quote from a customer or partner',
  name: 'Full name',
  role: 'Job title',
  logo: 'Logo name',
  column: 'Column heading',
  paragraph: 'Add a paragraph that says one thing clearly.',
  chartTitle: 'Chart title',
  tableTitle: 'Table title',
  cell: 'Cell',
  series: 'Series',
  category: 'Category',
  price: 'Price',
  per: 'per month',
  cta: 'Call to action',
  caption: 'Caption',
});

/** Every placeholder string (what the check matches, exact text after trimming). */
export const PLACEHOLDER_TEXTS = Object.freeze([...new Set(Object.values(PLACEHOLDER))]);

/** True when `text` (plain text) is a placeholder string. */
export const isPlaceholderText = (text) =>
  typeof text === 'string' && PLACEHOLDER_TEXTS.includes(text.trim());

const P = PLACEHOLDER;
const times = (n, fn) => Array.from({ length: n }, (_, k) => fn(k));
const points = (n = 3) => ({ type: 'points', items: times(n, () => ({ text: P.point })) });
const items = (n = 3) => ({
  type: 'items',
  items: times(n, () => ({ heading: P.heading, body: P.body })),
});
const process = (n = 4, shape) => ({
  type: 'process',
  ...(shape && shape !== 'linear' ? { shape } : {}),
  items: times(n, () => ({ heading: P.step, body: P.body })),
});
const kpis = (n = 3, extra = {}) => ({
  type: 'kpis',
  ...extra,
  items: times(n, () => ({ value: P.value, heading: P.kpiLabel })),
});
const chart = () => ({
  type: 'chart',
  chartType: 'column',
  categories: times(3, () => P.category),
  series: [{ name: P.series, values: [1, 2, 3] }],
  text: { title: P.chartTitle },
});
const table = () => ({
  type: 'table',
  title: P.tableTitle,
  header: times(3, () => P.column),
  rows: times(3, () => times(3, () => P.cell)),
});
// an image needs a file: the brand's first sample image (dropped with a warning when the brand has none)
const image = (n = 1, treatment) => ({
  type: 'image',
  ...(treatment ? { treatment } : {}),
  items: times(n, (k) => ({ src: `{brand.imagery.samples[${k}]}`, caption: P.caption })),
});
const paragraph = () => ({ type: 'paragraph', text: P.paragraph });
const quotes = (n = 1) => ({
  type: 'quotes',
  items: times(n, () => ({ text: P.quote, name: P.name, role: P.role })),
});
const people = (n = 3) => ({ type: 'people', items: times(n, () => ({ name: P.name, role: P.role })) });
const logos = (n = 4) => ({ type: 'logos', items: times(n, () => ({ name: P.logo })) });
const compare = (tiers) =>
  tiers
    ? {
        type: 'compare',
        tiers: true,
        columns: times(3, () => ({
          header: P.column,
          price: P.price,
          per: P.per,
          features: [P.point, P.point],
        })),
      }
    : {
        type: 'compare',
        columns: times(2, () => ({ header: P.column, items: [{ heading: P.point }, { heading: P.point }] })),
      };

/** The main block of a kind (aside layouts add a points aside). */
const MAIN = {
  agenda: () => points(4),
  bullets: () => points(3),
  text: () => paragraph(),
  'two-column': () => compare(false),
  cards: () => items(3),
  steps: () => process(4),
  timeline: () => ({
    type: 'timeline',
    items: times(3, () => ({ when: P.when, heading: P.heading, body: P.body })),
  }),
  kpi: () => kpis(3),
  chart: () => chart(),
  table: () => table(),
  image: () => image(1),
  'image-text': () => image(1, 'side'),
  quote: () => quotes(1),
  team: () => people(3),
  logos: () => logos(4),
};

/** Process shapes drawn for another node count than four (layouts/shapes.js ranges). */
const SHAPE_NODES = { venn: 3, converge: 3, diverge: 3 };

/** Layout ids whose skeleton differs from their kind's. */
const BY_ID = {
  'kpi-hero': () => [kpis(1)],
  'kpi-nested': () => [kpis(3, { nested: true })],
  'bullets-columns': () => [points(8)],
  'compare-columns': () => [compare(false)],
  'compare-tiers': () => [compare(true)],
  'image-collage': () => [image(3)],
  'image-device': () => [image(1, 'device')],
  'quote-grid': () => [quotes(3)],
  'quote-photo': () => [quotes(1)],
  'image-text': () => [image(1, 'side'), paragraph()],
  'agenda-rows': () => [items(4)],
};

/**
 * The content/2 slide (without `id`) a new slide of layout `def` ({id, kind, tags?, default?}) starts with: the slide
 * keys and blocks of the family, all placeholder copy, the kind as a hint and - unless it is the kind's default - the
 * layout pinned.
 */
export function slideSkeleton(def) {
  const kind = def?.kind ?? 'text';
  const id = def?.id ?? kind;
  const slide = { kind };
  if (id !== kind && !def?.default) slide.layout = id;
  if (kind === 'cover') return { ...slide, title: P.title, subtitle: P.subtitle, blocks: [] };
  if (kind === 'section')
    return { ...slide, number: P.number, title: P.title, subtitle: P.subtitle, blocks: [] };
  if (kind === 'cta') return { ...slide, title: P.title, subtitle: P.subtitle, cta: P.cta, blocks: [] };
  slide.title = P.title;
  let blocks;
  const shape = /^process-(.+)$/.exec(id)?.[1];
  if (shape) blocks = [process(SHAPE_NODES[shape] ?? 4, shape)];
  else if (BY_ID[id]) blocks = BY_ID[id]();
  else if (/-asides?-/.test(id)) {
    const main = (MAIN[kind] ?? MAIN.text)();
    // an aside below the main block is one line high: a short paragraph
    const aside = /-below$/.test(id) ? { type: 'paragraph', text: P.body } : points(2);
    blocks = /-asides-/.test(id) ? [main, aside, paragraph()] : [main, aside];
  } else blocks = [(MAIN[kind] ?? MAIN.text)()];
  return { ...slide, blocks };
}

/** A node's string fields that take placeholder copy, by block type (a new node from the Studio, P4.3). */
const NODE_COPY = Object.freeze({
  points: { text: P.point },
  items: { heading: P.heading, body: P.body, label: P.label },
  subpoints: { heading: P.heading },
  kpis: { value: P.value, heading: P.kpiLabel, body: P.body },
  process: { heading: P.step, body: P.body },
  timeline: { when: P.when, heading: P.heading, body: P.body },
  quotes: { text: P.quote, name: P.name, role: P.role, label: P.label },
  people: { name: P.name, role: P.role, bio: P.body },
  logos: { name: P.logo, heading: P.heading, body: P.body },
  compare: { header: P.column, label: P.label, price: P.price, per: P.per },
});
/** The fields a node of each type must carry (content schema `required`). */
const NODE_REQUIRED = Object.freeze({
  points: ['text'],
  items: ['heading'],
  subpoints: ['heading'],
  kpis: ['value'],
  process: ['heading'],
  timeline: ['heading'],
  quotes: ['text'],
  people: ['name'],
  logos: ['name'],
  compare: ['header'],
});

/**
 * A new node for a flow block of `type` (docs/P4-spec.md §2 "Flow items", P4.3): placeholder copy in the fields the
 * neighbouring node `like` shows (else the type's required fields), its list fields (lines, features, a compare
 * column's rows) as one placeholder line, a logo row copied from the neighbour; never an icon or an image
 * (they need a name or a file the designer gives). null for a type that has no nodes of its own.
 */
export function nodeSkeleton(type, like) {
  const copy = NODE_COPY[type];
  if (!copy) return null;
  const node = {};
  const keys = like && typeof like === 'object' ? Object.keys(like) : [];
  for (const k of NODE_REQUIRED[type]) node[k] = copy[k];
  for (const k of keys) {
    if (copy[k] !== undefined && typeof like[k] === 'string') node[k] = copy[k];
  }
  if (type === 'subpoints' || (type === 'timeline' && Array.isArray(like?.lines))) node.lines = [P.point];
  if (type === 'compare') {
    if (Array.isArray(like?.features)) node.features = [P.point];
    if (Array.isArray(like?.items) || !like?.features) node.items = [{ heading: P.point }];
  }
  if (type === 'logos' && Number.isInteger(like?.row)) node.row = like.row;
  return node;
}
