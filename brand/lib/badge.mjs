// The NTK mark: the letters N, T and K, each drawn as two parallel lines of
// equal thickness with an even gap between them, in orange. The lines turn
// square outer corners, and every open end is cut square: across the line, or
// level with the cap line or the baseline. Smooth vector art, no pixel grid.
// The letters are our own; the mark copies no maker's mark or wordmark.
//
// Construction. A letter is a few strokes along centerlines. Each stroke is
// drawn twice along its centerline: a wide band, 2t + g across, and the gap,
// g across. The mark is (union of the wide bands) minus (union of the gaps), so
// where strokes meet (the T's bar and stem, the K's stem, arm and leg) their
// gaps run into each other, as roads meet at a junction. Bands and gaps are
// built here as convex polygons and, round the N's elbows, annular sectors
// (both lines curve round the same centre), all wound the same way, so one
// path per colour fills their union without seams:
//   - an SVG draws the bands in orange through a mask that cuts out the gaps;
//   - an Android VectorDrawable (no masks) paints the bands in orange, then
//     the gaps in the background colour of the strip it sits on.
//
// Units: the cap height is 100.
export const MARK = {
  cap: 100,
  t: 8,           // line thickness, 8 % of the cap height
  g: 11.2,        // gap between the two lines, 1.4 t
  space: 15,      // between letters
  N: { w: 114, elbow: 18 }, // elbow: radius of the two rounded elbows, on the centerline (at least t + g/2)
  T: { w: 86 },
  K: { w: 87, joint: 55, legOut: 3 }, // joint: where arm and leg leave the stem; legOut: the leg reaches further than the arm
  overshoot: 4,   // the gap runs this far past an open end, so no orange fringe is left there
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1]));
const leftOf = (d) => [d[1], -d[0]]; // facing along d (y points down), the normal on the left

// Half-planes { n, c }: the points p with dot(n, p) >= c.
const keepBelow = (y) => ({ n: [0, 1], c: y });   // cut flat at y, keep what is below it
const keepAbove = (y) => ({ n: [0, -1], c: -y }); // cut flat at y, keep what is above it
const inset = (hp, d) => ({ n: hp.n, c: hp.c + d });

function clip(poly, { n, c }) {
  const out = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const da = dot(n, a) - c, db = dot(n, b) - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(add(a, mul(sub(b, a), da / (da - db))));
  });
  return out.filter((p, i) => Math.hypot(...sub(p, out[(i + 1) % out.length])) > 1e-9);
}
const area = (p) => p.reduce((s, a, i) => s + cross(a, p[(i + 1) % p.length]), 0) / 2;

// One stroke as polygons, for the band (half-width W/2) or the gap (g/2).
//   pts:   the centerline, a polyline;
//   start, end: 'butt' (an open end cut across the line), 'inside' (the end
//          lies inside another stroke's gap: a junction), or a half-plane
//          (an open end cut along that line, e.g. level with the cap line);
//   joins: per inner point, 'miter' (a square outer corner) or a half-plane:
//          the miter is cut flat there, and the gap one line thickness
//          inside it, so the outer line keeps its thickness round an acute
//          corner.
function strokePolys(s, { t, g, overshoot }, isGap) {
  const h = isGap ? g / 2 : t + g / 2;
  const pts = s.pts.map((p) => [...p]);
  const W = 2 * t + g;
  const capCuts = [];
  const openEnd = (i, j, cap) => {
    const d = unit(sub(pts[i], pts[j]));
    if (cap === 'inside') return;
    if (cap === 'butt') { if (isGap) pts[i] = add(pts[i], mul(d, overshoot)); return; }
    pts[i] = add(pts[i], mul(d, 3 * W)); // run past the cut, then cut
    capCuts.push(isGap ? inset(cap, -overshoot) : cap);
  };
  openEnd(0, 1, s.start);
  openEnd(pts.length - 1, pts.length - 2, s.end);

  const parts = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = unit(sub(pts[i + 1], pts[i])), n = mul(leftOf(d), h);
    parts.push({ d, poly: [add(pts[i], n), add(pts[i + 1], n), sub(pts[i + 1], n), sub(pts[i], n)], cuts: [] });
  }
  const segs = parts.slice();
  for (let i = 1; i + 1 < pts.length; i++) {
    const join = s.joins?.[i - 1] ?? 'miter';
    const d1 = segs[i - 1].d, d2 = segs[i].d, z = cross(d1, d2);
    const cuts = [];
    if (join !== 'miter') {
      const cut = isGap ? inset(join, t) : join;
      cuts.push(cut);
      segs[i - 1].cuts.push(cut);
      segs[i].cuts.push(cut);
    }
    if (Math.abs(z) < 1e-9) continue;
    // The outer side of the turn: the miter fills the notch between the two
    // bands there, up to where their outer edges meet.
    const n1 = mul(leftOf(d1), Math.sign(z)), n2 = mul(leftOf(d2), Math.sign(z));
    const P = pts[i], tip = add(P, mul(add(n1, n2), h / (1 + dot(n1, n2))));
    parts.push({ poly: [P, add(P, mul(n1, h)), tip, add(P, mul(n2, h))], cuts });
  }
  const out = [];
  for (const part of parts) {
    let p = part.poly;
    for (const cut of [...part.cuts, ...capCuts]) p = clip(p, cut);
    if (p.length < 3 || Math.abs(area(p)) < 1e-6) continue;
    out.push(area(p) < 0 ? p.reverse() : p);
  }
  return out;
}

