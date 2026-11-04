// MD-TYPE: faces, roles by chains (+ colour meaning, fit), every brand style as a role under its own name (G4; px sizes
// only, G8), align, bullets, limits.
import { clone, collector, has, isObj, pick, ptr } from '../util.js';

export const RULE = 'MD-TYPE';

const FOOTER_STYLE = Symbol('layout.footer.style');

/** Mood role -> brand role chain (first hit wins). */
export const CHAINS = {
  display: ['display'],
  h1: ['h1'],
  h2: ['h2'],
  h3: ['h3', 'cardTitle'],
  body: ['body'],
  bodySmall: ['bodySmall'],
  caption: ['caption', 'footnote', 'meta'],
  eyebrow: ['eyebrow', 'label'],
  stat: ['stat', 'factValue'],
  statLabel: ['statLabel', 'caption'],
  quote: ['quote'],
  quoteAttribution: ['personRole', 'caption'],
  bullet: ['body'],
  tableHeader: ['tableHead', 'tableHeader', 'label', 'caption'],
  tableCell: ['tableCell', 'bodySmall'],
  chartLabel: ['chartLabel', 'caption'],
  footer: [FOOTER_STYLE, 'caption'],
  button: ['button'],
};

export const BLOCKING = ['display', 'h1', 'h2', 'h3', 'body', 'caption'];
export const HEADINGS = ['display', 'h1', 'h2', 'h3'];
/** Heading ladder for fit.min: each heading may step down to the next smaller one. */
const LADDER = ['display', 'h1', 'h2', 'h3', 'body'];

const COLOR = {
  heading: ['display', 'h1', 'h2', 'h3'],
  text: ['body', 'bodySmall', 'bullet', 'quote', 'stat', 'tableCell', 'button'],
  textMuted: ['caption', 'eyebrow', 'statLabel', 'quoteAttribution', 'chartLabel', 'footer', 'tableHeader'],
};
const COLOR_OF = Object.fromEntries(Object.entries(COLOR).flatMap(([c, roles]) => roles.map((r) => [r, c])));

export const FIT_STEP = 2;

/** G8: a brand style size below this is a multiplier (e.g. 1.35), not px: the style is never a role. */
export const MIN_PX_SIZE = 4;
const isMultiplierSize = (br) => isObj(br) && typeof br.size === 'number' && br.size < MIN_PX_SIZE;

