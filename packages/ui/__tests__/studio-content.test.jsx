/** @jest-environment jsdom */
// The Studio's content editing (docs/P4-spec.md §1-§3, §5; P4.2) against a fake server that composes a small deck from
// the content document it is sent (one title per slide, a body of the slide's paragraphs): inline text (the overlay,
// commit -> setField -> PUT content, Esc, the counter), slide duplicate / delete / move with undo, the slide-kind
// picker, the filmstrip drag, the Checks group placement, and "Save as a copy" for a read-only Markdown deck.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Studio from '../src/studio/Studio.jsx';
import { clearLayoutCache } from '../src/studio/LayoutPicker.jsx';
import {
  addSlidePatch,
  allowsParagraphs,
  applyContentPatch,
  contentInverse,
  contentNoop,
  deleteSlidePatch,
  duplicateSlidePatch,
  editedUnits,
  fillEditable,
  moveSlidePatch,
  newSlideId,
  readEditable,
  runsToMarkdown,
  textCounter,
  textEditPatch,
} from '../src/studio/contentEdit.js';
import { groupOf } from '../src/studio/SlideKindPicker.jsx';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json'), 'utf8'));
const TITLE = GOLDEN.slides[0].elements.find((e) => e.id === 's1-title');

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
    geometry: { margins: { top: 80, right: 138, bottom: 80, left: 138 }, titleZone: { y: 80, height: 120 } },
    questions: { blocking: 0, total: 0 },
  },
];
const DOC = {
  schema: 'content/2',
  title: 'Deck',
  slides: [
    { id: 's1', kind: 'cover', title: 'Hello world', blocks: [] },
    {
      id: 's2',
      title: 'Second',
      blocks: [
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'paragraph', text: 'Second **one**' },
      ],
    },
    { id: 's3', title: 'Third', blocks: [] },
  ],
};
const LAYOUTS = [
  { id: 'cover', kind: 'cover', label: 'Cover', tags: ['opening', 'hero'], default: true, boxes: [] },
  { id: 'cards', kind: 'cards', label: 'Cards', tags: ['cards', 'grid'], default: true, boxes: [] },
  {
    id: 'process-cycle',
    kind: 'steps',
    label: 'Cycle',
    tags: ['process', 'shape'],
    default: false,
    boxes: [],
  },
  { id: 'kpi', kind: 'kpi', label: 'Numbers', tags: ['data', 'numbers'], default: true, boxes: [] },
];

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  text: async () => JSON.stringify(body),
});
const plain = (md) => String(md ?? '').replace(/\*\*|\*/g, '');
const runsOf = (md) =>
  String(md)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t }));

/** A text element like the golden title (Sohne 80 / 1.15), at `frame`, one paragraph per text. */
function textEl(id, frame, texts, source, extra = {}) {
  const el = JSON.parse(JSON.stringify(TITLE));
  el.id = id;
  el.frame = frame;
  el.slot = extra.slot ?? 'title';
  el.role = extra.role ?? 'title';
  el.text.paragraphs = texts.map((t) => ({ runs: runsOf(t), spaceAfter: 24 }));
  el.text.lines = texts.map((t, i) => ({
    paragraph: i,
    x: 0,
    y: 78.24 + i * 116,
    width: 300,
    text: plain(t),
    runs: [{ text: plain(t), run: 0, x: 0, width: 300 }],
  }));
  if (source) el.source = source;
  else delete el.source;
  return el;
}

