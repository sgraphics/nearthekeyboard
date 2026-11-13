// The NTK keyboard illustration: a white keyboard lying on the desk in front of
// you, drawn in pixels. It is modelled in 3D in key units u (case, keycaps, a
// strip at the back), projected with a one-point perspective camera (the
// Kubrick view: symmetric, edges converging), and then laid on the pixel grid
// with pixel-art rules: rectangles for key tops and fronts, one-pixel gaps,
// stepped corners, no anti-aliasing. Rows are drawn far to near.
import { Raster } from './raster.mjs';
import { glyph } from './font3x5.mjs';
import { drawBadge } from './badge.mjs';

// Rows far to near: [legend, width in u, id]. Legends starting with ':' are
// icons. The id lets a scheme colour a key: white unless the scheme says
// 'dark' (black) or 'accent' (orange).
export const LAYOUT = [
  [['`', 1, 'esc'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['0'], ['-'], ['='], [':back', 2, 'back']],
  [[':tab', 1.5, 'tab'], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['['], [']'], ['\\', 1.5, 'bslash']],
  [['', 1.75, 'caps'], ['A'], ['S'], ['D'], ['F'], ['G'], ['H'], ['J'], ['K'], ['L'], [';'], ["'"], [':enter', 2.25, 'enter']],
  [[':shift', 2.25, 'shiftL'], ['Z'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], [','], ['.'], ['/'], [':shift', 2.75, 'shiftR']],
  [['', 1.25, 'mod1'], ['', 1.25, 'mod2'], ['', 1.25, 'mod3'], ['', 6.25, 'space'], ['', 1.25, 'mod4'], ['', 1.25, 'mod5'], ['', 1.25, 'mod6'], ['', 1.25, 'mod7']],
];

export const SCHEMES = {
  // The NTK keyboard: all white, the black spacebar (the monolith), orange Enter.
  monolith: { space: 'dark', enter: 'accent' },
  // An alternative: black backspace and the keys beside the spacebar.
  classic: { back: 'dark', enter: 'accent', mod3: 'dark', mod4: 'dark' },
};

const ICONS = {
  ':enter': ['....#', '.#..#', '#####', '.#...'],
  ':back': ['.#...', '#####', '.#...'],
  ':tab': ['...#.', '#####', '...#.'],
  ':shift': ['..#..', '.#.#.', '##.##', '.#.#.', '.###.'],
};

function camera({ elev, dist, f, target }) {
  const t = (elev * Math.PI) / 180;
  const fwd = [0, -Math.sin(t), Math.cos(t)];
  const up = [0, Math.cos(t), Math.sin(t)];
  const c = [target[0], target[1] + dist * Math.sin(t), target[2] - dist * Math.cos(t)];
  const proj = ([x, y, z]) => {
    const v = [x - c[0], y - c[1], z - c[2]];
    const depth = v[1] * fwd[1] + v[2] * fwd[2];
    return [(f * v[0]) / depth, (-f * (v[1] * up[1] + v[2] * up[2])) / depth];
  };
  proj.depth = ([x, y, z]) => (y - c[1]) * fwd[1] + (z - c[2]) * fwd[2];
  return proj;
}

export const KEYBOARD_DEFAULTS = {
  U: 10,          // pixels per key unit on the nearest row of keys
  elev: 52,       // camera elevation in degrees (90 = straight down)
  dist: 26,       // camera distance in u (larger = flatter perspective)
  border: 0.5,    // case border left and right of the keys, u
  front: 0.55,    // case border in front of the keys, u
  strip: 1.25,    // strip behind the keys, u
  caseH: 0.75,    // case height, u
  keyH: 0.42,     // keycap height above the case, u
  gap: 0.1,       // space between rows of keycaps, u (between keys: one pixel)
  taper: 0.07,    // how far a keycap top sits inside its base, front and back, u
  legends: 'font', // 'font' | 'marks' | 'none'
  scheme: 'monolith', // a name in SCHEMES or an { id: kind } map
  badge: true,    // the NTK mark and lines on the strip
  light: true,    // the round orange light on the strip
  shadow: [1, 1], // hard drop shadow offset in pixels, or null
  outline: true,
  keyCorners: true, // step the lower corners of each keycap
  minTop: 7,      // smallest key top in pixels (a 3x5 legend needs 7)
  minFront: 2,    // smallest key front in pixels
};

export function drawKeyboard(opts = {}) {
  const o = { ...KEYBOARD_DEFAULTS, ...opts };
  const layout = o.layout ?? LAYOUT;
  const rows = layout.length, W = layout[0].reduce((w, k) => w + (k[1] ?? 1), 0);
  const halfW = W / 2 + o.border;
  const depth = o.front + rows + o.strip;
  const zKeys = o.front; // near edge of the nearest row
  const H = o.caseH;

  // Camera aimed at the middle of the case top; f set so the nearest key row
  // gets U pixels a unit.
  let cam = camera({ elev: o.elev, dist: o.dist, f: 1, target: [0, H, depth / 2] });
  const f = o.U * cam.depth([0, H + o.keyH, zKeys]);
  cam = camera({ elev: o.elev, dist: o.dist, f, target: [0, H, depth / 2] });

  // Frame: projected case corners and keycap tops decide the canvas.
  const corners = [];
  for (const x of [-halfW, halfW]) for (const z of [0, depth]) for (const y of [0, H]) corners.push(cam([x, y, z]));
  const minX = Math.min(...corners.map((p) => p[0])), maxX = Math.max(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1])) - o.keyH * o.U, maxY = Math.max(...corners.map((p) => p[1]));
  const m = 3;
  const ox = Math.round(-minX) + m, oy = Math.round(-minY) + m;
  const r = new Raster(Math.ceil(maxX - minX) + 2 * m + 1, Math.ceil(maxY - minY) + 2 * m + 1 + 4 * rows);
  const P = (x, y, z) => { const [sx, sy] = cam([x, y, z]); return [sx + ox, sy + oy]; };

  // Keys, row by row, far to near. Pixel-art discipline: each row's key edges
  // are projected once and rounded, every key gets a 1-pixel gap on its left,
  // tops and fronts are rectangles. The well (the recess the keys sit in) is
  // drawn per row too, so its sides step with the rows.
  const scheme = typeof o.scheme === 'string' ? SCHEMES[o.scheme] : o.scheme;
  const roles = (kind) => kind === 'dark' ? ['darkTop', 'darkFront', 'darkLegend']
    : kind === 'accent' ? ['accentTop', 'accentFront', 'accentLegend']
    : ['keyTop', 'keyFront', 'legend'];
  const g = o.gap / 2, yT = H + o.keyH;
  const rowGeo = layout.map((row, ri) => {
    const z1 = zKeys + rows - ri, z0 = z1 - 1; // far and near edge of this row
    const tz0 = z0 + g + o.taper * 1.6, tz1 = z1 - g - o.taper * 0.6;
    const zm = (tz0 + tz1) / 2;
    return {
      row,
      y0: Math.round(P(0, yT, tz1)[1]), // top face, first pixel row
      y1: Math.round(P(0, yT, tz0)[1]), // front face, first pixel row
      y2: Math.round(P(0, H, z0 + g)[1]), // below the front face
      X: (x) => Math.round(P(x, yT, zm)[0]),
    };
  });
  // The grid wins over the projection: every row gets a top tall enough for a
  // legend, a visible front and a one-pixel line of well before the next row.
  // Rows below a stretched row move down, and so does the front of the case.
  let push = 0;
  rowGeo.forEach((q, ri) => {
    q.y0 += push; q.y1 += push; q.y2 += push;
    const moves = [
      ri > 0 ? rowGeo[ri - 1].y2 + 1 - q.y0 : 0,
      o.minTop - (q.y1 - q.y0),
      o.minFront - (q.y2 - q.y1),
    ];
    if (moves[0] > 0) { q.y0 += moves[0]; q.y1 += moves[0]; q.y2 += moves[0]; push += moves[0]; }
    if (moves[1] > 0) { q.y1 += moves[1]; q.y2 += moves[1]; push += moves[1]; }
    if (moves[2] > 0) { q.y2 += moves[2]; push += moves[2]; }
  });
  const near = (pt) => (pt[2] <= 0 ? [P(...pt)[0], P(...pt)[1] + push] : P(...pt));
  const quad = (pts, role) => r.poly(pts.map(near), role);

  // Case: front face, then top.
  quad([[-halfW, 0, 0], [halfW, 0, 0], [halfW, H, 0], [-halfW, H, 0]], 'caseFront');
  quad([[-halfW, H, 0], [halfW, H, 0], [halfW, H, depth], [-halfW, H, depth]], 'caseTop');

  rowGeo.forEach((q, ri) => {
    const top = ri === 0 ? q.y0 - 1 : rowGeo[ri - 1].y2;
    const bottom = ri === rows - 1 ? q.y2 + 1 : q.y2;
    r.rect(q.X(-W / 2), top, q.X(W / 2) - q.X(-W / 2) + 1, bottom - top, 'well');
  });
  for (const q of rowGeo) {
    let x = -W / 2;
    for (const [legend, w = 1, id] of q.row) {
      const [top, front, ink] = roles(scheme[id]);
      const xa = q.X(x) + 1, xb = q.X(x + w);
      r.rect(xa, q.y0, xb - xa, q.y1 - q.y0, top);
      r.rect(xa, q.y1, xb - xa, q.y2 - q.y1, front);
      if (o.keyCorners && q.y2 - q.y1 >= 2) { r.set(xa, q.y2 - 1, 'well'); r.set(xb - 1, q.y2 - 1, 'well'); }
      drawLegend(r, legend, xa, q.y0, xb - xa, q.y1 - q.y0, ink, o.legends);
      x += w;
    }
  }

  // Strip: the NTK mark and lines at the left, the round light at the right,
  // centred on the strip's pixel rows (between the back edge and the well).
  const stripTop = Math.round(P(0, H, depth)[1]), stripBottom = rowGeo[0].y0 - 2;
  const sy = Math.floor((stripTop + stripBottom) / 2);
  const stripZ = (zKeys + rows + depth) / 2;
  if (o.badge) drawStripBadge(r, rowGeo[0].X(-W / 2) + 1 + Math.round(o.U * 0.15), sy);
  if (o.light) drawLight(r, Math.round(P(W / 2 - 0.55, H, stripZ)[0]), sy, stripBottom - stripTop);

  let out = r;
  if (o.outline) out = stepCorners(out, 2), out = outline(out, 'outline');
  if (o.shadow) out = dropShadow(out, o.shadow, 'shadow');
  const b = out.bounds();
  return out.crop(b.x, b.y, b.w, b.h);
}

