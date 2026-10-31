import { breakLines, fitText, layoutText, measure } from '../src/index.js';
import { font, miniMood } from './helpers.js';

describe('measure', () => {
  it('sums per-em advances × size (+ letterSpacing × size × (n − 1))', () => {
    expect(measure('abc', font())).toBe(15);
    expect(measure('abc', font({ letterSpacing: 0.1 }))).toBeCloseTo(17, 10);
    expect(measure('W', font())).toBe(10);
    expect(measure(' ', font())).toBe(2.5);
    expect(measure('', font())).toBe(0);
  });
  it('uses avgCharWidth for a code point the face does not list', () => {
    expect(measure('é', font())).toBe(5);
    expect(measure('😀', font())).toBe(5); // one code point, not two UTF-16 units
  });
  it('throws without metrics', () => {
    expect(() => measure('a', { size: 10 })).toThrow(/no metrics/);
  });
});

describe('breakLines', () => {
  it('wraps greedily on spaces at known widths', () => {
    const lines = breakLines('aaaa bbbb cccc', font(), 45);
    expect(lines.map((l) => [l.text, l.width])).toEqual([
      ['aaaa bbbb', 42.5],
      ['cccc', 20],
    ]);
  });
  it('keeps a line that fits exactly and collapses repeated spaces', () => {
    expect(breakLines('aa   bb', font(), 22.5).map((l) => l.text)).toEqual(['aa bb']);
  });
  it('honours hard breaks', () => {
    expect(breakLines('aa\nbb', font(), 100).map((l) => l.text)).toEqual(['aa', 'bb']);
  });
  it('breaks a word wider than the line by characters, with a warning', () => {
    const warnings = [];
    const lines = breakLines('abcdefghij', font(), 22, { warnings });
    expect(lines.map((l) => l.text)).toEqual(['abcd', 'efgh', 'ij']);
    expect(warnings).toEqual([
      expect.objectContaining({ check: 'long-word', message: expect.stringMatching(/abcdefghij/) }),
    ]);
  });
  it('keeps run boundaries with x offsets', () => {
    const [line] = breakLines({ runs: [{ text: 'aa ' }, { text: 'bb', bold: true }] }, font(), 100);
    expect(line.runs).toEqual([
      { text: 'aa ', run: 0, x: 0, width: 12.5 },
      { text: 'bb', run: 1, x: 12.5, width: 10 },
    ]);
    const spaced = breakLines({ runs: [{ text: 'a' }, { text: 'b' }] }, font({ letterSpacing: 0.1 }), 100)[0];
    expect(spaced.runs[1].x).toBeCloseTo(6, 10); // 'a' (5) + one letter-space (1)
  });
});

