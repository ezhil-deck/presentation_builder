/** Surface + background per slide (P2-spec §3.2). */

const OUT_OF_CYCLE = new Set(['cover', 'section', 'cta']);

export function defaultSurface(mood) {
  const surfaces = mood.palette?.surfaces ?? [];
  return surfaces.find((s) => s.role === 'default') ?? surfaces[0];
}

/**
 * A rhythm counter for one deck: `j` counts only the slides that reached the rhythm branch; `step` is the rhythm step
 * (index into palette.rhythm) the last surfaceFor() call took, else null (G9: that step's background variant).
 */
export const createSurfaceState = (warn) => ({ j: 0, warn, step: null });

/**
 * surfaceFor(i, slide, mood, state, layout) -> surface. Order: slide.surface (pinned) -> palette.perKind[kind]
 * (the kind as written, then the catalogue kind) -> layout.surface.prefer (a role other than default/any; added, see
 * report) -> palette.rhythm[j] (cover/section/cta never take a rhythm step) -> the default surface.
 * `slide.kind` is the kind as written; `slide.layoutKind` (optional) the catalogue kind.
 */
export function surfaceFor(i, slide, mood, state = createSurfaceState(), layout) {
  const surfaces = mood.palette?.surfaces ?? [];
  const byId = (id) => surfaces.find((s) => s.id === id);
  state.step = null;
  if (slide.surface) {
    const s = byId(slide.surface);
    if (s) return s;
    state.warn?.('surface', `slide ${i + 1}: pinned surface "${slide.surface}" is not in the Mood`);
  }
  const kinds = [...new Set([slide.kind, slide.layoutKind].filter(Boolean))];
  for (const k of kinds) {
    const id = mood.palette?.perKind?.[k];
    if (id && byId(id)) return byId(id);
  }
  const prefer = layout?.surface?.prefer;
  if (prefer && prefer !== 'any' && prefer !== 'default') {
    const s =
      surfaces.find((x) => x.role === prefer) ??
      (prefer === 'dark' ? surfaces.find((x) => x.tone === 'dark') : null);
    if (s) return s;
  }
  const rhythm = mood.palette?.rhythm ?? [];
  if (!kinds.some((k) => OUT_OF_CYCLE.has(k)) && rhythm.length) {
    const step = state.j % rhythm.length;
    const id = rhythm[step];
    state.j += 1;
    if (byId(id)) {
      state.step = step;
      return byId(id);
    }
    state.warn?.('surface', `palette.rhythm names surface "${id}", which the Mood does not define`);
  }
  return defaultSurface(mood);
}

/**
 * The slide background: composition.layoutHints[kind].background names a variant; when this surface carries
 * background[variant] of type image / gradient it is used (image -> deck.assets), else solid surface.bg.
 * G9: when the hint gives no such background and the surface came from a rhythm step that names a variant
 * (palette.rhythmBackgrounds[step]), that variant's background on this surface is used.
 */
export function backgroundFor(kinds, surface, mood, R, assets, { rhythmStep = null } = {}) {
  const hints = mood.composition?.layoutHints ?? {};
  const hinted = kinds.map((k) => hints[k]?.background).find(Boolean);
  const rhythmVariant =
    rhythmStep === null || rhythmStep === undefined
      ? undefined
      : mood.palette?.rhythmBackgrounds?.[rhythmStep];
  const variant = hinted && surface.background?.[hinted] ? hinted : (rhythmVariant ?? hinted);
  const bg = variant ? surface.background?.[variant] : undefined;
  if (bg?.type === 'image' && bg.image) {
    const out = {
      type: 'image',
      asset: assets.add(bg.image),
      fit: ['cover', 'contain', 'tile'].includes(bg.imageFit) ? bg.imageFit : 'cover',
      color: R.color(surface.bg),
    };
    const ov = R.color(bg.overlay);
    if (ov && typeof bg.overlayOpacity === 'number' && bg.overlayOpacity > 0) {
      out.overlay = ov;
      out.overlayOpacity = bg.overlayOpacity;
      if (bg.overlayGradient !== undefined) out.overlayGradient = bg.overlayGradient;
      if (bg.overlayDirection !== undefined) out.overlayDirection = bg.overlayDirection;
    }
    return out;
  }
  if (bg?.type === 'gradient') {
    const stops = (bg.stops ?? bg.colors ?? [])
      .map((s, k, all) =>
        typeof s === 'string'
          ? { color: R.color(s), at: all.length > 1 ? k / (all.length - 1) : 0 }
          : { color: R.color(s.color), at: s.at ?? s.offset ?? 0 },
      )
      .filter((s) => s.color);
    if (stops.length >= 2) {
      const gradient = { type: bg.gradientType === 'radial' ? 'radial' : 'linear', stops };
      if (typeof bg.angle === 'number') gradient.angle = bg.angle;
      return { type: 'gradient', gradient, color: R.color(surface.bg) };
    }
    R.warn(
      'background',
      `gradient background "${variant}" on surface "${surface.id}" has no usable stops: solid bg`,
    );
  }
  return { type: 'solid', color: R.color(surface.bg) };
}
