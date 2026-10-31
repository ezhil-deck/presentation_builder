/**
 * Check 12 `variety` (P3-spec §A.2): when `mood.palette.rhythm` names at least two distinct surfaces, the content
 * slides (not cover / section / cta) use at least two distinct surfaces, and no run of more than `rhythm.length + 1`
 * consecutive content slides shares one surface. A rhythm of one surface → skip.
 */
import { makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'variety';
export const title = 'Content slides vary their surface';
export const signal = 'mood.palette.rhythm';

/** Slide kinds outside the rhythm (P2-spec §3.2: cover / section / cta are excluded from the cycle). */
export const NOT_CONTENT = new Set(['cover', 'section', 'cta']);

export function run({ deck, mood }) {
  if (!deck) return skip('no deck');
  const rhythm = mood?.palette?.rhythm;
  if (!Array.isArray(rhythm) || !rhythm.length) return skip('the Mood gives no palette.rhythm');
  const distinct = [...new Set(rhythm)];
  if ((mood.palette.surfaces ?? []).length < 2) return skip('the brand gives one surface');
  if (distinct.length < 2) return skip(`palette.rhythm names one surface ("${distinct[0]}")`);
  const content = slidesOf(deck).filter(({ slide }) => !NOT_CONTENT.has(slide.kind));
  const items = [];
  const used = [...new Set(content.map(({ slide }) => slide.surfaceId))];
  if (content.length >= 2 && used.length < 2) {
    items.push(
      makeItem('warn', `all ${content.length} content slides use one surface ("${used[0]}")`, {
        data: { surface: used[0] ?? null, rhythm },
      }),
    );
  }
  const max = rhythm.length + 1;
  let start = 0;
  for (let i = 1; i <= content.length; i += 1) {
    if (i < content.length && content[i].slide.surfaceId === content[start].slide.surfaceId) continue;
    const run = content.slice(start, i);
    if (run.length > max) {
      const first = run[0];
      items.push(
        makeItem(
          'warn',
          `${run.length} consecutive content slides share surface "${first.slide.surfaceId}" (more than rhythm length ${rhythm.length} + 1)`,
          {
            slide: first.slide,
            index: first.index,
            data: {
              surface: first.slide.surfaceId,
              length: run.length,
              max,
              slides: run.map((r) => r.index),
            },
          },
        ),
      );
    }
    start = i;
  }
  return result(items);
}
