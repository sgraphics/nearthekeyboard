// The NTK keyboard, as if Polestar had made one: a white body with softly
// rounded edges, matte white key tiles with thin dark seams between them, an
// orange Enter key, and a strip at the back with a dark glass display, a round
// orange status light and a knurled gold knob. Smooth SVG, no pixels: shapes,
// gradients and a soft layered shadow on the floor (feGaussianBlur).
//
// The keyboard is modelled in millimetres and drawn in an orthographic
// three-quarter view from the front left and above. World axes: x along the
// keyboard (left to right), y from the front edge to the back, z up; the
// floor is z = 0. Every flat face is an exact projection (a rounded corner
// becomes an elliptical arc). The body's walls are drawn as thin horizontal
// slices from the floor up, each a rounded rectangle shaded by the direction
// its wall faces, so the shading follows the rounded corners and the rounded
// top and bottom edges.
//
// keyboardArt({ theme, scale, x, y }) returns { svg, box }: an SVG fragment
// (defs and shapes, no <svg> element) and its bounding box without the floor
// shadow, in px. (x, y) is where the front left corner of the floor footprint
// lands; scale is px per mm. build.mjs supplies the theme (palette.json).

const rad = (d) => (d * Math.PI) / 180;
const r2 = (v) => String(Math.round(v * 100) / 100);
const r3 = (v) => String(Math.round(v * 1000) / 1000);

// ---------------------------------------------------------------- colour
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };

// ---------------------------------------------------------------- layouts
// Rows back to front; a key is its width in units, or [width, id]. The id
// picks a key's kind through the scheme (white unless it says 'accent' or
// 'dark') and its engraved icon (ICONS). Letter keys are blank.
export const LAYOUT = [
  [[1, 'esc'], 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, [2, 'back']],
  [[1.5, 'tab'], 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, [1.5, 'bslash']],
  [[1.75, 'caps'], 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, [2.25, 'enter']],
  [[2.25, 'shiftL'], 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, [2.75, 'shiftR']],
  [1.25, 1.25, 1.25, [6.25, 'space'], 1.25, 1.25, 1.25, 1.25],
];

// Icon size: six units across, three rows, the same accents.
export const LAYOUT_SMALL = [
  [1, 1, 1, 1, 1, 1],
  [1.5, 1, 1, 1, [1.5, 'enter']],
  [1.25, [3.5, 'space'], 1.25],
];

// Favicon size: four units, two rows.
export const LAYOUT_TINY = [
  [1, 1, 1, [1, 'enter']],
  [0.75, [2.5, 'space'], 0.75],
];
const keyOf = (k) => (Array.isArray(k) ? k : [k]);

export const SCHEMES = {
  // White tiles and an orange Enter.
  standard: { enter: 'accent' },
  // On an orange tile (the icons) an orange key would read as a hole: a black Enter.
  onOrange: { enter: 'dark' },
};

// Thin engraved icons, in mm on the key top: x to the right, y towards the
// back of the keyboard; centred on the key. Polylines.
const ICONS = {
  back: [[[3, 0], [-3, 0]], [[-1.5, 1.5], [-3, 0], [-1.5, -1.5]]],
  tab: [[[-3, 0], [2.2, 0]], [[0.7, 1.5], [2.2, 0], [0.7, -1.5]], [[3.1, 1.8], [3.1, -1.8]]],
  enter: [[[2.8, 2.4], [2.8, -0.6], [-2.8, -0.6]], [[-1.3, 0.9], [-2.8, -0.6], [-1.3, -2.1]]],
  shiftL: [[[0, 3], [3, 0], [1.35, 0], [1.35, -2.4], [-1.35, -2.4], [-1.35, 0], [-3, 0], [0, 3]]],
  shiftR: [[[0, 3], [3, 0], [1.35, 0], [1.35, -2.4], [-1.35, -2.4], [-1.35, 0], [-3, 0], [0, 3]]],
};