export function rule(brandSpec) {
  const c = collector(RULE);
  const typo = brandSpec.typography ?? {};
  const brandRoles = typo.roles ?? {};
  const faces = {};

  // --- G8: role sizes must be px; a style whose size is a multiplier is not registered as a role (one warning each)
  const notPx = new Set();
  for (const [name, br] of Object.entries(brandRoles)) {
    if (!isMultiplierSize(br)) continue;
    notPx.add(name);
    c.warn(
      ptr('typography', 'roles', name, 'size'),
      `brand style "${name}" has size ${br.size} (below ${MIN_PX_SIZE}: a multiplier, not px): not registered as a type role (G8)`,
    );
  }

  for (const [k, f] of Object.entries(typo.faces ?? {})) {
    faces[k] = pick(f, ['family', 'files', 'fallback', 'variable', 'metrics']);
    c.prov(
      ptr('type', 'faces', k),
      [ptr('typography', 'faces', k)],
      'family, files, fallback, variable, metrics copied as given',
    );
  }

  // --- resolve chains
  const footerStyle = brandSpec.layout?.footer?.style;
  const roles = {};
  const source = {}; // mood role -> brand role name
  const asked = new Set(); // brand styles a chain already asked about (G4 does not warn about them again)
  for (const [moodRole, chain] of Object.entries(CHAINS)) {
    const names = chain.flatMap((n) => (n === FOOTER_STYLE ? (footerStyle ? [footerStyle] : []) : [n]));
    const hit = names.find((n) => has(brandRoles, n) && !notPx.has(n));
    const severity = BLOCKING.includes(moodRole) ? 'blocking' : 'optional';
    if (!hit) {
      c.ask(
        ptr('typography', 'roles', names[0] ?? moodRole),
        `No brand text style for the "${moodRole}" role (looked for: ${names.join(', ')}). Which style is it?`,
        {
          severity,
        },
      );
      continue;
    }
    const br = brandRoles[hit];
    const missing = ['weight', 'lineHeight'].filter((k) => !has(br, k));
    if (missing.length) {
      asked.add(hit);
      for (const k of missing) {
        c.ask(
          ptr('typography', 'roles', hit, k),
          `Brand style "${hit}" gives no ${k} (needed for the "${moodRole}" role).`,
          { severity },
        );
      }
      continue;
    }
    if (!has(typo.faces, br.face)) {
      c.warn(
        ptr('typography', 'roles', hit, 'face'),
        `style "${hit}" names face "${br.face}", which is not in typography.faces`,
      );
    }
    const out = pick(br, ['face', 'size', 'weight', 'lineHeight', 'letterSpacing', 'case']);
    roles[moodRole] = out;
    source[moodRole] = hit;
    const from = [ptr('typography', 'roles', hit)];
    if (moodRole === 'footer' && hit === footerStyle) from.push(ptr('layout', 'footer', 'style'));
    c.prov(ptr('type', 'roles', moodRole), from, `brand role "${hit}" (chain: ${names.join(' > ')})`);
    // D4: the brand style's own colour (a surface role name or a literal hex) wins; the meaning table only when absent.
    if (typeof br.color === 'string' && br.color !== '') {
      out.color = br.color;
      c.prov(
        ptr('type', 'roles', moodRole, 'color'),
        [ptr('typography', 'roles', hit, 'color')],
        `brand style "${hit}" gives its colour`,
      );
    } else {
      out.color = COLOR_OF[moodRole];
      c.prov(
        ptr('type', 'roles', moodRole, 'color'),
        [],
        `brand style "${hit}" gives no colour: meaning of the "${moodRole}" role, surface role ${out.color}`,
      );
    }
  }

  // --- G4: every brand style is also a role under its own name (canonical roles above are never replaced)
  for (const [name, br] of Object.entries(brandRoles)) {
    if (has(roles, name)) {
      if (source[name] !== name) {
        c.warn(
          ptr('typography', 'roles', name),
          `brand style "${name}" has the name of the canonical role "${name}", resolved from brand style "${source[name]}": the canonical role kept`,
        );
      }
      continue;
    }
    if (!isObj(br) || asked.has(name) || notPx.has(name)) continue;
    const missing = ['face', 'size', 'weight', 'lineHeight'].filter((k) => !has(br, k));
    if (missing.length) {
      c.warn(
        ptr('typography', 'roles', name),
        `brand style "${name}" gives no ${missing.join(', ')}: not a type role under its own name`,
      );
      continue;
    }
    if (!has(typo.faces, br.face)) {
      c.warn(
        ptr('typography', 'roles', name, 'face'),
        `style "${name}" names face "${br.face}", which is not in typography.faces`,
      );
    }
    const out = pick(br, ['face', 'size', 'weight', 'lineHeight', 'letterSpacing', 'case']);
    roles[name] = out;
    source[name] = name;
    c.prov(
      ptr('type', 'roles', name),
      [ptr('typography', 'roles', name)],
      `brand style "${name}" under its own name (G4)`,
    );
    if (typeof br.color === 'string' && br.color !== '') {
      out.color = br.color;
      c.prov(
        ptr('type', 'roles', name, 'color'),
        [ptr('typography', 'roles', name, 'color')],
        `brand style "${name}" gives its colour`,
      );
    } else {
      out.color = 'text';
      c.prov(
        ptr('type', 'roles', name, 'color'),
        [],
        `brand style "${name}" gives no colour: surface role text (G4: no meaning read from the style's name)`,
      );
    }
  }

  // --- fit
  const minBody = typo.limits?.minBodySize;
  if (typeof minBody !== 'number') {
    c.ask(
      ptr('typography', 'limits', 'minBodySize'),
      'What is the smallest body text size the brand allows (px on 1920x1080)?',
      {
        severity: 'optional',
      },
    );
  }
  const warnedBelow = new Set();
  for (const [moodRole, r] of Object.entries(roles)) {
    const fp = ptr('type', 'roles', moodRole, 'fit');
    const own = ptr('typography', 'roles', source[moodRole], 'size');
    if (HEADINGS.includes(moodRole)) {
      const next = LADDER.slice(LADDER.indexOf(moodRole) + 1).find((n) => roles[n]);
      if (!next) {
        r.fit = { min: r.size, step: FIT_STEP };
        c.prov(fp, [own], `no smaller heading resolved below "${moodRole}": min = own size`);
      } else if (roles[next].size > r.size) {
        r.fit = { min: r.size, step: FIT_STEP };
        c.warn(
          own,
          `"${moodRole}" (${r.size}) is smaller than the next heading "${next}" (${roles[next].size}): fit.min = own size`,
        );
        c.prov(
          fp,
          [own, ptr('typography', 'roles', source[next], 'size')],
          `next heading "${next}" is larger: min = own size`,
        );
      } else {
        r.fit = { min: roles[next].size, step: FIT_STEP };
        c.prov(
          fp,
          [ptr('typography', 'roles', source[next], 'size')],
          `next smaller heading "${next}" (brand "${source[next]}")`,
        );
      }
    } else if (typeof minBody === 'number') {
      if (r.size < minBody) {
        r.fit = { min: r.size, step: FIT_STEP };
        if (!warnedBelow.has(source[moodRole])) {
          warnedBelow.add(source[moodRole]);
          c.warn(
            own,
            `style "${source[moodRole]}" (${r.size}) is below typography.limits.minBodySize (${minBody}): fit.min = own size`,
          );
        }
        c.prov(
          fp,
          [own, ptr('typography', 'limits', 'minBodySize')],
          'size below minBodySize: min = own size',
        );
      } else {
        r.fit = { min: minBody, step: FIT_STEP };
        c.prov(
          fp,
          [ptr('typography', 'limits', 'minBodySize')],
          'body-like role: typography.limits.minBodySize',
        );
      }
    } else {
      r.fit = { min: r.size, step: FIT_STEP };
      c.prov(fp, [own], 'minBodySize not given: min = own size');
    }
  }

  const type = { faces, roles };
  // --- font pairs (P4.3): the alternative heading / body pairs the brand defines (BrandSpec typography.pairs), each
  // naming two of its faces; nothing when the brand defines none (no pair is ever made up)
  const pairs = fontPairs(typo.pairs, faces, c);
  if (pairs.length) type.pairs = pairs;
  if (isObj(typo.alignment)) {
    type.align = clone(typo.alignment);
    c.prov(ptr('type', 'align'), [ptr('typography', 'alignment')]);
  }
  if (isObj(typo.bullets)) {
    const b = clone(typo.bullets);
    const from = [ptr('typography', 'bullets')];
    if (!has(b, 'glyph') && has(b, 'char')) {
      b.glyph = b.char;
      delete b.char;
      from.push(ptr('typography', 'bullets', 'char'));
    }
    type.bullets = b;
    c.prov(ptr('type', 'bullets'), from, from.length > 1 ? 'bullets.char read as the glyph' : undefined);
  }
  if (isObj(typo.limits)) {
    type.limits = clone(typo.limits);
    c.prov(ptr('type', 'limits'), [ptr('typography', 'limits')]);
  }

  c.res.patch = { type };
  return c.res;
}

