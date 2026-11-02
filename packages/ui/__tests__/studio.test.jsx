/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BrandSwitcher from '../src/studio/BrandSwitcher.jsx';
import LayoutPicker, { clearLayoutCache } from '../src/studio/LayoutPicker.jsx';
import Studio from '../src/studio/Studio.jsx';
import { fitScale, navTarget, patchOverrides, zoomScale } from '../src/studio/lib.js';
import { parseHash, studioHref } from '../src/router.js';

const REPO = resolve(__dirname, '..', '..', '..');
const GOLDEN = JSON.parse(readFileSync(join(REPO, 'golden', 'expected', 'stripe', 'deck.json'), 'utf8'));
/** The golden stripe deck cut to its first three slides (cover, agenda, section). */
const DECK = { ...GOLDEN, slides: GOLDEN.slides.slice(0, 3) };

const BRANDS = [
  {
    id: 'stripe',
    name: 'Stripe',
    ok: true,
    logo: '/files/brands/stripe/assets/logo.svg',
    colours: ['#533AFD', '#0D1738', '#533AFD'],
    accent: '#533AFD',
    surfaces: [
      { id: 'page', bg: '#FFFFFF', text: '#061B31', heading: '#061B31', accent: '#533AFD' },
      { id: 'navy', bg: '#0D1738', text: '#FFFFFF', heading: '#FFFFFF', accent: '#7F7DFC' },
    ],
    rhythm: ['page', 'navy'],
    fonts: { heading: 'Sohne', body: 'Sohne' },
    geometry: { margins: { top: 80, right: 138, bottom: 80, left: 138 }, titleZone: { y: 80, height: 120 } },
    questions: { blocking: 0, total: 1 },
  },
  {
    id: 'notion',
    name: 'Notion',
    ok: true,
    logo: null,
    colours: ['#000000', '#FFFFFF', '#2383E2'],
    accent: '#2383E2',
    surfaces: [{ id: 'page', bg: '#FFFFFF', text: '#000000', accent: '#2383E2' }],
    rhythm: [],
    fonts: { heading: 'Inter', body: 'Inter' },
    geometry: null,
    questions: { blocking: 0, total: 0 },
  },
  {
    id: 'broken',
    name: 'Broken',
    ok: false,
    logo: null,
    colours: [],
    surfaces: [],
    fonts: { heading: null, body: null },
    questions: { blocking: 2, total: 2 },
  },
];
const CONTENTS = [{ id: 'showcase', title: 'Showcase deck', file: 'golden/showcase/showcase.md' }];
const CHECKS = {
  kind: 'Report',
  version: '1.0.0',
  summary: { checks: 1, pass: 0, warn: 1, fail: 0, skip: 0, items: { fail: 0, warn: 1, info: 0 } },
  results: [
    {
      id: 'contrast',
      title: 'Text contrasts',
      status: 'warn',
      items: [
        { severity: 'warn', slide: 's1', index: 1, elementId: 's1-title', message: 'low contrast title' },
      ],
    },
  ],
};
const LAYOUTS = [
  {
    id: 'cover',
    kind: 'cover',
    default: true,
    boxes: [{ id: 'title', role: 'title', frame: { x: 138, y: 400, w: 900, h: 200 } }],
  },
];

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  text: async () => JSON.stringify(body),
});

/**
 * A fake server: `compose` decides each compose answer (default: the deck with the overrides echoed); every call is
 * recorded in `calls` as {url, method, body}.
 */
function fakeServer({ compose } = {}) {
  const calls = [];
  const fetch = jest.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url === '/api/studio/brands') return reply(200, BRANDS);
    if (url === '/api/studio/contents') return reply(200, CONTENTS);
    if (url === '/api/studio/compose') {
      if (compose) return compose(body, calls);
      return reply(200, {
        brandId: body.brandId,
        contentId: body.contentId,
        deck: DECK,
        checks: CHECKS,
        warnings: [],
        overrides: body.overrides ?? { slides: {} },
        ms: { total: 9 },
      });
    }
    if (url.startsWith('/api/studio/overrides/')) return reply(200, body ?? { slides: {} });
    if (url.startsWith('/api/studio/layouts')) return reply(200, LAYOUTS);
    if (url.startsWith('/api/studio/covers')) {
      return reply(200, [
        { brandId: 'stripe', deck: { ...DECK, slides: DECK.slides.slice(0, 1) } },
        { brandId: 'notion', deck: { ...DECK, slides: DECK.slides.slice(0, 1) } },
        { brandId: 'broken', deck: null, error: 'broken has no Mood' },
      ]);
    }
    return reply(404, { error: 'not found' });
  });
  return { fetch, calls };
}

