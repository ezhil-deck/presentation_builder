import jpeg from 'jpeg-js';
import { borderMedian, decodeImage, diffBbox, luminance, nearShare, opaqueStats } from '../src/pixels.js';
import { pngBuffer, writeFile } from './claimsFixture.js';
import { tmpDir } from './helpers.js';

describe('pixels', () => {
  const tmp = tmpDir();
  afterAll(() => tmp.cleanup());

  it('decodes a PNG: its size and RGBA pixels', () => {
    writeFile(tmp.dir, 'a.png', pngBuffer(7, 3, [255, 0, 0, 255]));
    const img = decodeImage(`${tmp.dir}/a.png`);
    expect(img.ok).toBe(true);
    expect([img.width, img.height, img.data.length]).toEqual([7, 3, 7 * 3 * 4]);
    expect([...img.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('decodes a JPEG: its size', () => {
    const data = Buffer.alloc(16 * 8 * 4, 255);
    writeFile(tmp.dir, 'b.jpg', jpeg.encode({ data, width: 16, height: 8 }, 90).data);
    const img = decodeImage(`${tmp.dir}/b.jpg`);
    expect(img.ok).toBe(true);
    expect([img.width, img.height]).toEqual([16, 8]);
    expect(opaqueStats(img).meanLuminance).toBeGreaterThan(0.95);
  });

  it('does not decode other formats or broken files (negative)', () => {
    writeFile(tmp.dir, 'c.webp', Buffer.from('RIFF0000WEBPVP8 '));
    expect(decodeImage(`${tmp.dir}/c.webp`)).toEqual({
      ok: false,
      reason: expect.stringMatching(/format not decoded/),
    });
    writeFile(tmp.dir, 'd.png', Buffer.from('not a png'));
    expect(decodeImage(`${tmp.dir}/d.png`)).toEqual({
      ok: false,
      reason: expect.stringMatching(/format not decoded/),
    });
  });

  it('luminance: WCAG relative luminance', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6);
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(128, 128, 128)).toBeCloseTo(0.2159, 3);
  });

  it('opaqueStats: the opaque box and the mean luminance of opaque pixels only', () => {
    writeFile(
      tmp.dir,
      'e.png',
      pngBuffer(10, 10, [0, 0, 0, 0], [{ x: 2, y: 3, w: 4, h: 5, rgba: [255, 255, 255, 255] }]),
    );
    const s = opaqueStats(decodeImage(`${tmp.dir}/e.png`));
    expect(s.bbox).toEqual({ x: 2, y: 3, w: 4, h: 5 });
    expect(s.opaqueShare).toBeCloseTo(0.2, 6);
    expect(s.meanLuminance).toBeCloseTo(1, 6);
  });

  it('borderMedian / diffBbox / nearShare', () => {
    writeFile(
      tmp.dir,
      'f.png',
      pngBuffer(20, 20, [10, 20, 30, 255], [{ x: 5, y: 6, w: 8, h: 4, rgba: [250, 250, 250, 255] }]),
    );
    const img = decodeImage(`${tmp.dir}/f.png`);
    expect(borderMedian(img, { x: 0, y: 0, w: 20, h: 20 })).toEqual([10, 20, 30]);
    expect(diffBbox(img, { x: 0, y: 0, w: 20, h: 20 }, [10, 20, 30], 48).bbox).toEqual({
      x: 5,
      y: 6,
      w: 8,
      h: 4,
    });
    expect(nearShare(img, [10, 20, 30], 10)).toBeCloseTo(1 - 32 / 400, 6);
  });
});
