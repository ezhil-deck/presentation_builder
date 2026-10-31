import * as check from '../src/checks/questions.js';
import { golden } from './fixtures.js';

describe('check questions', () => {
  it('fails on the golden hdfc-2 brand: two blocking font-file questions', () => {
    const r = check.run({ brandSpec: golden('hdfc-2').brandSpec });
    expect(r.status).toBe('fail');
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.data.id)).toEqual([
      'typography.faces.data.files',
      'typography.faces.tagline.files',
    ]);
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
    expect(check.run({ brandSpec: golden('stripe').brandSpec })).toEqual({ status: 'pass', items: [] });
  });

  it('skips without a brand-spec or a questions list', () => {
    expect(check.run({}).status).toBe('skip');
    expect(check.run({ brandSpec: { id: 'x' } }).status).toBe('skip');
  });
});
