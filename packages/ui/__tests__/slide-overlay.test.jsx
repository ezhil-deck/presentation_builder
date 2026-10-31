/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { SlideOverlay } from '../src/components/SlideCanvas.jsx';
import { SEVERITY_COLOR, findElement, itemsForSlide, overlayBoxes } from '../src/lib/checks.js';

const SLIDE = {
  id: 's9',
  elements: [
    { id: 'title', type: 'text', frame: { x: 100, y: 80, w: 800, h: 120 } },
    {
      id: 'grp',
      type: 'group',
      frame: { x: 100, y: 300, w: 1000, h: 400 },
      children: [{ id: 'card-1', type: 'shape', frame: { x: 120, y: 320, w: 300, h: 200 } }],
    },
  ],
};

const ITEMS = [
  { check: 'margins', severity: 'warn', elementId: 'title', message: 'outside' },
  { check: 'contrast', severity: 'fail', elementId: 'card-1', message: 'low contrast' },
  { check: 'compose', severity: 'info', elementId: 'missing', message: 'no such element' },
  { check: 'variety', severity: 'warn', message: 'slide-level' },
];

describe('overlay boxes', () => {
  it('turns check items into boxes at the element frames (groups searched, unknown ids skipped)', () => {
    expect(findElement(SLIDE.elements, 'card-1').frame).toEqual({ x: 120, y: 320, w: 300, h: 200 });
    const boxes = overlayBoxes(SLIDE, ITEMS);
    expect(boxes.map((b) => [b.label, b.severity, b.frame])).toEqual([
      ['margins', 'warn', { x: 100, y: 80, w: 800, h: 120 }],
      ['contrast', 'fail', { x: 120, y: 320, w: 300, h: 200 }],
    ]);
  });

  it('selects the items of a slide by id or by 1-based index', () => {
    const checks = {
      results: [
        {
          id: 'margins',
          items: [
            { severity: 'warn', slide: 's9', index: 9, elementId: 'title', message: 'a' },
            { severity: 'warn', slide: 's1', index: 1, message: 'b' },
            { severity: 'warn', index: 9, message: 'c' },
          ],
        },
      ],
    };
    expect(itemsForSlide(checks, SLIDE, 9).map((i) => i.message)).toEqual(['a', 'c']);
  });

  it('paints one box per item, placed at the frame, coloured per severity, labelled with the check id', () => {
    render(<SlideOverlay boxes={overlayBoxes(SLIDE, ITEMS)} scale={0.5} />);
    const boxes = screen.getAllByTestId('overlay-box');
    expect(boxes).toHaveLength(2);
    const [warn, fail] = boxes;
    expect(warn.style.left).toBe('100px');
    expect(warn.style.top).toBe('80px');
    expect(warn.style.width).toBe('800px');
    expect(warn.style.height).toBe('120px');
    expect(warn.getAttribute('data-severity')).toBe('warn');
    expect(warn.textContent).toBe('margins');
    expect(fail.textContent).toBe('contrast');
    // 2 screen px at scale 0.5 = 4 canvas px; the colour is the severity's
    expect(fail.style.borderWidth).toBe('4px');
    expect(fail.style.borderStyle).toBe('solid');
    expect(fail.style.borderColor).toBe(SEVERITY_COLOR.fail);
    expect(warn.style.borderColor).toBe(SEVERITY_COLOR.warn);
  });
});
