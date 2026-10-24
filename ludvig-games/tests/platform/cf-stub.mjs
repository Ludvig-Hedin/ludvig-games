/** Stand-in for the `cloudflare:workers` module so worker/index.mjs loads under Node. */
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
