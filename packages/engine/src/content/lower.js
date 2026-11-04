/**
 * Aliases onto today's layouts (docs/S2-content-v2.md §5): a content/2 slide lowered to the content/1 blocks the v1
 * catalogue binds (S2.a slice 1, before the new layouts exist). Used by inferKind, summarize and bindSlots; compose
 * never sees the difference. A content/1 slide (and any slide whose blocks are already v1-shaped) is returned as the
 * very same object, so content/1 decks compose byte-identically.
 *
 * What a field becomes when no v1 slot shows it: a note `{field, message}` - ONE per slide and field - that bindSlots
 * reports as a content warning ("items.icon not rendered until S2.a layouts land"), so the Studio can show it.
 */

/**
 * Chart types the engine draws (packages/engine/src/fit/chart.js CARTESIAN + RADIAL, and the forms drawn from boxes
 * and shapes: funnel, waterfall, radar, gauge - S2.a slice 3).
 */
export const NATIVE_CHART_TYPES = Object.freeze([
  'column',
  'bar',
  'stackedBar',
  'line',
  'area',
  'scatter',
  'pie',
  'donut',
  'funnel',
  'waterfall',
  'radar',
  'gauge',
]);

/** content/2 chart types drawn as another native type (no data lost: the native chart draws the same thing). */
const CHART_AS = Object.freeze({ stacked: 'stackedBar', grouped: 'column', 'stacked%': 'stackedBar' });

/** Images one image block draws (catalogue §2: a collage of up to four). */
export const IMAGE_MAX = 4;

/** The table grid range (catalogue §6: tableGrid 2–8 × 2–8). */
export const TABLE_MAX = 8;

const V2_ONLY = new Set(['points', 'items', 'subpoints', 'process', 'quotes', 'compare']);

const later = (field) => `${field} not rendered until S2.a layouts land`;
const has = (o, k) => o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '';
const anyItem = (b, keys) => (b.items ?? []).some((it) => keys.some((k) => has(it, k)));
const set = (o, k, v) => {
  if (v !== undefined && v !== null && v !== '') o[k] = v;
  return o;
};

/** A rich table cell as plain text ('✓' / '✗' for a check, the alt text of an image / logo, a rating's value). */
export function cellText(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'boolean') return c ? '✓' : '✗';
  if (typeof c !== 'object') return String(c);
  switch (c.type) {
    case 'check': {
      const v = c.value ?? c.checked;
      return v === true || v === 'true' ? '✓' : '✗';
    }
    case 'image':
    case 'logo':
      return String(c.alt ?? c.text ?? '');
    case 'rating':
      return String(c.value ?? c.text ?? '');
    default:
      return String(c.text ?? c.value ?? '');
  }
}

/** Point nodes -> v1 list items (the icon kept: a points flow draws it as the marker, S2.a slice 2). */
function listItems(items) {
  return (items ?? []).map((it) => {
    const out = { text: it.text };
    if (has(it, 'icon')) out.icon = it.icon;
    if (it.children?.length) out.children = listItems(it.children);
    return out;
  });
}

/** Percent of each category's total, per series (stacked% drawn as stacked shares). */
function shares(series) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const totals = Array.from({ length: n }, (_, k) =>
    series.reduce((a, s) => a + (Number(s.values[k]) || 0), 0),
  );
  return series.map((s) => ({
    name: s.name,
    values: s.values.map((v, k) => (totals[k] ? Math.round(((Number(v) || 0) / totals[k]) * 1000) / 10 : 0)),
  }));
}

/** A compare column as the v1 two-column binds it: {title: header, blocks: [price paragraph, list]}. */
function lowerColumn(c) {
  const blocks = [];
  const price = [c.price, c.per].filter(Boolean).join(' ');
  if (price) blocks.push({ type: 'paragraph', text: price });
  const items = [
    ...(c.features ?? []).map((t) => ({ text: t })),
    ...(c.items ?? []).map((it) => {
      const mark = it.check === true ? '✓ ' : it.check === false ? '✗ ' : '';
      const out = { text: `${mark}${it.heading}` };
      if (it.body) out.children = [{ text: it.body }];
      return out;
    }),
  ];
  if (items.length) blocks.push({ type: 'list', items });
  return set({ blocks }, 'title', c.header);
}

/**
 * One block -> [v1 blocks] (the same object when it is v1-shaped already). `note(field, message?)` records a field
 * no v1 slot shows.
 */
