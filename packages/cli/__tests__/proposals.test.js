// `pb build --proposals [all|pr4]` (docs/P3-proposals.md): the flag, and the report's proposals section.
// PR-1..3 are rules of every build since 2026-10-31 (their effect is in the deck: text.fit.upSteps, avatars, chips).
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedSlides, parseProposalsFlag, proposalsIndex, runBuild } from '../src/index.js';

const fixture = join(__dirname, '..', '..', 'brand', '__fixtures__', 'mini');
const readJson = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

describe('pb build --proposals', () => {
  let root;
  let brand;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pb-proposals-'));
    brand = join(root, 'mini');
    cpSync(fixture, brand, { recursive: true });
    const input = readJson(brand, 'mini.json');
    for (const style of Object.values(input.typography.styles)) style.weight ??= 400;
    writeFileSync(join(brand, 'mini.json'), JSON.stringify(input));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('parses the flag: no value / all → all; a list of open proposals; unknown names (and the approved PR-1..3) are an error', () => {
    expect(parseProposalsFlag(undefined)).toBeUndefined();
    expect(parseProposalsFlag(true)).toBe('all');
    expect(parseProposalsFlag('all')).toEqual(['all']);
    expect(parseProposalsFlag('pr4,PR-4')).toEqual(['pr4', 'PR-4']);
    expect(() => parseProposalsFlag('pr4,pr9')).toThrow(/unknown proposal\(s\) pr9/);
    expect(() => parseProposalsFlag('pr1')).toThrow(/unknown proposal\(s\) pr1 .*rules of every build/);
  });

  it('changedSlides: 1-based indices of slides whose JSON differs', () => {
    const a = { slides: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(changedSlides(a, { slides: [{ id: 1 }, { id: 'x' }, { id: 3 }, { id: 4 }] })).toEqual([2, 4]);
    expect(changedSlides(a, a)).toEqual([]);
  });

  it('writes report.proposals (per proposal: slides) against the plain build; plain build has none but carries the rules', async () => {
    const plain = await runBuild(brand, { out: join(root, 'plain'), cacheDir: null });
    expect(plain.report.proposals).toBeUndefined();
    // the approved rules are in the plain build: fit-up records, no option needed
    const grown = plain.deck.slides.flatMap((s) => s.elements.filter((e) => e.text?.fit?.upSteps));
    for (const e of grown) expect(e.text.fit.appliedSize).toBeGreaterThan(e.text.fit.requestedSize);
    const after = await runBuild(brand, {
      out: join(root, '_proposals', 'mini'),
      cacheDir: null,
      proposals: 'all',
      before: join(root, 'plain'),
    });
    const p = readJson(root, '_proposals', 'mini', 'report.json').proposals;
    expect(p.options).toEqual({ titleClearOfDecor: true });
    expect(Object.keys(p.byProposal)).toEqual(['PR-4']);
    for (const e of Object.values(p.byProposal)) expect(e.count).toBe(e.slides.length);
    expect(Array.isArray(p.byProposal['PR-4'].effects)).toBe(true);
    // every slide that differs from the plain build is one a proposal says it changed, and back
    const recorded = new Set(Object.values(p.byProposal).flatMap((e) => e.slides));
    expect(p.changedSlides).toEqual([...recorded].sort((a, b) => a - b));
    expect(after.deck.slides).toHaveLength(plain.deck.slides.length);

    // an explicit list names the open proposal
    await runBuild(brand, { out: join(root, 'only4'), cacheDir: null, proposals: ['pr4'] });
    const only = readJson(root, 'only4', 'report.json').proposals;
    expect(only.byProposal['PR-4']).toMatchObject({ on: true });

    // the index lists the folders whose report has a proposals section
    const idx = proposalsIndex(join(root, '_proposals'));
    expect(idx.brands).toBe(1);
    expect(existsSync(join(root, '_proposals', 'index.html'))).toBe(true);
  });
});
