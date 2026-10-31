import { rule } from '../src/rules/voice.js';
import { load } from './fixtures.js';

describe('MD-VOICE', () => {
  it('stripe: titleCase, language, rtl', () => {
    const res = rule(load('stripe'));
    expect(res.patch.voice).toEqual({ titleCase: 'sentence', language: 'en', rtl: false });
    expect(res.provenance['/voice/rtl'].from).toEqual(['/locale/rtl']);
  });
  it('absent -> empty patch', () => {
    expect(rule(load('minimal')).patch).toEqual({});
  });
});
