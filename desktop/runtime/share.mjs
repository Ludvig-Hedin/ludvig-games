// Shared rooms on one network (owner report 24 Oct 2026: two Macs in Horde landed in different lobbies).
// Every Mac with the app runs its own room server, so quick match and room codes only met players on the same
// Mac. Now the Macs on a network agree on one of them, the one whose app has run longest, and the others pass
// their room traffic (and only that: pages, scores and records stay on each Mac) to it.

/** Requests that belong to rooms: the hub's room service, the separate games' APIs and Ritkaos' socket. */
export function sharedPath(entry, kind, pathname) {
  if (kind === "node") return pathname === "/ws" || pathname === "/api/rooms";
  if (entry.id === "hub") return pathname.startsWith("/mp/") || pathname.startsWith("/api/mp/");
  return pathname.startsWith("/api/");
}

/** The Mac that holds the rooms: the oldest running app of this version, this one included. Every Mac sees the
    same announcements, so they all pick the same one. Returns null when it is this Mac. */
export function pickRoomHost(self, peers) {
  const candidates = [self, ...peers.filter((p) => p.version === self.version && Number.isFinite(p.started))];
  candidates.sort((a, b) => a.started - b.started || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const leader = candidates[0];
  return leader.id === self.id ? null : leader;
}