/** The fake compose: a title per slide, the paragraphs as a body, a chart title (role chart) and a generated number. */
function deckFor(content) {
  return {
    ...GOLDEN,
    slides: content.slides.map((s) => {
      const paras = (s.blocks ?? []).map((b, k) => [b, k]).filter(([b]) => b.type === 'paragraph');
      const elements = [
        textEl(`${s.id}-title`, { x: 138, y: 100, w: 1200, h: 92 }, [s.title ?? ''], { path: '/title' }),
      ];
      if (paras.length) {
        const paths = paras.map(([, k]) => `/blocks/${k}/text`);
        elements.push(
          textEl(
            `${s.id}-body`,
            { x: 138, y: 300, w: 1200, h: 400 },
            paras.map(([b]) => b.text),
            paths.length > 1 ? { path: paths[0], paths } : { path: paths[0] },
            { slot: 'body', role: 'body' },
          ),
        );
      }
      elements.push(
        textEl(
          'x',
          { x: 138, y: 800, w: 400, h: 60 },
          ['Quarterly revenue'],
          { path: '/blocks/9/text/title' },
          {
            slot: 'chart',
            role: 'chart',
          },
        ),
        textEl('y', { x: 1400, y: 800, w: 100, h: 60 }, ['1'], null, { slot: 'steps', role: 'group' }),
      );
      elements[elements.length - 2].id = `${s.id}-chart-title`;
      elements[elements.length - 1].id = `${s.id}-steps-0-number`;
      return {
        id: s.id,
        contentSlideId: s.id,
        kind: s.kind ?? 'text',
        layoutId: s.layout ?? 'text',
        surfaceId: 'page',
        background: { type: 'solid', color: '#FFFFFF' },
        elements,
      };
    }),
  };
}
const checksFor = (items) => ({
  kind: 'Report',
  version: '1.0.0',
  summary: {
    checks: 1,
    pass: 0,
    warn: items.length,
    fail: 0,
    skip: 0,
    items: { fail: 0, warn: items.length, info: 0 },
  },
  results: [{ id: 'margins', title: 'Margins', status: items.length ? 'warn' : 'pass', items }],
});
const WARN = {
  severity: 'warn',
  slide: 's1',
  index: 1,
  elementId: 's1-title',
  message: 'outside the margins',
  fix: { command: 'move-inside' },
};

function fakeServer({ readOnlyFirst = false } = {}) {
  const calls = [];
  const state = {
    docs: { deck: JSON.parse(JSON.stringify(DOC)), showcase: JSON.parse(JSON.stringify(DOC)) },
    history: {},
    overrides: {},
    contents: [
      { id: 'deck', title: 'Deck', file: 'content/deck.content.json', source: 'json', readOnly: false },
      {
        id: 'showcase',
        title: 'Showcase',
        file: 'golden/showcase/showcase.md',
        source: 'markdown',
        readOnly: true,
      },
    ],
  };
  if (readOnlyFirst) state.contents.reverse();
  const answer = (contentId) =>
    reply(200, {
      brandId: 'stripe',
      contentId,
      deck: deckFor(state.docs[contentId]),
      checks: checksFor([WARN]),
      warnings: [],
      overrides: state.overrides[contentId] ?? { slides: {} },
      ms: { total: 5 },
    });
  const fetch = jest.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const path = url.split('?')[0];
    if (url === '/api/studio/brands') return reply(200, BRANDS);
    if (url === '/api/studio/contents') return reply(200, state.contents);
    if (url === '/api/studio/compose') {
      if (body.overrides) state.overrides[body.contentId] = body.overrides;
      return answer(body.contentId);
    }
    if (path === '/api/studio/content/import') {
      const content = JSON.parse(JSON.stringify(state.docs[body.from]));
      state.docs[body.id] = content;
      state.history[body.id] = state.history[body.from];
      const entry = {
        id: body.id,
        title: body.title,
        file: `content/${body.id}.content.json`,
        source: 'json',
        readOnly: false,
      };
      state.contents.push(entry);
      return reply(200, { ...entry, content });
    }
    if (path.startsWith('/api/studio/content/')) {
      const id = decodeURIComponent(path.split('/').pop());
      const meta = state.contents.find((c) => c.id === id);
      if (method === 'PUT') {
        if (meta.readOnly) return reply(409, { error: 'read-only' });
        state.docs[id] = body;
        return answer(id);
      }
      return reply(200, { ...state.docs[id], source: meta.source, readOnly: meta.readOnly });
    }
    if (path.startsWith('/api/studio/history/')) {
      const id = path.split('/')[4];
      if (method === 'PUT') {
        state.history[id] = body;
        return reply(200, body);
      }
      return reply(200, state.history[id] ?? { commands: [], cursor: 0 });
    }
    if (path.startsWith('/api/studio/overrides/')) {
      const id = path.split('/')[4];
      if (method === 'PUT') state.overrides[id] = body;
      return reply(200, body ?? { slides: {} });
    }
    if (path.startsWith('/api/studio/layouts')) return reply(200, LAYOUTS);
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

const contentPuts = (id = 'deck') =>
  server.calls.filter((c) => c.method === 'PUT' && c.url.startsWith(`/api/studio/content/${id}`));
const slideBox = () => screen.getByTestId('canvas-slide');
const painted = (id) => slideBox().querySelector(`.slide [data-element-id="${id}"]`);
const thumbs = () => screen.getAllByTestId('film-thumb');
const counter = () => screen.getByTestId('counter').textContent;

async function renderStudio(route = {}, n = 3) {
  render(<Studio route={route} />);
  await waitFor(() => expect(thumbs()).toHaveLength(n));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/content/'))).toBe(true));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/history/'))).toBe(true));
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0));
  });
}
async function enterEdit() {
  fireEvent.keyDown(window, { key: 'e' });
  await screen.findByTestId('edit-layer');
}
/** Replace the overlay's text (one block per paragraph) and fire the input. */
function typeInto(editor, ...paragraphs) {
  fillEditable(
    editor,
    paragraphs.map((t) => ({ runs: [{ text: t }] })),
  );
  fireEvent.input(editor);
}

