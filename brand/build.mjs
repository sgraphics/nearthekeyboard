#!/usr/bin/env node
// Builds every NTK brand asset into out/ from the sources in this folder:
// palette.json (colours), lib/keyboard.mjs (the keyboard, a smooth 3D drawing
// in SVG), lib/badge.mjs (the NTK mark, smooth vector lines) and fonts/
// (Inter Bold for the wordmark, Inter Light for small text; both turned into
// outlines, so no font needs to be installed to view the SVGs).
//
//   cd brand && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './lib/png.mjs';
import { keyboardInBox, keyboardAspect } from './lib/keyboard.mjs';
import { drawMark, markSVG, markVectorDrawable } from './lib/badge.mjs';
import { useFonts, textOutline, placeText, svgDoc, renderPNG, renderRGBA } from './lib/svg.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
useFonts(['Inter-Bold.ttf', 'Inter-Light.ttf'].map((f) => path.join(here, 'fonts', f)));

// ---------------------------------------------------------------- colours
const palette = JSON.parse(fs.readFileSync(path.join(here, 'palette.json'), 'utf8'));
const hexes = (set) => Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v.hex]));
const L = hexes(palette.light), D = hexes(palette.dark), G = hexes(palette.gold), I = hexes(palette.icon);
const GOLD = { spec: G.spec, light: G.light, mid: G.mid, dark: G.dark, deep: G.deep, shade: G.shadow };

// The keyboard's colour roles (see lib/keyboard.mjs), per theme. Pairs run
// from the back left of a surface to its front right; edges are [lit, shaded].
const KB_LIGHT = {
  shadow: L.shadow, shadowStrength: 1, contact: L.shadow, contactStrength: 1,
  wallLight: L.white, wallShade: L.wallShade, rim: L.white, rimStrength: 0, backEdge: L.backEdge,
  deck: [L.white, L.deck], seam: L.seam,
  key: [L.white, L.tile], keyEdge: [L.white, L.tileEdge], keyWall: L.tileWall,
  accent: [L.orangeLit, L.orange], accentEdge: [L.orangeEdgeLit, L.orangeEdge], accentWall: L.orangeWall,
  darkKey: [L.inkLit, L.ink], darkKeyEdge: [L.legend, L.ink], darkKeyWall: L.ink,
  legend: L.legend, accentLegend: L.ink, darkLegend: L.tick, engrave: L.seam, engraveHi: L.white,
  ringFill: L.studioEdge, ringFillOpacity: 0.35,
  display: [L.display, L.displayDeep], tick: L.tick, glassSheen: 0.06,
  gold: GOLD, led: L.orange, ledCore: L.ledCore, ledEdge: L.orangeEdge, ledGlow: 0.45,
};
const KB_DARK = {
  ...KB_LIGHT,
  shadow: D.shadow, shadowStrength: 2.6, contact: D.shadow, contactStrength: 1.5,
  wallLight: D.wallLight, wallShade: D.wallShade, rim: D.rim, rimStrength: 0.5, backEdge: D.backEdge,
  deck: [D.deck, D.deckFar], seam: D.seam,
  key: [D.tile, D.tileFar], keyEdge: [D.tileEdgeLit, D.tileEdge], keyWall: D.tileWall,
  legend: D.legend, engrave: D.seam, engraveHi: D.legendLit, ringFill: D.display, ringFillOpacity: 0.3,
  display: [D.display, D.displayDeep], tick: D.tick,
};

export const ART = {
  light: { bg: [L.studio, L.studioEdge], text: L.ink, muted: L.muted, kb: KB_LIGHT },
  dark: { bg: [D.studio, D.studioEdge], text: D.offWhite, muted: D.muted, kb: KB_DARK },
};
// On the orange icon tile the keyboard's shadow is a deep orange.
const onOrange = (kb) => ({ ...kb, shadow: I.shadow, shadowStrength: 1.5 });
// The monochrome icon layer: the keyboard as one white shape with the seams
// and the black key cut out (renderMono turns black into transparent).
const MONO = Object.fromEntries(Object.entries(KB_LIGHT).map(([k, v]) => [k,
  typeof v === 'number' ? v : k === 'gold' ? Object.fromEntries(Object.keys(v).map((g) => [g, '#FFFFFF']))
    : Array.isArray(v) ? v.map(() => '#FFFFFF') : '#FFFFFF']));
