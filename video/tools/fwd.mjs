#!/usr/bin/env node
// Speed up parts of a screen recording the way a video recorder fast-forwards:
// while a part runs fast, a pixel "FWD ▶▶" marker sits in the corner and VHS
// tracking lines drift across the picture. Parts at normal speed are untouched.
//
//   node video/tools/fwd.mjs --in raw.mp4 --out proof.mp4 --fast 12-95:8 --fast 130-300:20 [--width 720]
//
// --fast <from>-<to>:<factor>   seconds in the input, and how many times faster
// --width <px>                  scale the output to this width (default: keep)
// The marker is drawn here from a pixel grid, so no font file is needed.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const input = opt('--in');
const output = opt('--out');
const width = Number(opt('--width') || 0);
const fast = [];
args.forEach((a, i) => {
  if (a !== '--fast') return;
  const m = String(args[i + 1]).match(/^([\d.]+)-([\d.]+):([\d.]+)$/);
  if (!m) throw new Error(`--fast expects <from>-<to>:<factor>, got ${args[i + 1]}`);
  fast.push({ from: +m[1], to: +m[2], factor: +m[3] });
});
if (!input || !output) {
  console.error('usage: node fwd.mjs --in <file> --out <file> [--fast a-b:x]... [--width px]');
  process.exit(2);
}

const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], { encoding: 'utf8' });
const duration = parseFloat(probe.stdout);
if (!Number.isFinite(duration)) throw new Error(`cannot read the length of ${input}`);

// Normal and fast parts in order, covering the whole input.
fast.sort((a, b) => a.from - b.from);
const parts = [];
let t = 0;
for (const f of fast) {
  const from = Math.max(t, f.from);
  const to = Math.min(duration, f.to);
  if (to <= from) continue;
  if (from > t) parts.push({ from: t, to: from, factor: 1 });
  parts.push({ from, to, factor: f.factor });
  t = to;
}
if (t < duration) parts.push({ from: t, to: duration, factor: 1 });

// ---- the FWD ▶▶ marker, a 5x7 pixel font drawn into a PNG ------------------
const GLYPHS = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  '>': ['1000', '1100', '1110', '1111', '1110', '1100', '1000'],
};
function markerPng(scale) {
  const text = 'FWD >>';
  const cols = [];
  for (const ch of text) {
    const g = GLYPHS[ch];
    for (let x = 0; x < g[0].length; x++) cols.push(g.map((row) => row[x] === '1'));
    cols.push(Array(7).fill(false));
  }
  const pad = 2; // room for the outline
  const gw = cols.length + pad * 2;
  const gh = 7 + pad * 2;
  const on = (x, y) => x >= pad && y >= pad && x - pad < cols.length && y - pad < 7 && cols[x - pad][y - pad];
  const W = gw * scale;
  const H = gh * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / scale);
      const gy = Math.floor(y / scale);
      let rgba = [0, 0, 0, 0];
      if (on(gx, gy)) rgba = [255, 255, 255, 255];
      else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dy]) => on(gx + dx, gy + dy))) rgba = [10, 10, 10, 230];
      raw.set(rgba, y * (W * 4 + 1) + 1 + x * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the filter graph --------------------------------------------------------
const outW = width || 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-fwd-'));
const marker = path.join(tmp, 'fwd.png');
fs.writeFileSync(marker, markerPng(width ? Math.max(3, Math.round(width / 160)) : 6));

const fastParts = parts.filter((p) => p.factor > 1);
const longestFast = Math.max(0, ...fastParts.map((p) => (p.to - p.from) / p.factor));
const filters = [];
const labels = [];
if (fastParts.length) filters.push(`[1:v]split=${fastParts.length}${fastParts.map((_, k) => `[m${k}]`).join('')}`);
let k = 0;
parts.forEach((p, i) => {
  let chain = `[0:v]trim=start=${p.from}:end=${p.to},setpts=(PTS-STARTPTS)/${p.factor},fps=30`;
  if (outW) chain += `,scale=${outW}:-2:flags=bicubic`;
  chain += ',format=yuv420p';
  if (p.factor > 1) {
    // VHS: two pale bars drifting down at different speeds, grain, a small colour shift
    chain += ",drawbox=x=0:y='mod(t*260,ih)':w=iw:h=ih/90:color=white@0.30:t=fill" +
      ",drawbox=x=0:y='mod(t*170+ih/2,ih)':w=iw:h=ih/160:color=white@0.22:t=fill" +
      ',noise=alls=9:allf=t,chromashift=cbh=2:crh=-2';
    filters.push(`${chain}[b${i}]`);
    filters.push(`[b${i}][m${k++}]overlay=x=W/24:y=H/30:format=auto:shortest=1[v${i}]`);
  } else {
    filters.push(`${chain}[v${i}]`);
  }
  labels.push(`[v${i}]`);
});
filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[out]`);

const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-loop', '1', '-framerate', '30', '-t', String(Math.ceil(longestFast) + 1), '-i', marker,
  '-filter_complex', filters.join(';'), '-map', '[out]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-shortest', output], { encoding: 'utf8' });
fs.rmSync(tmp, { recursive: true, force: true });
if (ff.status !== 0) { console.error(ff.stderr); process.exit(1); }
const outDur = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output], { encoding: 'utf8' }).stdout.trim();
console.log(`${output}: ${parts.length} parts, ${duration.toFixed(1)} s in, ${(+outDur).toFixed(1)} s out`);
