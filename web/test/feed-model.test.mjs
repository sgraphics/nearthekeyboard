// Demo feed logic (web/feed/model.js, web/feed/data.js) and the pixel sprites (web/lib/pixel.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findTags, verifyStamp, fetchStamp } from '../lib/ntk-verify.js';
import {
  splitTags, parseReplies, loadReplies, saveReplies, clearReplies, addReply, relTime, formatCount, avatarGrid,
  STORAGE_KEY, MAX_REPLIES,
} from '../feed/model.js';
import { STAMPED_REPLY, MAIN_POST, BUILTIN_REPLIES, YOU } from '../feed/data.js';
import { gridRuns, gridSize, SPRITES } from '../lib/pixel.js';

const { stamp: STAMP } = JSON.parse(fs.readFileSync(new URL('../../docs/test-vectors/crypto-v1.json', import.meta.url), 'utf8'));

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    map: m,
  };
}
const brokenStorage = {
  getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); },
};

test('the built-in stamped reply: one constant, the agreed text, then " [NTK e65ee28db5]"', () => {
  assert.equal(STAMPED_REPLY.text,
    'This reply was typed by me, a human, on my own phone, one key at a time. [NTK e65ee28db5]');
  assert.deepEqual(splitTags(STAMPED_REPLY.text), [
    { text: 'This reply was typed by me, a human, on my own phone, one key at a time. ' },
    { text: '[NTK e65ee28db5]', tag: 'e65ee28db5' },
  ]);
  assert.equal(BUILTIN_REPLIES[0].text, STAMPED_REPLY.text, 'the feed shows that constant');
});

test('the built-in stamped reply verifies: MATCH (offline for e65ee28db5; NTK_LIVE=1 for any id)', async (t) => {
  const [tag] = findTags(STAMPED_REPLY.text);
  const prefix = STAMPED_REPLY.text.slice(0, tag.index);
  let published = tag.id === STAMP.id ? STAMP : null;
  if (!published) {
    if (process.env.NTK_LIVE !== '1') return t.skip(`stamp ${tag.id} is not in the test vectors; set NTK_LIVE=1`);
    published = await fetchStamp(tag.id);
  }
  assert.equal((await verifyStamp(published, prefix, { id: tag.id })).verdict, 'MATCH');
});

test('no other text on the feed contains a tag', () => {
  for (const r of BUILTIN_REPLIES.slice(1)) assert.equal(findTags(r.text).length, 0, r.handle);
  assert.equal(findTags(MAIN_POST.text).length, 0);
  assert.ok(YOU.name && YOU.handle);
});

test('splitTags: text and tags in order, nothing lost', () => {
  const s = 'a [NTK 0123456789] b [NTK @x.testnet abcdefabcd]c [NTK BAD] [NTK 1111111111]';
  const parts = splitTags(s);
  assert.equal(parts.map((p) => p.text).join(''), s);
  assert.deepEqual(parts.filter((p) => p.tag).map((p) => p.tag), ['0123456789', 'abcdefabcd', '1111111111']);
  assert.deepEqual(splitTags('plain'), [{ text: 'plain' }]);
  assert.deepEqual(splitTags(''), []);
  assert.deepEqual(splitTags('[NTK 0123456789]'), [{ text: '[NTK 0123456789]', tag: '0123456789' }]);
});

test('replies: add, keep newest first, trim the ends only, ignore empty', () => {
  let list = [];
  list = addReply(list, '  first\n\nreply  ', 1000, 'a');
  list = addReply(list, '   ', 2000, 'x');
  list = addReply(list, 'second [NTK 0123456789]', 3000, 'b');
  assert.deepEqual(list, [{ id: 'b', text: 'second [NTK 0123456789]', at: 3000 }, { id: 'a', text: 'first\n\nreply', at: 1000 }]);
  const same = [];
  assert.equal(addReply(same, ''), same, 'empty text: the same list');
  let many = [];
  for (let i = 0; i < MAX_REPLIES + 5; i++) many = addReply(many, `r${i}`, i, `id${i}`);
  assert.equal(many.length, MAX_REPLIES);
  assert.equal(many[0].text, `r${MAX_REPLIES + 4}`);
});

test('replies: stored in localStorage, read back defensively, cleared', () => {
  const s = memoryStorage();
  const list = addReply([], 'hello', 5, 'id');
  assert.ok(saveReplies(s, list));
  assert.deepEqual(loadReplies(s), list);
  assert.ok(s.map.has(STORAGE_KEY));
  assert.ok(clearReplies(s));
  assert.deepEqual(loadReplies(s), []);
  assert.deepEqual(loadReplies(null), []);
  assert.deepEqual(loadReplies(brokenStorage), []);
  assert.equal(saveReplies(brokenStorage, list), false);
  assert.equal(clearReplies(null), false);
  for (const junk of ['not json', '{}', 'null', '[1, null, {"id": 1}, {"id": "a", "text": " ", "at": 1}]']) {
    assert.deepEqual(parseReplies(junk), [], junk);
  }
  assert.deepEqual(parseReplies('[{"id":"a","text":"ok","at":1,"extra":true}]'), [{ id: 'a', text: 'ok', at: 1 }]);
});

test('relTime and formatCount read like a feed', () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);
  assert.equal(relTime(now - 5_000, now), 'now');
  assert.equal(relTime(now - 5 * 60_000, now), '5m');
  assert.equal(relTime(now - 3 * 3_600_000, now), '3h');
  assert.match(relTime(now - 3 * 86_400_000, now), /^Nov 1[01]$/);
  assert.equal(relTime(now + 10_000, now), 'now', 'clock skew is not negative');
  assert.deepEqual([0, 7, 999, 1104, 6870, 48213, 412000, 1_250_000].map(formatCount),
    ['', '7', '999', '1.1K', '6.8K', '48K', '412K', '1.2M']);
});

test('pixel avatars: 7x7, stepped corners, mirrored, stable per handle', () => {
  for (const handle of ['ntk_alice', 'inesvarga', 'you', 'trhee', '']) {
    const a = avatarGrid(handle);
    assert.deepEqual(avatarGrid(handle), a, 'deterministic');
    assert.equal(a.rows.length, 7);
    assert.ok(a.rows.every((r) => r.length === 7));
    for (const [y, x] of [[0, 0], [0, 6], [6, 0], [6, 6]]) assert.equal(a.rows[y][x], '.');
    for (const r of a.rows) assert.equal(r, [...r].reverse().join(''), 'mirror symmetric');
    assert.ok(a.rows.join('').split('#').length - 1 >= 4, 'never nearly empty');
    assert.ok([0, 1, 2].includes(a.tone));
  }
  assert.notDeepEqual(avatarGrid('ntk_alice').rows, avatarGrid('inesvarga').rows);
});

test('pixel sprites: rectangular grids, merged into runs', () => {
  for (const [name, rows] of Object.entries(SPRITES)) {
    const { w } = gridSize(rows);
    assert.ok(rows.every((r) => r.length === w), `${name} rows have one width`);
  }
  assert.deepEqual(gridRuns(['##.#', '.ooo']), [
    { x: 0, y: 0, w: 2, c: '#' }, { x: 3, y: 0, w: 1, c: '#' }, { x: 1, y: 1, w: 3, c: 'o' },
  ]);
  for (const name of ['check', 'cross', 'dash', 'out', 'back', 'reply', 'repost', 'like', 'views', 'share']) {
    assert.ok(SPRITES[name], `sprite ${name} exists`);
  }
});
