# BREACH multiplayer

## Play online

1. Open the game in a current browser. Choose **Multiplayer → Create room**.
2. Send the six-digit room code (or the game's invite link) to a friend.
3. Your friend opens the same game, chooses **Join room**, and enters the code.
4. Keep the host's game tab open and in the foreground. The host runs the match and its bots. Up to four humans can join one room.

The static browser version uses the included PeerJS 1.5.5 client and PeerJS's public signaling service. After the handshake, match traffic travels over WebRTC data channels between guests and the host. There is no account or paid API key required by the game. Any sharing restrictions on the website still apply to visitors.

The host owns movement validation, combat, bots, scoring, and match state. This is a small private-room game, not a dedicated competitive server with anti-cheat or host migration. If the host closes the game, everyone receives a room-closed message and can create a new match.

## Play on the same Wi-Fi

Install Node.js 20 or newer. Unzip the game, open a terminal in its folder, and run:

```sh
npm install
npm start
```

Open `http://localhost:8080` on the computer running the server. The terminal also prints its local network address, such as `http://192.168.1.20:8080`. Open that address on phones or other computers on the same Wi-Fi. Create a room and share its code.

The included server serves the game and selects the WebSocket relay automatically. No public signaling service, STUN server, or internet connection is needed for LAN multiplayer after dependencies have been installed. Allow Node through your firewall when prompted. A guest Wi-Fi network that isolates devices can prevent access; connect all players to a network that allows them to reach the host.

To choose another port:

```sh
PORT=8081 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=8081
npm start
```

## Internet relay deployment

The Node server can be hosted on a service that supports persistent WebSockets. Serve it over HTTPS/WSS for players on the internet. Static-only hosting cannot run `server.mjs`.

The server automatically selects its same-origin relay for the page it serves. To use a separate relay from a static game URL, add a URL-encoded `relay` query parameter:

```text
https://your-game.example/?relay=wss%3A%2F%2Fyour-relay.example%2Fsignal
```

Set the relay's `ALLOWED_ORIGIN` environment variable to the game origin (scheme and hostname, without a trailing slash), for example `https://your-game.example`. Multiple allowed origins can be comma-separated. The server accepts its own origin by default and rejects unrelated browser origins.

`?relay=same` explicitly selects `/signal` on the current origin. `?relay=peer` explicitly selects WebRTC. All room participants must use the same transport and relay server.

## Connection limits

- Direct WebRTC uses public STUN servers; no paid TURN relay credentials are included. Restrictive corporate networks and some cellular/symmetric NAT combinations may prevent a direct connection. Use the included relay in that case.
- The game times out failed connections and shows an actionable error. A room code alone does not mean a connection succeeded.
- Phones can suspend a background tab. Keep the host visible; use a laptop or desktop as host for a steadier match.
- The six-digit code is an invitation convenience, not a password. Use this for casual private matches; do not send sensitive data through the game.
- The relay limits rooms to four humans, caps message sizes and rates, handles disconnects, and validates forwarding permissions. Its default cap is 100 rooms, and rooms live only in memory.

## Transport API

`dist/js/network.js` exports `Multiplayer`:

```js
const multiplayer = new Multiplayer({
  onStatus: ({ state, message }) => {},
  onPeerJoin: ({ id, name }) => {},
  onPeerLeave: ({ id, name }) => {},
  onMessage: (data, fromId) => {},
  onDisconnect: reason => {},
});

const { code, id } = await multiplayer.host('Operator');
// Or: await multiplayer.join('123456', 'Operator');
multiplayer.send({ type: 'snapshot', state });  // host broadcasts; guest sends to host
multiplayer.send({ type: 'welcome', state }, guestId); // host targets one guest
multiplayer.close();
```

Properties: `isHost`, `localId`, `roomCode`, `name`, `peers` (a Map excluding self), `connected`, `transport` (`webrtc` or `relay`), and `ping` (milliseconds). Joining and leaving callbacks use objects, not bare IDs. Callbacks run after the remote player has completed the transport handshake. Outgoing payloads must be JSON-serializable and under 64 KiB.

## Dependencies and references

- PeerJS 1.5.5, MIT: https://github.com/peers/peerjs
- PeerJS API: https://peerjs.com/client/api/peer
- Data connections: https://peerjs.com/client/api/data-connection
- Network caveats: https://peerjs.com/client/faq
- `ws`, MIT: https://github.com/websockets/ws
