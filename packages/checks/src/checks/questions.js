/**
 * Check 2 `questions` (P3-spec §A.2, P3-D4): no unanswered blocking question in `brandSpec.questions` (fail); optional
 * questions are listed as info.
 */
import { makeItem, result, skip } from '../util.js';

export const id = 'questions';
export const title = 'No unanswered blocking brand question';
export const signal = 'brandSpec.questions';

export function run({ brandSpec }) {
  if (!brandSpec) return skip('no brand-spec');
  if (!Array.isArray(brandSpec.questions)) return skip('the brand-spec has no questions list');
  const items = brandSpec.questions.map((q) => {
    const blocking = q.severity === 'blocking';
    const data = { id: q.id, pointer: q.pointer, severity: q.severity };
    if (Array.isArray(q.neededBy) && q.neededBy.length) data.neededBy = q.neededBy;
    return makeItem(
      blocking ? 'fail' : 'info',
      `${blocking ? 'Blocking' : 'Optional'} question ${q.pointer ?? q.id}: ${q.question ?? q.id}`,
      { data },
    );
  });
  return result(items);
}
