// The NTK badge: chunky 8-bit capitals, slanted, followed by thin parallel
// lines, in the manner of a 1980s instrument maker's badge (not a copy of any).
// Letters are drawn upright here and slanted in code.
import { Raster, grid } from './raster.mjs';

// Seven rows high, two-cell stems, three-cell diagonals.
const LETTERS_7 = {
  N: `
    ###...##
    ####..##
    #####.##
    ##.#####
    ##..####
    ##...###
    ##....##`,
  T: `
    ########
    ########
    ...##...
    ...##...
    ...##...
    ...##...
    ...##...`,
  K: `
    ##...###
    ##..###.
    ##.###..
    #####...
    ##.###..
    ##..###.
    ##...###`,
};

// Five rows high, for the strip of the keyboard illustration.
const LETTERS_5 = {
  N: `
    ##..#
    ###.#
    #.###
    #..##
    #...#`,
  T: `
    #####
    ..#..
    ..#..
    ..#..
    ..#..`,
  K: `
    #..##
    #.##.
    ###..
    #.##.
    #..##`,
};

// shift(row) for a slant: rows near the top move right. `every` rows per step.
const slant = (h, every) => (y) => Math.floor((h - 1 - y + Math.floor(every / 2)) / every);

// The badge as a raster with the roles 'ink' (letters), 'line', 'accent' (the
// orange line) and 'drop'. size: 7 or 5 rows; cut: step the outer corners of
// each letter; lines: how many thin lines, spread over the letter height, the
// one at index accentLine in orange; drop: the letters stand out as blocks
// with a one-step drop this many cells down and right (the lines are flat).
export function drawBadge(opts = {}) {
  const r = drawMarks(opts);
  const d = opts.drop ?? 0;
  if (!d) return r;
  const out = new Raster(r.w + d, r.h + d);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.get(x, y) === 'ink') out.set(x + d, y + d, 'drop');
  out.blit(r, 0, 0);
  return out;
}

function drawMarks({ size = 7, gapLetters = 2, gapLines = 3, lines = 4, lineLength = 20, accentLine = 3, slantEvery = 3, cut = false } = {}) {
  const L = size === 7 ? LETTERS_7 : LETTERS_5;
  const glyphs = ['N', 'T', 'K'].map((c) => grid(L[c], { '#': 'ink' }));
  if (cut) for (const g of glyphs) for (const [x, y] of [[0, 0], [g.w - 1, 0], [0, g.h - 1], [g.w - 1, g.h - 1]]) g.set(x, y, null);
  const h = glyphs[0].h;
  const shift = slant(h, slantEvery);
  const maxShift = shift(0);
  const width = glyphs.reduce((w, g) => w + g.w + gapLetters, 0) - gapLetters + gapLines + lineLength + maxShift;
  const r = new Raster(width, h);
  let x = 0;
  for (const g of glyphs) {
    for (let y = 0; y < g.h; y++) for (let i = 0; i < g.w; i++) if (g.get(i, y)) r.set(x + i + shift(y), y, 'ink');
    x += g.w + gapLetters;
  }
  x += gapLines - gapLetters;
  const step = (h - 1) / (lines - 1);
  for (let k = 0; k < lines; k++) {
    const y = Math.round(k * step);
    r.rect(x + shift(y), y, lineLength, 1, k === accentLine ? 'accent' : 'line');
  }
  return r;
}
