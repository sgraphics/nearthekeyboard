#!/usr/bin/env node
// Check NTK stamps in a text. Needs no key, no account and no enclave call.
//
//   node verify.mjs "<text with its tag>"
//   echo "<text with its tag>" | node verify.mjs
//
// Exit code 0 when every tag is MATCH, 1 otherwise (2 when there is no tag).
import { verifyText, findTags } from '../web/lib/ntk-verify.js';

const readStdin = async () => {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

const text = process.argv.length > 2 ? process.argv.slice(2).join(' ') : await readStdin();
if (findTags(text).length === 0) {
  console.log('No NTK tag found. A tag looks like [NTK e65ee28db5].');
  process.exit(2);
}

let allMatch = true;
for (const r of await verifyText(text)) {
  allMatch &&= r.verdict === 'MATCH';
  console.log(`\n[NTK ${r.tag.id}]  ${r.verdict.replace('_', ' ')}`);
  if (r.error) console.log(`  error: ${r.error}`);
  for (const c of r.checks) console.log(`  ${c.ok ? 'pass' : 'FAIL'}  ${c.label}${c.detail ? `  (${c.detail})` : ''}`);
  if (r.record) {
    const rec = r.record;
    console.log(`  account ${rec.account}, ${new Date(rec.issued_at_ms).toISOString()}, typed ${rec.typed_pct}%, ` +
      `match ${rec.score_pct}% (threshold ${rec.threshold_pct}%), ${rec.taps} taps, rule v${rec.v}, ${rec.network}`);
    console.log(`  issuing call: ${rec.call_id}`);
  }
  if (r.covered != null) console.log(`  covered text: "${r.covered}"`);
}
process.exit(allMatch ? 0 : 1);
