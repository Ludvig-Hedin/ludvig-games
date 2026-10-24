import type { PublicRoom, RoomEnvelope } from "./rooms";

export type { PublicRoom, RoomEnvelope } from "./rooms";
export type RoomView = PublicRoom;

export class NetworkError extends Error {
  status: number;
  room?: PublicRoom;
  constructor(message: string, status = 0, room?: PublicRoom) {
    super(message);
    this.name = "NetworkError";
    this.status = status;
    this.room = room;
  }
}

async function request(path: string, options: {token?: string; data?: Record<string, unknown>; signal?: AbortSignal} = {}): Promise<RoomEnvelope> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, {once: true});
  try {
    const response = await fetch(path, {
      method: options.data ? "POST" : "GET",
      headers: {
        ...(options.data ? {"Content-Type": "application/json"} : {}),
        ...(options.token ? {Authorization: `Bearer ${options.token}`} : {}),
      },
      body: options.data ? JSON.stringify(options.data) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    // Platform error pages (429, 503, daily limit 1027) are HTML, not JSON.
    const data = await response.json().catch(() => ({})) as RoomEnvelope & {error?: string};
    if (!response.ok) throw new NetworkError(data.error || "Could not connect to the room.", response.status, data.room);
    return data;
  } catch (error) {
    if (error instanceof NetworkError) throw error;
    if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    throw new NetworkError(controller.signal.aborted ? "The room server took too long. Reconnecting…" : "Connection interrupted. Reconnecting…");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

function roomPath(code: string): string {
  return `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function createRoom(options: {name: string; variant: "3d" | "classic"; bestOf: 1 | 3 | 5}): Promise<RoomEnvelope> {
  return request("/api/rooms", {data: options});
}

export function joinRoom(code: string, name: string, spectate = false): Promise<RoomEnvelope> {
  return request(roomPath(code), {data: {action: "join", name, spectate}});
}

export function getRoom(code: string, token?: string, signal?: AbortSignal): Promise<RoomEnvelope> {
  return request(roomPath(code), {token, signal});
}

export async function actRoom(code: string, token: string, action: "move" | "ready" | "leave" | "reconnect", payload: Record<string, unknown> = {}): Promise<RoomEnvelope> {
  try {
    return await request(roomPath(code), {token, data: {...payload, action}});
  } catch (error) {
    // Readying is idempotent. Two people pressing rematch together should not
    // require a second click when the other vote advances the room revision.
    if (action === "ready" && error instanceof NetworkError && error.status === 409 && error.room) {
      if (error.room.status !== "finished") return getRoom(code, token);
      return request(roomPath(code), {token, data: {...payload, action, version: error.room.version}});
    }
    throw error;
  }
}

/** Non-overlapping polling. Holds no game authority; the D1 revision is authoritative. */
export function watchRoom(code: string, token: string | undefined, onRoom: (room: RoomEnvelope) => void, onError: (error: NetworkError) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | null = null;
  let failures = 0;
  const tick = async () => {
    if (stopped) return;
    controller = new AbortController();
    try {
      const value = await getRoom(code, token, controller.signal);
      if (stopped) return;
      failures = 0;
      onRoom(value);
    } catch (error) {
      if (stopped) return;
      failures++;
      onError(error instanceof NetworkError ? error : new NetworkError("Reconnecting…"));
    } finally {
      if (!stopped) {
        const background = typeof document !== "undefined" && document.hidden;
        // Turn-based: at most one poll per 1.5 s (Workers Free budget), 3 s in the background, backing off to 15 s while it fails.
        timer = setTimeout(tick, failures ? Math.min(15_000, 1500 * 2 ** Math.min(failures, 4)) : background ? 3000 : 1500);
      }
    }
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}