// ---------------------------------------------------------------- models
// Dimensions in mm. A key unit is 19.05 mm, as on a real keyboard.
export const MODELS = {
  full: {
    layout: LAYOUT, pitch: 19.05,
    seam: 0.75,       // between tiles
    keyRadius: 2.6, keyHeight: 0.8, bevel: 0.6, // tiles stand 0.8 mm proud of the deck; bevel: their rounded edge
    side: 9.5, front: 9.5, strip: 28, // body around the keys; the strip at the back holds display, light and knob
    height: 11, radius: 10, topRound: 3.2, bottomRound: 1.6, // body thickness, corner radius, edge roundings
    knob: { r: 8.5, h: 14, ring: 11.6, inset: 15, knurl: [36, 7] }, // inset: centre from the inner right edge; knurl: facets around, rows
    led: { r: 1.6, gap: 21 },        // gap: from the knob's centre
    display: { depth: 11, units: 6, ticks: 19 }, // units: its length in key units, from the left
    legends: true,
    scheme: 'standard',
  },
  small: {
    layout: LAYOUT_SMALL, pitch: 19.05,
    seam: 1.5, keyRadius: 3.2, keyHeight: 1.2, bevel: 0.9,
    side: 8, front: 8, strip: 24, height: 12, radius: 11, topRound: 3.6, bottomRound: 1.8,
    knob: { r: 7.5, h: 13, ring: 10, inset: 9, knurl: [24, 4] },
    led: { r: 1.8, gap: 18 },
    display: null, legends: false, scheme: 'onOrange',
  },
  // At 32 px: two rows, a plain knob, and a steeper view, so the rows read.
  tiny: {
    layout: LAYOUT_TINY, pitch: 19.05,
    seam: 3, keyRadius: 4, keyHeight: 1.2, bevel: 0,
    side: 7, front: 7, strip: 13, height: 12, radius: 10, topRound: 3.6, bottomRound: 1.8,
    knob: { r: 6, h: 9, ring: 0, inset: 4, knurl: null }, led: null, display: null, legends: false, scheme: 'onOrange',
    camera: { yaw: 16, pitch: 60 },
  },
};

// The camera: turned `yaw` degrees about the vertical, looking down at `pitch`.
export const CAMERA = { yaw: 22, pitch: 46 };

// Light: a large soft key light above, behind and to the left, and a weak fill
// from the camera's side. Intensity 1 on the deck; walls and edges fall off
// towards 0.82 (see wallColour).
const KEY = norm([-0.45, 0.5, 0.74]), FILL = norm([-0.3, -0.8, 0.5]);
const AMBIENT = 0.8226, K_KEY = 0.191, K_FILL = 0.0708, I_MIN = 0.8;
function norm(v) { const l = Math.hypot(...v); return v.map((c) => c / l); }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------- projection
export class View {
  constructor({ yaw, pitch, scale = 1, x = 0, y = 0 }) {
    this.ca = Math.cos(rad(yaw)); this.sa = Math.sin(rad(yaw));
    this.cp = Math.cos(rad(pitch)); this.sp = Math.sin(rad(pitch));
    this.yaw = yaw; this.s = scale; this.ox = x; this.oy = y;
  }
  // Screen position of the world point (x, y, z), in px.
  p(x, y, z = 0) {
    return [this.ox + this.s * (x * this.ca - y * this.sa), this.oy - this.s * ((x * this.sa + y * this.ca) * this.sp + z * this.cp)];
  }
}

const pt = ([u, v]) => `${r2(u)} ${r2(v)}`;
const poly = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
const line = (pts) => 'M' + pts.map(pt).join('L');

// A rounded rectangle lying flat at height z, as path data. Corners become
// arcs of axis-aligned ellipses; the path runs anticlockwise.
function rrect(V, x0, y0, x1, y1, r, z) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const P = (x, y) => pt(V.p(x, y, z));
  if (r === 0) return `M${P(x0, y0)}L${P(x1, y0)}L${P(x1, y1)}L${P(x0, y1)}Z`;
  const arc = (x, y) => `A${r2(V.s * r)} ${r2(V.s * r * V.sp)} 0 0 0 ${P(x, y)}`;
  return `M${P(x0 + r, y0)}L${P(x1 - r, y0)}${arc(x1, y0 + r)}L${P(x1, y1 - r)}${arc(x1 - r, y1)}` +
    `L${P(x0 + r, y1)}${arc(x0, y1 - r)}L${P(x0, y0 + r)}${arc(x0 + r, y0)}Z`;
}

// The same outline as points (n per corner), for hulls and boxes.
function rrectPoints(x0, y0, x1, y1, r, n = 6) {
  const pts = [];
  const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = rad(a0 + (90 * i) / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  corner(x1 - r, y0 + r, -90); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, 90); corner(x0 + r, y0 + r, 180);
  return pts;
}

