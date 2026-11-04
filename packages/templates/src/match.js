/**
 * Matching a slide to the hand-authored templates of its kind (V3, proposal PR-6, docs/PLAN-template-library.md §4,
 * docs/P3-proposals.md). Pure: no files, no measurement, no AI. A template is a candidate only when the brand (its
 * capability record, `brandSpec.capabilities`, V2) and the slide can meet every need the template does not mark
 * optional (D15); every need met names the signal that met it (a capability key and the JSON pointer it rests on).
 *
 *   candidates(kind, { brandSpec, mood, slide, used }) -> [{ template, score, qualified, needs, content, values }]
 *
 * `kind`: our slide kind (cover | section | cta | quote; KIND_CATEGORY maps it to the E3 slide kind). `slide`:
 * `{ surface, image, quotes, keys, layoutId }` - the Mood surface the slide is on (surfaceFor), its content image
 * (`{ src, kind, pointer }` or null), how many quotes it carries, its content/2 keys ({number, cta, label, ...}) and a
 * pinned layout id. `used`: `{ templates: Map id -> times bound in the deck, samples: Map file -> times used }`.
 * Score = needs met - optional needs unmet; ties: the template used fewer times in the deck, then id order; a pinned
 * `tpl-<id>` wins among the qualified. `needs[]` = `{ key, optional, met, signal, why }`.
 */
import { toKind } from '@pb/mood';
import { authoredTemplates, parseNeedKey } from './index.js';

/** Our kinds the binding serves -> the E3 slide kind of their templates. */
export const KIND_CATEGORY = Object.freeze({
  cover: 'cover-slide',
  section: 'section-slide',
  cta: 'cta-slide',
  quote: 'quote-slide',
});

/** The image kinds a brand capability can carry (`image:any` = any of them; logo / icon / unknown samples never). */
export const IMAGE_KINDS = Object.freeze([
  'photo-people',
  'photo-product',
  'product-ui',
  'illustration',
  'abstract',
]);

/** Sample tags that put a sample first for a template photo (hero / bleed / wide). */
export const PHOTO_TAGS = Object.freeze(['hero', 'bleed', 'wide']);

/**
 * The brand's own words that make a sample usable as a statement slide's photo (cover / section / cta / quote): a
 * sample the brand tags `hero`, `cover` or `bleed`; a `product-ui` sample only when tagged `hero` (owner 2026-11-04).
 */
export const STATEMENT_TAGS = Object.freeze(['hero', 'cover', 'bleed']);
export const statementSample = (s) =>
  s?.kind === 'product-ui'
    ? Boolean(s.tags?.includes('hero'))
    : STATEMENT_TAGS.some((t) => s?.tags?.includes(t));

/**
 * Need weights in the score: a need met by the brand's signature (a device, its photo area, text zone or overlay)
 * counts 2; every other need (an image, a logo, a colour field, a component, a type rule) 1 (owner 2026-11-04).
 */
export const SIGNATURE_NEEDS = Object.freeze(['device', 'photo-area', 'text-zone', 'overlay']);
export const needWeight = (key) => (SIGNATURE_NEEDS.includes(String(key).split(':')[0]) ? 2 : 1);

/** The decor types a `device:<q>` need may name (the brand input's decor element types), or `any`. */
export const DEVICE_TYPES = Object.freeze([
  'shape',
  'frame',
  'rule',
  'pattern',
  'texture',
  'illustration',
  'badge',
  'sticker',
  'watermark',
  'word',
  'textGradient',
  'actionIcon',
]);

/** The slide kind a template was written for: its authored category (data-category), else the identified one. */
export const categoryOf = (t) => t.authoredCategory ?? t.category;

/** The authored binding templates of our kind (not compositions: a record without needs binds nothing). */
export function templatesFor(kind, { records } = {}) {
  const cat = KIND_CATEGORY[kind];
  if (!cat) return [];
  return (records ?? authoredTemplates()).filter(
    (t) => t.provenance?.source === 'authored' && !t.composition && t.needs?.length && categoryOf(t) === cat,
  );
}

const count = (m, k) => Number((m instanceof Map ? m.get(k) : m?.[k]) ?? 0) || 0;
const kindOfId = (id) => toKind(id).kind;
const usableOn = (ids, kind) => (ids ?? []).some((id) => kindOfId(id) === kind);

