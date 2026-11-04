/** @jest-environment jsdom */
// The Studio's P4.3 editing (docs/P4-spec.md §2, §3) against a fake server that answers with the stripe golden deck's
// slides for the content slides it is sent (the showcase's items, chart, table, compare and image collage slides,
// whose elements carry their `source`): image replace (upload, then setField), the focal point drag, the chart Data
// grid, a table cell inline (Tab to the next cell) and a row added, flow nodes added / removed / reordered (buttons and
// the drag handle) and undone, and the font-pair switch (a fixture brand with a pair; a brand with one pair says so).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Studio from '../src/studio/Studio.jsx';
import { clearLayoutCache } from '../src/studio/LayoutPicker.jsx';
import {
  addNodePatch,
  cellAsType,
  cellElement,
  chartEdit,
  flowNodeOf,
  focalFromFrame,
  frameFromFocal,
  imageTarget,
  moveNodePatch,
  nextCell,
  removeNodePatch,
  shownCrop,
  tableEdit,
} from '../src/studio/dataEdit.js';
import { applyPatch, inversePatch, isNoop } from '../src/studio/edit.js';
import { validateContent } from '../../engine/src/validate.js';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json'), 'utf8'));
// the showcase's slides 9, 16, 22, 23 and 33 as a content/2 document, placeholders kept (fixtures/, made from
// golden/showcase/showcase.md: the jsdom environment cannot load the Markdown reader's YAML parser)
const DOC = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'showcase-p43.content.json'), 'utf8'));
const IDS = DOC.slides.map((s) => s.id);
const goldenSlide = (id) => GOLDEN.slides.find((s) => s.id === id);

const brand = (extra = {}) => ({
  id: 'stripe',
  name: 'Stripe',
  ok: true,
  logo: null,
  colours: ['#533AFD'],
  accent: '#533AFD',
  surfaces: [{ id: 'page', bg: '#FFFFFF', text: '#061B31', heading: '#061B31', accent: '#533AFD' }],
  rhythm: ['page'],
  fonts: { heading: 'Sohne', body: 'Sohne' },
  fontPairs: [],
  geometry: { margins: { top: 80, right: 138, bottom: 80, left: 138 }, titleZone: { y: 80, height: 120 } },
  questions: { blocking: 0, total: 0 },
  ...extra,
});

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  text: async () => JSON.stringify(body),
});
const deckFor = (content) => ({
  ...GOLDEN,
  slides: content.slides.map(
    (s) => goldenSlide(s.id) ?? { ...goldenSlide('s9'), id: s.id, contentSlideId: s.id },
  ),
});

function fakeServer({ brands = [brand()] } = {}) {
  const calls = [];
  const state = { doc: JSON.parse(JSON.stringify(DOC)), history: { commands: [], cursor: 0 }, overrides: {} };
  const answer = () =>
    reply(200, {
      brandId: 'stripe',
      contentId: 'deck',
      deck: deckFor(state.doc),
      checks: null,
      warnings: [],
      overrides: state.overrides,
      ms: { total: 5 },
    });
  const fetch = jest.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const path = url.split('?')[0];
    if (url === '/api/studio/brands') return reply(200, brands);
    if (url === '/api/studio/contents')
      return reply(200, [
        { id: 'deck', title: 'Deck', file: 'content/deck.content.json', source: 'json', readOnly: false },
      ]);
    if (url === '/api/studio/compose') {
      state.overrides = body.overrides ?? state.overrides;
      return answer();
    }
    if (path.startsWith('/api/studio/assets/')) {
      return reply(200, {
        file: `content/assets/deck/abc123-${body.name.toLowerCase()}`,
        width: 400,
        height: 300,
        size: 100,
        mime: 'image/png',
      });
    }
    if (path.startsWith('/api/studio/content/')) {
      if (method === 'PUT') {
        expect(validateContent(body)).toEqual([]); // every edit keeps the document valid
        state.doc = body;
        return answer();
      }
      return reply(200, { ...state.doc, source: 'json', readOnly: false });
    }
    if (path.startsWith('/api/studio/history/')) {
      if (method === 'PUT') state.history = body;
      return reply(200, state.history);
    }
    if (path.startsWith('/api/studio/overrides/')) {
      if (method === 'PUT') state.overrides = body;
      return reply(200, state.overrides);
    }
    if (path.startsWith('/api/studio/layouts')) return reply(200, []);
    return reply(404, { error: 'not found' });
  });
  return { fetch, calls, state };
}

