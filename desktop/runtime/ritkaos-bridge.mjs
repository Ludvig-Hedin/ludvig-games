// Federated rooms receive short-lived operator proofs, never a buyer's reusable key.
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sensitive = value => typeof value === "string" && (UUID.test(value.trim()) || /^RK/i.test(value));
const nativeKeys = values => [...new Set((Array.isArray(values) ? values : []).slice(0, 20)
  .filter(value => typeof value === "string" && UUID.test(value.trim())).map(value => value.trim().toLowerCase()))];
const privileged = new Set(["settings", "start", "stroke.begin"]);
const loopback = value => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value);

export function maySubmitCredentials(req, port, requireOrigin = true) {
  const host = req.headers.host;
  return loopback(req.socket.remoteAddress)
    && [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)
    && (req.headers.origin ? req.headers.origin === `http://${host}` : !requireOrigin);
}

function expiry(proof) {
  try {
    const value = JSON.parse(Buffer.from(proof.split(".")[0], "base64url").toString("utf8"));
    return Number.isSafeInteger(value.expiresAt) ? value.expiresAt : 0;
  } catch { return 0; }
}

function packet(value) {
  const p = typeof value === "string" ? JSON.parse(value) : value;
  if (!p || typeof p !== "object" || Array.isArray(p) || typeof p.type !== "string"
      || p.type.length > 40 || (p.data !== undefined && (!p.data || typeof p.data !== "object" || Array.isArray(p.data)))) throw new Error("invalid-packet");
  return p;
}

function hasCredentialField(value, depth = 0) {
  if (depth > 12) return true;
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (["codes", "license_key", "licenseKey"].includes(key)) return true;
    if (key === "code" && sensitive(child)) return true;
    if (hasCredentialField(child, depth + 1)) return true;
  }
  return false;
}

/** A bounded serial protocol queue, also used by focused tests without network sockets. */
export function createCredentialRelay({ sendUpstream, sendDownstream, obtainGrant,
  credentialsAllowed, environment, now = Date.now, close = () => {} }) {
  let keys = [], context = null, proof = null, proofUntil = 0, checkedKeys = "", closed = false;
  let tail = Promise.resolve(), pending = 0;
  let finishWelcome;
  const welcome = new Promise(resolve => { finishWelcome = resolve; });
  const fail = () => { if (!closed) { closed = true; keys = []; proof = null; finishWelcome(null); close(); } };
  const enqueue = operation => {
    if (closed) return Promise.resolve();
    if (++pending > 64) { pending--; fail(); return Promise.resolve(); }
    const task = tail.catch(() => {}).then(() => closed ? undefined : operation());
    tail = task.catch(fail).finally(() => { pending--; });
    return tail;
  };
  const ackError = request => {
    if (Number.isSafeInteger(request)) sendDownstream({ type: "ack", request, ok: false, error: "Could not check that purchase. Please try again." });
  };
  async function refresh(force = false) {
    if (!context) {
      let timer;
      const value = await Promise.race([welcome, new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); timer.unref?.(); })]);
      clearTimeout(timer);
      if (!value || closed) return null;
    }
    const keySet = keys.join(",");
    if (!force && proof && checkedKeys === keySet && proofUntil > now() + 5000) return proof;
    proof = null; proofUntil = 0; checkedKeys = keySet;
    if (!credentialsAllowed || context.environment !== environment) return null;
    for (const key of keys) {
      try {
        const result = await obtainGrant({ key, audience: context.audience, challenge: context.challenge });
        if (closed) return null;
        const until = typeof result === "string" ? expiry(result) : 0;
        if (until > now() && until <= now() + 62000) { proof = result; proofUntil = until; return proof; }
      } catch { /* A failed check never exposes the key or upgrades the peer's claim. */ }
    }
    return null;
  }
  const grantPacket = (value, request) => sendUpstream({ type: "license-grant", data: { proof: value },
    ...(Number.isSafeInteger(request) ? { request } : {}) });
  return {
    close: fail,
    client(value) {
      let p;
      try { p = packet(value); } catch { fail(); return Promise.resolve(); }
      return enqueue(async () => {
        const data = p.data || {};
        if (p.type === "hello") {
          keys = credentialsAllowed ? nativeKeys(data.codes) : [];
          // The upstream only needs the game session token and language. No code-shaped value may hide in token.
          const token = typeof data.token === "string" && data.token.length <= 128 && !sensitive(data.token) ? data.token : "";
          sendUpstream({ type: "hello", data: { token, lang: data.lang === "en" ? "en" : "sv", codes: [] } });
          return;
        }
        if (p.type === "licenses") {
          keys = credentialsAllowed ? nativeKeys(data.codes) : [];
          grantPacket(await refresh(), p.request); return;
        }
        if (p.type === "redeem") {
          const key = nativeKeys([data.code])[0];
          if (!credentialsAllowed || !key) { ackError(p.request); return; }
          const previous = keys;
          keys = [key];
          const value = await refresh(true);
          keys = previous;
          if (!value) {
            grantPacket(await refresh(true)); ackError(p.request); return;
          }
          keys = nativeKeys([...previous, key]); checkedKeys = keys.join(",");
          grantPacket(value, p.request); return;
        }
        // Only this local bridge may provide the operator proof. Reject accidental new credential fields.
        if (p.type === "license-grant" || hasCredentialField(data)) { ackError(p.request); return; }
        if (privileged.has(p.type) && keys.length && proofUntil <= now() + 5000) grantPacket(await refresh());
        if (!closed) sendUpstream(p);
      });
    },
    server(value) {
      let p;
      try { p = packet(value); } catch { fail(); return; }
      if (p.type === "welcome") {
        const d = p.data || {};
        proof = null; proofUntil = 0; checkedKeys = "";
        context = UUID.test(d.licenseAudience || "") && UUID.test(d.licenseChallenge || "")
          ? { audience: d.licenseAudience, challenge: d.licenseChallenge, environment: d.licenseEnvironment } : null;
        finishWelcome(context);
        sendDownstream(p);
        if (context) enqueue(async () => { grantPacket(await refresh()); });
        return;
      }
      if (p.type === "license-refresh") {
        const d = p.data || {};
        if (context && UUID.test(d.licenseAudience || "") && UUID.test(d.licenseChallenge || "")) {
          context = { ...context, audience: d.licenseAudience, challenge: d.licenseChallenge };
          proof = null; proofUntil = 0; checkedKeys = "";
        }
        enqueue(async () => { grantPacket(await refresh(true)); });
        return;
      }
      sendDownstream(p);
    },
  };
}

