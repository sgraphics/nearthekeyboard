// A small PNG encoder for flat-colour art. node:zlib only.
//
// encodePNG({ width, height, rgba }) picks the smallest lossless form:
//   - 256 colours or fewer: an indexed PNG (1, 2, 4 or 8 bits a pixel, tRNS for
//     transparency), which is what pixel art almost always is;
//   - otherwise RGB or RGBA with an adaptive filter per row.
// Fully transparent pixels are stored as transparent black, so they share one
// palette entry.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function ihdr(width, height, bitDepth, colourType) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width, 0);
  b.writeUInt32BE(height, 4);
  b[8] = bitDepth;
  b[9] = colourType;
  b[10] = 0; // deflate
  b[11] = 0; // adaptive filtering
  b[12] = 0; // no interlace
  return b;
}

function deflateSmallest(raw) {
  let best = null;
  for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED]) {
    const out = zlib.deflateSync(raw, { level: 9, memLevel: 9, strategy });
    if (!best || out.length < best.length) best = out;
  }
  return best;
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// rows: array of Buffers (unfiltered scanlines), bpp: bytes per pixel (>= 1).
// mode 'none' writes filter 0 everywhere; 'adaptive' picks per row the filter
// with the smallest sum of absolute values.
function filterRows(rows, bpp, mode) {
  const out = [];
  let prev = Buffer.alloc(rows[0].length);
  for (const row of rows) {
    if (mode === 'none') {
      out.push(Buffer.from([0]), row);
    } else {
      let best = null, bestScore = Infinity;
      for (let f = 0; f < 5; f++) {
        const line = Buffer.alloc(row.length + 1);
        line[0] = f;
        let score = 0;
        for (let i = 0; i < row.length; i++) {
          const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
          const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
          const v = (row[i] - pred) & 255;
          line[i + 1] = v;
          score += v < 128 ? v : 256 - v;
        }
        if (score < bestScore) { bestScore = score; best = line; }
      }
      out.push(best);
    }
    prev = row;
  }
  return Buffer.concat(out);
}

export function encodePNG({ width, height, rgba }) {
  const n = width * height;
  const px = new Uint32Array(n);
  const colours = new Map();
  let opaque = true;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    const v = a === 0 ? 0 : ((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | a) >>> 0;
    if (a !== 255) opaque = false;
    px[i] = v;
    if (colours.size <= 256 && !colours.has(v)) colours.set(v, colours.size);
  }

  const parts = [SIGNATURE, null];
  let idat;
  if (colours.size <= 256) {
    // Transparent entries first, so tRNS stays short.
    const list = [...colours.keys()].sort((p, q) => ((p & 255) === 255) - ((q & 255) === 255) || p - q);
    const index = new Map(list.map((c, i) => [c, i]));
    const depth = list.length <= 2 ? 1 : list.length <= 4 ? 2 : list.length <= 16 ? 4 : 8;
    const perByte = 8 / depth;
    const rowBytes = Math.ceil(width / perByte);
    const rows = [];
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(rowBytes);
      for (let x = 0; x < width; x++) {
        const k = index.get(px[y * width + x]);
        row[(x / perByte) | 0] |= k << (8 - depth * ((x % perByte) + 1));
      }
      rows.push(row);
    }
    const plte = Buffer.alloc(list.length * 3);
    const trns = [];
    list.forEach((c, i) => {
      plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255;
      if ((c & 255) !== 255) trns.push(c & 255);
    });
    const a = deflateSmallest(filterRows(rows, 1, 'none'));
    const b = depth === 8 ? deflateSmallest(filterRows(rows, 1, 'adaptive')) : a;
    idat = a.length <= b.length ? a : b;
    parts[1] = chunk('IHDR', ihdr(width, height, depth, 3));
    parts.push(chunk('PLTE', plte));
    if (trns.length) parts.push(chunk('tRNS', Buffer.from(trns)));
  } else {
    const bpp = opaque ? 3 : 4;
    const rows = [];
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(width * bpp);
      for (let x = 0; x < width; x++) {
        const s = (y * width + x) * 4;
        for (let k = 0; k < bpp; k++) row[x * bpp + k] = rgba[s + k];
        if (!opaque && rgba[s + 3] === 0) row.fill(0, x * bpp, x * bpp + 4);
      }
      rows.push(row);
    }
    idat = deflateSmallest(filterRows(rows, bpp, 'adaptive'));
    parts[1] = chunk('IHDR', ihdr(width, height, 8, opaque ? 2 : 6));
  }
  parts.push(chunk('IDAT', idat));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