// Convex hull of screen points (monotone chain).
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function boxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of points) { x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------- defs
function context(V, T, m, id) {
  const ctx = { V, T, m, defs: [], n: 0 };
  ctx.uid = (k) => `${id}-${k}${ctx.n++}`;
  ctx.linear = ([x1, y1], [x2, y2], stops) => {
    const gid = ctx.uid('g');
    ctx.defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}">` +
      stops.map(([o, c, a = 1]) => `<stop offset="${r3(o)}" stop-color="${c}"${a < 1 ? ` stop-opacity="${r3(a)}"` : ''}/>`).join('') + '</linearGradient>');
    return `url(#${gid})`;
  };
  ctx.radial = ([cx, cy], [rx, ry], stops, focus = [cx, cy]) => {
    const gid = ctx.uid('r');
    // An elliptical radial gradient: a circle of radius rx, squashed to ry.
    const k = ry / rx;
    ctx.defs.push(`<radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${r2(cx)}" cy="${r2(cy / k)}" r="${r2(rx)}" fx="${r2(focus[0])}" fy="${r2(focus[1] / k)}" gradientTransform="scale(1 ${r3(k)})">` +
      stops.map(([o, c, a = 1]) => `<stop offset="${r3(o)}" stop-color="${c}"${a < 1 ? ` stop-opacity="${r3(a)}"` : ''}/>`).join('') + '</radialGradient>');
    return `url(#${gid})`;
  };
  // A Gaussian blur of `sd` px, with a filter region round `box` wide enough for it.
  ctx.blur = (sd, box) => {
    const fid = ctx.uid('f'), pad = 3 * sd + 2;
    ctx.defs.push(`<filter id="${fid}" filterUnits="userSpaceOnUse" x="${r2(box.x0 - pad)}" y="${r2(box.y0 - pad)}" width="${r2(box.x1 - box.x0 + 2 * pad)}" height="${r2(box.y1 - box.y0 + 2 * pad)}" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur stdDeviation="${r2(sd)}"/></filter>`);
    return `url(#${fid})`;
  };
  ctx.clip = (d) => {
    const cid = ctx.uid('c');
    ctx.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
    return `url(#${cid})`;
  };
  return ctx;
}

// ---------------------------------------------------------------- dimensions
function dimensions(m) {
  const p = m.pitch, rows = m.layout.length;
  const units = m.layout[0].reduce((w, k) => w + keyOf(k)[0], 0);
  const fieldW = units * p, fieldD = rows * p;
  const W = fieldW + 2 * m.side, D = fieldD + m.front + m.strip, H = m.height;
  const stripY = m.front + fieldD + m.strip / 2;
  const knob = m.knob && { x: W - m.side - m.knob.inset, y: stripY };
  return { p, rows, units, fieldW, fieldD, W, D, H, fx: m.side, fy: m.front, stripY, knob };
}

// ---------------------------------------------------------------- the body
// A wall facing horizontal direction theta (degrees, 180 = left, 270 = front)
// and tilted up by beta (the rounded edges), lit by KEY and FILL.
function wallColour(T, theta, beta) {
  const n = [Math.cos(rad(beta)) * Math.cos(rad(theta)), Math.cos(rad(beta)) * Math.sin(rad(theta)), Math.sin(rad(beta))];
  const I = AMBIENT + K_KEY * Math.max(0, dot(n, KEY)) + K_FILL * Math.max(0, dot(n, FILL));
  const t = Math.max(0, Math.min(1, (I - I_MIN) / (1 - I_MIN)));
  let c = mix(T.wallShade, T.wallLight, t);
  // A soft highlight along the top edge, where it turns from wall to deck.
  if (T.rim && beta > 0) c = mix(c, T.rim, T.rimStrength * Math.exp(-(((beta - 58) / 16) ** 2)));
  return c;
}

// The visible lower outline of a rounded rectangle at height z, from its left
// silhouette to its right one: [u, theta] pairs in increasing u.
function lowerChain(V, x0, y0, x1, y1, r, z) {
  const a = V.yaw, out = [];
  const add = (cx, cy, th) => out.push([V.p(cx + r * Math.cos(rad(th)), cy + r * Math.sin(rad(th)), z)[0], th]);
  for (let th = 180 - a; th < 180; th += 6) add(x0 + r, y1 - r, th);
  add(x0 + r, y1 - r, 180);
  add(x0 + r, y0 + r, 180);
  for (let th = 186; th < 270; th += 6) add(x0 + r, y0 + r, th);
  add(x0 + r, y0 + r, 270);
  add(x1 - r, y0 + r, 270);
  for (let th = 276; th < 360 - a; th += 6) add(x1 - r, y0 + r, th);
  add(x1 - r, y0 + r, 360 - a);
  return out;
}

// The rest of the outline, from the right silhouette round the back to the
// left one: screen points. Only the top rounding shows there, as a thin band
// along the back edge.
function upperChain(V, x0, y0, x1, y1, r, z) {
  const a = V.yaw, pts = [];
  const add = (cx, cy, th) => pts.push(V.p(cx + r * Math.cos(rad(th)), cy + r * Math.sin(rad(th)), z));
  for (let th = -a; th < 0; th += 5) add(x1 - r, y0 + r, th);
  for (let th = 0; th < 90; th += 5) add(x1 - r, y1 - r, th);
  for (let th = 90; th < 180 - a; th += 5) add(x0 + r, y1 - r, th);
  add(x0 + r, y1 - r, 180 - a);
  return pts;
}

