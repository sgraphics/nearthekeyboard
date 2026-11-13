#!/usr/bin/env node
// Builds every NTK brand asset into out/ from the sources in this folder:
// palette.json (colours), lib/keyboard.mjs (the keyboard, built from extruded
// blocks on a pixel grid), lib/badge.mjs (the NTK mark, smooth vector lines)
// and fonts/Inter-Bold.ttf (the wordmark, turned into outlines).
//
//   cd brand && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './lib/png.mjs';
import { Raster, hexToRGBA } from './lib/raster.mjs';
import { drawKeyboard, SMALL, FAVICON } from './lib/keyboard.mjs';
import { drawMark, markSVG, markVectorDrawable } from './lib/badge.mjs';
import { useFont, rasterSVG, textOutline, placeText, svgDoc, renderPNG } from './lib/svg.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
useFont(path.join(here, 'fonts', 'Inter-Bold.ttf'));

// ---------------------------------------------------------------- colours
const palette = JSON.parse(fs.readFileSync(path.join(here, 'palette.json'), 'utf8'));
const hexes = (set) => Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v.hex]));
const L = hexes(palette.light), D = hexes(palette.dark);

// Colour roles of the pixel art, per theme. Every block has a top, a lit front
// and a shaded side; light comes softly from the top left.
export const ART = {
  light: {
    bg: L.paper, shadow: L.drop,
    bodyTop: L.top, bodyFront: L.lit, bodySide: L.shade,
    keyTop: L.white, keyFront: L.lit, keySide: L.shade, legend: L.ink,
    darkTop: L.slate, darkFront: L.slateLit, darkSide: L.slateShade,
    accentTop: L.orange, accentFront: L.orangeLit, accentSide: L.orangeShade,
    text: L.ink, muted: L.muted,
  },
  dark: {
    bg: D.space, shadow: D.drop,
    bodyTop: D.top, bodyFront: D.lit, bodySide: D.shade,
    keyTop: D.key, keyFront: D.keyLit, keySide: D.keyShade, legend: D.offWhite,
    darkTop: D.slate, darkFront: D.slateLit, darkSide: D.slateShade,
    accentTop: D.orange, accentFront: D.orangeLit, accentSide: D.orangeShade,
    text: D.offWhite, muted: D.muted,
  },
};
// Icons stand on orange: the white keyboard on it reads at 48 px, with no
// outline. Its drop is the orange's lit step.
export const ICON = { ...ART.light, bg: L.orange, shadow: L.orangeLit };

// ---------------------------------------------------------------- the keyboard
// The hero illustration: see KEYBOARD_DEFAULTS in lib/keyboard.mjs.
const hero = () => drawKeyboard();
const small = () => drawKeyboard(SMALL);

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

const logo = (mode) => stacked({ W: 1024, H: 1024, mode, scale: 5, ratio: 0.75, gap: 0.05 });

const BANNERS = {
  // X header: the avatar covers the bottom left (about 400 x 200), keep it clear.
  'x-header-1500x500': (mode) => sideBySide({ W: 1500, H: 500, mode, scale: 4, wordWidth: 470, wordX: 96, kbRight: 64, wordCY: 196, kbCY: 250 }),
  // GitHub social preview and README header: content inside a 40 px border.
  'social-1280x640': (mode) => sideBySide({ W: 1280, H: 640, mode, scale: 3, wordWidth: 460, wordX: 84, kbRight: 72 }),
  // Video poster: the lower band stays calm for the player's controls.
  'poster-1600x900': (mode) => stacked({ W: 1600, H: 900, mode, scale: 4, ratio: 0.82, gap: 0.05, domain: true, lift: 30 }),
};

