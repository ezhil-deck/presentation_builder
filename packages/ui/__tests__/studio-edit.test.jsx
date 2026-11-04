/** @jest-environment jsdom */
// The Studio's edit mode (docs/P4-spec.md §2, §4, §5; P4.1) against a fake server that applies element overrides the
// way the real one does (frame / hidden / locked on the deck element): selection, handles, drag, nudge, undo / redo
// with the persisted command log, the Checks' Fix button, hidden elements, overflow outlines.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Studio from '../src/studio/Studio.jsx';
import { clearLayoutCache } from '../src/studio/LayoutPicker.jsx';
import {
  alignFrames,
  applyPatch,
  distributeFrames,
  inversePatch,
  isNoop,
  makeCommand,
  matchSize,
  pickTarget,
  pushCommand,
  resizeFrame,
  snapMove,
  snapTargets,
  withFrames,
  withKeys,
} from '../src/studio/edit.js';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json'), 'utf8'));
const DECK = { ...GOLDEN, slides: GOLDEN.slides.slice(0, 3) };

const BRANDS = [
  {
    id: 'stripe',
    name: 'Stripe',
    ok: true,
    logo: null,
    colours: ['#533AFD'],
    accent: '#533AFD',
    surfaces: [{ id: 'page', bg: '#FFFFFF', text: '#061B31', heading: '#061B31', accent: '#533AFD' }],
    rhythm: ['page'],
    fonts: { heading: 'Sohne', body: 'Sohne' },
    geometry: {
      margins: { top: 80, right: 138, bottom: 80, left: 138 },
      titleZone: { y: 80, height: 120 },
      grid: { columns: 12, gutter: 24 },
    },
    questions: { blocking: 0, total: 0 },
  },
];
const CONTENTS = [{ id: 'showcase', title: 'Showcase deck', file: 'golden/showcase/showcase.md' }];
const checksFor = (items) => ({
  kind: 'Report',
  version: '1.0.0',
  summary: { checks: 1, pass: 0, warn: 1, fail: 0, skip: 0, items: { fail: 0, warn: items.length, info: 0 } },
  results: [{ id: 'margins', title: 'Elements stay inside the margins', status: 'warn', items }],
});
const MARGIN_ITEM = {
  severity: 'warn',
  slide: 's1',
  index: 1,
  elementId: 's1-logo',
  message: 'image "s1-logo" is outside the margins by 98 px left',
  fix: { command: 'move-inside' },
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  text: async () => JSON.stringify(body),
});

function findEl(els, id) {
  for (const el of els ?? []) {
    if (el.id === id) return el;
    const hit = findEl(el.children, id);
    if (hit) return hit;
  }
  return null;
}

/** The deck with element overrides applied (frame / hidden / locked), as the server does it. */
function composed(overrides, { overflow } = {}) {
  const deck = JSON.parse(JSON.stringify(DECK));
  for (const [id, o] of Object.entries(overrides?.elements ?? {})) {
    const el = deck.slides.map((s) => findEl(s.elements, id)).find(Boolean);
    if (!el) continue;
    if (o.frame) el.frame = o.frame;
    if (o.hidden) el.hidden = true;
    if (o.locked) el.locked = true;
  }
  if (overflow) findEl(deck.slides[0].elements, overflow).text.fit.overflow = true;
  return deck;
}

