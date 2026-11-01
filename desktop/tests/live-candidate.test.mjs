import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, verify } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(root, 'desktop');
const application = path.join(desktop, 'release/mac-arm64/Ludvig Games.app');
const resources = path.join(application, 'Contents/Resources/app');

test('actual live Mac candidate contains the approved public map and authentic update archive', {
  skip: process.env.GAMES_EXPECT_LIVE_CANDIDATE !== 'true', timeout: 60000,
}, async () => {
  async function regular(file) {
    const info = await lstat(file);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid(),
      'candidate inputs must be owned regular files');
    return readFile(file);
  }
  const expected = JSON.parse(await regular(path.join(os.homedir(),
    '.config/ludvig-games-commerce/live-desktop-public.candidate.json')));
  const staged = JSON.parse(await regular(path.join(resources, 'bundle/hub/commerce/config.json')));
  const plan = JSON.parse(await regular(path.join(root, 'ludvig-games/commerce/live-products.plan.json')));
  const fields = ['LS_GRANT_PUBLIC_KEYS', 'LS_LIVE_PRODUCTS', 'LS_STORE_ID', 'TEST_MODE'];
  assert.ok(JSON.stringify(Object.keys(staged).sort()) === JSON.stringify(fields),
    'packaged configuration must contain only the four approved public fields');
  assert.ok(staged.TEST_MODE === 'false' && staged.LS_STORE_ID === '504842',
    'the actual package must select the approved live store');
  assert.ok(fields.every(field => staged[field] === expected[field]),
    'the packaged values must match the prepared public live candidate');
  const products = JSON.parse(staged.LS_LIVE_PRODUCTS);
  assert.ok(JSON.stringify(Object.keys(products).sort()) === JSON.stringify(plan.offers.map(o => o.id).sort()),
    'only the four approved offers belong in the live package');
  for (const offer of plan.offers) {
    const product = products[offer.id];
    assert.ok(product.productId === offer.provider.productId
      && product.variantId === offer.provider.variantId
      && product.checkout === offer.provider.checkout && product.testMode === false,
    'packaged product identities must match the approved live offer');
  }
  const keys = JSON.parse(staged.LS_GRANT_PUBLIC_KEYS);
  assert.ok(Object.keys(keys).length === 1 && Object.hasOwn(keys, 'games-live-v1'),
    'only the distinct live grant verifier belongs in this candidate');
  assert.ok(Object.values(keys).every(key => key.kty === 'OKP' && key.crv === 'Ed25519'
    && Object.keys(key).every(field => ['kty', 'crv', 'x', 'alg', 'key_ops', 'ext', 'kid'].includes(field))),
  'no private signing material may enter the packaged public configuration');
  for (const name of ['license.mjs', 'http.mjs', 'grant.mjs']) {
    const source = await regular(path.join(root, 'ludvig-games/commerce', name));
    const bundled = await regular(path.join(resources, 'bundle/hub/commerce', name));
    assert.ok(source.equals(bundled), 'the package must contain the reviewed current commerce modules');
  }
  const sourceKey = await regular(path.join(desktop, 'app/update-key.pem'));
  const bundledKey = await regular(path.join(resources, 'app/update-key.pem'));
  assert.ok(sourceKey.equals(bundledKey), 'the existing update trust key must be retained');
  const zip = path.join(desktop, 'release/Ludvig-Games-mac-arm64.zip');
  const signature = JSON.parse(await regular(zip + '.sig'));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(zip)) hash.update(chunk);
  const digest = hash.digest();
  assert.ok(digest.toString('hex') === signature.sha256
    && verify(null, digest, bundledKey, Buffer.from(signature.signature, 'base64')),
  'the exact generated archive must verify against the app update trust key');
  await promisify(execFile)('/usr/bin/codesign', ['--verify', '--deep', '--strict', application],
    { timeout: 30000, maxBuffer: 8192 });
});

test('actual web candidate pins the live purchase service and includes all approved offers', {
  skip: process.env.GAMES_EXPECT_WEB_CANDIDATE !== 'true',
}, async () => {
  const output = path.join(root, 'ludvig-games/public');
  const client = await readFile(path.join(output, 'assets/store-client.js'), 'utf8');
  assert.ok(client.startsWith('window.__LUDVIG_STORE_API="https://ludvig-games-store.ludvighedin.workers.dev";\n'),
    'the built web client must select the approved live purchase service');
  const shop = await readFile(path.join(output, 'shop/index.html'), 'utf8');
  const ids = [...shop.matchAll(/data-store-offer="([a-z]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(ids, ['bundle', 'karts', 'pigeon', 'ritkaos']);
  const index = await readFile(path.join(output, 'index.html'), 'utf8');
  assert.ok(index.includes('href="/shop/"'), 'the shared shop must be reachable from the built catalogue');
});