describe('layoutText', () => {
  // size 20, lineHeight 1.5 -> L = 30; (ascent − descent)·size = 24; half-leading 3; ascent·size 18
  const f = font({ size: 20 });
  it('places baselines by the half-leading formula', () => {
    const res = layoutText(['aaaa bbbb cccc dddd'], { x: 0, y: 0, w: 100, h: 200 }, f);
    expect(res.lines.map((l) => [l.text, l.y])).toEqual([
      ['aaaa bbbb', 21],
      ['cccc dddd', 51],
    ]);
    expect(res.height).toBe(60);
    expect(res.overflow).toBe(false);
  });
  it('adds spaceAfter + spaceBefore between paragraphs', () => {
    const res = layoutText(
      [
        { runs: [{ text: 'aa' }], spaceAfter: 10 },
        { runs: [{ text: 'bb' }], spaceBefore: 4 },
      ],
      { x: 0, y: 0, w: 100, h: 200 },
      f,
    );
    expect(res.lines.map((l) => l.y)).toEqual([21, 65]);
    expect(res.height).toBe(74);
  });
  it('aligns horizontally and shifts the block for valign', () => {
    const frame = { x: 0, y: 0, w: 100, h: 200 };
    expect(layoutText(['aa'], frame, f, { align: 'center' }).lines[0].x).toBe(40);
    expect(layoutText(['aa'], frame, f, { align: 'right' }).lines[0].x).toBe(80);
    expect(layoutText(['aa'], frame, f, { valign: 'middle' }).lines[0].y).toBe(106);
    expect(layoutText(['aa'], frame, f, { valign: 'bottom' }).lines[0].y).toBe(191);
  });
  it('indents list levels by bullets.indent (else 1.5 × size) and places the glyph one indent left', () => {
    const paras = [
      { runs: [{ text: 'a' }], level: 1, bullet: { glyph: '•' } },
      { runs: [{ text: 'b' }], level: 2, bullet: { glyph: '•' } },
    ];
    const frame = { x: 0, y: 0, w: 200, h: 200 };
    const given = layoutText(paras, frame, f, { bullets: { indent: 15 } }).lines;
    expect(given.map((l) => [l.x, l.bullet.x])).toEqual([
      [15, 0],
      [30, 15],
    ]);
    const derived = layoutText(paras, frame, f).lines;
    expect(derived.map((l) => l.x)).toEqual([30, 60]);
  });
  it('never indents less than the widest glyph + a space (an ordered "10." keeps clear of its text)', () => {
    const paras = [
      { runs: [{ text: 'a' }], level: 1, bullet: { glyph: '9.', ordered: true } },
      { runs: [{ text: 'b' }], level: 1, bullet: { glyph: '10.', ordered: true } },
    ];
    const lines = layoutText(paras, { x: 0, y: 0, w: 200, h: 200 }, f, { bullets: { indent: 5 } }).lines;
    const room = measure('10. ', f);
    expect(lines.map((l) => l.x)).toEqual([room, room]);
    for (const l of lines) expect(l.bullet.x + l.bullet.width).toBeLessThan(l.x);
    // negative: with room to spare the brand indent is kept as given
    expect(layoutText(paras, { x: 0, y: 0, w: 200, h: 200 }, f, { bullets: { indent: 40 } }).lines[0].x).toBe(
      40,
    );
  });
  it('flags overflow when the block is taller than the frame', () => {
    expect(layoutText(['aaaa bbbb cccc dddd'], { x: 0, y: 0, w: 100, h: 50 }, f).overflow).toBe(true);
  });
  it('applies the font case to the laid-out text', () => {
    expect(layoutText(['ab cd'], { x: 0, y: 0, w: 200, h: 50 }, font({ case: 'upper' })).lines[0].text).toBe(
      'AB CD',
    );
  });
});

describe('fitText', () => {
  const mood = miniMood();
  const surface = mood.palette.surfaces[0];
  const paras = [{ runs: [{ text: 'aaaa bbbb cc' }] }];
  it('steps the role down until the text fits', () => {
    // 20px: 110px wide -> 2 lines (60px) > 30px; 18px: 99px -> 1 line of 27px
    const { text, warnings } = fitText(paras, { x: 0, y: 0, w: 100, h: 30 }, 'body', mood, surface);
    expect(text.fit).toEqual({ requestedSize: 20, appliedSize: 18, overflow: false, steps: 1, height: 27 });
    expect(text.font).toMatchObject({ family: 'Test', size: 18, color: '#111111', role: 'body' });
    expect(text.lines).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
  it('stops at fit.min and flags the overflow with the one-click fix', () => {
    const { text, warnings } = fitText(paras, { x: 0, y: 0, w: 100, h: 10 }, 'body', mood, surface);
    expect(text.fit).toMatchObject({ requestedSize: 20, appliedSize: 14, overflow: true, steps: 3 });
    expect(warnings).toEqual([
      expect.objectContaining({
        check: 'overflow',
        fix: { command: 'fitText', args: { allowBelowMin: true } },
      }),
    ]);
  });
  it('goes below fit.min only when allowBelowMin is asked', () => {
    const { text } = fitText(paras, { x: 0, y: 0, w: 100, h: 10 }, 'body', mood, surface, {
      allowBelowMin: true,
    });
    expect(text.fit).toMatchObject({ appliedSize: 6, overflow: false });
  });
  it('takes a forced size for shared sizing', () => {
    const { text } = fitText(paras, { x: 0, y: 0, w: 1000, h: 1000 }, 'body', mood, surface, { size: 16 });
    expect(text.fit).toMatchObject({ requestedSize: 20, appliedSize: 16, steps: 2 });
  });
});
