// Pixel sprites drawn from text grids, shared by the verify page and the demo
// feed. A grid is an array of equal-length strings; '.' is an empty cell and any
// other character is a filled cell whose colour comes from CSS (class px-<name>).
// gridRuns, gridSize and the sprite data are pure; pixelSvg needs a DOM document.

/** Filled cells merged into horizontal runs: [{ x, y, w, c }]. */
export function gridRuns(rows) {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      if (c === '.' || c === ' ') { x++; continue; }
      let w = 1;
      while (row[x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  });
  return out;
}

export const gridSize = (rows) => ({ w: Math.max(0, ...rows.map((r) => r.length)), h: rows.length });

/** Small interface sprites. The logo and badge are images from brand/ (web/assets/). */
export const SPRITES = Object.freeze({
  check: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  cross: ['##..##', '.####.', '..##..', '..##..', '.####.', '##..##'],
  dash: ['......', '......', '######', '######', '......', '......'],
  out: ['..#####', '.....##', '....#.#', '...#..#', '..#....', '.#.....', '#......'],
  back: ['...#.....', '..#......', '.#.......', '#########', '.#.......', '..#......', '...#.....'],
  reply: ['.#######.', '#.......#', '#.......#', '#.......#', '.#..####.', '.#.#.....', '.##......', '.#.......'],
  repost: ['.#.........', '###.######.', '.#.......#.', '.#.......#.', '.#.......#.', '.#.......#.', '.#.......#.', '.######.###', '.........#.'],
  like: ['.##...##.', '#..#.#..#', '#...#...#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'],
  views: ['......#.', '......#.', '...#..#.', '...#..#.', '#..#..#.', '#..#..#.', '#..#..#.'],
  share: ['....#....', '...###...', '..#.#.#..', '....#....', '....#....', '#...#...#', '#.......#', '#########'],
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An inline <svg> of a grid. `scale` sets the drawn size in CSS pixels per cell;
 * `names` maps cell characters to colour names (default: '#' ink, 'o' accent).
 */
export function pixelSvg(doc, rows, { scale = 2, cls = '', label = '', names = {} } = {}) {
  const map = { '#': 'ink', o: 'accent', ...names };
  const { w, h } = gridSize(rows);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w * scale));
  svg.setAttribute('height', String(h * scale));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', `px ${cls}`.trim());
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const r of gridRuns(rows)) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(r.x));
    rect.setAttribute('y', String(r.y));
    rect.setAttribute('width', String(r.w));
    rect.setAttribute('height', '1');
    rect.setAttribute('class', `px-${map[r.c] ?? 'ink'}`);
    svg.appendChild(rect);
  }
  return svg;
}

/** Replace every <span data-sprite="name"> in the document with its sprite. */
export function drawSprites(doc, root = doc) {
  for (const el of root.querySelectorAll('[data-sprite]')) {
    const rows = SPRITES[el.dataset.sprite];
    if (!rows) continue;
    const svg = pixelSvg(doc, rows, {
      scale: Number(el.dataset.scale) || 2,
      cls: el.className,
      label: el.getAttribute('aria-label') || '',
    });
    el.replaceWith(svg);
  }
}