let server;
const setup = (opts) => {
  server = fakeServer(opts);
  global.fetch = server.fetch;
};
beforeEach(() => {
  setup();
  window.history.replaceState(null, '', '#/');
  clearLayoutCache();
});
afterEach(async () => {
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0));
  });
  delete global.fetch;
});

const contentPuts = () =>
  server.calls.filter((c) => c.method === 'PUT' && c.url.startsWith('/api/studio/content/'));
const lastDoc = () => contentPuts().at(-1)?.body;
const slideOf = (doc, id) => doc.slides.find((s) => s.id === id);
const painted = (id) => screen.getByTestId('canvas-slide').querySelector(`.slide [data-element-id="${id}"]`);
const scale = () => Number(/(\d+)%/.exec(screen.getByTestId('canvas-caption').textContent)[1]) / 100;
const flush = () =>
  act(async () => {
    await new Promise((ok) => setTimeout(ok, 450));
  });

/** ⌘Z `n` times, each waiting for the log's cursor to step back (the server has the state undone). */
async function undo(n) {
  for (let i = 0; i < n; i += 1) {
    const at = server.state.history.cursor;
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(server.state.history.cursor).toBe(at - 1));
    await flush();
  }
}

async function renderStudio(slide = 1) {
  render(<Studio route={{ slide }} />);
  await waitFor(() => expect(screen.getAllByTestId('film-thumb')).toHaveLength(IDS.length));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/content/'))).toBe(true));
  await waitFor(() => expect(server.calls.some((c) => c.url.startsWith('/api/studio/history/'))).toBe(true));
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0));
  });
  fireEvent.keyDown(window, { key: 'e' });
  await screen.findByTestId('edit-layer');
}
/** A click on a painted element (pointer down, then up: no drag). */
const select = (id) => {
  fireEvent.mouseDown(painted(id), { button: 0 });
  fireEvent.mouseUp(window, { button: 0 });
};

