import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeLicense } from '../license.mjs';

test('hosted Ritkaos restores the real test bundle and shares a paid host setting with a free guest', {
  skip: !process.env.LS_TEST_LICENSE_FILE, timeout: 25000,
}, async () => {
  assert.equal(process.env.LS_TEST_LICENSE_FILE, path.join(os.homedir(), '.config/ludvig-games-commerce/test-native-license.txt'));
  const key = normalizeLicense(await readFile(process.env.LS_TEST_LICENSE_FILE, 'utf8'));
  assert.ok(key);
  const clients = [];
  async function until(check) {
    const end = Date.now() + 7000;
    while (Date.now() < end) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('hosted Ritkaos state deadline');
  }
  async function open() {
    const ws = new WebSocket('wss://ritkaos.ludvighedin.workers.dev/ws');
    const client = { ws, welcome: null, state: null, owned: [], pending: new Map(), count: 0 };
    clients.push(client);
    ws.addEventListener('message', event => {
      const packet = JSON.parse(event.data);
      if (packet.type === 'welcome') client.welcome = packet.data;
      if (packet.type === 'state') client.state = packet.data;
      if (packet.type === 'owned') client.owned = packet.data.products;
      if (packet.type === 'ack') {
        const pending = client.pending.get(packet.request);
        if (pending) { clearTimeout(pending.timer); client.pending.delete(packet.request); pending.resolve(packet); }
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('hosted Ritkaos connection deadline')), 7000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('hosted Ritkaos connection failed')); }, { once: true });
    });
    client.request = (type, data = {}) => new Promise((resolve, reject) => {
      const request = ++client.count;
      const timer = setTimeout(() => { client.pending.delete(request); reject(new Error('hosted Ritkaos request deadline')); }, 7000);
      client.pending.set(request, { resolve, timer });
      ws.send(JSON.stringify({ type, data, request }));
    });
    ws.send(JSON.stringify({ type: 'hello', data: { lang: 'en', codes: [] } }));
    await until(() => client.welcome);
    assert.equal(client.welcome.licenseEnvironment, 'test');
    return client;
  }
  try {
    const buyer = await open();
    const restored = await buyer.request('redeem', { code: key });
    assert.equal(restored.ok, true, 'real test purchase must restore on hosted Ritkaos');
    await until(() => buyer.owned.length === 10);
    const made = await buyer.request('create', { name: 'Purchase delivery test' });
    assert.equal(made.ok, true);
    assert.equal((await buyer.request('settings', { pack: 'office', mode: 'blind' })).ok, true);
    const guest = await open();
    assert.equal((await guest.request('join', { code: made.data.room, name: 'Free guest test' })).ok, true);
    await until(() => guest.state?.settings?.pack === 'office' && guest.state?.settings?.mode === 'blind');
    assert.ok(guest.state.unlocked.includes('office'));
    assert.equal(guest.owned.length, 0);
    assert.equal((await guest.request('redeem', { code: randomUUID() })).ok, false);
    assert.equal(guest.owned.length, 0);
  } finally {
    for (const client of clients) {
      for (const pending of client.pending.values()) clearTimeout(pending.timer);
      client.pending.clear();
      client.ws.close();
    }
  }
});
