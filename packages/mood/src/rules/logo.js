// MD-LOGO: variants, perSurface, perKind (G1: expanded via content), height, clearSpace, position.
import {
  brandVocabulary,
  CONTENT_ID,
  kindsViaContent,
  toKind,
  unknownKindMessage,
  viaContentNote,
} from '../kindMap.js';
import { collector, has, isObj, pick, ptr } from '../util.js';

export const RULE = 'MD-LOGO';

export function rule(brandSpec) {
  const c = collector(RULE);
  const logos = brandSpec.logos ?? {};
  const logo = { variants: {} };

  for (const [k, v] of Object.entries(logos.variants ?? {})) {
    logo.variants[k] = pick(v, ['file', 'width', 'height']);
    c.prov(ptr('logo', 'variants', k), [ptr('logos', 'variants', k)]);
  }
  if (!has(logos.variants, 'full'))
    c.ask(ptr('logos', 'variants', 'full'), 'Which file is the full-colour logo?');

  // perSurface: surfaces[i].logo, then logos.onSurface (the explicit logo rule) wins on conflict.
  const perSurface = {};
  const psFrom = {};
  (brandSpec.surfaces ?? []).forEach((s, i) => {
    if (typeof s.logo === 'string') {
      perSurface[s.id] = s.logo;
      psFrom[s.id] = ptr('surfaces', i, 'logo');
    }
  });
  for (const [sid, v] of Object.entries(logos.onSurface ?? {})) {
    if (has(perSurface, sid) && perSurface[sid] !== v) {
      c.warn(
        ptr('logos', 'onSurface', sid),
        `logos.onSurface.${sid} = "${v}" differs from the surface's own logo "${perSurface[sid]}": logos.onSurface kept`,
      );
    }
    perSurface[sid] = v;
    psFrom[sid] = ptr('logos', 'onSurface', sid);
  }
  for (const [sid, v] of Object.entries(perSurface)) {
    if (!has(logos.variants, v))
      c.warn(psFrom[sid], `logo variant "${v}" for surface "${sid}" is not in logos.variants`);
    c.prov(ptr('logo', 'perSurface', sid), [psFrom[sid]]);
  }
  if (Object.keys(perSurface).length) logo.perSurface = perSurface;

  const perKind = {};
  for (const [id, size] of Object.entries(logos.perLayout ?? {})) {
    const { kind, known } = toKind(id);
    if (!known) c.warn(ptr('logos', 'perLayout', id), unknownKindMessage(id));
    if (has(perKind, kind)) {
      c.warn(ptr('logos', 'perLayout', id), `"${id}" maps to kind "${kind}" already set: first kept`);
      continue;
    }
    perKind[kind] = size;
    c.prov(ptr('logo', 'perKind', kind), [ptr('logos', 'perLayout', id)], `layout "${id}" -> kind "${kind}"`);
  }
  // G1: every catalogue kind the brand names no layout for takes perLayout.content
  if (has(logos.perLayout, CONTENT_ID)) {
    for (const kind of kindsViaContent(brandVocabulary(brandSpec))) {
      if (has(perKind, kind)) continue;
      perKind[kind] = logos.perLayout[CONTENT_ID];
      c.prov(ptr('logo', 'perKind', kind), [ptr('logos', 'perLayout', CONTENT_ID)], viaContentNote(kind));
    }
  }
  if (Object.keys(perKind).length) logo.perKind = perKind;

  if (typeof logos.height === 'number') {
    logo.height = { small: logos.height };
    c.prov(ptr('logo', 'height', 'small'), [ptr('logos', 'height')]);
  }
  if (typeof logos.heightLarge === 'number') {
    // answers.json /brand/logoRules/heightLarge (D5)
    logo.height = { ...(logo.height ?? {}), large: logos.heightLarge };
    c.prov(ptr('logo', 'height', 'large'), [ptr('logos', 'heightLarge')]);
  } else {
    c.ask(
      ptr('logos', 'heightLarge'),
      'How tall is the logo where a layout shows it large (cover / closing), px? Until answered, layouts use the small height.',
      {
        severity: 'optional',
      },
    );
  }

  for (const k of ['clearSpace', 'position']) {
    if (has(logos, k)) {
      logo[k] = logos[k];
      c.prov(ptr('logo', k), [ptr('logos', k)]);
    }
  }
  if (!isObj(brandSpec.logos)) c.warn(ptr('logos'), 'BrandSpec has no logos block: logo.variants is empty');

  c.res.patch = { logo };
  return c.res;
}
