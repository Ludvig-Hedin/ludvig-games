// Tests for Cinder's pure co-op rules (<script id="cinder-coop"> in ../index.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const src = /<script id="cinder-coop">([\s\S]*?)<\/script>/.exec(html);
assert.ok(src, 'cinder-coop script present');
const sandbox = { window: {}, Math };
vm.runInNewContext(src[1], sandbox);
const C = sandbox.window.CinderCoop;
const plain = v => JSON.parse(JSON.stringify(v));

test('masks merge and count', () => {
  assert.equal(C.mergeMask(1, 4), 5);
  assert.equal(C.popcount(C.mergeMask(5, 2)), 3);
  assert.equal(C.popcount(0), 0);
});

test('own state packs and unpacks with limits', () => {
  const s = C.packSelf({ x: 1.23456, y: 1.65, z: -3.3333, yaw: 0.12345, pitch: -0.5, hp: 41.2 }, 3);
  assert.deepEqual(plain(s), [1.23, 1.65, -3.33, 0.123, -0.5, 42, 3]);
  const u = C.unpackSelf(s);
  assert.equal(u.flags & C.FLAGS.down, 1);
  assert.equal(C.unpackSelf([1, 2, 3]), null);
  assert.equal(C.unpackSelf([NaN, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(C.unpackSelf([999, 0, 0, 0, 0, 500, 0]).x, 82);
  assert.equal(C.unpackSelf([0, 0, 0, 0, 0, 500, 0]).hp, 100);
});

test('revive needs a steady 2.5 s hold in range', () => {
  const r = new C.Revive(2.5, 2.2);
  let out;
  for (let i = 0; i < 20; i++) out = r.step('a', true, 1.5, 0.1);
  assert.equal(out.done, false);
  assert.ok(out.progress > 0.75);
  assert.equal(r.step('a', false, 1.5, 0.1).progress, 0, 'letting go resets');
  for (let i = 0; i < 24; i++) out = r.step('a', true, 1.5, 0.1);
  assert.equal(out.done, false);
  out = r.step('a', true, 1.5, 0.1);
  assert.equal(out.done, true);
  r.step('a', true, 1, 1);
  assert.equal(r.step('b', true, 1, 0.1).progress, 0.04, 'switching target restarts');
  assert.equal(r.step('b', true, 3, 0.1).progress, 0, 'out of range');
});

test('bleed out and all-down', () => {
  assert.deepEqual(plain(C.bleed(1, 0.4)), { t: 0.6, respawn: false });
  assert.equal(C.bleed(0.2, 0.4).respawn, true);
  assert.equal(C.allDown([{ down: true }, { down: true }]), true);
  assert.equal(C.allDown([{ down: true }, { down: false }]), false);
  assert.equal(C.allDown([]), false);
});

test('scaling grows gently with players', () => {
  assert.deepEqual(plain(C.scale(1)), { cap: 1, hp: 1, tokens: 2, spawn: 1 });
  assert.equal(C.scale(4).tokens, 5);
  assert.equal(C.scale(9).cap, 2.5);
});
