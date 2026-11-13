// Demo messages: a phone conversation with a friend, in the look of an ordinary
// messages app. Each bubble's text and its tags sit in one <p>, each tag in its
// own <span class="ntk-tag">, so the Android stamp-button layer finds tag and
// text in one block. ?embed=1 also loads the web embed, which turns the tags
// into buttons. The logic lives in model.js; this file only builds the DOM.
import { CONTACT, ME, threadItems, loadMessages, saveMessages, clearMessages, addMessage, STORAGE_KEY, viewOptions, conversation } from './model.js';
import { splitTags } from '../feed/model.js';
import { drawIcons } from '../lib/icons.js';

const opts = viewOptions(window.location.search);
const embedOn = opts.embed;
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

/** The address with the embed switched on or off, the other options kept. */
function withEmbed(on) {
  const q = new URLSearchParams(window.location.search);
  if (on) q.set('embed', '1'); else q.delete('embed');
  const s = q.toString();
  return `${window.location.pathname}${s ? `?${s}` : ''}`;
}

function bubble(m) {
  // On the friend's phone (?as=maya) your messages arrive, and theirs go out.
  const out = (m.from === 'me') !== opts.asFriend;
  return h('div', { class: `msg ${out ? 'out' : 'in'}` },
    h('div', { class: 'bubble' }, textBlock(m.text)),
    h('span', { class: 'msg-time' }, out ? `${m.time} · Delivered` : m.time));
}

let mine = loadMessages(storage);

function render() {
  const note = h('p', { class: 'thread-note' },
    opts.asFriend ? `A demo conversation, as ${CONTACT.name}'s phone shows it. ` : 'A demo conversation. Messages you send stay in this browser. ',
    embedOn
      ? ['Tags are buttons here (web embed). ', h('a', { href: withEmbed(false) }, 'Turn off')]
      : ['Tags are plain text here. ', h('a', { href: withEmbed(true) }, 'Turn them into buttons'), ' (web embed).']);
  threadEl.replaceChildren(note, ...threadItems(mine, conversation(opts)).map((it) =>
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

const other = opts.asFriend ? ME : CONTACT;
$('contact-name').textContent = other.name;
$('contact-avatar').textContent = other.initial;
if (opts.asFriend) {
  // The friend only reads here: no composer, nothing to clear.
  composer.hidden = true;
  clearBtn.hidden = true;
}
drawIcons(document);
syncComposer();
render();
toBottom();