// ---------------------------------------------------------------- icons
// Android draws adaptive icons on a 108 dp square, of which a 66 dp circle is
// always visible. The icon art is drawn on a grid of 1 dp cells: 108 cells,
// and the 72 dp a launcher shows = the middle 72 cells. mdpi, xhdpi, xxhdpi
// and xxxhdpi get 1, 2, 3 and 4 whole pixels a cell; hdpi (1.5) is sampled
// nearest-neighbour, so it stays hard-edged.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// The art centred on a size x size grid. Its desk shadow (SMALL.shadow steps:
// two pixels right and one down a step) is left out of the centring.
function centred(size, art, fill = null, k = SMALL.shadow) {
  const c = new Raster(size, size, fill);
  c.blit(art, Math.floor((size - art.w + 2 * k) / 2), Math.floor((size - art.h + k) / 2));
  return c;
}
// The icon keyboard on a 72-cell tile: what a launcher shows.
const tile72 = () => centred(72, small(), 'bg');

// A raster as RGBA of any size, nearest neighbour (cells may get uneven
// widths when the size is not a whole multiple; edges stay hard).
function sized(r, theme, W, H) {
  if (W % r.w === 0 && W / r.w === H / r.h) return r.toRGBA(theme, W / r.w);
  const one = r.toRGBA(theme, 1), rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sxp = Math.floor(((x + 0.5) * r.w) / W), syp = Math.floor(((y + 0.5) * r.h) / H);
    rgba.set(one.rgba.subarray((syp * r.w + sxp) * 4, (syp * r.w + sxp) * 4 + 4), (y * W + x) * 4);
  }
  return { width: W, height: H, rgba };
}

// Monochrome layer for themed icons (Android 13+): the keyboard as one shape
// with the key fronts and gaps cut out, which the system tints.
const MONO_OFF = new Set(['keyFront', 'keySide', 'darkFront', 'darkSide', 'accentFront', 'accentSide', 'shadow']);
function monochrome(r) {
  const m = new Raster(r.w, r.h);
  m.px = r.px.map((x) => (x != null && !MONO_OFF.has(x) ? 'mono' : null));
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
// The NTK mark (lib/badge.mjs): N, T and K, each as two parallel orange lines.
// The same orange on light and dark backgrounds. 'light' is for light
// backgrounds, 'dark' for dark ones.
const BADGE_COLOUR = { light: L.orange, dark: D.orange };
const BADGE_PNG_HEIGHTS = [32, 64, 128, 256];
// On Android the mark is a VectorDrawable, which has no masks: its gaps are
// painted in the colour of the strip it sits on, so that colour comes from the
// app's theme (ntk_background in res/values and res/values-night).
const BADGE_DP = 24;
function appColour(dir, name) {
  const file = path.join(here, '..', 'android', 'app', 'src', 'main', 'res', dir, 'colors-ntk.xml');
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`<color name="${name}">#([0-9A-Fa-f]{6}|[Ff]{2}[0-9A-Fa-f]{6})</color>`));
  if (!m) throw new Error(`no opaque colour ${name} in ${path.relative(here, file)}`);
  return '#' + m[1].slice(-6).toUpperCase();
}
const STRIP_BACKGROUND = { light: appColour('values', 'ntk_background'), dark: appColour('values-night', 'ntk_background') };

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
  const t = ART[mode], kb = hero(), s = small();
  write(`keyboard/ntk-keyboard-${mode}-1x.png`, pixelPNG(kb, t, 1));
  write(`keyboard/ntk-keyboard-${mode}-4x.png`, pixelPNG(kb, t, 4));
  write(`keyboard/ntk-keyboard-${mode}.svg`, svgDoc(kb.w * 4, kb.h * 4, rasterSVG(kb, t, 0, 0, 4)));
  write(`keyboard/ntk-keyboard-small-${mode}-1x.png`, pixelPNG(s, t, 1));
  write(`keyboard/ntk-keyboard-small-${mode}-8x.png`, pixelPNG(s, t, 8));
}

