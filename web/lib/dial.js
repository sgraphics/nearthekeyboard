// The dial, after an old radio's tuning scale: fine black ticks standing on a
// thin line from 0 to 100, tiny numbers every 10, an orange needle. The verify
// page shows a stamp's typing match score on it (the needle at the score, a short
// heavy mark at the score it needs) and, while it waits on the network, a needle
// that sweeps (.dial-busy). The login page carries the same markup in its HTML:
// dialMarkup() writes it and web/test/dial.test.mjs checks that the two agree.
// dialTicks and dialMarkup are pure; dialEl needs a DOM document.

/** The scale's drawing box: 10 units a point, ticks standing on a line at BASE. */
export const DIAL = Object.freeze({ W: 1000, H: 30, BASE: 26 });

/** The numbers under the scale. */
export const DIAL_NUMBERS = Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

const clamp = (p) => Math.min(100, Math.max(0, Number(p)));

/** Every tick as { x, y1, y2 }: every 2 points, longer every 10, longest at 0, 50 and 100. */
export function dialTicks() {
  const out = [];
  for (let p = 0; p <= 100; p += 2) {
    const len = p % 50 === 0 ? 16 : p % 10 === 0 ? 11 : 6;
    out.push({ x: p * 10, y1: DIAL.BASE - len, y2: DIAL.BASE });
  }
  return out;
}

/** The lines of a dial: the base line, the ticks, then the mark and the needle when given. */
function dialLines({ score = null, needs = null } = {}) {
  const lines = [{ x1: 0, y1: DIAL.BASE, x2: DIAL.W, y2: DIAL.BASE }];
  for (const t of dialTicks()) lines.push({ x1: t.x, y1: t.y1, x2: t.x, y2: t.y2 });
  if (needs != null && Number.isFinite(Number(needs))) {
    const x = clamp(needs) * 10;
    lines.push({ x1: x, y1: 0, x2: x, y2: 7, cls: 'dial-needs' });
  }
  if (score != null && Number.isFinite(Number(score))) {
    const x = clamp(score) * 10;
    lines.push({ x1: x, y1: -3, x2: x, y2: DIAL.H + 16, cls: 'dial-needle' });
  }
  return lines;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ATTRS = { viewBox: `0 0 ${DIAL.W} ${DIAL.H}`, preserveAspectRatio: 'none', focusable: 'false', 'aria-hidden': 'true' };

/** A dial as DOM: { score, needs } for a reading, { busy: true } for the sweeping needle. */
export function dialEl(doc, opts = {}) {
  const dial = doc.createElement('div');
  dial.setAttribute('class', opts.busy ? 'dial dial-busy' : 'dial');
  dial.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'dial-scale');
  for (const [k, v] of Object.entries(SVG_ATTRS)) svg.setAttribute(k, v);
  for (const l of dialLines(opts)) {
    const line = doc.createElementNS(SVG_NS, 'line');
    for (const k of ['x1', 'y1', 'x2', 'y2']) line.setAttribute(k, String(l[k]));
    if (l.cls) line.setAttribute('class', l.cls);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
  }
  const numbers = doc.createElement('div');
  numbers.setAttribute('class', 'dial-numbers');
  for (const n of DIAL_NUMBERS) {
    const s = doc.createElement('span');
    s.textContent = String(n);
    numbers.append(s);
  }
  dial.append(svg, numbers);
  if (opts.busy) {
    const sweep = doc.createElement('span');
    sweep.setAttribute('class', 'dial-sweep');
    dial.append(sweep);
  }
  return dial;
}

/** The same dial as HTML text, for a page without a script of its own to build it (the login page). */
export function dialMarkup(opts = {}, indent = '') {
  const attrs = Object.entries(SVG_ATTRS).map(([k, v]) => ` ${k}="${v}"`).join('');
  const lines = dialLines(opts).map((l) =>
    `${indent}    <line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"${l.cls ? ` class="${l.cls}"` : ''} vector-effect="non-scaling-stroke"/>`);
  return [
    `${indent}<div class="${opts.busy ? 'dial dial-busy' : 'dial'}" aria-hidden="true">`,
    `${indent}  <svg class="dial-scale"${attrs}>`,
    ...lines,
    `${indent}  </svg>`,
    `${indent}  <div class="dial-numbers">${DIAL_NUMBERS.map((n) => `<span>${n}</span>`).join('')}</div>`,
    ...(opts.busy ? [`${indent}  <span class="dial-sweep"></span>`] : []),
    `${indent}</div>`,
  ].join('\n');
}