function fakeServer({ history = null, overflow = null, compose } = {}) {
  const calls = [];
  const state = { history };
  const fetch = jest.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url === '/api/studio/brands') return reply(200, BRANDS);
    if (url === '/api/studio/contents') return reply(200, CONTENTS);
    if (url === '/api/studio/compose') {
      if (compose) {
        const r = compose(body, calls);
        if (r) return r;
      }
      return reply(200, {
        brandId: body.brandId,
        contentId: body.contentId,
        deck: composed(body.overrides, { overflow }),
        checks: checksFor([MARGIN_ITEM]),
        warnings: [],
        overrides: body.overrides ?? { slides: {} },
        ms: { total: 9 },
      });
    }
    if (url === '/api/studio/fix') {
      return reply(200, {
        elements: { [body.item.elementId]: { frame: { x: 138, y: 1012, w: 67.2, h: 28 } } },
        message: `"${body.item.elementId}" moved inside the margins`,
      });
    }
    if (url.startsWith('/api/studio/history/')) {
      if (method === 'PUT') {
        state.history = body;
        return reply(200, body);
      }
      return state.history ? reply(200, state.history) : reply(200, { commands: [], cursor: 0 });
    }
    if (url.startsWith('/api/studio/overrides/')) return reply(200, body ?? { slides: {} });
    if (url.startsWith('/api/studio/layouts')) return reply(200, []);
    return reply(404, { error: 'not found' });
  });
  return { fetch, calls, state };
}

let server;
beforeEach(() => {
  server = fakeServer();
  global.fetch = server.fetch;
  window.history.replaceState(null, '', '#/');
  clearLayoutCache();
});
afterEach(async () => {
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0));
  });
  delete global.fetch;
});

const composes = () => server.calls.filter((c) => c.url === '/api/studio/compose');
const puts = (prefix) => server.calls.filter((c) => c.method === 'PUT' && c.url.startsWith(prefix));
const slideBox = () => screen.getByTestId('canvas-slide');
const painted = (id) => slideBox().querySelector(`.slide [data-element-id="${id}"]`);
/** The canvas transform scale (the slide box's `scale(…)`). */
const canvasScale = () =>
  parseFloat(
    /scale\(([\d.]+)\)/.exec(
      [...slideBox().querySelectorAll('div')].find((d) => d.style.transform.startsWith('scale(')).style
        .transform,
    )[1],
  );
const outlines = () => screen.queryAllByTestId('selection-outline').map((o) => o.dataset.element);

async function renderStudio() {
  render(<Studio route={{}} />);
  await waitFor(() => expect(screen.getAllByTestId('film-thumb')).toHaveLength(3));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/history/'))).toBe(true));
}

async function enterEdit() {
  fireEvent.keyDown(window, { key: 'e' });
  await screen.findByTestId('edit-layer');
}

