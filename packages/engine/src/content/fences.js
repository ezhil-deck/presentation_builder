/**
 * content/2 fenced blocks (docs/S2-content-v2.md §3): ```` ```<type> ```` + a YAML body -> one content/2 block. The
 * body is a YAML list of nodes, or a mapping of block keys with the nodes under `items` (`columns` for compare; chart,
 * table and paragraph are mappings). YAML is read with the failsafe schema (every scalar a string, so "01", "1.50" and
 * "100%" stay as written); numbers and booleans are read where the field is one.
 *
 * v1 fence names are aliases: cards -> items, steps -> process (shape linear), quote -> quotes; kpis / timeline /
 * people / logos / chart / table accept their v1 field names (title -> heading, text -> body, label -> heading for a
 * KPI, attribution -> name, avatar -> photo, chartType / type). Unknown fields are ignored with one warning per block.
 */

/** Fence name -> content/2 block type. */
export const FENCE_ALIASES = Object.freeze({ cards: 'items', steps: 'process', quote: 'quotes' });

/** Fences only content/2 knows (a document using one is parsed as content/2). */
export const V2_FENCES = Object.freeze([
  'points',
  'items',
  'subpoints',
  'process',
  'quotes',
  'quote',
  'compare',
  'paragraph',
  'image',
]);

/** Fences both versions know (content/1 reads them as P2-spec §1 says). */
export const SHARED_FENCES = Object.freeze(['kpis', 'timeline', 'chart', 'table', 'people', 'logos']);

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && v !== '';
const str = (v) =>
  present(v) ? (typeof v === 'string' ? v : isMap(v) || Array.isArray(v) ? undefined : String(v)) : undefined;
const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined);
const int = (v) => {
  if (!present(v)) return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};
const strList = (v) => (Array.isArray(v) ? v.map(str).filter((x) => x !== undefined) : undefined);

/**
 * Node fields per block type: {field: [reader, ...aliases]}. The first name is the content/2 field; aliases are the
 * v1 names read into it.
 */
const NODE_FIELDS = {
  points: { text: [str, 'title'], icon: [str] },
  items: { heading: [str, 'title'], body: [str, 'text'], icon: [str], image: [str], label: [str, 'number'] },
  subpoints: { heading: [str, 'title'], lines: [strList] },
  kpis: { value: [str], heading: [str, 'label'], body: [str, 'text'], image: [str], trend: [str] },
  process: { heading: [str, 'title'], body: [str, 'text'], icon: [str], label: [str] },
  timeline: { when: [str], heading: [str, 'title'], body: [str, 'text'], lines: [strList], icon: [str] },
  quotes: {
    text: [str, 'quote'],
    name: [str, 'attribution'],
    role: [str],
    photo: [str, 'avatar'],
    label: [str],
  },
  people: { name: [str], role: [str], photo: [str], bio: [str] },
  logos: { src: [str], name: [str], heading: [str], body: [str], row: [int] },
  image: { src: [str], alt: [str], caption: [str] },
};
/** The field a bare scalar node fills. */
const SCALAR_FIELD = {
  points: 'text',
  items: 'heading',
  process: 'heading',
  timeline: 'heading',
  quotes: 'text',
  people: 'name',
  logos: 'name',
  image: 'src',
  kpis: 'value',
};
/** Block-level keys of the node-list types: {key: reader}. */
const BLOCK_KEYS = {
  points: { ordered: bool },
  items: { title: str },
  subpoints: {},
  kpis: { nested: bool },
  process: { shape: str },
  timeline: {},
  quotes: {},
  people: { title: str, subtitle: str },
  logos: { title: str },
  image: { treatment: str },
};

function makeUnknown(type, warn) {
  const seen = new Set();
  return (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    warn(`fenced block "${type}": unknown field "${key}" ignored`);
  };
}

