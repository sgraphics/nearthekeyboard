#!/usr/bin/env node
// Builds every NTK brand asset into out/ from the sources in this folder:
// palette.json (colours), lib/keyboard.mjs (the keyboard, modelled in 3D and
// projected onto a pixel grid), lib/icons.mjs and lib/badge.mjs (pixel grids
// as text) and fonts/Inter-Bold.ttf (the wordmark, turned into outlines).
//
//   cd brand && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './lib/png.mjs';
import { Raster, hexToRGBA } from './lib/raster.mjs';
import { drawKeyboard } from './lib/keyboard.mjs';
import { drawBadge } from './lib/badge.mjs';
import { iconKeyboard } from './lib/icons.mjs';
import { useFont, rasterSVG, textOutline, placeText, svgDoc, renderPNG } from './lib/svg.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
useFont(path.join(here, 'fonts', 'Inter-Bold.ttf'));

// ---------------------------------------------------------------- colours
const palette = JSON.parse(fs.readFileSync(path.join(here, 'palette.json'), 'utf8'));
const hexes = (set) => Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v.hex]));
const L = hexes(palette.light), D = hexes(palette.dark);

// Colour roles of the pixel art, per theme.
export const ART = {
  light: {
    bg: L.paper, shadow: L.grey1, outline: L.black,
    caseTop: L.white, caseFront: L.grey1, well: L.grey2,
    keyTop: L.white, keyFront: L.grey1, legend: L.black,
    darkTop: L.black, darkFront: D.key, darkLegend: L.white,
    accentTop: L.orange, accentFront: L.orangeShade, accentLegend: L.black,
    stripInk: L.black, stripAccent: L.orange, lightRing: L.black, lightOn: L.orange,
    text: L.black, muted: L.grey3,
  },
  dark: {
    bg: D.space, shadow: D.black, outline: D.rim,
    caseTop: D.key, caseFront: D.body, well: D.black,
    keyTop: D.edge, keyFront: D.key, legend: D.offWhite,
    darkTop: D.black, darkFront: D.body, darkLegend: D.offWhite,
    accentTop: D.orange, accentFront: D.orangeShade, accentLegend: D.black,
    stripInk: D.offWhite, stripAccent: D.orange, lightRing: D.rim, lightOn: D.orange,
    text: D.offWhite, muted: D.muted,
  },
};

// The small keyboard has no legends and one-cell gaps, so in the dark theme
// its keys and outline step up to the muted grey to stay readable at 48 px.
export const ART_SMALL = {
  light: ART.light,
  dark: { ...ART.dark, outline: D.muted, well: D.body, keyTop: D.muted, darkFront: D.black },
};

// ---------------------------------------------------------------- the keyboard
// The hero illustration: seen from the chair, one-point perspective, 12 cells
// a key unit on the nearest row. See KEYBOARD_DEFAULTS in lib/keyboard.mjs.
export const HERO = { U: 12, elev: 50, dist: 18, strip: 2.3, scheme: 'monolith', shadow: [2, 2] };
const hero = () => drawKeyboard(HERO);

// ---------------------------------------------------------------- output
const written = [];
function write(rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push([rel, data.length]);
}
const pixelPNG = (r, theme, scale = 1) => encodePNG(r.toRGBA(theme, scale));

// An RGBA image of size w x h filled with `hex`, with `img` pasted at (x, y).
function paste(w, h, hex, img, x, y) {
  const rgba = new Uint8Array(w * h * 4);
  const c = hexToRGBA(hex);
  for (let i = 0; i < w * h; i++) rgba.set(c, i * 4);
  for (let j = 0; j < img.height; j++) {
    for (let i = 0; i < img.width; i++) {
      const s = (j * img.width + i) * 4;
      if (img.rgba[s + 3] === 0) continue;
      rgba.set(img.rgba.subarray(s, s + 4), ((y + j) * w + x + i) * 4);
    }
  }
  return encodePNG({ width: w, height: h, rgba });
}

