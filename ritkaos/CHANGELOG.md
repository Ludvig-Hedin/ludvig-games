# Changelog

## 2026-10-24

- Ready for the games' Workers Free account (not deployed). `wrangler.jsonc` has no route, custom domain or account id; workers.dev on, preview URLs and logs off; one fresh `v1` migration with the SQLite-backed `Lobby` class.
- Static first: the client, `/api/connection` and a static `404.html` (same "Finns inte" text) are assets, so page views and unknown paths never run the Worker. The Worker runs only for `/ws`, `/api/rooms`, `/api/store` and `/health`.
- The Lobby Durable Object hibernates: sockets use `ctx.acceptWebSocket`, a plain `ping` gets `pong` from the runtime without waking it, and the 250 ms tick runs only while a round, an open-match countdown, a vote or a dropped player needs it. When quiet it saves rooms to storage (`lib/snapshot.mjs`) and restores them on wake, so players keep their room. The network salt is stored too, so "visible on my network" survives a wake.
- An open match where nobody does anything for 10 minutes pauses (existing "paused" line) instead of looping on its own.
- Per-IP limits with the Workers rate-limit binding: sockets and room lists in the Worker before the Lobby wakes, and create, join and quick match in the Lobby (existing "slow down" message). The 60-room and 250-socket caps stay.
- Client: the 12 s keep-alive is a plain `ping` outside rounds; the room list is pushed while connected and polled every 15 s only while offline; reconnects back off to 30 s after repeated failures. The existing connection banner covers 429, 503 and the daily limit.
- `npm run dev:worker` runs the Cloudflare Worker locally (wrangler 4.152.0; the compatibility date needs a recent wrangler). `npm start` still runs the Node server.
