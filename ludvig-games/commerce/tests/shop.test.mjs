import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../assets/shop.js', import.meta.url), 'utf8');
const makeButton = id => ({ dataset: { storeOffer: id }, disabled: true, textContent: '', addEventListener(_name, fn) { this.click = fn; } });

test('shop opens the matching shared flow and restoration without exposing checkout links', () => {
  const buttons = ['ritkaos', 'pigeon', 'karts', 'bundle'].map(makeButton);
  const restore = makeButton(), status = { textContent: '', hidden: false }, opened = [];
  let update;
  const store = { open: id => opened.push(id), subscribe(fn) { update = fn; fn({ owned: [], ready: false, environment: '' }); } };
  vm.runInNewContext(source, { window: { LudvigStore: store }, document: {
    querySelector: selector => selector === '[data-shop-status]' ? status : restore,
    querySelectorAll: () => buttons,
  } });
  assert.equal(buttons.every(button => button.disabled), true);
  assert.equal(restore.disabled, true);
  assert.match(status.textContent, /not available/);
  update({ owned: [], ready: true, environment: 'test' });
  assert.equal(buttons.every(button => !button.disabled), true);
  assert.equal(restore.disabled, false);
  assert.equal(status.textContent, 'Test mode. No real payment.');
  buttons.forEach(button => button.click());
  restore.click();
  assert.deepEqual(opened, ['ritkaos', 'pigeon', 'karts', 'bundle', 'bundle']);
  update({ owned: ['pigeon'], ready: true, environment: 'live' });
  assert.equal(buttons[1].textContent, 'View purchase');
  assert.equal(buttons[0].textContent, 'Buy pack');
  assert.equal(buttons[3].textContent, 'Buy bundle');
  assert.equal(status.hidden, true);
  update({ owned: ['ritkaos', 'pigeon', 'karts'], ready: true, environment: 'live' });
  assert.equal(buttons[3].textContent, 'View purchase');
  update({ owned: [], ready: false, environment: 'live' });
  assert.equal(buttons.every(button => button.disabled), true);
  assert.equal(restore.disabled, true);
});

test('a missing shared client leaves the server-rendered catalogue safely unavailable', () => {
  assert.doesNotThrow(() => vm.runInNewContext(source, { window: {}, document: {
    querySelector: () => null, querySelectorAll: () => [],
  } }));
});
