// The deploy files (deploy/), checked without a server: the nginx site and its
// HTTP-only variant, the same security headers as the relay's static server,
// the systemd unit, and the order of things in deploy.sh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SECURITY_HEADERS } from '../server.mjs';

const read = (p) => fs.readFileSync(new URL(`../../deploy/${p}`, import.meta.url), 'utf8');
const CONF = read('nginx/ntk.conf');
const UNIT = read('ntk-relay.service');
const SCRIPT = read('deploy.sh');
/** What deploy.sh installs before the certificate exists: sed '/# tls$/d'. */
const HTTP_ONLY = CONF.split('\n').filter((l) => !/# tls$/.test(l)).join('\n');
/** Directives and commands only: comments mention things the code must not be judged by. */
const code = (text) => text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');

/** Lines with their brace depth; throws when braces do not balance. */
function depths(conf) {
  let depth = 0;
  const out = [];
  for (const raw of conf.split('\n')) {
    const line = raw.replace(/#.*$/, '').replace(/'[^']*'|"[^"]*"/g, '""');
    out.push({ line: raw.trim(), depth });
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      assert.ok(depth >= 0, `unbalanced } near: ${raw}`);
    }
  }
  assert.equal(depth, 0, 'braces balance');
  return out;
}

test('nginx: both variants balance, and the HTTP-only one has nothing that needs a certificate', () => {
  depths(CONF);
  depths(HTTP_ONLY);
  assert.equal((CONF.match(/listen 4443 ssl;/g) || []).length, 2);
  assert.match(CONF, /ssl_certificate \/etc\/letsencrypt\/live\/ntk\.tools\/fullchain\.pem;/);
  for (const word of ['ssl', '4443', 'letsencrypt/live', 'Strict-Transport-Security', 'options-ssl-nginx']) {
    assert.ok(!code(HTTP_ONLY).includes(word), `HTTP-only variant still uses ${word}`);
  }
  for (const v of [CONF, HTTP_ONLY]) {
    assert.equal((v.match(/listen 80;/g) || []).length, 2);
    assert.equal((v.match(/location \^~ \/\.well-known\/acme-challenge\/ \{\s*root \/var\/www\/letsencrypt;/g) || []).length, 2);
  }
});

test('nginx: the routes the site needs', () => {
  assert.match(CONF, /server_name www\.ntk\.tools;[\s\S]*return 301 https:\/\/ntk\.tools\$request_uri;/);
  assert.match(CONF, /server_name ntk\.tools;/);
  assert.match(CONF, /root \/opt\/ntk\/web;/);
  assert.match(CONF, /location ~ "\^\/\[0-9a-f\]\{10\}\$" \{\s*try_files \/index\.html =404;/);
  assert.match(CONF, /upstream ntk_relay \{\s*server 127\.0\.0\.1:3970;/);
  assert.match(CONF, /location \/api\/ \{\s*proxy_pass http:\/\/ntk_relay;/);
  assert.match(CONF, /proxy_set_header X-Real-IP \$remote_addr;/, 'the relay limits per client IP');
  assert.match(CONF, /location = \/feed \{\s*return 301 \/feed\/;/);
  assert.match(CONF, /location = \/login \{\s*return 301 \/login\/;/, 'the app opens /login#pk=…; the fragment survives the redirect');
  assert.match(CONF, /location = \/privacy \{\s*return 301 \/privacy\/;/, 'the app links /privacy');
  assert.match(CONF, /absolute_redirect off;/, 'no :4443 in redirects behind the SNI proxy');
  assert.match(CONF, /location \^~ \/test\/ \{\s*return 404;/);
  assert.match(CONF, /client_max_body_size 1m;/);
});

/** The lines of one location block of the ntk.tools server, e.g. "location /login/ {". */
function locationBlock(conf, opening) {
  const lines = conf.split('\n');
  const start = lines.findIndex((l) => l.trim() === opening);
  assert.ok(start > 0, `no "${opening}" in ntk.conf`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === '}');
  return lines.slice(start + 1, end).map((l) => l.trim());
}
const headersIn = (lines) => Object.fromEntries(lines.map((l) => /^add_header ([\w-]+) "([^"]*)" always;/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
/** CSP directive name -> its sources. */
const cspOf = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

test('nginx: the same security headers as the relay serves in development, at server level', () => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    const m = CONF.match(new RegExp(`add_header ${name} "([^"]*)" always;`));
    assert.ok(m, `nginx sets ${name}`);
    assert.equal(m[1], value, `${name} is the same in nginx and the relay`);
  }
  assert.match(SECURITY_HEADERS['Content-Security-Policy'], /connect-src 'self' https:\/\/testnet-api\.outlayer\.ai/);
  // An add_header inside a location drops every server-level one there: only /login/ does it, and repeats them all.
  const inLogin = new Set(locationBlock(CONF, 'location /login/ {').filter((l) => l.startsWith('add_header')));
  for (const { line, depth } of depths(CONF)) {
    if (line.startsWith('add_header')) assert.ok(depth === 1 || (depth === 2 && inLogin.has(line)), line);
  }
});

test('nginx: /login/ repeats every header, with a CSP of its own and a fresh nonce per response', () => {
  const block = locationBlock(CONF, 'location /login/ {');
  const own = headersIn(block);
  const server = headersIn(depths(CONF).filter((l) => l.depth === 1).map((l) => l.line));
  assert.deepEqual(Object.keys(own).sort(), Object.keys(server).sort(), 'the same header names');
  for (const [name, value] of Object.entries(server)) {
    if (name !== 'Content-Security-Policy') assert.equal(own[name], value, `/login/ repeats ${name}`);
  }
  assert.ok(block.some((l) => /^add_header Strict-Transport-Security .*# tls$/.test(l)), 'HSTS repeated, as a "# tls" line');
  assert.ok(!code(locationBlockText(HTTP_ONLY)).includes('Strict-Transport-Security'), 'and gone from the HTTP-only variant');
  assert.ok(block.includes("sub_filter 'NTK_CSP_NONCE' '$request_id';"), 'the nonce goes into the page');
  assert.ok(block.includes('try_files $uri $uri/ =404;') && block.includes('expires epoch;'));

  const csp = cspOf(own['Content-Security-Policy']);
  const site = cspOf(SECURITY_HEADERS['Content-Security-Policy']);
  assert.deepEqual(csp['script-src'], ["'self'", "'nonce-$request_id'"], 'scripts: this site and the nonce; no unsafe-inline, no eval');
  assert.ok(csp['style-src'].includes("'unsafe-inline'"), "the connector's dialogs set inline styles");
  for (const name of ['default-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
    assert.deepEqual(csp[name], site[name], `${name} as on the rest of the site`);
  }
  for (const host of ['https://rpc.testnet.fastnear.com', 'https://raw.githubusercontent.com', 'https://wallet.intear.tech']) {
    assert.ok(csp['connect-src'].includes(host), `connect-src ${host}`);
  }
  assert.ok(!csp['connect-src'].includes('https://testnet-api.outlayer.ai'), 'the login page reads no stamps');
  assert.deepEqual(csp['frame-src'], ['https://wallet.intear.tech', 'meteorwallet:', 'intear:']);
  for (const v of Object.values(csp).flat()) assert.ok(!/^\*$|^https:$|unsafe-eval/.test(v), `no wildcard or eval: ${v}`);
});

/** The /login/ block of a variant, as text. */
function locationBlockText(conf) {
  return locationBlock(conf, 'location /login/ {').join('\n');
}

test('ntk-relay.service: the ntk user, the env file, the hardening lines', () => {
  for (const line of ['User=ntk', 'Group=ntk', 'WorkingDirectory=/opt/ntk/relay', 'EnvironmentFile=/opt/ntk/.env',
    'Environment=PORT=3970', 'Environment=HOST=127.0.0.1', 'ExecStart=/usr/bin/node server.mjs', 'Restart=always',
    'NoNewPrivileges=true', 'ProtectSystem=full', 'ProtectHome=true', 'PrivateTmp=true', 'WantedBy=multi-user.target']) {
    assert.ok(UNIT.split('\n').includes(line), line);
  }
});

test('deploy.sh: test before reload, never restart nginx, HTTP-only until the certificate exists', () => {
  assert.match(SCRIPT, /^set -euo pipefail$/m);
  assert.ok(SCRIPT.includes("sed '/# tls$/d' deploy/nginx/ntk.conf"), 'the same marker as ntk.conf');
  const body = code(SCRIPT);
  const testAt = body.indexOf('if nginx -t; then');
  const reloadAt = body.indexOf('systemctl reload nginx');
  assert.ok(testAt > 0 && reloadAt > testAt, 'nginx -t comes before the reload');
  assert.doesNotMatch(body, /systemctl (restart|stop|start) nginx/);
  assert.match(SCRIPT, /NO_PULL/);
  assert.match(SCRIPT, /git merge --ff-only --quiet incoming/);
  assert.match(SCRIPT, /useradd --system --home-dir "\$APP" --shell \/usr\/sbin\/nologin ntk/);
  assert.match(SCRIPT, /systemctl restart ntk-relay/);
  assert.match(SCRIPT, /certbot certonly --webroot -w \$ACME_ROOT -d \$DOMAIN -d www\.\$DOMAIN/);
  assert.match(SCRIPT, /CERT=\/etc\/letsencrypt\/live\/\$DOMAIN\/fullchain\.pem/);
});

test('no IP address of any server in the deploy files', () => {
  for (const [name, text] of [['ntk.conf', CONF], ['ntk-relay.service', UNIT], ['deploy.sh', SCRIPT]]) {
    for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) assert.ok(['127.0.0.1', '0.0.0.0'].includes(m[0]), `${name}: ${m[0]}`);
  }
});

test('deploy.sh parses as bash', (t) => {
  try {
    execFileSync('bash', ['-n', new URL('../../deploy/deploy.sh', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'pipe' });
  } catch (e) {
    if (e.code === 'ENOENT') return t.skip('no bash here');
    throw new Error(`bash -n: ${e.stderr}`);
  }
});
