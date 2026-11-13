// SVG helpers: pixel rasters as crisp rectangles, Inter text as outlines, and
// rendering an SVG to PNG with resvg (no browser, no system fonts).
import { Resvg } from '@resvg/resvg-js';
import { encodePNG } from './png.mjs';

let fontFile = null;
export function useFont(file) { fontFile = file; }
const resvgOptions = (extra = {}) => ({
  font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Inter' },
  shapeRendering: 2, textRendering: 1, imageRendering: 1, ...extra,
});

const num = (v) => String(Math.round(v * 100) / 100);

// A raster as SVG paths, one path per colour, cells merged into rectangles.
// (x, y) is the top left corner, s the size of one cell.
export function rasterSVG(r, theme, x, y, s) {
  const colourOf = (role) => (role == null ? null : theme[role]);
  if (r.px.some((role) => role != null && theme[role] === undefined)) {
    const missing = [...new Set(r.px.filter((role) => role != null && theme[role] === undefined))];
    throw new Error(`theme has no colour for ${missing.join(', ')}`);
  }
  const used = new Uint8Array(r.w * r.h);
  const byColour = new Map();
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const c = colourOf(r.px[j * r.w + i]);
    if (!c || c === 'none' || used[j * r.w + i]) continue;
    let w = 1;
    while (i + w < r.w && !used[j * r.w + i + w] && colourOf(r.px[j * r.w + i + w]) === c) w++;
    let h = 1;
    grow: while (j + h < r.h) {
      for (let k = 0; k < w; k++) if (used[(j + h) * r.w + i + k] || colourOf(r.px[(j + h) * r.w + i + k]) !== c) break grow;
      h++;
    }
    for (let jj = 0; jj < h; jj++) for (let k = 0; k < w; k++) used[(j + jj) * r.w + i + k] = 1;
    if (!byColour.has(c)) byColour.set(c, []);
    byColour.get(c).push(`M${num(x + i * s)} ${num(y + j * s)}h${num(w * s)}v${num(h * s)}h${num(-w * s)}z`);
  }
  return '<g shape-rendering="crispEdges">\n' +
    [...byColour].map(([c, d]) => `<path fill="${c}" d="${d.join('')}"/>`).join('\n') + '\n</g>';
}

// Text set in Inter Bold, as one outline path. Returns the path data with the
// baseline at y = 0 and x starting at 0, and the ink box.
const textCache = new Map();
export function textOutline(str, size, tracking = 0) {
  const key = `${str}|${size}|${tracking}`;
  if (textCache.has(key)) return textCache.get(key);
  const esc = str.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const base = size * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(size * str.length * 1.2 + 10)}" height="${size * 3}">` +
    `<text x="0" y="${base}" font-family="Inter" font-weight="700" font-size="${size}" letter-spacing="${tracking * size}">${esc}</text></svg>`;
  const out = new Resvg(svg, resvgOptions()).toString();
  const ds = [...out.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  let d = ds.join(' ');
  if (/[^MLQCZ0-9.\s-]/.test(d)) throw new Error('unexpected path command in text outline');
  // Shift to baseline 0 and collect the box.
  let i = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  d = d.replace(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g, (n) => {
    let v = parseFloat(n);
    if (i++ % 2 === 0) { x0 = Math.min(x0, v); x1 = Math.max(x1, v); }
    else { v -= base; y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    return num(v);
  });
  const res = { d, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  textCache.set(key, res);
  return res;
}

// The outline moved so its ink box starts at (x, y) (top left).
export function placeText(t, x, y, fill) {
  return `<path fill="${fill}" transform="translate(${num(x - t.box.x)} ${num(y - t.box.y)})" d="${t.d}"/>`;
}

export function svgDoc(w, h, body, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>\n` : '') + body + '\n</svg>\n';
}

// Render an SVG document to a PNG buffer, at its own size, `fit` px wide, or
// { height } px tall. Pixel art is crisp (crispEdges on its group); text
// outlines and the NTK mark keep their anti-aliasing.
export function renderPNG(svg, fit) {
  const fitTo = typeof fit === 'number' ? { mode: 'width', value: fit } : fit?.height ? { mode: 'height', value: fit.height } : null;
  const img = new Resvg(svg, resvgOptions(fitTo ? { fitTo } : {})).render();
  // resvg's pixels are premultiplied by alpha; PNG stores them straight.
  const rgba = new Uint8Array(img.pixels);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a > 0 && a < 255) for (let c = 0; c < 3; c++) rgba[i + c] = Math.min(255, Math.round((rgba[i + c] * 255) / a));
  }
  return encodePNG({ width: img.width, height: img.height, rgba });
}
