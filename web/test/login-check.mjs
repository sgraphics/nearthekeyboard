#!/usr/bin/env node
// Opens /login/ in headless Chrome at phone width (412 px, device emulation) and
// reports every console error, CSP violation and uncaught exception, in the page
// and in the wallets' sandboxed iframes. Takes screenshots of each step.
//
//   node web/test/login-check.mjs                     serves web/ here, with the headers of deploy/nginx/ntk.conf
//   node web/test/login-check.mjs https://ntk.tools   checks a deployed site
//
//   --open-wallets  also taps each wallet and stops at the wallet's first screen
//                   (no login: nothing is typed into any wallet)
//   --out <dir>     where screenshots go (default: <tmp>/ntk-login-check)
//   --wallet <id>   with --open-wallets: only this one (meteor-wallet, intear-wallet)
//   --verbose       print every console message and frame as it happens
//   --map <host>=<ip>:<port>  send <host> to another address, e.g. ntk.tools=127.0.0.1:18088 for
//                   deploy/nginx/ntk.conf running in a container: node … http://ntk.tools --map …
//
// Needs Chrome (CHROME=<path> picks one) and a network connection: the wallets'
// scripts load from their own hosts. Exit code 1 when anything was reported.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const WEB = path.resolve(DIR, '..');
const CONF = path.resolve(WEB, '..', 'deploy', 'nginx', 'ntk.conf');
// A real ed25519 public key (the NTK stamp key): any 32-byte key will do here.
const TEST_PK = 'ed25519:HjjfT73KM5PpL9TEeqFbfWdVgsc5wysKt7mLCr4jsRLG';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const remoteBase = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/+$/, '');
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'ntk-login-check')));
const VERBOSE = flag('--verbose');
// --map ntk.tools=127.0.0.1:18088 sends that host name to another address (an nginx in a container, say).
const MAP = opt('--map') ? /^([^=]+)=([^:]+):(\d+)$/.exec(opt('--map')) : null;

// ---- the site, served the way nginx serves it ------------------------------

/** The add_header and sub_filter lines of the ntk.tools server: server level, and the /login/ location. */
export function nginxHeaders(confText) {
  const lines = confText.split('\n').filter((l) => !/# tls$/.test(l)); // the HTTP-only variant
  const start = lines.findIndex((l) => /server_name ntk\.tools;/.test(l));
  const server = [];
  const login = [];
  const subFilter = [];
  let depth = 1;
  let inLogin = false;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    const header = /^add_header ([\w-]+) "([^"]*)" always;$/.exec(line);
    if (header) (inLogin ? login : depth === 1 ? server : []).push([header[1], header[2]]);
    const sub = /^sub_filter '([^']*)' '([^']*)';$/.exec(line);
    if (sub && inLogin) subFilter.push([sub[1], sub[2]]);
    if (depth === 1 && /^location \/login\/ \{$/.test(line)) inLogin = true;
    for (const ch of line.replace(/"[^"]*"|'[^']*'/g, '')) {
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 1) inLogin = false; }
    }
    if (depth === 0) break;
  }
  return { server, login, subFilter };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

export function serveLocal() {
  const conf = nginxHeaders(fs.readFileSync(CONF, 'utf8'));
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.split('/').some((s) => s.startsWith('.')) || p.startsWith('/test/')) { res.writeHead(404); return res.end(); }
    for (const page of ['/feed', '/login', '/privacy']) if (p === page) { res.writeHead(301, { Location: `${page}/` }); return res.end(); }
    if (p === '/' || /^\/[0-9a-f]{10}$/.test(p)) p = '/index.html';
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(WEB, p);
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    const isLogin = p.startsWith('/login/');
    const requestId = crypto.randomBytes(16).toString('hex'); // what nginx's $request_id is
    const headers = Object.fromEntries((isLogin ? conf.login : conf.server).map(([k, v]) => [k, v.replaceAll('$request_id', requestId)]));
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    let body = fs.readFileSync(file);
    if (isLogin && type.startsWith('text/html')) {
      let text = body.toString('utf8');
      for (const [from, to] of conf.subFilter) text = text.replace(from, to.replaceAll('$request_id', requestId)); // sub_filter_once on
      body = Buffer.from(text);
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...headers });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// ---- Chrome over the DevTools protocol --------------------------------------

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) throw new Error('Chrome not found; set CHROME=<path to chrome>');
  return found;
}

