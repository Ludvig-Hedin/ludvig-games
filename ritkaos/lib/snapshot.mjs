/**
 * Saves and restores a Game, so the Cloudflare Lobby can hibernate between
 * messages without losing rooms. Maps and Sets are tagged; players are stored
 * once (in sessions) and rooms keep only their ids. Live sockets, rate-limit
 * windows and connection flags are not saved: the host rebinds sockets on wake.
 */
const replacer = function (key, value) {
  if (key === 'peer' || key === 'limits') return undefined;
  if (key === 'players' && value instanceof Map) return { $p: [...value.keys()] };
  if (value instanceof Map) return { $m: [...value.entries()] };
  if (value instanceof Set) return { $s: [...value] };
  return value;
};
const reviver = (key, value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(value.$m) && Object.keys(value).length === 1) return new Map(value.$m);
    if (Array.isArray(value.$s) && Object.keys(value).length === 1) return new Set(value.$s);
  }
  return value;
};

/** True when nothing is worth saving (no rooms, no one in one). */
export function isEmpty(game) { return game.rooms.size === 0; }

export function snapshot(game) {
  // Only sessions that matter after a wake: someone connected or in a room.
  const sessions = [...game.sessions.values()].filter(p => p.connected || p.room);
  return JSON.stringify({ v: 1, sessions, rooms: [...game.rooms.values()] }, replacer);
}

/** Restores into an empty Game. Everyone starts disconnected until their socket is rebound. */
export function restore(game, text, now = Date.now()) {
  const data = JSON.parse(text, reviver);
  if (!data || data.v !== 1) return false;
  const byId = new Map();
  for (const p of data.sessions) {
    if (p.connected) p.disconnectedAt = now;
    p.peer = null; p.connected = false; p.limits = new Map(); p.lobbyKey = '';
    if (!(p.owned instanceof Set)) p.owned = new Set();
    game.sessions.set(p.token, p); byId.set(p.id, p);
  }
  for (const r of data.rooms) {
    const ids = Array.isArray(r.players?.$p) ? r.players.$p : [];
    r.players = new Map(ids.filter(id => byId.has(id)).map(id => [id, byId.get(id)]));
    if (!r.players.size) continue;
    game.rooms.set(r.code, r);
  }
  for (const p of game.sessions.values()) if (p.room && !game.rooms.has(p.room)) p.room = null;
  return true;
}