let server;
beforeEach(() => {
  server = fakeServer();
  global.fetch = server.fetch;
  window.history.replaceState(null, '', '#/');
  clearLayoutCache();
});
afterEach(async () => {
  // let the panel's pending layout fetches settle inside act (no state update after the test)
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0));
  });
  delete global.fetch;
});

const composes = () => server.calls.filter((c) => c.url === '/api/studio/compose');
const counter = () => screen.getByTestId('counter').textContent;
const selected = () => screen.getAllByTestId('film-thumb').findIndex((t) => t.dataset.selected === 'true');

async function renderStudio(route = {}) {
  render(<Studio route={route} />);
  await waitFor(() => expect(screen.getAllByTestId('film-thumb')).toHaveLength(3));
  await screen.findByTestId('layout-picker'); // the panel's layouts have loaded (no update after the test)
}

describe('studio helpers', () => {
  it('fit = min(w / 1920, h / 1080) after padding; zoom 50 / 100 are fixed scales', () => {
    expect(fitScale(1920, 1080)).toBe(1);
    expect(fitScale(1000, 2000)).toBeCloseTo(1000 / 1920);
    expect(fitScale(4000, 540)).toBe(0.5);
    expect(fitScale(968, 588, { pad: 4 })).toBe(0.5);
    expect(fitScale(0, 0)).toBeGreaterThan(0);
    expect(zoomScale('fit', 0.42)).toBe(0.42);
    expect(zoomScale(50, 0.42)).toBe(0.5);
    expect(zoomScale(100, 0.42)).toBe(1);
  });

  it('navigation keys move one slide, Cmd / Home / End jump, other keys are not navigation', () => {
    expect(navTarget({ key: 'ArrowRight' }, 0, 3)).toBe(1);
    expect(navTarget({ key: 'ArrowDown' }, 1, 3)).toBe(2);
    expect(navTarget({ key: 'PageDown' }, 2, 3)).toBe(2);
    expect(navTarget({ key: 'ArrowUp' }, 0, 3)).toBe(0);
    expect(navTarget({ key: 'PageUp' }, 2, 3)).toBe(1);
    expect(navTarget({ key: 'ArrowRight', metaKey: true }, 0, 3)).toBe(2);
    expect(navTarget({ key: 'ArrowLeft', ctrlKey: true }, 2, 3)).toBe(0);
    expect(navTarget({ key: 'End' }, 0, 3)).toBe(2);
    expect(navTarget({ key: 'Home' }, 2, 3)).toBe(0);
    expect(navTarget({ key: 'a' }, 0, 3)).toBeNull();
  });

  it('patchOverrides sets and clears keys; decor / logo true are the default; empty entries go', () => {
    const a = patchOverrides({ slides: {} }, 's1', { surface: 'navy', decor: false });
    expect(a).toEqual({ slides: { s1: { surface: 'navy', decor: false } } });
    expect(patchOverrides(a, 's1', { decor: true })).toEqual({ slides: { s1: { surface: 'navy' } } });
    expect(patchOverrides(a, 's1', { surface: null, decor: null })).toEqual({ slides: {} });
  });

  it('the hash routes: #/ and #/studio/... are the Studio, #/review the review console', () => {
    expect(parseHash('#/')).toEqual({ page: 'studio', brand: null, content: null, slide: null });
    expect(parseHash('#/studio/stripe/showcase/4')).toEqual({
      page: 'studio',
      brand: 'stripe',
      content: 'showcase',
      slide: 4,
    });
    expect(parseHash('#/review')).toEqual({ page: 'brands' });
    expect(parseHash('#/b/stripe/checks')).toMatchObject({ page: 'brand', id: 'stripe', tab: 'checks' });
    expect(studioHref({ brand: 'stripe', content: 'showcase', slide: 2 })).toBe('#/studio/stripe/showcase/2');
    expect(studioHref({})).toBe('#/');
  });
});