export async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ntk-chrome-'));
  const proc = spawn(chromePath(), [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=412,915',
    ...(MAP ? [`--host-resolver-rules=MAP ${MAP[1]} ${MAP[2]}:${MAP[3]}`, `--unsafely-treat-insecure-origin-as-secure=http://${MAP[1]}`, '--disable-features=HttpsUpgrades'] : []),
    'about:blank',
  ], { stdio: 'ignore' });
  proc.on('error', () => {});
  // Chrome writes its DevTools port into the profile (stderr is not always there on Windows).
  const portFile = path.join(profile, 'DevToolsActivePort');
  const end = Date.now() + 20000;
  let wsUrl = null;
  while (!wsUrl && Date.now() < end) {
    await sleep(200);
    const lines = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').split('\n') : [];
    if (lines.length >= 2 && lines[1].trim()) wsUrl = `ws://127.0.0.1:${lines[0].trim()}${lines[1].trim()}`;
  }
  if (!wsUrl) throw new Error('Chrome did not start (no DevToolsActivePort)');
  return {
    wsUrl,
    async close(cdp) {
      await Promise.race([cdp.send('Browser.close').catch(() => {}), sleep(3000)]);
      proc.kill();
      await sleep(800);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`)); else resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) { this.handlers.push(fn); }
  close() { this.ws.close(); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One page with everything it and its frames say collected in `log`. */
export async function openPage(cdp, { dark = false, out = OUT } = {}) {
  const log = [];
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const sessions = new Map([[sessionId, 'page']]);
  const prep = async (sid) => {
    await cdp.send('Runtime.enable', {}, sid);
    await cdp.send('Log.enable', {}, sid);
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid).catch(() => {});
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  };
  cdp.on((msg) => {
    const where = sessions.get(msg.sessionId);
    if (!where) return;
    if (VERBOSE) {
      const p = msg.params || {};
      if (msg.method === 'Runtime.consoleAPICalled') console.log(`   . (${where}) console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
      if (msg.method === 'Log.entryAdded') console.log(`   . (${where}) log ${p.entry.level}/${p.entry.source}: ${p.entry.text.slice(0, 300)}`);
      if (msg.method === 'Target.attachedToTarget') console.log(`   . (${where}) attached ${p.targetInfo.type} ${p.targetInfo.url.slice(0, 100)}`);
    }
    if (msg.method === 'Target.attachedToTarget') {
      const { sessionId: sid, targetInfo } = msg.params;
      sessions.set(sid, `${targetInfo.type} ${targetInfo.url.slice(0, 60) || '(srcdoc)'}`);
      prep(sid).catch(() => {});
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
      log.push({ where, kind: 'console.error', text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ') });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      log.push({ where, kind: 'exception', text: `${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}` });
    } else if (msg.method === 'Log.entryAdded' && ['error'].includes(msg.params.entry.level)) {
      const e = msg.params.entry;
      log.push({ where, kind: /Content Security Policy|Refused to/.test(e.text) ? 'csp' : `log.${e.source}`, text: `${e.text} ${e.url || ''}`.trim() });
    }
  });
  await cdp.send('Page.enable', {}, sessionId);
  await prep(sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true }, sessionId);
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Android' }, sessionId);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, sessionId);
  const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
  return {
    log,
    evaluate,
    async goto(url) {
      await cdp.send('Page.navigate', { url }, sessionId);
    },
    async waitForState(states, ms = 30000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const s = await evaluate('document.body && document.body.dataset.state').catch(() => null);
        if (states.includes(s)) return s;
        await sleep(250);
      }
      return evaluate('document.body && document.body.dataset.state');
    },
    async tap(selector) {
      const box = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await cdp.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }, sessionId);
      }
    },
    async key(key) {
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 }, sessionId);
    },
    /** A screenshot: the whole page, or with `viewport` what the screen shows (dialogs, frames of other sites). */
    async shot(name, { viewport = false } = {}) {
      let params = { format: 'png' };
      if (!viewport) {
        const { cssContentSize } = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
        const height = Math.max(915, Math.ceil(cssContentSize.height));
        params = { ...params, captureBeyondViewport: true, clip: { x: 0, y: 0, width: 412, height, scale: 1 } };
      }
      const { data } = await cdp.send('Page.captureScreenshot', params, sessionId);
      fs.mkdirSync(out, { recursive: true });
      const file = path.join(out, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    /** What each out-of-process frame shows: its address, size and the start of its text. */
    async frames() {
      const out = [];
      for (const [sid, where] of sessions) {
        if (sid === sessionId) continue;
        const r = await cdp.send('Runtime.evaluate', {
          expression: '({ href: location.href, size: innerWidth + "x" + innerHeight, text: (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 160) })',
          returnByValue: true,
        }, sid).catch((e) => ({ result: { value: { error: e.message } } }));
        out.push({ where, ...r.result.value });
      }
      return out;
    },
    async close() { await cdp.send('Target.closeTarget', { targetId }).catch(() => {}); },
  };
}

// ---- the checks ---------------------------------------------------------------

/** GET /login/ (through --map when given): its CSP header and its HTML. */
function getLogin(base) {
  if (!MAP) return fetch(`${base}/login/`).then(async (res) => ({ csp: res.headers.get('content-security-policy') || '', html: await res.text() }));
  return new Promise((resolve, reject) => {
    http.get({ host: MAP[2], port: Number(MAP[3]), path: '/login/', headers: { Host: MAP[1] } }, (res) => {
      let html = '';
      res.setEncoding('utf8').on('data', (d) => { html += d; }).on('end', () => resolve({ csp: res.headers['content-security-policy'] || '', html }));
    }).on('error', reject);
  });
}