describe('data commands (pure)', () => {
  const s16 = slideOf(DOC, 's16');
  const chart = s16.blocks[0];

  it('chart edits keep the grid square and the highlight on its category / series', () => {
    const v = chartEdit(chart, { kind: 'value', row: 0, series: 0, value: 9 });
    expect(v.series[0].values).toEqual([9, 5.6, 6, 6.5]);
    expect(chartEdit(chart, { kind: 'value', row: 0, series: 0, value: 'x' })).toBe(chart); // not a number
    const add = chartEdit(chart, { kind: 'addRow', at: 0 });
    expect(add.categories).toEqual(['Category', 'Q1', 'Q2', 'Q3', 'Q4']);
    expect(add.series[0].values).toEqual([0, 5.1, 5.6, 6, 6.5]);
    expect(add.highlight).toBe(4); // the highlighted category moved with the insert
    const rm = chartEdit(chart, { kind: 'removeRow', row: 3 });
    expect(rm.highlight).toBeUndefined(); // the highlighted category removed
    const two = chartEdit(chart, { kind: 'addSeries' });
    expect(two.series.map((s) => s.values.length)).toEqual([4, 4]);
    expect(two.highlight).toBeUndefined(); // a category highlight would now name a series
    expect(chartEdit(two, { kind: 'removeSeries', series: 1 }).series).toHaveLength(1);
    expect(chartEdit(chart, { kind: 'removeSeries', series: 0 })).toBe(chart); // the last series stays
    expect(chartEdit(chart, { kind: 'text', key: 'title', value: '' }).text.title).toBeUndefined();
    expect(chartEdit(chart, { kind: 'key', key: 'chartType', value: 'pie' }).chartType).toBe('pie');
    expect(chartEdit(chart, { kind: 'key', key: 'chartType', value: 'blob' })).toBe(chart);
  });

  it('table edits: cells by type, rows / columns within 1–8, the highlight column follows', () => {
    const table = slideOf(DOC, 's22').blocks[0];
    expect(tableEdit(table, { kind: 'cellText', row: 0, col: 1, value: 'no' }).rows[0][1]).toEqual({
      type: 'check',
      value: false,
    });
    expect(
      tableEdit({ ...table, rows: [[true]] }, { kind: 'cellText', row: 0, col: 0, value: 'x' }).rows[0][0],
    ).toBe(true);
    expect(tableEdit(table, { kind: 'cellText', row: 4, col: 1, value: '3' }).rows[4][1]).toEqual({
      type: 'rating',
      value: 3,
    });
    const col = tableEdit(table, { kind: 'addColumn', at: 1 });
    expect(col.header).toEqual(['Feature', 'Column heading', 'Starter', 'Growth', 'Enterprise']);
    expect(col.highlightColumn).toBe(3);
    expect(tableEdit(table, { kind: 'removeColumn', col: 2 }).highlightColumn).toBeUndefined();
    expect(tableEdit(table, { kind: 'addRow' }).rows).toHaveLength(6);
    expect(cellAsType('Plain', 'chip')).toEqual({ type: 'chip', text: 'Plain' });
    expect(cellAsType(true, 'text')).toBe('✓');
    expect(cellAsType('4', 'rating')).toEqual({ type: 'rating', value: 4 });
    expect(cellAsType('x', 'image')).toBeNull(); // an image cell needs a file
    expect(cellAsType('Logo', 'logo', { src: 'a.svg' })).toEqual({ type: 'logo', src: 'a.svg', alt: 'Logo' });
    const tableEl = goldenSlide('s22').elements.find((e) => e.type === 'table');
    expect(cellElement(tableEl, 1, 0).source).toEqual({ path: '/blocks/0/rows/0/0' });
    expect(cellElement(tableEl, 0, 2).source).toEqual({ path: '/blocks/0/header/2' });
    expect(nextCell(tableEl, 1, 3, 'next')).toEqual({ r: 2, c: 0 });
    expect(nextCell(tableEl, 1, 0, 'prev')).toEqual({ r: 0, c: 3 });
    expect(nextCell(tableEl, 5, 0, 'down')).toBeNull();
  });

  it('flow nodes: add / remove / move within the block range keep the content valid', () => {
    const el = goldenSlide('s9').elements.find((e) => e.id === 's9-cards-1-title');
    const info = flowNodeOf(el, slideOf(DOC, 's9'));
    expect(info).toMatchObject({
      blockPath: '/blocks/0',
      container: 'items',
      k: 1,
      count: 3,
      min: 2,
      max: 10,
    });
    const added = addNodePatch(DOC, 's9', info, 'after');
    expect(added.k).toBe(2);
    const items = added.patch.slides.s9.blocks[0].items;
    expect(items).toHaveLength(4);
    expect(items[2]).toEqual({ heading: 'Heading', body: 'Add a short description' });
    expect(validateContent({ ...DOC, slides: [added.patch.slides.s9] })).toEqual([]);
    const removed = removeNodePatch(DOC, 's9', info);
    expect(removed.slides.s9.blocks[0].items).toHaveLength(2);
    expect(removeNodePatch(DOC, 's9', { ...info, count: 2 })).toBeNull(); // the range's minimum (negative)
    expect(addNodePatch(DOC, 's9', { ...info, count: 10 }, 'after')).toBeNull(); // its maximum (negative)
    const moved = moveNodePatch(DOC, 's9', info, 0);
    expect(moved.slides.s9.blocks[0].items.map((x) => x.heading)).toEqual([
      'Spend under control',
      'A faster month-end close',
      'One view of the business',
    ]);
    // compare columns are the nodes of a compare block
    const img = goldenSlide('s23').elements.find((e) => e.id === 's23-compare-1-image');
    expect(flowNodeOf(img, slideOf(DOC, 's23'))).toMatchObject({
      container: 'columns',
      k: 1,
      min: 2,
      max: 4,
    });
  });

  it('images: the file field, alt / caption / focal for an image block; focal <-> frame through the crop', () => {
    const s33 = goldenSlide('s33').elements.find((e) => e.id === 's33-image-1');
    expect(imageTarget(s33, slideOf(DOC, 's33'))).toMatchObject({
      srcPath: '/blocks/0/items/1/src',
      nodePath: '/blocks/0/items/1',
      canFocal: true,
      canAlt: true,
    });
    const col = goldenSlide('s23').elements.find((e) => e.id === 's23-compare-0-image');
    expect(imageTarget(col, slideOf(DOC, 's23'))).toMatchObject({
      srcPath: '/blocks/0/columns/0/image',
      canAlt: false,
      canFocal: true,
      focalIn: 'override', // the content has no focal field for a compare column's image
    });
    const crop = { x: 0.25, y: 0, w: 0.5, h: 1 };
    expect(focalFromFrame(0.5, 0.5, crop)).toEqual({ x: 0.5, y: 0.5 });
    expect(focalFromFrame(1, 0, crop)).toEqual({ x: 0.75, y: 0 });
    expect(frameFromFocal({ x: 0.75, y: 0 }, crop)).toEqual({ x: 1, y: 0 });
    // no crop: a cover frame shows the centred part of the image (the renderer's object-fit), from the asset's size
    const frame = { x: 0, y: 0, w: 100, h: 100 };
    expect(shownCrop({ frame, image: { fit: 'cover' } }, { width: 400, height: 200 })).toEqual({
      x: 0.25,
      y: 0,
      w: 0.5,
      h: 1,
    });
    expect(shownCrop({ frame, image: { fit: 'contain' } }, { width: 400, height: 200 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    expect(shownCrop({ frame, image: { crop } }, null)).toBe(crop);
  });

  it('a font pair patch is undoable like any overrides patch', () => {
    const ov = { slides: {} };
    const p = { fontPair: 'serif' };
    expect(applyPatch(ov, p)).toEqual({ slides: {}, fontPair: 'serif' });
    expect(inversePatch(ov, p)).toEqual({ fontPair: null });
    expect(applyPatch({ slides: {}, fontPair: 'serif' }, { fontPair: null })).toEqual({ slides: {} });
    expect(isNoop({ slides: {}, fontPair: 'serif' }, p)).toBe(true);
    expect(isNoop(ov, p)).toBe(false);
  });
});

describe('images', () => {
  it('Replace uploads the file, then sets the src (one setField); alt and fit are commands too', async () => {
    await renderStudio(5);
    select('s33-image-1');
    const section = await screen.findByTestId('image-section');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'New.png', { type: 'image/png' });
    fireEvent.change(within(section).getByTestId('image-file'), { target: { files: [file] } });
    await waitFor(() => expect(contentPuts().length).toBe(1));
    const upload = server.calls.find((c) => c.url === '/api/studio/assets/deck');
    expect(upload.method).toBe('POST');
    expect(upload.body.name).toBe('New.png');
    expect(upload.body.data).toMatch(/^data:image\/png;base64,/);
    expect(server.calls.indexOf(upload)).toBeLessThan(server.calls.indexOf(contentPuts()[0]));
    expect(slideOf(lastDoc(), 's33').blocks[0].items[1].src).toBe('content/assets/deck/abc123-new.png');
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'setField', label: 'Replace image' });
    // alt text
    const alt = screen.getByTestId('image-alt');
    fireEvent.change(alt, { target: { value: 'Team at work' } });
    fireEvent.blur(alt);
    await flush();
    expect(slideOf(lastDoc(), 's33').blocks[0].items[1].alt).toBe('Team at work');
    // fit: an element override
    fireEvent.change(screen.getByLabelText('Image fit'), { target: { value: 'contain' } });
    await waitFor(() => expect(server.calls.at(-1)?.url).toMatch(/history|overrides|compose/));
    await waitFor(() => expect(server.state.overrides.elements?.['s33-image-1']).toEqual({ fit: 'contain' }));
    // undo all three: the src is back
    await undo(3);
    expect(server.state.overrides.elements?.['s33-image-1']).toBeUndefined();
    expect(slideOf(lastDoc(), 's33').blocks[0].items[1]).toEqual(slideOf(DOC, 's33').blocks[0].items[1]);
  });

  it('the focal point: drag the crosshair inside the frame -> focal {x, y} on the image item', async () => {
    await renderStudio(5);
    select('s33-image-0');
    fireEvent.click(await screen.findByRole('button', { name: 'Set focal point' }));
    const layer = await screen.findByTestId('focal-layer');
    const el = goldenSlide('s33').elements.find((e) => e.id === 's33-image-0');
    const k = scale();
    // jsdom lays nothing out: the layer's box starts at 0, so the point is (client / (frame × scale))
    fireEvent.mouseDown(layer, { button: 0, clientX: el.frame.w * k * 0.25, clientY: el.frame.h * k * 0.75 });
    fireEvent.mouseMove(window, { clientX: el.frame.w * k * 0.3, clientY: el.frame.h * k * 0.7 });
    fireEvent.mouseUp(window, { clientX: el.frame.w * k * 0.2, clientY: el.frame.h * k * 0.6 });
    await flush();
    const focal = slideOf(lastDoc(), 's33').blocks[0].items[0].focal;
    const crop = shownCrop(el, GOLDEN.assets[el.image.asset]); // what the frame shows of the image
    // (the caption's scale is rounded to a percent: one decimal)
    expect(focal.x).toBeCloseTo(crop.x + 0.2 * crop.w, 1);
    expect(focal.y).toBeCloseTo(crop.y + 0.6 * crop.h, 1);
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'setField', label: 'Focal point' });
    expect(screen.getByTestId('focal-value').textContent).toMatch(/x 0\.2/);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('focal-layer')).toBeNull());
  });

  it("a compare column's image: its focal point is an element override (the content has no field for it)", async () => {
    await renderStudio(4);
    select('s23-compare-1-image');
    fireEvent.click(await screen.findByRole('button', { name: 'Set focal point' }));
    const layer = await screen.findByTestId('focal-layer');
    const el = goldenSlide('s23').elements.find((e) => e.id === 's23-compare-1-image');
    const k = scale();
    fireEvent.mouseDown(layer, { button: 0, clientX: el.frame.w * k * 0.5, clientY: el.frame.h * k * 0.5 });
    fireEvent.mouseUp(window, { clientX: el.frame.w * k * 0.5, clientY: el.frame.h * k * 0.9 });
    await waitFor(() =>
      expect(server.state.overrides.elements?.['s23-compare-1-image']?.focal).toBeDefined(),
    );
    const crop = shownCrop(el, GOLDEN.assets[el.image.asset]); // what the frame shows of the image
    expect(server.state.overrides.elements['s23-compare-1-image'].focal.y).toBeCloseTo(
      crop.y + 0.9 * crop.h,
      1,
    );
    expect(contentPuts()).toHaveLength(0);
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'focal', label: 'Focal point' });
  });

  it('a file dropped on an image replaces it', async () => {
    await renderStudio(5);
    const file = new File([new Uint8Array([1, 2])], 'drop.png', { type: 'image/png' });
    fireEvent.drop(painted('s33-image-2'), { dataTransfer: { files: [file], types: ['Files'] } });
    await waitFor(() => expect(contentPuts().length).toBe(1));
    expect(slideOf(lastDoc(), 's33').blocks[0].items[2].src).toBe('content/assets/deck/abc123-drop.png');
  });
});

