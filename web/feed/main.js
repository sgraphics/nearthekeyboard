// Demo feed: one post, a reply box, replies. Replies render as plain text with
// each tag in its own <span class="ntk-tag">, inside the same <p> as the text
// before it, so the Android stamp-button layer finds tag and text in one block.
// ?embed=1 also loads the web embed, which turns the tags into buttons.
import { MAIN_POST, BUILTIN_REPLIES, YOU } from './data.js';
import {
  splitTags, loadReplies, saveReplies, clearReplies, addReply, relTime, formatCount, avatarGrid, STORAGE_KEY,
} from './model.js';
import { pixelSvg, drawSprites, SPRITES } from '../lib/pixel.js';

const embedOn = new URLSearchParams(window.location.search).get('embed') === '1';
if (embedOn) {
  const s = document.createElement('script');
  s.src = '/embed/ntk-embed.js';
  document.head.append(s);
}

let storage = null;
try { storage = window.localStorage; } catch { /* storage switched off: replies live until reload */ }

const $ = (id) => document.getElementById(id);
const repliesEl = $('replies');
const composer = $('composer');
const box = $('reply-box');
const replyBtn = $('reply-btn');
const clearBtn = $('clear-btn');

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null && c !== false && c !== '') el.append(c);
  return el;
}

function avatar(handle) {
  const { rows, tone } = avatarGrid(handle);
  return pixelSvg(document, rows, { scale: 6, cls: `avatar tone-${tone}`, names: { o: 'avbg' } });
}

/** One block for the text and its tags: <p>text <span class="ntk-tag">[NTK id]</span></p> */
function textBlock(text, cls) {
  const p = h('p', { class: cls });
  for (const seg of splitTags(text)) p.append(seg.tag ? h('span', { class: 'ntk-tag' }, seg.text) : seg.text);
  return p;
}

function acts(c = {}) {
  const item = (sprite, n) => h('span', { class: 'act' }, pixelSvg(document, SPRITES[sprite], { scale: 2 }), h('span', {}, formatCount(n)));
  return h('div', { class: 'acts', 'aria-hidden': 'true' },
    item('reply', c.replies), item('repost', c.reposts), item('like', c.likes), item('views', c.views), item('share', 0));
}

function meta(r, time) {
  return h('div', { class: 'post-meta' },
    h('span', { class: 'name' }, r.name), ' ',
    h('span', { class: 'handle' }, `@${r.handle}`),
    h('span', { class: 'sep', 'aria-hidden': 'true' }, ' · '),
    h('span', { class: 'time' }, time));
}

function mainPost(p) {
  return h('article', { class: 'post main-post' },
    h('div', { class: 'post-head' },
      h('div', { class: 'post-avatar' }, avatar(p.handle)),
      h('div', { class: 'who' }, h('span', { class: 'name' }, p.name), h('span', { class: 'handle' }, `@${p.handle}`))),
    textBlock(p.text, 'post-text'),
    h('p', { class: 'post-time' }, p.time, ' · ', h('strong', {}, formatCount(p.views)), ' Views'),
    h('div', { class: 'post-stats' },
      h('span', {}, h('strong', {}, formatCount(p.reposts)), ' Reposts'),
      h('span', {}, h('strong', {}, formatCount(p.likes)), ' Likes')),
    acts({ replies: p.replies }));
}

function reply(r, time, mine) {
  return h('article', { class: `post reply${mine ? ' mine' : ''}` },
    h('div', { class: 'post-avatar' }, avatar(r.handle)),
    h('div', { class: 'post-body' }, meta(r, time), textBlock(r.text, 'reply-text'), acts(mine ? {} : r)));
}

let mine = loadReplies(storage);

function render() {
  const now = Date.now();
  repliesEl.replaceChildren(
    ...mine.map((r) => reply({ ...YOU, text: r.text }, relTime(r.at, now), true)),
    ...BUILTIN_REPLIES.map((r) => reply(r, r.time, false)));
  clearBtn.disabled = mine.length === 0;
}

function syncComposer() {
  replyBtn.disabled = box.value.trim() === '';
  box.style.height = 'auto';
  box.style.height = `${Math.min(box.scrollHeight + 2, 320)}px`;
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const next = addReply(mine, box.value);
  if (next === mine) return;
  mine = next;
  saveReplies(storage, mine);
  box.value = '';
  syncComposer();
  render();
});
box.addEventListener('input', syncComposer);
box.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) composer.requestSubmit();
});
clearBtn.addEventListener('click', () => {
  mine = [];
  clearReplies(storage);
  render();
});
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key === STORAGE_KEY) { mine = loadReplies(storage); render(); }
});

$('main-post').replaceWith(mainPost(MAIN_POST));
$('composer-avatar').append(avatar(YOU.handle));
$('replying-to').append('Replying to ', h('span', { class: 'handle' }, `@${MAIN_POST.handle}`));
const embedLine = $('embed-line');
if (embedOn) {
  embedLine.append('Tags are buttons here (web embed). ', h('a', { href: window.location.pathname }, 'Turn off'));
} else {
  embedLine.append('Tags are plain text here. ', h('a', { href: '?embed=1' }, 'Turn them into buttons'), ' (web embed).');
}
drawSprites(document);
syncComposer();
render();
