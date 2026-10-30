import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { configurationFromEnv, createLicenseResolver, normalizeLicense } from '../license.mjs';
import { Game } from '../../../ritkaos/lib/game.mjs';
import { snapshot } from '../../../ritkaos/lib/snapshot.mjs';

// Explicit opt-in only. The private file comes from T3's secret card; no key is
// stored in source, command arguments, assertions, snapshots or test output.
test('purchased test bundle resolves with the provider and grants the actual game extras', {
  skip: !process.env.LS_TEST_LICENSE_FILE, timeout: 15000,
}, async () => {
  const key = normalizeLicense(await readFile(process.env.LS_TEST_LICENSE_FILE, 'utf8'));
  assert.ok(Boolean(key), 'A valid private test licence is required');
  const env = parseEnv(await readFile(new URL('../.env.test.example', import.meta.url), 'utf8'));
  const config = configurationFromEnv(env);
  const resolver = createLicenseResolver(config);
  assert.equal(resolver.catalog().ready, true);
  assert.deepEqual(await resolver.resolve(key), {
    ok: true, environment: 'test', entitlements: ['ritkaos', 'pigeon', 'karts'],
  });
  const messages = [];
  const game = new Game({ resolveLicense: value => resolver.resolve(value) });
  const player = game.connect({ send: message => messages.push(structuredClone(message)), close() {} });
  const reply = await game.handle(player, 'redeem', { code: key });
  assert.equal(reply.products.length, 10);
  assert.equal(player.owned.has('plus'), true);
  assert.equal(reply.products.includes('telephone') && reply.products.includes('cosmetics'), true);
  await game.handle(player, 'create', { name: 'Test buyer' });
  await game.handle(player, 'settings', { pack: 'office' });
  assert.equal(JSON.stringify(messages).includes(key), false);
  assert.equal(JSON.stringify(snapshot(game)).includes(key), false);
  const wrongStore = createLicenseResolver({ ...config, storeId: '504843' });
  await assert.rejects(wrongStore.resolve(key), error => error.code === 'invalid-license');
});
