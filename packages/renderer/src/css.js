import { num } from './util.js';

/**
 * Base stylesheet. Slides are `canvas.width` x `canvas.height` (1920x1080) with absolutely positioned content.
 * - On screen: each slide sits in a `.pb-slot` scaled by `--pb-scale` (set by SCALE_SCRIPT to fit the viewport;
 *   1 without script) via `transform: scale`, the slot taking the scaled size so the page flows.
 * - Print: `@page {size: 1920px 1080px; margin: 0}`, scale forced to 1, one slide per page.
 * - Export (`html.pb-export`, set by the PNG exporter): scale forced to 1, no gaps.
 * Text: kerning and ligatures off - the fitter measures the sum of per-codepoint advances (§3.4), so the browser
 * must not tighten pairs (HTML = fitter = PPTX).
 */
export function baseCss(canvas = { width: 1920, height: 1080 }) {
  const W = `${num(canvas.width)}px`;
  const H = `${num(canvas.height)}px`;
  return [
    ':root{--pb-scale:1}',
    'html,body{margin:0;padding:0}',
    'body{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    `.pb-slot{position:relative;width:calc(${W} * var(--pb-scale));height:calc(${H} * var(--pb-scale));overflow:hidden;margin:0 auto 16px}`,
    `.slide{position:relative;display:block;width:${W};height:${H};overflow:hidden;transform:scale(var(--pb-scale));transform-origin:0 0}`,
    '.slide *{margin:0;padding:0}',
    '.slide span,.slide a,.slide text{font-kerning:none;font-variant-ligatures:none;font-feature-settings:"kern" 0,"liga" 0,"clig" 0}',
    '.pb-line,.pb-bullet{white-space:pre;display:block}',
    `@page{size:${W} ${H};margin:0}`,
    '@media print{:root{--pb-scale:1 !important}html,body{width:' +
      W +
      '}.pb-slot{margin:0;break-after:page;page-break-after:always}.pb-slot:last-child{break-after:auto;page-break-after:auto}}',
    'html.pb-export{--pb-scale:1 !important}html.pb-export .pb-slot{margin:0}',
  ].join('\n');
}

/** Screen-only fit-to-viewport scale (sets --pb-scale; print / export override it). */
export function scaleScript(canvas = { width: 1920, height: 1080 }) {
  return (
    '(function(){var d=document.documentElement;function f(){var s=Math.min(d.clientWidth/' +
    num(canvas.width) +
    ',window.innerHeight/' +
    num(canvas.height) +
    ');d.style.setProperty("--pb-scale",String(s))}f();window.addEventListener("resize",f)})();'
  );
}
