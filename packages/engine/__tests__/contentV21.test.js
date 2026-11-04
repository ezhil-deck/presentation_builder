/**
 * content v2.1 (docs/PLAN-catalogue.md D8, docs/S2-content-v2.md): a content/2 `process` node may carry a `label`
 * ("2026", "Now", "Phase 1") drawn in place of its number marker. Read from the fence, validated by the schema, lowered
 * onto the steps item and pointed at by its source; a label on any other node type is a content warning (an unknown
 * field), never an error; content v2.0 documents parse unchanged.
 */
import {
  BLOCKS,
  blockWarnings,
  lowerSlide,
  parseMarkdownResult,
  validateBlockV2,
  validateContent,
} from '../src/index.js';
import { CONTENT_SCHEMA_ID } from '../src/content/schema.js';
import { itemSource } from '../src/content/source.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.js';

const one = (body) => {
  const { content, warnings } = parseMarkdownResult(`# Cover\n\n# T\n${body}\n`, { schema: 'content/2' });
  return { slide: content.slides[1], warnings: warnings.filter((w) => w.slide === 's2'), content };
};

describe('content v2.1: the process node label', () => {
  it('is in the schema (v2.1) and the vocabulary with the plan’s heading band', () => {
    expect(CONTENT_SCHEMA_ID).toMatch(/content\.v2\.1\.json$/);
    expect(BLOCKS.process.fields.label).toEqual({ maxChars: 20 });
    const block = { type: 'process', items: [{ heading: 'Connect', label: '2026' }, { heading: 'Go live' }] };
    expect(validateBlockV2(block)).toEqual([]);
    expect(validateBlockV2({ type: 'process', items: [{ heading: 'A', label: 7 }] })).not.toEqual([]);
  });

  it('is read from a process fence (and the v1 steps alias), carried onto the steps item, pointed at', () => {
    const { slide, warnings } = one(
      '```process\n- label: Now\n  heading: Connect\n  body: Systems linked.\n- label: 2027\n  heading: Go live\n```',
    );
    expect(warnings).toEqual([]);
    expect(slide.blocks[0].items.map((n) => n.label)).toEqual(['Now', '2027']);
    const lowered = lowerSlide(slide).slide.blocks.find((b) => b.type === 'steps');
    expect(lowered.items.map((n) => n.label)).toEqual(['Now', '2027']);
    const desc = { path: '/slides/1/blocks/0', type: 'process', orig: slide.blocks[0] };
    expect(itemSource(desc, lowered, 0, 'label')).toEqual({ paths: ['/slides/1/blocks/0/items/0/label'] });
    expect(itemSource(desc, lowered, 1, 'number')).toEqual({ paths: ['/slides/1/blocks/0/items/1/label'] });
    const steps = one('```steps\n- title: A\n  label: Phase 1\n- title: B\n```').slide;
    expect(steps.blocks[0].items[0].label).toBe('Phase 1');
  });

  it('a label far over its band is a content warning', () => {
    const block = { type: 'process', items: [{ heading: 'A', label: 'x'.repeat(40) }, { heading: 'B' }] };
    expect(blockWarnings(block).map((w) => w.message)).toEqual([
      'process[0].label is 40 characters, far over its design range (≤ 20)',
    ]);
  });

  it('on a non-process node it is a content warning, not an error (negative)', () => {
    const { slide, warnings } = one(
      '```timeline\n- when: Q1\n  heading: A\n  label: Now\n- when: Q2\n  heading: B\n```',
    );
    expect(warnings.map((w) => [w.severity, w.message])).toEqual([
      ['warn', 'fenced block "timeline": unknown field "label" ignored'],
    ]);
    expect(slide.blocks[0].items[0].label).toBeUndefined();
    expect(
      validateBlockV2({ type: 'timeline', items: [{ heading: 'A', label: 'Now' }, { heading: 'B' }] }),
    ).not.toEqual([]);
  });

  it('content v2.0 documents parse and validate unchanged (the showcase has no label)', () => {
    const md = readFileSync(join(ROOT, 'golden/showcase/showcase.md'), 'utf8');
    const { content, warnings } = parseMarkdownResult(md);
    expect(validateContent(content)).toEqual([]);
    expect(warnings.filter((w) => /unknown field/.test(w.message))).toEqual([]);
    const process = content.slides.flatMap((s) => s.blocks ?? []).filter((b) => b.type === 'process');
    expect(process.length).toBeGreaterThan(0);
    expect(process.every((b) => b.items.every((n) => n.label === undefined))).toBe(true);
  });
});