// The back edge's rounding, seen from the front: a little darker than the
// deck on white, so the silhouette holds on a white page; a rim of light on
// a dark body.
function backColour(T, beta) {
  const t = Math.max(0, Math.min(1, (beta - 40) / 50));
  return mix(T.backEdge, T.wallLight, t * t * (3 - 2 * t));
}

function body(ctx, d) {
  const { V, T, m } = ctx;
  const { W, D, H } = d;
  const R = m.radius, rt = m.topRound, rb = m.bottomRound;
  // Slices from the floor up: [z, inset, tilt].
  const slices = [];
  for (let a = -64; a < 0; a += 16) slices.push([rb + rb * Math.sin(rad(a)), rb - rb * Math.cos(rad(a)), a]);
  const nw = Math.max(2, Math.round((H - rt - rb) / 0.8));
  for (let i = 0; i < nw; i++) slices.push([rb + ((H - rt - rb) * i) / nw, 0, 0]);
  for (let a = 0; a < 90; a += 5) slices.push([H - rt + rt * Math.sin(rad(a)), rt - rt * Math.cos(rad(a)), a]);
  let out = '';
  for (const [z, inset, beta] of slices) {
    const x0 = inset, y0 = inset, x1 = W - inset, y1 = D - inset, r = R - inset;
    const chain = lowerChain(V, x0, y0, x1, y1, r, z);
    const u0 = chain[0][0], u1 = chain.at(-1)[0];
    let stops = [];
    for (const [u, th] of chain) {
      const o = (u - u0) / (u1 - u0);
      if (stops.length && o - stops.at(-1)[0] < 0.002) continue;
      stops.push([o, wallColour(T, th, beta)]);
    }
    // A stop between two of the same colour adds nothing.
    stops = stops.filter((s, i) => i === 0 || i === stops.length - 1 || s[1] !== stops[i - 1][1] || s[1] !== stops[i + 1][1]);
    const fill = ctx.linear([u0, 0], [u1, 0], stops);
    out += `<path d="${rrect(V, x0, y0, x1, y1, r, z)}" fill="${fill}"/>\n`;
    if (beta > 0) {
      // The back half, blending into the front half's colours at the silhouettes.
      const back = backColour(T, beta);
      const upper = ctx.linear([u0, 0], [u1, 0], [[0, stops[0][1]], [0.06, back], [0.94, back], [1, stops.at(-1)[1]]]);
      out += `<path d="${poly(upperChain(V, x0, y0, x1, y1, r, z))}" fill="${upper}"/>\n`;
    }
  }
  // The deck: lighter at the back left, where the light comes from.
  const deckFill = ctx.linear(V.p(0, D, H), V.p(W, 0, H), [[0, T.deck[0]], [1, T.deck[1]]]);
  out += `<path d="${rrect(V, rt, rt, W - rt, D - rt, R - rt, H)}" fill="${deckFill}"/>\n`;
  return out;
}

// ---------------------------------------------------------------- floor shadow
// Layers of the footprint, each moved towards the front right (away from the
// key light), grown and blurred: [dx, dy, grow, blur, opacity], mm.
const SHADOW_LAYERS = [
  [0.3, -0.8, -0.8, 0.7, 0.55],
  [1.5, -3, -0.5, 2.6, 0.26],
  [5, -10, 2, 9, 0.16],
  [9, -18, 5, 15, 0.1],
];

function floorShadow(ctx, d) {
  const { V, T, m } = ctx;
  let out = '';
  for (const [dx, dy, g, b, a] of SHADOW_LAYERS) {
    const x0 = dx - g, y0 = dy - g, x1 = d.W + dx + g, y1 = d.D + dy + g, r = m.radius + g;
    const box = boxOf(rrectPoints(x0, y0, x1, y1, r).map(([x, y]) => V.p(x, y, 0)));
    const o = Math.min(1, a * T.shadowStrength);
    out += `<path d="${rrect(V, x0, y0, x1, y1, r, 0)}" fill="${T.shadow}" fill-opacity="${r3(o)}" filter="${ctx.blur(b * V.s, box)}"/>\n`;
  }
  return out;
}

