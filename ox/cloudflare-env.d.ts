declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CREATE_LIMIT?: RateLimit;
    JOIN_LIMIT?: RateLimit;
  }
}