Object.assign(MONO, { contactStrength: 0, seam: '#000000', keyWall: '#000000', darkKey: ['#000000', '#000000'], darkKeyEdge: ['#000000', '#000000'], darkKeyWall: '#000000', shadowStrength: 0 });

// ---------------------------------------------------------------- output
const written = [];
function write(rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push([rel, data.length]);
}
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- the keyboard in a frame
// The keyboard (body and knob; its floor shadow falls outside) fitted into
// the box { x, y, w, h } and centred in it; each with its own ids.
let artId = 0;
const keyboardIn = (theme, box, opts = {}) => keyboardInBox({ ...opts, theme, id: `kb${artId++}` }, box).svg;
const aspect = (opts = {}) => keyboardAspect({ ...opts, theme: KB_LIGHT });

// The studio: a soft light round the keyboard, falling off to the edges. No grid.
let studioId = 0;
function studio(W, H, t, cx = W / 2, cy = H / 2) {
  const id = `studio${studioId++}`;
  const r = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  return `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}">` +
    `<stop offset="0" stop-color="${t.bg[0]}"/><stop offset="0.3" stop-color="${t.bg[0]}"/><stop offset="1" stop-color="${t.bg[1]}"/>` +
    `</radialGradient></defs>\n<rect width="${W}" height="${H}" fill="url(#${id})"/>\n`;
}

// ---------------------------------------------------------------- wordmark
const WORD = ['NEAR THE', 'KEYBOARD'];
const DOMAIN = 'ntk.tools';
const TRACKING = 0.01; // em

// The two lines in Inter Bold, set by their baselines. `width` is the ink
// width of KEYBOARD; align 'center' or 'left'. Returns svg and the block's size.
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

// A small line of text in Inter Light, widely tracked, ink box top at y.
function smallText(str, x, y, capHeight, fill, align = 'left') {
  const t = textOutline(str, capHeight / 0.728, 0.08, 300);
  const lx = align === 'center' ? x - t.box.w / 2 : align === 'right' ? x - t.box.w : x;
  return placeText(t, lx, y, fill) + '\n';
}

// ---------------------------------------------------------------- logo and banners
// Wordmark over the keyboard, centred in a W x H frame. `ratio` is the
// wordmark's width relative to the keyboard's.
function stacked({ W, H, mode, kbWidth, ratio = 0.75, gap = 0.06, domain = false, lift = 0 }) {
  const t = ART[mode];
  const kh = kbWidth / aspect();
  const probe = wordmark({ x: 0, y: 0, width: kbWidth * ratio, fill: t.text });
  const g = Math.round(H * gap);
  const top = Math.round((H - (probe.h + g + kh)) / 2) - lift;
  const word = wordmark({ x: (W - probe.w) / 2, y: top, width: probe.w, fill: t.text });
  const box = { x: (W - kbWidth) / 2, y: top + probe.h + g, w: kbWidth, h: kh };
  let body = studio(W, H, t, W / 2, box.y + kh * 0.55) + word.svg + keyboardIn(t.kb, box);
  if (domain) body += smallText(DOMAIN, W / 2, box.y + kh + Math.round((H - box.y - kh) * 0.5), Math.round(H * 0.02), t.muted, 'center');
  return svgDoc(W, H, body);
}

// Wordmark at the left, keyboard at the right.
function sideBySide({ W, H, mode, wordWidth, wordX, wordCY = H / 2, kb }) {
  const t = ART[mode];
  const probe = wordmark({ x: 0, y: 0, width: wordWidth, fill: t.text });
  const word = wordmark({ x: wordX, y: Math.round(wordCY - probe.h / 2), width: wordWidth, fill: t.text, align: 'left' });
  return svgDoc(W, H, studio(W, H, t, kb.x + kb.w / 2, kb.y + kb.h * 0.6) + word.svg + keyboardIn(t.kb, kb));
}

