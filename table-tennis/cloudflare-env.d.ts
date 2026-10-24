declare namespace Cloudflare {
  interface Env {
    ROOMS: DurableObjectNamespace<import("./src/server/room-do").TableRoom>;
    REGISTRY: DurableObjectNamespace<import("./src/server/registry-do").RoomRegistry>;
    CREATE_LIMIT?: RateLimit;
    JOIN_LIMIT?: RateLimit;
    ROOM_CODE_KEY?: string;
  }
}
