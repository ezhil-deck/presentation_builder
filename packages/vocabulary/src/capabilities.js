/**
 * The capability-key grammar (docs/PLAN-template-library.md §2 / §3): one language for what a template NEEDS (V1,
 * packages/templates) and what a brand CAN SUPPLY (V2, the brand capability record), so the binding step (V3) matches
 * keys, never prose. A key that does not parse is an error wherever it is written.
 *
 *   device:<decor element id>   a device (the brand's decor element of that id)
 *   photo-area                  a photo area (layouts[].composition)
 *   overlay:<id>                a tint / overlay
 *   text-zone                   a field reserved for text
 *   image:<kind>                kind: photo-people | photo-product | product-ui | illustration | abstract
 *   cutout                      a cut-out (transparent) image
 *   colour-field:<surface id or role>
 *   logo:<variant>              any key of the brand's `logos.variants` (full | mark | wordmark | monoLight |
 *                               monoDark | icon | reverse ...)
 *   mask:<id>                   a mask the image is cut to
 *   component:<term>            a component of that E2 role (chip, callout, divider ...) or E3 structure (quotes,
 *                               process, timeline, logos, people, stack ...): what maps.json `brand.components` yields
 *   angle | second-face | weight-contrast | type-ladder
 *   composition | motion        the brand's composition (density / whitespace) rules and its motion block: capabilities
 *                               with no element
 * (settled with V2, 2026-11-04: logo variants open, component E2 or E3, composition and motion added; angle stays
 * one bare key holding all of a brand's angles.)
 */
import { termEntry } from './index.js';

export const IMAGE_KINDS = Object.freeze([
  'photo-people',
  'photo-product',
  'product-ui',
  'illustration',
  'abstract',
]);
/** The common logo variants (documentation: `logo:` accepts any variant key the brand gives). */
export const LOGO_VARIANTS = Object.freeze(['full', 'mark', 'wordmark', 'monoLight', 'monoDark']);
export const BARE_KEYS = Object.freeze([
  'photo-area',
  'text-zone',
  'cutout',
  'angle',
  'second-face',
  'weight-contrast',
  'type-ladder',
  'composition',
  'motion',
]);
const WITH_ID = Object.freeze(['device', 'overlay', 'colour-field', 'mask', 'logo']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Parses a capability key: { kind, arg } (arg null for a bare key), or { error } naming what is wrong.
 * `component:` must name an E2 role or an E3 structure term (a block or composition, not a slide kind).
 */
export function parseCapabilityKey(key) {
  if (typeof key !== 'string' || !key) return { error: 'a capability key is a non-empty string' };
  if (BARE_KEYS.includes(key)) return { kind: key, arg: null };
  const at = key.indexOf(':');
  if (at < 0) return { error: `"${key}" is not a capability key (no such bare key, and no "<kind>:<arg>")` };
  const kind = key.slice(0, at);
  const arg = key.slice(at + 1);
  if (WITH_ID.includes(kind)) {
    if (!TOKEN.test(arg))
      return {
        error: `"${key}": ${kind} needs ${kind === 'logo' ? 'a variant' : 'an id'} (letters, digits, . _ -)`,
      };
    return { kind, arg };
  }
  if (kind === 'image') {
    if (!IMAGE_KINDS.includes(arg))
      return { error: `"${key}": image kind must be one of ${IMAGE_KINDS.join(' | ')}` };
    return { kind, arg };
  }
  if (kind === 'component') {
    const t = termEntry('E2', arg) || termEntry('E3', arg);
    if (!t || t.group === 'kind')
      return { error: `"${key}": "${arg}" is not an E2 role or E3 structure term of the vocabulary` };
    return { kind, arg };
  }
  return { error: `"${key}": "${kind}" is not a capability kind` };
}

/** True when the key parses. */
export const isCapabilityKey = (key) => !parseCapabilityKey(key).error;
