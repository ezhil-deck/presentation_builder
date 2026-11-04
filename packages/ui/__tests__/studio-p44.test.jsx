/** @jest-environment jsdom */
// P4.4 of the Studio editor (docs/P4-spec.md §2, §9): the snapping polish (canvas / element centres, equal spacing,
// resize snapping, a threshold in screen px, distance labels), the keyboard map (keys.js) with its Shortcuts overlay,
// and the multi-select rules (locked / hidden in a selection, multi-resize, Tab, Delete, undo, re-compose, group
// level) - pure functions first, then the Studio against a fake server that applies element overrides the way the
// real one does (as studio-edit.test.jsx).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Studio from '../src/studio/Studio.jsx';
import EditLayer from '../src/studio/EditLayer.jsx';
import { clearLayoutCache } from '../src/studio/LayoutPicker.jsx';
import {
  SNAP_PX,
  clampMove,
  clickSelection,
  pruneSelection,
  resizeFrame,
  scaleFrames,
  selectAllIds,
  snapMove,
  snapTargets,
  snapThreshold,
  spacingSnap,
} from '../src/studio/edit.js';
import {
  SCOPES,
  SHORTCUTS,
  formatKeys,
  matchKey,
  shortcutsMarkdown,
  typingTarget,
} from '../src/studio/keys.js';
import { navTarget } from '../src/studio/lib.js';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json'), 'utf8'));
const DECK = { ...GOLDEN, slides: GOLDEN.slides.slice(0, 3) };
const GEOMETRY = {
  margins: { top: 80, right: 138, bottom: 80, left: 138 },
  titleZone: { y: 80, height: 120 },
  grid: { columns: 12, gutter: 24 },
};
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
    geometry: GEOMETRY,
    questions: { blocking: 0, total: 0 },
  },
];
const CONTENTS = [{ id: 'showcase', title: 'Showcase deck', file: 'golden/showcase/showcase.md' }];
const NO_CHECKS = {
  kind: 'Report',
  version: '1.0.0',
  summary: { checks: 0, pass: 0, warn: 0, fail: 0, skip: 0, items: { fail: 0, warn: 0, info: 0 } },
  results: [],
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

/** A group on slide 1 (no golden stripe slide has one): two shapes inside a frame. */
const GROUP = {
  id: 's1-g',
  type: 'group',
  role: 'group',
  frame: { x: 1300, y: 200, w: 400, h: 300 },
  children: [
    {
      id: 's1-g-a',
      type: 'shape',
      role: 'shape',
      frame: { x: 1300, y: 200, w: 180, h: 300 },
      shape: { kind: 'rect' },
      style: { fill: '#cccccc' },
    },
    {
      id: 's1-g-b',
      type: 'shape',
      role: 'shape',
      frame: { x: 1520, y: 200, w: 180, h: 300 },
      shape: { kind: 'rect' },
      style: { fill: '#cccccc' },
    },
  ],
};

/**
 * The fake server: compose applies element overrides (frame / hidden / locked) like the real one; `mutate(deck, n)`
 * changes the n-th composed deck (1-based) before it is answered.
 */
function fakeServer({ mutate } = {}) {
  const calls = [];
  const state = { history: null, n: 0 };
  const fetch = jest.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url === '/api/studio/brands') return reply(200, BRANDS);
    if (url === '/api/studio/contents') return reply(200, CONTENTS);
    if (url === '/api/studio/compose') {
      state.n += 1;
      const deck = JSON.parse(JSON.stringify(DECK));
      if (mutate) mutate(deck, state.n);
      for (const [id, o] of Object.entries(body.overrides?.elements ?? {})) {
        const el = deck.slides.map((s) => findEl(s.elements, id)).find(Boolean);
        if (!el) continue;
        if (o.frame) el.frame = o.frame;
        if (o.hidden) el.hidden = true;
        if (o.locked) el.locked = true;
      }
      return reply(200, {
        brandId: body.brandId,
        contentId: body.contentId,
        deck,
        checks: NO_CHECKS,
        warnings: [],
        overrides: body.overrides ?? { slides: {} },
        ms: { total: 9 },
      });
    }
    if (url.startsWith('/api/studio/history/')) {
      if (method === 'PUT') {
        state.history = body;
        return reply(200, body);
      }
      return reply(200, state.history ?? { commands: [], cursor: 0 });
    }
    if (url.startsWith('/api/studio/overrides/')) return reply(200, body ?? { slides: {} });
    if (url.startsWith('/api/studio/layouts')) return reply(200, []);
    if (url.startsWith('/api/studio/content/')) return reply(404, { error: 'no content document' });
    return reply(404, { error: 'not found' });
  });
  return { fetch, calls, state };
}

