// Builds a tiny TrueType font with known metrics, for the BR-METRICS tests and the mini fixture
// (`node packages/brand/__fixtures__/tiny-font.cjs` rewrites __fixtures__/mini/assets/fonts/Tiny-Regular.ttf).
// No outlines (no glyf/loca): cmap + hmtx + head/hhea/OS-2 are all the metrics reader uses.
//   unitsPerEm 1000, ascent 800, descent -200, lineGap 0, capHeight 700, xHeight 500
//   advances: space 250, digits 550, A-Z 600, a-z 500 (overridable)
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const RANGES = [
  { from: 0x20, to: 0x20, key: 'space' },
  { from: 0x30, to: 0x39, key: 'digit' },
  { from: 0x41, to: 0x5a, key: 'upper' },
  { from: 0x61, to: 0x7a, key: 'lower' },
];

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff);
  return b;
}
function i16(n) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}
const cat = (...parts) => Buffer.concat(parts.flat());

function checksum(buf) {
  const padded = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function buildTinyFont(options = {}) {
  const adv = { notdef: 500, space: 250, digit: 550, upper: 600, lower: 500, ...(options.advances || {}) };
  const upm = options.unitsPerEm || 1000;
  const glyphs = [adv.notdef];
  const segments = [];
  for (const r of RANGES) {
    const firstGid = glyphs.length;
    for (let cp = r.from; cp <= r.to; cp += 1) glyphs.push(adv[r.key]);
    segments.push({ start: r.from, end: r.to, delta: firstGid - r.from });
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const numGlyphs = glyphs.length;

  // prettier-ignore
  const head = cat(
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5), u16(0), u16(upm),
    u32(0), u32(0), u32(0), u32(0), // created, modified
    i16(0), i16(-200), i16(1000), i16(800), u16(0), u16(8), i16(2), i16(0), i16(0),
  );
  // prettier-ignore
  const hhea = cat(
    u32(0x00010000), i16(800), i16(-200), i16(0), u16(Math.max(...glyphs)), i16(0), i16(0), i16(1000),
    i16(1), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), u16(numGlyphs),
  );
  const maxp = cat(u32(0x00005000), u16(numGlyphs));
  const hmtx = cat(glyphs.map((a) => cat(u16(a), i16(0))));
  // prettier-ignore
  const os2 = cat(
    u16(2), i16(500), u16(400), u16(5), u16(0),
    i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), i16(0), // sub/superscript
    i16(50), i16(250), i16(0), Buffer.alloc(10), u32(1), u32(0), u32(0), u32(0), Buffer.from('NONE'),
    u16(0x40), u16(0x20), u16(0x7a), i16(800), i16(-200), i16(0), u16(800), u16(200), u32(1), u32(0),
    i16(500), i16(700), u16(0), u16(0x20), u16(1),
  );
  const segCount = segments.length;
  const entrySelector = Math.floor(Math.log2(segCount));
  const searchRange = 2 * 2 ** entrySelector;
  // prettier-ignore
  const format4Body = cat(
    u16(segCount * 2), u16(searchRange), u16(entrySelector), u16(segCount * 2 - searchRange),
    segments.map((s) => u16(s.end)), u16(0), segments.map((s) => u16(s.start)), segments.map((s) => u16(s.delta)),
    segments.map(() => u16(0)),
  );
  const format4 = cat(u16(4), u16(6 + format4Body.length), u16(0), format4Body);
  const cmap = cat(u16(0), u16(1), u16(3), u16(1), u32(12), format4);
  // prettier-ignore
  const post = cat(u32(0x00030000), u32(0), i16(-100), i16(50), u32(0), u32(0), u32(0), u32(0), u32(0));
  const name = cat(u16(0), u16(0), u16(6));

  const tables = { 'OS/2': os2, cmap, head, hhea, hmtx, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const numTables = tags.length;
  const es = Math.floor(Math.log2(numTables));
  const sr = 16 * 2 ** es;
  let offset = 12 + 16 * numTables;
  const records = [];
  const bodies = [];
  for (const tag of tags) {
    const data = tables[tag];
    const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    records.push(
      cat(Buffer.from(tag.padEnd(4, ' '), 'ascii'), u32(checksum(data)), u32(offset), u32(data.length)),
    );
    bodies.push(padded);
    offset += padded.length;
  }
  return cat(u32(0x00010000), u16(numTables), u16(sr), u16(es), u16(numTables * 16 - sr), records, bodies);
}

module.exports = { buildTinyFont };

if (require.main === module) {
  const dir = join(__dirname, 'mini', 'assets', 'fonts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Tiny-Regular.ttf'), buildTinyFont());
}
