#!/usr/bin/env node
// Prints Ritkaos+ unlock codes. The secret comes from the environment and is never printed.
//   RITKAOS_UNLOCK_SECRET=... node scripts/mint-code.mjs plus
//   RITKAOS_UNLOCK_SECRET=... node scripts/mint-code.mjs nineties office --count 5
import { mintCode, verifyCode, validSecret, PRODUCT_IDS } from '../lib/store.mjs';
const args = process.argv.slice(2), at = args.indexOf('--count');
const count = at >= 0 ? Number(args.splice(at, 2)[1]) : 1;
const products = args.filter(a => !a.startsWith('-'));
const secret = validSecret(process.env.RITKAOS_UNLOCK_SECRET);
if (!secret) { console.error('Set RITKAOS_UNLOCK_SECRET (16+ characters) first. Use the same value as the server.'); process.exit(1); }
if (!products.length || products.some(p => !PRODUCT_IDS.includes(p)) || !Number.isInteger(count) || count < 1 || count > 1000) {
  console.error(`Usage: node scripts/mint-code.mjs <product...> [--count N]\nProducts: ${PRODUCT_IDS.join(', ')}`); process.exit(1);
}
for (let i = 0; i < count; i++) {
  const code = await mintCode(secret, products);
  if (!(await verifyCode(secret, code))) { console.error('Self-check failed.'); process.exit(1); }
  console.log(code);
}
