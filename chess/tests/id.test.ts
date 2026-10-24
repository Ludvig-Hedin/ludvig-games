import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomId } from '../lib/id';
import { DEFAULT_CONFIG, newGame } from '../lib/game';

// Local HTTP browsers expose secure getRandomValues, but may omit randomUUID.
// This is the environment that previously prevented the opening board loading.
test('game startup generates valid unique IDs without crypto.randomUUID', { concurrency: false }, () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const nativeCrypto = globalThis.crypto;
  const getRandomValues = nativeCrypto.getRandomValues.bind(nativeCrypto);
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      value: { getRandomValues },
    });
    assert.equal(typeof globalThis.crypto.randomUUID, 'undefined');
    const ids = Array.from({ length: 256 }, () => randomId());
    const game = newGame(DEFAULT_CONFIG, 0);
    ids.push(game.id);
    for (const id of ids) {
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(game.moves.length, 0);
    assert.equal(game.result, null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
  assert.equal(globalThis.crypto, nativeCrypto, 'the test restores the native crypto descriptor');
});
