/** Short-lived, connection-bound Ritkaos entitlement proofs. No licence/customer data is signed. */
import { LicenseError, normalizeLicense, readLimitedBody } from './license.mjs';

export const GRANT_ISSUER = 'https://games.ludvighedin.com';
export const GRANT_LIMITS = Object.freeze({ lifetimeMs: 60000, clockSkewMs: 2000, tokenBytes: 2048,
  requestBytes: 512, signaturesPerMinute: 60, inFlight: 4 });
const FIELDS = ['v', 'iss', 'kid', 'environment', 'storeId', 'game', 'entitlements', 'audience', 'challenge', 'issuedAt', 'expiresAt'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ID = /^[1-9][0-9]{0,15}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const environmentValid = value => value === 'test' || value === 'live';
const uuid = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : '';
const invalid = () => new LicenseError('invalid-grant', 422);

function encode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (encode(bytes) !== value) throw invalid();
  return bytes;
}
function jwkValid(value, privateKey) {
  try {
    return plain(value) && value.kty === 'OKP' && value.crv === 'Ed25519'
      && (value.alg === undefined || value.alg === 'EdDSA') && decode(value.x).length === 32
      && (privateKey ? decode(value.d).length === 32 : !Object.hasOwn(value, 'd'));
  } catch { return false; }
}
function publicPart(value) {
  return { kty: 'OKP', crv: 'Ed25519', x: value.x };
}

/** Configuration is operator-only; the HTTP caller never supplies this key or its claims. */
export function createGrantSigner({ privateJwk, kid, environment, storeId, now = Date.now } = {}) {
  if (!jwkValid(privateJwk, true) || !KID.test(kid || '') || !environmentValid(environment)
      || !ID.test(String(storeId ?? '')) || typeof now !== 'function') throw new LicenseError('grant-unavailable');
  const store = String(storeId), keyData = structuredClone(privateJwk);
  let keyPromise, windowAt = now(), count = 0, inFlight = 0;
  const key = () => keyPromise ||= (async () => {
    const signing = await crypto.subtle.importKey('jwk', keyData, { name: 'Ed25519' }, false, ['sign']);
    const verifying = await crypto.subtle.importKey('jwk', publicPart(keyData), { name: 'Ed25519' }, false, ['verify']);
    const probe = new TextEncoder().encode('Ludvig Games grant key readiness');
    const signature = await crypto.subtle.sign('Ed25519', signing, probe);
    if (!await crypto.subtle.verify('Ed25519', verifying, signature, probe)) throw new Error('invalid key pair');
    return signing;
  })();
  const sign = async ({ entitlements, audience, challenge } = {}) => {
    if (!Array.isArray(entitlements) || !entitlements.includes('ritkaos')
        || entitlements.some(value => !['ritkaos', 'pigeon', 'karts'].includes(value))
        || !uuid(audience) || !uuid(challenge)) throw invalid();
    const issuedAt = now();
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw new LicenseError('grant-unavailable');
    if (issuedAt < windowAt || issuedAt - windowAt >= 60000) { windowAt = issuedAt; count = 0; }
    if (count >= GRANT_LIMITS.signaturesPerMinute || inFlight >= GRANT_LIMITS.inFlight) throw new LicenseError('rate-limited', 429);
    count++; inFlight++;
    try {
      const payload = { v: 1, iss: GRANT_ISSUER, kid, environment, storeId: store, game: 'ritkaos',
        entitlements: ['ritkaos'], audience: uuid(audience), challenge: uuid(challenge),
        issuedAt, expiresAt: issuedAt + GRANT_LIMITS.lifetimeMs };
      const encoded = encode(new TextEncoder().encode(JSON.stringify(payload)));
      const signature = await crypto.subtle.sign('Ed25519', await key(), new TextEncoder().encode(encoded));
      return `${encoded}.${encode(new Uint8Array(signature))}`;
    } catch { throw new LicenseError('grant-unavailable'); }
    finally { inFlight--; }
  };
  // Check actual import/pair consistency, not just the presence of environment strings.
  sign.ready = async () => { try { await key(); return true; } catch { return false; } };
  return sign;
}

/** Trusted public keys come from app/operator configuration, never the room host or token. */
export async function verifyGrant(token, { publicKeys, environment, storeId, audience, challenge, now = Date.now } = {}) {
  try {
    if (typeof token !== 'string' || token.length > GRANT_LIMITS.tokenBytes || !plain(publicKeys)
        || !environmentValid(environment) || !ID.test(String(storeId ?? ''))
        || !uuid(audience) || !uuid(challenge) || typeof now !== 'function') throw invalid();
    const parts = token.split('.');
    if (parts.length !== 2) throw invalid();
    const payloadBytes = decode(parts[0]), signature = decode(parts[1]);
    if (signature.length !== 64) throw invalid();
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
    if (!plain(payload) || Object.keys(payload).length !== FIELDS.length
        || Object.keys(payload).some(field => !FIELDS.includes(field))
        || encode(new TextEncoder().encode(JSON.stringify(payload))) !== parts[0]
        || payload.v !== 1 || payload.iss !== GRANT_ISSUER || !KID.test(payload.kid || '')
        || payload.environment !== environment || payload.storeId !== String(storeId)
        || payload.game !== 'ritkaos' || !Array.isArray(payload.entitlements)
        || payload.entitlements.length !== 1 || payload.entitlements[0] !== 'ritkaos'
        || payload.audience !== uuid(audience) || payload.challenge !== uuid(challenge)) throw invalid();
    const time = now();
    if (!Number.isSafeInteger(time) || !Number.isSafeInteger(payload.issuedAt)
        || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt < 0
        || payload.issuedAt > time + GRANT_LIMITS.clockSkewMs || payload.expiresAt <= time
        || payload.expiresAt <= payload.issuedAt
        || payload.expiresAt - payload.issuedAt > GRANT_LIMITS.lifetimeMs) throw invalid();
    if (!Object.hasOwn(publicKeys, payload.kid) || !jwkValid(publicKeys[payload.kid], false)) throw invalid();
    const key = await crypto.subtle.importKey('jwk', publicKeys[payload.kid], { name: 'Ed25519' }, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode(parts[0]))) throw invalid();
    return { entitlements: ['ritkaos'], expiresAt: payload.expiresAt };
  } catch { throw invalid(); }
}

export async function readGrantRequest(request) {
  if (!/^(application\/json|text\/plain)(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new LicenseError('json-required', 415);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > GRANT_LIMITS.requestBytes) throw new LicenseError('too-large', 413);
  let value;
  try { value = JSON.parse(await readLimitedBody(request.body, GRANT_LIMITS.requestBytes)); }
  catch (error) { if (error instanceof LicenseError) throw error; throw new LicenseError('bad-request', 400); }
  if (!plain(value) || Object.keys(value).length !== 3
      || Object.keys(value).some(field => !['key', 'audience', 'challenge'].includes(field))
      || !normalizeLicense(value.key) || !uuid(value.audience) || !uuid(value.challenge)) throw new LicenseError('bad-request', 400);
  return { key: normalizeLicense(value.key), audience: uuid(value.audience), challenge: uuid(value.challenge) };
}