describe('content commands (pure)', () => {
  it('a content patch replaces / adds / removes slides by id and orders them; its inverse restores', () => {
    const add = addSlidePatch(DOC, 's1', { title: 'New', blocks: [] }, { slides: { s7: {} } });
    expect(add.id).toBe('s8'); // above every id of the content and the overrides
    const next = applyContentPatch(DOC, add.patch);
    expect(next.slides.map((s) => s.id)).toEqual(['s1', 's8', 's2', 's3']);
    const inv = contentInverse(DOC, add.patch);
    expect(inv).toEqual({ slides: { s8: null }, order: ['s1', 's2', 's3'] });
    expect(applyContentPatch(next, inv)).toEqual(DOC);
    const del = deleteSlidePatch(DOC, 's2');
    expect(applyContentPatch(DOC, del).slides.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(applyContentPatch(applyContentPatch(DOC, del), contentInverse(DOC, del))).toEqual(DOC);
    expect(deleteSlidePatch({ slides: [DOC.slides[0]] }, 's1')).toBeNull(); // never the last slide
    const mv = moveSlidePatch(DOC, 's3', 0);
    expect(applyContentPatch(DOC, mv).slides.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
    expect(moveSlidePatch(DOC, 's1', 0)).toBeNull();
    expect(contentNoop(DOC, { order: ['s1', 's2', 's3'] })).toBe(true);
    expect(contentNoop(DOC, { slides: { s1: DOC.slides[0] } })).toBe(true);
    expect(newSlideId(DOC, { elements: { 's12-title': {} } })).toBe('s13');
  });

  it('duplicate copies the slide under a new id with its overrides re-keyed', () => {
    const ov = {
      slides: { s2: { surface: 'navy' } },
      elements: { 's2-title': { locked: true }, 's1-title': {} },
    };
    const r = duplicateSlidePatch(DOC, ov, 's2');
    expect(r.id).toBe('s4');
    expect(r.patch.content.order).toEqual(['s1', 's2', 's4', 's3']);
    expect(r.patch.content.slides.s4).toEqual({ ...DOC.slides[1], id: 's4' });
    expect(r.patch.slides).toEqual({ s4: { surface: 'navy' } });
    expect(r.patch.elements).toEqual({ 's4-title': { locked: true } });
  });

  it('a text edit writes the changed units through the source; paragraph blocks grow and shrink', () => {
    const s2 = { path: '/blocks/0/text', paths: ['/blocks/0/text', '/blocks/1/text'] };
    const same = textEditPatch(
      DOC,
      's2',
      s2,
      ['First paragraph', 'Second **one**'],
      ['First paragraph', 'Second **one**'],
    );
    expect(same).toBeNull();
    const one = textEditPatch(
      DOC,
      's2',
      s2,
      ['First', 'Second **one**'],
      ['First paragraph', 'Second **one**'],
    );
    expect(one.slides.s2.blocks.map((b) => b.text)).toEqual(['First', 'Second **one**']);
    const three = textEditPatch(DOC, 's2', s2, ['a', 'b', 'c'], ['First paragraph', 'Second **one**']);
    expect(three.slides.s2.blocks).toEqual([
      { type: 'paragraph', text: 'a' },
      { type: 'paragraph', text: 'b' },
      { type: 'paragraph', text: 'c' },
    ]);
    // a single field takes extra paragraphs as line breaks; lines become the new array; name, role split on ', '
    expect(textEditPatch(DOC, 's1', { path: '/title' }, ['A', 'B'], ['Hello world']).slides.s1.title).toBe(
      'A\nB',
    );
    const node = {
      schema: 'content/2',
      slides: [{ id: 's1', blocks: [{ type: 'subpoints', items: [{ heading: 'H', lines: ['x', 'y'] }] }] }],
    };
    const lines = {
      path: '/blocks/0/items/0/lines/0',
      paths: ['/blocks/0/items/0/lines/0', '/blocks/0/items/0/lines/1'],
      join: 'line',
    };
    expect(
      textEditPatch(node, 's1', lines, ['x', 'y', 'z'], ['x', 'y']).slides.s1.blocks[0].items[0].lines,
    ).toEqual(['x', 'y', 'z']);
    const q = {
      schema: 'content/2',
      slides: [{ id: 's1', blocks: [{ type: 'quotes', items: [{ text: 't', name: 'Ann', role: 'CEO' }] }] }],
    };
    const attr = {
      path: '/blocks/0/items/0/name',
      paths: ['/blocks/0/items/0/name', '/blocks/0/items/0/role'],
      join: ', ',
    };
    expect(
      textEditPatch(q, 's1', attr, ['Ann Lee, CTO, Acme'], ['Ann, CEO']).slides.s1.blocks[0].items[0],
    ).toEqual({
      text: 't',
      name: 'Ann Lee',
      role: 'CTO, Acme',
    });
    expect(allowsParagraphs({ path: '/title' })).toBe(false);
    expect(allowsParagraphs(s2)).toBe(true);
    expect(allowsParagraphs({ path: '/blocks/0/items/0/body' })).toBe(true);
    expect(allowsParagraphs(attr)).toBe(false);
  });

  it('runs <-> inline Markdown and the editable DOM; the counter against BLOCKS (orange over, red 1.5x)', () => {
    expect(
      runsToMarkdown([
        { text: 'A ' },
        { text: 'bold ', bold: true },
        { text: 'it', italic: true },
        { text: 'x', link: 'https://a.b' },
      ]),
    ).toBe('A **bold** *it*[x](https://a.b)');
    const root = document.createElement('div');
    fillEditable(root, [{ runs: [{ text: 'One\ntwo' }, { text: ' bold', bold: true }] }, { runs: [] }]);
    expect(root.innerHTML).toBe('<div data-p="">One<br>two<b> bold</b></div><div data-p=""><br></div>');
    expect(readEditable(root)).toEqual([
      { runs: [{ text: 'One\ntwo' }, { text: ' bold', bold: true }] },
      { runs: [] },
    ]);
    const slide = DOC.slides[0];
    expect(textCounter(slide, { path: '/title' }, ['x'.repeat(10)])).toEqual({ n: 10, max: 60, level: 'ok' });
    expect(textCounter(slide, { path: '/title' }, ['x'.repeat(61)]).level).toBe('over');
    expect(textCounter(slide, { path: '/title' }, ['x'.repeat(91)]).level).toBe('far');
    expect(textCounter(slide, { path: '/title' }, ['**' + 'x'.repeat(60) + '**']).level).toBe('ok');
    expect(textCounter(slide, { path: '/cta' }, ['x'])).toBeNull();
    expect(groupOf({ tags: ['aside', 'right', 'kpis'], kind: 'kpi' })).toBe('data');
    expect(groupOf({ tags: ['opening', 'hero'], kind: 'cover' })).toBe('cover');
    expect(groupOf({ tags: ['data', 'numbers', 'hero'], kind: 'kpi' })).toBe('data'); // the one-number hero
    expect(groupOf({ tags: ['quote', 'grid', 'cards'] })).toBe('people');
  });
});

describe('inline text', () => {
  it("double-click opens the overlay in the element's font; the counter shows the field's range", async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.doubleClick(painted('s1-title'));
    const editor = await screen.findByTestId('inline-editor');
    expect(editor.dataset.element).toBe('s1-title');
    expect(editor.style.fontFamily).toContain('"Sohne"');
    expect(editor.style.fontSize).toBe('80px');
    expect(editor.style.fontWeight).toBe('300');
    expect(editor.style.lineHeight).toBe('1.15');
    expect(editor.style.letterSpacing).toBe('-0.02em');
    expect(editor.style.left).toBe('138px');
    expect(editor.style.top).toBe('100px');
    expect(editor.style.width).toBe('1200px');
    // the first baseline where the fitter put it: no padding for this face (half-leading model)
    expect(parseFloat(editor.style.paddingTop)).toBeCloseTo(0, 2);
    expect(editor.textContent).toBe('Hello world');
    expect(screen.getByTestId('inline-count').textContent).toBe('11 / 60');
    expect(screen.getByTestId('inline-counter').dataset.level).toBe('ok');
    // the painted lines step aside while editing
    expect(document.querySelector('style').textContent).toBeTruthy();
  });

  it('commit (⌘Enter) sends setField: the log, then one PUT of the content; the re-composed deck is painted; undo', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.mouseDown(painted('s1-title'));
    fireEvent.mouseUp(window);
    fireEvent.keyDown(window, { key: 'Enter' }); // Enter with one text selected opens it too
    const editor = await screen.findByTestId('inline-editor');
    typeInto(editor, 'A new title');
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect(screen.queryByTestId('inline-editor')).toBeNull();
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    expect(contentPuts()[0].url).toBe('/api/studio/content/deck?brandId=stripe');
    expect(contentPuts()[0].body.slides[0].title).toBe('A new title');
    expect(contentPuts()[0].body.source).toBeUndefined();
    const h = server.state.history.deck;
    expect(h.commands[0]).toMatchObject({
      type: 'setField',
      slideId: 's1',
      args: { content: { slides: { s1: { title: 'A new title' } } } },
      inverse: { content: { slides: { s1: { title: 'Hello world' } } } },
    });
    await waitFor(() => expect(painted('s1-title').textContent).toBe('A new title'));
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('Saved'));
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(contentPuts()).toHaveLength(2));
    expect(contentPuts()[1].body.slides[0].title).toBe('Hello world');
    await waitFor(() => expect(server.state.history.deck.cursor).toBe(0));
  });

  it('Esc cancels (nothing sent); blur commits', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.doubleClick(painted('s1-title'));
    let editor = await screen.findByTestId('inline-editor');
    typeInto(editor, 'Changed');
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByTestId('inline-editor')).toBeNull();
    // Escape stayed in the overlay: edit mode is still on
    expect(screen.getByTestId('edit-layer')).toBeTruthy();
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 500));
    });
    expect(contentPuts()).toHaveLength(0);
    expect(painted('s1-title').textContent).toBe('Hello world');
    fireEvent.doubleClick(painted('s1-title'));
    editor = await screen.findByTestId('inline-editor');
    typeInto(editor, 'Blurred');
    fireEvent.blur(editor);
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    expect(contentPuts()[0].body.slides[0].title).toBe('Blurred');
  });

  it('the counter turns orange over the range and red over 1.5x; Enter is refused in a title, Shift+Enter breaks the line', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.doubleClick(painted('s1-title'));
    const editor = await screen.findByTestId('inline-editor');
    typeInto(editor, 'x'.repeat(70));
    expect(screen.getByTestId('inline-counter').dataset.level).toBe('over');
    expect(screen.getByTestId('inline-counter').style.color).toBe('rgb(217, 119, 6)');
    typeInto(editor, 'x'.repeat(100));
    expect(screen.getByTestId('inline-counter').dataset.level).toBe('far');
    expect(screen.getByTestId('inline-counter').style.color).toBe('rgb(220, 38, 38)');
    typeInto(editor, 'Hello');
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor.firstChild);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(editor.childNodes).toHaveLength(1);
    expect(screen.getByTestId('inline-counter').textContent).toMatch(/takes one paragraph/);
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
    expect(editor.querySelectorAll('br').length).toBeGreaterThan(0);
    // the caret sits on the new (empty) line; a trailing line break is not written to the content
    expect(readEditable(editor)).toEqual([{ runs: [{ text: 'Hello\n' }] }]);
    expect(editedUnits(readEditable(editor), { path: '/title' })).toEqual(['Hello']);
  });

  it('Enter in a body starts a paragraph: the commit is setParagraphs with one more paragraph block', async () => {
    await renderStudio({ slide: 2 });
    await enterEdit();
    fireEvent.doubleClick(painted('s2-body'));
    const editor = await screen.findByTestId('inline-editor');
    expect(editor.childNodes).toHaveLength(2);
    expect(editor.childNodes[1].innerHTML).toBe('Second <b>one</b>');
    const range = document.createRange();
    range.setStart(editor.firstChild.firstChild, 5); // "First| paragraph"
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(editor.childNodes).toHaveLength(3);
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    expect(contentPuts()[0].body.slides[1].blocks).toEqual([
      { type: 'paragraph', text: 'First' },
      { type: 'paragraph', text: ' paragraph' },
      { type: 'paragraph', text: 'Second **one**' },
    ]);
    expect(server.state.history.deck.commands[0].type).toBe('setParagraphs');
  });

  it('chart text with a source is inline (P4.3); generated text is not: a tip says why', async () => {
    await renderStudio();
    await enterEdit();
    fireEvent.doubleClick(painted('s1-chart-title'));
    expect(screen.getByTestId('inline-editor').getAttribute('data-element')).toBe('s1-chart-title');
    fireEvent.keyDown(screen.getByTestId('inline-editor'), { key: 'Escape' });
    expect(screen.queryByTestId('inline-editor')).toBeNull();
    fireEvent.doubleClick(painted('s1-steps-0-number'));
    expect(screen.getByTestId('inline-tip').textContent).toMatch(/made by the layout/);
    expect(screen.queryByTestId('inline-editor')).toBeNull();
  });
});