describe('editor helpers', () => {
  it('patches set / remove whole entries; the inverse restores; no-ops are detected', () => {
    const base = { slides: { s1: { surface: 'navy' } }, elements: { a: { locked: true } } };
    const patch = { elements: { a: null, b: { hidden: true } }, slides: { s1: null } };
    const next = applyPatch(base, patch);
    expect(next).toEqual({ slides: {}, elements: { b: { hidden: true } } });
    const inv = inversePatch(base, patch);
    expect(inv).toEqual({ elements: { a: { locked: true }, b: null }, slides: { s1: { surface: 'navy' } } });
    expect(applyPatch(next, inv)).toEqual(base);
    expect(applyPatch({ slides: {} }, { elements: { a: {} } })).toEqual({ slides: {} });
    expect(isNoop(base, { elements: { a: { locked: true } } })).toBe(true);
    expect(isNoop(base, { elements: { a: { hidden: true } } })).toBe(false);
    expect(withKeys({ frame: { x: 1 }, locked: true }, { locked: false })).toEqual({ frame: { x: 1 } });
    expect(withKeys({ locked: true }, { locked: false })).toBeNull();
  });

  it('commands push after the cursor (the redo tail goes) and the log keeps 200', () => {
    const cmd = makeCommand(
      { slides: {} },
      { elements: { a: { hidden: true } } },
      { label: 'Hide', slideId: 's1' },
    );
    expect(cmd).toMatchObject({
      args: { elements: { a: { hidden: true } } },
      inverse: { elements: { a: null } },
    });
    const h = pushCommand({ commands: [{ type: 'x' }, { type: 'y' }], cursor: 1 }, cmd);
    expect(h.commands.map((c) => c.type)).toEqual(['x', 'edit']);
    expect(h.cursor).toBe(2);
    let long = { commands: [], cursor: 0 };
    for (let i = 0; i < 205; i += 1) long = pushCommand(long, { type: `c${i}` });
    expect(long.commands).toHaveLength(200);
    expect(long.commands[0].type).toBe('c5');
  });

  it('snapping: to the margins, the title zone, the grid and other elements; nothing beyond the threshold', () => {
    const geometry = BRANDS[0].geometry;
    const targets = snapTargets({ slide: DECK.slides[0], geometry, exclude: new Set(['s1-title']) });
    // left edge 4 px from the left margin snaps to it, with a guide
    const a = snapMove({ x: 142, y: 400, w: 300, h: 100 }, targets, 6);
    expect(a.frame.x).toBe(138);
    expect(a.guides).toContainEqual({ axis: 'x', v: 138 });
    // top 3 px below the title zone's bottom (200) snaps to it
    expect(snapMove({ x: 600, y: 203, w: 300, h: 50 }, targets, 6).frame.y).toBe(200);
    // the second grid column starts at 138 + 115 + 24 = 277
    expect(snapMove({ x: 280, y: 400, w: 10, h: 10 }, targets, 6).frame.x).toBe(277);
    // far from everything: unchanged, no guide
    const far = snapMove({ x: 600, y: 400, w: 10, h: 33 }, targets, 2);
    expect(far.frame).toEqual({ x: 600, y: 400, w: 10, h: 33 });
    expect(far.guides).toEqual([]);
  });

  it('resize: each handle moves its edges; a minimum side; Shift keeps the aspect', () => {
    const start = { x: 100, y: 100, w: 200, h: 100 };
    expect(resizeFrame(start, 'se', 50, 20).frame).toEqual({ x: 100, y: 100, w: 250, h: 120 });
    expect(resizeFrame(start, 'nw', 50, 20).frame).toEqual({ x: 150, y: 120, w: 150, h: 80 });
    expect(resizeFrame(start, 'e', -500, 0).frame.w).toBe(8);
    expect(resizeFrame(start, 'se', 100, 0, { keepAspect: true }).frame).toEqual({
      x: 100,
      y: 100,
      w: 300,
      h: 150,
    });
  });

  it('align / distribute / match size', () => {
    const items = [
      { id: 'a', frame: { x: 100, y: 0, w: 100, h: 50 } },
      { id: 'b', frame: { x: 300, y: 100, w: 50, h: 20 } },
      { id: 'c', frame: { x: 700, y: 40, w: 100, h: 30 } },
    ];
    const ref = { x: 100, y: 0, w: 700, h: 130 };
    expect(alignFrames(items, 'left', ref)).toEqual({
      b: { x: 100, y: 100, w: 50, h: 20 },
      c: { x: 100, y: 40, w: 100, h: 30 },
    });
    expect(alignFrames(items, 'bottom', ref).a).toEqual({ x: 100, y: 80, w: 100, h: 50 });
    // span 700, widths 250 -> gaps of 225: b at 425
    expect(distributeFrames(items, 'x')).toEqual({ b: { x: 425, y: 100, w: 50, h: 20 } });
    expect(distributeFrames(items.slice(0, 2), 'x')).toEqual({});
    expect(matchSize(items, 'w')).toEqual({ b: { x: 300, y: 100, w: 100, h: 20 } });
  });

  it('pickTarget: the outermost element box, or the child of the entered group; withFrames moves group children', () => {
    document.body.innerHTML =
      '<section class="slide"><div data-element-id="g"><div data-element-id="g-a"><span id="t">x</span></div></div></section>';
    const t = document.getElementById('t');
    expect(pickTarget(t, null)).toBe('g');
    expect(pickTarget(t, 'g')).toBe('g-a');
    expect(pickTarget(document.querySelector('.slide'), null)).toBeNull();
    const deck = {
      slides: [
        {
          elements: [
            {
              id: 'g',
              frame: { x: 0, y: 0, w: 100, h: 100 },
              children: [{ id: 'g-a', frame: { x: 10, y: 10, w: 10, h: 10 } }],
            },
          ],
        },
      ],
    };
    const moved = withFrames(deck, 0, { g: { x: 50, y: 0, w: 200, h: 100 } });
    expect(moved.slides[0].elements[0].children[0].frame).toEqual({ x: 70, y: 10, w: 20, h: 10 });
    expect(deck.slides[0].elements[0].frame.x).toBe(0);
    document.body.innerHTML = '';
  });
});