// A stroke made of pieces, each a line or an arc tangent to its neighbours:
//   pieces: [{ line: [P, Q] } | { arc: { c, r, a0, a1 } }], angles in radians
//           on screen (y down, so a growing angle turns clockwise), a0 < a1;
//   start, end: 'butt' (open, cut across the line) on the first and last line.
// An arc's band is an annular sector round the arc's centre.
function pieceShapes(s, { t, g, overshoot }, isGap) {
  const h = isGap ? g / 2 : t + g / 2;
  const last = s.pieces.length - 1;
  return s.pieces.map((p, i) => {
    if (p.arc) {
      const { c, r, a0, a1 } = p.arc;
      if (r < h) throw new Error('an elbow radius is smaller than half the band');
      return { sector: { c, r0: r - h, r1: r + h, a0, a1 } };
    }
    let [P, Q] = p.line;
    const d = unit(sub(Q, P));
    if (isGap && i === 0 && s.start === 'butt') P = sub(P, mul(d, overshoot));
    if (isGap && i === last && s.end === 'butt') Q = add(Q, mul(d, overshoot));
    const n = mul(leftOf(d), h);
    const poly = [add(P, n), add(Q, n), sub(Q, n), sub(P, n)];
    return area(poly) < 0 ? poly.reverse() : poly;
  });
}
const shapesOf = (s, o, isGap) => (s.pieces ? pieceShapes(s, o, isGap) : strokePolys(s, o, isGap));

// Bisection: x in [lo, hi] with f(x) = target, f monotonic.
function solve(f, target, lo, hi) {
  const up = f(hi) > f(lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) < target) === up) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// The letters, in their own boxes: x from 0 to w, y from 0 (cap line) to cap
// (baseline). h: half the band's width; the stems' centerlines sit h inside.
const LETTERS = {
  // One double line that zig-zags: up the left stem (open at the foot), round
  // the top elbow, down the diagonal, round the bottom elbow, up the right stem
  // (open at the top). Each elbow is an arc of radius `elbow` on the
  // centerline, so both lines curve round the same centre; its outer edge
  // touches the cap line (the baseline). The diagonal is the common tangent of
  // the two elbows.
  N({ cap, w, elbow: r }, h) {
    const C1 = [h + r, h + r], C2 = [w - h - r, cap - h - r];
    const D = sub(C2, C1);
    if (D[0] <= 2 * r) throw new Error('the N is too narrow for its elbows');
    // The diagonal's normal n (up and right): D . n = 2r, as C1 lies r below it and C2 r above.
    const psi = Math.atan2(D[1], D[0]) - Math.acos((2 * r) / Math.hypot(D[0], D[1]));
    const n = [Math.cos(psi), Math.sin(psi)];
    return [{
      start: 'butt', end: 'butt',
      pieces: [
        { line: [[h, cap], [h, C1[1]]] },
        { arc: { c: C1, r, a0: Math.PI, a1: psi + 2 * Math.PI } },
        { line: [add(C1, mul(n, r)), sub(C2, mul(n, r))] },
        { arc: { c: C2, r, a0: 0, a1: psi + Math.PI } },
        { line: [[w - h, C2[1]], [w - h, 0]] },
      ],
    }];
  },
  // The bar, open at both ends, and the stem, open at the foot. The stem's gap
  // runs into the bar's.
  T({ cap, w }, h) {
    return [
      { pts: [[0, h], [w, h]], start: 'butt', end: 'butt' },
      { pts: [[w / 2, h], [w / 2, cap]], start: 'inside', end: 'butt' },
    ];
  },
  // The stem, open at both ends; arm and leg leave the middle of its gap and
  // end level with the cap line and the baseline.
  K({ cap, w, joint, legOut }, h) {
    const J = [h, joint];
    // centerline end on the line y, such that the band's right edge meets it at x
    const reach = (y, x) => solve((cx) => cx + h / Math.abs(unit(sub([cx, y], J))[1]), x, h, x);
    return [
      { pts: [[h, 0], [h, cap]], start: 'butt', end: 'butt' },
      { pts: [J, [reach(0, w), 0]], start: 'inside', end: keepBelow(0) },
      { pts: [J, [reach(cap, w + legOut), cap]], start: 'inside', end: keepAbove(cap) },
    ];
  },
};

