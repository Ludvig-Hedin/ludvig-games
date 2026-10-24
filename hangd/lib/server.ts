import { env } from "cloudflare:workers";
import {
  act,
  advance,
  createRoom,
  joinRoom,
  publicRoom,
  type InternalRoom,
} from "./engine";
import type { GameAction, Settings } from "./protocol";

const ROOM_TTL = 12 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "invalid",
  ) {
    super(message);
  }
}
function database() {
  if (!env.DB)
    throw new HttpError(
      "Spelets databas är inte tillgänglig. Försök igen.",
      503,
      "database",
    );
  return env.DB.withSession("first-primary");
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function errorResponse(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string };
  const known = e && (typeof e.code === "string" || error instanceof HttpError);
  if (!known)
    console.error(
      "HANGD request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
  return json(
    {
      error: known ? e.message : "Något gick fel. Försök igen.",
      code: e?.code ?? "server",
    },
    known ? (e.status ?? 400) : 500,
  );
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError("JSON krävs.", 415);
  const origin = request.headers.get("origin");
  if (origin) {
    const host = new URL(request.url).host;
    const requestHost = request.headers.get("host");
    if (![host, requestHost].includes(new URL(origin).host))
      throw new HttpError("Ogiltig avsändare.", 403, "origin");
  }
  if (Number(request.headers.get("content-length") || 0) > 4096)
    throw new HttpError("Meddelandet är för långt.", 413);
  const raw = await request.text();
  if (raw.length > 4096) throw new HttpError("Meddelandet är för långt.", 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError("Ogiltigt meddelande.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new HttpError("Ogiltigt meddelande.");
  return parsed as Record<string, unknown>;
}
export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code))
    throw new HttpError("Rumskoden ska ha sex tecken.", 400, "room_code");
  return code;
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function secret() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function randomCode() {
  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length])
    .join("");
}

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
/**
 * Per-IP limits in the Workers rate-limit binding (not D1), so a rejected
 * request writes nothing. Bindings are missing in plain local dev.
 */
export async function rateLimit(request: Request, limiter: Limiter | undefined) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!limiter || !ip) return;
  if (!(await limiter.limit({ key: ip })).success)
    throw new HttpError(
      "Lite för snabbt. Vänta en stund och försök igen.",
      429,
      "rate_limit",
    );
}
// Global cap on live rooms, so a flood cannot use up the free D1 write budget.
export const MAX_ROOMS = 300;
// A poll refreshes "last seen" at most this often. Presence lasts 20 s.
const HEARTBEAT_WRITE_MS = 12_000;

