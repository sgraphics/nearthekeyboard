// The web embed (web/embed/ntk-embed.js): tag detection, URL building and the
// DOM work, run in a vm context with the fake DOM of fake-dom.mjs. The last
// test follows a click from the demo feed's markup to a MATCH.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  TAG_SOURCE, findTags as libFindTags, encodeText as libEncode, decodeText, verifyUrl as libVerifyUrl, verifyStamp,
} from '../lib/ntk-verify.js';
import { FakeDocument, fakeView } from './fake-dom.mjs';
import { STAMPED_REPLY } from '../feed/data.js';

const SRC = fs.readFileSync(new URL('../embed/ntk-embed.js', import.meta.url), 'utf8');
const VECTORS = JSON.parse(fs.readFileSync(new URL('../../docs/test-vectors/crypto-v1.json', import.meta.url), 'utf8'));
const plain = (x) => JSON.parse(JSON.stringify(x)); // objects from the vm realm, compared by value

function loadEmbed() {
  const ctx = vm.createContext({ TextEncoder, btoa, URL, console });
  vm.runInContext(SRC, ctx, { filename: 'ntk-embed.js' });
  return ctx.NTKEmbed;
}

/** The demo feed's markup for a reply: name outside the block, text and tag inside one <p>. */
function feedReply(doc, text) {
  const [tag] = libFindTags(text);
  const p = doc.h('p', { class: 'reply-text' }, text.slice(0, tag.index), doc.h('span', { class: 'ntk-tag' }, text.slice(tag.index, tag.index + tag.length)));
  const article = doc.h('article', { class: 'post reply' }, doc.h('div', { class: 'post-meta' }, 'Alice @ntk_alice · 1h'), p);
  doc.body.appendChild(article);
  return { article, p };
}

const buttons = (root) => [...root.descendants()].filter((e) => e.nodeName === 'BUTTON');

test('loads as a classic script without a page, and does not start by itself', () => {
  const E = loadEmbed();
  assert.equal(typeof E.scan, 'function');
  assert.equal(E.started, false);
});

test('its tag pattern is the one in lib/ntk-verify.js', () => {
  assert.equal(loadEmbed().TAG_SOURCE, TAG_SOURCE);
});

test('finds tags exactly like the reference verifier', () => {
  const E = loadEmbed();
  const samples = [
    'no tag here',
    'one [NTK e65ee28db5] tag',
    'old form [NTK @ntk-alice.testnet e65ee28db5]',
    'two [NTK 0123456789] and [NTK abcdefabcd]!',
    'not tags: [NTK E65EE28DB5] [NTK e65ee28db] [NTK  e65ee28db5] [ntk e65ee28db5]',
    '[NTK e65ee28db5][NTK e65ee28db6]',
  ];
  for (const s of samples) {
    const ours = plain(E.findTags(s)).map(({ id, index, length }) => ({ id, index, length }));
    const ref = libFindTags(s).map(({ id, index, length }) => ({ id, index, length }));
    assert.deepEqual(ours, ref, s);
  }
});

test('encodes text and builds verify URLs exactly like the reference verifier', () => {
  const E = loadEmbed();
  const long = 'xé👍'.repeat(30000); // over 64 KiB of UTF-8: exercises the chunking
  for (const s of ['', 'a', 'Hello world', 'émoji 👍 ok', '中文 　 x', 'line\nbreak', long]) {
    assert.equal(E.encodeText(s), libEncode(s));
    assert.equal(decodeText(E.encodeText(s)), s);
  }
  assert.equal(E.verifyUrl('https://ntk.tools/', 'e65ee28db5', 'Hi'), libVerifyUrl('e65ee28db5', 'Hi'));
  assert.equal(E.verifyUrl('http://localhost:3970/', 'e65ee28db5', ''), 'http://localhost:3970/e65ee28db5');
});

test('keeps at most the last N code points of a long prefix', () => {
  const E = loadEmbed();
  assert.equal(E.lastCodePoints('abc', 5), 'abc');
  assert.equal(E.lastCodePoints('abcdef', 3), 'def');
  assert.equal(E.lastCodePoints('a👍👍', 2), '👍👍');
});

test('turns a tag into a button inside the same block, leaving the text unchanged', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const { p } = feedReply(doc, STAMPED_REPLY.text);
  const before = p.textContent;
  const view = fakeView();
  const opts = E.readOptions(doc, view, null);
  assert.equal(E.scan(doc.body, opts), 1);
  const [btn] = buttons(doc.body);
  assert.ok(btn, 'a button');
  assert.equal(btn.textContent, '[NTK e65ee28db5]');
  assert.equal(btn.getAttribute('type'), 'button');
  assert.equal(btn.getAttribute('data-ntk-embed'), 'e65ee28db5');
  assert.equal(btn.parentNode.getAttribute('class'), 'ntk-tag', 'the button sits in the tag span');
  assert.equal(p.textContent, before, 'the block reads the same');
  assert.equal(E.scan(doc.body, opts), 0, 'a second scan changes nothing');
  assert.equal(buttons(doc.body).length, 1);
});