describe('BrandSwitcher', () => {
  it('opens a popover of brand cards, each painting its cover; a brand without a Mood is disabled', async () => {
    const onPick = jest.fn();
    render(<BrandSwitcher brands={BRANDS} brandId="stripe" contentId="showcase" onPick={onPick} />);
    expect(screen.getByTestId('brand-current').textContent).toBe('Stripe');
    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const cards = await screen.findAllByTestId('brand-card');
    expect(cards.map((c) => c.dataset.brand)).toEqual(['stripe', 'notion', 'broken']);
    await waitFor(() => expect(cards[0].querySelector('.slide')).not.toBeNull());
    expect(cards[1].querySelector('.slide[data-kind="cover"]')).not.toBeNull();
    expect(server.calls.some((c) => c.url === '/api/studio/covers?contentId=showcase')).toBe(true);
    expect(cards[2].disabled).toBe(true);
    expect(cards[2].textContent).toMatch(/2 blocking question/);
    // three colour dots per card, the logo chip from the brand's main logo
    expect(cards[0].querySelectorAll('[title^="#"]')).toHaveLength(3);
    expect(cards[0].querySelector('img').getAttribute('src')).toBe('/files/brands/stripe/assets/logo.svg');
    fireEvent.click(cards[1]);
    expect(onPick).toHaveBeenCalledWith('notion');
    expect(screen.queryAllByTestId('brand-card')).toHaveLength(0); // the popover closed
  });
});

describe('LayoutPicker', () => {
  it("lists the kind's layouts as wireframes; a non-default pins it, the default removes the pin", async () => {
    server = fakeServer();
    global.fetch = jest.fn(async (url) => {
      server.calls.push({ url });
      if (url.includes('kind=bullets')) {
        return reply(200, [
          {
            id: 'bullets',
            kind: 'bullets',
            default: true,
            boxes: [{ id: 't', role: 'title', frame: { x: 0, y: 0, w: 10, h: 10 } }],
          },
          { id: 'bullets-wide', kind: 'bullets', default: false, boxes: [] },
        ]);
      }
      return reply(200, [
        { id: 'bullets', kind: 'bullets', boxes: [] },
        { id: 'text', kind: 'text', boxes: [] },
      ]);
    });
    const onPick = jest.fn();
    render(<LayoutPicker kind="bullets" brandId="stripe" currentId="bullets" onPick={onPick} />);
    const options = await screen.findAllByTestId('layout-option');
    expect(options.map((o) => o.dataset.layout)).toEqual(['bullets', 'bullets-wide']);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    expect(options[0].querySelectorAll('rect').length).toBe(2); // the canvas + one box
    expect(server.calls[0].url).toBe('/api/studio/layouts?kind=bullets&brandId=stripe');
    fireEvent.click(options[1]);
    expect(onPick).toHaveBeenLastCalledWith('bullets-wide');
    fireEvent.click(options[0]);
    expect(onPick).toHaveBeenLastCalledWith(null);
    // other kinds: the rest of the catalogue
    fireEvent.click(screen.getByRole('button', { name: /Other kinds/ }));
    const others = await screen.findByTestId('layout-others');
    await waitFor(() => expect(within(others).getAllByTestId('layout-option')).toHaveLength(1));
    fireEvent.click(within(others).getByTestId('layout-option'));
    expect(onPick).toHaveBeenLastCalledWith('text');
  });
});

