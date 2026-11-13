// Demo feed logic without the DOM: tags in reply text, your replies in
// localStorage, short times and counts, pixel avatars. Pure; web/test/ covers it.
import { tagRegExp } from '../lib/ntk-verify.js';

export const STORAGE_KEY = 'ntk-demo-feed:replies:v1';
export const MAX_REPLIES = 50;
export const MAX_REPLY_CHARS = 5000;

/** Text split around NTK tags: [{ text }, { text: '[NTK <id>]', tag: '<id>' }, …]. */
export function splitTags(text) {
  const s = String(text);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(tagRegExp())) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[0], tag: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

const clip = (s) => (s.length <= MAX_REPLY_CHARS ? s : [...s].slice(0, MAX_REPLY_CHARS).join(''));

/** Stored replies (newest first). Anything malformed is dropped. */
export function parseReplies(json) {
  let list;
  try { list = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.id === 'string' && typeof r.text === 'string' && r.text.trim() && Number.isFinite(r.at))
    .slice(0, MAX_REPLIES)
    .map(({ id, text, at }) => ({ id, text: clip(text), at }));
}

/** `storage` is localStorage or anything with getItem/setItem/removeItem; it may be null or throw. */
export function loadReplies(storage) {
  try { return parseReplies(storage ? storage.getItem(STORAGE_KEY) ?? '[]' : '[]'); } catch { return []; }
}

export function saveReplies(storage, list) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function clearReplies(storage) {
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

export const makeId = (now = Date.now()) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The list with a new reply in front, as typed except for whitespace at the
 * ends (a stamp covers canonical text, which is trimmed). Empty text: list unchanged.
 */
export function addReply(list, text, now = Date.now(), id = makeId(now)) {
  const t = String(text).trim();
  if (!t) return list;
  return [{ id, text: clip(t), at: now }, ...list].slice(0, MAX_REPLIES);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "now", "5m", "3h", then "Nov 13". */
export function relTime(at, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 999, 1.1K, 48K, 1.2M (rounded down, as feeds do). */
export function formatCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return `${(Math.floor(n / 100) / 10).toString()}K`;
  if (n < 1e6) return `${Math.floor(n / 1000)}K`;
  return `${(Math.floor(n / 1e5) / 10).toString()}M`;
}

/** 32-bit FNV-1a of a string. */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A 7×7 pixel avatar for a handle: a mirrored 5×5 pattern ('#') on a tinted
 * square with stepped corners ('o'). `tone` picks one of three grey tints.
 */
export function avatarGrid(seed) {
  const h = fnv1a(seed);
  const cells = Array.from({ length: 15 }, (_, i) => (h >>> i) & 1);
  if (cells.filter(Boolean).length < 4) for (let i = 0; i < 15; i += 2) cells[i] = 1;
  const rows = [];
  for (let y = 0; y < 7; y++) {
    let row = '';
    for (let x = 0; x < 7; x++) {
      const edgeX = x === 0 || x === 6;
      const edgeY = y === 0 || y === 6;
      if (edgeX && edgeY) row += '.';
      else if (edgeX || edgeY) row += 'o';
      else {
        const cx = x - 1;
        row += cells[(y - 1) * 3 + (cx < 3 ? cx : 4 - cx)] ? '#' : 'o';
      }
    }
    rows.push(row);
  }
  return { rows, tone: (h >>> 16) % 3 };
}