test('the text before the tag comes from the same block only', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const { p } = feedReply(doc, STAMPED_REPLY.text);
  E.scan(doc.body, E.readOptions(doc, fakeView(), null));
  const [btn] = buttons(doc.body);
  assert.equal(E.blockOf(btn, null), p);
  const prefix = E.textBefore(p, btn, null);
  assert.equal(prefix, 'This reply was typed by me, a human, on my own phone, one key at a time. ');
  assert.ok(!prefix.includes('Alice'), 'the name outside the block is not included');
});

test('line breaks, nested blocks and image alt text are read the way a reader sees them', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const p = doc.h('p', {}, 'line one', doc.h('br'), 'line two ', doc.h('img', { alt: '👍' }), ' [NTK 0123456789]');
  const div = doc.h('div', {}, doc.h('p', {}, 'first'), 'second [NTK abcdefabcd]');
  const hidden = doc.h('p', {}, doc.h('script', {}, 'var x = 1;'), 'shown [NTK 1111111111]');
  [p, div, hidden].forEach((el) => doc.body.appendChild(el));
  E.scan(doc.body, E.readOptions(doc, fakeView(), null));
  const [b1, b2, b3] = buttons(doc.body);
  assert.equal(E.textBefore(E.blockOf(b1, null), b1, null), 'line one\nline two 👍 ');
  assert.equal(E.textBefore(E.blockOf(b2, null), b2, null), '\nfirst\nsecond ');
  assert.equal(E.textBefore(E.blockOf(b3, null), b3, null), 'shown ');
});

test('uses the computed display when the page has one: inline-* is not a block', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const span = doc.h('span', {}, 'text [NTK e65ee28db5]');
  const p = doc.h('p', {}, 'before ', span);
  doc.body.appendChild(p);
  const view = fakeView({ display: (el) => (el.nodeName === 'SPAN' ? 'inline-block' : el.nodeName === 'BUTTON' ? 'inline-block' : 'block') });
  E.scan(doc.body, E.readOptions(doc, view, null));
  const [btn] = buttons(doc.body);
  assert.equal(E.blockOf(btn, view), p);
  assert.equal(E.textBefore(p, btn, view), 'before text ');
});

test('leaves links, buttons, form fields, editable areas and scripts alone', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const zones = [
    doc.h('a', { href: '#' }, 'link [NTK 0000000001]'),
    doc.h('button', {}, 'button [NTK 0000000002]'),
    doc.h('textarea', {}, 'typing [NTK 0000000003]'),
    doc.h('div', { contenteditable: 'true' }, doc.h('p', {}, 'editing [NTK 0000000004]')),
    doc.h('script', {}, '"[NTK 0000000005]"'),
    doc.h('style', {}, '/* [NTK 0000000006] */'),
  ];
  zones.forEach((z) => doc.body.appendChild(z));
  doc.body.appendChild(doc.h('p', {}, 'free [NTK 0000000007]'));
  assert.equal(E.scan(doc.body, E.readOptions(doc, fakeView(), null)), 1);
  assert.equal(buttons(doc.body).filter((b) => b.getAttribute('data-ntk-embed')).map((b) => b.getAttribute('data-ntk-embed')).join(), '0000000007');
});

test('several tags in one text node become several buttons, text kept in order', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const p = doc.h('p', {}, 'a [NTK 0123456789] b [NTK @x.testnet abcdefabcd] c');
  doc.body.appendChild(p);
  assert.equal(E.scan(doc.body, E.readOptions(doc, fakeView(), null)), 2);
  assert.equal(p.textContent, 'a [NTK 0123456789] b [NTK @x.testnet abcdefabcd] c');
  assert.deepEqual(p.childNodes.map((c) => c.nodeName), ['#text', 'BUTTON', '#text', 'BUTTON', '#text']);
});

test('options: the verify base is the site the script came from, unless the page says otherwise', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  const view = fakeView();
  const local = doc.h('script', { src: 'http://localhost:3970/embed/ntk-embed.js' });
  let o = plain({ ...E.readOptions(doc, view, local), doc: null, view: null });
  assert.equal(o.base, 'http://localhost:3970/');
  assert.equal(o.css, 'http://localhost:3970/embed/ntk-embed.css');
  assert.equal(o.target, '_blank');
  o = E.readOptions(doc, view, doc.h('script', { src: 'https://ntk.tools/embed/ntk-embed.js?v=2' }));
  assert.equal(o.base, 'https://ntk.tools/');
  o = E.readOptions(doc, view, doc.h('script', { src: 'https://cdn.example/x.js', 'data-verify-base': 'https://ntk.tools', 'data-target': '_self' }));
  assert.equal(o.base, 'https://ntk.tools/');
  assert.equal(o.target, '_self');
  assert.equal(E.readOptions(doc, view, null).base, 'https://ntk.tools/');
});