// ---------------------------------------------------------------- the strip
function strip(ctx, d) {
  const { V, T, m } = ctx;
  const s = V.s, z = d.H;
  let out = '';
  // A soft shade on the deck round the key field (the tiles stand in a
  // recess and shade its rim a little, most towards the front), then the tray
  // under the tiles: what shows in the seams.
  const g = m.seam;
  const tx0 = d.fx - g / 2, ty0 = d.fy - g / 2, tx1 = d.fx + d.fieldW + g / 2, ty1 = d.fy + d.fieldD + g / 2;
  if (T.contactStrength > 0) {
    const ao = rrectPoints(tx0 - 0.8, ty0 - 1.6, tx1 + 0.8, ty1, m.keyRadius + 1, 4).map(([x, y]) => V.p(x, y, z));
    out += `<path d="${rrect(V, tx0 - 0.8, ty0 - 1.6, tx1 + 0.8, ty1, m.keyRadius + 1, z)}" fill="${T.contact}" fill-opacity="${r3(Math.min(1, 0.1 * T.contactStrength))}" filter="${ctx.blur(1.1 * s, boxOf(ao))}"/>\n`;
  }
  out += `<path d="${rrect(V, tx0, ty0, tx1, ty1, m.keyRadius + g / 2, z)}" fill="${T.seam}"/>\n`;

  if (m.display && d.knob) {
    const x0 = d.fx, x1 = d.fx + m.display.units * d.p - m.seam / 2, y0 = d.stripY - m.display.depth / 2, y1 = d.stripY + m.display.depth / 2;
    out += `<path d="${rrect(V, x0 - g, y0 - g, x1 + g, y1 + g, 2.2 + g, z)}" fill="${T.seam}"/>\n`;
    const glass = rrect(V, x0, y0, x1, y1, 2.2, z);
    out += `<path d="${glass}" fill="${ctx.linear(V.p(x0, y1, z), V.p(x1, y0, z), [[0, T.display[0]], [1, T.display[1]]])}"/>\n`;
    // A typing rhythm: thin bars rising from a baseline, one in orange.
    const n = m.display.ticks, base = y0 + 2.6, top = y1 - 2, xa = x0 + 6, xb = x1 - 6;
    let grey = '', hot = '';
    for (let i = 0; i < n; i++) {
      const x = xa + ((xb - xa) * i) / (n - 1);
      const h = 0.15 + 0.85 * Math.abs(Math.sin(i * 1.71) * Math.cos(i * 0.43 + 0.6)) ** 1.4;
      const seg = line([V.p(x, base, z), V.p(x, base + (top - base) * h, z)]);
      if (i === Math.round(n * 0.74)) hot += seg; else grey += seg;
    }
    out += `<path d="${grey}" fill="none" stroke="${T.tick}" stroke-width="${r2(0.5 * s)}" stroke-linecap="round" stroke-opacity="0.8"/>\n`;
    out += `<path d="${line([V.p(xa - 2, base - 1.2, z), V.p(xb + 2, base - 1.2, z)])}" fill="none" stroke="${T.tick}" stroke-width="${r2(0.22 * s)}" stroke-opacity="0.4"/>\n`;
    out += `<path d="${hot}" fill="none" stroke="${T.led}" stroke-width="${r2(0.6 * s)}" stroke-linecap="round"/>\n`;
    // A faint reflection across the glass.
    const band = [[x0 + (x1 - x0) * 0.52, y1 + 1], [x0 + (x1 - x0) * 0.62, y1 + 1], [x0 + (x1 - x0) * 0.5, y0 - 1], [x0 + (x1 - x0) * 0.4, y0 - 1]];
    out += `<path d="${poly(band.map(([x, y]) => V.p(x, y, z)))}" fill="#FFFFFF" fill-opacity="${T.glassSheen}" clip-path="${ctx.clip(glass)}"/>\n`;
  }

  if (d.knob && m.knob.ring) {
    // The engraved ring round the knob.
    const k = m.knob, [cu, cv] = V.p(d.knob.x, d.knob.y, z), rx = k.ring * s, ry = rx * V.sp;
    out += `<ellipse cx="${r2(cu)}" cy="${r2(cv + 0.06 * s)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="none" stroke="${T.engraveHi}" stroke-width="${r2(0.3 * s)}"/>\n`;
    out += `<ellipse cx="${r2(cu)}" cy="${r2(cv)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="${T.ringFill}" fill-opacity="${T.ringFillOpacity}" stroke="${T.engrave}" stroke-width="${r2(0.22 * s)}" stroke-opacity="0.7"/>\n`;
  }
  return out;
}

