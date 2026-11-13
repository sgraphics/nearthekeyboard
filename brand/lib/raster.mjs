// An indexed pixel canvas. Every cell holds a colour *role* ('keyTop', 'legend',
// ...), not a colour, so one drawing renders in the light and the dark theme by
// swapping the role -> colour map. Nothing here anti-aliases.
export class Raster {
  constructor(w, h, fill = null) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(fill);
  }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.px[y * this.w + x] : null; }
  set(x, y, role) { if (this.inside(x, y)) this.px[y * this.w + x] = role; }

  rect(x, y, w, h, role) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, role);
  }

  // Fill a polygon: a pixel is in when its centre is (even-odd rule).
  poly(pts, role) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, role);
      }
    }
  }

  // Copy another raster in; null cells are transparent. `map` may rename roles.
  blit(src, dx, dy, map = null) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const r = src.px[y * src.w + x];
      if (r != null) this.set(dx + x, dy + y, map ? map[r] ?? r : r);
    }
  }

  // Smallest box holding every non-null cell.
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.px[y * this.w + x] != null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  crop(x, y, w, h) {
    const r = new Raster(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) r.px[j * w + i] = this.get(x + i, y + j);
    return r;
  }

  // Grow the canvas by m cells on every side (or by [top, right, bottom, left]).
  pad(m) {
    const [t, r, b, l] = Array.isArray(m) ? m : [m, m, m, m];
    const out = new Raster(this.w + l + r, this.h + t + b);
    out.blit(this, l, t);
    return out;
  }

  // Pixels of the given theme (role -> '#rrggbb' or '#rrggbbaa'), scaled by an
  // integer factor with nearest neighbour.
  toRGBA(theme, scale = 1) {
    const W = this.w * scale, H = this.h * scale;
    const rgba = new Uint8Array(W * H * 4);
    const cache = new Map();
    const colour = (role) => {
      if (role == null) return [0, 0, 0, 0];
      if (!cache.has(role)) {
        const hex = theme[role];
        if (hex === undefined) throw new Error(`theme has no colour for role "${role}"`);
        cache.set(role, hexToRGBA(hex));
      }
      return cache.get(role);
    };
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = colour(this.px[y * this.w + x]);
      for (let j = 0; j < scale; j++) {
        let o = ((y * scale + j) * W + x * scale) * 4;
        for (let i = 0; i < scale; i++, o += 4) { rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = c[3]; }
      }
    }
    return { width: W, height: H, rgba };
  }
}

export function hexToRGBA(hex) {
  if (hex == null || hex === 'none' || hex === 'transparent') return [0, 0, 0, 0];
  const h = hex.replace('#', '');
  const v = (i) => parseInt(h.slice(i, i + 2), 16);
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : 255];
}

// A pixel grid written as text: one character a cell, `key` maps characters to
// roles ('.' and ' ' are transparent unless mapped). Leading/trailing blank
// lines and a common indent are ignored.
export function grid(text, key) {
  let lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  lines = lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
  const w = Math.max(...lines.map((l) => l.length));
  const r = new Raster(w, lines.length);
  lines.forEach((l, y) => [...l].forEach((ch, x) => {
    if (ch in key) r.set(x, y, key[ch]);
    else if (ch !== '.' && ch !== ' ') throw new Error(`grid: no role for "${ch}"`);
  }));
  return r;
}