test('start(): adds the stylesheet once, wraps what is there and what arrives later', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  feedReply(doc, STAMPED_REPLY.text);
  const view = fakeView();
  const script = doc.h('script', { src: 'http://localhost:3970/embed/ntk-embed.js' });
  E.start(doc, view, script);
  assert.equal(E.started, true);
  const links = [...doc.documentElement.descendants()].filter((e) => e.nodeName === 'LINK');
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), 'http://localhost:3970/embed/ntk-embed.css');
  assert.equal(buttons(doc.body).length, 1);
  assert.equal(view.observers.length, 1);
  assert.equal(view.observers[0].target, doc.body);
  assert.deepEqual(plain(view.observers[0].opts), { childList: true, subtree: true, characterData: true });

  // A reply posted later: the observer reports it, the embed wraps it.
  doc.mutations = [];
  const { article } = feedReply(doc, 'I agree with this, and I typed every word myself. [NTK 0123456789]');
  view.observers[0].cb([{ type: 'childList', addedNodes: [article] }]);
  assert.equal(buttons(doc.body).length, 2);
  // Its own insertions come back as mutations too; feeding them in changes nothing.
  view.observers[0].cb(doc.mutations.map((m) => ({ type: 'childList', addedNodes: m.addedNodes })));
  assert.equal(buttons(doc.body).length, 2);
  E.start(doc, view, script);
  assert.equal(view.observers.length, 1, 'starting twice does nothing');
});

test('a click on the built-in reply opens a verify URL that checks out as MATCH', async () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  feedReply(doc, STAMPED_REPLY.text);
  const view = fakeView();
  E.start(doc, view, doc.h('script', { src: 'http://localhost:3970/embed/ntk-embed.js' }));
  const [btn] = buttons(doc.body);
  const ev = btn.click();
  assert.ok(ev.defaultPrevented && ev.propagationStopped);
  assert.equal(view.opened.length, 1);
  const { url, target, features } = view.opened[0];
  assert.equal(target, '_blank');
  assert.equal(features, 'noopener');
  const u = new URL(url);
  assert.equal(u.origin, 'http://localhost:3970');
  assert.equal(u.pathname, '/e65ee28db5');
  const prefix = decodeText(new URLSearchParams(u.hash.slice(1)).get('t'));
  if (libFindTags(STAMPED_REPLY.text)[0].id !== VECTORS.stamp.id) return; // the constant now names a newer stamp
  const r = await verifyStamp(VECTORS.stamp, prefix, { id: 'e65ee28db5' });
  assert.equal(r.verdict, 'MATCH');
});

test('a reply posted with the v2 stamp, line break included, checks out as MATCH from a click', async () => {
  const V2 = JSON.parse(fs.readFileSync(new URL('./fixtures/stamp-26144e35e7.json', import.meta.url), 'utf8'));
  const E = loadEmbed();
  const doc = new FakeDocument();
  feedReply(doc, STAMPED_REPLY.text);
  const view = fakeView();
  E.start(doc, view, doc.h('script', { src: 'https://ntk.tools/embed/ntk-embed.js' }));
  const { article } = feedReply(doc, 'I agree with this,\nand I typed every word myself. [NTK 26144e35e7]');
  view.observers[0].cb([{ type: 'childList', addedNodes: [article] }]);
  const btn = buttons(article)[0];
  btn.click();
  const u = new URL(view.opened.at(-1).url);
  assert.equal(u.pathname, '/26144e35e7');
  const prefix = decodeText(new URLSearchParams(u.hash.slice(1)).get('t'));
  assert.equal(prefix, 'I agree with this,\nand I typed every word myself. ');
  assert.equal((await verifyStamp(V2, prefix, { id: '26144e35e7' })).verdict, 'MATCH');
});

test('data-target="_self" opens the verify page in the same tab', () => {
  const E = loadEmbed();
  const doc = new FakeDocument();
  feedReply(doc, STAMPED_REPLY.text);
  const view = fakeView();
  E.start(doc, view, doc.h('script', { src: 'https://ntk.tools/embed/ntk-embed.js', 'data-target': '_self' }));
  buttons(doc.body)[0].click();
  assert.equal(view.opened.length, 0);
  assert.equal(view.assigned.length, 1);
  assert.match(view.assigned[0], /^https:\/\/ntk\.tools\/e65ee28db5#t=/);
});
