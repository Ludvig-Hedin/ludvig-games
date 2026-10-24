# Multiplayer

Gravity Arena uses an actual server and shared Cloudflare D1 database. Clients send only a stack number and their last observed room revision. The server owns the board, turn, result, scores, and rematch votes. It applies the same rules engine as the single-player game. An atomic UPDATE with a version condition makes concurrent requests safe: at most one operation for a revision can succeed. Stale clients receive HTTP 409 with the latest public board.

## Transport and reconnecting

The client polls the authoritative room every 1.5 s while the room is on screen and the tab is visible, and pauses otherwise. Requests never overlap. Network failures trigger exponential retry up to 15 seconds. This is near-real-time turn-based synchronization, not a WebSocket transport; a remote move normally appears within one polling interval plus network time. Room state persists across worker restarts and disconnected clients. A stored room token restores the same seat after refresh.

Room codes use six random characters. Player tokens use 48 cryptographically random characters and are hashed with SHA-256 before storage. Public responses contain neither player tokens nor their hashes. A code grants viewing and one free guest seat; a player token grants authority for that seat. Tokens belong in device storage and the Authorization header, never invite URLs. Spectators are read-only and cannot vote on rematches.

Presence is a separate timestamp, so heartbeat requests never invalidate pending moves. A player appears disconnected after 20 seconds without polling. Leaving marks them disconnected but reserves their seat for reconnection. When the other seat has shown as disconnected for 15 s, a seated player gets "Back to menu" and "Play computer"; both send leave and drop the stored session, so the room ends for them. Rooms expire after 24 hours without an authenticated player heartbeat or a game-changing action. Creation removes a bounded batch of expired rooms.

## API

| Request | Purpose |
| --- | --- |
| POST /api/rooms with {name,variant,bestOf} | Create a room; receive host token and seat 1. |
| GET /api/rooms/:code with optional Bearer token | Fetch room; authenticated players refresh presence. |
| POST /api/rooms/:code with {action:"join",name,spectate} | Claim seat 2 or watch as spectator. |
| POST with {action:"move",stack,version} and Bearer token | Validate and apply a move. |
| POST with {action:"ready",version} and Bearer token | Vote for the next round or a rematch. |
| POST with {action:"leave"} and Bearer token | Mark this seat disconnected without destroying it. |
| POST with {action:"reconnect"} and Bearer token | Restore player presence and fetch the current board. |

Responses use {code,seat,room,token?}. Only creation and a successful new seat claim include a token. room.players contains two {name,connected} entries or null for an unoccupied seat. room.game.winner is null during play, 0 for a draw, or 1/2 for a winner. room.status is waiting, playing, or finished. Finished means the current round is finished. room.matchWinner differentiates a concluded series from a round within a series.

For best-of-three and best-of-five, the first player to two or three round wins wins the match. Drawn rounds do not award points. In a single game, a draw ends the match. Both players must ready up to continue, and the starting player alternates each round. A completed-series rematch resets the scores; continuing a series preserves them.

## Hosting

Hosted as the public Cloudflare Worker `gravity-arena` at https://gravity-arena.ludvighedin.com/. The game has no accounts; a room code is the only access control for a room.
