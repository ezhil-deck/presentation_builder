/**
 * Tokens -> literals for one surface (P2-spec §3.3). Every lookup that cannot be answered from the Mood is a warning,
 * never a made-up value: colours / shadows come back undefined, radius / spacing 0.
 */
import { normalizeMetrics } from '../fit/metrics.js';

export const SURFACE_ROLES = Object.freeze([
  'bg',
  'text',
  'textMuted',
  'heading',
  'accent',
  'accent2',
  'card',
  'cardText',
  'border',
  'divider',
]);
/**
 * G2: the brand colour names (Mood palette.brand) a colour ref may use. Surface roles are looked up first, so `accent`
 * stays the surface's accent; a brand name is a literal for the contrast guard.
 */
export const BRAND_COLOR_NAMES = Object.freeze(['primary', 'secondary', 'accent', 'tertiary']);
const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const HEX3 = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/;

/** WCAG relative luminance of #RRGGBB(AA). */
function luminance(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two #RRGGBB colours (1..21). */
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * The minimum contrast a literal text colour must reach on its background before the surface's own text colour
 * replaces it: 3:1 (WCAG AA large text / UI). A surface-role colour is the brand's choice for that surface and is
 * never replaced; a literal (e.g. a role coloured #E81B23) was chosen for the default surface.
 */
export const MIN_LITERAL_CONTRAST = 3;

/** role.case -> deck font.case (deck has no "sentence": sentence case is the text as written). */
const deckCase = (c) => (c === 'upper' || c === 'lower' || c === 'title' ? c : 'none');

/**
 * resolve(mood, surface, {warn}) -> { color, font, radius, shadow, spacing, surface, mood }
 * `warn(check, message, severity)` receives each distinct problem once per resolver.
 */
export function resolve(mood, surface, { warn } = {}) {
  const seen = new Set();
  const say = (check, message, severity = 'warn') => {
    const key = `${check}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warn?.(check, message, severity);
  };
  const palette = mood.palette ?? {};
  const metricsCache = new Map();

  function color(ref) {
    if (ref === undefined || ref === null) return undefined;
    if (typeof ref !== 'string') {
      say('token', `colour ref ${JSON.stringify(ref)} is not a string`);
      return undefined;
    }
    if (ref === 'transparent') return '#00000000';
    if (HEX.test(ref)) return ref.toUpperCase();
    const m3 = HEX3.exec(ref);
    if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toUpperCase();
    if (SURFACE_ROLES.includes(ref)) {
      const v = surface?.[ref];
      if (v === undefined) say('token', `surface "${surface?.id}" has no "${ref}" colour`);
      return v === undefined ? undefined : color(v);
    }
    if (BRAND_COLOR_NAMES.includes(ref)) {
      const v = palette.brand?.[ref];
      if (v === undefined) say('token', `palette.brand has no "${ref}"`);
      return v === undefined ? undefined : color(v);
    }
    if (ref.startsWith('semantic.')) {
      const v = palette.semantic?.[ref.slice(9)];
      if (v === undefined) say('token', `palette.semantic has no "${ref.slice(9)}"`);
      return v === undefined ? undefined : color(v);
    }
    const chartM = /^chart\.(\d+)$/.exec(ref);
    if (chartM) {
      const list = surface?.chart ?? palette.chart?.categorical ?? [];
      if (!list.length) {
        say('token', `no chart palette for "${ref}"`);
        return undefined;
      }
      return color(list[Number(chartM[1]) % list.length]);
    }
    if (ref === 'chartMuted' || ref === 'chartHighlight') {
      const v = ref === 'chartMuted' ? palette.chart?.muted : palette.chart?.highlight;
      if (v === undefined)
        say('token', `palette.chart has no "${ref === 'chartMuted' ? 'muted' : 'highlight'}"`);
      return v === undefined ? undefined : color(v);
    }
    say('token', `unknown colour ref "${ref}"`);
    return undefined;
  }

  function metricsFor(faceId) {
    if (metricsCache.has(faceId)) return metricsCache.get(faceId);
    const face = mood.type?.faces?.[faceId];
    let m = normalizeMetrics(face?.metrics);
    if (!m) {
      say(
        'font-metrics',
        `face "${faceId}" has no metrics: text is measured at 0.5 em per character`,
        'error',
      );
      m = { ascent: 0.8, descent: -0.2, avgCharWidth: 0.5, widths: {} };
    }
    metricsCache.set(faceId, m);
    return m;
  }

  function font(roleName) {
    const role = mood.type?.roles?.[roleName];
    if (!role) {
      say('font-role', `the Mood has no type role "${roleName}"`);
      return null;
    }
    const face = mood.type?.faces?.[role.face];
    if (!face) {
      say('font-role', `role "${roleName}" names face "${role.face}", which the Mood does not define`);
      return null;
    }
    let c = color(role.color);
    if (c === undefined) {
      say(
        'font-color',
        `role "${roleName}" colour "${role.color}" does not resolve on surface "${surface?.id}": used "text"`,
      );
      c = color('text');
    }
    c = readableOn(c, role.color, `role "${roleName}"`);
    return {
      role: roleName,
      face: role.face,
      family: face.family,
      fallback: face.fallback,
      size: role.size,
      weight: role.weight,
      lineHeight: role.lineHeight,
      letterSpacing: role.letterSpacing ?? 0,
      case: deckCase(role.case),
      color: c,
      fit: role.fit,
      metrics: metricsFor(role.face),
    };
  }

  /**
   * A literal colour (not a surface role) below MIN_LITERAL_CONTRAST on this surface's bg -> the surface's `text`
   * colour (info warning). `against` overrides the background (e.g. a table header fill).
   */
  function readableOn(c, ref, what, against) {
    const bg = against ?? color('bg');
    const literal = typeof ref === 'string' && !SURFACE_ROLES.includes(ref) && !ref.startsWith('chart');
    if (!literal || !c || !bg || c.length < 7 || bg.length < 7) return c;
    if (against && against.length === 9 && against.endsWith('00')) return readableOn(c, ref, what);
    if (contrastRatio(c, bg) >= MIN_LITERAL_CONTRAST) return c;
    const t = color('text');
    if (!t || contrastRatio(t, bg) <= contrastRatio(c, bg)) return c;
    say(
      'contrast',
      `${what} colour ${c} has ${Math.round(contrastRatio(c, bg) * 100) / 100}:1 on ${bg} (surface "${surface?.id}"): used the surface text colour ${t}`,
      'info',
    );
    return t;
  }

  function radius(ref) {
    if (ref === undefined || ref === null) return undefined;
    if (typeof ref === 'number') return ref;
    const v = mood.shape?.radius?.[ref];
    if (typeof v === 'number') return v;
    say('token', `radius "${ref}" is not in shape.radius: 0`);
    return 0;
  }

  function shadow(ref) {
    if (ref === undefined || ref === null || ref === 'none') return undefined;
    const s = mood.shape?.shadow?.[ref];
    if (!s) {
      say('token', `shadow "${ref}" is not in shape.shadow`);
      return undefined;
    }
    if (s.opacity === 0) return undefined;
    const out = { x: s.x ?? 0, y: s.y ?? 0, blur: s.blur ?? 0, spread: s.spread ?? 0 };
    const c = color(s.color);
    if (c) out.color = c;
    if (s.opacity !== undefined) out.opacity = s.opacity;
    return out;
  }

  function spacing(ref) {
    if (ref === undefined || ref === null) return 0;
    if (typeof ref === 'number') return ref;
    const v = mood.geometry?.spacing?.[ref];
    if (typeof v === 'number') return v;
    say('token', `spacing "${ref}" is not in geometry.spacing: 0`);
    return 0;
  }

  return { color, font, radius, shadow, spacing, readableOn, surface, mood, warn: say };
}

/** The deck's literal font object (no metrics). */
export function deckFont(font) {
  const out = {
    family: font.family,
    size: font.size,
    weight: font.weight,
    lineHeight: font.lineHeight,
    letterSpacing: font.letterSpacing ?? 0,
    case: font.case ?? 'none',
    color: font.color,
  };
  if (font.role) out.role = font.role;
  return out;
}
