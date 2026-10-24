import { DurableObject } from "cloudflare:workers";

// Global cap on active rooms (owner zero-cost rule, 24 Oct 2026). One instance
// ("registry") keeps room codes with their fixed end time. A new room is only
// created while fewer than MAX_ROOMS are active. No alarms: old entries are
// pruned whenever a room is reserved.

export const MAX_ROOMS = 200;

export class RoomRegistry extends DurableObject<Cloudflare.Env> {
  private rooms: Record<string, number> | null = null;

  async reserve(code: string, until: number): Promise<boolean> {
    const now = Date.now();
    this.rooms ??= (await this.ctx.storage.get<Record<string, number>>("rooms")) ?? {};
    for (const [key, end] of Object.entries(this.rooms)) if (end <= now) delete this.rooms[key];
    // A rejected request writes nothing.
    if (Object.keys(this.rooms).length >= MAX_ROOMS) return false;
    this.rooms[code] = until;
    await this.ctx.storage.put("rooms", this.rooms);
    return true;
  }
}
