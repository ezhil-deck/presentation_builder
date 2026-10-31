import { cssColor, fileUrl, h, num, px, warn } from '../util.js';
import { cssGradient, cssShadow } from '../paint.js';
import { elementProps } from './common.js';

/**
 * Image element: `<img>` with `object-fit` = `image.fit` ('cover' | 'contain' | 'fill'), `src` = `assetBase +
 * deck.assets[image.asset].file`; with the `{animated:true}` render option and `image.animated` (an asset id),
 * that asset is the `src` instead.
 *
 * Box: `style.radius` -> rounded clip, `style.fill` behind the image (shows around a `contain` image),
 * `style.shadow` on the box, `style.stroke` drawn over the image edge.
 * `image.crop = {x, y, w, h}`: the source region shown, stretched into the frame (PPTX `srcRect` semantics) - as
 * fractions 0..1 of the source, or source pixels when any value is > 1 (normalised by the asset's width/height;
 * without those the crop is ignored and flagged). Implemented by the box's overflow clip + the inner image sized
 * `frame / crop` and offset by `−crop.x/y`.
 * `image.mask`: 'circle' | 'ellipse' -> 50% radius clip; any other mask is ignored and flagged.
 * `image.tint` is ignored and flagged (no CSS filter is invented to approximate it).
 * `image.tile: true` (a pattern decor): the asset repeats across the frame (CSS background) at its own size × `image.scale`
 * when the deck gives the asset's width / height, else at its intrinsic size (`scale` then flagged as not applied).
 */
export function ImageElement(el, ctx, origin) {
  const img = el.image ?? {};
  const warnings = [];
  let assetId = img.asset;
  if (ctx.opts.animated && img.animated) assetId = img.animated;
  const asset = ctx.deck.assets?.[assetId];
  if (!asset) warnings.push(`missing asset "${assetId}"`);
  if (img.tint) warnings.push('tint ignored');

  const box = { overflow: 'hidden' };
  const st = el.style ?? {};
  if (typeof st.fill === 'string') box.backgroundColor = cssColor(st.fill);
  else if (st.fill) box.backgroundImage = cssGradient(st.fill);
  if (st.shadow) box.boxShadow = cssShadow(st.shadow);
  if (img.mask === 'circle' || img.mask === 'ellipse') box.borderRadius = '50%';
  else {
    if (img.mask) warnings.push(`mask "${img.mask}" ignored`);
    if (typeof st.radius === 'number' && st.radius > 0) box.borderRadius = px(st.radius);
  }

  let imgStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    objectFit: img.fit ?? 'fill',
  };
  if (img.crop) {
    let { x = 0, y = 0, w = 1, h: ch = 1 } = img.crop;
    const pixels = [x, y, w, ch].some((v) => v > 1);
    if (pixels && !(asset?.width && asset?.height)) {
      warnings.push('crop in pixels without asset size: ignored');
    } else {
      if (pixels) {
        x /= asset.width;
        w /= asset.width;
        y /= asset.height;
        ch /= asset.height;
      }
      const iw = el.frame.w / w;
      const ih = el.frame.h / ch;
      imgStyle = {
        position: 'absolute',
        left: px(-x * iw),
        top: px(-y * ih),
        width: px(iw),
        height: px(ih),
        objectFit: 'fill',
      };
    }
  }

  const children = [];
  if (asset && img.tile) {
    const tile = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      backgroundImage: `url("${fileUrl(ctx.opts.assetBase, asset.file, ctx.opts, asset.mime).replace(/["\\]/g, '\\$&')}")`,
      backgroundRepeat: 'repeat',
    };
    const k = typeof img.scale === 'number' ? img.scale : 1;
    if (asset.width && asset.height) tile.backgroundSize = `${px(asset.width * k)} ${px(asset.height * k)}`;
    else if (typeof img.scale === 'number' && img.scale !== 1)
      warnings.push('tile scale needs the asset size: not applied');
    children.push(h('div', { key: 'tile', className: 'pb-tile', style: tile }));
  } else if (asset) {
    children.push(
      h('img', {
        key: 'img',
        src: fileUrl(ctx.opts.assetBase, asset.file, ctx.opts, asset.mime),
        alt: img.alt ?? '',
        draggable: 'false',
        style: { ...imgStyle, maxWidth: 'none', display: 'block' },
      }),
    );
  }
  if (st.stroke?.color && st.stroke.width) {
    children.push(
      h('div', {
        key: 'stroke',
        className: 'pb-stroke',
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          border: `${px(st.stroke.width)} ${st.stroke.dash?.length ? 'dashed' : 'solid'} ${cssColor(st.stroke.color)}`,
          borderRadius: box.borderRadius,
        },
      }),
    );
  }
  const attrs = { 'data-asset': assetId };
  if (typeof img.fit === 'string') attrs['data-fit'] = img.fit;
  if (img.crop) attrs['data-crop'] = [img.crop.x, img.crop.y, img.crop.w, img.crop.h].map(num).join(',');
  return h('div', elementProps(el, origin, { extraStyle: box, warning: warn(warnings), attrs }), ...children);
}