describe('charts', () => {
  it('the Data tab: a grid cell edit and an added row are commands (re-composed), undone by ⌘Z', async () => {
    await renderStudio(2);
    select('s16-chart');
    fireEvent.click(await screen.findByRole('tab', { name: 'Data' }));
    const grid = await screen.findByTestId('chart-grid');
    const cell = within(grid).getByLabelText('Q1 · Revenue ($M)');
    cell.focus();
    fireEvent.change(cell, { target: { value: '7.5' } });
    fireEvent.keyDown(cell, { key: 'Enter' });
    await flush();
    expect(slideOf(lastDoc(), 's16').blocks[0].series[0].values).toEqual([7.5, 5.6, 6, 6.5]);
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'setBlock', label: 'Chart value' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add row' }));
    await flush();
    const chart = slideOf(lastDoc(), 's16').blocks[0];
    expect(chart.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Category']);
    expect(chart.series[0].values).toEqual([7.5, 5.6, 6, 6.5, 0]);
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Revenue, 2026' } });
    fireEvent.blur(title);
    await flush();
    expect(slideOf(lastDoc(), 's16').blocks[0].text.title).toBe('Revenue, 2026');
    await undo(3);
    expect(slideOf(lastDoc(), 's16').blocks[0]).toEqual(slideOf(DOC, 's16').blocks[0]);
  });
});

describe('tables', () => {
  it('double-click a cell edits it inline; Tab commits and opens the next cell; a row is added from the Data tab', async () => {
    await renderStudio(3);
    const table = goldenSlide('s22').elements.find((e) => e.type === 'table');
    const c = table.table.cells[1][0];
    const k = scale();
    const x = (table.frame.x + c.x + c.w / 2) * k;
    const y = (table.frame.y + c.y + c.h / 2) * k;
    fireEvent.doubleClick(painted(table.id), { clientX: x, clientY: y });
    const editor = await screen.findByTestId('inline-editor');
    expect(editor.getAttribute('data-element')).toBe(`${table.id}::1:0`);
    editor.textContent = '';
    const block = document.createElement('div');
    block.setAttribute('data-p', '');
    block.textContent = 'Approval flows';
    editor.appendChild(block);
    fireEvent.input(editor);
    fireEvent.keyDown(editor, { key: 'Tab' });
    await waitFor(() =>
      expect(screen.getByTestId('inline-editor').getAttribute('data-element')).toBe(`${table.id}::1:1`),
    );
    await flush();
    expect(slideOf(lastDoc(), 's22').blocks[0].rows[0][0]).toBe('Approval flows');
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'setBlock', label: 'Edit cell' });
    fireEvent.keyDown(screen.getByTestId('inline-editor'), { key: 'Escape' });
    // the Data tab opened on the cell: add a row after it
    const data = await screen.findByTestId('table-data');
    fireEvent.click(within(data).getByRole('button', { name: '+ Row' }));
    await flush();
    const rows = slideOf(lastDoc(), 's22').blocks[0].rows;
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual(['Cell', 'Cell', 'Cell', 'Cell']);
    // the cell type menu
    fireEvent.click(
      within(data)
        .getAllByTestId('table-cell-pick')
        .find((b) => b.dataset.row === '0' && b.dataset.col === '0'),
    );
    fireEvent.change(within(data).getByLabelText('Cell type'), { target: { value: 'chip' } });
    await flush();
    expect(slideOf(lastDoc(), 's22').blocks[0].rows[0][0]).toEqual({ type: 'chip', text: 'Approval flows' });
    // an image cell: the file first (uploaded), then the cell {type, src, alt}
    fireEvent.change(within(data).getByLabelText('Cell type'), { target: { value: 'logo' } });
    const file = new File([new Uint8Array([1])], 'Acme.svg', { type: 'image/svg+xml' });
    fireEvent.change(await within(data).findByTestId('table-cell-file-input'), { target: { files: [file] } });
    await waitFor(() =>
      expect(slideOf(lastDoc(), 's22').blocks[0].rows[0][0]).toEqual({
        type: 'logo',
        src: 'content/assets/deck/abc123-acme.svg',
        alt: 'Approval flows',
      }),
    );
  });
});

