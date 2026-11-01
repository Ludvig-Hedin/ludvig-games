(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('details-form'), fields = $('details-fields'), review = $('review');
  const confirm = $('confirm'), edit = $('edit'), status = $('status'), receipt = $('receipt');
  let siteKey = '', draft = null, canonical = '', token = '', widget = null, busy = false, received = false;
  const tell = text => { status.textContent = text; };
  const enableConfirm = () => { confirm.disabled = busy || !token || !draft; };
  async function api(path, options = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, { ...options, signal: controller.signal, cache: 'no-store',
        credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('unavailable');
      const text = await response.text(); if (text.length > 8192) throw new Error('unavailable');
      const data = JSON.parse(text);
      if (!response.ok || data.ok === false) throw new Error(data.error || 'unavailable');
      return data;
    } finally { clearTimeout(timeout); }
  }
  function securityCheck() {
    token = ''; enableConfirm();
    if (widget !== null) { window.turnstile.reset(widget); return; }
    widget = window.turnstile.render($('security-check'), { sitekey: siteKey, action: 'withdrawal',
      callback: value => { token = value; enableConfirm(); },
      'expired-callback': () => { token = ''; enableConfirm(); },
      'error-callback': () => { token = ''; enableConfirm(); tell('The security check could not be completed. Reload this page or send your declaration by email.'); },
    });
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!siteKey || !window.turnstile || !form.reportValidity()) return;
    const details = { name: $('name').value.normalize('NFC').trim(),
      orderDetails: $('order-details').value.replace(/\r\n?/g, '\n').normalize('NFC').trim(),
      email: $('email').value.trim() };
    if (!details.name || !details.orderDetails || !details.email) { tell('Complete all three fields.'); return; }
    const next = JSON.stringify(details);
    if (next !== canonical) { canonical = next; draft = { requestId: crypto.randomUUID(), ...details }; }
    $('statement').textContent = ['I withdraw from the contract identified below.', '',
      `Name: ${draft.name}`, `Purchase information: ${draft.orderDetails}`,
      `Acknowledgement email: ${draft.email}`].join('\n');
    form.hidden = true; review.hidden = false; tell('Review the details, complete the security check and confirm.');
    $('review-title').focus(); securityCheck();
  });
  edit.addEventListener('click', () => {
    if (busy || received) return;
    review.hidden = true; form.hidden = false; token = ''; enableConfirm(); $('name').focus();
  });
  confirm.addEventListener('click', async () => {
    if (busy || !draft || !token) return;
    busy = true; enableConfirm(); edit.disabled = true; tell('Sending your declaration…');
    try {
      const data = await api('/api/withdrawals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, turnstileToken: token }) });
      if (data.received !== true || data.receipt?.id !== draft.requestId
          || !Number.isFinite(Date.parse(data.receipt.receivedAt))) throw new Error('unavailable');
      received = true;
      receipt.textContent = `Received: ${data.receipt.receivedAt}. Reference: ${data.receipt.id}.`;
      receipt.hidden = false;
      if (data.receipt.acknowledgement === 'accepted-for-sending') {
        tell('Your declaration was received. The confirmation email is on its way. We will handle your request through Lemon Squeezy.');
        confirm.hidden = true; edit.hidden = true; $('security-check').hidden = true;
      } else {
        tell('Your declaration was received, but we could not send the confirmation email yet. Try again below or email ludvig@ludvighedin.com with this reference.');
        confirm.textContent = 'Retry acknowledgement';
      }
    } catch (error) {
      const messages = { 'invalid-fields': 'Check your name, purchase information and email address.',
        'captcha-failed': 'The security check expired or failed. Complete it again and retry.',
        'rate-limited': 'Too many attempts. Please wait a minute, then try again.',
        'temporarily-busy': 'The form is temporarily busy. Please try later or send your declaration by email.',
        'request-id-conflict': 'This reference was already used for different details. Reload the form or email us.' };
      tell(received ? 'Your declaration was already received. Its email confirmation is still pending. Retry or email ludvig@ludvighedin.com with your reference.'
        : messages[error.message] || 'We could not confirm receipt. Your details are still here. Retry or send your declaration by email.');
    } finally {
      busy = false; edit.disabled = received;
      token = ''; if (widget !== null) window.turnstile.reset(widget); enableConfirm();
    }
  });
  api('/api/config').then(config => {
    if (config.enabled !== true || typeof config.siteKey !== 'string') throw new Error('unavailable');
    siteKey = config.siteKey;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = () => { fields.disabled = false; tell(''); };
    script.onerror = () => tell('The security check is unavailable. Please send your declaration by email.');
    document.head.append(script);
  }).catch(() => tell('This form is not available yet. Please send your declaration to ludvig@ludvighedin.com.'));
})();