// ---------------------------------------------------------------- the keys
function keyList(m, d) {
  const scheme = typeof m.scheme === 'string' ? SCHEMES[m.scheme] : m.scheme;
  const keys = [], g = m.seam, p = d.p;
  m.layout.forEach((row, ri) => {
    const y0 = d.fy + (d.rows - 1 - ri) * p;
    let u = 0;
    for (const [w, id] of row.map(keyOf)) {
      keys.push({ x0: d.fx + u * p + g / 2, x1: d.fx + (u + w) * p - g / 2, y0: y0 + g / 2, y1: y0 + p - g / 2, id, kind: scheme[id] ?? 'key', ri });
      u += w;
    }
  });
  // Back rows first; in a row, right to left: nearer tiles cover farther ones.
  return keys.sort((a, b) => a.ri - b.ri || b.x0 - a.x0);
}

function keys(ctx, d) {
  const { V, T, m } = ctx;
  const z0 = d.H, z1 = d.H + m.keyHeight, r = m.keyRadius, e = m.bevel;
  // White tiles share one gradient across the field; others get their own.
  const whiteFace = ctx.linear(V.p(d.fx, d.fy + d.fieldD, z1), V.p(d.fx + d.fieldW, d.fy, z1), [[0, T.key[0]], [1, T.key[1]]]);
  const look = (kind) => ({
    key: { face: whiteFace, edge: T.keyEdge, wall: T.keyWall, legend: [T.legend, T.engraveHi] },
    accent: { face: null, faces: T.accent, edge: T.accentEdge, wall: T.accentWall, legend: [T.accentLegend, T.accentEdge[0]] },
    dark: { face: null, faces: T.darkKey, edge: T.darkKeyEdge, wall: T.darkKeyWall, legend: [T.darkLegend, T.darkKeyEdge[0]] },
  })[kind];
  let out = '';
  for (const k of keyList(m, d)) {
    const L = look(k.kind);
    const top = rrectPoints(k.x0, k.y0, k.x1, k.y1, r, 4);
    const wall = hull([...top.map(([x, y]) => V.p(x, y, z1)), ...top.map(([x, y]) => V.p(x, y, z0))]);
    out += `<path d="${poly(wall)}" fill="${L.wall}"/>`;
    if (e > 0) {
      // The rounded edge: light along the back and left, darker along the front and right.
      out += `<path d="${rrect(V, k.x0, k.y0, k.x1, k.y1, r, z1)}" fill="${L.edge[0]}"/>`;
      out += `<path d="${rrect(V, k.x0 + e, k.y0, k.x1, k.y1 - e, r, z1)}" fill="${L.edge[1]}"/>`;
    }
    const face = L.face ?? ctx.linear(V.p(k.x0, k.y1, z1), V.p(k.x1, k.y0, z1), [[0, L.faces[0]], [1, L.faces[1]]]);
    out += `<path d="${rrect(V, k.x0 + e, k.y0 + e, k.x1 - e, k.y1 - e, r - e * 0.6, z1)}" fill="${face}"/>`;
    if (m.legends && ICONS[k.id]) out += engrave(ctx, ICONS[k.id], (k.x0 + k.x1) / 2, (k.y0 + k.y1) / 2, z1, L.legend);
    out += '\n';
  }
  return out;
}