// The mark as shapes (polygons and sectors): { w, h, bands, gaps }, in mark
// units (cap height 100).
export function drawMark(o = MARK) {
  const h = o.t + o.g / 2;
  const mark = { w: 0, h: o.cap, bands: [], gaps: [] };
  let x = 0;
  for (const ch of ['N', 'T', 'K']) {
    const L = o[ch];
    const move = (shapes) => shapes.map((p) => (p.sector
      ? { sector: { ...p.sector, c: [p.sector.c[0] + x, p.sector.c[1]] } }
      : p.map(([px, py]) => [px + x, py])));
    for (const s of LETTERS[ch]({ cap: o.cap, ...L }, h)) {
      mark.bands.push(...move(shapesOf(s, o, false)));
      mark.gaps.push(...move(shapesOf(s, o, true)));
    }
    x += L.w + (L.legOut ?? 0) + o.space;
  }
  mark.w = x - o.space;
  return mark;
}

const num = (v) => String(Math.round(v * 100) / 100);
const shapeData = (p) => {
  if (!p.sector) return 'M' + p.map(([x, y]) => `${num(x)} ${num(y)}`).join('L') + 'Z';
  const { c, r0, r1, a0, a1 } = p.sector;
  const at = (r, a) => `${num(c[0] + r * Math.cos(a))} ${num(c[1] + r * Math.sin(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${at(r1, a0)}A${num(r1)} ${num(r1)} 0 ${large} 1 ${at(r1, a1)}L${at(r0, a1)}` +
    (r0 > 0 ? `A${num(r0)} ${num(r0)} 0 ${large} 0 ${at(r0, a0)}` : '') + 'Z';
};
export const pathData = (shapes) => shapes.map(shapeData).join('');

// A standalone SVG, `height` px tall; the gaps are cut out by a mask, so they
// show whatever lies behind.
export function markSVG(m, { color, height = m.h }) {
  const width = Math.round((height * m.w) / m.h * 100) / 100;
  const pad = 10; // the mask reaches past the viewBox, past every overshoot
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${m.w} ${m.h}">\n` +
    `<mask id="gaps" maskUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${m.w + 2 * pad}" height="${m.h + 2 * pad}">\n` +
    `<rect x="${-pad}" y="${-pad}" width="${m.w + 2 * pad}" height="${m.h + 2 * pad}" fill="#fff"/>\n` +
    `<path fill="#000" d="${pathData(m.gaps)}"/>\n` +
    `</mask>\n` +
    `<path fill="${color}" mask="url(#gaps)" d="${pathData(m.bands)}"/>\n` +
    `</svg>\n`;
}

// An Android VectorDrawable, `heightDp` tall. VectorDrawable has no masks: the
// bands are painted in `color`, then the gaps in `background`, which must be
// the colour of whatever the drawable is drawn on.
export function markVectorDrawable(m, { color, background, heightDp, comment }) {
  const argb = (hex) => '#FF' + hex.replace('#', '').toUpperCase();
  return `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!-- ${comment} -->\n` +
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n` +
    `    android:width="${num((heightDp * m.w) / m.h)}dp"\n` +
    `    android:height="${heightDp}dp"\n` +
    `    android:viewportWidth="${m.w}"\n` +
    `    android:viewportHeight="${m.h}">\n` +
    `    <path\n        android:fillColor="${argb(color)}"\n        android:pathData="${pathData(m.bands)}" />\n` +
    `    <path\n        android:fillColor="${argb(background)}"\n        android:pathData="${pathData(m.gaps)}" />\n` +
    `</vector>\n`;
}
