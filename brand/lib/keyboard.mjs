// The NTK keyboard illustration: a white keyboard lying on the desk, seen from
// above at an angle, in classic 2:1 pixel isometric (edges step two pixels
// across for one down). Every object is a block: a light top face, a lit front
// face and a shaded right face. There are no outlines: an edge is where one
// face meets another. A soft blocky shadow lies on the desk.
//
// Iso coordinates: x runs along the keyboard (left to right, down-right on
// screen), z runs away from you (up-right on screen), both in steps; heights
// are in pixels. A step is two pixels across and one down or up.
import { Raster } from './raster.mjs';
import { drawBadge } from './badge.mjs';
import { glyph } from './font3x5.mjs';

// Rows far to near: [legend, width in u, id]. The id lets a scheme colour a
// key: white unless the scheme says 'dark' or 'accent' (orange).
export const LAYOUT = [
  [['`', 1, 'esc'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['0'], ['-'], ['='], ['', 2, 'back']],
  [['', 1.5, 'tab'], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['['], [']'], ['\\', 1.5, 'bslash']],
  [['', 1.75, 'caps'], ['A'], ['S'], ['D'], ['F'], ['G'], ['H'], ['J'], ['K'], ['L'], [';'], ["'"], ['', 2.25, 'enter']],
  [['', 2.25, 'shiftL'], ['Z'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], [','], ['.'], ['/'], ['', 2.75, 'shiftR']],
  [['', 1.25, 'mod1'], ['', 1.25, 'mod2'], ['', 1.25, 'mod3'], ['', 6.25, 'space'], ['', 1.25, 'mod4'], ['', 1.25, 'mod5'], ['', 1.25, 'mod6'], ['', 1.25, 'mod7']],
];

// The keyboard at icon size: six units across, fewer and larger keys, the
// same accents.
export const LAYOUT_SMALL = [
  [['.'], ['.'], ['.'], ['.'], ['.'], ['.']],
  [['.', 1.5], ['.'], ['.'], ['.'], ['', 1.5, 'enter']],
  [['', 1.25], ['', 3.5, 'space'], ['', 1.25]],
];

// The keyboard for a 32 px favicon: four units, two rows.
export const LAYOUT_TINY = [
  [[''], [''], [''], ['', 1, 'enter']],
  [['', 0.75], ['', 2.5, 'space'], ['', 0.75]],
];

export const SCHEMES = {
  // White keys, a soft dark-grey spacebar (the monolith) and an orange Enter.
  blocks: { space: 'dark', enter: 'accent' },
  // More orange: an orange spacebar too.
  orange: { space: 'accent', enter: 'accent' },
};

export const KEYBOARD_DEFAULTS = {
  layout: LAYOUT,
  n: 4,              // steps a key unit
  gap: 1,            // steps between keys and between rows
  keyH: 3,           // key height, pixels
  bodyH: 3,          // body (slab) thickness, pixels
  border: [7, 2, 2], // body around the keys, steps: back (the strip), sides, front
  legends: 'mark',   // 'glyph' (3x5 letters), 'mark' (a dark pixel pair) or false
  scheme: 'blocks',  // a name in SCHEMES or an { id: kind } map
  badge: true,       // the NTK mark and lines printed on the strip
  light: 2,          // the orange light on the strip: footprint in steps, or 0
  shadow: 2,         // the desk shadow, moved this many steps along x, or 0
};

const FACES = {
  body: ['bodyTop', 'bodyFront', 'bodySide'],
  key: ['keyTop', 'keyFront', 'keySide'],
  dark: ['darkTop', 'darkFront', 'darkSide'],
  accent: ['accentTop', 'accentFront', 'accentSide'],
};

// Screen position of an iso point (x, z) at height e, before the offset.
const sx = (x, z) => 2 * (x + z);
const sy = (x, z, e) => x - z - e;

// An iso block: footprint [x0, x0 + dx) x [z0, z0 + dz) in steps, standing on
// height e with height h (pixels). Pixels are decided at their centres, so the
// edges step exactly two across for one down. Faces: top, front (z = z0,
// lit), right (x = x0 + dx, shaded).
export function isoBlock(r, o, x0, z0, dx, dz, e, h, [top, front, side]) {
  const x1 = x0 + dx, z1 = z0 + dz;
  const left = o.ox + sx(x0, z0) - 1, right = o.ox + sx(x1, z1) + 1;
  const up = o.oy + sy(x0, z1, e + h) - 1, down = o.oy + sy(x1, z0, e) + 1;
  for (let py = up; py <= down; py++) for (let px = left; px <= right; px++) {
    const s = (px + 0.5 - o.ox) / 2, t = py + 0.5 - o.oy; // s = x + z, t = x - z - height
    let x = (s + t + e + h) / 2, z = (s - t - e - h) / 2;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) { r.set(px, py, top); continue; }
    x = s - z0;
    let y = x - z0 - t;
    if (x >= x0 && x < x1 && y >= e && y < e + h) { r.set(px, py, front); continue; }
    z = s - x1;
    y = x1 - z - t;
    if (z >= z0 && z < z1 && y >= e && y < e + h) r.set(px, py, side);
  }
}