// ---------------------------------------------------------------- wordmark
const WORD = ['NEAR THE', 'KEYBOARD'];
const DOMAIN = 'ntk.tools';
const TRACKING = 0.01; // em
const r2 = (v) => Math.round(v * 100) / 100;

// The two lines, set by their baselines. `width` is the ink width of
// KEYBOARD; align 'center' or 'left'. Returns svg and the block's size.
function wordmark({ x, y, width, fill, align = 'center', gap = 0.36 }) {
  const size = (100 * width) / textOutline(WORD[1], 100, TRACKING).box.w;
  const lines = WORD.map((s) => textOutline(s, size, TRACKING));
  const cap = lines[0].box.h; // NEAR THE has no overshoot: its ink height is the cap height
  const lineGap = cap * gap;
  let svg = '';
  lines.forEach((t, i) => {
    const lx = align === 'center' ? x + (width - t.box.w) / 2 : x;
    const baseline = y + cap + i * (cap + lineGap);
    svg += `<path fill="${fill}" transform="translate(${r2(lx - t.box.x)} ${r2(baseline)})" d="${t.d}"/>\n`;
  });
  return { svg, w: width, h: cap * 2 + lineGap, size, cap };
}

// A small line of text (the domain), ink box top at y.
function smallText(str, x, y, capHeight, fill, align = 'left') {
  const t = textOutline(str, capHeight / 0.728, 0.02);
  const lx = align === 'center' ? x - t.box.w / 2 : align === 'right' ? x - t.box.w : x;
  return placeText(t, lx, y, fill) + '\n';
}

// ---------------------------------------------------------------- logo and banners
// Wordmark over the keyboard, centred in a W x H frame. `ratio` is the
// wordmark's width relative to the keyboard's.
function stacked({ W, H, mode, scale, ratio = 0.9, gap = 0.07, domain = false, lift = 0 }) {
  const t = ART[mode], kb = hero();
  const kw = kb.w * scale, kh = kb.h * scale;
  const probe = wordmark({ x: 0, y: 0, width: kw * ratio, fill: t.text });
  const g = Math.round(H * gap);
  const top = Math.round((H - (probe.h + g + kh)) / 2) - lift;
  const word = wordmark({ x: (W - probe.w) / 2, y: top, width: probe.w, fill: t.text });
  const kx = Math.round((W - kw) / 2), ky = Math.round(top + probe.h + g);
  let body = word.svg + rasterSVG(kb, t, kx, ky, scale);
  if (domain) body += smallText(DOMAIN, W / 2, ky + kh + Math.round((H - ky - kh) * 0.42), Math.round(H * 0.022), t.muted, 'center');
  return svgDoc(W, H, body, t.bg);
}

// Wordmark at the left, keyboard at the right.
function sideBySide({ W, H, mode, scale, wordWidth, wordX, kbRight, wordCY, kbCY }) {
  const t = ART[mode], kb = hero();
  const kw = kb.w * scale, kh = kb.h * scale;
  const probe = wordmark({ x: 0, y: 0, width: wordWidth, fill: t.text });
  const word = wordmark({ x: wordX, y: Math.round((wordCY ?? H / 2) - probe.h / 2), width: wordWidth, fill: t.text, align: 'left' });
  const kx = W - kbRight - kw, ky = Math.round((kbCY ?? H / 2) - kh / 2);
  return svgDoc(W, H, word.svg + rasterSVG(kb, t, kx, ky, scale), t.bg);
}

const logo = (mode) => stacked({ W: 1024, H: 1024, mode, scale: 4, ratio: 0.9, gap: 0.068 });