// A thin icon cut into a key top: a dark line, with a light line beside it on
// the side away from the light (the groove's far wall, catching it).
function engrave(ctx, icon, cx, cy, z, [dark, lit]) {
  const s = ctx.V.s;
  const path = (dx, dy) => icon.map((pl) => line(pl.map(([x, y]) => ctx.V.p(cx + x + dx, cy + y + dy, z)))).join('');
  return `<path d="${path(0.22, -0.22)}" fill="none" stroke="${lit}" stroke-width="${r2(0.4 * s)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>` +
    `<path d="${path(0, 0)}" fill="none" stroke="${dark}" stroke-width="${r2(0.38 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------- the knob
function knob(ctx, d) {
  const { V, T, m } = ctx;
  const k = m.knob, s = V.s, G = T.gold;
  const kx = d.knob.x, ky = d.knob.y, z0 = d.H, z1 = d.H + k.h, c = Math.min(0.9, k.r * 0.1);
  const [cu, vb] = V.p(kx, ky, z0), vt = V.p(kx, ky, z1)[1];
  const R = k.r * s, Ry = R * V.sp;
  const at = (th, z) => [cu + R * Math.cos(rad(th)), V.p(kx, ky, z)[1] + Ry * Math.sin(rad(th))];
  let out = '';

  // Its shadow on the deck, towards the front right, and a contact shadow.
  const dir = norm([0.42, -1, 0]), len = k.h * 1.3;
  const capsule = [];
  for (let a = 0; a < 360; a += 10) {
    const [x, y] = [kx + k.r * Math.cos(rad(a)), ky + k.r * Math.sin(rad(a))];
    capsule.push(V.p(x, y, z0), V.p(x + dir[0] * len, y + dir[1] * len, z0));
  }
  const shadowPts = hull(capsule);
  out += `<path d="${poly(shadowPts)}" fill="${T.contact}" fill-opacity="${r3(Math.min(1, 0.3 * T.contactStrength))}" filter="${ctx.blur(1.5 * s, boxOf(shadowPts))}"/>\n`;
  const cbox = { x0: cu - R, y0: vb - Ry, x1: cu + R, y1: vb + Ry };
  out += `<ellipse cx="${r2(cu)}" cy="${r2(vb + 0.3 * s)}" rx="${r2(R + 0.3 * s)}" ry="${r2(Ry + 0.3 * s)}" fill="${T.contact}" fill-opacity="${r3(Math.min(1, 0.4 * T.contactStrength))}" filter="${ctx.blur(0.7 * s, cbox)}"/>\n`;

  // The side: a cylinder in brushed gold, bright and dark bands across it.
  const side = `M${pt([cu - R, vt])}L${pt([cu - R, vb])}A${r2(R)} ${r2(Ry)} 0 0 0 ${pt([cu + R, vb])}L${pt([cu + R, vt])}Z`;
  out += `<path d="${side}" fill="${ctx.linear([cu - R, 0], [cu + R, 0], [
    [0, G.deep], [0.07, G.dark], [0.2, G.light], [0.3, G.spec], [0.41, G.light], [0.6, G.mid], [0.8, G.dark], [0.91, G.mid], [1, G.deep]])}"/>\n`;

  // Knurling: a lattice of small pyramids, each lit on its upper left facet
  // and shaded on its lower right one.
  if (k.knurl) {
    const [N, M] = k.knurl, dth = 360 / N, za = z0 + 1.1, zb = z1 - c - 0.9, dz = (zb - za) / M;
    const facets = [[], [], [], []]; // upper left, upper right, lower left, lower right
    const clampT = (t) => Math.max(0, Math.min(180, t)), clampZ = (z) => Math.max(za, Math.min(zb, z));
    for (let j = 0; j <= 2 * M; j++) {
      const zc = za + (j * dz) / 2, off = (j % 2) * (dth / 2);
      for (let th = -dth + off; th <= 180 + dth; th += dth) {
        if (th + dth / 2 < 0 || th - dth / 2 > 180) continue;
        const C = at(clampT(th), clampZ(zc));
        const Tp = at(clampT(th), clampZ(zc + dz / 2)), B = at(clampT(th), clampZ(zc - dz / 2));
        const Lf = at(clampT(th + dth / 2), clampZ(zc)), Rt = at(clampT(th - dth / 2), clampZ(zc));
        facets[0].push(poly([Tp, Lf, C])); facets[1].push(poly([Tp, Rt, C]));
        facets[2].push(poly([B, Lf, C])); facets[3].push(poly([B, Rt, C]));
      }
    }
    const looks = [['#FFFFFF', 0.34], ['#FFFFFF', 0.12], [G.shade, 0.16], [G.shade, 0.4]];
    facets.forEach((f, i) => { out += `<path d="${f.join('')}" fill="${looks[i][0]}" fill-opacity="${looks[i][1]}"/>\n`; });
  }

  // The top: a polished chamfer, then a brushed face with a soft bow-tie sheen.
  const vc = V.p(kx, ky, z1 - c)[1];
  out += `<ellipse cx="${r2(cu)}" cy="${r2(vc)}" rx="${r2(R)}" ry="${r2(Ry)}" fill="${ctx.linear([cu - R, vc - Ry], [cu + R * 0.6, vc + Ry], [[0, G.spec], [0.55, G.light], [1, G.dark]])}"/>\n`;
  const Rt = (k.r - c) * s, Rty = Rt * V.sp;
  const faceD = `M${pt([cu - Rt, vt])}A${r2(Rt)} ${r2(Rty)} 0 1 0 ${pt([cu + Rt, vt])}A${r2(Rt)} ${r2(Rty)} 0 1 0 ${pt([cu - Rt, vt])}Z`;
  out += `<path d="${faceD}" fill="${ctx.radial([cu - Rt * 0.15, vt - Rty * 0.2], [Rt * 1.1, Rty * 1.1], [[0, G.light], [0.7, G.mid], [1, G.dark]])}"/>\n`;
  const toward = Math.atan2(-V.ca, -V.sa) * 180 / Math.PI;
  const clip = ctx.clip(faceD);
  let sheen = '';
  for (const a0 of [toward, toward + 180]) {
    const w = [[kx, ky]];
    for (let a = a0 - 16; a <= a0 + 16; a += 4) w.push([kx + (k.r + 1) * Math.cos(rad(a)), ky + (k.r + 1) * Math.sin(rad(a))]);
    sheen += poly(w.map(([x, y]) => V.p(x, y, z1)));
  }
  out += `<g clip-path="${clip}"><path d="${sheen}" fill="${G.spec}" fill-opacity="0.75" filter="${ctx.blur(0.09 * R, { x0: cu - R, y0: vt - Ry, x1: cu + R, y1: vt + Ry })}"/>`;
  for (const f of [0.3, 0.55, 0.8]) out += `<ellipse cx="${r2(cu)}" cy="${r2(vt)}" rx="${r2(Rt * f)}" ry="${r2(Rty * f)}" fill="none" stroke="${G.dark}" stroke-opacity="0.18" stroke-width="${r2(0.12 * s)}"/>`;
  out += '</g>\n';
  return out;
}