async function checkNonce(base) {
  const { csp, html } = await getLogin(base);
  const header = /'nonce-([^']+)'/.exec(csp);
  const page = /<script src="\/login\/bundle\.js" nonce="([^"]*)"/.exec(html);
  const ok = !!(header && page && header[1] === page[1] && /^[0-9a-f]{32}$/.test(page[1]));
  return { ok, detail: ok ? `nonce ${page[1].slice(0, 8)}… in both the CSP header and the page` : `CSP nonce ${header?.[1]} vs page nonce ${page?.[1]}` };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const local = remoteBase ? null : await serveLocal();
  const base = remoteBase || local.base;
  const chrome = await launchChrome();
  const cdp = await Cdp.connect(chrome.wsUrl);
  const problems = [];
  const report = (title, log, extra = '') => {
    console.log(`\n== ${title}${extra ? `: ${extra}` : ''}`);
    if (!log.length) console.log('   no console errors, no CSP violations, no exceptions');
    for (const e of log) console.log(`   [${e.kind}] (${e.where}) ${e.text.slice(0, 400)}`);
  };
  try {
    console.log(`site: ${base}${local ? ' (web/ served here with the headers of deploy/nginx/ntk.conf)' : ''}`);
    const nonce = await checkNonce(base);
    console.log(`nonce: ${nonce.ok ? 'ok' : 'MISMATCH'}, ${nonce.detail}`);
    if (!nonce.ok) problems.push('nonce');

    const loginUrl = `${base}/login#pk=${encodeURIComponent(TEST_PK)}&return=${encodeURIComponent('ntk://auth')}&network=testnet`;
    for (const dark of [false, true]) {
      const page = await openPage(cdp, { dark });
      await page.goto(loginUrl);
      const state = await page.waitForState(['choose', 'connected', 'invalid', 'error']);
      await sleep(1500); // icons, late errors
      const wallets = await page.evaluate(`[...document.querySelectorAll('#wallets .wallet')].map((b) => b.querySelector('.wallet-name').textContent + (b.querySelector('img').naturalWidth > 0 ? '' : ' (icon missing)'))`);
      const file = await page.shot(`login-${dark ? 'dark' : 'light'}`);
      report(`/login (${dark ? 'dark' : 'light'})`, page.log, `state ${state}; wallets: ${wallets.join(', ') || 'none'}; ${file}`);
      if (state !== 'choose' || wallets.length !== 2 || wallets.some((w) => w.includes('missing'))) problems.push(`login ${dark ? 'dark' : 'light'}: state ${state}, wallets ${wallets.join(', ')}`);
      if (page.log.length) problems.push(`login ${dark ? 'dark' : 'light'}: ${page.log.length} reported`);
      await page.close();
    }

    {
      const page = await openPage(cdp);
      await page.goto(`${base}/login#pk=ed25519%3Anot-a-key&return=${encodeURIComponent('https://example.com/')}`);
      const state = await page.waitForState(['invalid', 'choose', 'error']);
      const items = await page.evaluate(`[...document.querySelectorAll('#invalid-list li')].map((li) => li.textContent)`);
      const file = await page.shot('login-invalid');
      report('/login with a bad link', page.log, `state ${state}; ${items.length} problems listed; ${file}`);
      if (state !== 'invalid' || items.length !== 2) problems.push(`invalid link: state ${state}, ${items.length} problems`);
      if (page.log.length) problems.push(`invalid link: ${page.log.length} reported`);
      await page.close();
    }

    if (flag('--open-wallets')) {
      for (const id of opt('--wallet') ? [opt('--wallet')] : ['meteor-wallet', 'intear-wallet']) {
        const page = await openPage(cdp);
        await page.goto(loginUrl);
        await page.waitForState(['choose']);
        await page.tap(`[data-wallet="${id}"]`);
        await sleep(12000); // the wallet's script loads and shows its first screen
        const state = await page.evaluate('document.body.dataset.state');
        const file = await page.shot(`wallet-${id}`, { viewport: true });
        if (VERBOSE) for (const f of await page.frames()) console.log(`   . frame (${f.where}) ${JSON.stringify(f).slice(0, 400)}`);
        await page.key('Escape'); // closes the connector's dialog: the page shows "Could not connect"
        await sleep(1500);
        const after = await page.evaluate('document.body.dataset.state');
        report(`tap ${id}`, page.log, `state ${state}, after Escape ${after}; ${file}`);
        if (page.log.some((e) => e.kind === 'csp')) problems.push(`${id}: CSP violations`);
        await page.close();
      }
    }
  } finally {
    await chrome.close(cdp);
    cdp.close();
    if (local) local.server.close();
  }
  console.log(problems.length ? `\nFAIL: ${problems.join('; ')}` : '\nOK');
  console.log(`screenshots in ${OUT}`);
  process.exitCode = problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
