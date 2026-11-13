// Verify page. Reads the address (/<id>#t=<text>) or the paste box, checks the
// stamp with lib/ntk-verify.js and shows every check. Only the stamp id goes
// over the network, to OutLayer's public storage; the text stays on the page.
// The logic lives in model.js; this file only builds the DOM.
import { fetchStamp, verifyStamp, verifyText, findTags, verifyUrl } from '../lib/ntk-verify.js';
import { parseLocation, verifyBaseFor, boxMessage, buildView, hasText } from './model.js';
import { installSubtleFallback } from './sha-fallback.js';
import { iconSvg } from '../lib/icons.js';
import { STAMPED_REPLY } from '../feed/data.js';

// Plain http from another machine (an emulator, a phone on the LAN) has no crypto.subtle.
installSubtleFallback(globalThis);

const $ = (id) => document.getElementById(id);
const resultsEl = $('results');
const form = $('check-form');
const box = $('message');
const notice = $('notice');
const formTitle = $('check-title');
const exampleLink = $('example-link');
const PLACEHOLDER = box.getAttribute('placeholder') || '';
const BASE = verifyBaseFor(window.location); // https://ntk.tools/, or this origin in local development
const linkFor = (id, prefix) => verifyUrl(id, hasText(prefix) ? prefix : '', BASE);

/** Element builder: strings become text nodes, never HTML. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null && c !== false && c !== '') el.append(c);
  return el;
}

const MARKS = { pass: ['check', 'PASS'], fail: ['cross', 'FAIL'], skip: ['dash', 'SKIP'], link: ['out', 'LINK'] };
function mark(status) {
  const [icon, word] = MARKS[status];
  return h('span', { class: `mark mark-${status}` }, iconSvg(document, icon, { size: 16 }), h('span', {}, word));
}

function selectText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function callItem(call) {
  const code = h('code', { class: 'cmd' }, call.command);
  const copy = h('button', { type: 'button', class: 'btn btn-small' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(call.command);
      copy.textContent = 'Copied';
    } catch {
      selectText(code);
      copy.textContent = 'Selected';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
  });
  return h('li', { class: 'check is-link' }, mark('link'), h('div', { class: 'check-text' },
    h('span', { class: 'check-label' }, 'The issuing call ran in an Intel TDX enclave on OutLayer'),
    h('span', { class: 'check-detail' }, 'Not checked by this page: see the ',
      h('a', { href: call.url, target: '_blank', rel: 'noopener noreferrer' }, 'attestation of the call'),
      ', or prove it with outlayer-verify:'),
    h('span', { class: 'cmd-row' }, code, copy)));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The typing match score on a fine scale from 0 to 100, lit up to the score, the score it needs marked in gold. */
function scale({ pct, needs }) {
  const W = 400;
  const H = 22;
  const at = (p) => 0.5 + (Math.min(100, Math.max(0, p)) / 100) * (W - 1);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'scale-ticks');
  svg.setAttribute('aria-hidden', 'true');
  const line = (x, y1, y2, cls) => {
    const l = document.createElementNS(SVG_NS, 'line');
    for (const [k, val] of Object.entries({ x1: x, x2: x, y1, y2, class: cls, 'vector-effect': 'non-scaling-stroke' })) l.setAttribute(k, String(val));
    svg.append(l);
  };
  for (let p = 0; p <= 100; p += 2.5) line(at(p), p % 10 === 0 ? 6 : 10, H - 4, `tick${p % 10 === 0 ? ' major' : ''}${p <= pct ? ' on' : ''}`);
  if (needs != null) line(at(needs), 1, H, 'needs');
  line(at(pct), 0, H, 'score');
  return h('div', { class: 'scale' },
    h('p', { class: 'scale-head' },
      h('span', {}, 'Typing match score ', h('strong', {}, `${pct}%`)),
      needs != null ? h('span', { class: 'scale-needs' }, `needs ${needs}%`) : null),
    svg);
}