const logo = (mode) => stacked({ W: 1024, H: 1024, mode, kbWidth: 840, ratio: 0.74, gap: 0.05, lift: 10 });

const BANNERS = {
  // X header: the avatar covers the bottom left (about 400 x 200), keep it clear.
  'x-header-1500x500': (mode) => sideBySide({ W: 1500, H: 500, mode, wordWidth: 470, wordX: 96, wordCY: 196, kb: { x: 660, y: 56, w: 760, h: 380 } }),
  // GitHub social preview and README header: content inside a 40 px border.
  'social-1280x640': (mode) => sideBySide({ W: 1280, H: 640, mode, wordWidth: 440, wordX: 84, kb: { x: 590, y: 120, w: 630, h: 380 } }),
  // Video poster: the lower band stays calm for the player's controls.
  'poster-1600x900': (mode) => stacked({ W: 1600, H: 900, mode, kbWidth: 900, ratio: 0.7, gap: 0.05, domain: true, lift: 34 }),
};

// ---------------------------------------------------------------- icons
// Android draws adaptive icons on a 108 dp square, of which a 66 dp circle is
// always visible and about 72 dp is shown. The icon is drawn in those dp
// units: the small keyboard, 60 dp wide, centred, inside the safe circle.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const ICON_KB = { model: 'small' };
const iconKeyboard = (theme, w = 60) => {
  const h = w / aspect(ICON_KB);
  return keyboardIn(theme, { x: 54 - w / 2, y: 54 - h / 2 - 1, w, h }, ICON_KB);
};
// The 108 dp foreground (transparent), as an SVG `px` wide.
const foregroundSVG = (theme, px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">\n${iconKeyboard(theme)}\n</svg>\n`;
// What a launcher shows: the middle 72 dp on orange, as a full square, a
// rounded square or a circle, `px` wide.
function tileSVG(theme, px, shape = 'full') {
  const clip = shape === 'round' ? `<circle cx="54" cy="54" r="36"/>` : `<rect x="18" y="18" width="72" height="72" rx="${shape === 'square' ? 11.5 : 0}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="18 18 72 72">\n` +
    `<defs><clipPath id="tile">${clip}</clipPath></defs>\n<g clip-path="url(#tile)">\n<rect x="0" y="0" width="108" height="108" fill="${I.background}"/>\n` +
    `${iconKeyboard(theme)}\n</g>\n</svg>\n`;
}
// The monochrome layer: luminance becomes opacity, in one colour.
function renderMono(svg, hex) {
  const img = renderRGBA(svg);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < img.rgba.length; i += 4) {
    const lum = (img.rgba[i] * 0.2126 + img.rgba[i + 1] * 0.7152 + img.rgba[i + 2] * 0.0722) / 255;
    img.rgba.set([r, g, b, Math.round(img.rgba[i + 3] * lum)], i);
  }
  return encodePNG(img);
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
const BADGE_COLOUR = { light: L.orange, dark: L.orange };
const BADGE_PNG_HEIGHTS = [32, 64, 128, 256];
// On Android the mark is a VectorDrawable, which has no masks: its gaps are
// painted in the colour of the strip it sits on, so that colour comes from the
// app's theme (ntk_display in res/values and res/values-night: the strip is a dark display).
const BADGE_DP = 24;
function appColour(dir, name) {
  const file = path.join(here, '..', 'android', 'app', 'src', 'main', 'res', dir, 'colors-ntk.xml');
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`<color name="${name}">#([0-9A-Fa-f]{6}|[Ff]{2}[0-9A-Fa-f]{6})</color>`));
  if (!m) throw new Error(`no opaque colour ${name} in ${path.relative(here, file)}`);
  return '#' + m[1].slice(-6).toUpperCase();
}
const STRIP_BACKGROUND = { light: appColour('values', 'ntk_display'), dark: appColour('values-night', 'ntk_display') };

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

