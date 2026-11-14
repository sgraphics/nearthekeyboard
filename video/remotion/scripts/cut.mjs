#!/usr/bin/env node
// Cut ranges out of a screen recording and join them into one small clip for
// public/clips/: H.264, 30 fps, yuv420p, no audio, a keyframe every second (so
// the video can be read at any frame quickly while rendering).
//
//   node scripts/cut.mjs --in ../raw/take.mp4 --out public/clips/moment.mp4 \
//        --range 225.5-262 [--range 300-310[@2]]... [--width 1080] [--crf 27] [--gop 30]
//
// Ranges are seconds in the input. Several ranges are joined in order, as hard
// cuts. Speed-ups are not done here: they are set per clip in src/timeline.tsx,
// so they stay editable. A range written <from>-<to>@<fps> keeps its length but
// only <fps> different frames a second (each held until the next): for long
// stretches the video shows only at a high fast-forward, such as a wait for the
// network, so the file stays small and its times stay real.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const input = opt('--in');
const output = opt('--out');
const width = Number(opt('--width', '1080'));
const crf = String(opt('--crf', '27'));
const gop = String(opt('--gop', '30')); // frames between keyframes: more makes a long clip smaller, and slower to seek
const ranges = args.flatMap((a, i) => (a === '--range' ? [args[i + 1]] : [])).map((r) => {
  const m = String(r).match(/^([\d.]+)-([\d.]+)(?:@([\d.]+))?$/);
  if (!m || +m[2] <= +m[1]) throw new Error(`--range expects <from>-<to>[@fps] in seconds, got ${r}`);
  return { from: +m[1], to: +m[2], fps: m[3] ? +m[3] : 0 };
});
if (!input || !output || !ranges.length) {
  console.error('usage: node scripts/cut.mjs --in <file> --out <file> --range <from>-<to> [--range ...] [--width px] [--crf n]');
  process.exit(2);
}
if (!fs.existsSync(input)) throw new Error(`no such file: ${input}`);

const parts = ranges.map((r, i) =>
  `[0:v]trim=start=${r.from}:end=${r.to},setpts=PTS-STARTPTS,${r.fps ? `fps=${r.fps},` : ''}fps=30,scale=${width}:-2:flags=lanczos,format=yuv420p[p${i}]`);
const graph = [...parts, `${ranges.map((_, i) => `[p${i}]`).join('')}concat=n=${ranges.length}:v=1:a=0[out]`].join(';');
const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-filter_complex', graph, '-map', '[out]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-g', gop, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output],
{ encoding: 'utf8' });
if (ff.status !== 0) { console.error(ff.stderr); process.exit(1); }
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration,size',
  '-of', 'default=nw=1', output], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ').trim();
console.log(`${output}: ${probe}`);