const BANNERS = {
  // X header: the avatar covers the bottom left (about 400 x 200), keep it clear.
  'x-header-1500x500': (mode) => sideBySide({ W: 1500, H: 500, mode, scale: 4, wordWidth: 470, wordX: 96, kbRight: 72, wordCY: 196, kbCY: 236 }),
  // GitHub social preview and README header: content inside a 40 px border.
  'social-1280x640': (mode) => stacked({ W: 1280, H: 640, mode, scale: 4, ratio: 0.62, gap: 0.05 }),
  // Video poster: the lower band stays calm for the player's controls.
  'poster-1600x900': (mode) => stacked({ W: 1600, H: 900, mode, scale: 4, ratio: 0.8, gap: 0.06, domain: true, lift: 30 }),
};

// ---------------------------------------------------------------- icons
// Android draws adaptive icons on a 108 dp square, of which a 66 dp circle is
// always visible. Cells of 2 dp give 2, 3, 4, 6 and 8 pixels a cell from mdpi
// to xxxhdpi, so every density is pixel-exact: 108 dp = 54 cells, and the
// 72 dp a launcher shows = the middle 36 cells.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function centred(size, art, fill = null) {
  const c = new Raster(size, size, fill);
  c.blit(art, Math.floor((size - art.w) / 2), Math.floor((size - art.h) / 2));
  return c;
}
// The icon keyboard on a 36-cell tile: what a launcher shows.
const tile36 = () => centred(36, iconKeyboard(), 'bg');

// Monochrome layer for themed icons (Android 13+): the outline and the key
// tops as one mask, which the system tints.
const MONO = new Set(['outline', 'keyTop', 'darkTop', 'accentTop']);
function monochrome(r) {
  const m = new Raster(r.w, r.h);
  m.px = r.px.map((x) => (MONO.has(x) ? 'mono' : null));
  return m;
}

// Tile shapes for launchers before Android 8, decided on cell centres.
function shapeMask(r, shape) {
  const n = r.w, h = n / 2, R = n * 0.16;
  const out = new Raster(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x + 0.5 - h, v = y + 0.5 - h;
    const inside = shape === 'round' ? u * u + v * v <= h * h
      : Math.hypot(Math.max(0, Math.abs(u) - (h - R)), Math.max(0, Math.abs(v) - (h - R))) <= R;
    if (inside) out.set(x, y, r.get(x, y));
  }
  return out;
}

// A .ico holding one PNG.
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = size; head[7] = size;
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- NTK launcher icon. Generated by brand/build.mjs; edit the source there. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

// ---------------------------------------------------------------- badge
// The 8-bit NTK mark: seven-row letters, slanted, four thin lines, the last
// one orange. 'light' is for light backgrounds (dark marks), 'dark' for dark
// backgrounds (light marks).
export const BADGE = { size: 7, cut: true, lines: 4, lineLength: 18, accentLine: 3, gapLines: 3 };
const BADGE_THEME = { light: { ink: L.black, accent: L.orange }, dark: { ink: D.offWhite, accent: D.orange } };

// ---------------------------------------------------------------- main
fs.rmSync(OUT, { recursive: true, force: true });

for (const mode of ['light', 'dark']) {
  const svg = logo(mode);
  write(`logo/ntk-logo-${mode}.svg`, svg);
  write(`logo/ntk-logo-${mode}.png`, renderPNG(svg));
}

for (const [name, fn] of Object.entries(BANNERS)) for (const mode of ['light', 'dark']) {
  const svg = fn(mode);
  write(`banner/ntk-${name}-${mode}.svg`, svg);
  write(`banner/ntk-${name}-${mode}.png`, renderPNG(svg));
}

// The keyboard on its own, transparent: 1x grid and scaled, hero and small.
for (const mode of ['light', 'dark']) {
  const t = ART[mode], kb = hero(), small = iconKeyboard();
  write(`keyboard/ntk-keyboard-${mode}-1x.png`, pixelPNG(kb, t, 1));
  write(`keyboard/ntk-keyboard-${mode}-4x.png`, pixelPNG(kb, t, 4));
  write(`keyboard/ntk-keyboard-${mode}.svg`, svgDoc(kb.w * 4, kb.h * 4, rasterSVG(kb, t, 0, 0, 4)));
  write(`keyboard/ntk-keyboard-small-${mode}-1x.png`, pixelPNG(small, ART_SMALL[mode], 1));
  write(`keyboard/ntk-keyboard-small-${mode}-8x.png`, pixelPNG(small, ART_SMALL[mode], 8));
}

