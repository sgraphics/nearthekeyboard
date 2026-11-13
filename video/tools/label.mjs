#!/usr/bin/env node
// Puts a small, steady label in a dark band at the top of a video, and
// optionally scales it, as the last step before a proof video is shared.
//
//   node video/tools/label.mjs --in fwd.mjs-output.mp4 --out video/out/proof.mp4 \
//        --text "NTK proof · testnet · typing by the test robot (synthetic typist)" [--width 720] [--poster at-seconds:poster.png]
//        [--hold <s>]   keep the last frame on screen this much longer (a still end)
//
// The font is Inter (the brand's font) when installed, else Segoe UI.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const input = opt('--in');
const output = opt('--out');
const text = opt('--text', 'NTK proof · testnet · typing by the test robot (synthetic typist)');
const width = Number(opt('--width', '0'));
const poster = opt('--poster');
const hold = Number(opt('--hold', '0'));
if (!input || !output) {
  console.error('usage: node video/tools/label.mjs --in <file> --out <file> [--text <label>] [--width px] [--poster <s>:<png>]');
  process.exit(2);
}

const fonts = ['C:/Windows/Fonts/Inter SemiBold.ttf', 'C:/Windows/Fonts/seguisb.ttf', 'C:/Windows/Fonts/segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
const font = fonts.find((f) => fs.existsSync(f));
if (!font) throw new Error('no font found for the label');
// Filter-graph escaping: the drive colon is escaped, and the path is quoted (it may hold a space).
const esc = (p) => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-label-'));
const textFile = path.join(tmp, 'label.txt');
fs.writeFileSync(textFile, text, 'utf8');

const vf = [];
if (hold > 0) vf.push(`tpad=stop_mode=clone:stop_duration=${hold}`);
if (width) vf.push(`scale=${width}:-2:flags=bicubic`);
// Band height and type size follow the picture's width: 720 px wide gives a 40 px band and 18 px type.
vf.push('drawbox=x=0:y=0:w=iw:h=round(iw/18):color=0x0A0A0A@0.78:t=fill');
vf.push(`drawtext=fontfile=${esc(font)}:textfile=${esc(textFile)}:fontcolor=white:fontsize=round(w/40)`
  + ':x=(w-text_w)/2:y=(round(w/18)-text_h)/2');
vf.push('format=yuv420p');

const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', vf.join(','), '-an',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { encoding: 'utf8' });
if (ff.status !== 0) {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.error(ff.stderr);
  process.exit(1);
}
if (poster) {
  const [t, png] = poster.split(/:(.+)/);
  const p = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', output, '-frames:v', '1', png], { encoding: 'utf8' });
  if (p.status !== 0) console.error(p.stderr);
}
fs.rmSync(tmp, { recursive: true, force: true });
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:format=duration',
  '-of', 'default=nw=1', output], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ').trim();
console.log(`${output}: ${probe} (font ${path.basename(font)})`);
