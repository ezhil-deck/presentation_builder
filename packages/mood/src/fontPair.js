// The font-pair switch (docs/P4-spec.md §3, P4.3): a deck-level choice among the alternative pairs a brand defines
// (Mood `type.pairs`, from BrandSpec typography.pairs; MD-TYPE). Applying a pair swaps the faces of the Mood's type
// roles - the roles set in the brand's heading face take the pair's heading face, those in its body face the pair's
// body face - so the fitter measures with the pair's own metrics (each face carries them). Nothing else of the Mood
// changes; a brand without pairs has nothing to switch to.

const HEADING_ROLES = new Set(['display', 'h1', 'h2', 'h3']);

/** The brand's own pair: the face of its heading roles (h1, else display) and of its body role. */
export function basePair(mood) {
  const roles = mood?.type?.roles ?? {};
  return {
    heading: roles.h1?.face ?? roles.display?.face ?? null,
    body: roles.body?.face ?? null,
  };
}

/** The Mood's alternative pairs with their families: [{id, label, heading, body, headingFamily, bodyFamily}]. */
export function fontPairList(mood) {
  const faces = mood?.type?.faces ?? {};
  return (mood?.type?.pairs ?? []).map((p) => ({
    id: p.id,
    label: p.label ?? `${faces[p.heading]?.family ?? p.heading} / ${faces[p.body]?.family ?? p.body}`,
    heading: p.heading,
    body: p.body,
    headingFamily: faces[p.heading]?.family ?? null,
    bodyFamily: faces[p.body]?.family ?? null,
  }));
}

/**
 * applyFontPair(mood, id) -> {mood, pair, roles}: a copy of the Mood whose roles use the pair's faces (`roles` = the
 * role names whose face changed). Throws when the Mood has no pair `id` (the caller reports it). When the brand's
 * heading and body roles share one face, the heading roles (display, h1, h2, h3) take the pair's heading face and
 * the other roles in that face its body face.
 */
export function applyFontPair(mood, id) {
  const pair = (mood?.type?.pairs ?? []).find((p) => p.id === id);
  if (!pair) throw new Error(`the brand defines no font pair "${id}"`);
  const faces = mood.type.faces ?? {};
  if (!faces[pair.heading] || !faces[pair.body])
    throw new Error(`font pair "${id}" names a face the Mood does not have`);
  const base = basePair(mood);
  const roles = {};
  const changed = [];
  for (const [name, r] of Object.entries(mood.type.roles ?? {})) {
    let face = r.face;
    if (base.heading && base.heading === base.body) {
      if (r.face === base.heading) face = HEADING_ROLES.has(name) ? pair.heading : pair.body;
    } else if (r.face === base.heading) face = pair.heading;
    else if (r.face === base.body) face = pair.body;
    roles[name] = face === r.face ? r : { ...r, face };
    if (face !== r.face) changed.push(name);
  }
  return { mood: { ...mood, type: { ...mood.type, roles } }, pair, roles: changed };
}
