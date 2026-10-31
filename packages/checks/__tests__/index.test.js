import { CHECKS, REPORT_VERSION, runCheck, runChecks, summaryLine } from '../src/index.js';
import { filesFrom } from '../src/files.js';
import { deck, mood, slide, text } from './fixtures.js';

const IDS = [
  'schema',
  'questions',
  'assets',
  'fonts',
  'overflow',
  'min-size',
  'margins',
  'contrast',
  'text-overlap',
  'logo',
  'decor',
  'variety',
  'empty-space',
  'compose',
];

describe('@pb/checks Report v1', () => {
  it('registers the 14 checks in spec order, each with id / title / signal / run', () => {
    expect(CHECKS.map((c) => c.id)).toEqual(IDS);
    for (const c of CHECKS) {
      expect(typeof c.title).toBe('string');
      expect(c.signal === null || typeof c.signal === 'string').toBe(true);
      expect(typeof c.run).toBe('function');
    }
  });

  it('has the Report v1 shape: summary counts, one result per check, sorted keys', () => {
    const d = deck([
      slide('s1', [text('s1-t', { x: 120, y: 100, w: 400, h: 100 }, { color: '#999999', size: 20 })]),
    ]);
    const report = runChecks({ brandSpec: { id: 'test', questions: [] }, mood: mood(), deck: d });
    expect(Object.keys(report)).toEqual([
      'brandId',
      'deckId',
      'engineVersion',
      'kind',
      'results',
      'summary',
      'version',
    ]);
    expect(report).toMatchObject({
      kind: 'Report',
      version: REPORT_VERSION,
      brandId: 'test',
      deckId: 'test-deck',
      engineVersion: '0.3.0',
    });
    expect(REPORT_VERSION).toBe('1.0.0');
    expect(report.results.map((r) => r.id)).toEqual(IDS);
    for (const r of report.results) {
      expect(['pass', 'warn', 'fail', 'skip']).toContain(r.status);
      expect(r.count).toBe(r.items.length);
      if (r.status === 'skip') expect(typeof r.reason).toBe('string');
      else expect(r.reason).toBeUndefined();
    }
    const s = report.summary;
    expect(s.checks).toBe(14);
    expect(s.pass + s.warn + s.fail + s.skip).toBe(14);
    const items = report.results.flatMap((r) => r.items);
    expect(s.items).toEqual({
      fail: items.filter((i) => i.severity === 'fail').length,
      warn: items.filter((i) => i.severity === 'warn').length,
      info: items.filter((i) => i.severity === 'info').length,
    });
    const contrast = report.results.find((r) => r.id === 'contrast');
    expect(contrast).toMatchObject({
      status: 'warn',
      count: 1,
      signal: expect.stringContaining('accessibility'),
    });
    expect(contrast.items[0]).toEqual({
      severity: 'warn',
      slide: 's1',
      index: 1,
      elementId: 's1-t',
      message: '#999999 on #FFFFFF is 2.84:1 (needs 4.5:1 at 20 px)',
      data: expect.any(Object),
      fix: { command: 'snap-colour', args: { role: 'body' } },
    });
    expect(summaryLine(report)).toBe(
      `checks: ${s.pass} pass, ${s.warn} warn, ${s.fail} fail, ${s.skip} skip`,
    );
  });

  it('status is the worst item: info alone passes; items are ordered by slide index then element id', () => {
    const fake = {
      id: 'x',
      title: 'x',
      signal: null,
      run: () => ({
        status: 'warn',
        items: [
          { severity: 'warn', message: 'b', index: 2, elementId: 'b' },
          { severity: 'info', message: 'a2', index: 2, elementId: 'a' },
          { severity: 'warn', message: 'one', index: 1 },
          { severity: 'info', message: 'deck' },
        ],
      }),
    };
    expect(runCheck(fake, {}).items.map((i) => i.message)).toEqual(['deck', 'one', 'a2', 'b']);
  });

  it('a check that throws is a fail naming the error, never silent', () => {
    const r = runCheck(
      {
        id: 'boom',
        title: 'boom',
        signal: null,
        run: () => {
          throw new Error('bad');
        },
      },
      {},
    );
    expect(r).toMatchObject({
      status: 'fail',
      count: 1,
      items: [{ severity: 'fail', message: 'check "boom" crashed: bad' }],
    });
  });

  it('runs without inputs: every check skips (questions / schema name what is missing)', () => {
    const report = runChecks();
    expect(report.summary).toMatchObject({ checks: 14, skip: 14 });
    expect(report.brandId).toBeNull();
  });

  it('filesFrom(brandDir).exists resolves inside the brand folder only', () => {
    const files = filesFrom(__dirname);
    expect(files.exists('index.test.js')).toBe(true);
    expect(files.exists('nope.js')).toBe(false);
    expect(files.exists('../package.json')).toBe(false);
    expect(files.exists('/etc/hosts')).toBe(false);
    expect(files.exists('.')).toBe(false);
  });
});
