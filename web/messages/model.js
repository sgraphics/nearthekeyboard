// Demo messages (/messages/) without the DOM: the conversation, your own
// messages in localStorage, and what the thread shows in order. Pure; web/test/
// covers it. The stamped reply is the demo feed's (feed/data.js), one constant.
import { parseReplies } from '../feed/model.js';
import { STAMPED_REPLY } from '../feed/data.js';

export const STORAGE_KEY = 'ntk-demo-messages:v1';
export const MAX_MESSAGES = 50;
export const MAX_MESSAGE_CHARS = 5000;

/** The friend on the other end. Invented. */
export const CONTACT = Object.freeze({ name: 'Maya', initial: 'M' });

/**
 * The conversation so far, oldest first: something you sent last night, your
 * friend's question this morning, and your reply that carries a real stamp.
 */
export const THREAD = Object.freeze([
  {
    from: 'me', day: 'Yesterday', time: '22:14',
    text: 'I just wanted to say thank you for everything this week. Your support truly means the world to me, ' +
      'and I want you to know how deeply I appreciate having you in my life.',
  },
  { from: 'them', day: 'Today', time: '09:38', text: 'Aww, that was really sweet 🥹' },
  { from: 'them', day: 'Today', time: '09:38', text: 'But be honest. Did you write that yourself, or was it ChatGPT? 😅' },
  { from: 'me', day: 'Today', time: '09:41', text: STAMPED_REPLY.text },
]);

const clip = (s) => (s.length <= MAX_MESSAGE_CHARS ? s : [...s].slice(0, MAX_MESSAGE_CHARS).join(''));

/** Your stored messages, oldest first. `storage` is localStorage or anything like it; it may be null or throw. */
export function loadMessages(storage) {
  try { return parseReplies(storage ? storage.getItem(STORAGE_KEY) ?? '[]' : '[]'); } catch { return []; }
}

export function saveMessages(storage, list) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function clearMessages(storage) {
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

const makeId = (now) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The list with a new message at the end, trimmed (a stamp covers trimmed text). Empty text: list unchanged. */
export function addMessage(list, text, now = Date.now(), id = makeId(now)) {
  const t = String(text).trim();
  if (!t) return list;
  return [...list, { id, text: clip(t), at: now }].slice(-MAX_MESSAGES);
}

/** "09:41", in the reader's own time zone. */
export function clockTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * What the thread shows, in order: a day-and-time line where the day changes
 * ({ divider: 'Today 09:38' }), then each message ({ from, text, time, mine }).
 * Your stored messages come after the conversation, under "Today".
 */
export function threadItems(mine = [], thread = THREAD) {
  const all = [
    ...thread.map((m) => ({ ...m, mine: false })),
    ...mine.map((m) => ({ from: 'me', day: 'Today', time: clockTime(m.at), text: m.text, mine: true, id: m.id })),
  ];
  const out = [];
  let day = null;
  for (const m of all) {
    if (m.day !== day) {
      out.push({ divider: `${m.day} ${m.time}` });
      day = m.day;
    }
    out.push({ from: m.from, text: m.text, time: m.time, mine: m.mine, id: m.id });
  }
  return out;
}
