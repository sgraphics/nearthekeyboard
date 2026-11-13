#!/usr/bin/env node
// Stamps every link to web/assets/ in the site's HTML pages with the file's
// content hash: /assets/ntk.css -> /assets/ntk.css?v=1a2b3c4d. Cloudflare and
// browsers keep /assets/ for hours, so a changed file must get a new URL.
// Run after changing anything in web/assets/:   node web/tools/version-assets.mjs
// web/test/asset-versions.test.mjs fails when a page links an outdated version.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(WEB, 'assets');

export function assetVersion(name) {
  const file = path.join(ASSETS, name);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
}

/** The site's HTML pages (not tests, not node_modules). */
export function htmlPages(dir = WEB) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlPages(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// /assets/<name> with an optional ?v=..., inside an attribute value
export const ASSET_REF = /(\/assets\/)([A-Za-z0-9._-]+)(\?v=[0-9a-f]+)?(?=["'\s)])/g;

export function stamp(html) {
  return html.replace(ASSET_REF, (m, prefix, name) => {
    const v = assetVersion(name);
    return v ? `${prefix}${name}?v=${v}` : m;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const page of htmlPages()) {
    const before = fs.readFileSync(page, 'utf8');
    const after = stamp(before);
    if (after !== before) {
      fs.writeFileSync(page, after);
      changed++;
      console.log(`stamped ${path.relative(WEB, page)}`);
    }
  }
  console.log(changed ? `${changed} page(s) updated` : 'all asset links already carry the current versions');
}