// Android launcher icon.
{
  const t = ART.light;
  const fg = centred(54, iconKeyboard());
  const mono = monochrome(fg);
  for (const [dir, d] of Object.entries(DENSITIES)) {
    write(`android/mipmap-${dir}/ic_launcher_foreground.png`, pixelPNG(fg, t, 2 * d));
    write(`android/mipmap-${dir}/ic_launcher_monochrome.png`, pixelPNG(mono, { mono: '#FFFFFF' }, 2 * d));
    // Before Android 8: the 36-cell tile at the largest whole number of
    // pixels a cell that fits 48 dp, centred, as a rounded square and a circle.
    const px = 48 * d, k = Math.floor(px / 36);
    for (const [name, shape] of [['ic_launcher', 'square'], ['ic_launcher_round', 'round']]) {
      const img = shapeMask(tile36(), shape).toRGBA(t, k);
      const off = Math.floor((px - img.width) / 2);
      write(`android/mipmap-${dir}/${name}.png`, paste(px, px, 'transparent', img, off, off));
    }
  }
  write('android/mipmap-anydpi-v26/ic_launcher.xml', ADAPTIVE_XML);
  write('android/mipmap-anydpi-v26/ic_launcher_round.xml', ADAPTIVE_XML);
  write('android/values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- Generated by brand/build.mjs. -->\n<resources>\n' +
    `    <color name="ic_launcher_background">${t.bg}</color>\n</resources>\n`);

  // Store / legacy 512, full bleed (the store rounds the corners): 14 px a cell.
  write('icon/ntk-icon-512.png', paste(512, 512, t.bg, tile36().toRGBA(t, 14), 4, 4));
  write('icon/ntk-icon-foreground-432.png', pixelPNG(fg, t, 8));
  write('icon/ntk-icon-monochrome-432.png', pixelPNG(mono, { mono: L.black }, 8));

  // X avatar (X crops a circle): 11 px a cell.
  for (const mode of ['light', 'dark']) {
    write(`icon/ntk-avatar-400-${mode}.png`, paste(400, 400, ART[mode].bg, tile36().toRGBA(ART_SMALL[mode], 11), 2, 2));
  }

  // Favicons: transparent 32 px at one pixel a cell, and the iOS home screen icon.
  const favPNG = pixelPNG(centred(32, iconKeyboard({ shadow: null })), t, 1);
  write('icon/favicon-32.png', favPNG);
  write('icon/favicon.ico', ico(favPNG, 32));
  write('icon/apple-touch-icon-180.png', pixelPNG(tile36(), t, 5));
}

// Badge: 1x grid, scaled, SVG, and the Android drawables (12 px a cell).
{
  const b = drawBadge(BADGE);
  for (const mode of ['light', 'dark']) {
    const t = BADGE_THEME[mode];
    for (const k of [1, 4, 8, 16]) write(`badge/ntk-badge-${mode}-${k}x.png`, pixelPNG(b, t, k));
    write(`badge/ntk-badge-${mode}.svg`, svgDoc(b.w * 8, b.h * 8, rasterSVG(b, t, 0, 0, 8)));
    write(`android/drawable-nodpi/ntk_badge_${mode}.png`, pixelPNG(b, t, 12));
  }
}

const size = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
let total = 0;
for (const [rel, n] of written) { total += n; console.log(`${rel.padEnd(56)} ${size(n)}`); }
console.log(`${written.length} files, ${(total / 1024 / 1024).toFixed(2)} MB in out/`);
