/** Small helpers shared by the Worker, its Durable Objects and the local server. No Cloudflare imports, so Node
    tests and Bun can load them. */

// Same security headers as public/_headers, plus no caching for personal API data.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// The only page origins the API answers (docs/free-account-plan.md, "Hub split"). The local preview origin is
// allowed only when the Worker runs with the var DEV=1.
export const SITE_ORIGIN = 'https://games.ludvighedin.com';
export const DEV_ORIGIN = 'http://127.0.0.1:4317';
export const allowedOrigins = env => (env?.DEV === '1' ? [SITE_ORIGIN, DEV_ORIGIN] : [SITE_ORIGIN]);

/** The request's page origin when it may use the API, else null. Browsers always send Origin on cross-origin
    requests and WebSocket upgrades; a request without one counts only when it is addressed to an allowed origin
    itself (a same-origin GET on a combined deployment). */
export function allowedOrigin(request, env) {
  const list = allowedOrigins(env);
  const origin = request.headers.get('Origin');
  if (origin) return list.includes(origin) ? origin : null;
  const own = new URL(request.url).origin;
  return list.includes(own) ? own : null;
}

const corsHeaders = origin => (origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {});

export function json(body, status = 200, origin = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** CORS preflight for an allowed origin. Browsers cache it for up to 2 h, so a page asks about once per URL. */
export function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS, ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '7200',
    },
  });
}

// Per-key limits through Workers rate-limit bindings ("ratelimits" in wrangler.api.jsonc; the numbers there must
// match these). They keep no rows anywhere, so a refused request writes nothing. Only 10 s and 60 s periods exist.
export const RATE_LIMITS = {
  RL_SCORE_IP: { limit: 30, period: 60 }, // score posts per IP
  RL_SCORE_PLAYER: { limit: 6, period: 60 }, // score posts per player per board
  RL_NAME: { limit: 5, period: 60 }, // name changes per IP, and per player
  RL_ROOM: { limit: 6, period: 60 }, // new rooms per IP (create, or a quick match that opens a room)
  RL_SOCKET: { limit: 20, period: 60 }, // room socket opens per IP
};

/** True when the key is under its limit. A missing binding throws, so callers fail closed (503). */
export async function underLimit(env, name, key) {
  const binding = env?.[name];
  if (!binding || typeof binding.limit !== 'function') throw new Error(`rate limiter ${name} missing`);
  const outcome = await binding.limit({ key });
  return outcome?.success === true;
}

/** In-memory stand-in for a rate-limit binding (local server and tests): a fixed window per key. */
export function memoryLimiter({ limit, period }, clock = () => Date.now()) {
  const windows = new Map();
  return {
    async limit({ key }) {
      const now = clock();
      let entry = windows.get(key);
      if (!entry || now - entry.start >= period * 1000) {
        entry = { start: now, count: 0 };
        windows.set(key, entry);
        if (windows.size > 10000) windows.delete(windows.keys().next().value);
      }
      entry.count++;
      return { success: entry.count <= limit };
    },
  };
}

export const memoryLimiters = clock => Object.fromEntries(Object.entries(RATE_LIMITS).map(([name, rule]) => [name, memoryLimiter(rule, clock)]));

export async function sha256hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

// Public leaderboard id: lets the client spot its own row without exposing the private player id.
export async function publicId(player) {
  return (await sha256hex(`ludvig-public:${player}`)).slice(0, 12);
}

export const PLAYER_ID = /^[A-Za-z0-9_-]{16,40}$/;
export const validPlayerId = id => typeof id === 'string' && PLAYER_ID.test(id);

// Names: trimmed, 2–16 characters, control and HTML characters removed, small blocklist.
// Blocked anywhere in the name, even inside other words.
const BLOCKED_ANYWHERE = ['fuck', 'cunt', 'nigg', 'hitler', 'nazi', 'whore', 'porn', 'retard', 'fitta', 'neger'];
// Blocked only as a whole word, so "Grape" or "Peacock" stay allowed.
const BLOCKED_WORDS = ['shit', 'rape', 'slut', 'bitch', 'dick', 'cock', 'pussy', 'kuk', 'hora', 'fag', 'bög', 'admin', 'moderator'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', '$': 's', '!': 'i' };

export function isBlockedName(name) {
  const lower = name.toLowerCase().replace(/[0-9@$!]/g, c => LEET[c] ?? c);
  const flat = lower.replace(/[^\p{L}]/gu, '');
  if (BLOCKED_ANYWHERE.some(word => flat.includes(word))) return true;
  const words = lower.split(/[^\p{L}]+/u);
  return BLOCKED_WORDS.some(word => words.includes(word) || words.includes(`${word}s`));
}

export function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = Array.from(name).length;
  if (length < 2 || length > 16 || isBlockedName(name)) return null;
  return name;
}
