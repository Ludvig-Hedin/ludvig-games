// Pure seat rules for a signaling-only room. The Durable Object keeps two
// seats, their names and secrets, and relays WebRTC setup between them.
// Gameplay never passes through the server: the host's browser runs the
// match and talks to the guest over data channels.

/** Hard lifetime from creation. The room alarm fires once at the end and never reschedules. */
export const ROOM_LIFETIME = 3 * 60 * 60 * 1000;

export type Side = 0 | 1;
export type Seat = { name: string; token: string; left: boolean; joinedAt: number };
export type SignalRoom = { code: string; seats: [Seat | null, Seat | null]; meta: Record<string, unknown>; createdAt: number; updatedAt: number };
export type PublicSeat = { name: string; present: boolean; connected: boolean; left: boolean } | null;

// Hoop Rush keeps its own wording for these.
export const MESSAGES = {
  notFound: "No room with that code.",
  full: "That room is full.",
  session: "That room session has ended.",
} as const;

export class SeatError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const cleanName = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 18);
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, "0")).join("");
export const expired = (room: SignalRoom, now: number) => now - room.createdAt > ROOM_LIFETIME;

export function createSignalRoom(code: string, name: unknown, meta: Record<string, unknown>, now: number) {
  const host: Seat = { name: cleanName(name), token: token(), left: false, joinedAt: now };
  const room: SignalRoom = { code, seats: [host, null], meta, createdAt: now, updatedAt: now };
  return { room, token: host.token };
}

export function seatOf(room: SignalRoom, secret: unknown): Side | null {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/.test(secret)) return null;
  const side = room.seats.findIndex(s => s?.token === secret);
  return side < 0 ? null : side as Side;
}

/** Take a free seat, or the seat of a player who explicitly left. */
export function takeSeat(room: SignalRoom, name: unknown, now: number): { side: Side; token: string } {
  let side = room.seats.findIndex(s => !s);
  if (side < 0) side = room.seats.findIndex(s => s?.left);
  if (side < 0) throw new SeatError(MESSAGES.full, 409);
  const seat: Seat = { name: cleanName(name), token: token(), left: false, joinedAt: now };
  room.seats[side] = seat;
  room.updatedAt = now;
  return { side: side as Side, token: seat.token };
}

export function returnToSeat(room: SignalRoom, side: Side, now: number) {
  const seat = room.seats[side];
  if (seat?.left) { seat.left = false; room.updatedAt = now; }
}

export function leaveSeat(room: SignalRoom, side: Side, now: number) {
  const seat = room.seats[side];
  if (!seat) return;
  seat.left = true;
  room.updatedAt = now;
}

/** The host is the present player who joined first. */
export function hostOf(room: SignalRoom, connected: (side: Side) => boolean): Side | null {
  let best: Side | null = null;
  room.seats.forEach((seat, side) => {
    if (!seat || seat.left || !connected(side as Side)) return;
    if (best === null || seat.joinedAt < room.seats[best]!.joinedAt) best = side as Side;
  });
  return best;
}

export function publicSeats(room: SignalRoom, connected: (side: Side) => boolean): [PublicSeat, PublicSeat] {
  return room.seats.map((seat, side) => seat ? { name: seat.name, present: !seat.left, connected: !seat.left && connected(side as Side), left: seat.left } : null) as [PublicSeat, PublicSeat];
}