/** brandSpec.capabilities -> Map key -> {cap, index}. */
export function capabilityIndex(brandSpec) {
  const out = new Map();
  (brandSpec?.capabilities ?? []).forEach((cap, index) => {
    if (cap?.key && cap.status !== 'absent' && !out.has(cap.key)) out.set(cap.key, { cap, index });
  });
  return out;
}

const pointerOf = (c) => `/capabilities/${c.index}`;
const signalOf = (c, extra) =>
  [c.cap.key, extra ?? c.cap.from?.[0]].filter(Boolean).join(' ') + ` (${pointerOf(c)})`;

/** The capabilities whose key starts with `prefix`, in record order. */
const capsOf = (caps, prefix) => [...caps.values()].filter((c) => c.cap.key.startsWith(prefix));

/** The brand layouts (given.layouts[]) of this kind a layout capability carries, or []. */
const layoutsOfKind = (c, kind) => (c?.cap?.given?.layouts ?? []).filter((l) => kindOfId(l.id) === kind);

/**
 * The devices usable on `kind`, named first: a device capability whose `given.namedBy` (the brand layout naming it as
 * its device) or `given.allowedOn` names a brand layout id that kindMap maps to the kind; its type is `q` (or q =
 * any); drawable: a Mood decor element with a file, or a drawn rule (type rule, no file: the binding draws the line
 * from its keys); on this surface when the element lists surfaces.
 */
export function usableDevices(q, kind, { caps, mood, surface }) {
  const els = new Map((mood?.decor?.elements ?? []).map((e) => [e.id, e]));
  const out = [];
  for (const c of capsOf(caps, 'device:')) {
    const g = c.cap.given ?? {};
    const id = c.cap.key.slice('device:'.length);
    if (q !== 'any' && g.type !== q) continue;
    const named = usableOn(g.namedBy, kind);
    if (!named && !usableOn(g.allowedOn, kind)) continue;
    const el = els.get(id);
    if (!el) continue;
    const drawn = !el.file && el.type === 'rule';
    if (!el.file && !drawn) continue;
    if (Array.isArray(el.surfaces) && el.surfaces.length && surface && !el.surfaces.includes(surface.id))
      continue;
    out.push({ c, el, named, drawn });
  }
  return out.sort((a, b) => Number(b.named) - Number(a.named) || a.c.index - b.c.index);
}

/** Brand imagery samples of `kind` (`any`: every capability image kind), rotation first, then hero / bleed / wide. */
export function samplesOf(kind, brandSpec, used) {
  const samples = brandSpec?.imagery?.samples ?? [];
  const kinds = kind === 'any' ? IMAGE_KINDS : [kind];
  return samples
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s?.file && kinds.includes(s.kind) && statementSample(s))
    .sort(
      (a, b) =>
        count(used?.samples, a.s.file) - count(used?.samples, b.s.file) ||
        PHOTO_TAGS.filter((t) => b.s.tags?.includes(t)).length -
          PHOTO_TAGS.filter((t) => a.s.tags?.includes(t)).length ||
        a.index - b.index,
    );
}

/**
 * One need against the brand and the slide -> {met, signal, why, value}. `value` carries what the binding draws
 * (the device element, the sample, the variant, the brand layout entry ...).
 */
