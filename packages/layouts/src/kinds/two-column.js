/**
 * Two columns, 6+6 grid spans (P2-spec §2). Each column: a heading (h2) and a body (slots col<N>-title / col<N>-body). With an image in the content
 * (summary.hasImage) the left column holds the image and the right column the heading + body. More than two columns
 * (summary.columns ≥ 3) → equal columns across the body area.
 */
import { createBuilder, normSummary, standardTitle } from '../common.js';
import { LINES, bodyArea, columns, frame, gutter, lineBox, pickRole, space, spans } from '../geometry.js';

function column(b, f, i, headRole, bodyRole, sm) {
  const hh = lineBox(b.mood, headRole, LINES.heading);
  // slot ids per the engine convention (P2-spec §7 F5): col<N>-title / col<N>-body
  const id = `col${i + 1}`;
  b.box(`${id}-title`, frame(f.x, f.y, f.w, hh), {
    role: 'subtitle',
    slot: `${id}-title`,
    ...b.bodyAlign({ v: 'top' }),
  });
  b.slot(`${id}-title`, 'text', `${id}-title`, { role: headRole });
  b.box(`${id}-body`, frame(f.x, f.y + hh + sm, f.w, f.h - hh - sm), {
    role: 'body',
    slot: `${id}-body`,
    ...b.bodyAlign({ v: 'top' }),
  });
  b.slot(`${id}-body`, 'richtext', `${id}-body`, { role: bodyRole });
}

export default {
  id: 'two-column',
  kind: 'two-column',
  version: 1,
  tags: ['compare', 'columns'],
  build(ctx) {
    const b = createBuilder(this, ctx);
    const { mood } = b;
    const s = normSummary(ctx.summary);
    standardTitle(b, 'two-column');
    const area = bodyArea(mood);
    const g = gutter(mood);
    const sm = space(mood, 'sm');
    const headRole = pickRole(mood, 'h2');
    const bodyRole = pickRole(mood, 'body');
    const n = Math.max(2, s.columns);
    const cols = n === 2 ? spans(area, [6, 6], g) : columns(area, n, g);
    if (n === 2 && s.hasImage) {
      b.box('image', cols[0], { role: 'image', slot: 'image' });
      b.slot('image', 'image', 'image');
      const hh = lineBox(mood, headRole, LINES.heading);
      const f = cols[1];
      b.box('subtitle', frame(f.x, f.y, f.w, hh), {
        role: 'subtitle',
        slot: 'subtitle',
        ...b.bodyAlign({ v: 'top' }),
      });
      b.slot('subtitle', 'text', 'subtitle', { role: headRole });
      b.box('body', frame(f.x, f.y + hh + sm, f.w, f.h - hh - sm), {
        role: 'body',
        slot: 'body',
        ...b.bodyAlign({ v: 'top' }),
      });
      b.slot('body', 'richtext', 'body', { role: bodyRole });
    } else {
      cols.forEach((f, i) => column(b, f, i, headRole, bodyRole, sm));
    }
    return b.finish();
  },
};
