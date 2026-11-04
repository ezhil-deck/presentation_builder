// The pixel size of an image file from its header bytes (P4.3, the Studio's asset upload, docs/P4-spec.md §6): PNG,
// JPEG, GIF, WebP and SVG - the formats the Studio accepts. No dependency: each format's header is read where its
// specification puts the size. Used to answer an upload with {width, height} and to give the composer the size of an
// uploaded image (a focal point crops a cover image for the frame's aspect).

/** The image types the Studio accepts: file extension -> MIME type. */
export const IMAGE_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
});

const ascii = (buf, at, n) => buf.toString('latin1', at, at + n);

function png(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || ascii(buf, 12, 4) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gif(buf) {
  if (buf.length < 10 || !/^GIF8[79]a$/.test(ascii(buf, 0, 6))) return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function jpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const len = buf.readUInt16BE(at + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC): height then width
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { width: buf.readUInt16BE(at + 7), height: buf.readUInt16BE(at + 5) };
    at += 2 + len;
  }
  return null;
}

function webp(buf) {
  if (buf.length < 30 || ascii(buf, 0, 4) !== 'RIFF' || ascii(buf, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(buf, 12, 4);
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ')
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

/** An SVG's size: its width / height attributes (px or unitless), else its viewBox. */
function svg(buf) {
  const text = buf.toString('utf8', 0, Math.min(buf.length, 64 * 1024));
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const len = (v) => {
    const m = /^\s*([\d.]+)\s*(px)?\s*$/.exec(v ?? '');
    return m ? Number(m[1]) : null;
  };
  let width = len(attr('width'));
  let height = len(attr('height'));
  const box = (attr('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if ((!width || !height) && box.length === 4 && box[2] > 0 && box[3] > 0) {
    if (width && !height) height = (width * box[3]) / box[2];
    else if (height && !width) width = (height * box[2]) / box[3];
    else {
      width = box[2];
      height = box[3];
    }
  }
  return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null;
}

const READERS = { png, jpg: jpeg, jpeg, gif, webp, svg };

/**
 * The size of an image file: {width, height} read from `buf` as the type its extension names, or null when the bytes
 * are not that type (a renamed file) or carry no readable size.
 */
export function imageSize(buf, ext) {
  const read = READERS[String(ext ?? '').toLowerCase()];
  if (!read || !Buffer.isBuffer(buf)) return null;
  try {
    const size = read(buf);
    return size && size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}