export function resolveNeed(key, kind, ctx) {
  const { caps, mood, brandSpec, slide = {}, used } = ctx;
  const p = parseNeedKey(key);
  if (p.error) return { met: false, why: p.error };
  const has = (k) => caps.get(k);
  switch (p.kind) {
    case 'logo': {
      const variants = mood?.logo?.variants ?? {};
      const surfaceVariant = slide.surface ? mood?.logo?.perSurface?.[slide.surface.id] : undefined;
      const names = Object.keys(variants).filter((v) => variants[v]?.file);
      const v =
        p.arg === 'any'
          ? names.includes(surfaceVariant)
            ? surfaceVariant
            : names.sort()[0]
          : names.includes(p.arg)
            ? p.arg
            : null;
      if (!v)
        return { met: false, why: `the Mood has no logo variant ${p.arg === 'any' ? '' : `"${p.arg}"`}` };
      const c = has(`logo:${v}`);
      return {
        met: true,
        signal: c ? signalOf(c) : `/logo/variants/${v} (Mood)`,
        value: { variant: v, placements: c?.cap?.given?.placements ?? [] },
      };
    }
    case 'component': {
      const c = has(key);
      const sources = c?.cap?.given?.sources ?? [];
      const name = [p.arg, ...sources].find((n) => mood?.components?.[n]);
      if (!name) return { met: false, why: `the brand has no ${p.arg} component` };
      return {
        met: true,
        signal: c ? signalOf(c, `/components/${name}`) : `/components/${name} (Mood)`,
        value: { component: name },
      };
    }
    case 'cutout': {
      const c = has('cutout');
      if (!c) return { met: false, why: 'the brand has no cut-out image (no transparent sample)' };
      const files = c.cap.files ?? [];
      const pick = files
        .map((file, i) => ({ file, i }))
        .sort((a, b) => count(used?.samples, a.file) - count(used?.samples, b.file) || a.i - b.i)[0];
      if (!pick) return { met: false, why: 'the cut-out capability names no file' };
      return {
        met: true,
        signal: signalOf(c, c.cap.from?.[pick.i]),
        value: { file: pick.file, pointer: c.cap.from?.[pick.i] },
      };
    }
    case 'weight-contrast':
    case 'second-face':
    case 'type-ladder':
    case 'angle':
    case 'mask': {
      const c = has(key);
      return c ? { met: true, signal: signalOf(c) } : { met: false, why: `no ${key} capability` };
    }
    case 'device': {
      if (p.arg !== 'any' && !DEVICE_TYPES.includes(p.arg)) {
        // a device need naming a brand element id (the grammar's own reading of device:<id>)
        const d = usableDevices('any', kind, { caps, mood, surface: slide.surface }).find(
          (x) => x.c.cap.key === key,
        );
        return d
          ? { met: true, signal: signalOf(d.c), value: d }
          : { met: false, why: `no usable device "${p.arg}" on ${kind}` };
      }
      const list = usableDevices(p.arg, kind, { caps, mood, surface: slide.surface });
      if (!list.length)
        return {
          met: false,
          why: `no ${p.arg === 'any' ? '' : `${p.arg} `}device the brand names or allows on ${kind} (drawable, on surface ${slide.surface?.id ?? '?'})`,
        };
      const d = list[0];
      return {
        met: true,
        signal: signalOf(d.c, d.named ? undefined : d.c.cap.from?.[0]),
        value: d,
      };
    }
    case 'photo-area':
    case 'text-zone': {
      const c = has(p.kind);
      const l = layoutsOfKind(c, kind)[0];
      if (!l) return { met: false, why: `no brand layout of ${kind} gives a ${p.kind}` };
      return { met: true, signal: signalOf(c, c.cap.from?.[0]), value: { layout: l } };
    }
    case 'overlay': {
      const list = capsOf(caps, 'overlay:').filter(
        (c) => (p.arg === 'any' || c.cap.key === key) && layoutsOfKind(c, kind).length,
      );
      const els = new Map((mood?.decor?.elements ?? []).map((e) => [e.id, e]));
      const c = list.find((x) => els.get(x.cap.key.slice('overlay:'.length))?.file);
      if (!c) return { met: false, why: `no overlay the brand draws on ${kind}` };
      const id = c.cap.key.slice('overlay:'.length);
      return { met: true, signal: signalOf(c), value: { el: els.get(id), id } };
    }
    case 'image': {
      if (slide.image) {
        const ok = p.arg === 'any' || !slide.image.kind || slide.image.kind === p.arg;
        return ok
          ? {
              met: true,
              signal: `${slide.image.pointer} (content${slide.image.kind ? `, ${slide.image.kind}` : ''})`,
              value: { file: slide.image.src, kind: slide.image.kind ?? null, content: true, ...slide.image },
            }
          : {
              met: false,
              why: `the slide's own image is ${slide.image.kind}, not ${p.arg} (never replaced by a sample)`,
            };
      }
      const s = samplesOf(p.arg, brandSpec, used)[0];
      if (!s)
        return {
          met: false,
          why: `the brand tags no ${p.arg === 'any' ? '' : `${p.arg} `}imagery sample hero / cover / bleed (product-ui: hero)`,
        };
      const c = has(`image:${s.s.kind}`);
      const ptr = `/imagery/samples/${s.index}`;
      return {
        met: true,
        signal: c ? signalOf(c, ptr) : `${ptr} (brandSpec)`,
        value: { file: s.s.file, kind: s.s.kind, pointer: ptr, sample: s.index, alt: s.s.alt },
      };
    }
    case 'colour-field': {
      const s = slide.surface;
      if (!s) return { met: false, why: 'the slide has no surface' };
      const ok =
        p.arg === 'any' ||
        ((p.arg === 'dark' || p.arg === 'light') && s.tone === p.arg) ||
        s.id === p.arg ||
        s.role === p.arg;
      if (!ok) return { met: false, why: `surface "${s.id}" is ${s.tone ?? 'of no tone'}, not ${p.arg}` };
      const c = has(`colour-field:${s.id}`);
      return {
        met: true,
        signal: c ? signalOf(c) : `/palette/surfaces (${s.id}, Mood)`,
        value: { surface: s.id },
      };
    }
    default:
      return { met: false, why: `"${key}" is not a need the binding resolves` };
  }
}

