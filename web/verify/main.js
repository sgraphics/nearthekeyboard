// Verify page. Reads the address (/<id>#t=<text>) or the paste box, checks the
// stamp with lib/ntk-verify.js and shows every check. Only the stamp id goes
// over the network, to OutLayer's public storage on each pinned network (testnet,
// and mainnet once its keys are pinned); the text stays on the page.
// The logic lives in model.js; this file only builds the DOM.
import { PINNED, verifyId, verifyText, findTags, verifyUrl } from '../lib/ntk-verify.js';
import { parseLocation, verifyBaseFor, boxMessage, buildView, hasText, siteNetworks } from './model.js';
import { installSubtleFallback } from './sha-fallback.js';
import { iconSvg } from '../lib/icons.js';
import { dialEl } from '../lib/dial.js';
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
const ASKED = PINNED.map((p) => p.network); // the networks a stamp id is looked up on

// The site bar and the footer name those networks (a page cached from before they had ids is left as it is).
{
  const site = siteNetworks(ASKED);
  const chip = $('site-net');
  if (chip) {
    chip.textContent = site.chip;
    chip.title = site.title;
    chip.className = ASKED.length === 1 ? `chip chip-${ASKED[0]}` : 'chip';
  }
  const foot = $('foot-net');
  if (foot) foot.textContent = site.footer;
}

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

/** The typing match score on the dial: the needle at the score, a mark at the score it needs. */
function meter({ pct, needs }) {
  return h('div', { class: 'meter' },
    h('p', { class: 'meter-head' },
      h('span', {}, 'Typing match score ', h('strong', {}, `${pct}%`)),
      needs != null ? h('span', {}, `needs ${needs}%`) : null),
    dialEl(document, { score: pct, needs }));
}

// A result: a flat plate. At its top the stamp, the verdict in large thin type with
// a small indicator, the summary and, on a MATCH, the dial; below, the text, the
// facts and every check.
function renderView(v) {
  const head = h('div', { class: 'result-head' },
    h('div', { class: 'result-top' },
      h('p', { class: 'stamp-line' }, 'Stamp ', h('code', {}, v.id || '?')),
      h('span', { class: v.chip === String(v.network).toUpperCase() ? `chip chip-${v.network}` : 'chip' }, v.chip)),
    h('div', { class: 'verdict-row' },
      h('span', { class: 'indicator', 'aria-hidden': 'true' }),
      h('h2', { class: 'verdict' }, v.title)),
    h('p', { class: 'summary' }, v.summary),
    v.score ? meter(v.score) : null,
    v.link ? h('p', { class: 'result-link' },
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
  return h('article', { class: `result pbox tone-${v.tone}` }, head, body);
}

function setState(state) { document.body.dataset.state = state; }

function showNotice(text) {
  notice.textContent = text || '';
  notice.hidden = !text;
}

// Waiting on the network: the dial with its needle sweeping.
function showLoading(ids) {
  setState('busy');
  resultsEl.replaceChildren(h('div', { class: 'loading pbox' },
    h('p', { class: 'loading-text' }, `Looking up ${ids.length > 1 ? 'stamps' : 'stamp'} ${ids.join(', ')}…`),
    dialEl(document, { busy: true })));
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
    const result = await verifyId(loc.id, textGiven ? loc.text : null);
    view = buildView(result, { id: loc.id, textGiven, link });
  } catch (e) {
    view = buildView({ verdict: 'ERROR', error: e.message, checks: [], networks: ASKED }, { id: loc.id, textGiven, link });
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
    views = tags.map((t) => buildView({ verdict: 'ERROR', error: e.message, checks: [], networks: ASKED },
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
