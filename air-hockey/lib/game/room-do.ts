import { DurableObject } from "cloudflare:workers";
import {
  MESSAGES, ROOM_LIFETIME, SeatError, createSignalRoom, expired, hostOf, leaveSeat, publicSeats, returnToSeat,
  seatOf, takeSeat, type Side, type SignalRoom,
} from "./signal";

// Signaling-only room (24 Oct 2026, docs/p2p-online.md in the hub repo).
// One SQLite-backed Durable Object per room code. It keeps two seats, sends
// join and leave events, and relays WebRTC offers, answers and ICE candidates.
// Gameplay goes device to device over data channels and never reaches here.
// Hibernation API: idle sockets cost nothing and "ping" is answered by the
// runtime without waking the object. Hard caps: 6 sockets, 20 messages per
// 10 s per socket (then closed), a fixed 3-hour life with one alarm, and at
// most 200 active rooms across the game (registry-do.ts). Each message here is a billed request,
// so clients only talk to the room while connecting, starting and leaving.

const MAX_MESSAGE = 8192;
const MAX_SOCKETS = 6;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 20;
const REPLACED_CLOSE = 4000;
const TERMINAL_CLOSE = 4004;
const ABUSE_CLOSE = 4008;

type Attachment = { side: Side | null; window: number; count: number };

export class AirRoom extends DurableObject<Cloudflare.Env> {
  private room: SignalRoom | null = null;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get<SignalRoom>("room")) ?? null; });
  }

  /** Called by the Worker for POST /api/rooms. Returns null if the code is taken. */
  async create(code: string, name: unknown, meta: Record<string, unknown>) {
    const now = Date.now();
    if (this.room && !expired(this.room, now)) return null;
    await this.ctx.storage.deleteAll();
    const { room, token } = createSignalRoom(code, name, meta, now);
    this.room = room;
    await this.save();
    await this.ctx.storage.setAlarm(room.createdAt + ROOM_LIFETIME);
    return { code, token, side: 0, host: 0, seats: publicSeats(room, side => side === 0), meta };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket.", { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return new Response("Too many connections.", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ side: null, window: Date.now(), count: 0 } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE) return this.close(ws, ABUSE_CLOSE, "Message too large");
    const now = Date.now();
    const att = this.attachment(ws);
    if (now - att.window > RATE_WINDOW_MS) { att.window = now; att.count = 0; }
    if (++att.count > RATE_LIMIT) return this.close(ws, ABUSE_CLOSE, "Too many messages");
    ws.serializeAttachment(att);
    let data: any;
    try { data = JSON.parse(message); } catch { return; }
    const room = this.room;
    if (!room || expired(room, now)) return this.fail(ws, 404, MESSAGES.notFound);

    if (data?.t === "hello" || data?.t === "join") {
      let side: Side, token: string;
      if (data.t === "hello") {
        const found = seatOf(room, data.token);
        if (found === null) return this.fail(ws, 401, MESSAGES.session);
        side = found; token = room.seats[side]!.token;
        returnToSeat(room, side, now);
      } else {
        try { ({ side, token } = takeSeat(room, data.name, now)); }
        catch (error) { return this.fail(ws, error instanceof SeatError ? error.status : 400, error instanceof Error ? error.message : MESSAGES.full); }
      }
      for (const other of this.ctx.getWebSockets()) if (other !== ws && this.attachment(other).side === side) this.close(other, REPLACED_CLOSE, "Opened elsewhere");
      att.side = side;
      ws.serializeAttachment(att);
      await this.save();
      this.send(ws, { t: "welcome", code: room.code, token, side, ...this.peers() });
      this.broadcastPeers({ skip: ws });
      return;
    }

    if (att.side === null) return this.fail(ws, 401, MESSAGES.session);
    if (data?.t === "sig") {
      // Relay WebRTC setup to the other seat only. Never gameplay.
      const to = att.side === 0 ? 1 : 0;
      for (const other of this.ctx.getWebSockets()) if (this.attachment(other).side === to) this.send(other, { t: "sig", from: att.side, data: data.data });
    } else if (data?.t === "leave") {
      leaveSeat(room, att.side, now);
      this.promote(now);
      await this.save();
      this.close(ws, 1000, "Left the room");
      this.broadcastPeers();
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, "Closed"); } catch { /* Already closed. */ }
    if (this.attachment(ws).side !== null) this.broadcastPeers({ gone: ws });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    if (this.attachment(ws).side !== null) this.broadcastPeers({ gone: ws });
  }

  /** Fires once at the room's fixed end time: close every socket and forget the room. */
  async alarm(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) this.fail(ws, 404, MESSAGES.notFound);
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  /** Host handover: if the first seat left, the remaining player becomes seat 0 (the host). */
  private promote(now: number) {
    const room = this.room!;
    const [a, b] = room.seats;
    if (a?.left && b && !b.left) {
      room.seats = [b, a];
      room.updatedAt = now;
      for (const ws of this.ctx.getWebSockets()) {
        const att = this.attachment(ws);
        if (att.side === null) continue;
        att.side = att.side === 0 ? 1 : 0;
        ws.serializeAttachment(att);
      }
    }
  }

  private connected = (side: Side, except?: WebSocket) => this.ctx.getWebSockets().some(ws => ws !== except && ws.readyState === WebSocket.OPEN && this.attachment(ws).side === side);

  private peers(except?: WebSocket) {
    const room = this.room!;
    const connected = (side: Side) => this.connected(side, except);
    return { host: hostOf(room, connected), seats: publicSeats(room, connected), meta: room.meta };
  }

  /** skip: already told (it just got its welcome). gone: a socket that is closing. */
  private broadcastPeers({ skip, gone }: { skip?: WebSocket; gone?: WebSocket } = {}) {
    if (!this.room) return;
    const peers = this.peers(gone);
    for (const ws of this.ctx.getWebSockets()) {
      const side = this.attachment(ws).side;
      if (ws === skip || ws === gone || side === null || ws.readyState !== WebSocket.OPEN) continue;
      this.send(ws, { t: "peers", side, ...peers });
    }
  }

  private attachment(ws: WebSocket): Attachment {
    try { return (ws.deserializeAttachment() as Attachment | null) ?? { side: null, window: Date.now(), count: 0 }; }
    catch { return { side: null, window: Date.now(), count: 0 }; }
  }

  private fail(ws: WebSocket, status: number, message: string) {
    this.send(ws, { t: "err", status, message });
    this.close(ws, TERMINAL_CLOSE, "Room unavailable");
  }

  private close(ws: WebSocket, code: number, reason: string) {
    try { ws.serializeAttachment({ side: null, window: 0, count: 0 } satisfies Attachment); } catch { /* Closed. */ }
    try { ws.close(code, reason); } catch { /* Already closed. */ }
  }

  private send(ws: WebSocket, message: unknown) {
    try { ws.send(JSON.stringify(message)); } catch { /* The close handler cleans up. */ }
  }

  private async save() { if (this.room) await this.ctx.storage.put("room", this.room); }
}
