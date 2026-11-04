/**
 * Catalogue layouts (C3, docs/PLAN-catalogue.md): one LayoutDef per content-length plan slide of the Rich Slide
 * Catalogue, built from the generated records (packages/layouts/data/catalogue-layouts.json, scripts/
 * catalogue-layouts.mjs). A record gives the composition only - each container's zone (fractions of the catalogue's
 * body box, x / w on a 12-column grid), its block type, its item flow and whether its items are cards. The build puts
 * that composition into the Mood's body area with the existing helpers, so the slide is drawn in the brand's terms:
 *
 * - the title is our standard title (`standardTitle`): the catalogue's header (kicker, title, rule) is never copied;
 * - a zone's x / w = its grid columns with the Mood's gutter (geometry.grid.gutter); y / h = its fractions of the
 *   content group (the vertical union of the zones), stretched to the area: the catalogue centres the group in its
 *   body, our body area is the content's room already;
 * - kpis -> a flow of `kpi-value-label(-body)`; items / subpoints -> a flow of `item-card` (the Mood's card) when the
 *   catalogue draws them as cards, else of `compare-column` (heading + text, no background); points -> the list box
 *   (one column) or a flow of points (several); chart -> the chart slot; table -> `tableInto`; process -> the linear
 *   steps flow in the record's direction; timeline -> the timeline flow (+ the brand's line); compare -> the compare
 *   columns (pricing tiers on tier cards); paragraph -> a body box in the role its size band asks for;
 * - a column / grid flow whose rows are shorter than the brand's item needs puts its items side by side
 *   (`fittedFlow`: the rows that fit, ceil(n / rows) columns); a chart / table stacked on the same columns as a flow
 *   takes the room the flow's rows do not need (`giveToGraphic`);
 * - capacities are the record's counts; each container's slot is required, so a block the slide lacks is reported.
 *
 * Nothing of the catalogue's colours, faces, grounds, rules or hairlines is drawn (D5, CLAUDE.md rule 3). C3.2: a
 * container the catalogue separates with rules takes the Mood's card (D6, `card` / `cardSource: 'rule'`); a numeral /
 * year gets its zone and size band in the item layouts (D7, `flow.numeral`: steps, timelines, numbered cards and
 * columns); a text whose zone the card's padding leaves too small steps its role down (`fittingRole`, `fitValueRole`)
 * or takes room from a graphic on its columns (`giveToGraphic`).
 *
 * `match(summary, ctx)` scores a content/2 slide unless `ctx.options.catalogue` is `false` (the compose opt-out; C4
 * made the catalogue the default): the same combination key (catalogue-key.js) -> 100 (101 for the timeline record of
 * the slide's flavour: with `lines` the timeline with details, without them the plain timeline - the two share keys);
 * the same block types and counts with other bands -> 60 minus the band distance (at least 1); else 0. A record with a
 * process container adds 0.5 when its `labels` agree with the slide's (C4, D8: a roadmap record with `labels: 'year'`
 * for a process whose nodes carry a `label`, one without for a process without; a tie-break below one band step). A
 * process of another shape than linear and nested KPIs score 0 (`drawnElsewhere`: the shape / ring layouts draw them).
 * pick() (engine compose/pick.js) scores the catalogue layouts before the 68, so these scores never compete with theirs.
 */
import data from './catalogue-data.cjs';
import { bandDistance, combinationKey, combinationShape } from './catalogue-key.js';
import { createBuilder, estimateLines, flowBox, standardTitle, v2Block, v2Blocks } from './common.js';
import { LINES, bottom, frame, gutter, lineBox, pickRole, space } from './geometry.js';
/**
 * The padding the engine puts inside the Mood's card behind a catalogue container (engine compose/slots.js
 * componentPadding: components.card tokens.padding / padding.0, else spacing.md) - also for a flat card, which draws
 * no rect (shapes.js cardPadding counts drawn cards only).
 */