let server;
const useServer = (opts) => {
  server = fakeServer(opts);
  global.fetch = server.fetch;
};
beforeEach(() => {
  useServer();
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
const slideBox = () => screen.getByTestId('canvas-slide');
const painted = (id) => slideBox().querySelector(`.slide [data-element-id="${id}"]`);
const outlines = () => screen.queryAllByTestId('selection-outline').map((o) => o.dataset.element);
const canvasScale = () =>
  parseFloat(
    /scale\(([\d.]+)\)/.exec(
      [...slideBox().querySelectorAll('div')].find((d) => d.style.transform.startsWith('scale(')).style
        .transform,
    )[1],
  );
const key = (k, mods = {}) => fireEvent.keyDown(window, { key: k, ...mods });
/** No compose / save running (keys wait for it: the Studio ignores editor keys while busy). */
const idle = () =>
  waitFor(() => {
    expect(screen.getByTestId('canvas').dataset.busy).toBe('false');
    expect(screen.getByTestId('save-state').textContent).toBe('Saved');
  });
const click = (id, mods = {}) => {
  fireEvent.mouseDown(painted(id), mods);
  fireEvent.mouseUp(window);
};

async function renderStudio() {
  render(<Studio route={{}} />);
  await waitFor(() => expect(screen.getAllByTestId('film-thumb')).toHaveLength(3));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/history/'))).toBe(true));
}
async function enterEdit() {
  key('e');
  await screen.findByTestId('edit-layer');
}

// ---------------------------------------------------------------------------------------------------------------
describe('the keyboard map (keys.js)', () => {
  it('⌘ matches Cmd (metaKey, Mac) and Ctrl (ctrlKey, Windows); a wrong modifier does not match (negative)', () => {
    expect(matchKey({ key: 'z', metaKey: true }, 'view')).toBe('undo');
    expect(matchKey({ key: 'z', ctrlKey: true }, 'view')).toBe('undo');
    expect(matchKey({ key: 'Z', metaKey: true, shiftKey: true }, 'view')).toBe('redo');
    expect(matchKey({ key: 'Z', ctrlKey: true, shiftKey: true }, 'view')).toBe('redo');
    expect(matchKey({ key: 'a', ctrlKey: true }, 'edit')).toBe('select-all');
    expect(matchKey({ key: 'L', metaKey: true, shiftKey: true }, 'edit')).toBe('lock');
    expect(matchKey({ key: 'h', ctrlKey: true, shiftKey: true }, 'edit')).toBe('hide');
    // negative: no ⌘, ⌘ without ⇧, ⌥ added, a key of another scope
    expect(matchKey({ key: 'z' }, 'view')).toBeNull();
    expect(matchKey({ key: 'l', metaKey: true }, 'edit')).toBeNull();
    expect(matchKey({ key: 'a' }, 'edit')).toBeNull();
    expect(matchKey({ key: 'e', ctrlKey: true }, 'view')).toBeNull();
    expect(matchKey({ key: 'e', altKey: true }, 'view')).toBeNull();
    expect(matchKey({ key: 'z', metaKey: true, altKey: true }, 'view')).toBeNull();
    expect(matchKey({ key: 'a', metaKey: true }, 'view')).toBeNull();
  });

  it('the old keys keep their meaning (E, G, Esc, Enter, Tab, arrows ± Shift, ⌘D, Delete, ⌘↑ / ⌘↓, ⌘B / I / K, ⌘↵)', () => {
    expect(matchKey({ key: 'E', shiftKey: true }, 'view')).toBe('edit-mode');
    expect(matchKey({ key: 'g' }, 'view')).toBe('grid-view');
    expect(matchKey({ key: 'Escape' }, 'view')).toBe('close');
    expect(matchKey({ key: 'Escape' }, 'edit')).toBe('escape');
    expect(matchKey({ key: 'Enter' }, 'edit')).toBe('inline-edit');
    expect(matchKey({ key: 'Enter', metaKey: true }, 'edit')).toBeNull();
    expect(matchKey({ key: 'Tab' }, 'edit')).toBe('next-element');
    expect(matchKey({ key: 'Tab', shiftKey: true }, 'edit')).toBe('prev-element');
    expect(matchKey({ key: 'ArrowLeft' }, 'edit')).toBe('nudge');
    expect(matchKey({ key: 'ArrowLeft', shiftKey: true }, 'edit')).toBe('nudge-10');
    expect(matchKey({ key: 'ArrowLeft', metaKey: true }, 'edit')).toBeNull();
    expect(matchKey({ key: 'd', metaKey: true }, 'filmstrip')).toBe('duplicate-slide');
    expect(matchKey({ key: 'Backspace' }, 'filmstrip')).toBe('delete-slide');
    expect(matchKey({ key: 'Delete', metaKey: true }, 'filmstrip')).toBeNull();
    expect(matchKey({ key: 'ArrowUp', ctrlKey: true }, 'filmstrip')).toBe('move-slide-up');
    expect(matchKey({ key: 'ArrowDown', metaKey: true }, 'filmstrip')).toBe('move-slide-down');
    expect(matchKey({ key: 'B', metaKey: true }, 'inline')).toBe('bold');
    expect(matchKey({ key: 'i', ctrlKey: true }, 'inline')).toBe('italic');
    expect(matchKey({ key: 'k', metaKey: true }, 'inline')).toBe('link');
    expect(matchKey({ key: 'Enter', metaKey: true }, 'inline')).toBe('inline-commit');
    expect(matchKey({ key: 'Enter' }, 'inline')).toBe('inline-paragraph');
    expect(matchKey({ key: 'Enter', shiftKey: true }, 'inline')).toBe('inline-break');
    expect(matchKey({ key: 'Tab', shiftKey: true }, 'grid')).toBe('cell-prev');
    expect(matchKey({ key: 'Enter' }, 'grid')).toBe('cell-down');
    expect(matchKey({ key: 'Enter', shiftKey: true }, 'grid')).toBeNull();
    // slide navigation (navTarget reads the map): arrows, PageUp / Down, Home / End, ⌘ arrows, and [ / ]
    expect(navTarget({ key: '[' }, 2, 3)).toBe(1);
    expect(navTarget({ key: ']' }, 0, 3)).toBe(1);
    expect(navTarget({ key: ']', metaKey: true }, 0, 3)).toBeNull();
    expect(navTarget({ key: 'ArrowDown', ctrlKey: true }, 0, 3)).toBe(2);
    expect(navTarget({ key: '?', shiftKey: true }, 0, 3)).toBeNull();
    expect(matchKey({ key: '?', shiftKey: true }, 'view')).toBe('shortcuts');
  });

  it('no key of the view / edit / filmstrip scopes fires in a field; the inline and grid keys do (negative)', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, editable);
    expect(typingTarget(input)).toBe(true);
    expect(matchKey({ key: 'e', target: input }, 'view')).toBeNull();
    expect(matchKey({ key: ']', target: input }, 'view')).toBeNull();
    expect(matchKey({ key: 'a', metaKey: true, target: editable }, 'edit')).toBeNull();
    expect(matchKey({ key: 'Delete', target: input }, 'filmstrip')).toBeNull();
    expect(navTarget({ key: 'ArrowRight', target: input }, 0, 3)).toBeNull();
    expect(matchKey({ key: 'b', metaKey: true, target: editable }, 'inline')).toBe('bold');
    expect(matchKey({ key: 'Tab', target: input }, 'grid')).toBe('cell-next');
    // and outside a field the same keys do
    expect(matchKey({ key: 'e', target: document.body }, 'view')).toBe('edit-mode');
    input.remove();
    editable.remove();
  });

  it('every entry is written ⌥⇧⌘ + key, has a known scope, and its action is handled somewhere', () => {
    expect(formatKeys(SHORTCUTS.find((e) => e.action === 'redo'))).toBe('⇧⌘Z');
    expect(formatKeys(SHORTCUTS.find((e) => e.action === 'lock'))).toBe('⇧⌘L');
    expect(formatKeys(SHORTCUTS.find((e) => e.action === 'hide-selection'))).toBe('Del / ⌫');
    const scopes = new Set(SCOPES.map((s) => s.id));
    const dir = join(REPO, 'packages', 'ui', 'src', 'studio');
    const handlers = [
      'Studio.jsx',
      'useEditor.js',
      'lib.js',
      'InlineEditor.jsx',
      'DataPanel.jsx',
      'Filmstrip.jsx',
      'EditLayer.jsx',
    ]
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    for (const e of SHORTCUTS) {
      expect(scopes.has(e.scope)).toBe(true);
      expect(e.label).toBeTruthy();
      // a dead entry (no handler switches on its action) would list a key that does nothing
      expect([e.action, handlers.includes(`'${e.action}'`)]).toEqual([e.action, true]);
    }
  });

  it('docs/STUDIO.md lists every entry of the map (its keyboard table matches keys.js, both ways)', () => {
    const md = readFileSync(join(REPO, 'docs', 'STUDIO.md'), 'utf8');
    const rows = md
      .split('\n')
      .filter((l) => /^\| `/.test(l))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim().replace(/^`|`$/g, '')),
      );
    const doc = rows.map(([keys, label, action]) => `${keys} | ${label} | ${action}`).sort();
    const map = SHORTCUTS.map((e) => `${formatKeys(e)} | ${e.label} | ${e.action}`).sort();
    expect(doc).toEqual(map);
    // the doc carries the generated tables verbatim
    expect(md).toContain(shortcutsMarkdown());
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('snapping polish (edit.js)', () => {
  const box = (x, y, w, h) => ({ x, y, w, h });
  const slideWith = (...frames) => ({
    elements: frames.map((f, i) => ({ id: `e${i}`, type: 'shape', frame: f })),
  });

  it('snaps to the canvas centre and to another element’s centre (both axes)', () => {
    const t = snapTargets({ slide: slideWith(box(1200, 300, 200, 100)) });
    // a 100-wide box whose centre is 3 px off the canvas centre (960)
    const a = snapMove(box(913, 600, 100, 40), t, 6);
    expect(a.frame.x).toBe(910);
    expect(a.guides).toContainEqual({ axis: 'x', v: 960 });
    // its middle 4 px off the element's middle (350)
    const b = snapMove(box(100, 326, 50, 40), t, 6);
    expect(b.frame.y).toBe(330);
    expect(b.guides).toContainEqual({ axis: 'y', v: 350 });
  });

  it('the threshold is SNAP_PX on screen: in canvas px it grows when the canvas is shown smaller', () => {
    expect(snapThreshold(1)).toBe(SNAP_PX);
    expect(snapThreshold(0.5)).toBe(12);
    expect(snapThreshold(2)).toBe(3);
    expect(snapThreshold(0)).toBe(SNAP_PX);
    const t = snapTargets({ slide: slideWith(box(500, 100, 100, 100)) });
    const f = box(510, 400, 100, 100); // 10 canvas px from the element's left edge
    expect(snapMove(f, t, snapThreshold(0.5)).frame.x).toBe(500);
    // negative: at 100 % (6 px) the same 10 px is beyond the threshold - no snap, no guide
    const far = snapMove(f, t, snapThreshold(1));
    expect(far.frame.x).toBe(510);
    expect(far.guides.filter((g) => g.axis === 'x' && g.type !== 'gap')).toEqual([]);
  });

  it('equal spacing between two neighbours: found within the threshold, with two equal gap guides', () => {
    const A = box(100, 300, 100, 100);
    const C = box(600, 280, 100, 100);
    const frames = [A, C];
    // B (100 wide) at 343: the equal position is 350 (gaps of 150)
    const s = spacingSnap(box(343, 320, 100, 50), 'x', frames, 10);
    expect(s).toMatchObject({ delta: 7, pos: 350, gap: 150 });
    // only the spacing targets (no edge lines), to see the spacing snap alone
    const only = { x: [], y: [], frames };
    // not overlapping vertically at y 520: no spacing snap there (negative)
    expect(snapMove(box(343, 520, 100, 50), only, 10).frame.x).toBe(343);
    const m = snapMove(box(343, 320, 100, 50), only, 10);
    expect(m.frame.x).toBe(350);
    expect(m.guides).toEqual([
      { type: 'gap', axis: 'x', from: 200, to: 350, at: 345, label: 150 },
      { type: 'gap', axis: 'x', from: 450, to: 600, at: 345, label: 150 },
    ]);
    // with the edge targets too, the nearer snap wins: the equal gap (7 px) over nothing nearer on x
    const t = snapTargets({ slide: slideWith(A, C) });
    expect(snapMove(box(343, 320, 100, 50), { ...t, frames }, 10).frame.x).toBe(350);
    // negative: beyond the threshold, or with no room between the neighbours
    expect(spacingSnap(box(320, 320, 100, 50), 'x', frames, 10)).toBeNull();
    expect(spacingSnap(box(150, 320, 450, 50), 'x', frames, 100)).toBeNull();
    // and on the y axis
    const ys = spacingSnap(box(0, 445, 50, 100), 'y', [box(0, 0, 50, 100), box(0, 900, 50, 100)], 10);
    expect(ys.pos).toBe(450);
  });

  it('a snap to an element edge carries the distance to it; none when they overlap across the axis', () => {
    const above = box(400, 100, 300, 200); // bottom at 300
    const t = snapTargets({ slide: slideWith(above) });
    const r = snapMove(box(403, 420, 100, 50), t, 6);
    expect(r.frame.x).toBe(400);
    expect(r.guides).toContainEqual({ axis: 'x', v: 400 });
    expect(r.guides).toContainEqual({ type: 'gap', axis: 'y', from: 300, to: 420, at: 400, label: 120 });
    // beside it (overlapping vertically): a line, no distance
    const side = snapMove(box(703, 150, 100, 50), t, 6);
    expect(side.frame.x).toBe(700);
    expect(side.guides.filter((g) => g.type === 'gap')).toEqual([]);
    // a margin at the same place: the element (it has a distance) wins the tie
    const tm = snapTargets({ slide: slideWith(box(138, 100, 300, 200)), geometry: GEOMETRY });
    const tie = snapMove(box(140, 420, 100, 50), tm, 6);
    expect(tie.guides.some((g) => g.type === 'gap' && g.label === 120)).toBe(true);
  });

  it('resizing snaps the dragged edge to the targets of a move (with the distance); Alt (no targets) does not', () => {
    const t = snapTargets({ slide: slideWith(box(600, 100, 200, 50)) });
    const r = resizeFrame(box(100, 400, 300, 100), 'e', 197, 0, { targets: t, threshold: 6 });
    expect(r.frame.w).toBe(500); // the right edge snapped to 600
    expect(r.guides).toContainEqual({ axis: 'x', v: 600 });
    expect(r.guides).toContainEqual({ type: 'gap', axis: 'y', from: 150, to: 400, at: 600, label: 250 });
    // the top edge (n handle) snaps on y: to the element's bottom (150), 200 px beside it
    const n = resizeFrame(box(100, 400, 300, 100), 'n', 0, -248, { targets: t, threshold: 6 });
    expect(n.frame).toEqual({ x: 100, y: 150, w: 300, h: 350 });
    expect(n.guides).toContainEqual({ type: 'gap', axis: 'x', from: 400, to: 600, at: 150, label: 200 });
    // negative: Alt = no targets, the edge goes where the pointer is
    expect(resizeFrame(box(100, 400, 300, 100), 'e', 197, 0).frame.w).toBe(497);
  });

  it('a group move is clamped to the canvas as one box; a multi-resize scales every frame in proportion', () => {
    const b = { x: 40, y: 800, w: 1186, h: 240 };
    expect(clampMove(b, -500, 0)).toEqual({ dx: -40, dy: 0 });
    expect(clampMove(b, 0, 500)).toEqual({ dx: 0, dy: 40 });
    expect(clampMove(b, 30, -20)).toEqual({ dx: 30, dy: -20 });
    expect(clampMove({ x: 10, y: 0, w: 3000, h: 10 }, 50, 0)).toEqual({ dx: -10, dy: 0 });
    const frames = { a: box(100, 100, 100, 100), b: box(300, 200, 100, 100) };
    expect(scaleFrames(frames, box(100, 100, 300, 200), box(100, 100, 600, 400))).toEqual({
      a: box(100, 100, 200, 200),
      b: box(500, 300, 200, 200),
    });
  });
});

describe('selection helpers (edit.js)', () => {
  const slide = {
    elements: [
      { id: 'bg', role: 'background', frame: {} },
      { id: 'a', frame: {} },
      { id: 'b', frame: {}, locked: true },
      { id: 'c', frame: {}, hidden: true },
      { id: 'd', frame: {} },
    ],
  };
  it('⌘A takes the editable elements; a new deck prunes hidden / missing ids; shift-click toggles', () => {
    expect(selectAllIds(slide, null)).toEqual(['a', 'd']);
    expect(pruneSelection(slide, ['a', 'c', 'zz', 'b'])).toEqual(['a', 'b']);
    const sel = ['a', 'b'];
    expect(pruneSelection(slide, sel)).toBe(sel); // unchanged: the same array (no re-render)
    expect(clickSelection(['a', 'b'], 'b', true)).toEqual(['a']);
    expect(clickSelection(['a'], 'd', true)).toEqual(['a', 'd']);
    expect(clickSelection(['a', 'b'], 'b', false)).toEqual(['a', 'b']);
    expect(clickSelection(['a', 'b'], 'd', false)).toEqual(['d']);
  });
});

describe('EditLayer guides (jsdom)', () => {
  it('paints lines, gap segments and their distance labels, counter-scaled', () => {
    render(
      <div style={{ position: 'relative' }}>
        <EditLayer
          slide={{ elements: [] }}
          selected={[]}
          group={null}
          guides={[
            { axis: 'x', v: 400 },
            { type: 'gap', axis: 'y', from: 300, to: 420, at: 400, label: 120 },
            { type: 'gap', axis: 'x', from: 200, to: 350, at: 345, label: 150 },
          ]}
          tip={null}
          scale={0.5}
          canvas={{ width: 1920, height: 1080 }}
          onHandleMouseDown={() => {}}
        />
      </div>,
    );
    expect(screen.getAllByTestId('snap-guide')).toHaveLength(1);
    const gaps = screen.getAllByTestId('snap-gap');
    expect(gaps.map((g) => [g.dataset.axis, g.dataset.from, g.dataset.to])).toEqual([
      ['y', '300', '420'],
      ['x', '200', '350'],
    ]);
    const labels = screen.getAllByTestId('snap-label');
    expect(labels.map((l) => l.textContent)).toEqual(['120', '150']);
    // 11 px on screen at 50 %
    expect(parseFloat(labels[0].style.fontSize)).toBe(22);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Studio P4.4: shortcuts', () => {
  it('? opens the Shortcuts overlay listing every map entry by scope; Esc and a click outside close it', async () => {
    await renderStudio();
    key('?', { shiftKey: true });
    const overlay = await screen.findByTestId('shortcuts-overlay');
    const rows = within(overlay).getAllByTestId('shortcut-row');
    expect(rows).toHaveLength(SHORTCUTS.length);
    expect(rows.map((r) => r.dataset.action)).toEqual(
      SCOPES.flatMap((s) => SHORTCUTS.filter((e) => e.scope === s.id).map((e) => e.action)),
    );
    for (const e of SHORTCUTS) expect(overlay.textContent).toContain(formatKeys(e));
    expect(
      within(overlay)
        .getAllByTestId('shortcuts-scope')
        .map((s) => s.dataset.scope),
    ).toEqual(SCOPES.map((s) => s.id));
    // Esc closes it (and does not reach the Studio: edit mode stays off, nothing else closes)
    key('Escape');
    expect(screen.queryByTestId('shortcuts-overlay')).toBeNull();
    key('?', { shiftKey: true });
    fireEvent.mouseDown(screen.getByTestId('shortcuts-backdrop'));
    expect(screen.queryByTestId('shortcuts-overlay')).toBeNull();
    // a click inside the card keeps it
    key('?', { shiftKey: true });
    fireEvent.mouseDown(screen.getByTestId('shortcuts-overlay'));
    expect(screen.getByTestId('shortcuts-overlay')).toBeTruthy();
  });

  it('[ / ] step slides; no Studio key fires while a field has the focus (negative)', async () => {
    await renderStudio();
    const counter = () => screen.getByTestId('counter').textContent;
    key(']');
    await waitFor(() => expect(counter()).toBe('2 / 3'));
    key('[');
    await waitFor(() => expect(counter()).toBe('1 / 3'));
    await enterEdit();
    click('s1-title');
    const fx = screen.getByLabelText('Frame X');
    fx.focus();
    fireEvent.keyDown(fx, { key: ']' });
    fireEvent.keyDown(fx, { key: 'e' });
    fireEvent.keyDown(fx, { key: 'a', metaKey: true });
    fireEvent.keyDown(fx, { key: 'Delete' });
    expect(counter()).toBe('1 / 3');
    expect(screen.getByTestId('edit-layer')).toBeTruthy();
    expect(outlines()).toEqual(['s1-title']);
    expect(composes()).toHaveLength(1);
  });

  it('⌘A selects every editable element (not hidden, locked or background); Ctrl+A too', async () => {
    useServer({
      mutate: (deck) => {
        deck.slides[0].elements.find((e) => e.id === 's1-logo').hidden = true;
        deck.slides[0].elements.find((e) => e.id === 's1-label').locked = true;
      },
    });
    await renderStudio();
    await enterEdit();
    key('a', { metaKey: true });
    expect(outlines()).toEqual(['s1-title', 's1-subtitle']);
    key('Escape');
    key('a', { ctrlKey: true });
    expect(outlines()).toEqual(['s1-title', 's1-subtitle']);
    // view mode: ⌘A is the browser's (no selection made)
    key('e');
    key('a', { metaKey: true });
    expect(screen.queryByTestId('edit-layer')).toBeNull();
  });

  it('⌘⇧L locks the selection, ⌘⇧H hides it (it leaves the selection); ⌘⇧H with nothing selected shows them', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-subtitle', { shiftKey: true });
    key('L', { metaKey: true, shiftKey: true });
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides.elements).toEqual({
      's1-title': { locked: true },
      's1-subtitle': { locked: true },
    });
    await waitFor(() => expect(screen.getAllByTestId('selection-outline')[0].dataset.locked).toBe('true'));
    // locked: no corner handles (nothing in the selection can move)
    expect(screen.queryAllByTestId('resize-handle')).toHaveLength(0);
    key('H', { metaKey: true, shiftKey: true });
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides.elements).toEqual({
      's1-title': { locked: true, hidden: true },
      's1-subtitle': { locked: true, hidden: true },
    });
    await waitFor(() => expect(outlines()).toEqual([]));
    expect(screen.getAllByTestId('hidden-item')).toHaveLength(2);
    key('h', { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(composes()).toHaveLength(4));
    expect(composes()[3].body.overrides.elements).toEqual({
      's1-title': { locked: true },
      's1-subtitle': { locked: true },
    });
    await waitFor(() => expect(painted('s1-title')).not.toBeNull());
    expect(server.state.history.commands.map((c) => c.label)).toEqual(['locked', 'hidden', 'Show']);
  });
});

describe('Studio P4.4: multi-select edge cases', () => {
  it('Delete hides a multi-selection in one undo step; undo shows them all again', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-label', { shiftKey: true });
    click('s1-logo', { shiftKey: true });
    key('Delete');
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(Object.keys(composes()[1].body.overrides.elements).sort()).toEqual([
      's1-label',
      's1-logo',
      's1-title',
    ]);
    await waitFor(() => expect(server.state.history?.commands).toHaveLength(1));
    await waitFor(() => expect(outlines()).toEqual([]));
    key('z', { metaKey: true });
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides).toEqual({ slides: {} });
    // Backspace with nothing selected does nothing
    key('Backspace');
    expect(composes()).toHaveLength(3);
  });

  it('a mixed drag moves only the unlocked elements; the panel says how many are locked', async () => {
    useServer({
      mutate: (deck) => {
        deck.slides[0].elements.find((e) => e.id === 's1-label').locked = true;
      },
    });
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-label', { shiftKey: true });
    expect(screen.getByTestId('element-locked').textContent).toMatch(/^1 locked/);
    // the box (and its corners) is the unlocked part only: the title
    const sb = screen.getByTestId('selection-box');
    expect([sb.style.left, sb.style.top]).toEqual(['138px', '821.28px']);
    const scale = canvasScale();
    fireEvent.mouseDown(painted('s1-label'), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 40 * scale, clientY: 100, altKey: true });
    fireEvent.mouseUp(window);
    await waitFor(() => expect(composes()).toHaveLength(2));
    const els = composes()[1].body.overrides.elements;
    expect(Object.keys(els)).toEqual(['s1-title']);
    expect(els['s1-title'].frame.x).toBeCloseTo(178, 1);
    await idle();
    // nudge and align leave the locked one too
    key('ArrowDown', { shiftKey: true });
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(Object.keys(composes()[2].body.overrides.elements)).toEqual(['s1-title']);
    await idle();
    // align: the locked label stays out (one movable: aligned to the content frame)
    fireEvent.click(screen.getByRole('button', { name: 'Align left' }));
    await waitFor(() => expect(composes()).toHaveLength(4));
    expect(Object.keys(composes()[3].body.overrides.elements)).toEqual(['s1-title']);
    expect(composes()[3].body.overrides.elements['s1-title'].frame.x).toBe(138);
    expect(screen.getByRole('button', { name: 'Distribute H' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Match width' }).disabled).toBe(true);
  });

  it('a group drag is clamped to the canvas as one box (the frames keep their places to each other)', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-logo'); // x 40
    click('s1-title', { shiftKey: true }); // x 138
    const scale = canvasScale();
    fireEvent.mouseDown(painted('s1-title'), { clientX: 400, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 400 - 500 * scale, clientY: 100, altKey: true });
    fireEvent.mouseUp(window);
    await waitFor(() => expect(composes()).toHaveLength(2));
    const els = composes()[1].body.overrides.elements;
    // the box's left edge stops at 0: the logo at 0, the title still 98 px right of it (not clamped to 0 as well)
    expect(els['s1-logo'].frame.x).toBe(0);
    expect(els['s1-title'].frame.x).toBe(98);
  });

  it('undo of a multi-move restores every frame in one step', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-subtitle', { shiftKey: true });
    const scale = canvasScale();
    fireEvent.mouseDown(painted('s1-title'), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 100 + 60 * scale, clientY: 100 - 30 * scale, altKey: true });
    fireEvent.mouseUp(window);
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(Object.keys(composes()[1].body.overrides.elements).sort()).toEqual(['s1-subtitle', 's1-title']);
    await waitFor(() => expect(server.state.history?.commands).toHaveLength(1));
    expect(server.state.history.commands[0].inverse).toEqual({
      elements: { 's1-title': null, 's1-subtitle': null },
    });
    key('z', { metaKey: true });
    await waitFor(() => expect(composes()).toHaveLength(3));
    expect(composes()[2].body.overrides).toEqual({ slides: {} });
    await waitFor(() => expect(painted('s1-subtitle').style.left).toBe('138px'));
  });

  it('a multi-selection resizes from its corners: every frame scaled, text previewed, one command; no edge handles', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-title'); // 138, 821.28, 1088 × 92
    click('s1-subtitle', { shiftKey: true }); // 138, 937.28, 1088 × 62.72
    const handles = screen.getAllByTestId('resize-handle');
    expect(handles.map((h) => h.dataset.dir)).toEqual(['nw', 'ne', 'se', 'sw']);
    const scale = canvasScale();
    const nw = handles.find((h) => h.dataset.dir === 'nw');
    // the box (138, 821.28, 1088 × 178.72) dragged from its top-left corner (whole screen px: MouseEvent clientX
    // is an integer in jsdom)
    const dx = -48 / scale;
    const dy = -24 / scale;
    fireEvent.mouseDown(nw, { clientX: 500, clientY: 500 });
    fireEvent.mouseMove(window, { clientX: 452, clientY: 476, altKey: true });
    // the live preview: one compose with both frames (text re-fitted), nothing stored
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(Object.keys(composes()[1].body.overrides.elements).sort()).toEqual(['s1-subtitle', 's1-title']);
    fireEvent.mouseUp(window);
    await waitFor(() => expect(server.state.history?.commands).toHaveLength(1));
    const { args } = server.state.history.commands[0];
    const t = args.elements['s1-title'].frame;
    const s = args.elements['s1-subtitle'].frame;
    const sx = (1088 - dx) / 1088;
    const sy = (178.72 - dy) / 178.72;
    expect(t.x).toBeCloseTo(138 + dx, 1);
    expect(t.y).toBeCloseTo(821.28 + dy, 1);
    expect(t.w).toBeCloseTo(1088 * sx, 1);
    expect(t.h).toBeCloseTo(92 * sy, 1);
    expect(s.x).toBeCloseTo(138 + dx, 1);
    expect(s.y).toBeCloseTo(821.28 + dy + 116 * sy, 1);
    expect(s.h).toBeCloseTo(62.72 * sy, 1);
    expect(server.state.history.commands[0].label).toBe('Resize');
  });

  it('Tab with a multi-selection cycles from the last selected; hidden elements are skipped (negative)', async () => {
    useServer({
      mutate: (deck) => {
        deck.slides[0].elements.find((e) => e.id === 's1-label').hidden = true;
      },
    });
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-logo', { shiftKey: true });
    // after the logo (the last selected) comes the label - hidden: skipped - then the title
    key('Tab');
    expect(outlines()).toEqual(['s1-title']);
    key('Tab', { shiftKey: true });
    expect(outlines()).toEqual(['s1-logo']);
    key('Tab', { shiftKey: true });
    expect(outlines()).toEqual(['s1-subtitle']);
  });

  it('the selection survives a re-compose that keeps its ids and loses the ids that went', async () => {
    useServer({
      mutate: (deck, n) => {
        if (n >= 2) deck.slides[0].elements = deck.slides[0].elements.filter((e) => e.id !== 's1-subtitle');
      },
    });
    await renderStudio();
    await enterEdit();
    click('s1-title');
    click('s1-subtitle', { shiftKey: true });
    click('s1-logo', { shiftKey: true });
    // shift-click on a selected element removes it
    click('s1-logo', { shiftKey: true });
    expect(outlines()).toEqual(['s1-title', 's1-subtitle']);
    // a command re-composes: the next deck has no subtitle - the title stays selected, the subtitle goes
    key('ArrowRight');
    await waitFor(() => expect(composes()).toHaveLength(2));
    await waitFor(() => expect(outlines()).toEqual(['s1-title']));
  });

  it('a click on the empty canvas around the slide clears the selection', async () => {
    await renderStudio();
    await enterEdit();
    click('s1-title');
    expect(outlines()).toEqual(['s1-title']);
    fireEvent.mouseDown(screen.getByTestId('canvas'));
    expect(outlines()).toEqual([]);
  });

  it('inside an entered group a shift-click outside it is refused: the selection stays on one level (negative)', async () => {
    useServer({ mutate: (deck) => deck.slides[0].elements.push(JSON.parse(JSON.stringify(GROUP))) });
    await renderStudio();
    await enterEdit();
    const childA = slideBox().querySelector('.slide [data-element-id="s1-g-a"]');
    fireEvent.mouseDown(childA);
    fireEvent.mouseUp(window);
    expect(outlines()).toEqual(['s1-g']);
    fireEvent.doubleClick(childA);
    expect(outlines()).toEqual(['s1-g-a']);
    expect(screen.getByTestId('group-outline')).toBeTruthy();
    // a sibling inside the group: added
    fireEvent.mouseDown(slideBox().querySelector('.slide [data-element-id="s1-g-b"]'), { shiftKey: true });
    expect(outlines()).toEqual(['s1-g-a', 's1-g-b']);
    // an element outside the group: refused (no mix of the group's children and slide elements)
    fireEvent.mouseDown(painted('s1-title'), { shiftKey: true });
    expect(outlines()).toEqual(['s1-g-a', 's1-g-b']);
    expect(screen.getByTestId('group-outline')).toBeTruthy();
    // a plain click outside leaves the group
    click('s1-title');
    expect(outlines()).toEqual(['s1-title']);
    expect(screen.queryByTestId('group-outline')).toBeNull();
  });

  it('a drag near another element shows its snap guide with the distance label', async () => {
    await renderStudio();
    await enterEdit();
    const scale = canvasScale();
    // the subtitle (x 138) dragged right ~544 canvas px: its left edge near the title's centre (682) and its centre
    // near the title's right edge (1226) - the title is the nearer of the two texts that line up there
    const sx = 10 + Math.round(544 * scale);
    fireEvent.mouseDown(painted('s1-subtitle'), { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: sx, clientY: 10 });
    expect(screen.getAllByTestId('snap-guide').length).toBeGreaterThan(0);
    const labels = screen.getAllByTestId('snap-label').map((l) => l.textContent);
    // the subtitle sits 24 px below the title (937.28 - 913.28)
    expect(labels).toEqual(['24']);
    // Alt: no snapping, no guides
    fireEvent.mouseMove(window, { clientX: sx, clientY: 10, altKey: true });
    expect(screen.queryAllByTestId('snap-guide')).toHaveLength(0);
    expect(screen.queryAllByTestId('snap-label')).toHaveLength(0);
    fireEvent.mouseUp(window);
  });
});
