// Thin line icons, shared by the verify page and the demo feed: paths on a 24-unit
// grid, drawn as inline SVG with round 1.5-unit strokes in the text colour (CSS can
// change the colour and the stroke). ICONS is pure data; iconSvg needs a DOM document.

/** Each icon: its path data, one string per stroke. */
export const ICONS = Object.freeze({
  check: ['M5 12.5 9.75 17.25 19 7.25'],
  cross: ['M7 7 17 17', 'M17 7 7 17'],
  dash: ['M6.5 12h11'],
  out: ['M8 16 16.25 7.75', 'M9.75 7.25h7v7'],
  back: ['M19.5 12h-15', 'M10.5 6l-6 6 6 6'],
  reply: ['M20 11.25c0 3.6-3.58 6.5-8 6.5-.98 0-1.92-.14-2.79-.4L5.25 19l1.1-3.13C4.88 14.7 4 13.04 4 11.25c0-3.59 3.58-6.5 8-6.5s8 2.91 8 6.5z'],
  repost: ['M6.75 10V8.75a2 2 0 0 1 2-2h10', 'M16.25 4.25l2.5 2.5-2.5 2.5', 'M17.25 14v1.25a2 2 0 0 1-2 2h-10', 'M7.75 19.75l-2.5-2.5 2.5-2.5'],
  like: ['M12 19.25s-7.25-4.3-7.25-9.3A4.05 4.05 0 0 1 12 7.6a4.05 4.05 0 0 1 7.25 2.35c0 5-7.25 9.3-7.25 9.3z'],
  views: ['M6 19.25v-5.5', 'M10 19.25V9.75', 'M14 19.25v-7.5', 'M18 19.25V4.75'],
  share: ['M12 14.75V4.5', 'M7.75 8.75 12 4.5l4.25 4.25', 'M5 13.75v4.5a1.25 1.25 0 0 0 1.25 1.25h11.5A1.25 1.25 0 0 0 19 18.25v-4.5'],
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An inline <svg> of one icon, `size` CSS pixels square. Decorative unless `label` is given. */
export function iconSvg(doc, name, { size = 18, cls = '', label = '' } = {}) {
  const paths = ICONS[name];
  if (!paths) throw new Error(`no icon named ${name}`);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon icon-${name} ${cls}`.trim());
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of paths) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Replace every <span data-icon="name" data-size="20"> in the document with its icon. */
export function drawIcons(doc, root = doc) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (!ICONS[el.dataset.icon]) continue;
    el.replaceWith(iconSvg(doc, el.dataset.icon, {
      size: Number(el.dataset.size) || 18,
      cls: el.className,
      label: el.getAttribute('aria-label') || '',
    }));
  }
}
