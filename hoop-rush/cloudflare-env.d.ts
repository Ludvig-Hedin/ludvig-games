declare namespace Cloudflare {
  interface Env {
    ROOMS: DurableObjectNamespace<import("./lib/arena-room").HoopRoom>;
    REGISTRY: DurableObjectNamespace<import("./lib/registry-do").RoomRegistry>;
    CREATE_LIMIT?: RateLimit;
    JOIN_LIMIT?: RateLimit;
    ROOM_CODE_KEY?: string;
  }
}