describe('flow nodes', () => {
  it('add after / remove / move down from the panel; the range disables at its ends; ⌘Z undoes', async () => {
    await renderStudio(1);
    select('s9-cards-0-title');
    const section = await screen.findByTestId('node-section');
    expect(within(section).getByTestId('node-position').textContent).toBe('1 of 3 · 2–10');
    expect(within(section).getByRole('button', { name: 'Move the node up' }).disabled).toBe(true);
    fireEvent.click(within(section).getByRole('button', { name: 'Add a node after' }));
    await flush();
    expect(slideOf(lastDoc(), 's9').blocks[0].items.map((x) => x.heading)).toEqual([
      'A faster month-end close',
      'Heading',
      'Spend under control',
      'One view of the business',
    ]);
    expect(server.state.history.commands.at(-1).type).toBe('addNode');
    fireEvent.click(screen.getByRole('button', { name: 'Move the node down' }));
    await flush();
    expect(slideOf(lastDoc(), 's9').blocks[0].items[1].heading).toBe('A faster month-end close');
    fireEvent.click(screen.getByRole('button', { name: 'Remove the node' }));
    await flush();
    expect(slideOf(lastDoc(), 's9').blocks[0].items).toHaveLength(3);
    await undo(3);
    expect(slideOf(lastDoc(), 's9').blocks[0]).toEqual(slideOf(DOC, 's9').blocks[0]);
  });

  it('the remove button is disabled with a tooltip at the range minimum', async () => {
    server.state.doc.slides[0].blocks[0].items = server.state.doc.slides[0].blocks[0].items.slice(0, 2);
    await renderStudio(1);
    select('s9-cards-0-title');
    const remove = (await screen.findByTestId('node-section')).querySelector(
      '[aria-label="Remove the node"]',
    );
    expect(remove.disabled).toBe(true);
    expect(remove.title).toMatch(/items takes 2–10 nodes/);
  });

  it('dragging the node handle onto another node of the flow is one move command', async () => {
    await renderStudio(1);
    select('s9-cards-0-title');
    const handle = await screen.findByTestId('node-handle');
    const target = goldenSlide('s9').elements.find((e) => e.id === 's9-cards-2-title');
    const k = scale();
    const at = { clientX: (target.frame.x + 5) * k, clientY: (target.frame.y + 5) * k };
    fireEvent.mouseDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, at);
    await waitFor(() => expect(screen.getByTestId('node-drop-target').dataset.node).toBe('2'));
    fireEvent.mouseUp(window, at);
    await flush();
    expect(slideOf(lastDoc(), 's9').blocks[0].items.map((x) => x.heading)).toEqual([
      'Spend under control',
      'One view of the business',
      'A faster month-end close',
    ]);
    expect(server.state.history.commands.at(-1)).toMatchObject({ type: 'moveNode', label: 'Move node' });
  });
});

