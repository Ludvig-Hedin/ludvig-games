import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../withdrawal/client/app.js', import.meta.url), 'utf8');
const RECEIVED = '2026-11-01T12:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  listeners = new Map(); value = ''; hidden = false; disabled = false; textContent = '';
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  reportValidity() { return true; }
  focus() {}
  set innerHTML(_value) { throw new Error('User details must render as text'); }
  async trigger(name) { return this.listeners.get(name)?.({ preventDefault() {} }); }
}

async function setup({ configured = true, outcomes = ['accepted-for-sending'] } = {}) {
  const ids = ['details-form', 'details-fields', 'review', 'confirm', 'edit', 'status', 'receipt',
    'name', 'order-details', 'email', 'statement', 'review-title', 'security-check'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes['details-fields'].disabled = true; nodes.review.hidden = true;
  nodes.name.value = '<img src=x onerror=alert(1)>';
  nodes['order-details'].value = 'Order TEST-42'; nodes.email.value = 'buyer@example.invalid';
  const calls = []; let sequence = 0, captchaOptions, token = 0;
  const window = { turnstile: {
    render(_element, options) { captchaOptions = options; options.callback(`token-${++token}`); return 'widget'; },
    reset() { captchaOptions.callback(`token-${++token}`); },
  } };
  vm.runInNewContext(source, {
    window, document: { getElementById: id => nodes[id], createElement: () => ({}),
      head: { append: script => {
        assert.equal(script.src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
        script.onload();
      } } },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    AbortController, setTimeout, clearTimeout,
    fetch: async (path, options) => {
      assert.ok(['/api/config', '/api/withdrawals'].includes(path), 'no real network destination');
      calls.push({ path, options });
      if (path === '/api/config') return Response.json(configured
        ? { enabled: true, siteKey: 'synthetic-site-key' } : { enabled: false }, { status: configured ? 200 : 503 });
      const payload = JSON.parse(options.body), outcome = outcomes.shift();
      if (outcome === 'network-error') throw new Error('synthetic-private-provider-detail');
      return Response.json({ ok: true, received: true,
        receipt: { id: payload.requestId, receivedAt: RECEIVED, acknowledgement: outcome } },
      { status: outcome === 'pending' ? 202 : 200 });
    },
  });
  await tick(); await tick();
  return { nodes, calls, review: () => nodes['details-form'].trigger('submit'),
    confirm: () => nodes.confirm.trigger('click') };
}

test('review renders user details safely without sending; only explicit confirmation submits', async () => {
  const s = await setup();
  assert.equal(s.nodes['details-fields'].disabled, false);
  await s.review();
  assert.deepEqual(s.calls.map(call => call.path), ['/api/config']);
  assert.equal(s.nodes.review.hidden, false);
  assert.ok(s.nodes.statement.textContent.includes(s.nodes.name.value));
  assert.equal(s.nodes.confirm.disabled, false);
  await s.confirm();
  const request = s.calls[1], data = JSON.parse(request.options.body);
  assert.equal(request.options.method, 'POST'); assert.equal(request.options.credentials, 'omit');
  assert.deepEqual(Object.keys(data).sort(), ['email', 'name', 'orderDetails', 'requestId', 'turnstileToken']);
  assert.equal(data.orderDetails, s.nodes['order-details'].value);
  assert.ok(s.nodes.receipt.textContent.includes(RECEIVED));
  assert.equal(s.nodes.confirm.hidden, true);
});

test('an unavailable backend leaves the form closed and cannot submit a declaration', async () => {
  const s = await setup({ configured: false });
  await s.review(); await s.confirm();
  assert.equal(s.nodes['details-fields'].disabled, true);
  assert.deepEqual(s.calls.map(call => call.path), ['/api/config']);
});

test('pending acknowledgement retries preserve the declaration reference and receipt time', async () => {
  const s = await setup({ outcomes: ['pending', 'accepted-for-sending'] });
  await s.review(); await s.confirm();
  const first = JSON.parse(s.calls[1].options.body);
  assert.equal(s.nodes.edit.disabled, true);
  assert.ok(s.nodes.receipt.textContent.includes(RECEIVED));
  await s.confirm();
  const second = JSON.parse(s.calls[2].options.body);
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.orderDetails, first.orderDetails);
  assert.notEqual(second.turnstileToken, first.turnstileToken);
  assert.ok(s.nodes.receipt.textContent.includes(RECEIVED));
  assert.equal(s.nodes.confirm.hidden, true);
});

test('ambiguous failure preserves entered details and retry identity without exposing provider errors', async () => {
  const s = await setup({ outcomes: ['network-error', 'accepted-for-sending'] });
  await s.review(); await s.confirm();
  assert.equal(s.nodes['order-details'].value, 'Order TEST-42');
  assert.equal(s.nodes.email.value, 'buyer@example.invalid');
  assert.equal(s.nodes.edit.disabled, false);
  assert.equal(s.nodes.status.textContent.includes('synthetic-private-provider-detail'), false);
  await s.confirm();
  assert.equal(JSON.parse(s.calls[2].options.body).requestId, JSON.parse(s.calls[1].options.body).requestId);
});

test('an acknowledgement retry failure preserves the already confirmed receipt', async () => {
  const s = await setup({ outcomes: ['pending', 'network-error', 'accepted-for-sending'] });
  await s.review(); await s.confirm();
  const original = s.nodes.receipt.textContent;
  await s.confirm();
  assert.equal(s.nodes.receipt.textContent, original);
  assert.equal(/could not confirm receipt/i.test(s.nodes.status.textContent), false);
  assert.equal(s.nodes.edit.disabled, true);
  await s.confirm(); assert.equal(s.nodes.confirm.hidden, true);
});
