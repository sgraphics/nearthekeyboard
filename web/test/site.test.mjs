// The site as served (through the relay's static server, the same routes as
// nginx): every page answers, every file a page or module refers to resolves,
// and the markup fits the Content-Security-Policy (no inline scripts or styles).
// NTK_SITE_BASE=<url> checks a running site instead, e.g. http://127.0.0.1:3970
// or https://ntk.tools after a deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay } from '../../relay/server.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['/', '/e65ee28db5', '/feed/', '/feed/?embed=1', '/login/', '/privacy/'];
const ENTRY = ['/embed/ntk-embed.js', '/embed/ntk-embed.css', '/favicon.ico', '/assets/ntk-social-1280x640.png'];

async function startSite() {
  if (process.env.NTK_SITE_BASE) return { relay: { close: async () => {} }, base: process.env.NTK_SITE_BASE.replace(/\/+$/, '') };
  const relay = createRelay({
    api: 'http://127.0.0.1:9', project: 'x/y', paymentKey: 'unused', port: 0, host: '127.0.0.1', staticDir: WEB,
    keepWarmSec: 0, infoTtlSec: 600, infoWaitSec: 1, callTtlSec: 60, pollIntervalMs: 10, pollTimeoutMs: 100,
    prefetchInfo: false, limits: {},
  }, { log: () => {} });
  const { port } = await relay.listen(0, '127.0.0.1');
  return { relay, base: `http://127.0.0.1:${port}` };
}

/** Local references in HTML (src, href) and in JS (imports, and quoted root paths such as '/embed/ntk-embed.js'). */
function references(url, type, text) {
  const out = new Set();
  const add = (ref) => {
    if (/^(https?:|data:|mailto:|#)/.test(ref) || ref === '' || ref.startsWith('?')) return;
    out.add(new URL(ref, url).pathname);
  };
  if (type.includes('html')) {
    for (const m of text.matchAll(/\s(?:src|href)="([^"]*)"/g)) add(m[1]);
    for (const m of text.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
    for (const m of text.matchAll(/\scontent="https:\/\/ntk\.tools(\/[^"]*)"/g)) add(m[1]); // og:image, served from this site
  } else if (type.includes('javascript')) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // examples in comments are not imports
    for (const m of code.matchAll(/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g)) add(m[1]);
    for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]);
    for (const m of code.matchAll(/['"](\/(?:[\w.-]+\/)*[\w.-]+\.(?:js|css|svg|png|html))['"]/g)) add(m[1]);
  }
  return [...out];
}

test('every page and every file it refers to resolves, with the right type', async () => {
  const { relay, base } = await startSite();
  try {
    const seen = new Map();
    const queue = [...PAGES, ...ENTRY];
    while (queue.length) {
      const p = queue.shift();
      if (seen.has(p)) continue;
      const res = await fetch(base + p);
      const type = res.headers.get('content-type') || '';
      const text = await res.text();
      seen.set(p, { status: res.status, type });
      assert.equal(res.status, 200, `${p} answers 200`);
      if (p.endsWith('.js')) assert.match(type, /javascript/, p);
      if (p.endsWith('.css')) assert.match(type, /text\/css/, p);
      if (p.endsWith('.svg')) assert.match(type, /image\/svg\+xml/, p);
      if (p.endsWith('.png')) assert.match(type, /image\/png/, p);
      if (p.endsWith('.ico')) assert.match(type, /image\/x-icon/, p);
      for (const ref of references(base + p, type, text)) if (!seen.has(ref)) queue.push(ref);
    }
    const files = [...seen.keys()];
    for (const must of ['/verify/main.js', '/verify/model.js', '/verify/sha-fallback.js', '/lib/ntk-verify.js',
      '/vendor/noble-ed25519.js', '/lib/pixel.js', '/feed/main.js', '/feed/model.js', '/feed/data.js',
      '/assets/ntk.css', '/verify/verify.css', '/feed/feed.css', '/embed/ntk-embed.js',
      '/assets/ntk-badge-light.svg', '/assets/ntk-badge-dark.svg', '/assets/ntk-keyboard-light.svg', '/assets/ntk-keyboard-dark.svg',
      '/assets/favicon.ico', '/assets/favicon-32.png', '/assets/apple-touch-icon.png', '/assets/ntk-social-1280x640.png',
      '/login/bundle.js', '/login/login.css']) {
      assert.ok(files.includes(must), `${must} is reachable from the pages`);
    }
  } finally {
    await relay.close();
  }
});

test('markup fits the CSP: no inline scripts, no inline styles, no innerHTML', async () => {
  const { relay, base } = await startSite();
  try {
    for (const p of ['/', '/feed/', '/login/', '/privacy/']) {
      const html = await (await fetch(base + p)).text();
      assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, `${p}: inline <script>`);
      assert.doesNotMatch(html, /\sstyle=/i, `${p}: style attribute`);
      assert.doesNotMatch(html, /<style/i, `${p}: <style> element`);
      assert.doesNotMatch(html, /\son[a-z]+=/i, `${p}: inline event handler`);
    }
    for (const p of ['/verify/main.js', '/feed/main.js', '/lib/pixel.js', '/embed/ntk-embed.js', '/login/src/main.js', '/login/src/model.js']) {
      const js = await (await fetch(base + p)).text();
      assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, `${p} builds DOM from text only`);
      assert.doesNotMatch(js, /setAttribute\(\s*['"]style['"]/, `${p}: style attribute`);
    }
  } finally {
    await relay.close();
  }
});

test('/login and /privacy without the slash: a redirect that keeps the fragment (the app opens /login#pk=…)', async () => {
  const { relay, base } = await startSite();
  try {
    for (const p of ['/login', '/privacy']) {
      const res = await fetch(base + p, { redirect: 'manual' });
      assert.equal(res.status, 301, p);
      assert.equal(new URL(res.headers.get('location'), base).pathname, `${p}/`, p);
    }
  } finally {
    await relay.close();
  }
});