describe('font pair', () => {
  it('a brand with alternatives: choosing one is a deck-level override (composed), undone by ⌘Z', async () => {
    setup({
      brands: [
        brand({
          fontPairs: [
            {
              id: 'serif',
              label: 'Tiempos / Sohne',
              heading: 'serif',
              body: 'body',
              headingFamily: 'Tiempos',
              bodyFamily: 'Sohne',
            },
          ],
        }),
      ],
    });
    await renderStudio(1);
    const select = screen.getByLabelText('Font pair');
    fireEvent.change(select, { target: { value: 'serif' } });
    await waitFor(() => expect(server.state.overrides.fontPair).toBe('serif'));
    const compose = server.calls.filter((c) => c.url === '/api/studio/compose').at(-1);
    expect(compose.body.overrides.fontPair).toBe('serif');
    expect(server.state.history.commands.at(-1)).toMatchObject({
      type: 'fontPair',
      inverse: { fontPair: null },
    });
    await waitFor(() => expect(screen.getByLabelText('Font pair').value).toBe('serif'));
    expect(within(screen.getByTestId('type-section')).getByText('Tiempos')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(server.state.overrides.fontPair).toBeUndefined());
  });

  it('a brand with one pair says so (no switch)', async () => {
    await renderStudio(1);
    expect(screen.getByTestId('font-pair-one').textContent).toBe('This brand defines one pair');
    expect(screen.queryByLabelText('Font pair')).toBeNull();
  });
});
