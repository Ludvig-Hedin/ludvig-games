import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// A small DOM boundary lets this test control overlapping network responses.
// The real dialog/rendering is also checked in the installed Chrome journey.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.value = ''; this.className = ''; }
  append(...children) { this.children.push(...children); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; delete this[k]; }
  replaceChildren() { this.children = []; }
  addEventListener() {}
  showModal() { this.open = true; }
  focus() {}
  querySelector(selector) {
    const match = el => selector.startsWith('.') ? el.className.split(' ').includes(selector.slice(1))
      : selector === '[role=status]' ? el.attrs.role === 'status'
      : selector === '[data-details]' ? 'details' in el.dataset
      : selector === '[data-availability]' ? 'availability' in el.dataset
      : selector === '[data-mode]' ? 'mode' in el.dataset : el.tag === selector;
    const search = el => { for (const c of el.children) { if (match(c)) return c; const found = search(c); if (found) return found; } return null; };
    return search(this);
  }
}
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const STORAGE = 'ludvig:licenses:test';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('late startup restore cannot erase a newly redeemed key or entitlement', async () => {
  const data = new Map([[STORAGE, JSON.stringify([A])]]), head = new Element('head'), body = new Element('body');
  let completeA;
  const window = { addEventListener() {}, dispatchEvent() {} };
  const catalog = { environment: 'test', ready: true, products: [{ id: 'pigeon', name: 'Pigeon', price: 39,
    checkout: 'https://example.lemonsqueezy.com/buy/00000000-0000-4000-8000-000000000003' }] };
  const fetch = async (url, options) => {
    if (url.endsWith('/api/store')) return Response.json(catalog);
    const key = JSON.parse(options.body).key;
    if (key === A) return new Promise(resolve => { completeA = () => resolve(Response.json({ ok: true, environment: 'test', entitlements: ['karts'] })); });
    assert.equal(key, B);
    return Response.json({ ok: true, environment: 'test', entitlements: ['pigeon'] });
  };
  const context = { window, document: { head, body, activeElement: null, createElement: tag => new Element(tag) },
    location: { origin: 'http://127.0.0.1:4322' }, localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) },
    CustomEvent: class {}, URL, AbortController, setTimeout, clearTimeout, fetch };
  vm.runInNewContext(await readFile(new URL('../../assets/store-client.js', import.meta.url), 'utf8'), context);
  for (let i = 0; !completeA && i < 10; i++) await tick();
  assert.equal(typeof completeA, 'function');
  window.LudvigStore.open('pigeon');
  const dialog = body.querySelector('dialog'), form = dialog.querySelector('form');
  dialog.querySelector('input').value = B;
  await form.onsubmit({ preventDefault() {} });
  assert.equal(window.LudvigStore.owns('pigeon'), true);
  completeA(); await tick(); await tick();
  assert.equal(window.LudvigStore.owns('pigeon'), true);
  assert.deepEqual(JSON.parse(data.get(STORAGE)), [A, B]);
});

for (const environment of ['test', 'live']) {
  test(`${environment} client restores only its own saved keys and rejects other-mode responses`, async () => {
    const own = `ludvig:licenses:${environment}`, other = `ludvig:licenses:${environment === 'test' ? 'live' : 'test'}`;
    const data = new Map([[own, JSON.stringify([A])], [other, JSON.stringify([B])]]);
    const head = new Element('head'), body = new Element('body'), checked = [];
    const window = { addEventListener() {}, dispatchEvent() {} };
    let wrongMode = false;
    const fetch = async (url, options) => {
      if (url.endsWith('/api/store')) return Response.json({ environment, ready: true, products: [{ id: 'pigeon', name: 'Pigeon', price: 39, checkout: 'https://example.lemonsqueezy.com/buy/00000000-0000-4000-8000-000000000003' }] });
      checked.push(JSON.parse(options.body).key);
      return Response.json({ ok: true, environment: wrongMode ? (environment === 'live' ? 'test' : 'live') : environment, entitlements: ['pigeon'] });
    };
    vm.runInNewContext(await readFile(new URL('../../assets/store-client.js', import.meta.url), 'utf8'), {
      window, document: { head, body, activeElement: null, createElement: tag => new Element(tag) }, location: { origin: 'http://127.0.0.1:4322' },
      localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }, CustomEvent: class {}, URL, AbortController, setTimeout, clearTimeout, fetch,
    });
    await tick(); await tick();
    assert.deepEqual(checked, [A]);
    assert.equal(window.LudvigStore.owns('pigeon'), true);
    window.LudvigStore.open('pigeon');
    const dialog = body.querySelector('dialog');
    assert.equal(dialog.querySelector('[data-mode]').hidden, environment !== 'test');
    assert.deepEqual(JSON.parse(data.get(other)), [B]);
    wrongMode = true;
    dialog.querySelector('input').value = B;
    await dialog.querySelector('form').onsubmit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(data.get(own)), [A]);
    assert.equal(dialog.querySelector('input').value, B);
  });
}

for (const expected of ['live', 'test']) {
  test(`${expected} service hostname rejects the opposite catalogue before restoring or exposing checkout`, async () => {
    const endpoint = `https://ludvig-games-store${expected === 'test' ? '-test' : ''}.ludvighedin.workers.dev`;
    const head = new Element('head'), body = new Element('body');
    let calls = 0;
    const window = { __LUDVIG_STORE_API: endpoint, addEventListener() {}, dispatchEvent() {} };
    vm.runInNewContext(await readFile(new URL('../../assets/store-client.js', import.meta.url), 'utf8'), {
      window, document: { head, body, activeElement: null, createElement: tag => new Element(tag) },
      location: { origin: 'https://games.ludvighedin.com' },
      localStorage: { getItem: () => JSON.stringify([A]), setItem() { throw new Error('Unexpected storage write'); } },
      CustomEvent: class {}, URL, AbortController, setTimeout, clearTimeout,
      fetch: async url => {
        calls++;
        assert.equal(url, endpoint + '/api/store');
        return Response.json({ environment: expected === 'test' ? 'live' : 'test', ready: true, products: [] });
      },
    });
    await tick(); await tick();
    assert.equal(calls, 1);
    window.LudvigStore.open('bundle');
    assert.equal(body.querySelector('dialog').querySelector('.lg-buy').hidden, true);
    assert.equal(window.LudvigStore.owns('pigeon'), false);
  });
}