/** No raw socket fallback: a failed peer connection reconnects through normal room-host discovery. */
export function bridgeRitkaos({ req, socket, head, remoteHost, remotePort, headers, port,
  upgrade, Peer, commerce, onUnavailable = () => {} }) {
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
  }
  const key = randomBytes(16).toString("base64");
  const expectedAccept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  const outgoingHeaders = { ...headers, upgrade: "websocket", connection: "Upgrade",
    "sec-websocket-version": "13", "sec-websocket-key": key };
  delete outgoingHeaders.cookie; delete outgoingHeaders.authorization;
  delete outgoingHeaders["proxy-authorization"];
  delete outgoingHeaders["sec-websocket-extensions"]; delete outgoingHeaders["sec-websocket-protocol"];
  let client, upstream, relay, heartbeat, stopped = false;
  const shutdown = () => {
    if (stopped) return;
    stopped = true; clearInterval(heartbeat); relay?.close();
    client?.close(1001); upstream?.close(1001); request.destroy();
    if (!client) socket.destroy();
  };
  const unavailable = () => { if (!stopped) { onUnavailable(); shutdown(); } };
  const request = http.request({ hostname: remoteHost, port: remotePort, method: "GET", path: "/ws",
    headers: outgoingHeaders, agent: false });
  request.setTimeout(5000, unavailable);
  request.on("error", unavailable);
  request.on("response", response => { response.resume(); unavailable(); });
  request.on("upgrade", (response, upstreamSocket, upstreamHead) => {
    if (stopped || response.statusCode !== 101 || response.headers["sec-websocket-accept"] !== expectedAccept
        || response.headers.upgrade?.toLowerCase() !== "websocket"
        || !String(response.headers.connection || "").toLowerCase().split(/\s*,\s*/).includes("upgrade")
        || response.headers["sec-websocket-extensions"] || response.headers["sec-websocket-protocol"]) { upstreamSocket.destroy(); unavailable(); return; }
    request.setTimeout(0);
    upstream = new Peer(upstreamSocket, upstreamHead, { client: true });
    client = upgrade(req, socket, head);
    if (!client) { shutdown(); return; }
    relay = createCredentialRelay({ credentialsAllowed: maySubmitCredentials(req, port),
      environment: commerce.catalog().environment, obtainGrant: input => commerce.obtainGrant(input),
      sendUpstream: p => upstream.send(p), sendDownstream: p => client.send(p), close: shutdown });
    client.on("message", text => { relay.client(text); });
    upstream.on("message", text => relay.server(text));
    client.on("close", shutdown); upstream.on("close", shutdown);
    heartbeat = setInterval(() => { client.ping(); upstream.ping(); }, 20000); heartbeat.unref?.();
  });
  socket.on("error", shutdown); socket.on("close", shutdown);
  request.end();
}