// ---------------------------------------------------------------- the light
function statusLight(ctx, d) {
  const { V, T, m } = ctx;
  const s = V.s, l = m.led, [cu, cv] = V.p(d.knob.x - l.gap, d.stripY, d.H);
  const rx = l.r * s, ry = rx * V.sp;
  let out = '';
  const glow = { x0: cu - 4 * rx, y0: cv - 4 * ry, x1: cu + 4 * rx, y1: cv + 4 * ry };
  out += `<ellipse cx="${r2(cu)}" cy="${r2(cv)}" rx="${r2(rx * 3.2)}" ry="${r2(ry * 3.2)}" fill="${T.led}" fill-opacity="${T.ledGlow}" filter="${ctx.blur(rx * 1.3, glow)}"/>\n`;
  out += `<ellipse cx="${r2(cu)}" cy="${r2(cv)}" rx="${r2(rx + 0.45 * s)}" ry="${r2(ry + 0.45 * s * V.sp)}" fill="${T.seam}" fill-opacity="0.55"/>\n`;
  out += `<ellipse cx="${r2(cu)}" cy="${r2(cv)}" rx="${r2(rx)}" ry="${r2(ry)}" fill="${ctx.radial([cu - rx * 0.2, cv - ry * 0.25], [rx, ry], [[0, T.ledCore], [0.55, T.led], [1, T.ledEdge]])}"/>\n`;
  return out;
}

// ---------------------------------------------------------------- assembly
// opts: { model: 'full' | 'small' | 'tiny' | {...}, theme, scale (px per mm),
//         x, y, camera: { yaw, pitch }, shadow: true, id: 'kb' }
export function keyboardArt(opts) {
  const m = typeof opts.model === 'object' ? opts.model : { ...MODELS[opts.model ?? 'full'], ...(opts.scheme ? { scheme: opts.scheme } : {}) };
  const V = new View({ ...CAMERA, ...m.camera, ...opts.camera, scale: opts.scale ?? 1, x: opts.x ?? 0, y: opts.y ?? 0 });
  const ctx = context(V, opts.theme, m, opts.id ?? 'kb');
  const d = dimensions(m);
  let svg = '';
  if (opts.shadow !== false) svg += floorShadow(ctx, d);
  svg += body(ctx, d) + strip(ctx, d) + keys(ctx, d);
  if (m.knob) svg += knob(ctx, d);
  if (m.led && d.knob) svg += statusLight(ctx, d);
  return { svg: `<defs>${ctx.defs.join('\n')}</defs>\n${svg}`, box: artBox(V, m, d) };
}

// The bounding box of the keyboard (body and knob, not the floor shadow), px.
function artBox(V, m, d) {
  const out = rrectPoints(0, 0, d.W, d.D, m.radius, 12);
  const pts = [...out.map(([x, y]) => V.p(x, y, 0)), ...out.map(([x, y]) => V.p(x, y, d.H))];
  if (d.knob) {
    const [cu, vt] = V.p(d.knob.x, d.knob.y, d.H + m.knob.h), R = m.knob.r * V.s;
    pts.push([cu - R, vt - R * V.sp], [cu + R, vt + R * V.sp]);
  }
  const b = boxOf(pts);
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

// The keyboard (its body and knob; the floor shadow falls outside) fitted into
// the box { x, y, w, h } and centred in it. opts as for keyboardArt, without
// scale, x and y.
export function keyboardInBox(opts, box) {
  const b = keyboardArt({ ...opts, scale: 1, x: 0, y: 0, shadow: false }).box;
  const k = Math.min(box.w / b.w, box.h / b.h);
  return keyboardArt({ ...opts, scale: k, x: box.x + (box.w - b.w * k) / 2 - b.x * k, y: box.y + (box.h - b.h * k) / 2 - b.y * k });
}

// The keyboard's width over its height (body and knob).
export function keyboardAspect(opts) {
  const b = keyboardArt({ ...opts, shadow: false }).box;
  return b.w / b.h;
}
