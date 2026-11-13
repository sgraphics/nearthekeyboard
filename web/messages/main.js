// Demo messages: a phone conversation with a friend, in the look of an ordinary
// messages app. Each bubble's text and its tags sit in one <p>, each tag in its
// own <span class="ntk-tag">, so the Android stamp-button layer finds tag and
// text in one block. ?embed=1 also loads the web embed, which turns the tags
// into buttons. The logic lives in model.js; this file only builds the DOM.
import { CONTACT, threadItems, loadMessages, saveMessages, clearMessages, addMessage, STORAGE_KEY } from './model.js';
import { splitTags } from '../feed/model.js';
import { drawIcons } from '../lib/icons.js';

const embedOn = new URLSearchParams(window.location.search).get('embed') === '1';
if (embedOn) {
  const s = document.createElement('script');
  s.src = '/embed/ntk-embed.js';
  document.head.append(s);
}

let storage = null;
try { storage = window.localStorage; } catch { /* storage switched off: messages live until reload */ }

const $ = (id) => document.getElementById(id);
const threadEl = $('thread');
const composer = $('composer');
const box = $('message-box');
const sendBtn = $('send-btn');
const clearBtn = $('clear-btn');

/** Element builder: strings become text nodes, never HTML. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null && c !== false && c !== '') el.append(c);
  return el;
}

/** One block for the text and its tags: <p>text <span class="ntk-tag">[NTK id]</span></p> */
function textBlock(text) {
  const p = h('p', { class: 'bubble-text' });
  for (const seg of splitTags(text)) p.append(seg.tag ? h('span', { class: 'ntk-tag' }, seg.text) : seg.text);
  return p;
}

function bubble(m) {
  const out = m.from === 'me';
  return h('div', { class: `msg ${out ? 'out' : 'in'}` },
    h('div', { class: 'bubble' }, textBlock(m.text)),
    h('span', { class: 'msg-time' }, out ? `${m.time} · Delivered` : m.time));
}

let mine = loadMessages(storage);

function render() {
  const note = h('p', { class: 'thread-note' }, 'A demo conversation. Messages you send stay in this browser. ',
    embedOn
      ? ['Tags are buttons here (web embed). ', h('a', { href: window.location.pathname }, 'Turn off')]
      : ['Tags are plain text here. ', h('a', { href: '?embed=1' }, 'Turn them into buttons'), ' (web embed).']);
  threadEl.replaceChildren(note, ...threadItems(mine).map((it) =>
    it.divider ? h('p', { class: 'divider' }, it.divider) : bubble(it)));
  clearBtn.disabled = mine.length === 0;
}

function toBottom() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
}

function syncComposer() {
  sendBtn.disabled = box.value.trim() === '';
  box.style.height = 'auto';
  box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = addMessage(mine, box.value);
  if (next === mine) return;
  mine = next;
  saveMessages(storage, mine);
  box.value = '';
  syncComposer();
  render();
  toBottom();
});
box.addEventListener('input', syncComposer);
box.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) composer.requestSubmit();
});
clearBtn.addEventListener('click', () => {
  mine = [];
  clearMessages(storage);
  render();
});
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key === STORAGE_KEY) { mine = loadMessages(storage); render(); }
});

$('contact-name').textContent = CONTACT.name;
$('contact-avatar').textContent = CONTACT.initial;
drawIcons(document);
syncComposer();
render();
toBottom();
