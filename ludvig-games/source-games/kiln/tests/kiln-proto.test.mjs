// Tests for Scrapyard's online packet helpers (<script id="kiln-proto"> in ../index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const block = id => { const m = new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html); assert.ok(m, `missing script ${id}`); return m[1]; };
const sandbox = { window: {}, URL, URLSearchParams, Math };
vm.runInNewContext(block('fps-kit'), sandbox);
vm.runInNewContext(block('kiln-proto'), sandbox);
const P = sandbox.window.KilnProto;

test('own pose round-trips and is clamped', () => {
  const a = P.packSelf({ x: 1.234, y: 1.72, z: -40, yaw: 0.12345, pitch: 2 }, P.FLAG.fire | P.FLAG.aim, 3);
  const s = P.unpackSelf(a);
  assert.equal(s.x, 1.23); assert.equal(s.z, -27); assert.equal(s.pitch, 1.5);
  assert.equal(s.flags & P.FLAG.fire, P.FLAG.fire); assert.equal(s.serial, 3);
  assert.equal(P.unpackSelf([1, 2]), null);
  assert.equal(P.unpackSelf([1, 2, 'x', 0, 0, 0]), null);
  assert.equal(P.unpackSelf([NaN, 2, 3, 0, 0, 0]), null);
});

test('enemy snapshot round-trips, skips dead and bad rows', () => {
  const list = [
    { id: 4, type: 2, boss: true, x: 3, y: 2.5, z: -4, heading: 1, hp: 350, maxHp: 700, charge: .2, stun: 0, flash: 0 },
    { id: 5, type: 1, x: 0, y: 1, z: 0, heading: 0, hp: 0, maxHp: 68, dead: true },
  ];
  const out = P.unpackEnemies(P.packEnemies(list));
  assert.equal(out.length, 1);
  assert.equal(out[0].boss, true); assert.equal(out[0].type, 2); assert.equal(out[0].hp, 0.5);
  assert.equal(out[0].flags & 1, 1);
  assert.equal(P.unpackEnemies([[1, 2, 3]]).length, 0);
  assert.equal(P.unpackEnemies('x').length, 0);
});

test('wave state round-trips', () => {
  const w = P.unpackWave(P.packWave({ wave: 5, waveTotal: 14, waveKills: 3, spawned: 9, mission: 'extract', roundDelay: 2.34, bossDefeated: true, extractProgress: 1.5 }));
  assert.deepEqual({ ...w }, { wave: 5, waveTotal: 14, waveKills: 3, spawned: 9, mission: 'extract', roundDelay: 2.3, bossDefeated: true, extractProgress: 1.5 });
  assert.equal(P.unpackWave(null), null);
});

test('pilot hit zones: head beats body when both are hit', () => {
  const p = { x: 0, y: 1.72, z: -10 };
  const head = P.hitPilot([0, 1.74, 0], [0, 0, -1], p);
  assert.equal(head.zone, 'head');
  const body = P.hitPilot([0, 1.1, 0], [0, 0, -1], p);
  assert.equal(body.zone, 'body');
  const miss = P.hitPilot([3, 1.7, 0], [0, 0, -1], p);
  assert.equal(miss, null);
  const blocked = P.hitPilot([0, 1.1, 0], [0, 0, -1], p, 5);
  assert.equal(blocked, null, 'a wall closer than the target blocks the shot');
  assert.equal(P.dmDamage('head'), P.DM.head);
  assert.ok(P.DM.head <= P.DM.maxHit && P.DM.pulse <= P.DM.maxHit);
});

test('pickups round-trip', () => {
  assert.deepEqual(P.unpackPickups(P.packPickups([{ id: 2, x: 1.111, z: 2 }])).map(p => ({ ...p })), [{ id: 2, x: 1.11, z: 2 }]);
});