// Write a flat raster (the badge) along the keyboard, the way iso pixel art
// writes labels: letters stay upright, the baseline steps one pixel down for
// every two across (the x direction). (x, y): screen position of the first
// column's top.
function isoLabel(r, art, x, y, map) {
  for (let row = 0; row < art.h; row++) for (let c = 0; c < art.w; c++) {
    const role = art.get(c, row);
    if (role != null) r.set(x + c, y + row + Math.floor(c / 2), map[role] ?? role);
  }
}

export function drawKeyboard(opts = {}) {
  const o = { ...KEYBOARD_DEFAULTS, ...opts };
  const layout = o.layout, N = o.n;
  const units = layout[0].reduce((w, k) => w + (k[1] ?? 1), 0);
  const [bBack, bSide, bFront] = o.border;
  const keysX = Math.round(units * N) - o.gap, keysZ = layout.length * N - o.gap;
  const BX = keysX + 2 * bSide, BZ = keysZ + bFront + bBack;
  const top = o.bodyH + o.keyH;
  const W = sx(BX, BZ) + 2 * o.shadow + 4, H = BX + BZ + top + o.shadow + 6;
  const iso = { ox: 2, oy: BZ + top + 2 };
  const r = new Raster(W, H);

  isoBlock(r, iso, 0, 0, BX, BZ, 0, o.bodyH, FACES.body);

  // The strip: the badge printed at the left, the light at the right.
  if (o.badge) {
    // On the strip's centre line, starting above the first key column.
    const b = drawBadge(STRIP_BADGE);
    const zc = bFront + keysZ + (bBack + o.gap) / 2, x0 = bSide + 1;
    const px = Math.round(iso.ox + sx(x0, zc)), py = Math.round(iso.oy + sy(x0, zc, o.bodyH) - b.h / 2);
    isoLabel(r, b, px, py, { ink: 'stripInk', line: 'stripInk', accent: 'stripAccent' });
  }
  if (o.light) {
    const L = o.light;
    isoBlock(r, iso, bSide + keysX - L, bFront + keysZ + Math.floor((bBack - L) / 2) + 1, L, L, o.bodyH, Math.max(1, o.keyH - 1), FACES.accent);
  }

  // Keys: rows far to near, each row left to right, so nearer blocks cover
  // what they hide.
  const scheme = typeof o.scheme === 'string' ? SCHEMES[o.scheme] : o.scheme;
  layout.forEach((row, ri) => {
    const z0 = bFront + (layout.length - 1 - ri) * N;
    let u = 0;
    for (const [legend, w = 1, id] of row) {
      const kind = scheme[id] ?? 'key';
      const x0 = bSide + Math.round(u * N), x1 = bSide + Math.round((u + w) * N) - o.gap;
      isoBlock(r, iso, x0, z0, x1 - x0, N - o.gap, o.bodyH, o.keyH, FACES[kind]);
      if (o.legends && kind === 'key') drawLegend(r, iso, (x0 + x1) / 2, z0 + (N - o.gap) / 2, top, legend, o.legends);
      u += w;
    }
  });

  return o.shadow ? deskShadow(r, o.shadow, 'shadow') : r;
}

// A legend at the centre of a key top: a 3x5 letter, upright, or a pair of
// dark pixels (every white key has one, as on a real keyboard).
function drawLegend(r, o, xc, zc, e, legend, mode) {
  const cx = Math.round(o.ox + sx(xc, zc)), cy = Math.round(o.oy + sy(xc, zc, e));
  if (mode === 'glyph' && legend && legend !== '.') {
    glyph(legend).forEach((line, j) => [...line].forEach((c, i) => { if (c === '#') r.set(cx - 2 + i, cy - 3 + j, 'legend'); }));
  } else {
    r.set(cx - 1, cy - 1, 'legend'); r.set(cx, cy - 1, 'legend');
  }
}

// The badge on the strip: five-row letters and two lines, not slanted (the
// iso shear of the label slants it already).
export const STRIP_BADGE = { size: 5, lines: 2, accentLine: 1, lineLength: 9, slantEvery: 99, gapLetters: 1, gapLines: 2 };

// The keyboard at icon size (on a 1 dp grid) and for the favicon (1 pixel).
export const SMALL = {
  layout: LAYOUT_SMALL, n: 3, gap: 1, keyH: 2, bodyH: 2, border: [3, 1, 1],
  legends: 'mark', badge: false, light: 1, shadow: 1,
};
export const FAVICON = {
  layout: LAYOUT_TINY, n: 2, gap: 1, keyH: 1, bodyH: 2, border: [1, 1, 1],
  legends: false, badge: false, light: 0, shadow: 1,
};

// The soft desk shadow: everything drawn so far, moved k steps along x (two
// pixels across and one down a step), in one light step, under the object.
export function deskShadow(src, k, role) {
  const out = new Raster(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    if (src.get(x - 2 * k, y - k) != null) out.set(x, y, role);
  }
  out.blit(src, 0, 0);
  const b = out.bounds();
  return out.crop(b.x, b.y, b.w, b.h);
}
