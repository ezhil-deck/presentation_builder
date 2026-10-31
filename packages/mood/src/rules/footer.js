// MD-FOOTER: show, items, format, text, position, role, hideOn (kind map), band.
import {
  brandVocabulary,
  CONTENT_ID,
  kindsViaContent,
  toKind,
  unknownKindMessage,
  viaContentNote,
} from '../kindMap.js';
import { clone, collector, has, isObj, ptr } from '../util.js';

export const RULE = 'MD-FOOTER';

export function rule(brandSpec) {
  const c = collector(RULE);
  const f = brandSpec.layout?.footer;
  if (!isObj(f)) {
    c.warn(ptr('layout', 'footer'), 'layout.footer not given: footer hidden');
    c.prov(ptr('footer', 'show'), [ptr('layout', 'footer')], 'no footer block: hidden (P1 MD-FOOTER)');
    c.res.patch = { footer: { show: false } };
    return c.res;
  }

  const footer = {};
  if (typeof f.show === 'boolean') {
    footer.show = f.show;
    c.prov(ptr('footer', 'show'), [ptr('layout', 'footer', 'show')]);
  } else {
    footer.show = false;
    c.warn(ptr('layout', 'footer', 'show'), 'layout.footer.show not given: footer hidden');
    c.prov(ptr('footer', 'show'), [ptr('layout', 'footer')], 'footer.show not given: hidden');
  }

  const items = [];
  const itemFrom = [];
  const on = {
    logo: f.logo === true,
    text: typeof f.text === 'string' && f.text !== '',
    pageNumber: f.pageNumber === true,
    date: f.date === true,
  };
  for (const item of ['logo', 'text', 'pageNumber', 'date']) {
    if (!on[item]) continue;
    items.push(item);
    itemFrom.push(ptr('layout', 'footer', item));
  }
  footer.items = items;
  c.prov(
    ptr('footer', 'items'),
    itemFrom.length ? itemFrom : [ptr('layout', 'footer')],
    'order logo, text, pageNumber, date by the footer booleans (text: non-empty)',
  );

  for (const [from, to] of [
    ['pageNumberFormat', 'pageNumberFormat'],
    ['text', 'text'],
    ['position', 'position'],
    ['style', 'role'],
  ]) {
    if (has(f, from)) {
      footer[to] = f[from];
      c.prov(ptr('footer', to), [ptr('layout', 'footer', from)]);
    }
  }

  if (Array.isArray(f.hideOn)) {
    const hideOn = [];
    f.hideOn.forEach((id, i) => {
      const { kind, known } = toKind(id);
      if (!known) c.warn(ptr('layout', 'footer', 'hideOn', i), unknownKindMessage(id));
      if (!hideOn.includes(kind)) hideOn.push(kind);
    });
    // G1: hiding on `content` hides every catalogue kind the brand names no layout for
    const via = f.hideOn.includes(CONTENT_ID)
      ? kindsViaContent(brandVocabulary(brandSpec)).filter((k) => !hideOn.includes(k))
      : [];
    hideOn.push(...via);
    footer.hideOn = hideOn;
    c.prov(
      ptr('footer', 'hideOn'),
      [ptr('layout', 'footer', 'hideOn')],
      ['layout ids -> kinds (kind map)', ...(via.length ? [viaContentNote(via)] : [])].join('; '),
    );
  }

  if (isObj(f.band)) {
    footer.band = clone(f.band);
    c.prov(ptr('footer', 'band'), [ptr('layout', 'footer', 'band')]);
  }
  if (typeof f.split === 'boolean') {
    footer.split = f.split;
    c.prov(
      ptr('footer', 'split'),
      [ptr('layout', 'footer', 'split')],
      'split (logo at one edge, text + number at the other) copied; not a band',
    );
  }

  c.res.patch = { footer };
  return c.res;
}
