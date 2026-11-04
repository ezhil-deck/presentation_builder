// The claims fixture, built at test time on a copy of the mini brand: a slanted device band (SVG), a cover PNG holding a
// flat colour field and a distinct "lockup" rectangle, an imagery sample with w / h, light and dark mono logos, a
// polygon mask and an SVG mask. `edit(input, dir)` changes one thing for a negative test.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { miniCopy } from './helpers.js';

/** A PNG of `w` x `h` filled with `rgba`, then each rect `{x, y, w, h, rgba}` painted over it. */
export function pngBuffer(w, h, rgba, rects = []) {
  const png = new PNG({ width: w, height: h });
  const put = (x, y, c) => {
    const i = (y * w + x) * 4;
    png.data[i] = c[0];
    png.data[i + 1] = c[1];
    png.data[i + 2] = c[2];
    png.data[i + 3] = c[3] ?? 255;
  };
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) put(x, y, rgba);
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) put(x, y, r.rgba);
  return PNG.sync.write(png);
}

export function writeFile(dir, rel, data) {
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
}

const INK = [0x1a, 0x1a, 0x2e, 255];
const WHITE = [255, 255, 255, 255];

// the band's left edge runs from (1000, 0) to (700, 1080); the photo area ends on it
export const BAND_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" ' +
  'preserveAspectRatio="none"><path fill="#E94560" d="M1000 0L1200 0L900 1080L700 1080Z"/></svg>';
export const MASK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H100V100Z" fill="#000000"/></svg>';

/** Write the fixture's files into a mini copy. */
export function writeClaimFiles(dir) {
  writeFile(dir, 'assets/decor/band.svg', BAND_SVG);
  writeFile(dir, 'assets/masks/blob.svg', MASK_SVG);
  // the cover: 192 x 108 (drawn with imageFit cover at x10): the ink field, a white lockup at canvas 1400,80 400x120
  writeFile(dir, 'assets/cover.png', pngBuffer(192, 108, INK, [{ x: 140, y: 8, w: 40, h: 12, rgba: WHITE }]));
  writeFile(dir, 'assets/photo.png', pngBuffer(60, 40, [120, 130, 140, 255]));
  writeFile(
    dir,
    'assets/logo-dark.png',
    pngBuffer(8, 4, [0, 0, 0, 0], [{ x: 1, y: 1, w: 6, h: 2, rgba: [20, 20, 30, 255] }]),
  );
  writeFile(
    dir,
    'assets/logo-light.png',
    pngBuffer(8, 4, [0, 0, 0, 0], [{ x: 1, y: 1, w: 6, h: 2, rgba: WHITE }]),
  );
}

/** Turn the mini input into the claims fixture's input (correct claims). */
export function claimInput(input) {
  input.brand.logos.monoLight = 'assets/logo-light.png';
  input.brand.logos.monoDark = 'assets/logo-dark.png';
  input.backgrounds.variants.cover = {
    type: 'image',
    surface: 'ink',
    image: 'assets/cover.png',
    imageFit: 'cover',
  };
  input.assets.elements.push({
    id: 'band',
    type: 'shape',
    file: 'assets/decor/band.svg',
    box: { x: 0, y: 0, w: 1920, h: 1080 },
    layer: 'behind',
    frequency: 'always',
    allowedOn: ['section'],
  });
  input.layouts[0].background = 'cover';
  input.layouts[0].composition = {
    device: 'band',
    photoArea: [
      [0, 0],
      [1000, 0],
      [700, 1080],
      [0, 1080],
    ],
    logo: { variant: 'monoLight', box: { x: 1400, y: 80, w: 400, h: 120 } },
  };
  input.imagery = {
    samples: [{ file: 'assets/photo.png', w: 60, h: 40, aspect: 1.5, kind: 'photo-people', tags: ['hero'] }],
  };
  input.masks = {
    options: {
      slant: { type: 'polygon', points: '20,0 100,0 80,100 0,100' },
      blob: { type: 'svg', file: 'assets/masks/blob.svg' },
    },
  };
  return input;
}

/** A claims-fixture copy; `edit(input, dir)` runs after the fixture is built. Returns { dir, cleanup }. */
export function claimsCopy(edit) {
  return miniCopy((input, dir) => {
    writeClaimFiles(dir);
    claimInput(input);
    if (edit) edit(input, dir);
  });
}
