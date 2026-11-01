export const OPERATOR = 'ludvig@ludvighedin.com';
export const SERVICE_ORIGIN = 'https://ludvig-games-withdrawals.ludvighedin.workers.dev';
export const ACTION = 'withdrawal';
const ORIGINS = new Set([SERVICE_ORIGIN, 'https://games.ludvighedin.com']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const TEXT_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FIELDS = ['requestId', 'name', 'orderDetails', 'email', 'turnstileToken'];

export class RequestError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function allowedOrigin(origin, local = false) {
  return ORIGINS.has(origin) || local && ['http://127.0.0.1:8795', 'http://localhost:8795'].includes(origin);
}

export function configured(env) {
  return env.WITHDRAWAL_ENABLED === 'true' && typeof env.RESEND_API_KEY === 'string'
    && /^re_[A-Za-z0-9_-]{10,200}$/.test(env.RESEND_API_KEY)
    && typeof env.TURNSTILE_SECRET === 'string' && env.TURNSTILE_SECRET.length >= 20
    && env.TURNSTILE_SECRET.length <= 200 && typeof env.TURNSTILE_SITE_KEY === 'string'
    && /^[A-Za-z0-9_-]{10,100}$/.test(env.TURNSTILE_SITE_KEY)
    && typeof env.WITHDRAWAL_IP_LIMIT?.limit === 'function'
    && typeof env.INBOX?.idFromName === 'function' && typeof env.INBOX?.get === 'function'
    && typeof env.RECOVERY?.get === 'function' && typeof env.RECOVERY?.put === 'function'
    && typeof env.ASSETS?.fetch === 'function';
}

function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || CONTROL.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64
      || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])
      || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.every(label => label.length <= 63
    && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
}

export function validateDeclaration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(input, key)))
    throw new RequestError('invalid-request');
  if (Object.values(input).some(value => typeof value !== 'string')) throw new RequestError('invalid-request');
  const declaration = {
    requestId: input.requestId.toLowerCase(), name: input.name.normalize('NFC').trim(),
    orderDetails: input.orderDetails.replace(/\r\n?/g, '\n').normalize('NFC').trim(),
    email: input.email.trim(),
  };
  if (!UUID.test(declaration.requestId) || !declaration.name || declaration.name.length > 120
      || CONTROL.test(declaration.name) || !declaration.orderDetails || declaration.orderDetails.length > 500
      || TEXT_CONTROL.test(declaration.orderDetails) || !emailAddress(declaration.email)
      || input.turnstileToken.length < 1 || input.turnstileToken.length > 2048
      || CONTROL.test(input.turnstileToken)) throw new RequestError('invalid-fields');
  return { declaration, token: input.turnstileToken };
}

export async function limitedText(stream, maximum) {
  if (!stream) return '';
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new RequestError('request-too-large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function readDeclaration(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''))
    throw new RequestError('json-required', 415);
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) throw new RequestError('request-too-large', 413);
  try { return validateDeclaration(JSON.parse(await limitedText(request.body, 8192))); }
  catch (error) { if (error instanceof RequestError) throw error; throw new RequestError('invalid-request'); }
}

export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function boundedJson(response, limit) {
  if (response.status >= 300 && response.status < 400) throw new Error('provider-redirect');
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('provider-response');
  const data = JSON.parse(await limitedText(response.body, limit));
  if (!response.ok) throw new Error('provider-response');
  return data;
}

export async function verifyCaptcha(env, token, ip, fetcher = fetch) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const result = await boundedJson(response, 8192);
    const hostAllowed = ['games.ludvighedin.com', new URL(SERVICE_ORIGIN).hostname].includes(result.hostname)
      || env.ALLOW_LOCAL_TEST_ORIGINS === 'true' && ['localhost', '127.0.0.1'].includes(result.hostname);
    return result.success === true && result.action === ACTION && hostAllowed;
  } catch { return false; } finally { clearTimeout(timeout); }
}

export function declarationText(declaration, receivedAt) {
  return ['I withdraw from the contract identified below.', '',
    `Name: ${declaration.name}`, `Purchase information: ${declaration.orderDetails}`,
    `Acknowledgement email: ${declaration.email}`, '',
    `Received by Ludvig Games: ${receivedAt}`, `Reference: ${declaration.requestId}`].join('\n');
}

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function acknowledgement(declaration, receivedAt) {
  const statement = declarationText(declaration, receivedAt);
  const text = ['Ludvig Games received your withdrawal declaration.', '', statement, '',
    'This confirms receipt of your declaration. It does not mean that a refund has already been processed.',
    'We will handle the request through Lemon Squeezy. Keep this email for your records.',
    `Questions: ${OPERATOR}`].join('\n');
  return {
    from: `Ludvig Games <${OPERATOR}>`, to: [declaration.email],
    ...(declaration.email.toLowerCase() === OPERATOR ? {} : { bcc: [OPERATOR] }),
    reply_to: OPERATOR, subject: 'Ludvig Games: withdrawal declaration received', text,
    html: `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`,
  };
}

export async function sendAcknowledgement(env, declaration, receivedAt, fetcher = fetch) {
  if (env.WITHDRAWAL_ENABLED !== 'true' || typeof env.RESEND_API_KEY !== 'string'
      || !/^re_[A-Za-z0-9_-]{10,200}$/.test(env.RESEND_API_KEY)) throw new Error('mail-disabled');
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `games-withdrawal/${declaration.requestId}` },
      body: JSON.stringify(acknowledgement(declaration, receivedAt)),
    });
    const result = await boundedJson(response, 8192);
    if (typeof result.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id))
      throw new Error('provider-response');
    return result.id;
  } finally { clearTimeout(timeout); }
}
