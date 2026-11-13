// The NTK keyboard illustration: a white keyboard lying on the desk, seen from
// above at an angle, in classic 2:1 pixel isometric (edges step two pixels
// across for one down). Every object is a block: a white top face, a very
// light lit front face and a light shaded right face. There are no outlines:
// an edge is where one face meets another. The soft blurred shadow on the
// floor is drawn under the art by build.mjs, from the outline it reports.
//
// Iso coordinates: x runs along the keyboard (left to right, down-right on
// screen), z runs away from you (up-right on screen), both in steps; heights
// are in pixels. A step is two pixels across and one down or up.
import { Raster } from './raster.mjs';
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
  [['.', 1, 'esc'], ['.'], ['.'], ['.'], ['.'], ['.']],
  [['.', 1.5], ['.'], ['.'], ['.'], ['', 1.5, 'enter']],
  [['', 1.25], ['', 3.5, 'space'], ['', 1.25]],
];

// The keyboard for a 32 px favicon: four units, two rows.
export const LAYOUT_TINY = [
  [[''], [''], [''], ['', 1, 'enter']],
  [['', 0.75], ['', 2.5, 'space'], ['', 0.75]],
];

export const SCHEMES = {
  // All white, as in the reference scene: an orange Enter and one small orange
  // key at the top left.
  blocks: { esc: 'accent', enter: 'accent' },
  // On an orange tile (the icons) orange keys would read as holes: the same two
  // keys in black.
  onOrange: { esc: 'dark', enter: 'dark' },
  // The earlier look: a dark-grey spacebar (the monolith) and an orange Enter.
  monolith: { space: 'dark', enter: 'accent' },
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
  legends: false,    // 'glyph' (3x5 letters), 'mark' (a dark pixel pair) or false: blank keys, as in the reference
  scheme: 'blocks',  // a name in SCHEMES or an { id: kind } map
  light: 2,          // the orange light on the strip: footprint in steps, or 0
  shadow: 0,         // a blocky desk shadow, moved this many steps along x, or 0 (build.mjs draws a soft one)
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

  // The strip: the orange light at the right, and no label (the NTK mark is
  // smooth vector lines, which do not resolve at the strip's few pixels).
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

  // The body's outline on the floor, in pixels of the returned raster: build.mjs
  // draws the soft shadow from it.
  const floor = [[0, 0], [BX, 0], [BX, BZ], [0, BZ]].map(([x, z]) => [iso.ox + sx(x, z), iso.oy + sy(x, z, 0)]);
  const all = o.shadow ? deskShadow(r, o.shadow, 'shadow') : r;
  const b = all.bounds();
  const out = all.crop(b.x, b.y, b.w, b.h);
  out.floor = floor.map(([x, y]) => [x - b.x, y - b.y]);
  return out;
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

// The keyboard at icon size (on a 1 dp grid) and for the favicon (1 pixel).
export const SMALL = {
  layout: LAYOUT_SMALL, n: 3, gap: 1, keyH: 2, bodyH: 2, border: [3, 1, 1],
  legends: false, light: 0, shadow: 0, scheme: 'onOrange',
};
export const FAVICON = {
  layout: LAYOUT_TINY, n: 2, gap: 1, keyH: 1, bodyH: 2, border: [1, 1, 1],
  legends: false, light: 0, shadow: 0, scheme: 'onOrange',
};

// A blocky desk shadow (no longer the default): everything drawn so far, moved
// k steps along x (two pixels across and one down a step), in one flat colour,
// under the object.
export function deskShadow(src, k, role) {
  const out = new Raster(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    if (src.get(x - 2 * k, y - k) != null) out.set(x, y, role);
  }
  out.blit(src, 0, 0);
  return out;
}
