// MD-COMPONENTS: card + the named component blocks, kpi (charts.kpi), icon (components.icons). Only blocks the brand gives.
import { clone, collector, flattenTokens, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-COMPONENTS';

export const CARD_VARIANTS = ['filled', 'flat', 'outlined', 'elevated', 'glass'];
const CARD_TOKENS = [
  ['fill', 'fill'],
  ['radius', 'radius'],
  ['shadow', 'shadow'],
  ['padding', 'padding'],
  ['border', 'border'],
  ['titleStyle', 'titleRole'],
  ['bodyStyle', 'bodyRole'],
  ['fillOpacity', 'fillOpacity'],
  ['backdropBlur', 'backdropBlur'],
];
export const BLOCKS = [
  'chip',
  'callout',
  'quote',
  'button',
  'buttonSecondary',
  'steps',
  'timeline',
  'avatar',
  'logoWall',
  'arrow',
  'ctaChevron',
];
const VARIANT_KEYS = ['style', 'kind', 'variant'];
/**
 * List keys copied as the component's `items` array (never flattened into tokens): D12 logoWall.logos as given;
 * E5 icon.files (BR-ICONS' icon set) as {name, file, variants}.
 */
const ITEM_LISTS = {
  logoWall: { key: 'logos', note: 'logos copied as given (D12)' },
  icon: {
    key: 'files',
    note: "the brand's icon set (BR-ICONS, E5): {name, file, variants}",
    item: (it) => ({ name: it.name, file: it.file, variants: clone(it.variants ?? {}) }),
  },
};

/**
 * Generic block -> {variant, tokens, items?}: variant from style|kind|variant, else "default"; tokens = the rest,
 * flattened; a list the component shows (logoWall.logos) -> items, as given.
 */
function generic(c, block, from, moodName) {
  const key = VARIANT_KEYS.find((k) => typeof block[k] === 'string');
  const rest = { ...block };
  if (key) delete rest[key];
  const list = ITEM_LISTS[moodName];
  let items;
  if (list && Array.isArray(rest[list.key])) {
    items = clone(rest[list.key]).filter((it) => isObj(it));
    if (list.item) items = items.map(list.item);
    delete rest[list.key];
    c.prov(ptr('components', moodName, 'items'), [`${from}/${list.key}`], list.note);
  }
  const skipped = [];
  const tokens = flattenTokens(rest, '', {}, skipped);
  for (const s of skipped)
    c.warn(`${from}/${s.split('.').join('/')}`, `token "${s}" is not a string/number/boolean: dropped`);
  const out = { variant: key ? block[key] : 'default' };
  if (Object.keys(tokens).length) out.tokens = tokens;
  if (items) out.items = items;
  c.prov(
    ptr('components', moodName),
    [from],
    key
      ? `variant <- ${key}; tokens = the rest, flattened`
      : 'no style|kind|variant key: variant "default"; tokens = the block, flattened',
  );
  return out;
}

export function rule(brandSpec) {
  const c = collector(RULE);
  const comp = brandSpec.components ?? {};
  const components = {};

  const style = comp.cards?.style;
  if (isObj(style)) {
    if (typeof style.kind === 'string') {
      if (!CARD_VARIANTS.includes(style.kind)) {
        c.warn(
          ptr('components', 'cards', 'style', 'kind'),
          `card kind "${style.kind}" is not one of ${CARD_VARIANTS.join('|')}: kept verbatim`,
        );
      }
      const src = {};
      for (const [from, to] of CARD_TOKENS) if (has(style, from)) src[to] = style[from];
      const skipped = [];
      const tokens = flattenTokens(src, '', {}, skipped);
      for (const s of skipped)
        c.warn(
          ptr('components', 'cards', 'style', s),
          `token "${s}" is not a string/number/boolean: dropped`,
        );
      components.card = { variant: style.kind };
      if (Object.keys(tokens).length) components.card.tokens = tokens;
      c.prov(
        ptr('components', 'card'),
        [ptr('components', 'cards', 'style')],
        'variant <- style.kind; tokens <- fill, radius, shadow, padding, border, titleStyle (titleRole), bodyStyle (bodyRole), fillOpacity, backdropBlur',
      );
    } else {
      c.ask(
        ptr('components', 'cards', 'style', 'kind'),
        `Which card style is it (${CARD_VARIANTS.join('|')})?`,
        {
          severity: 'optional',
          options: CARD_VARIANTS,
        },
      );
    }
  }

  for (const name of BLOCKS) {
    if (isObj(comp[name])) components[name] = generic(c, comp[name], ptr('components', name), name);
  }
  if (isObj(brandSpec.charts?.kpi))
    components.kpi = generic(c, brandSpec.charts.kpi, ptr('charts', 'kpi'), 'kpi');
  if (isObj(comp.icons)) components.icon = generic(c, comp.icons, ptr('components', 'icons'), 'icon');

  c.res.patch = Object.keys(components).length ? { components } : {};
  return c.res;
}
