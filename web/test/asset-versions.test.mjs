// Every link from a page to web/assets/ must carry the file's current content
// hash, or Cloudflare and browsers keep serving an old copy for hours.
// Fix a failure with: node web/tools/version-assets.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WEB, htmlPages, assetVersion, ASSET_REF } from '../tools/version-assets.mjs';

test('every /assets/ link in the pages carries the current version', () => {
  const stale = [];
  let links = 0;
  for (const page of htmlPages()) {
    const html = fs.readFileSync(page, 'utf8');
    for (const m of html.matchAll(ASSET_REF)) {
      const v = assetVersion(m[2]);
      if (!v) continue; // not one of our files
      links++;
      if (m[3] !== `?v=${v}`) stale.push(`${path.relative(WEB, page)}: /assets/${m[2]}${m[3] ?? ''} (current ?v=${v})`);
    }
  }
  assert.ok(links > 0, 'expected the pages to link files in web/assets/');
  assert.deepEqual(stale, [], 'run: node web/tools/version-assets.mjs');
});