/**
 * The content fields a template has an element for (what the binding fills, compose/templateBind.js): `label` (a
 * header label, mark k), `title` (mark t; on a statement the largest text is the quote, the title its header), `quote`,
 * `attribution`, `subtitle`, `number` (a numeral), `cta` (a button, a contact or body line), `picture` (an image need).
 */
export function templateFields(t, kind) {
  const f = new Set();
  for (const e of t.elements ?? []) {
    if (e.primitive !== 'text') continue;
    const role = e.role;
    if (e.mark?.part === 'k' || role === 'eyebrow' || role === 'label') f.add('label');
    else if (e.mark?.part === 't') f.add('title');
    else if (role === 'title') f.add(kind === 'quote' ? 'quote' : 'title');
    else if (role === 'attribution') f.add('attribution');
    else if (role === 'subtitle' || e.authored?.role === 'subtitle')
      f.add(kind === 'quote' ? 'attribution' : 'subtitle');
    else if (role === 'big-number') f.add('number');
    else if (role === 'contact' || role === 'body') f.add('cta');
  }
  for (const n of t.needs ?? []) {
    if (n.key === 'component:button') f.add('cta');
    if (n.key.startsWith('image:')) f.add('picture');
  }
  return f;
}

/**
 * Content fit (owner 2026-11-04: nothing the slide carries is ever left out): a template is a candidate only when it
 * has an element for every content field the slide carries - its title, label (a slide label or a quote's label),
 * subtitle, section number, action, its one quote (a statement template holds one), its own picture (a background
 * image stays the slide background). `slide.fields` = {title, label, quoteLabel, subtitle, number, cta}; the
 * content/2 `keys` (with a title) are read when no fields are given.
 */
export function contentFit(t, kind, slide = {}) {
  const has = templateFields(t, kind);
  const f = slide.fields ?? { ...(slide.keys ?? {}), title: kind !== 'quote' };
  const out = [];
  const need = (field, what, el = field) => {
    if (f[field] && !has.has(el)) out.push(`the slide has ${what}; the template has no element for it`);
  };
  need('title', 'a title');
  if (f.label && f.quoteLabel) {
    const labels = (t.elements ?? []).filter((e) => e.primitive === 'text' && e.mark?.part === 'k').length;
    if (labels < 2) out.push('the slide has a label and a quote label; the template has one label element');
  } else {
    need('label', 'a label');
    need('quoteLabel', 'a quote label', 'label');
  }
  need('subtitle', 'a subtitle');
  need('number', 'a section number');
  need('cta', 'an action');
  if (kind === 'quote' && (slide.quotes ?? 0) > 1)
    out.push(`the slide has ${slide.quotes} quotes; the template holds one`);
  if (slide.image && slide.image.pointer !== '/background' && !has.has('picture'))
    out.push('the slide has its own image; the template has no photo');
  return { ok: !out.length, why: out };
}