function lowerBlock(b, note) {
  switch (b.type) {
    case 'points': {
      const out = { type: 'list', items: listItems(b.items) };
      if (b.ordered) out.ordered = true;
      return [out];
    }
    case 'items': {
      // title (group heading), icon, image, label: drawn by the S2.a slice 2 layouts (docs/S2-layouts.md §3)
      const out = {
        type: 'cards',
        items: (b.items ?? []).map((it) => {
          const o = set(set({}, 'title', it.heading), 'text', it.body);
          for (const k of ['icon', 'image', 'label']) set(o, k, it[k]);
          return o;
        }),
      };
      return [set(out, 'title', b.title)];
    }
    case 'subpoints':
      return [
        {
          type: 'cards',
          items: (b.items ?? []).map((it) =>
            set(set({}, 'title', it.heading), 'text', (it.lines ?? []).join('\n')),
          ),
        },
      ];
    case 'process': {
      // shape and icon: drawn by the S2.a slice 2 layouts (a shape the node count does not fit: pick() warns); a
      // node's label (content v2.1, D8) is drawn in place of its number marker
      const out = {
        type: 'steps',
        items: (b.items ?? []).map((it) =>
          set(
            set(set(set({}, 'title', it.heading ?? it.title), 'text', it.body ?? it.text), 'icon', it.icon),
            'label',
            it.label,
          ),
        ),
      };
      if (has(b, 'shape') && b.shape !== 'linear') out.shape = b.shape;
      return [out];
    }
    case 'kpis': {
      // nested: three rings (the kpi-nested layout; another node count is a KPI row, pick() warns)
      if (!has(b, 'nested') && !anyItem(b, ['heading', 'body', 'image'])) return [b];
      return [
        {
          type: 'kpis',
          items: (b.items ?? []).map((it) => {
            const out = set({}, 'value', it.value);
            set(out, 'label', it.heading ?? it.label);
            set(out, 'delta', it.delta);
            set(out, 'body', it.body);
            set(out, 'image', it.image);
            return set(out, 'trend', it.trend);
          }),
        },
      ];
    }
    case 'timeline': {
      // icon markers (brand icon by name) and `lines` as sub-points under the body are drawn (S2.a slice 3)
      if (!anyItem(b, ['heading', 'body', 'lines', 'icon'])) return [b];
      return [
        {
          type: 'timeline',
          items: (b.items ?? []).map((it) => {
            const o = set(
              set(set({}, 'when', it.when), 'title', it.heading ?? it.title),
              'text',
              it.body ?? it.text,
            );
            if (it.lines?.length) o.lines = it.lines.map((t) => ({ text: t }));
            return set(o, 'icon', it.icon);
          }),
        },
      ];
    }
    case 'chart': {
      // chart.text (title, axis titles, legend labels, source) is drawn (fit/chart.js + compose/slots.js)
      const native = NATIVE_CHART_TYPES.includes(b.chartType);
      if (native) return [b];
      let chartType = b.chartType;
      let series = b.series ?? [];
      if (CHART_AS[chartType]) {
        if (chartType === 'stacked%') series = shares(series);
        chartType = CHART_AS[chartType];
      } else if (!native) {
        note('chart.type', `chart type ${chartType} rendered as column until its layout exists`);
        chartType = 'column';
      }
      const out = { type: 'chart', chartType };
      set(out, 'categories', b.categories);
      out.series = series;
      set(out, 'unit', b.chartType === 'stacked%' && !has(b, 'unit') ? '%' : b.unit);
      set(out, 'highlight', b.highlight);
      return [set(out, 'text', b.text)];
    }
    case 'table': {
      // rich cells, title / subtitle, highlightColumn and rowHeader are drawn (fit/table.js, compose/slots.js); the
      // grid is 2–8 × 2–8 (catalogue §6): more columns / rows are cut with a content warning
      const rich = [b.header ?? [], ...(b.rows ?? [])].some((r) => r.some((c) => typeof c !== 'string'));
      const extra = ['title', 'subtitle', 'highlightColumn', 'rowHeader'].filter((k) => has(b, k));
      const cols = Math.max(b.header?.length ?? 0, ...(b.rows ?? []).map((r) => r.length));
      const over = cols > TABLE_MAX || (b.rows ?? []).length > TABLE_MAX;
      if (!rich && !extra.length && !over) return [b];
      if (cols > TABLE_MAX)
        note('table.columns', `table has ${cols} columns: drawn with the first ${TABLE_MAX}`);
      if ((b.rows ?? []).length > TABLE_MAX)
        note('table.rows', `table has ${b.rows.length} rows: drawn with the first ${TABLE_MAX}`);
      const cut = (r) => r.slice(0, TABLE_MAX);
      const rows = (b.rows ?? []).slice(0, TABLE_MAX).map(cut);
      const out = { type: 'table' };
      if (b.header) out.header = cut(b.header).map((c) => cellText(c));
      out.rows = rows.map((r) => r.map((c) => cellText(c)));
      set(out, 'align', b.align ? cut(b.align) : undefined);
      for (const k of extra) out[k] = b[k];
      if (rich) {
        // the rich cell specs beside the text (null for a plain string cell); `true` / `false` are check cells
        const spec = (c) =>
          typeof c === 'boolean' ? { type: 'check', value: c } : c && typeof c === 'object' ? c : null;
        out.rich = { rows: rows.map((r) => r.map(spec)) };
        if (b.header) out.rich.header = cut(b.header).map(spec);
      }
      return [out];
    }
    case 'quotes': {
      // 2–4 quotes are a grid of cards, a photo / label is drawn (S2.a slice 3); the v1 quote fields stay the first
      // quote's, so a single plain quote lowers exactly as content/1's
      const one = (q) =>
        set(
          set(set(set(set({}, 'text', q.text), 'attribution', q.name), 'role', q.role), 'photo', q.photo),
          'label',
          q.label,
        );
      const [q, ...more] = b.items ?? [];
      if (!q) return [];
      const out = { type: 'quote', text: q.text };
      set(out, 'attribution', q.name);
      set(out, 'role', q.role);
      set(out, 'photo', q.photo);
      set(out, 'label', q.label);
      if (more.length) out.items = (b.items ?? []).map(one);
      return [out];
    }
    case 'people':
      // title / subtitle above the grid and bio under the role are drawn (S2.a slice 3): the block as written
      return [b];
    case 'logos': {
      // the title above the wall, explicit rows and logo cards (heading + body under each logo) are drawn (S2.a
      // slice 3); a logo without a file shows its name (else its heading)
      if (!has(b, 'title') && !anyItem(b, ['heading', 'body', 'row'])) return [b];
      const out = {
        type: 'logos',
        items: (b.items ?? []).map((it) => {
          const o = set(set({}, 'src', it.src), 'name', it.name ?? (it.body ? undefined : it.heading));
          for (const k of ['heading', 'body', 'row']) set(o, k, it[k]);
          return o;
        }),
      };
      return [set(out, 'title', b.title)];
    }
    case 'compare': {
      // label, image, check rows and tiers are drawn by the compare layouts (S2.a slice 3); each column also keeps
      // the v1 shape (title + blocks) the two-column layout binds
      const cols = b.columns ?? [];
      const out = {
        type: 'columns',
        items: cols.map((c) => {
          const col = lowerColumn(c);
          for (const k of ['label', 'image', 'price', 'per']) set(col, k, c[k]);
          const lines = [
            ...(c.features ?? []).map((t) => ({ text: t })),
            ...(c.items ?? []).map((it) => {
              const o = { text: it.heading };
              if (typeof it.check === 'boolean') o.check = it.check;
              if (it.body) o.children = [{ text: it.body }];
              return o;
            }),
          ];
          if (lines.length) col.lines = lines;
          return col;
        }),
      };
      if (b.tiers) out.tiers = true;
      return [out];
    }
    case 'image': {
      // 2–4 images are a collage, `device` a device frame, captions under the images (S2.a slice 3; the
      // background treatment is the slide background: lowerSlide); more than 4 images: the first 4
      if (!Array.isArray(b.items) || b.src !== undefined) return [b];
      const items = b.items.slice(0, IMAGE_MAX);
      if (b.items.length > IMAGE_MAX)
        note('image.items', `image has ${b.items.length} images: drawn with the first ${IMAGE_MAX}`);
      const [first] = items;
      if (!first) return [];
      const out = { type: 'image', src: first.src, v2: true };
      set(out, 'alt', first.alt);
      set(out, 'focal', first.focal);
      set(out, 'caption', first.caption);
      if (items.length > 1)
        out.items = items.map((it) =>
          set(set(set(set({}, 'src', it.src), 'alt', it.alt), 'caption', it.caption), 'focal', it.focal),
        );
      return [set(out, 'treatment', b.treatment)];
    }
    default:
      return [b];
  }
}

