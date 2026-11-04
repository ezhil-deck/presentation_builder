import * as check from '../src/checks/questions.js';
import { golden } from './fixtures.js';

describe('check questions', () => {
  it('fails on the golden hdfc-2 brand: two blocking font-file questions', () => {
    const r = check.run({ brandSpec: golden('hdfc-2').brandSpec });
    expect(r.status).toBe('fail');
    // V2 (2026-11-04): the brand also carries optional `claim.*` questions (BR-CLAIMS), listed as info
    const blocking = r.items.filter((i) => i.severity === 'fail');
    expect(blocking).toHaveLength(2);
    expect(blocking.map((i) => i.data.id)).toEqual([
      'typography.faces.data.files',
      'typography.faces.tagline.files',
    ]);
    expect(r.items.filter((i) => i.severity !== 'fail').every((i) => i.data.id.startsWith('claim.'))).toBe(
      true,
    );
  });

  it('optional questions are info (pass); no questions pass', () => {
    const optional = {
      id: 'x',
      questions: [
        {
          id: 'logo.height.large',
          pointer: '/logo/height/large',
          severity: 'optional',
          question: 'How tall?',
        },
      ],
    };
    const r = check.run({ brandSpec: optional });
    expect(r.status).toBe('pass');
    expect(r.items).toEqual([
      expect.objectContaining({
        severity: 'info',
        message: 'Optional question /logo/height/large: How tall?',
      }),
    ]);
    // a golden brand with no blocking question passes; its only items are V2's optional claim questions (info)
    const stripe = check.run({ brandSpec: golden('stripe').brandSpec });
    expect(stripe.status).toBe('pass');
    expect(stripe.items.every((i) => i.severity === 'info' && i.data.id.startsWith('claim.'))).toBe(true);
    expect(check.run({ brandSpec: { id: 'x', questions: [] } })).toEqual({ status: 'pass', items: [] });
  });

  it('skips without a brand-spec or a questions list', () => {
    expect(check.run({}).status).toBe('skip');
    expect(check.run({ brandSpec: { id: 'x' } }).status).toBe('skip');
  });
});