function drawLegend(r, legend, x, y, w, h, role, mode) {
  if (!legend || mode === 'none') return;
  let rows;
  if (legend.startsWith(':')) rows = ICONS[legend];
  else if (mode === 'marks') rows = h >= 5 ? ['##', '##'] : ['##'];
  else rows = h >= 6 ? glyph(legend) : ['###'];
  if (!rows) return;
  const gw = rows[0].length, gh = rows.length;
  const gx = x + Math.floor((w - gw) / 2), gy = y + Math.floor((h - gh) / 2);
  rows.forEach((line, j) => [...line].forEach((c, i) => { if (c === '#') r.set(gx + i, gy + j, role); }));
}

// The badge at strip scale: the five-row NTK and three lines, left-aligned at x
// and centred on row cy.
export const STRIP_BADGE = { size: 5, lines: 3, accentLine: 2, lineLength: 12, slantEvery: 3, gapLetters: 1, gapLines: 2 };
function drawStripBadge(r, x, cy) {
  const b = drawBadge(STRIP_BADGE);
  r.blit(b, x, cy - Math.floor(b.h / 2), { ink: 'stripInk', accent: 'stripAccent' });
}

// A round light, HAL's eye: a ring with an orange centre. Five, four or three
// cells across, as the strip has room.
function drawLight(r, cx, cy, room) {
  const s = room >= 8 ? ['.###.', '#ooo#', '#ooo#', '#ooo#', '.###.']
    : room >= 6 ? ['.##.', '#oo#', '#oo#', '.##.'] : ['.#.', '#o#', '.#.'];
  const h = Math.floor((s.length - 1) / 2);
  s.forEach((line, j) => [...line].forEach((c, i) => {
    if (c === '#') r.set(cx - h + i, cy - h + j, 'lightRing');
    if (c === 'o') r.set(cx - h + i, cy - h + j, 'lightOn');
  }));
}