describe('slides', () => {
  it('⌘D duplicates the slide (shown), Delete deletes it, ⌘↓ moves it; each is undone by ⌘Z', async () => {
    await renderStudio();
    const strip = screen.getByTestId('filmstrip');
    fireEvent.keyDown(thumbs()[0], { key: 'd', metaKey: true });
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    expect(contentPuts()[0].body.slides.map((s) => s.id)).toEqual(['s1', 's4', 's2', 's3']);
    expect(contentPuts()[0].body.slides[1]).toEqual({ ...DOC.slides[0], id: 's4' });
    await waitFor(() => expect(thumbs()).toHaveLength(4));
    await waitFor(() => expect(counter()).toBe('2 / 4')); // the copy is shown
    fireEvent.keyDown(strip, { key: 'Delete' });
    await waitFor(() => expect(contentPuts()).toHaveLength(2));
    expect(contentPuts()[1].body.slides.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    await waitFor(() => expect(thumbs()).toHaveLength(3));
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(contentPuts()).toHaveLength(3));
    expect(contentPuts()[2].body.slides.map((s) => s.id)).toEqual(['s1', 's4', 's2', 's3']);
    await waitFor(() => expect(counter()).toBe('2 / 4')); // the undone slide is shown again
    fireEvent.keyDown(strip, { key: 'ArrowDown', metaKey: true });
    await waitFor(() => expect(contentPuts()).toHaveLength(4));
    expect(contentPuts()[3].body.slides.map((s) => s.id)).toEqual(['s1', 's2', 's4', 's3']);
    await waitFor(() => expect(counter()).toBe('3 / 4'));
    const types = server.state.history.deck.commands.map((c) => c.type);
    expect(types).toEqual(['duplicateSlide', 'moveSlide']); // the undone delete was dropped from the log
  });

  it('the right-click menu: duplicate, delete, hide (an override)', async () => {
    await renderStudio();
    fireEvent.contextMenu(thumbs()[2]);
    const menu = screen.getByTestId('film-menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Add slide after…', 'Duplicate⌘D', 'Delete⌫', 'Hide']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Hide/ }));
    await waitFor(() => expect(server.state.overrides.deck).toEqual({ slides: { s3: { hidden: true } } }));
    await waitFor(() => expect(thumbs()[2].dataset.hidden).toBe('true'));
    fireEvent.contextMenu(thumbs()[2]);
    fireEvent.click(within(screen.getByTestId('film-menu')).getByRole('menuitem', { name: /Delete/ }));
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    expect(contentPuts()[0].body.slides.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('New slide opens the picker grouped by the catalogue tags; a pick inserts the skeleton with placeholder copy', async () => {
    await renderStudio();
    fireEvent.click(screen.getByTestId('film-new'));
    const picker = await screen.findByTestId('kind-picker');
    await waitFor(() => expect(within(picker).getAllByTestId('kind-option')).toHaveLength(4));
    expect(
      within(picker)
        .getAllByTestId('kind-group')
        .map((g) => g.dataset.group),
    ).toEqual(['cover', 'lists', 'process', 'data']);
    const cycle = within(picker)
      .getAllByTestId('kind-option')
      .find((o) => o.dataset.layout === 'process-cycle');
    expect(within(cycle).getByTestId('kind-blocks').textContent).toBe('process');
    fireEvent.click(cycle);
    expect(screen.queryByTestId('kind-picker')).toBeNull();
    await waitFor(() => expect(contentPuts()).toHaveLength(1));
    const slides = contentPuts()[0].body.slides;
    expect(slides.map((s) => s.id)).toEqual(['s1', 's4', 's2', 's3']);
    expect(slides[1]).toMatchObject({
      id: 's4',
      kind: 'steps',
      layout: 'process-cycle',
      title: 'Slide title',
      blocks: [{ type: 'process', shape: 'cycle' }],
    });
    expect(slides[1].blocks[0].items[0]).toEqual({ heading: 'Step', body: 'Add a short description' });
    expect(server.state.history.deck.commands[0]).toMatchObject({ type: 'addSlide', slideId: 's4' });
    await waitFor(() => expect(counter()).toBe('2 / 4'));
    // the + between rows opens it after that row
    fireEvent.click(screen.getAllByTestId('film-add-after')[2]);
    expect(
      within(await screen.findByTestId('kind-picker')).getByText('New slide after slide 3'),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('kind-picker')).toBeNull();
  });

  it('a filmstrip drag shifts the rows and the drop moves the slide', async () => {
    await renderStudio();
    const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rectOf() {
      const i = Number(this.dataset?.index ?? 0);
      return {
        top: i * 100,
        height: 100,
        left: 0,
        width: 180,
        bottom: i * 100 + 100,
        right: 180,
        x: 0,
        y: i * 100,
      };
    });
    try {
      fireEvent.mouseDown(thumbs()[2], { button: 0, clientY: 250 });
      fireEvent.mouseMove(window, { clientY: 240 });
      fireEvent.mouseMove(window, { clientY: 40 });
      const rows = screen.getAllByTestId('film-row');
      expect(rows[2].style.transform).toBe('translateY(-210px)');
      expect(rows[0].style.transform).toBe('translateY(100px)');
      expect(rows[1].style.transform).toBe('translateY(100px)');
      fireEvent.mouseUp(window);
      await waitFor(() => expect(contentPuts()).toHaveLength(1));
      expect(contentPuts()[0].body.slides.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
      await waitFor(() => expect(counter()).toBe('1 / 3'));
    } finally {
      rect.mockRestore();
    }
  });
});