/**
 * The source descriptors of a compare block's lowered columns (content/source.js): each column's price paragraph
 * (price and per joined by a space) and its list rows (features, then each item's heading with its body as a child).
 */
function compareSources(lowered, b, base, sources) {
  (lowered.items ?? []).forEach((col, c) => {
    const orig = b.columns?.[c] ?? {};
    const at = `${base}/columns/${c}`;
    for (const blk of col.blocks ?? []) {
      if (blk.type === 'paragraph') {
        sources.set(blk, {
          paths: ['price', 'per'].filter((k) => orig[k]).map((k) => `${at}/${k}`),
          join: ' ',
        });
      } else if (blk.type === 'list') {
        sources.set(blk, { type: 'list', path: at });
        const nf = orig.features?.length ?? 0;
        blk.items.forEach((it, j) => {
          const path = j < nf ? `${at}/features/${j}` : `${at}/items/${j - nf}/heading`;
          sources.set(it, { path });
          if (it.children?.[0]) sources.set(it.children[0], { path: `${at}/items/${j - nf}/body` });
        });
      }
    }
  });
}

/**
 * lowerSlide(slide) -> { slide, changed, notes: [{field, message}], origin: Map(block -> name), sources: Map(block ->
 * descriptor), background? }. `slide` is v1-shaped (title / eyebrow / number / subtitle / cta blocks from the slide
 * keys, content/2 blocks lowered); `background` = the slide's background image src (the key, or an image block with
 * treatment background); `origin` names the content/2 field or block type a lowered block came from (for "not shown"
 * messages); `sources` maps each lowered block to where it comes from in `slide` ({key} for a slide key, else {type,
 * path: '/blocks/<i>', orig} - content/source.js turns it into the `source` pointers of the deck's text elements).
 * Pure and cheap: inferKind, summarize and bindSlots each lower the slide they are given.
 */