// The keyboard on its own, transparent, with room below and to the right for
// its shadow: the SVG and its PNG at 856 x 512 (the site's hero), a small PNG,
// and the icon keyboard (small).
for (const mode of ['light', 'dark']) {
  const t = ART[mode].kb;
  const doc = (W, H, opts = {}) => svgDoc(W, H, keyboardIn(t, { x: W * 0.035, y: H * 0.05, w: W * 0.87, h: H * 0.78 }, opts));
  const hero = doc(856, 512);
  write(`keyboard/ntk-keyboard-${mode}.svg`, hero);
  write(`keyboard/ntk-keyboard-${mode}-4x.png`, renderPNG(hero));
  write(`keyboard/ntk-keyboard-${mode}-1x.png`, renderPNG(doc(182, 94)));
  write(`keyboard/ntk-keyboard-small-${mode}-1x.png`, renderPNG(doc(62, 33, ICON_KB)));
  write(`keyboard/ntk-keyboard-small-${mode}-8x.png`, renderPNG(doc(496, 264, ICON_KB)));
}

// Android launcher icon and the other icons: the white keyboard on orange.
{
  const t = onOrange(KB_LIGHT);
  for (const [dir, d] of Object.entries(DENSITIES)) {
    const px = 108 * d;
    write(`android/mipmap-${dir}/ic_launcher_foreground.png`, renderPNG(foregroundSVG(t, px)));
    write(`android/mipmap-${dir}/ic_launcher_monochrome.png`, renderMono(foregroundSVG(MONO, px), '#FFFFFF'));
    // Before Android 8: the 72 dp a launcher shows, filling 48 dp, as a
    // rounded square and a circle.
    write(`android/mipmap-${dir}/ic_launcher.png`, renderPNG(tileSVG(t, 48 * d, 'square')));
    write(`android/mipmap-${dir}/ic_launcher_round.png`, renderPNG(tileSVG(t, 48 * d, 'round')));
  }
  write('android/mipmap-anydpi-v26/ic_launcher.xml', ADAPTIVE_XML);
  write('android/mipmap-anydpi-v26/ic_launcher_round.xml', ADAPTIVE_XML);
  write('android/values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- Generated by brand/build.mjs. -->\n<resources>\n' +
    `    <color name="ic_launcher_background">${I.background}</color>\n</resources>\n`);

  // Store / legacy 512, full bleed (the store rounds the corners).
  write('icon/ntk-icon-512.png', renderPNG(tileSVG(t, 512)));
  write('icon/ntk-icon-foreground-432.png', renderPNG(foregroundSVG(t, 432)));
  write('icon/ntk-icon-monochrome-432.png', renderMono(foregroundSVG(MONO, 432), L.ink));

  // X avatar (X crops a circle; the keyboard stays inside it). Light: the
  // white keyboard; dark: the graphite one.
  write('icon/ntk-avatar-400-light.png', renderPNG(tileSVG(t, 400)));
  write('icon/ntk-avatar-400-dark.png', renderPNG(tileSVG(onOrange(KB_DARK), 400)));

  // Favicon: the two-row keyboard on a rounded orange tile; the iOS home
  // screen icon (iOS rounds the corners itself).
  const fav = svgDoc(32, 32, `<rect width="32" height="32" rx="6" fill="${I.background}"/>\n` +
    keyboardIn(t, { x: 2.5, y: 6, w: 27, h: 19 }, { model: 'tiny' }));
  const favPNG = renderPNG(fav);
  write('icon/favicon-32.png', favPNG);
  write('icon/favicon.ico', ico(favPNG, 32));
  write('icon/apple-touch-icon-180.png', renderPNG(tileSVG(t, 180)));
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
        '     The orange lines are painted first, then the gaps between them in ntk_display',
        `     (${STRIP_BACKGROUND[mode]}, ${res}/colors-ntk.xml): draw it only on that colour.`,
      ].join('\n'),
    }));
  }
}

const size = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
let total = 0;
for (const [rel, n] of written) { total += n; console.log(`${rel.padEnd(56)} ${size(n)}`); }
console.log(`${written.length} files, ${(total / 1024 / 1024).toFixed(2)} MB in out/`);
