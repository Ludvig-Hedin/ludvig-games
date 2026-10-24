
declare namespace Cloudflare {
  interface Env {
    ROOMS: DurableObjectNamespace<import("./lib/game/room-do").AirRoom>;
    REGISTRY: DurableObjectNamespace<import("./lib/game/registry-do").RoomRegistry>;
    CREATE_LIMIT?: RateLimit;
    JOIN_LIMIT?: RateLimit;
    ROOM_CODE_KEY?: string;
  }
}
