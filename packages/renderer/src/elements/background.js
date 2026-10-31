import { cssGradient } from '../paint.js';
import { cssColor, fileUrl, h, warn } from '../util.js';

/**
 * Slide background, a full-slide layer under every element (z-index 0 band):
 * - solid: `color`;
 * - gradient: `gradient` {type linear|radial, angle, stops} (paint.js);
 * - image: `asset` (deck.assets id) with `fit` cover | contain | tile, then `overlay` colour at `overlayOpacity`
 *   on top (absent opacity = the overlay colour's own alpha). `color`, when also given, shows under the image.
 * Anything missing is flagged in `data-warning`, never filled.
 */
export function Background(bg, ctx) {
  const warnings = [];
  const layer = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' };
  const css = { ...layer };
  const children = [];
  const type = bg?.type;
  if (bg?.color) css.backgroundColor = cssColor(bg.color);
  if (type === 'solid') {
    if (!bg.color) warnings.push('solid background without color');
  } else if (type === 'gradient') {
    if (bg.gradient?.stops?.length) css.backgroundImage = cssGradient(bg.gradient);
    else warnings.push('gradient background without stops');
  } else if (type === 'image') {
    const asset = ctx.deck.assets?.[bg.asset];
    if (!asset) warnings.push(`missing asset "${bg.asset}"`);
    else {
      const url = fileUrl(ctx.opts.assetBase, asset.file, ctx.opts, asset.mime);
      css.backgroundImage = `url("${url.replace(/["\\]/g, '\\$&')}")`;
      if (bg.fit === 'tile') css.backgroundRepeat = 'repeat';
      else {
        css.backgroundRepeat = 'no-repeat';
        css.backgroundPosition = 'center';
        css.backgroundSize = bg.fit === 'contain' ? 'contain' : 'cover';
        if (!bg.fit) warnings.push('image background without fit: cover');
      }
    }
    if (bg.overlay) {
      children.push(
        h('div', {
          key: 'overlay',
          className: 'pb-overlay',
          style: { ...layer, backgroundColor: cssColor(bg.overlay, bg.overlayOpacity) },
        }),
      );
    }
  } else {
    warnings.push(`unknown background type "${type}"`);
  }
  const props = { className: 'pb-background', 'data-background': type, style: css };
  const w = warn(warnings);
  if (w) props['data-warning'] = w;
  return h('div', props, ...children);
}