function readNode(type, raw, unknown) {
  if (!isMap(raw)) {
    const v = str(raw);
    return v === undefined ? {} : { [SCALAR_FIELD[type] ?? 'text']: v };
  }
  const fields = NODE_FIELDS[type];
  const out = {};
  const used = new Set();
  for (const [field, [read, ...aliases]] of Object.entries(fields)) {
    for (const name of [field, ...aliases]) {
      if (!present(raw[name])) continue;
      used.add(name);
      const v = read(raw[name]);
      if (v !== undefined && out[field] === undefined) out[field] = v;
    }
  }
  if (type === 'points' && Array.isArray(raw.children)) {
    used.add('children');
    const kids = raw.children.map((c) => readNode('points', c, unknown)).filter((c) => c.text !== undefined);
    if (kids.length) out.children = kids;
  }
  if (type === 'subpoints' && out.lines === undefined && typeof raw.body === 'string') {
    used.add('body');
    out.lines = raw.body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  for (const k of Object.keys(raw)) if (!used.has(k) && present(raw[k])) unknown(k);
  // a node written with only a body (v1 `- text: …`) keeps it as its heading, as upgrade.js does
  if (out.heading === undefined && out.body !== undefined && 'heading' in NODE_FIELDS[type]) {
    const { body, ...rest } = out;
    return { heading: body, ...rest };
  }
  return out;
}

function nodeList(type, data, warn, extra = () => false) {
  const unknown = makeUnknown(type, warn);
  const block = { type };
  let list = data;
  if (isMap(data)) {
    const blockKeys = BLOCK_KEYS[type];
    for (const [k, read] of Object.entries(blockKeys)) {
      const v = read(data[k]);
      if (v !== undefined) block[k] = v;
    }
    const rest = Object.fromEntries(
      Object.entries(data).filter(([k]) => k !== 'items' && !(k in blockKeys) && !extra(k)),
    );
    list = data.items;
    // a single quote / image written as one mapping: the non-block keys are its node
    const single = { quotes: 'text', image: 'src' }[type];
    if (list === undefined && single && present(data[single])) list = [rest];
    else for (const [k, v] of Object.entries(rest)) if (present(v)) unknown(k);
  }
  if (!Array.isArray(list)) throw new Error(`${type} fence must be a YAML list (or a mapping with "items")`);
  block.items = list.map((n) => readNode(type, n, unknown));
  return block;
}

function chartBlock(data, warn) {
  if (!isMap(data)) throw new Error('chart fence must be a YAML mapping');
  const unknown = makeUnknown('chart', warn);
  const known = new Set(['type', 'chartType', 'categories', 'series', 'text', 'highlight', 'unit']);
  for (const k of Object.keys(data)) if (!known.has(k) && present(data[k])) unknown(k);
  const block = { type: 'chart', chartType: str(data.chartType ?? data.type) };
  if (block.chartType === 'stackedBar') block.chartType = 'stacked';
  const cats = strList(data.categories);
  if (cats) block.categories = cats;
  block.series = (Array.isArray(data.series) ? data.series : []).map((s) => ({
    name: str(s?.name) ?? '',
    values: (Array.isArray(s?.values) ? s.values : []).map(Number),
  }));
  if (isMap(data.text)) {
    const text = {};
    for (const k of ['title', 'xAxis', 'yAxis', 'source']) if (str(data.text[k])) text[k] = str(data.text[k]);
    const legend = strList(data.text.legend);
    if (legend) text.legend = legend;
    for (const k of Object.keys(data.text)) {
      if (!['title', 'xAxis', 'yAxis', 'source', 'legend'].includes(k)) unknown(`text.${k}`);
    }
    block.text = text;
  }
  const hl = int(data.highlight);
  if (hl !== undefined) block.highlight = hl;
  if (str(data.unit)) block.unit = str(data.unit);
  return block;
}

function cell(v) {
  if (v === 'true' || v === 'false') return { type: 'check', value: v === 'true' };
  if (isMap(v)) {
    const out = { type: str(v.type) ?? 'text' };
    for (const k of ['text', 'src', 'alt']) if (str(v[k])) out[k] = str(v[k]);
    if (present(v.value)) {
      const b = bool(v.value);
      const n = Number(v.value);
      out.value =
        b !== undefined
          ? b
          : out.type === 'number' || out.type === 'rating'
            ? Number.isFinite(n)
              ? n
              : String(v.value)
            : String(v.value);
    }
    return out;
  }
  return str(v) ?? '';
}

function tableBlock(data, warn) {
  if (!isMap(data)) throw new Error('table fence must be a YAML mapping');
  const unknown = makeUnknown('table', warn);
  const known = ['title', 'subtitle', 'header', 'rows', 'align', 'highlightColumn', 'rowHeader'];
  for (const k of Object.keys(data)) if (!known.includes(k) && present(data[k])) unknown(k);
  const block = { type: 'table' };
  for (const k of ['title', 'subtitle']) if (str(data[k])) block[k] = str(data[k]);
  if (Array.isArray(data.header)) block.header = data.header.map(cell);
  block.rows = (Array.isArray(data.rows) ? data.rows : []).map((r) => (Array.isArray(r) ? r : [r]).map(cell));
  const align = strList(data.align);
  if (align) block.align = align;
  const hc = int(data.highlightColumn);
  if (hc !== undefined) block.highlightColumn = hc;
  const rh = bool(data.rowHeader);
  if (rh !== undefined) block.rowHeader = rh;
  return block;
}

function compareBlock(data, warn) {
  const unknown = makeUnknown('compare', warn);
  const cols = Array.isArray(data) ? data : isMap(data) ? data.columns : undefined;
  if (!Array.isArray(cols))
    throw new Error('compare fence must be a YAML list of columns (or a mapping with "columns")');
  const block = { type: 'compare' };
  if (isMap(data)) {
    const t = bool(data.tiers);
    if (t !== undefined) block.tiers = t;
    for (const k of Object.keys(data)) if (!['tiers', 'columns'].includes(k) && present(data[k])) unknown(k);
  }
  const colKeys = ['header', 'title', 'label', 'image', 'price', 'per', 'features', 'items'];
  block.columns = cols.map((c) => {
    if (!isMap(c)) return { header: str(c) ?? '' };
    for (const k of Object.keys(c)) if (!colKeys.includes(k) && present(c[k])) unknown(`columns.${k}`);
    const out = { header: str(c.header ?? c.title) ?? '' };
    for (const k of ['label', 'image', 'price', 'per']) if (str(c[k])) out[k] = str(c[k]);
    const features = strList(c.features);
    if (features) out.features = features;
    if (Array.isArray(c.items)) {
      out.items = c.items.map((it) => {
        if (!isMap(it)) return { heading: str(it) ?? '' };
        for (const k of Object.keys(it)) {
          if (!['heading', 'title', 'body', 'text', 'check'].includes(k) && present(it[k]))
            unknown(`items.${k}`);
        }
        const node = { heading: str(it.heading ?? it.title) ?? '' };
        if (str(it.body ?? it.text)) node.body = str(it.body ?? it.text);
        const ch = bool(it.check);
        if (ch !== undefined) node.check = ch;
        return node;
      });
    }
    return out;
  });
  return block;
}

/**
 * A content/2 fence -> block. `name` is the fence name as written; `data` the failsafe YAML; `raw` the fence body
 * (paragraph only); `warn(message, severity)`. Throws when the YAML has the wrong shape for the type.
 */
export function fenceBlockV2(name, data, raw, warn) {
  const type = FENCE_ALIASES[name] ?? name;
  switch (type) {
    case 'chart':
      return chartBlock(data, warn);
    case 'table':
      return tableBlock(data, warn);
    case 'compare':
      return compareBlock(data, warn);
    case 'paragraph': {
      if (typeof data === 'string') return { type: 'paragraph', text: data.trim() };
      if (isMap(data) && str(data.text)) return { type: 'paragraph', text: str(data.text).trim() };
      throw new Error('paragraph fence must be text (or a mapping with "text")');
    }
    case 'logos': {
      // rows: [[logo, …], [logo, …]] -> one node list with `row`
      if (isMap(data) && Array.isArray(data.rows)) {
        const items = data.rows.flatMap((row, r) =>
          (Array.isArray(row) ? row : [row]).map((n) =>
            isMap(n) ? { ...n, row: String(r) } : { name: n, row: String(r) },
          ),
        );
        return nodeList('logos', { ...data, items, rows: undefined }, warn, (k) => k === 'rows');
      }
      return nodeList('logos', data, warn);
    }
    default: {
      const block = nodeList(type, data, warn);
      // the v1 `steps` fence is a linear process
      if (name === 'steps' && block.shape === undefined) {
        const { items, ...rest } = block;
        return { ...rest, shape: 'linear', items };
      }
      return block;
    }
  }
}

/** Keys of a shared fence's YAML that only content/2 has (a document using one is parsed as content/2). */
export function sharedFenceIsV2(name, data) {
  const items = Array.isArray(data) ? data : null;
  const keysOf = (list) => new Set((list ?? []).filter(isMap).flatMap((n) => Object.keys(n)));
  switch (name) {
    case 'kpis':
    case 'timeline':
    case 'people':
    case 'logos': {
      // the mapping form: block keys + items
      if (isMap(data)) return ['items', 'rows', ...Object.keys(BLOCK_KEYS[name])].some((k) => k in data);
      const keys = keysOf(items);
      const v2 = {
        kpis: ['heading', 'body', 'image'],
        timeline: ['heading', 'body', 'lines', 'icon'],
        people: ['bio'],
        logos: ['heading', 'body', 'row'],
      }[name];
      return v2.some((k) => keys.has(k));
    }
    case 'chart':
      return (
        isMap(data) &&
        (data.type !== undefined ||
          data.text !== undefined ||
          !['bar', 'column', 'stackedBar', 'line', 'area', 'pie', 'donut', 'scatter'].includes(
            String(data.chartType),
          ))
      );
    case 'table':
      return (
        isMap(data) &&
        (['title', 'subtitle', 'highlightColumn', 'rowHeader'].some((k) => data[k] !== undefined) ||
          [data.header ?? [], ...(Array.isArray(data.rows) ? data.rows : [])].some(
            (r) => Array.isArray(r) && r.some((c) => isMap(c) || typeof c === 'boolean'),
          ))
      );
    default:
      return false;
  }
}