describe('Studio', () => {
  it('loads brands and contents, composes the first brand and paints filmstrip + canvas + panel', async () => {
    await renderStudio();
    expect(composes()[0].body).toEqual({ brandId: 'stripe', contentId: 'showcase' });
    expect(counter()).toBe('1 / 3');
    expect(selected()).toBe(0);
    expect(screen.getByTestId('canvas-slide').querySelector('.slide[data-index="0"]')).not.toBeNull();
    expect(screen.getByTestId('canvas-caption').textContent).toMatch(/^cover · cover · page/);
    expect(screen.getAllByTestId('surface-tile').map((t) => t.dataset.surface)).toEqual(['page', 'navy']);
    expect(window.location.hash).toBe('#/studio/stripe/showcase/1');
    // the selection ring is the brand's accent
    expect(screen.getAllByTestId('film-thumb')[0].querySelector('span > span').style.boxShadow).toContain(
      '#533AFD',
    );
  });

  it('filmstrip: a click selects; arrow / Page / Home / End keys navigate; G toggles the grid', async () => {
    await renderStudio();
    fireEvent.click(screen.getAllByTestId('film-thumb')[2]);
    expect(selected()).toBe(2);
    expect(counter()).toBe('3 / 3');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(window, { key: 'End' });
    expect(selected()).toBe(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true });
    expect(selected()).toBe(0);
    expect(window.location.hash).toBe('#/studio/stripe/showcase/1');
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByTestId('deck-grid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Slide 2' }));
    expect(screen.queryByTestId('deck-grid')).toBeNull();
    expect(selected()).toBe(1);
    await screen.findByTestId('layout-picker'); // the agenda slide's layouts loaded
  });

  it('a surface tile click composes with that override, then stores it (PUT overrides)', async () => {
    await renderStudio();
    const navy = screen.getAllByTestId('surface-tile').find((t) => t.dataset.surface === 'navy');
    fireEvent.click(navy);
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body).toEqual({
      brandId: 'stripe',
      contentId: 'showcase',
      overrides: { slides: { s1: { surface: 'navy' } } },
    });
    await waitFor(() =>
      expect(server.calls.find((c) => c.method === 'PUT')).toEqual({
        url: '/api/studio/overrides/showcase/stripe',
        method: 'PUT',
        body: { slides: { s1: { surface: 'navy' } } },
      }),
    );
    // the slide shows its override: a dot on the filmstrip, "Reset slide" in the panel
    await screen.findByRole('button', { name: 'Reset slide' });
  });

  it('decor / logo switches send decor: false / logo: false for this slide', async () => {
    await renderStudio();
    const logo = screen.getByRole('switch', { name: 'Logo' });
    expect(logo.getAttribute('aria-checked')).toBe('true'); // the cover carries the brand's logo
    fireEvent.click(logo);
    await waitFor(() => expect(composes()).toHaveLength(2));
    expect(composes()[1].body.overrides).toEqual({ slides: { s1: { logo: false } } });
  });

  it('busy: the canvas dims and the panel locks during the round trip; a failed compose keeps the deck', async () => {
    let release;
    const answers = [];
    server = fakeServer({
      compose: (body) => {
        answers.push(body);
        if (answers.length === 1) {
          return reply(200, {
            brandId: 'stripe',
            contentId: 'showcase',
            deck: DECK,
            checks: CHECKS,
            warnings: [],
            overrides: { slides: {} },
          });
        }
        return new Promise((ok) => {
          release = () => ok(reply(422, { error: 'navy is not allowed here' }));
        });
      },
    });
    global.fetch = server.fetch;
    await renderStudio();
    expect(screen.getByTestId('canvas').dataset.busy).toBe('false');
    fireEvent.click(screen.getAllByTestId('surface-tile')[1]);
    await waitFor(() => expect(screen.getByTestId('canvas').dataset.busy).toBe('true'));
    expect(screen.getByTestId('panel-fieldset').disabled).toBe(true);
    // navigation is blocked while busy
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(selected()).toBe(0);
    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId('canvas').dataset.busy).toBe('false'));
    expect(screen.getByTestId('panel-fieldset').disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toMatch(/navy is not allowed here/);
    // the previous deck is still painted, and nothing was stored
    expect(screen.getAllByTestId('film-thumb')).toHaveLength(3);
    expect(server.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('hovering a check item outlines its element on the canvas (guides off)', async () => {
    await renderStudio();
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Checks/ }));
    const item = screen.getByTestId('panel-check-item');
    fireEvent.mouseEnter(item);
    const box = screen.getByTestId('overlay-box');
    expect(box.dataset.element).toBe('s1-title');
    fireEvent.mouseLeave(item);
    expect(screen.queryAllByTestId('overlay-box')).toHaveLength(0);
  });

  it('switching brand re-composes the content for that brand; the Checks drawer opens over the canvas', async () => {
    await renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    const cards = await screen.findAllByTestId('brand-card');
    fireEvent.click(cards[1]);
    await waitFor(() => expect(composes().at(-1).body).toEqual({ brandId: 'notion', contentId: 'showcase' }));
    await waitFor(() => expect(screen.getByTestId('brand-current').textContent).toBe('Notion'));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Checks' }));
    const drawer = screen.getByTestId('drawer');
    expect(within(drawer).getByTestId('checks-summary')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('drawer')).toBeNull();
    await screen.findByTestId('layout-picker'); // notion's layouts loaded
  });
});
