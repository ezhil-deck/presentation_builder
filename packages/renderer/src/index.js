import ReactDOMServer from 'react-dom/server';
import { baseCss, scaleScript } from './css.js';
import { Deck } from './deck.js';
import { fontFaceCss } from './fonts.js';
import { Slide, renderElement } from './slide.js';
import { h } from './util.js';

export { Deck, Slide, renderElement, baseCss, fontFaceCss };
export { arcPath } from './elements/chart.js';
export { applyCase } from './elements/lines.js';

const DEFAULTS = { assetBase: '', fontBase: '', animated: false, inlineAssets: false };

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function documentHtml(deck, opts, only) {
  const o = { ...DEFAULTS, ...opts };
  const canvas = deck.canvas ?? { width: 1920, height: 1080 };
  const body = ReactDOMServer.renderToStaticMarkup(h(Deck, { deck, opts: o, only }));
  const css = [fontFaceCss(deck, o), baseCss(canvas)].filter(Boolean).join('\n');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(deck.title ?? deck.id ?? 'deck')}</title>` +
    `<style>\n${css}\n</style></head><body>${body}<script>${scaleScript(canvas)}</script></body></html>\n`
  );
}

/**
 * Paint a Deck to a standalone HTML document (P2-spec §4). Options:
 * - `assetBase` / `fontBase`: prefixes for `deck.assets[].file` / `deck.fonts[].files[].file` ('' = as given);
 * - `animated`: use `image.animated` assets (present mode); default false (PDF / PNG / thumbnails);
 * - `inlineAssets`: embed images and fonts as data: URIs (reads the files at `base + file`; `readFile` option
 *   outside Node).
 * Deterministic: the same deck and options give byte-identical HTML.
 */
export function renderDeckToHtml(deck, opts = {}) {
  return documentHtml(deck, opts);
}

/** One slide of the deck as a standalone HTML document (same stylesheet and fonts; `data-index` = `i`). */
export function renderSlideToHtml(deck, i, opts = {}) {
  if (!deck.slides?.[i]) throw new RangeError(`renderSlideToHtml: no slide ${i}`);
  return documentHtml(deck, opts, [i]);
}