/**
 * MD-TYPE pairs: BrandSpec `typography.pairs` [{id, label?, heading, body}] -> Mood `type.pairs`: kept when the id is
 * unique and both faces are faces of the brand (else a warning and the pair is left out). Provenance per pair.
 */
export function fontPairs(given, faces, c) {
  const out = [];
  if (given === undefined) return out;
  if (!Array.isArray(given)) {
    c.warn(ptr('typography', 'pairs'), 'typography.pairs is not a list of pairs: ignored');
    return out;
  }
  given.forEach((p, i) => {
    const at = ptr('typography', 'pairs', i);
    if (!isObj(p) || typeof p.id !== 'string' || p.id === '') {
      c.warn(at, 'font pair without an id: ignored');
      return;
    }
    if (out.some((q) => q.id === p.id)) {
      c.warn(at, `font pair "${p.id}" is defined twice: the first kept`);
      return;
    }
    const unknown = ['heading', 'body'].filter((k) => typeof p[k] !== 'string' || !has(faces, p[k]));
    if (unknown.length) {
      c.warn(
        at,
        `font pair "${p.id}": ${unknown.map((k) => `${k} face "${p[k]}"`).join(' and ')} not in typography.faces: ignored`,
      );
      return;
    }
    const pair = { id: p.id, heading: p.heading, body: p.body };
    if (typeof p.label === 'string' && p.label) pair.label = p.label;
    c.prov(
      ptr('type', 'pairs', out.length),
      [at],
      `font pair "${p.id}" as given: heading face "${p.heading}", body face "${p.body}"`,
    );
    out.push(pair);
  });
  return out;
}
