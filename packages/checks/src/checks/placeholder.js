/**
 * Check 15 `placeholder` (docs/P4-spec.md §3, P4.2): a slide added in the Studio starts with placeholder copy (the
 * slide-kind picker's skeleton); placeholder text left in the deck is listed so it is never exported silently. One
 * info item per slide that still shows one of the placeholder strings (`PLACEHOLDER_TEXTS`,
 * packages/engine/src/content/placeholders.js - the one list the picker writes from), naming its first such text.
 */
import { isPlaceholderText } from '@pb/engine';
import { flatElements, makeItem, result, skip, slidesOf } from '../util.js';

export const id = 'placeholder';
export const title = 'No placeholder text is left in the deck';
export const signal = null;

const plain = (el) => (el.text?.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join(''));

export function run({ deck }) {
  if (!deck) return skip('no deck');
  const items = [];
  for (const { slide, index } of slidesOf(deck)) {
    const found = [];
    for (const el of flatElements(slide)) {
      if (el.type !== 'text' || el.hidden) continue;
      const hit = plain(el).find((t) => isPlaceholderText(t) || t.split('\n').some(isPlaceholderText));
      if (hit !== undefined) found.push({ el, text: hit.trim() });
    }
    if (!found.length) continue;
    const texts = [...new Set(found.map((f) => f.text))];
    items.push(
      makeItem(
        'info',
        `${found.length} text${found.length > 1 ? 's' : ''} on this slide ${found.length > 1 ? 'are' : 'is'} placeholder copy: ${texts.map((t) => `"${t}"`).join(', ')}`,
        { slide, index, el: found[0].el, data: { elements: found.map((f) => f.el.id), texts } },
      ),
    );
  }
  return result(items);
}