// A result: a white tile with a dark display set into its top (the stamp, the
// verdict with its light, the summary), and below it the text, the facts and the checks.
function renderView(v) {
  const display = h('div', { class: 'display' },
    h('div', { class: 'display-top' },
      h('p', { class: 'stamp-line' }, 'Stamp ', h('code', {}, v.id || '?')),
      h('span', { class: 'chip chip-testnet' }, String(v.network).toUpperCase())),
    h('div', { class: 'verdict-row' }, h('h2', { class: 'verdict' }, v.title)),
    h('p', { class: 'summary' }, v.summary),
    v.score ? scale(v.score) : null,
    v.link ? h('p', { class: 'display-link' },
      h('a', { href: v.link, title: 'This check, text included (the text stays in the # part)' },
        iconSvg(document, 'out', { size: 14 }), h('span', {}, 'Link to this check'))) : null);
  const body = h('div', { class: 'result-body' });
  if (v.covered != null) {
    body.append(h('figure', { class: 'covered' },
      h('figcaption', {}, v.coveredLabel),
      h('blockquote', {}, h('p', {}, `“${v.covered}”`))));
  }
  if (v.facts.length) {
    body.append(h('dl', { class: 'facts tiles' }, v.facts.map((f) => h('div', { class: 'fact' }, h('dt', {}, f.label), h('dd', {}, f.value)))));
  }
  if (v.meaning) body.append(h('p', { class: 'meaning' }, v.meaning));
  const list = h('ol', { class: 'checks' }, v.checks.map((c) => h('li', { class: `check is-${c.status}` }, mark(c.status),
    h('div', { class: 'check-text' },
      h('span', { class: 'check-label' }, c.label),
      c.detail ? h('span', { class: 'check-detail' }, c.detail) : null))));
  if (v.call) list.append(callItem(v.call));
  body.append(h('h3', { class: 'checks-title' }, 'What was checked'), list);
  if (v.record) body.append(h('p', { class: 'fine' }, `Stamp record v${v.record.v}, enclave ${v.record.enclave}.`));
  return h('article', { class: `result pbox tone-${v.tone}` }, display, body);
}

function setState(state) { document.body.dataset.state = state; }

function showNotice(text) {
  notice.textContent = text || '';
  notice.hidden = !text;
}

function showLoading(ids) {
  setState('busy');
  resultsEl.replaceChildren(h('p', { class: 'loading pbox' },
    h('span', { class: 'blink', 'aria-hidden': 'true' }),
    `Looking up ${ids.length > 1 ? 'stamps' : 'stamp'} ${ids.join(', ')}…`));
}

function showResults(views, title) {
  resultsEl.replaceChildren(...views.map(renderView));
  formTitle.textContent = title;
  setState('result');
}

let seq = 0; // a newer check wins over a slower older one

async function checkAddress() {
  const loc = parseLocation(window.location);
  showNotice(loc.error);
  if (!loc.id) {
    seq++;
    resultsEl.replaceChildren();
    formTitle.textContent = 'Check an NTK stamp';
    setState('idle');
    return;
  }
  const textGiven = hasText(loc.text);
  box.value = textGiven ? boxMessage(loc.id, loc.text) : '';
  box.placeholder = textGiven ? PLACEHOLDER : `Paste the message that ends with [NTK ${loc.id}]`;
  const my = ++seq;
  showLoading([loc.id]);
  let view;
  const link = linkFor(loc.id, loc.text);
  try {
    const published = await fetchStamp(loc.id);
    const result = await verifyStamp(published, textGiven ? loc.text : null, { id: loc.id });
    view = buildView(result, { id: loc.id, textGiven, link });
  } catch (e) {
    view = buildView({ verdict: 'ERROR', error: e.message, checks: [] }, { id: loc.id, textGiven, link });
  }
  if (my !== seq) return;
  showResults([view], textGiven ? 'Change the text and check again' : 'Check the text');
}

async function checkBox(ev) {
  ev.preventDefault();
  const text = box.value;
  const tags = findTags(text);
  if (!tags.length) {
    showNotice('No NTK tag found. A tag is NTK and a 10-character id in square brackets, at the end of the text.');
    box.focus();
    return;
  }
  showNotice(null);
  const my = ++seq;
  showLoading(tags.map((t) => t.id));
  let views;
  try {
    const results = await verifyText(text);
    views = results.map((r) => {
      const prefix = text.slice(0, r.tag.index);
      return buildView(r, { id: r.tag.id, textGiven: hasText(prefix), link: linkFor(r.tag.id, prefix) });
    });
  } catch (e) {
    views = tags.map((t) => buildView({ verdict: 'ERROR', error: e.message, checks: [] },
      { id: t.id, link: linkFor(t.id, text.slice(0, t.index)) }));
  }
  if (my !== seq) return;
  // Keep the address in step. The text goes into the fragment, which browsers never send.
  const one = tags.length === 1 ? tags[0] : null;
  window.history.replaceState(null, '', one ? verifyUrl(one.id, text.slice(0, one.index), '/') : '/');
  showResults(views, 'Check another message');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resultsEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

// "Try an example": the built-in stamped reply of the demo feed (one constant in feed/data.js).
const demo = findTags(STAMPED_REPLY.text)[0];
if (demo) exampleLink.href = verifyUrl(demo.id, STAMPED_REPLY.text.slice(0, demo.index), '/');
exampleLink.addEventListener('click', (e) => {
  if (exampleLink.href === window.location.href) { e.preventDefault(); checkAddress(); }
});

form.addEventListener('submit', checkBox);
box.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
});
window.addEventListener('hashchange', checkAddress);
checkAddress();
