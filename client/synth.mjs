// Synthetic typists for testing the pipeline before the Android keyboard exists.
// They produce exactly what the keyboard will send: per tap the key, touch down /
// up times, and the touch point's offset from the key centre. Each typist has a
// personal rhythm and a personal way of hitting keys (finger size, thumb angle).
// These are NOT evidence that the biometrics work on real people — only that the
// enclave pipeline measures, stores, compares and signs correctly.

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const POS = {};
ROWS.forEach((row, r) => [...row].forEach((c, i) => { POS[c] = [i + r * 0.5, r]; }));
POS[' '] = [4.5, 3];
POS['.'] = [8.5, 3];
POS[','] = [2.0, 3];
POS['<bksp>'] = [9.0, 2];
POS['<shift>'] = [0.0, 2];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Typist {
  /**
   * @param {object} p dwell (ms), flight (ms base), travel (ms per key-width of travel),
   *   ox / oy (habitual offset from key centre, fraction of key), seed
   */
  constructor(name, p) {
    this.name = name;
    this.p = { dwellSd: 14, flightSd: 28, offSd: 0.07, typo: 0.03, pause: 0.06, ...p };
    const r = mulberry32(p.seed);
    // per-key personality: some keys held longer, some hit off-centre (reach of the thumb)
    this.keyDwell = {};
    this.keyOff = {};
    for (const k of Object.keys(POS)) {
      this.keyDwell[k] = (r() - 0.5) * 30;
      this.keyOff[k] = [(r() - 0.5) * 0.16, (r() - 0.5) * 0.16];
    }
  }

  /** One typing session that produces `text`. */
  session(text, seed) {
    const rnd = mulberry32(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd());
    const { dwell, flight, travel, ox, oy, dwellSd, flightSd, offSd, typo, pause } = this.p;
    const events = [];
    let now = 0;
    let prev = ' ';
    const tap = (k, produced) => {
      const pk = POS[k] ?? POS[' '];
      const qk = POS[prev] ?? POS[' '];
      const dist = Math.hypot(pk[0] - qk[0], pk[1] - qk[1]);
      const d = now + Math.max(-35, flight + travel * dist + flightSd * gauss());
      const u = d + Math.max(25, dwell + (this.keyDwell[k] ?? 0) + dwellSd * gauss());
      const [kx, ky] = this.keyOff[k] ?? [0, 0];
      const clamp = (v) => Math.max(-0.95, Math.min(0.95, v));
      events.push({
        k: produced,
        d: Math.round(d * 10) / 10,
        u: Math.round(u * 10) / 10,
        x: Math.round(clamp(ox + kx + offSd * gauss()) * 1000) / 1000,
        y: Math.round(clamp(oy + ky + offSd * gauss()) * 1000) / 1000,
      });
      now = u;
      prev = k;
    };
    for (const ch of text) {
      const lower = ch.toLowerCase();
      if (!(lower in POS)) continue;
      if (/[a-z]/.test(lower) && rnd() < typo) { // hit a neighbour, notice, delete
        const row = ROWS.find((r) => r.includes(lower));
        const i = row.indexOf(lower);
        const wrong = row[Math.min(row.length - 1, i + 1)] === lower ? row[i - 1] : row[Math.min(row.length - 1, i + 1)];
        tap(wrong, wrong);
        now += 120 + 80 * rnd();
        tap('<bksp>', '<bksp>');
      }
      if (ch !== lower) tap('<shift>', '<shift>');
      tap(lower, ch);
      if (ch === ' ' && rnd() < pause) now += 1600 + 800 * rnd(); // a thought between words
    }
    return { v: 1, layout: 'qwerty-en-portrait-v1', events };
  }
}

/**
 * The invented typists of the tests: rhythm (dwell, flight, travel per key
 * width) and habitual offset from key centres. Alice and bob are the end-to-end
 * suite's; carol types a little like alice, to give the tuning harness a close
 * impostor.
 */
export const TYPISTS = {
  alice: { seed: 11, dwell: 88, flight: 95, travel: 22, ox: 0.10, oy: 0.14 },
  bob: { seed: 29, dwell: 118, flight: 150, travel: 30, ox: -0.12, oy: -0.06 },
  carol: { seed: 47, dwell: 96, flight: 110, travel: 25, ox: 0.04, oy: 0.08 },
};

export const ENROLL_TEXTS = [
  'I usually write short notes on my phone while walking to the train, mostly lists and replies to friends.',
  'Typing on glass feels different from a real keyboard, my thumbs land a little low and to the right.',
  'Yesterday I wrote a long message about the weekend plans and fixed a few typos before sending it.',
];

/** The `mode` of each enrollment session, as the keyboard's three prompts are (TODO.md 3.5). */
export const ENROLL_MODES = ['compose', 'copy', 'compose'];

export const STAMP_TEXT = 'This reply was typed by me, a human, on my own phone, one key at a time.';

/** The scripted reply of the demo video and the demo feed (TODO.md, section 0). */
export const DEMO_REPLY = 'I agree with this, and I typed every word myself.';