function cardPadding(mood) {
  const card = mood?.components?.card;
  if (!card) return 0;
  const t = card.tokens ?? {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return n(t.padding) ?? n(t['padding.0']) ?? space(mood, 'md');
}
import { groupHeading } from './kinds/aside.js';
import { lineWeight, stepsFlow } from './kinds/steps.js';
import { tableInto } from './kinds/table.js';
import { heroValueRole, markerSize, numeralZone, timelineLineY } from './items.js';
import { role as moodRole } from './geometry.js';
import { anyIcon, iconSize } from './icons.js';

/** Catalogue `data-type` -> our content/2 block (null: the container is the slide title, no slot). */
export const CONTAINER_TYPES = Object.freeze({
  kpi_block: 'kpis',
  kpi_vb: 'kpis',
  simple_list: 'points',
  list_with_description: 'items',
  list_with_subpoints: 'subpoints',
  multi_column_list: 'items',
  comparison: 'compare',
  roadmap: 'process',
  timeline: 'timeline',
  timeline_with_list: 'timeline',
  chart: 'chart',
  table: 'table',
  paragraph: 'paragraph',
  title: null,
});

const LAYOUT_KINDS = new Set([
  'cover',
  'section',
  'agenda',
  'bullets',
  'text',
  'two-column',
  'cards',
  'steps',
  'timeline',
  'kpi',
  'chart',
  'table',
  'image',
  'image-text',
  'quote',
  'team',
  'logos',
  'cta',
]);
const DIRECTIONS = new Set(['row', 'column', 'grid']);
const COLUMNS = 12;
const isFrac = (v) => typeof v === 'number' && Number.isFinite(v);

/** Every problem of a record (the loader rejects a record with any): messages naming the record and container. */
export function recordProblems(rec) {
  const out = [];
  const at = `catalogue layout ${rec?.id ?? '?'}`;
  if (!rec || typeof rec !== 'object') return [`${at}: not an object`];
  if (!/^cat-l\d+-\d+$/.test(rec.id ?? '')) out.push(`${at}: id must be cat-l<plan>-<n>`);
  if (!LAYOUT_KINDS.has(rec.kind)) out.push(`${at}: unknown kind "${rec.kind}"`);
  if (!Array.isArray(rec.kinds) || !rec.kinds.every((k) => LAYOUT_KINDS.has(k)))
    out.push(`${at}: kinds must be layout kinds`);
  if (!Array.isArray(rec.combination)) out.push(`${at}: no combination`);
  if (!Array.isArray(rec.containers) || !rec.containers.length) out.push(`${at}: no containers`);
  for (const c of rec.containers ?? []) {
    const where = `${at}: container ${c?.c}`;
    if (!(c?.type in CONTAINER_TYPES)) {
      out.push(`${where} has unknown type "${c?.type}"`);
      continue;
    }
    if (c.block !== CONTAINER_TYPES[c.type])
      out.push(`${where} (${c.type}) must take block ${CONTAINER_TYPES[c.type]}, has ${c.block}`);
    if (!['x', 'y', 'w', 'h'].every((k) => isFrac(c.zone?.[k]))) out.push(`${where}: zone needs x, y, w, h`);
    const g = c.grid ?? {};
    if (!(
      Number.isInteger(g.col) &&
      Number.isInteger(g.span) &&
      g.col >= 0 &&
      g.span >= 1 &&
      g.col + g.span <= COLUMNS
    ))
      out.push(`${where}: grid {col, span} must lie on the 12 columns`);
    if (!DIRECTIONS.has(c.flow?.direction)) out.push(`${where}: flow direction must be row, column or grid`);
  }
  try {
    if (Array.isArray(rec.combination) && combinationKey(rec.combination) !== rec.key)
      out.push(`${at}: key "${rec.key}" is not the combination's key`);
  } catch (e) {
    out.push(`${at}: ${e.message}`);
  }
  return out;
}

/**
 * The zone of a container in the area: x / w on the 12 columns with the Mood's gutter; y / h by its fractions of the
 * content group (`group`: the vertical union of the zones, body fractions), so the group fills the area.
 */
export function zoneFrame(area, c, g, group = { y: 0, h: 1 }, scale = { s: 1, offset: 0 }) {
  const colW = (area.w - g * (COLUMNS - 1)) / COLUMNS;
  const x = area.x + c.grid.col * (colW + g);
  const w = c.grid.span * colW + (c.grid.span - 1) * g;
  const gh = group.h > 0 ? group.h : 1;
  const y0 = Math.min(1, Math.max(0, (c.zone.y - group.y) / gh));
  const y1 = Math.min(1, Math.max(y0, (c.zone.y + c.zone.h - group.y) / gh));
  return frame(x, area.y + (scale.offset + y0 * scale.s) * area.h, w, (y1 - y0) * scale.s * area.h);
}

const mid = (band) => {
  const [lo, hi] = String(band).split('-').map(Number);
  return Math.round((lo + hi) / 2);
};

/**
 * The plan-field lengths a container's text has: the slide's (its summary block in the same place: {heading,
 * description, value, body, bullet, paragraph} from our node fields, as catalogue-key.js reads them), else the middle
 * of the catalogue's bands.
 */
function lengthsOf(rec, k, summary) {
  const cb = rec.combination[k];
  const sb = v2Blocks(summary)[k];
  if (sb && sb.type === cb?.type && sb.chars) {
    const ch = sb.chars;
    const n = (...keys) => keys.reduce((a, key) => a + (Number(ch[key]) || 0), 0);
    const kpiLine = cb.type === 'kpis' && !n('body');
    return {
      heading: cb.type === 'compare' ? n('header') : kpiLine ? 0 : n('heading'),
      description: cb.type === 'compare' ? n('rows') : n('body', 'lines'),
      value: n('value'),
      body: kpiLine ? n('heading') : n('body'),
      bullet: n('text'),
      paragraph: n('text'),
    };
  }
  return Object.fromEntries(Object.entries(cb?.bands ?? {}).map(([f, band]) => [f, mid(band)]));
}

/** Lines `chars` take at `roleName` over `w` (the face's average width; unknown -> 2). */
const linesOf = (mood, roleName, chars, w) =>
  chars > 0 ? (estimateLines(mood, roleName, chars, w) ?? 2) : 0;

/**
 * The height a container's content needs in the brand's roles (the size-band roles where the catalogue gives them),
 * for its text lengths (`lengthsOf`) over its zone width `w`: rows of items, a list's lines, a paragraph's lines, a
 * table's rows; a chart six body lines. 0 = unknown.
 */
export function zoneNeed(mood, c, w, len, gap, block) {
  const roles = recordRoles(mood, c);
  const sm = space(mood, 'sm');
  const n = Math.max(1, c.nodes ?? 1);
  const cols = c.flow.direction === 'column' ? 1 : Math.max(1, c.flow.columns);
  const rows = c.flow.direction === 'column' ? n : c.flow.direction === 'grid' ? Math.ceil(n / cols) : 1;
  const cw = (w - gap * (cols - 1)) / cols;
  const pad = c.card ? 2 * cardPadding(mood) : 0;
  const lb = (r, l) => lineBox(mood, r, l);
  const rowsOf = (item) => rows * (item + pad) + (rows - 1) * gap;
  switch (c.block) {
    case 'kpis': {
      const label = roles.label ?? pickRole(mood, mood.components?.kpi?.tokens?.labelStyle, 'statLabel');
      const head = len.heading ? len.heading : len.body;
      const body = len.heading && len.body ? len.body : 0;
      const bodyRole = roles.body ?? pickRole(mood, 'bodySmall', 'body');
      return rowsOf(
        lb(roles.value ?? 'stat', 1) +
          sm +
          // the KPI item layouts reserve two label lines
          lb(label, Math.max(LINES.label, linesOf(mood, label, head, cw - pad))) +
          (body ? sm + lb(bodyRole, linesOf(mood, bodyRole, body, cw - pad)) : 0),
      );
    }
    case 'items':
    case 'subpoints':
    case 'process':
    case 'timeline':
    case 'compare': {
      const title = roles.title ?? 'h3';
      const text = roles.text ?? 'body';
      // the catalogue's numeral / year room (C3.2, D7): the zone above the fields, or beside them (narrower text)
      const nz = resolveNumeral(mood, c.numeral);
      const tw = nz?.place === 'beside' ? (cw - pad) * (1 - Math.min(0.5, nz.share)) : cw - pad;
      const extra = nz
        ? 0
        : c.block === 'timeline'
          ? lb('eyebrow', 1) + 3 * sm
          : c.block === 'process' || c.numbered
            ? lb('h3', 1) + 3 * sm
            : 0;
      const core =
        // steps and milestones reserve two title lines; cards and columns give unused title lines back
        lb(
          title,
          Math.max(
            c.block === 'process' || c.block === 'timeline' ? LINES.heading : 1,
            linesOf(mood, title, len.heading, tw),
          ),
        ) +
        sm +
        lb(
          text,
          Math.max(
            linesOf(mood, text, len.description, tw),
            Number(block?.rows) || 0,
            Number(block?.lineCount) || 0,
          ),
        );
      const min = nz ? lb(nz.role, 1) + (c.block === 'timeline' ? 3 * sm : sm) : 0;
      return rowsOf(nz ? numeralNeed(mood, nz, core, min) : extra + core);
    }
    case 'points': {
      const r = roles.text ?? pickRole(mood, 'bullet', 'body');
      const per = Math.ceil(n / cols);
      return per * lb(r, Math.max(1, linesOf(mood, r, len.bullet, cw))) + (per - 1) * gap + pad;
    }
    case 'paragraph': {
      const want = (c.fields ?? []).find((x) => x.f === 'paragraph')?.role;
      const r = pickRole(mood, want, 'body');
      return lb(r, Math.max(1, linesOf(mood, r, len.paragraph, w - pad))) + pad;
    }
    case 'table':
      return (n + 1) * (lb(pickRole(mood, 'tableCell', 'body'), 1) + 2 * space(mood, 'md'));
    case 'chart':
      return lb('body', 6);
    default:
      return 0;
  }
}

/**
 * How much of the body area the content group takes (C3.1, replaces C3's full stretch): the catalogue's own share of
 * its body (`group.h`), grown only as far as the brand's content needs (every zone at least its `zoneNeed` and the
 * record's rows of item stacks, 10 % to spare; a chart, a table or a block with images: the whole area), at most the
 * whole area; the group keeps the catalogue's vertical position in the room left.
 */
export function groupScale(b, area, rec, summary, g) {
  const group = rec.group ?? { y: 0, h: 1 };
  const gh = group.h > 0 ? group.h : 1;
  const gap = space(b.mood, 'md');
  let s = gh;
  rec.containers
    .filter((c) => c.block)
    .forEach((c, k) => {
      const w = zoneFrame(area, c, g, group).w;
      // a block with images (KPI cells, compare banners) or compare rows with labels / checks: the full area
      const sb = v2Blocks(summary)[k];
      const rich = (sb?.fields ?? []).some((f) => f === 'image' || f === 'label' || f === 'check');
      // the text's need, and at least the record's rows of the item layouts' own stacks (so the arrangement holds)
      const rows =
        c.flow.direction === 'column'
          ? Math.max(1, c.nodes ?? 1)
          : c.flow.direction === 'grid'
            ? Math.ceil(Math.max(1, c.nodes ?? 1) / Math.max(1, c.flow.columns))
            : 1;
      const item = itemNeed(b.mood, c.block, {
        body: c.block === 'kpis' && kpiBody(c, summary),
        card: c.card,
        roles: recordRoles(b.mood, c),
        numeral: resolveNumeral(b.mood, c.numeral),
        numbered: c.numbered,
        textLines: sb?.lineCount,
      });
      const stack = item ? rows * item + (rows - 1) * gap : 0;
      // a chart or a table takes the whole area the group can have (a graphic reads better large; the catalogue
      // sizes it for its own label sizes)
      const need =
        rich || GRAPHIC.has(c.block)
          ? Infinity
          : 1.1 * Math.max(stack, zoneNeed(b.mood, c, w, lengthsOf(rec, k, summary), gap, sb));
      const zh = c.zone.h > 0 ? c.zone.h : gh;
      if (need > 0) s = Math.max(s, (need * gh) / (zh * area.h));
    });
  s = Math.min(1, s);
  const room = 1 - gh;
  const offset = room > 0 ? (1 - s) * Math.min(1, Math.max(0, group.y / room)) : 0;
  return { s, offset };
}

const fieldsOf = (c) => new Set((c.fields ?? []).map((f) => f.f));

/** The flow's own cells ({col, span} on the area's grid, y / h fractions of the zone) in canvas px, or undefined. */
function cellsIn(b, f, c) {
  if (!c.flow.cells) return undefined;
  const area = b.area();
  const g = gutter(b.mood);
  return c.flow.cells.map((x) => {
    const col = zoneFrame(area, { grid: x, zone: { y: 0, h: 1 } }, g);
    return frame(col.x, f.y + x.y * f.h, col.w, x.h * f.h);
  });
}

/**
 * Recorded placement -> the vertical alignment we draw: the recorded placement rule (R-PLACE, was PR-C′, approved
 * 2026-11-03; docs/P2-spec.md §9) takes the catalogue's own vertical composition - a `fill` group is centred in its
 * zone (the catalogue centres such groups), a `bottom` one sits at the bottom. Signal: the catalogue record of the
 * slide (D1). (C3.1 mapped fill -> top and bottom -> middle.)
 */
const VALIGN = Object.freeze({ fill: 'middle', top: 'top', middle: 'middle', bottom: 'bottom' });

/** How a flow's items sit in their cells (`itemAlign`) / a text box's text in its zone (`place`), as recorded. */
export function contentAlign(c, { item = false } = {}) {
  return VALIGN[(item ? c.itemAlign : undefined) ?? c.place?.align] ?? 'top';
}

/**
 * The size-band roles the catalogue gives a container's fields, as the item slots they reach (C3.1): items / steps /
 * timeline / compare heading -> title, description -> text; KPI value -> value (a `display` figure: the larger of the
 * Mood's display / stat), heading -> label, body -> body (value + body KPIs: the body is our label); bullet -> text.
 * Only roles the Mood defines are kept.
 */
export function recordRoles(mood, c) {
  const by = Object.fromEntries((c.fields ?? []).map((f) => [f.f, f.role]));
  const value = by.value === 'display' ? heroValueRole(mood) : by.value;
  let out = {};
  switch (c.block) {
    case 'items':
    case 'subpoints':
    case 'process':
    case 'timeline':
    case 'compare':
      out = { title: by.heading, text: by.description };
      break;
    case 'kpis':
      out = by.heading ? { value, label: by.heading, body: by.body } : { value, label: by.body };
      break;
    case 'points':
      out = { text: by.bullet };
      break;
    default:
  }
  return Object.fromEntries(
    Object.entries(out).filter(([, r]) => typeof r === 'string' && mood?.type?.roles?.[r]),
  );
}

/**
 * A record's numeral zone (C3.2, D7: {role, place, share}) in the Mood's terms: a `display` numeral takes the larger of
 * the Mood's display / stat (as a display figure does), h1 / h2 / h3 the role of that name; null without a numeral or
 * when the Mood lacks the role.
 */
export function resolveNumeral(mood, numeral) {
  if (!numeral?.role) return null;
  const r = numeral.role === 'display' ? heroValueRole(mood) : numeral.role;
  if (!moodRole(mood, r)) return null;
  return {
    role: r,
    place: numeral.place === 'beside' ? 'beside' : 'above',
    share: Number(numeral.share) || 0,
  };
}

/**
 * The height an item with a numeral zone needs (C3.2, D7): its fields (`core`) under a zone of `share` of the item
 * (at least `min`: the numeral's line and the gap under it, a timeline's dot too) - max(min + core, core / (1 − share));
 * beside the fields the zone takes width, not height (the caller narrows the text): the larger of core and the line.
 */
export function numeralNeed(mood, nz, core, min) {
  const line = lineBox(mood, nz.role, 1);
  if (nz.place === 'beside') return Math.max(core, line);
  const share = Math.min(0.6, Math.max(0, nz.share));
  return Math.max(min + core, core / (1 - share));
}

/**
 * The height one item of a block needs in the brand's roles (the item layout's own stack): KPI = stat line + label
 * (two lines) [+ body, two lines]; process step = h3 (two lines) + body (two lines), the marker beside it in a row;
 * item = card padding + title role (two lines) + body role (two lines). 0 = not checked.
 */
export function itemNeed(
  mood,
  block,
  { body = false, card = false, roles = {}, numeral = null, numbered = false, textLines = 2 } = {},
) {
  const tl = Math.max(2, Number(textLines) || 0);
  const sm = space(mood, 'sm');
  const pad = card ? 2 * cardPadding(mood) : 0;
  if (block === 'kpis') {
    const label = roles.label ?? pickRole(mood, mood.components?.kpi?.tokens?.labelStyle, 'statLabel');
    return (
      pad +
      lineBox(mood, roles.value ?? 'stat', LINES.one) +
      sm +
      lineBox(mood, label, LINES.label) +
      (body ? sm + lineBox(mood, roles.body ?? pickRole(mood, 'bodySmall', 'body'), 2) : 0)
    );
  }
  // a numeral zone (C3.2, D7) above the fields: the item grows by the zone's share
  const zoned = (core) =>
    numeral ? numeralNeed(mood, numeral, core, lineBox(mood, numeral.role, 1) + sm) : core;
  if (block === 'process')
    return (
      pad +
      zoned(lineBox(mood, roles.title ?? 'h3', LINES.heading) + sm + lineBox(mood, roles.text ?? 'body', tl))
    );
  if (block === 'items' || block === 'subpoints') {
    const t = mood.components?.card?.tokens ?? {};
    const title = roles.title ?? (card ? pickRole(mood, t.titleRole, 'h3') : pickRole(mood, 'h2', 'h3'));
    const text = roles.text ?? pickRole(mood, t.bodyRole, 'body');
    // a numbered item card on a Mood whose steps marker is a number draws the marker over its title (C3.2)
    const marker =
      card && numbered && !numeral && String(mood.components?.steps?.tokens?.marker ?? '').includes('number')
        ? markerSize(mood) + sm
        : 0;
    return pad + zoned(marker + lineBox(mood, title, LINES.heading) + sm + lineBox(mood, text, tl));
  }
  return 0;
}

/**
 * The record's flow fitted to the zone (a rule of the brand's roles, not the catalogue's): a column or grid flow
 * whose rows are shorter than one item needs (`itemNeed`) keeps only the rows that fit and puts the items side by
 * side in ceil(n / rows) columns. A flow with its own cells, or a row, is kept.
 */
export function fittedFlow(f, c, need, gap) {
  const flow = c.flow;
  const n = Math.max(1, c.nodes ?? 1);
  if (!(need > 0) || flow.cells || flow.direction === 'row') return flow;
  const rows = flow.direction === 'column' ? n : Math.max(1, flow.rows ?? Math.ceil(n / flow.columns));
  const rowH = (f.h - gap * (rows - 1)) / rows;
  if (rowH >= need) return flow;
  const fit = Math.max(1, Math.floor((f.h + gap) / (need + gap)));
  const columns = Math.ceil(n / fit);
  return fit === 1 ? { direction: 'row', columns, rows: 1 } : { direction: 'grid', columns, rows: fit };
}

/**
 * Whether KPIs take the body slot: the catalogue's KPIs carry a heading and a body (value + body KPIs: our label is
 * that line), or the slide's KPIs do.
 */
function kpiBody(c, summary) {
  const own = fieldsOf(c);
  const slide = new Set(v2Block(summary, 'kpis')?.fields ?? []);
  return (own.has('heading') && own.has('body')) || (slide.has('heading') && slide.has('body'));
}

/** The height a container's flow needs (rows of `itemNeed` + the flow gap), 0 when not known. */
function flowNeed(b, c, f, summary) {
  const card = Boolean(c.card);
  const need = itemNeed(b.mood, c.block, {
    body: c.block === 'kpis' && kpiBody(c, summary),
    card,
    roles: recordRoles(b.mood, c),
    numeral: resolveNumeral(b.mood, c.numeral),
    numbered: c.numbered,
    textLines: v2Block(summary, c.block)?.lineCount,
  });
  if (!need) return 0;
  const gap = space(b.mood, 'md');
  const flow = fittedFlow(f, c, need, gap);
  const n = Math.max(1, c.nodes ?? 1);
  const rows =
    flow.direction === 'row' ? 1 : flow.direction === 'column' ? n : Math.ceil(n / Math.max(1, flow.columns));
  return rows * need + (rows - 1) * gap;
}

const GRAPHIC = new Set(['chart', 'table']);

/**
 * A chart / table zone stacked over or under a flow on the same columns takes the room the flow does not need: the
 * flow keeps its rows' need (`flowNeed`), the graphic grows by the rest (the catalogue sizes the flow for its own
 * type; the brand's KPI or card may need less). Mutates `placed`.
 */
export function giveToGraphic(b, placed, summary, rec) {
  const blocks = rec ? rec.containers.filter((c) => c.block) : [];
  // C3.2: a paragraph stacked on a graphic whose zone is lower than its text needs (the Mood's card padding) takes
  // the shortfall from the graphic, which keeps at least half its height
  for (const p of placed) {
    if (p.c.block !== 'paragraph' || !rec) continue;
    const k = blocks.indexOf(p.c);
    const need = 1.1 * zoneNeed(b.mood, p.c, p.f.w, lengthsOf(rec, k, summary), space(b.mood, 'md'));
    if (!(need > p.f.h + 1)) continue;
    // the graphics on its columns, all above it or all below it (two charts side by side over one paragraph)
    const under = (q) =>
      q.c.grid.col >= p.c.grid.col && q.c.grid.col + q.c.grid.span <= p.c.grid.col + p.c.grid.span;
    const above = placed.filter((q) => GRAPHIC.has(q.c.block) && under(q) && bottom(q.f) <= p.f.y + 1);
    const below = placed.filter((q) => GRAPHIC.has(q.c.block) && under(q) && q.f.y >= bottom(p.f) - 1);
    const gs = above.length ? above : below;
    if (!gs.length) continue;
    const delta = Math.min(need - p.f.h, ...gs.map((g) => g.f.h / 2));
    for (const g of gs)
      g.f = above.length
        ? frame(g.f.x, g.f.y, g.f.w, g.f.h - delta)
        : frame(g.f.x, g.f.y + delta, g.f.w, g.f.h - delta);
    p.f = above.length
      ? frame(p.f.x, p.f.y - delta, p.f.w, p.f.h + delta)
      : frame(p.f.x, p.f.y, p.f.w, p.f.h + delta);
  }
  for (const p of placed) {
    if (GRAPHIC.has(p.c.block) || p.c.flow.cells) continue;
    const k = blocks.indexOf(p.c);
    // the flow's rows of items, or (known text lengths) what its text needs, whichever is more
    const need = Math.max(
      flowNeed(b, p.c, p.f, summary),
      k >= 0 && flowNeed(b, p.c, p.f, summary) > 0
        ? zoneNeed(b.mood, p.c, p.f.w, lengthsOf(rec, k, summary), space(b.mood, 'md'), v2Blocks(summary)[k])
        : 0,
    );
    if (!need || p.f.h <= need + 1) continue;
    const same = (q) => q.c.grid.col === p.c.grid.col && q.c.grid.span === p.c.grid.span;
    const g = placed.find(
      (q) => GRAPHIC.has(q.c.block) && same(q) && (bottom(q.f) <= p.f.y + 1 || q.f.y >= bottom(p.f) - 1),
    );
    if (!g) continue;
    const delta = p.f.h - need;
    if (g.f.y < p.f.y) {
      g.f = frame(g.f.x, g.f.y, g.f.w, g.f.h + delta);
      p.f = frame(p.f.x, p.f.y + delta, p.f.w, need);
    } else {
      g.f = frame(g.f.x, g.f.y - delta, g.f.w, g.f.h + delta);
      p.f = frame(p.f.x, p.f.y, p.f.w, need);
    }
  }
}

/**
 * The catalogue's look on a flow box (C3.1): the size-band roles of its item slots, where the items sit in their
 * cells, the Mood's card behind each cell (when the catalogue draws them on cards), numbered items.
 */
function dressFlow(b, id, c, { card = c.card, place = true } = {}) {
  const box = b.boxById(id);
  if (!box?.flow) return;
  const roles = recordRoles(b.mood, c);
  if (Object.keys(roles).length) box.flow.itemRoles = roles;
  const valign = contentAlign(c, { item: true });
  if (place && valign !== 'top') box.flow.valign = valign;
  if (card) box.flow.card = true;
  // numbered as the catalogue numbers them: an item card of an unnumbered container draws no number (C3.2: D6 puts
  // many containers on item cards)
  box.flow.numbered = Boolean(c.numbered);
  // the catalogue's numeral / year room (C3.2, D7): the item layouts give the number / when its size band and share
  const nz = resolveNumeral(b.mood, c.numeral);
  if (nz) box.flow.numeral = nz;
}

/** A flow box with the record's direction, columns, capacity and cells; its slot required. */
function recordFlow(
  b,
  f,
  c,
  { id, role = 'group', slotType, itemLayout, kind, need = 0, card, place = true },
) {
  const flow = fittedFlow(f, c, need, space(b.mood, 'md'));
  flowBox(b, {
    id,
    f,
    role,
    slotType,
    kind,
    n: Math.max(1, flow.columns),
    itemLayout,
    direction: flow.direction,
    maxItems: Math.max(1, c.nodes ?? 1),
  });
  requireSlot(b, id, c);
  const cells = cellsIn(b, f, c);
  if (cells) b.boxById(id).flow.cells = cells.map((x) => roundFrame(x));
  dressFlow(b, id, c, { card, place });
}

const roundFrame = (f) => ({
  x: Math.round(f.x * 100) / 100,
  y: Math.round(f.y * 100) / 100,
  w: Math.round(f.w * 100) / 100,
  h: Math.round(f.h * 100) / 100,
});

/**
 * Marks the slot `id` required (a container the slide does not fill is a binding warning) and its box with the
 * catalogue container it draws (`container`: the data-c number; checks and the fill test read it).
 */
function requireSlot(b, id, c) {
  const s = b.slotById(id);
  if (s) s.required = true;
  const box = s && b.boxById(s.box);
  if (box && c) {
    box.container = c.c;
    const f = fillOf(c);
    if (f !== undefined) box.fill = f;
  }
}

/**
 * The share of its zone the catalogue's content fills (1 − `place.empty`): the engine steps the box's text up the
 * brand's role ladder toward it (C3.1 `fill`). Charts and tables are drawn to their box: none.
 */
export function fillOf(c) {
  if (c.block === 'chart' || c.block === 'table' || typeof c.place?.empty !== 'number') return undefined;
  return Math.round((1 - (c.place.text ?? c.place.empty)) * 10000) / 10000;
}

/** A unique box / slot id per block type: kpis, kpis-2 … */
function idFor(used, base) {
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

/**
 * A flow tied to a line (steps with the brand's connector, a timeline on its rule): the recorded placement rule
 * (R-PLACE) gives the flow its whole zone and marks it `flow.place` {valign, lines} at the zone's recorded alignment -
 * the fill (R-FILLROOM) runs in the zone, then the engine places the flow (a box of 1.35 × the chosen roles' fitted
 * height, compose/place.js) and moves its line boxes (`lines`) with it, so the line stays on the items.
 */
function placeTied(b, id, c, lines) {
  const box = b.boxById(id);
  if (!box?.flow) return;
  const valign = contentAlign(c, { item: true });
  if (valign !== 'top') box.flow.place = { valign, lines: lines.filter((x) => b.boxById(x)) };
}

/** One container drawn in `f` (paragraphs are drawn by the caller, after every other slot). */
function drawContainer(b, f, c, summary, used, len = {}) {
  const { mood } = b;
  switch (c.block) {
    case 'kpis': {
      const id = idFor(used, 'kpis');
      const body = kpiBody(c, summary);
      recordFlow(b, f, c, {
        id,
        role: 'kpis',
        slotType: 'kpis',
        kind: 'kpi',
        itemLayout: body ? 'kpi-value-label-body' : 'kpi-value-label',
        need: itemNeed(mood, 'kpis', { body, card: c.card, roles: recordRoles(mood, c) }),
      });
      fitValueRole(b, id, c, len, body);
      return;
    }
    case 'items':
    case 'subpoints': {
      const id = idFor(used, 'cards');
      const block = v2Block(summary, c.block);
      const rest = groupHeading(b, f, id, block);
      recordFlow(b, rest, c, {
        id,
        slotType: 'cards',
        kind: 'cards',
        itemLayout: c.card ? 'item-card' : 'compare-column',
        need: itemNeed(mood, c.block, {
          card: c.card,
          roles: recordRoles(mood, c),
          numeral: resolveNumeral(mood, c.numeral),
          numbered: c.numbered,
          textLines: block?.lineCount,
        }),
        // item-card draws the Mood's card itself
        card: false,
      });
      return;
    }
    case 'points': {
      const id = idFor(used, 'list');
      const r = recordRoles(mood, c).text ?? pickRole(mood, 'bullet', 'body');
      const cols = c.flow.direction === 'column' ? 1 : Math.max(1, c.flow.columns);
      const icons = anyIcon(mood, v2Block(summary, 'points')?.icons);
      if (cols === 1 && !icons) {
        b.box(id, f, {
          role: 'list',
          slot: id,
          ...b.bodyAlign({ v: contentAlign(c) }),
          ...(c.card ? { card: true } : {}),
        });
        b.slot(id, 'list', id, { role: r, capacity: { minItems: 1, maxItems: Math.max(1, c.nodes ?? 1) } });
      } else {
        b.box(id, f, {
          role: 'list',
          slot: id,
          flow: {
            direction: c.flow.direction === 'column' ? 'column' : c.flow.direction,
            gap: 'md',
            columns: cols,
            itemLayout: 'point-marker-text',
          },
          ...b.bodyAlign({ v: 'top' }),
        });
        b.slot(id, 'list', id, { role: r, capacity: { minItems: 1, maxItems: Math.max(1, c.nodes ?? 1) } });
        const cells = cellsIn(b, f, c);
        if (cells) b.boxById(id).flow.cells = cells.map(roundFrame);
        dressFlow(b, id, c);
      }
      requireSlot(b, id, c);
      return;
    }
    case 'chart': {
      const id = idFor(used, 'chart');
      b.box(id, f, { role: 'chart', slot: id, container: c.c });
      b.slot(id, 'chart', id, { required: true });
      return;
    }
    case 'table': {
      tableInto(b, f);
      requireSlot(b, 'table', c);
      return;
    }
    case 'process': {
      const need = itemNeed(mood, 'process', {
        card: c.card,
        roles: recordRoles(mood, c),
        numeral: resolveNumeral(mood, c.numeral),
        numbered: c.numbered,
      });
      const flow = fittedFlow(f, c, need, space(mood, 'md'));
      const n = Math.max(1, flow.direction === 'column' ? (c.nodes ?? 1) : flow.columns);
      const direction = flow.direction === 'column' ? 'column' : 'row';
      stepsFlow(b, f, n, { direction, maxItems: Math.max(1, c.nodes ?? 1) });
      const box = b.boxById('steps');
      if (flow.direction === 'grid') box.flow.columns = Math.max(1, flow.columns);
      const cells = cellsIn(b, f, c);
      if (cells) box.flow.cells = cells.map(roundFrame);
      dressFlow(b, 'steps', c, { place: false });
      // under a numeral zone (C3.2, D7) the brand's connector runs under the numerals, across the row - where the
      // catalogue draws its axis - not through the numbers / labels
      const nz = box.flow.numeral;
      const line = b.boxById('connector');
      if (line && nz?.place === 'above' && direction === 'row') {
        const zone = numeralZone(mood, f.w / n, f.h, nz);
        const wgt = line.frame.h;
        if (zone) line.frame = frame(f.x, f.y + zone.size - space(mood, 'sm') / 2 - wgt / 2, f.w, wgt);
      }
      requireSlot(b, 'steps', c);
      placeTied(b, 'steps', c, ['connector']);
      return;
    }
    case 'timeline': {
      const block = v2Block(summary, 'timeline');
      const row = c.flow.direction !== 'column';
      if (row && mood.components?.timeline) {
        const room = anyIcon(mood, block?.icons) ? iconSize(mood, 'h3').room : 0;
        const wgt = lineWeight(mood);
        // under the numeral zone of the items (C3.2, D7), which the row's height sets
        const y = timelineLineY(mood, room, { h: f.h, numeral: resolveNumeral(mood, c.numeral) });
        b.box('line', frame(f.x, f.y + y - wgt / 2, f.w, wgt), {
          role: 'divider',
          shape: { kind: 'line', stroke: 'border' },
        });
      }
      recordFlow(b, f, c, {
        id: 'timeline',
        slotType: 'timeline',
        kind: 'timeline',
        itemLayout: 'timeline-when-title-text',
        place: false,
      });
      placeTied(b, 'timeline', c, ['line']);
      return;
    }
    case 'compare': {
      const block = v2Block(summary, 'compare');
      const tiers = Boolean(
        block && (block.tiers || (block.fields ?? []).some((x) => x === 'price' || x === 'features')),
      );
      recordFlow(b, f, c, {
        id: 'compare',
        slotType: 'cards',
        kind: 'cards',
        itemLayout: tiers ? 'tier-card' : 'compare-column',
      });
      return;
    }
    default:
  }
}

/** Text roles from large to small, for a role that must step down to fit its box (C3.2). */
const DOWN_LADDER = Object.freeze(['h1', 'h2', 'h3', 'bodyLarge', 'body', 'bodySmall']);

/**
 * The role a text of `chars` characters takes in a w × h box (C3.2: the Mood's card padding can leave a catalogue
 * band's zone too small for its size band): `want`, else the largest smaller role of the ladder whose estimated lines
 * fit the height; unknown lengths or metrics -> `want`.
 */
export function fittingRole(mood, want, chars, w, h) {
  if (!(chars > 0) || !(h > 0)) return want;
  const fits = (r) => {
    const n = estimateLines(mood, r, chars, w);
    return n === null || lineBox(mood, r, n) <= h;
  };
  if (fits(want)) return want;
  const size = (r) => mood?.type?.roles?.[r]?.size ?? 0;
  const down = DOWN_LADDER.filter((r) => moodRole(mood, r) && size(r) < size(want)).sort(
    (a, b2) => size(b2) - size(a),
  );
  return down.find(fits) ?? down[down.length - 1] ?? want;
}

/**
 * A KPI value's role fits its cell (C3.2: on the Mood's card the cell loses its padding): the size band's role
 * while the value takes one line of the cell's width and the item's stack fits the cell's height, else the next
 * smaller figure role (display / stat / h1 / h2 / h3). Mutates the flow's `itemRoles.value`.
 */
function fitValueRole(b, id, c, len, body) {
  const box = b.boxById(id);
  const flow = box?.flow;
  if (!flow?.itemRoles?.value) return;
  const { mood } = b;
  const gap = space(mood, 'md');
  const pad = c.card ? 2 * cardPadding(mood) : 0;
  const n = Math.max(1, c.nodes ?? 1);
  let w;
  let h;
  if (Array.isArray(flow.cells) && flow.cells.length) {
    w = Math.min(...flow.cells.map((x) => x.w));
    h = Math.min(...flow.cells.map((x) => x.h));
  } else {
    const cols = flow.direction === 'column' ? 1 : Math.max(1, Math.min(n, flow.columns ?? n));
    const rows = Math.ceil(n / cols);
    w = (box.frame.w - gap * (cols - 1)) / cols;
    h = (box.frame.h - gap * (rows - 1)) / rows;
  }
  const size = (r) => mood?.type?.roles?.[r]?.size ?? 0;
  const roles = flow.itemRoles;
  const fits = (r) => {
    const lines = estimateLines(mood, r, len.value, w - pad);
    if (lines !== null && lines > 1) return false;
    return itemNeed(mood, 'kpis', { body, card: c.card, roles: { ...roles, value: r } }) <= h;
  };
  if (fits(roles.value)) return;
  const down = ['display', 'stat', 'h1', 'h2', 'h3']
    .filter((r) => moodRole(mood, r) && size(r) < size(roles.value))
    .sort((a, b2) => size(b2) - size(a));
  const r = down.find(fits);
  if (r) flow.itemRoles = { ...roles, value: r };
}

/**
 * A paragraph container: a body box in the role its size band asks for (the Mood's role of that name, else body),
 * placed in its zone as the catalogue places it, on the Mood's card when the catalogue draws it on one.
 */
function drawParagraph(b, f, c, used, len = {}) {
  const id = idFor(used, 'body');
  const want = (c.fields ?? []).find((x) => x.f === 'paragraph')?.role;
  const pad = c.card ? 2 * cardPadding(b.mood) : 0;
  const r = fittingRole(b.mood, pickRole(b.mood, want, 'body'), len.paragraph, f.w - pad, f.h - pad);
  b.box(id, f, {
    role: 'body',
    slot: id,
    container: c.c,
    ...(fillOf(c) !== undefined ? { fill: fillOf(c) } : {}),
    ...b.bodyAlign({ v: contentAlign(c) }),
    ...(c.card ? { card: true } : {}),
  });
  b.slot(id, 'richtext', id, { role: r, required: true });
}

/**
 * Blocks the catalogue plans do not draw as written: a process of another shape than linear (the roadmaps are linear
 * phases; the shape layouts draw cycle, funnel …) and nested KPIs (the rings of kpi-nested). Such a slide keeps the 68.
 */
export function drawnElsewhere(blocks) {
  return blocks.some(
    (b) => (b.type === 'process' && b.shape && b.shape !== 'linear') || (b.type === 'kpis' && b.nested),
  );
}

const memo = new WeakMap();
/** The slide's {key, shape} (memoised per summary: pick() asks every catalogue def). */
function slideKey(summary) {
  if (memo.has(summary)) return memo.get(summary);
  let out = null;
  try {
    const blocks = v2Blocks(summary);
    // a content/2 slide with no block is the catalogue's "Title only" combination
    out = { key: combinationKey(blocks), shape: combinationShape(blocks), blocks };
  } catch {
    out = null;
  }
  memo.set(summary, out);
  return out;
}

/** A record -> its LayoutDef (throws on a record the loader rejects: recordProblems). */
export function defFromRecord(rec) {
  const problems = recordProblems(rec);
  if (problems.length) throw new Error(problems.join('; '));
  const shape = combinationShape(rec.combination);
  // timeline with details (plan 22) and timeline (19, 32) share keys: a slide whose milestones carry `lines` takes the
  // one with details, a slide without them the other (+1 on an exact key)
  const timeline = rec.combination.some((b) => b.type === 'timeline');
  const details = rec.containers.some((c) => c.type === 'timeline_with_list');
  const flavour = (blocks) =>
    !timeline || blocks.some((b) => b.type === 'timeline' && (b.fields ?? []).includes('lines')) === details;
  // a roadmap whose phases the catalogue labels with a year / Now / a region (the generator's `labels: 'year'` on the
  // process container, D8) suits a process whose nodes carry a `label`; one without suits a process without (C4)
  const process = rec.combination.some((b) => b.type === 'process');
  const labels = rec.containers.some((c) => c.block === 'process' && c.labels === 'year');
  const labelFit = (blocks) =>
    process && blocks.some((b) => b.type === 'process' && (b.fields ?? []).includes('label')) === labels
      ? 0.5
      : 0;
  return {
    id: rec.id,
    kind: rec.kind,
    kinds: [...rec.kinds],
    version: 1,
    label: `Catalogue ${rec.catalogue}`,
    tags: ['catalogue', `plan-${rec.plan}`],
    catalogue: rec.catalogue,
    key: rec.key,
    record: rec,
    ...(labels ? { labels: 'year' } : {}),
    /** 100 for the same key, 60 minus the band distance for the same blocks and counts; 0 with the option off. */
    match(summary, ctx) {
      if (ctx?.options?.catalogue === false || !summary?.v2) return 0;
      const k = slideKey(summary);
      if (!k || drawnElsewhere(k.blocks)) return 0;
      if (k.key === rec.key) return 100 + (timeline && flavour(k.blocks) ? 1 : 0) + labelFit(k.blocks);
      if (k.shape === shape)
        return Math.max(1, 60 - bandDistance(rec.combination, k.blocks)) + labelFit(k.blocks);
      return 0;
    },
    build(ctx) {
      const b = createBuilder(this, ctx);
      const summary = ctx.summary ?? {};
      standardTitle(b, rec.kind);
      const area = b.area();
      const g = gutter(b.mood);
      const used = new Map();
      const scale = groupScale(b, area, rec, summary, g);
      const placed = rec.containers
        .filter((c) => c.block)
        .map((c) => ({ c, f: zoneFrame(area, c, g, rec.group, scale) }));
      giveToGraphic(b, placed, summary, rec);
      const blocks = rec.containers.filter((c) => c.block);
      for (const { c, f } of placed) {
        if (c.block === 'paragraph') continue;
        drawContainer(b, f, c, summary, used, lengthsOf(rec, blocks.indexOf(c), summary));
      }
      // body slots last: a paragraph's richtext slot takes every body block left, so the list slots bind first
      for (const { c, f } of placed)
        if (c.block === 'paragraph') drawParagraph(b, f, c, used, lengthsOf(rec, blocks.indexOf(c), summary));
      // the area under the lowest zone (when the composition leaves it) is a decor zone
      const low = Math.max(area.y, ...placed.map((p) => bottom(p.f)));
      const lg = space(b.mood, 'lg');
      if (placed.length && bottom(area) - low > 2 * lg)
        b.zone(frame(area.x, low + lg, area.w, bottom(area) - low - lg));
      // recorded placement rule (R-PLACE): the band the composition leaves between the title and the content group
      // is a decor zone too (after the one under the content)
      const band = placed.length ? decorBand(b, area, placed, lg) : null;
      if (band) b.zone(band);
      return b.finish();
    },
  };
}

/**
 * R-PLACE: the band between the title block's bottom (the title box, else the body area's top) and the top of the
 * content group (its highest zone), less spacing.lg on each side - when the group sits lower than the title by more
 * than 2 × spacing.lg; else null.
 */
export function decorBand(b, area, placed, lg = space(b.mood, 'lg')) {
  const title = b.boxById('title');
  const top = title ? Math.max(bottom(title.frame), area.y) : area.y;
  const group = Math.min(...placed.map((p) => p.f.y));
  if (!(group - top > 2 * lg)) return null;
  return frame(area.x, top + lg, area.w, group - top - 2 * lg);
}

let defs = null;
let byId = null;

/** Every catalogue LayoutDef (the records read and built once, on the first call). */
export function catalogueDefs() {
  if (!defs) {
    defs = Object.freeze(data.load().records.map((r) => Object.freeze(defFromRecord(r))));
    byId = new Map(defs.map((d) => [d.id, d]));
  }
  return defs;
}

/** A catalogue LayoutDef by id (cat-l1-1), or undefined. */
export function catalogueDef(id) {
  if (typeof id !== 'string' || !id.startsWith('cat-')) return undefined;
  catalogueDefs();
  return byId.get(id);
}

/** The generated file's measured grid, size-band roles and bands (for reports). */
export function catalogueMeta() {
  const { source, grid, bands, roles } = data.load();
  return { source, grid, bands, roles, records: data.load().records.length };
}