export async function credentials(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.match(/^Bearer [a-f0-9]{64}$/))
    throw new HttpError("Gå med i rummet igen.", 401, "unauthorized");
  return hash(authorization.slice(7));
}
function authorize(room: InternalRoom, tokenHash: string) {
  const player = room.players.find((p) => p.tokenHash === tokenHash);
  if (!player || player.left)
    throw new HttpError("Gå med i rummet igen.", 401, "unauthorized");
  return player;
}
async function read(code: string): Promise<InternalRoom> {
  const row = await database()
    .prepare("SELECT state,version,expires_at FROM rooms WHERE code = ?")
    .bind(code)
    .first<{ state: string; version: number; expires_at: number }>();
  if (!row || row.expires_at < Date.now())
    throw new HttpError(
      "Rummet finns inte eller har stängt. Kontrollera koden.",
      404,
      "room_not_found",
    );
  const room = JSON.parse(row.state) as InternalRoom;
  room.version = row.version;
  return room;
}
async function update(
  code: string,
  change: (room: InternalRoom, now: number) => boolean,
): Promise<InternalRoom> {
  for (let attempt = 0; attempt < 9; attempt++) {
    const room = await read(code);
    const now = Date.now();
    const expected = room.version;
    if (!change(room, now)) return room;
    room.version = expected + 1;
    room.updatedAt = now;
    const hasPlayers = room.players.some(
      (p) => !p.left && now - p.lastSeen < 5 * 60_000,
    );
    const expiresAt = now + (hasPlayers ? ROOM_TTL : 30 * 60_000);
    const result = await database()
      .prepare(
        "UPDATE rooms SET state=?,version=?,expires_at=? WHERE code=? AND version=?",
      )
      .bind(JSON.stringify(room), room.version, expiresAt, code, expected)
      .run();
    if (result.meta.changes === 1) return room;
    // Re-run the authoritative operation against the winning version, never overwrite it.
  }
  throw new HttpError("Rummet är upptaget. Försök igen.", 409, "conflict");
}
export async function create(request: Request) {
  const input = await body(request);
  await rateLimit(request, env.CREATE_LIMIT);
  const db = database();
  const now0 = Date.now();
  const live = await db
    .prepare("SELECT COUNT(*) AS n FROM rooms WHERE expires_at > ?")
    .bind(now0)
    .first<{ n: number }>();
  if ((live?.n ?? 0) >= MAX_ROOMS)
    throw new HttpError("Det gick inte att skapa rummet. Försök igen.", 503);
  const token = secret();
  const player = {
    id: crypto.randomUUID(),
    nickname: typeof input.nickname === "string" ? input.nickname : "",
    avatar: typeof input.avatar === "number" ? input.avatar : 0,
    tokenHash: await hash(token),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const now = Date.now();
    const room = createRoom(code, player, now);
    if (input.language === "en") room.settings.language = "en";
    const result = await database()
      .prepare(
        "INSERT OR IGNORE INTO rooms(code,state,version,expires_at) VALUES (?,?,?,?)",
      )
      .bind(code, JSON.stringify(room), room.version, now + ROOM_TTL)
      .run();
    if (result.meta.changes === 1) {
      // Bounded housekeeping; writes only when expired rooms exist.
      await db
        .prepare(
          "DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at < ? LIMIT 25)",
        )
        .bind(now)
        .run()
        .catch(() => {});
      return json(
        { room: publicRoom(room, player.id, now), token, playerId: player.id },
        201,
      );
    }
  }
  throw new HttpError("Det gick inte att skapa rummet. Försök igen.", 503);
}
export async function join(request: Request, code: string) {
  const input = await body(request);
  await rateLimit(request, env.JOIN_LIMIT);
  const token = secret();
  const player = {
    id: crypto.randomUUID(),
    nickname: typeof input.nickname === "string" ? input.nickname : "",
    avatar: typeof input.avatar === "number" ? input.avatar : 0,
    tokenHash: await hash(token),
  };
  const room = await update(code, (state, now) => {
    advance(state, now);
    joinRoom(state, player, now);
    return true;
  });
  return json({
    room: publicRoom(room, player.id, Date.now()),
    token,
    playerId: player.id,
  });
}
function parseAction(input: Record<string, unknown>): GameAction {
  const text = (key: string, max: number) => {
    if (typeof input[key] !== "string" || (input[key] as string).length > max)
      throw new HttpError("Ogiltigt meddelande.");
    return input[key] as string;
  };
  switch (input.type) {
    case "start":
    case "next":
    case "rematch":
    case "leave":
    case "heartbeat":
    case "doubleAccept":
      return { type: input.type };
    case "word":
      return { type: "word", word: text("word", 50), clue: text("clue", 100) };
    case "letter":
      return { type: "letter", letter: text("letter", 4) };
    case "solve":
      return { type: "solve", word: text("word", 50) };
    case "chat":
      return { type: "chat", text: text("text", 250) };
    case "typing":
      return { type: "typing", active: input.active === true };
    case "reaction":
      return { type: "reaction", emoji: text("emoji", 12) };
    case "bluffVote":
      if (input.vote !== "truth" && input.vote !== "bluff")
        throw new HttpError("Ogiltig röst.");
      return { type: "bluffVote", vote: input.vote };
    case "sabotage":
      if (
        !["bluff", "panic", "chaos", "fog", "double"].includes(
          String(input.card),
        )
      )
        throw new HttpError("Ogiltigt kort.");
      return {
        type: "sabotage",
        card: input.card as "bluff" | "panic" | "chaos" | "fog" | "double",
        text: typeof input.text === "string" ? text("text", 100) : undefined,
        truth: input.truth === true,
      };
    case "settings": {
      if (
        !input.settings ||
        typeof input.settings !== "object" ||
        Array.isArray(input.settings)
      )
        throw new HttpError("Ogiltiga inställningar.");
      const values = input.settings as Record<string, unknown>;
      const settings: Partial<Settings> = {};
      if ("rounds" in values) {
        if (
          !Number.isInteger(values.rounds) ||
          Number(values.rounds) < 2 ||
          Number(values.rounds) > 20
        )
          throw new HttpError("Välj 2–20 rundor.");
        settings.rounds = Number(values.rounds);
      }
      if ("roundSeconds" in values) {
        if (![30, 45, 60, 75, 90, 120].includes(Number(values.roundSeconds)))
          throw new HttpError("Ogiltig rundtid.");
        settings.roundSeconds = Number(values.roundSeconds);
      }
      if ("language" in values) {
        if (values.language !== "sv" && values.language !== "en")
          throw new HttpError("Ogiltigt språk.");
        settings.language = values.language;
      }
      if ("difficulty" in values) {
        if (!["easy", "normal", "hard"].includes(String(values.difficulty)))
          throw new HttpError("Ogiltig svårighet.");
        settings.difficulty = values.difficulty as Settings["difficulty"];
      }
      if ("sabotage" in values) {
        if (typeof values.sabotage !== "boolean")
          throw new HttpError("Ogiltig inställning.");
        settings.sabotage = values.sabotage;
      }
      return { type: "settings", settings };
    }
    default:
      throw new HttpError("Okänd handling.");
  }
}
export async function command(request: Request, code: string) {
  const tokenHash = await credentials(request);
  const input = parseAction(await body(request));
  // Shared IP budget allows 10 friends on one Wi-Fi. Per-player gameplay limits are in the engine.
  await rateLimit(request, env.ACTION_LIMIT);
  let playerId = "";
  const room = await update(code, (state, now) => {
    const player = authorize(state, tokenHash);
    playerId = player.id;
    act(state, playerId, input, now);
    return true;
  });
  if (input.type === "leave") return json({ left: true });
  return json({ room: publicRoom(room, playerId, Date.now()) });
}
export async function snapshot(
  code: string,
  tokenHash: string,
  heartbeat = false,
) {
  let playerId = "";
  const room = await update(code, (state, now) => {
    const player = authorize(state, tokenHash);
    playerId = player.id;
    if (heartbeat && now - player.lastSeen > HEARTBEAT_WRITE_MS) {
      act(state, player.id, { type: "heartbeat" }, now);
      return true;
    }
    return advance(state, now);
  });
  return publicRoom(room, playerId, Date.now());
}
