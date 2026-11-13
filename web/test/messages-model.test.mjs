// Demo messages logic (web/messages/model.js): the conversation, your messages
// in storage, and the order the thread shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, MAX_MESSAGES, THREAD, CONTACT, loadMessages, saveMessages, clearMessages, addMessage, clockTime, threadItems,
} from '../messages/model.js';
import { STAMPED_REPLY } from '../feed/data.js';
import { splitTags } from '../feed/model.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('the conversation: a friend asks whether a machine wrote it, and the reply carries the real stamp', () => {
  assert.equal(CONTACT.name, 'Maya');
  assert.ok(THREAD.some((m) => m.from === 'them' && /ChatGPT/.test(m.text)), 'the friend asks');
  const last = THREAD[THREAD.length - 1];
  assert.equal(last.from, 'me');
  assert.equal(last.text, STAMPED_REPLY.text);
  assert.equal(last.text, 'This reply was typed by me, a human, on my own phone, one key at a time. [NTK e65ee28db5]');
  const segs = splitTags(last.text);
  assert.deepEqual(segs.map((s) => s.tag || null), [null, 'e65ee28db5'], 'one block: the text, then its tag');
});

test('your messages: added at the end, trimmed, kept in storage, cleared', () => {
  const s = memoryStorage();
  assert.deepEqual(loadMessages(s), []);
  let list = addMessage([], '  hello  ', 1000, 'a');
  list = addMessage(list, 'second', 2000, 'b');
  assert.deepEqual(list.map((m) => m.text), ['hello', 'second'], 'oldest first');
  assert.equal(addMessage(list, '   '), list, 'empty text changes nothing');
  assert.ok(saveMessages(s, list));
  assert.deepEqual(loadMessages(s), list);
  assert.ok(s.m.has(STORAGE_KEY));
  assert.ok(clearMessages(s));
  assert.deepEqual(loadMessages(s), []);
  let many = [];
  for (let i = 0; i < MAX_MESSAGES + 5; i++) many = addMessage(many, `m${i}`, i, `id${i}`);
  assert.equal(many.length, MAX_MESSAGES);
  assert.equal(many[many.length - 1].text, `m${MAX_MESSAGES + 4}`, 'the newest stay');
  assert.deepEqual(loadMessages(null), []);
  assert.deepEqual(loadMessages({ getItem: () => { throw new Error('off'); } }), []);
  assert.equal(saveMessages(null, list), false);
});

test('the thread: a day-and-time line where the day changes, your messages last', () => {
  const items = threadItems([{ id: 'x', text: 'mine [NTK 0123456789]', at: new Date(2026, 10, 14, 8, 5).getTime() }]);
  assert.deepEqual(items.filter((i) => i.divider).map((i) => i.divider), ['Yesterday 22:14', 'Today 09:38']);
  const last = items[items.length - 1];
  assert.equal(last.text, 'mine [NTK 0123456789]');
  assert.equal(last.mine, true);
  assert.equal(last.time, '08:05');
  assert.equal(clockTime(new Date(2026, 0, 1, 23, 7).getTime()), '23:07');
});

test('?fresh=1 ends the thread with the question; ?as=maya is the friend\'s view', async () => {
  const { viewOptions, conversation, THREAD: T, ME } = await import('../messages/model.js');
  assert.deepEqual(viewOptions(''), { fresh: false, asFriend: false, embed: false });
  assert.deepEqual(viewOptions('?fresh=1&as=maya&embed=1'), { fresh: true, asFriend: true, embed: true });
  assert.equal(conversation({}).length, T.length);
  const fresh = conversation({ fresh: true });
  assert.equal(fresh.length, T.length - 1);
  assert.equal(fresh[fresh.length - 1].from, 'them');
  assert.match(fresh[fresh.length - 1].text, /ChatGPT/);
  assert.ok(ME.name && ME.initial);
});