// Stepped corners: the first and last n rows of the silhouette lose n, n-1, ...
// cells at each end. (Horizontal edges stay horizontal in this projection, so
// the corners are where those rows end.)
export function stepCorners(src, n) {
  const r = new Raster(src.w, src.h);
  r.px = src.px.slice();
  const b = src.bounds();
  for (let i = 0; i < n; i++) {
    for (const y of [b.y + i, b.y + b.h - 1 - i]) {
      const xs = [];
      for (let x = 0; x < r.w; x++) if (r.get(x, y) != null) xs.push(x);
      if (!xs.length) continue;
      for (let k = 0; k < n - i; k++) { r.set(xs[0] + k, y, null); r.set(xs[xs.length - 1] - k, y, null); }
    }
  }
  return r;
}

// A one-pixel outline outside the silhouette (4-connected).
export function outline(src, role) {
  const r = src.pad(1);
  const out = new Raster(r.w, r.h);
  out.px = r.px.slice();
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (r.get(x, y) != null) continue;
    if (r.get(x - 1, y) != null || r.get(x + 1, y) != null || r.get(x, y - 1) != null || r.get(x, y + 1) != null) out.set(x, y, role);
  }
  return out;
}

// A hard one-step shadow: the silhouette shifted by [dx, dy], under the object.
export function dropShadow(src, [dx, dy], role) {
  const r = src.pad([0, Math.max(0, dx), Math.max(0, dy), 0]);
  const out = new Raster(r.w, r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (r.get(x - dx, y - dy) != null) out.set(x, y, role);
  }
  out.blit(r, 0, 0);
  return out;
}