// Android launcher icon.
{
  const t = ICON;
  const fg = centred(108, small());
  const mono = monochrome(fg);
  for (const [dir, d] of Object.entries(DENSITIES)) {
    const px = 108 * d;
    write(`android/mipmap-${dir}/ic_launcher_foreground.png`, encodePNG(sized(fg, t, px, px)));
    write(`android/mipmap-${dir}/ic_launcher_monochrome.png`, encodePNG(sized(mono, { mono: '#FFFFFF' }, px, px)));
    // Before Android 8: the 72-cell tile filling 48 dp, as a rounded square
    // and a circle.
    for (const [name, shape] of [['ic_launcher', 'square'], ['ic_launcher_round', 'round']]) {
      write(`android/mipmap-${dir}/${name}.png`, encodePNG(sized(shapeMask(tile72(), shape), t, 48 * d, 48 * d)));
    }
  }
  write('android/mipmap-anydpi-v26/ic_launcher.xml', ADAPTIVE_XML);
  write('android/mipmap-anydpi-v26/ic_launcher_round.xml', ADAPTIVE_XML);
  write('android/values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- Generated by brand/build.mjs. -->\n<resources>\n' +
    `    <color name="ic_launcher_background">${t.bg}</color>\n</resources>\n`);

  // Store / legacy 512, full bleed (the store rounds the corners): 7 px a cell.
  write('icon/ntk-icon-512.png', paste(512, 512, t.bg, tile72().toRGBA(t, 7), 4, 4));
  write('icon/ntk-icon-foreground-432.png', pixelPNG(fg, t, 4));
  write('icon/ntk-icon-monochrome-432.png', pixelPNG(mono, { mono: L.ink }, 4));

  // X avatar (X crops a circle): 5 px a cell, on the icon's orange. Light:
  // the white keyboard; dark: the charcoal one.
  const darkIcon = { ...ART.dark, bg: L.orange, shadow: L.orangeLit };
  write('icon/ntk-avatar-400-light.png', paste(400, 400, t.bg, tile72().toRGBA(t, 5), 20, 20));
  write('icon/ntk-avatar-400-dark.png', paste(400, 400, t.bg, tile72().toRGBA(darkIcon, 5), 20, 20));

  // Favicons: a smaller keyboard on the orange tile at one pixel a cell, and
  // the iOS home screen icon.
  const fav = shapeMask(centred(32, drawKeyboard(FAVICON), 'bg', FAVICON.shadow), 'square');
  const favPNG = pixelPNG(fav, t, 1);
  write('icon/favicon-32.png', favPNG);
  write('icon/favicon.ico', ico(favPNG, 32));
  write('icon/apple-touch-icon-180.png', paste(180, 180, t.bg, tile72().toRGBA(t, 2), 18, 18));
}

// Badge: the SVG (gaps cut out by a mask, so they are transparent), smooth
// PNGs at a few heights, and the Android VectorDrawables.
{
  const m = drawMark();
  for (const mode of ['light', 'dark']) {
    const svg = markSVG(m, { color: BADGE_COLOUR[mode] });
    write(`badge/ntk-badge-${mode}.svg`, svg);
    for (const h of BADGE_PNG_HEIGHTS) write(`badge/ntk-badge-${mode}-${h}.png`, renderPNG(svg, { height: h }));
    const res = mode === 'light' ? 'res/values' : 'res/values-night';
    write(`android/drawable/ntk_badge_${mode}.xml`, markVectorDrawable(m, {
      color: BADGE_COLOUR[mode], background: STRIP_BACKGROUND[mode], heightDp: BADGE_DP,
      comment: [
        `The NTK mark for the ${mode} theme. Generated by brand/build.mjs (lib/badge.mjs); edit the source there.`,
        '     The orange lines are painted first, then the gaps between them in ntk_background',
        `     (${STRIP_BACKGROUND[mode]}, ${res}/colors-ntk.xml): draw it only on that colour.`,
      ].join('\n'),
    }));
  }
}

const size = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
let total = 0;
for (const [rel, n] of written) { total += n; console.log(`${rel.padEnd(56)} ${size(n)}`); }
console.log(`${written.length} files, ${(total / 1024 / 1024).toFixed(2)} MB in out/`);