describe('panel and read-only decks', () => {
  it('the Checks group sits above the Slide group when the slide has warn items; the caption badge opens it; the layout picker is collapsed', async () => {
    await renderStudio();
    const panel = screen.getByRole('complementary', { name: 'Brand panel' });
    const groups = [...panel.querySelectorAll('[data-testid="checks-group"], [data-testid="slide-group"]')];
    expect(groups.map((g) => g.dataset.testid)).toEqual(['checks-group', 'slide-group']);
    expect(screen.getByTestId('checks-group').dataset.placement).toBe('top');
    expect(screen.getByTestId('checks-count').textContent).toBe('(1)');
    expect(screen.queryByTestId('layout-picker')).toBeNull();
    expect(screen.getByTestId('layout-toggle').textContent).toMatch(/Layout: text/);
    const badge = screen.getByTestId('caption-findings');
    expect(badge.textContent).toBe('1 finding');
    fireEvent.click(badge);
    expect(screen.getByRole('button', { name: /Checks/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('fix-button')).toBeTruthy();
    // slide 2 has no finding: Checks below the Slide group, no badge
    fireEvent.click(thumbs()[1]);
    await waitFor(() => expect(screen.getByTestId('checks-group').dataset.placement).toBe('bottom'));
    const after = [...panel.querySelectorAll('[data-testid="checks-group"], [data-testid="slide-group"]')];
    expect(after.map((g) => g.dataset.testid)).toEqual(['slide-group', 'checks-group']);
    expect(screen.queryByTestId('caption-findings')).toBeNull();
    fireEvent.click(screen.getByTestId('layout-toggle'));
    await screen.findByTestId('layout-picker');
  });

  it('an edit on a read-only Markdown deck asks for a copy; the copy is made, switched to, and the edit made there', async () => {
    server = fakeServer({ readOnlyFirst: true });
    global.fetch = server.fetch;
    await renderStudio();
    expect(screen.getByTestId('content-readonly').textContent).toBe('read-only');
    await enterEdit();
    fireEvent.doubleClick(painted('s1-title'));
    const editor = await screen.findByTestId('inline-editor');
    typeInto(editor, 'Edited on a copy');
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    const dialog = await screen.findByTestId('copy-dialog');
    expect(contentPuts('showcase')).toHaveLength(0);
    const name = within(dialog).getByLabelText(/Name/);
    expect(name.value).toBe('showcase-copy');
    fireEvent.change(name, { target: { value: 'Bad name' } });
    expect(within(dialog).getByRole('button', { name: 'Save copy' }).disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'review-copy' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save copy' }));
    await waitFor(() => expect(contentPuts('review-copy')).toHaveLength(1));
    const imp = server.calls.find((c) => c.url === '/api/studio/content/import');
    expect(imp.body).toEqual({ from: 'showcase', id: 'review-copy', title: 'review-copy' });
    expect(contentPuts('review-copy')[0].body.slides[0].title).toBe('Edited on a copy');
    expect(screen.queryByTestId('copy-dialog')).toBeNull();
    await waitFor(() => expect(window.location.hash).toBe('#/studio/stripe/review-copy/1'));
    await waitFor(() => expect(painted('s1-title').textContent).toBe('Edited on a copy'));
    expect(screen.queryByTestId('content-readonly')).toBeNull();
    expect(server.state.history['review-copy'].commands.at(-1)).toMatchObject({
      type: 'setField',
      slideId: 's1',
    });
  });
});
