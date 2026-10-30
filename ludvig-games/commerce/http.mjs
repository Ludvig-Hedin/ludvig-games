import { LicenseError, LIMITS, readLimitedBody } from './license.mjs';

const HOSTED_ORIGINS = new Set(['https://games.ludvighedin.com', 'https://ritkaos.ludvighedin.workers.dev']);
const LOCAL_ORIGINS = new Set([4317, 4322, 3000, 8793].flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]));
export const allowedOrigin = (origin, local = false) => HOSTED_ORIGINS.has(origin) || local && LOCAL_ORIGINS.has(origin);
export function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  } });
}

export function safeFailure(error, origin = '') {
  return json({ ok: false, error: error instanceof LicenseError ? error.code : 'temporarily-unavailable' }, error instanceof LicenseError ? error.status : 503, origin);
}

export async function readLicenseRequest(request) {
  const type = request.headers.get('content-type') || '';
  if (!/^(application\/json|text\/plain)(?:;|$)/i.test(type)) throw new LicenseError('json-required', 415);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > LIMITS.inputBytes) throw new LicenseError('too-large', 413);
  let data;
  try { data = JSON.parse(await readLimitedBody(request.body, LIMITS.inputBytes)); }
  catch (error) { if (error instanceof LicenseError) throw error; throw new LicenseError('bad-request', 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 1 || typeof data.key !== 'string') throw new LicenseError('bad-request', 400);
  return data.key;
}

export function preflight(origin) {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin',
  } });
}