/**
 * The brand gives the kind its own visual (owner 2026-11-04): the kind's background hint names an image variant on
 * the slide's surface, or a brand device (capability `device:*`) is namedBy / allowedOn the kind. Returns the reason,
 * or null.
 */
export function brandVisual(kind, { caps, mood, surface }) {
  const variant = mood?.composition?.layoutHints?.[kind]?.background;
  const bg = variant && surface?.background?.[variant];
  if (bg?.type === 'image') return `the ${kind} background is the brand image variant "${variant}"`;
  for (const c of capsOf(caps, 'device:')) {
    const g = c.cap.given ?? {};
    if (usableOn(g.namedBy, kind) || usableOn(g.allowedOn, kind))
      return `the brand device ${c.cap.key} is ${usableOn(g.namedBy, kind) ? 'named by' : 'allowed on'} the ${kind}`;
  }
  return null;
}

/** Every template of the kind with its needs resolved, best first (qualified first). */
export function candidates(kind, { brandSpec, mood, slide = {}, used = {}, records } = {}) {
  const caps = capabilityIndex(brandSpec);
  const ctx = { caps, mood, brandSpec, slide, used };
  const visual = brandVisual(kind, { caps, mood, surface: slide.surface });
  const pinned =
    typeof slide.layoutId === 'string' && slide.layoutId.startsWith('tpl-') ? slide.layoutId.slice(4) : null;
  const list = templatesFor(kind, { records }).map((template) => {
    const values = {};
    const needs = template.needs.map((n) => {
      const r = resolveNeed(n.key, kind, ctx);
      if (r.met) values[n.element] = { key: n.key, ...r.value };
      return {
        key: n.key,
        optional: Boolean(n.optional),
        met: r.met,
        signal: r.met ? r.signal : null,
        why: r.met ? undefined : r.why,
        element: n.element,
      };
    });
    // the brand's own visual for the kind wins over a sample photo or cut-out: a template that does not also bind a
    // brand device takes a picture only from the slide's own content
    if (visual && !needs.some((n) => n.met && n.key.startsWith('device:')))
      for (const n of needs)
        if (n.met && (n.key.startsWith('image:') || n.key === 'cutout') && !values[n.element]?.content) {
          n.met = false;
          n.signal = null;
          n.why = `${visual}: a template photo comes only from the slide's own image unless the template binds the brand device`;
          delete values[n.element];
        }
    const content = contentFit(template, kind, slide);
    const met = needs.filter((n) => n.met).reduce((k, n) => k + needWeight(n.key), 0);
    const optionalUnmet = needs.filter((n) => !n.met && n.optional).length;
    const requiredUnmet = needs.filter((n) => !n.met && !n.optional);
    return {
      template,
      score: met - optionalUnmet,
      qualified: !requiredUnmet.length && content.ok,
      pinned: pinned === template.id || pinned === template.id.replace(/~/g, '--'),
      needs: needs.map((n) => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined))),
      content,
      values,
    };
  });
  return list.sort(
    (a, b) =>
      Number(b.qualified) - Number(a.qualified) ||
      Number(b.qualified && b.pinned) - Number(a.qualified && a.pinned) ||
      b.score - a.score ||
      count(used.templates, a.template.id) - count(used.templates, b.template.id) ||
      (a.template.id < b.template.id ? -1 : a.template.id > b.template.id ? 1 : 0),
  );
}

/**
 * The pick for a slide: `{ best, nearest, list }` - best = the first qualified candidate (null when none);
 * nearest (when none qualifies) = the template with the fewest required needs unmet, then the highest score.
 */
export function pickTemplate(kind, opts = {}) {
  const list = candidates(kind, opts);
  const best = list.find((c) => c.qualified) ?? null;
  let nearest = null;
  if (!best && list.length) {
    const unmet = (c) => c.needs.filter((n) => !n.met && !n.optional).length + (c.content.ok ? 0 : 1);
    nearest = [...list].sort(
      (a, b) =>
        unmet(a) - unmet(b) ||
        b.score - a.score ||
        (a.template.id < b.template.id ? -1 : a.template.id > b.template.id ? 1 : 0),
    )[0];
  }
  return { best, nearest, list };
}
