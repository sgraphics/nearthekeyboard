// The dial (web/lib/dial.js): its scale, and the copy of it in the login page's
// HTML, which has no script of its own to build it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DIAL, DIAL_NUMBERS, dialTicks, dialMarkup } from '../lib/dial.js';

test('the scale: a tick every 2 points, longer every 10, longest at 0, 50 and 100', () => {
  const ticks = dialTicks();
  assert.equal(ticks.length, 51);
  assert.deepEqual(ticks.map((t) => t.x), Array.from({ length: 51 }, (_, i) => i * 20));
  for (const t of ticks) assert.equal(t.y2, DIAL.BASE, 'every tick stands on the base line');
  const len = (p) => DIAL.BASE - ticks[p / 2].y1;
  assert.ok(len(0) > len(10) && len(10) > len(2), 'three lengths');
  assert.equal(len(50), len(100));
  assert.deepEqual(DIAL_NUMBERS, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
});

test('a reading: the needle at the score, the mark at the score it needs, both kept on the scale', () => {
  const m = dialMarkup({ score: 95, needs: 65 });
  assert.match(m, /<line x1="950" y1="-3" x2="950" y2="\d+" class="dial-needle"/);
  assert.match(m, /<line x1="650" y1="0" x2="650" y2="7" class="dial-needs"/);
  assert.match(dialMarkup({ score: 140 }), /x1="1000"[^>]*class="dial-needle"/);
  assert.doesNotMatch(dialMarkup({ busy: true }), /dial-needle|dial-needs/, 'a busy dial has only the sweeping needle');
  assert.match(dialMarkup({ busy: true }), /<span class="dial-sweep"><\/span>/);
});

test('the login page carries the busy dial exactly as dialMarkup writes it', () => {
  const html = fs.readFileSync(new URL('../login/index.html', import.meta.url), 'utf8');
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  assert.ok(flat(html).includes(flat(dialMarkup({ busy: true }))), 'run dialMarkup({ busy: true }) and paste it into web/login/index.html');
});
