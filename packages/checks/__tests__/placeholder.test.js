// The editor's `placeholder` check (docs/P4-spec.md §3, P4.2): slides still showing the slide-kind picker's
// placeholder copy are listed (info), so it is never exported silently; the CLI's 14-check report is unchanged.
import { PLACEHOLDER, PLACEHOLDER_TEXTS } from '@pb/engine';
import { CHECKS, EDITOR_CHECKS, runCheck, runChecks } from '../src/index.js';
import * as placeholder from '../src/checks/placeholder.js';
import { deck, goldenIds, golden, mood, resultOf, slide, text } from './fixtures.js';

const frame = { x: 120, y: 100, w: 600, h: 100 };

describe('placeholder check', () => {
  it('lists each slide still showing placeholder copy (info), naming its first text', () => {
    const d = deck([
      slide('s1', [text('s1-title', frame, { content: 'Our year' })]),
      slide('s2', [
        text('s2-title', frame, { content: PLACEHOLDER.title }),
        text('s2-cards-0-title', frame, { content: PLACEHOLDER.heading }),
        text('s2-cards-0-text', frame, { content: PLACEHOLDER.body }),
      ]),
      slide('s3', [text('s3-title', frame, { content: `  ${PLACEHOLDER.point} ` })]),
    ]);
    const r = runCheck(placeholder, { deck: d, mood: mood() });
    expect(r.status).toBe('pass'); // info only: it warns nothing, it lists
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({
      severity: 'info',
      slide: 's2',
      index: 2,
      elementId: 's2-title',
      data: { elements: ['s2-title', 's2-cards-0-title', 's2-cards-0-text'] },
    });
    expect(r.items[0].message).toMatch(
      /3 texts on this slide are placeholder copy: "Slide title", "Heading"/,
    );
    expect(r.items[1]).toMatchObject({
      slide: 's3',
      elementId: 's3-title',
      data: { texts: ['Add a point'] },
    });
  });

  it('does not flag text that only contains a placeholder word, or hidden elements (negative)', () => {
    const hidden = text('s1-sub', frame, { content: PLACEHOLDER.subtitle });
    hidden.hidden = true;
    const d = deck([
      slide('s1', [
        text('s1-title', frame, { content: `${PLACEHOLDER.title} of the quarter` }),
        text('s1-x', frame, { content: 'Heading north' }),
        hidden,
      ]),
    ]);
    expect(runCheck(placeholder, { deck: d }).items).toEqual([]);
    expect(runCheck(placeholder, {})).toMatchObject({ status: 'skip' });
  });

  it('is an editor check: runChecks adds it with `editor: true`; the default report keeps CHECKS', () => {
    expect(EDITOR_CHECKS.map((c) => c.id)).toEqual(['placeholder']);
    expect(CHECKS.map((c) => c.id)).not.toContain('placeholder');
    const d = deck([slide('s1', [text('s1-title', frame, { content: PLACEHOLDER_TEXTS[0] })])]);
    const plain = runChecks({ brandSpec: { id: 'test', questions: [] }, mood: mood(), deck: d });
    expect(plain.summary.checks).toBe(15);
    expect(resultOf(plain, 'placeholder')).toBeUndefined();
    const ed = runChecks({ brandSpec: { id: 'test', questions: [] }, mood: mood(), deck: d, editor: true });
    expect(ed.summary.checks).toBe(16);
    expect(resultOf(ed, 'placeholder').items).toHaveLength(1);
  });

  it('finds no placeholder copy in the golden decks', () => {
    for (const id of goldenIds()) {
      expect(runCheck(placeholder, { deck: golden(id).deck }).items).toEqual([]);
    }
  });
});
