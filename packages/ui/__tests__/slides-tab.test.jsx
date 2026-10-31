/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';
import { reportV1 } from './fixtures/report.js';

const GOLDEN = join(resolve(__dirname, '..', '..', '..'), 'golden', 'expected', 'stripe');
const DECK = JSON.parse(readFileSync(join(GOLDEN, 'deck.json'), 'utf8'));
const MOOD = JSON.parse(readFileSync(join(GOLDEN, 'mood.json'), 'utf8'));

const FILES = {
  '/api/brands/stripe': {
    id: 'stripe',
    name: 'Stripe',
    out: true,
    input: true,
    stale: false,
    deckHash: 'h1',
  },
  '/api/brands/stripe/deck': DECK,
  '/api/brands/stripe/report': {
    kind: 'BuildReport',
    engineVersion: DECK.engineVersion,
    counts: { slides: DECK.slides.length, pngs: 0 },
    checks: reportV1(DECK),
  },
  '/api/brands/stripe/questions': [],
  '/api/brands/stripe/mood': MOOD,
  '/api/brands/stripe/review': {},
  '/api/brands/stripe/build': { running: false, log: [], exitCode: null },
};

beforeEach(() => {
  global.fetch = jest.fn(async (url) => {
    const body = FILES[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      statusText: body === undefined ? 'Not Found' : 'OK',
      text: async () => (body === undefined ? '{"error":"not found"}' : JSON.stringify(body)),
    };
  });
});

afterEach(() => {
  delete global.fetch;
  window.location.hash = '';
});

describe('Slides tab (smoke, golden stripe deck)', () => {
  it('paints every slide live with the renderer and injects the deck stylesheet once', async () => {
    window.location.hash = '#/b/stripe';
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getAllByTestId('slide-thumb')).toHaveLength(DECK.slides.length));
    expect(container.querySelectorAll('section.slide')).toHaveLength(DECK.slides.length);
    const styles = container.querySelectorAll('style[data-pb-deck]');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('@font-face');
    expect(styles[0].textContent).toContain('/files/brands/stripe/');
    expect(styles[0].textContent).toContain('.pb-slot');
    expect(fetch).toHaveBeenCalledWith('/api/brands/stripe/deck', expect.anything());
  });

  it('shows one slide large with the overlay boxes of its check items', async () => {
    window.location.hash = '#/b/stripe/slides/4';
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('slide-large')).toBeTruthy());
    expect(container.querySelectorAll('section.slide')).toHaveLength(1);
    expect(container.querySelector('section.slide').getAttribute('data-slide-id')).toBe(DECK.slides[3].id);
    const boxes = screen.getAllByTestId('overlay-box');
    expect(boxes.map((b) => b.getAttribute('data-severity')).sort()).toEqual(['fail', 'warn']);
    expect(screen.getByText(/Check items on this slide/).textContent).toContain('(2)');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(window.location.hash).toBe('#/b/stripe/slides/5');
  });
});
