import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageSize, inspectAsset, mimeOf, svgSize } from '../src/assets.js';
import { MINI, tmpDir } from './helpers.js';

describe('BR-ASSET', () => {
  let tmp;
  beforeEach(() => {
    tmp = tmpDir();
  });
  afterEach(() => tmp.cleanup());

  const write = (name, data) => {
    const file = join(tmp.dir, name);
    writeFileSync(file, data);
    return file;
  };

  it('mime from the extension', () => {
    expect(mimeOf('a/logo.SVG')).toBe('image/svg+xml');
    expect(mimeOf('x.jpeg')).toBe('image/jpeg');
    expect(mimeOf('x.jpg')).toBe('image/jpeg');
    expect(mimeOf('x.webp')).toBe('image/webp');
    expect(mimeOf('f.woff2')).toBe('font/woff2');
    expect(mimeOf('f.xyz')).toBe('application/octet-stream');
  });

  it('SVG: absolute width/height attributes, else the viewBox', () => {
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240.4 64">')).toEqual({
      width: 240,
      height: 64,
    });
    expect(svgSize('<svg width="120px" height="30" viewBox="0 0 240 60"></svg>')).toEqual({
      width: 120,
      height: 30,
    });
    expect(svgSize("<svg width='100%' height='100%' viewBox='-10,-10,50,20'></svg>")).toEqual({
      width: 50,
      height: 20,
    });
    expect(svgSize('<?xml version="1.0"?>\n<!-- c -->\n<svg\n  viewBox="0 0 10 5"\n>')).toEqual({
      width: 10,
      height: 5,
    });
    expect(svgSize('<svg width="10em" height="4em"></svg>')).toBeNull();
    expect(svgSize('<html></html>')).toBeNull();
  });

  it('PNG size from the IHDR header', () => {
    expect(imageSize(join(MINI, 'assets', 'logo-white.png'))).toEqual({ width: 3, height: 2 });
  });

  it('JPEG size from the SOF marker (after APP segments)', () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
    const sof = Buffer.from([0xff, 0xc2, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, ...Buffer.alloc(9)]);
    const file = write(
      'p.jpg',
      Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]),
    );
    expect(imageSize(file)).toEqual({ width: 1280, height: 720 });
  });

  it('WebP size: VP8X, VP8L and VP8 chunks', () => {
    const riff = (chunk, body) => {
      const b = Buffer.alloc(30 + body.length);
      b.write('RIFF', 0, 'ascii');
      b.write('WEBP', 8, 'ascii');
      b.write(chunk, 12, 'ascii');
      body.copy(b, 20);
      return b;
    };
    const vp8x = Buffer.alloc(10);
    vp8x.writeUIntLE(1919, 4, 3);
    vp8x.writeUIntLE(1079, 7, 3);
    expect(imageSize(write('x.webp', riff('VP8X', vp8x)))).toEqual({ width: 1920, height: 1080 });

    // VP8L: 14-bit width-1 and height-1 packed after the 0x2f signature byte.
    const w = 400 - 1;
    const h = 300 - 1;
    const bits = w | (h << 14);
    const vp8l = Buffer.from([
      0x2f,
      bits & 0xff,
      (bits >> 8) & 0xff,
      (bits >> 16) & 0xff,
      (bits >> 24) & 0xff,
    ]);
    expect(imageSize(write('l.webp', riff('VP8L', vp8l)))).toEqual({ width: 400, height: 300 });

    const vp8 = Buffer.alloc(10);
    vp8.writeUInt16LE(640, 6);
    vp8.writeUInt16LE(480, 8);
    expect(imageSize(write('v.webp', riff('VP8 ', vp8)))).toEqual({ width: 640, height: 480 });
  });

  it('GIF size from the logical screen descriptor', () => {
    const b = Buffer.alloc(13);
    b.write('GIF89a', 0, 'ascii');
    b.writeUInt16LE(32, 6);
    b.writeUInt16LE(16, 8);
    expect(imageSize(write('a.gif', b))).toEqual({ width: 32, height: 16 });
  });

  it('inspectAsset: an existing image gets mime + size', () => {
    expect(inspectAsset(MINI, 'assets/logo.svg')).toEqual({
      ok: true,
      isDir: false,
      asset: { file: 'assets/logo.svg', mime: 'image/svg+xml', width: 240, height: 64 },
    });
  });

  it('inspectAsset: missing, outside the brand folder, URL, folder -> not ok', () => {
    expect(inspectAsset(MINI, 'assets/none.png')).toEqual({
      ok: false,
      message: 'file not found: assets/none.png',
    });
    expect(inspectAsset(MINI, '../tiny-font.cjs').ok).toBe(false);
    expect(inspectAsset(MINI, '/etc/hosts').ok).toBe(false);
    expect(inspectAsset(MINI, 'https://example.com/logo.svg').ok).toBe(false);
    expect(inspectAsset(MINI, 'assets').ok).toBe(false);
    expect(inspectAsset(MINI, 'assets', { allowDir: true })).toMatchObject({ ok: true, isDir: true });
  });

  it('inspectAsset: an unreadable image header leaves the size out', () => {
    mkdirSync(join(tmp.dir, 'assets'));
    writeFileSync(join(tmp.dir, 'assets', 'broken.png'), 'not a png');
    expect(inspectAsset(tmp.dir, 'assets/broken.png').asset).toEqual({
      file: 'assets/broken.png',
      mime: 'image/png',
    });
  });
});