describe('Studio edit mode', () => {
  it('E toggles edit mode; a click selects (outline + 8 handles); shift-click adds; Esc clears; Tab cycles', async () => {
    await renderStudio();
    expect(screen.queryByTestId('edit-layer')).toBeNull();
    await enterEdit();
    expect(screen.getByTestId('edit-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('element-empty')).toBeTruthy();
    fireEvent.mouseDown(painted('s1-title'));
    fireEvent.mouseUp(window);
    expect(outlines()).toEqual(['s1-title']);
    expect(screen.getAllByTestId('resize-handle')).toHaveLength(8);
    expect(screen.getByTestId('element-id').textContent).toBe('s1-title');
    expect(screen.getByLabelText('Frame X').value).toBe('138');
    // shift-click adds: two outlines; the selection's box gets the 4 corner handles only (P4.4)
    fireEvent.mouseDown(painted('s1-subtitle'), { shiftKey: true });
    expect(outlines()).toEqual(['s1-title', 's1-subtitle']);
    expect(screen.getAllByTestId('resize-handle').map((h) => h.dataset.dir)).toEqual([
      'nw',
      'ne',
      'se',
      'sw',
    ]);
    expect(screen.getByTestId('selection-box')).toBeTruthy();
    expect(screen.getByTestId('element-many').textContent).toMatch(/2 elements/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(outlines()).toEqual([]);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(outlines()).toEqual(['s1-label']);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(outlines()).toEqual(['s1-title']);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(outlines()).toEqual(['s1-label']);
    // a click on the empty slide clears; no compose was sent for selection
    fireEvent.mouseDown(slideBox().querySelector('.slide'));
    expect(outlines()).toEqual([]);
    expect(composes()).toHaveLength(1);
    // the handles are counter-scaled: 8 px on screen at any zoom
    fireEvent.mouseDown(painted('s1-title'));
    const handle = screen.getAllByTestId('resize-handle')[0];
    const scale = canvasScale();
    expect(parseFloat(handle.style.width) * scale).toBeCloseTo(8, 5);
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.queryByTestId('edit-layer')).toBeNull();
  });

  it('an arrow key nudges the selection 1 px (Shift 10): one command -> compose -> PUT overrides -> PUT history', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-title'));
    fireEvent.mouseUp(window);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // nudges don't navigate slides
    expect(screen.getByTestId('counter').textContent).toBe('1 / 3');
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides).toEqual({
      slides: {},
      elements: { 's1-title': { frame: { x: 149, y: 820.28, w: 1088, h: 92 } } },
    });
    await waitFor(() => expect(puts('/api/studio/history/')).toHaveLength(1));
    expect(puts('/api/studio/overrides/')[0].body.elements['s1-title'].frame.x).toBe(149);
    const h = puts('/api/studio/history/')[0].body;
    expect(h.cursor).toBe(1);
    expect(h.commands[0]).toMatchObject({
      label: 'Nudge',
      slideId: 's1',
      inverse: { elements: { 's1-title': null } },
    });
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('Saved'));
    // the canvas paints the composed deck: the title box at its new x
    await waitFor(() => expect(painted('s1-title').style.left).toBe('149px'));
  });

  it('drag moves (one command per gesture, Alt = no snapping); undo reverts, redo re-applies', async () => {
    await renderStudio();
    await enterEdit();
    const scale = canvasScale();
    fireEvent.mouseDown(painted('s1-title'), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 100, altKey: true });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 70, altKey: true });
    // the draft frame is painted while dragging, nothing sent yet
    expect(parseFloat(painted('s1-title').style.left)).toBeCloseTo(138 + 50 / scale, 1);
    expect(composes()).toHaveLength(1);
    fireEvent.mouseUp(window);
    await waitFor(() => expect(composes()).toHaveLength(2));
    const f = composes()[1].body.overrides.elements['s1-title'].frame;
    expect(f.x).toBeCloseTo(138 + 50 / scale, 1);
    expect(f.y).toBeCloseTo(821.28 - 30 / scale, 1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false));
    // undo: the inverse (no element override) composed and stored
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides).toEqual({ slides: {} });
    await waitFor(() => expect(server.state.history.cursor).toBe(0));
    expect(screen.getByRole('button', { name: 'Redo' }).disabled).toBe(false);
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    await waitFor(() => expect(composes()).toHaveLength(4));
    expect(composes()[3].body.overrides.elements['s1-title'].frame.x).toBeCloseTo(138 + 50 / scale, 1);
    await waitFor(() => expect(server.state.history.cursor).toBe(1));
  });

  it('a resize handle drag commits the new frame; a text resize previews the re-fit through compose', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-title'));
    fireEvent.mouseUp(window);
    const scale = canvasScale();
    const east = screen.getAllByTestId('resize-handle').find((h) => h.dataset.dir === 'e');
    fireEvent.mouseDown(east, { clientX: 500, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 360, clientY: 300, altKey: true });
    // the live preview: a compose with the temporary override, nothing stored
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides.elements['s1-title'].frame.w).toBeCloseTo(1088 - 140 / scale, 1);
    expect(puts('/api/studio/overrides/')).toHaveLength(0);
    fireEvent.mouseUp(window);
    await waitFor(() => expect(puts('/api/studio/overrides/')).toHaveLength(1));
    expect(puts('/api/studio/overrides/')[0].body.elements['s1-title'].frame.w).toBeCloseTo(
      1088 - 140 / scale,
      1,
    );
    expect(server.state.history.commands[0].label).toBe('Resize');
  });

  it('hide: the element is not painted and leaves the selection (P4.4); Show brings it back; lock removes the handles', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-subtitle'));
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByRole('switch', { name: 'Lock' }));
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides.elements).toEqual({ 's1-subtitle': { locked: true } });
    await waitFor(() => expect(screen.queryAllByTestId('resize-handle')).toHaveLength(0));
    fireEvent.click(screen.getByRole('switch', { name: 'Hide' }));
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides.elements).toEqual({ 's1-subtitle': { locked: true, hidden: true } });
    await waitFor(() => expect(painted('s1-subtitle')).toBeNull());
    expect(painted('s1-title')).not.toBeNull();
    // a hidden element is not selectable: it left the selection; the panel lists it under Hidden
    expect(outlines()).toEqual([]);
    expect(screen.getAllByTestId('hidden-item').map((li) => li.textContent)).toEqual(['s1-subtitleShow']);
    // the filmstrip thumbnail does not paint it either
    expect(
      screen.getAllByTestId('film-thumb')[0].querySelector('[data-element-id="s1-subtitle"]'),
    ).toBeNull();
    // Show: hidden dropped (the lock kept), painted again
    fireEvent.click(screen.getByRole('button', { name: 'Show s1-subtitle' }));
    await waitFor(() => expect(composes()).toHaveLength(4));
    expect(composes()[3].body.overrides.elements).toEqual({ 's1-subtitle': { locked: true } });
    await waitFor(() => expect(painted('s1-subtitle')).not.toBeNull());
    expect(screen.queryByTestId('element-hidden')).toBeNull();
  });

  it('align to the content frame and the frame fields commit one command each', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-logo'));
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides.elements['s1-logo'].frame).toEqual({
      x: 138,
      y: 1012,
      w: 67.2,
      h: 28,
    });
    await waitFor(() => expect(screen.getByLabelText('Frame Y').value).toBe('1012'));
    const y = screen.getByLabelText('Frame Y');
    fireEvent.change(y, { target: { value: '900' } });
    fireEvent.blur(y);
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides.elements['s1-logo'].frame).toEqual({
      x: 138,
      y: 900,
      w: 67.2,
      h: 28,
    });
  });

  it("the Checks' Fix button asks the server for the fix and applies it as an undoable command", async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /Checks/ }));
    const item = screen.getByTestId('panel-check-item');
    fireEvent.click(within(item).getByTestId('fix-button'));
    await waitFor(() => expect(composes()).toHaveLength(2));
    const fix = server.calls.find((c) => c.url === '/api/studio/fix');
    expect(fix.body).toMatchObject({ brandId: 'stripe', contentId: 'showcase', overrides: { slides: {} } });
    expect(fix.body.item).toMatchObject({ elementId: 's1-logo', fix: { command: 'move-inside' } });
    expect(composes()[1].body.overrides.elements).toEqual({
      's1-logo': { frame: { x: 138, y: 1012, w: 67.2, h: 28 } },
    });
    await screen.findByText(/moved inside the margins/);
    await waitFor(() => expect(server.state.history.commands[0].type).toBe('fix'));
    // undoable
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides).toEqual({ slides: {} });
  });

  it('a reload keeps undo: the stored log is loaded and its last command undone', async () => {
    server = fakeServer({
      history: {
        commands: [
          {
            type: 'hidden',
            label: 'hidden',
            slideId: 's2',
            args: { elements: { 's2-title': { hidden: true } } },
            inverse: { elements: { 's2-title': null } },
          },
        ],
        cursor: 1,
      },
      compose: (body) =>
        body.overrides === undefined
          ? reply(200, {
              brandId: 'stripe',
              contentId: 'showcase',
              deck: composed({ elements: { 's2-title': { hidden: true } } }),
              checks: checksFor([]),
              warnings: [],
              overrides: { slides: {}, elements: { 's2-title': { hidden: true } } },
            })
          : null,
    });
    global.fetch = server.fetch;
    await renderStudio();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(false));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides).toEqual({ slides: {} });
    // the undo shows the slide the command was on
    await waitFor(() => expect(screen.getByTestId('counter').textContent).toBe('2 / 3'));
    await waitFor(() => expect(server.state.history.cursor).toBe(0));
  });

  it('overflow: a red outline on the element and a count on the filmstrip thumbnail', async () => {
    server = fakeServer({ overflow: 's1-title' });
    global.fetch = server.fetch;
    await renderStudio();
    const o = screen.getByTestId('overflow-outline');
    expect(o.dataset.element).toBe('s1-title');
    const counts = screen.getAllByTestId('film-overflow');
    expect(counts).toHaveLength(1);
    expect(counts[0].textContent).toBe('1');
    expect(screen.getAllByTestId('film-thumb')[0].contains(counts[0])).toBe(true);
  });

  it('a failed compose keeps the deck and logs nothing', async () => {
    server = fakeServer({
      compose: (body, calls) =>
        calls.filter((c) => c.url === '/api/studio/compose').length > 1
          ? reply(422, { error: 'nope' })
          : null,
    });
    global.fetch = server.fetch;
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-title'));
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByRole('switch', { name: 'Hide' }));
    await screen.findByRole('alert');
    expect(painted('s1-title')).not.toBeNull();
    expect(puts('/api/studio/')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Undo' }).disabled).toBe(true);
  });
});
