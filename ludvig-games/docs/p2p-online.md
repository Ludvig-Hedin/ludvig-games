# Direct-connection online play (24 October 2026)

Owner decision (Ludvig, 24 Oct): online play must put as little traffic on the server as possible, and it should work on most networks and devices. Players connect device to device. The server only pairs them. He wants more online games, not fewer.

## Why

The Cloudflare account has a budget guard (`~/Programming/personal/mail/apps/budget-guard`). It switches off every Worker on the account, mail included, when the current and previous clock hour together use 1% of a monthly allowance. For Durable Object requests that is **10,000 requests in about two hours**, and for Worker requests it is 100,000. Each WebSocket message into a Durable Object counts as one request. On 23 Oct, test matches of Air Hockey (4,633 in one hour) and Table Tennis (15,651 the next hour) tripped it, and every site went dark for five hours.

Do not change the guard. It belongs to another project.

## Design

- **Signaling only on the server.** The existing Durable Object room keeps doing what it does well: quick match, private codes, invite links, the peer list, host (the oldest peer), meta, and join and leave events. It also relays WebRTC offers, answers and ICE candidates. It must not relay gameplay.
- **Gameplay over WebRTC data channels.** Use a full mesh, so every pair of peers has one `RTCPeerConnection`. The peer with the lower id makes the offer. Use two channels: `u` (unordered, `maxRetransmits: 0`) for frequent state, and `r` (ordered, reliable) for events such as goals, scores, restarts and chat. If a game only has one send path, route small, rare messages over `r` and frequent ones over `u`. Where the message type tells you which is which, use that.
- **ICE servers:** `stun:stun.cloudflare.com:3478` and `stun:stun.l.google.com:19302`, with trickle ICE. **No TURN** (owner, 24 Oct: nothing that can cost money). Players on strict networks see "Couldn't connect on this network."
- **Hard caps:** a global cap on active rooms through the Lobby, max peers per room, a per-peer signaling rate limit with close on abuse, hibernation, and no alarms that reschedule forever.
- **No gameplay relay fallback** through the Durable Object. If a peer cannot connect within about 10 seconds, show the game's existing "couldn't connect" or "opponent left" state with a short reason: "Couldn't connect on this network." Do not fall back to relaying through the server.
- **Server hygiene:** use the hibernation API (`ctx.acceptWebSocket`, `webSocketMessage`) and `setWebSocketAutoResponse` for ping/pong, so idle sockets cost nothing and pings never wake the object. Clients ping no more often than every 30 seconds. Rate-limit signaling messages per peer (for example 20 per 10 s) and close abusive sockets. After the data channels are open, the signaling socket must be silent apart from auto-response pings and join, leave, host and meta events.
- **Leave and host handover** still come from the server's join and leave events. A data channel closing with no `leave` event within about 5 seconds is treated as a leave.
- **Budget for one two-player match lasting an hour:** under 100 Durable Object requests and under 50 Worker requests in total. Measure it in a local run by counting the messages that reach the room server, and report the number.

## Testing

- Local first. For the hub, use `scripts/serve.ts` on port 4317. Two browser contexts on the same machine connect over host candidates, which proves the signaling and the channel logic. Check that a match, a leave, host handover and the wrong-code screen still work. Count server messages as above.
- Live tests are allowed only after the direct-connection version is deployed. Keep each one short (under 5 minutes). Afterwards, read the hourly Durable Object request count (`bun $TMPDIR/bgq/q.ts` pattern, or ask the main agent) and confirm it stayed small.
- Do not test with a deliberately broken network.
