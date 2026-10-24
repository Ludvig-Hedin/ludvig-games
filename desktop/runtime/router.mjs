// Source of the small entry Worker inside Miniflare. The Node proxy tags each request with the game it is for,
// the address the player used and the player's IP. The router hands the request to that game's Worker with the
// player's own address as the URL, so the games' same-origin checks and invite links keep working.
export const ROUTER_SOURCE = `
export default {
  async fetch(request, env) {
    const game = request.headers.get("x-ludvig-game");
    const target = game && env["game_" + game.replace(/-/g, "_")];
    if (!target) return new Response("Unknown game", { status: 404 });
    const origin = request.headers.get("x-ludvig-origin");
    const presentAs = request.headers.get("x-ludvig-present-as");
    const ip = request.headers.get("x-ludvig-ip") || "127.0.0.1";
    const incoming = new URL(request.url);
    const base = presentAs || origin;
    const headers = new Headers(request.headers);
    for (const h of ["x-ludvig-game", "x-ludvig-origin", "x-ludvig-present-as", "x-ludvig-ip"]) headers.delete(h);
    headers.set("CF-Connecting-IP", ip);
    if (presentAs && headers.has("Origin")) headers.set("Origin", presentAs);
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
    const response = await target.fetch(base + incoming.pathname + incoming.search, {
      method: request.method, headers, body, redirect: "manual",
    });
    const location = response.headers.get("Location");
    if (presentAs && location && location.startsWith(presentAs)) {
      const fixed = new Response(response.body, response);
      fixed.headers.set("Location", origin + location.slice(presentAs.length));
      return fixed;
    }
    return response;
  },
};
`;
