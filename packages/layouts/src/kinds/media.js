/**
 * Image treatments as layouts (content/2 `image`, S2.a slice 3): a collage of 2–4 images and one image in a device
 * frame, each under the title across the body area (the engine draws the grid / the frame inside the image box,
 * compose/media.js). Side-by-side images with text stay the image-text / image-aside layouts, whose image box draws
 * the same treatments.
 */
import { createBuilder, nodesOf, standardTitle, v2Blocks } from '../common.js';

/** The slide's one block when it is an image block, else null. */
function onlyImage(summary) {
  const blocks = v2Blocks(summary);
  return blocks.length === 1 && blocks[0].type === 'image' ? blocks[0] : null;
}

function imageBoxDef({ id, label, tags, match }) {
  return {
    id,
    kind: 'image',
    version: 1,
    label,
    tags,
    match,
    build(ctx) {
      const b = createBuilder(this, ctx);
      standardTitle(b, 'image');
      b.box('image', b.area(), { role: 'image', slot: 'image' });
      b.slot('image', 'image', 'image');
      return b.finish();
    },
  };
}

export const imageCollage = imageBoxDef({
  id: 'image-collage',
  label: 'Image collage',
  tags: ['image', 'collage', 'grid'],
  /** One image block of 2–4 images (or treatment collage). */
  match(summary) {
    const block = onlyImage(summary);
    if (!block || block.treatment === 'device' || block.treatment === 'background') return 0;
    return nodesOf(block) > 1 || block.treatment === 'collage' ? 30 : 0;
  },
});

export const imageDevice = imageBoxDef({
  id: 'image-device',
  label: 'Device',
  tags: ['image', 'device', 'mockup'],
  /** One image block with treatment device. */
  match(summary) {
    return onlyImage(summary)?.treatment === 'device' ? 30 : 0;
  },
});
