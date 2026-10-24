// Signed room codes (24 Oct 2026). Six characters as before: four random and
// two from an HMAC of those four. The Worker checks the signature itself, so a
// mistyped or made-up code is turned away before any Durable Object wakes and
// nothing is written. Only about 1 in 1,024 random guesses passes this check.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FALLBACK_KEY = "ca05eb02e7b0fd2d5cd810b66d93f28d67fedc0a4ba6f3ab";

const keyOf = (env: { ROOM_CODE_KEY?: string }) => env.ROOM_CODE_KEY || FALLBACK_KEY;

async function signature(key: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
  return CODE_ALPHABET[sig[0] % 32] + CODE_ALPHABET[sig[1] % 32];
}

export async function mintCode(env: { ROOM_CODE_KEY?: string }): Promise<string> {
  const body = Array.from(crypto.getRandomValues(new Uint8Array(4)), v => CODE_ALPHABET[v % 32]).join("");
  return body + await signature(keyOf(env), body);
}

export async function codeIsSigned(code: string, env: { ROOM_CODE_KEY?: string }): Promise<boolean> {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return false;
  return (await signature(keyOf(env), code.slice(0, 4))) === code.slice(4);
}

/** Answer a WebSocket upgrade from the Worker with a plain error, without waking a room. */
export function rejectSocket(message: string, status = 404): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ t: "err", status, message }));
  server.close(4004, "Room unavailable");
  return new Response(null, { status: 101, webSocket: client });
}