export function lowerSlide(slide) {
  if (!slide || typeof slide !== 'object')
    return { slide, changed: false, notes: [], origin: new Map(), sources: new Map() };
  const notes = new Map();
  const note = (field, message) => {
    if (!notes.has(field)) notes.set(field, message ?? later(field));
  };
  const origin = new Map();
  const sources = new Map();
  let changed = false;
  const head = [];
  const keyBlock = (key, type) => {
    if (typeof slide[key] !== 'string' || slide[key] === '') return;
    const b = { type, text: slide[key] };
    origin.set(b, key);
    sources.set(b, { key });
    head.push(b);
    changed = true;
  };
  keyBlock('title', 'title');
  keyBlock('label', 'eyebrow');
  keyBlock('number', 'number');
  keyBlock('subtitle', 'subtitle');
  // the slide background: the `background` key, else the first image block with treatment background (S2.a slice 3)
  let background = typeof slide.background === 'string' && slide.background ? slide.background : undefined;
  if (background) changed = true;
  const blocks = [];
  (slide.blocks ?? []).forEach((b, i) => {
    if (b?.type === 'image' && b.treatment === 'background' && Array.isArray(b.items)) {
      changed = true;
      if (!background && b.items[0]?.src) background = b.items[0].src;
      else note('image.background', 'image with treatment background: the slide shows one background image');
      return;
    }
    const out = lowerBlock(b, note);
    if (out.length !== 1 || out[0] !== b) changed = true;
    for (const x of out) {
      if (x !== b || V2_ONLY.has(b.type)) origin.set(x, b.type);
      sources.set(x, { type: b?.type, path: `/blocks/${i}`, orig: b });
      if (b?.type === 'compare' && x !== b) compareSources(x, b, `/blocks/${i}`, sources);
      blocks.push(x);
    }
  });
  if (typeof slide.cta === 'string' && slide.cta !== '') {
    const b = { type: 'cta', text: slide.cta };
    origin.set(b, 'cta');
    sources.set(b, { key: 'cta' });
    blocks.push(b);
    changed = true;
  }
  return changed
    ? {
        slide: { ...slide, blocks: [...head, ...blocks] },
        changed: true,
        notes: [...notes].map(([field, message]) => ({ field, message })),
        origin,
        sources,
        ...(background ? { background } : {}),
      }
    : { slide, changed: false, notes: [], origin, sources };
}
