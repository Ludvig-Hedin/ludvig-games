import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createCredentialRelay, maySubmitCredentials } from "../runtime/ritkaos-bridge.mjs";
import { Peer } from "../../ritkaos/lib/websocket.mjs";
import { publicStoreEnvironment } from "../runtime/commerce.mjs";

const KEY = "12345678-1234-1234-1234-123456789abc";
const OTHER = "22345678-1234-1234-1234-123456789abc";
const AUDIENCE = "33333333-3333-4333-8333-333333333333";
const CHALLENGE = "44444444-4444-4444-8444-444444444444";
const RK = "RK-TEST-TEST-TEST";
const proof = until => Buffer.from(JSON.stringify({ expiresAt: until })).toString("base64url") + ".synthetic-signature";
const welcome = () => ({ type: "welcome", data: { licenseAudience: AUDIENCE,
  licenseChallenge: CHALLENGE, licenseEnvironment: "test" } });
function harness(options = {}) {
  const up = [], down = [], calls = [];
  let clock = 100000, closed = false;
  const relay = createCredentialRelay({ sendUpstream: p => up.push(structuredClone(p)),
    sendDownstream: p => down.push(structuredClone(p)), credentialsAllowed: true, environment: "test",
    now: () => clock, close: () => { closed = true; },
    obtainGrant: async input => { calls.push(input); return proof(clock + 60000); }, ...options });
  return { relay, up, down, calls, advance: n => { clock += n; }, closed: () => closed };
}

test("saved native and legacy keys never cross the federated room boundary", async () => {
  const h = harness();
  await h.relay.client({ type: "hello", data: { token: "game-session", lang: "en", codes: [KEY, RK] } });
  h.relay.server(welcome());
  await h.relay.client({ type: "licenses", data: { codes: [KEY, RK] } });
  await h.relay.client({ type: "create", data: { name: "Host" }, request: 1 });
  assert.deepEqual(h.up[0], { type: "hello", data: { token: "game-session", lang: "en", codes: [] } });
  assert.ok(h.up.some(p => p.type === "license-grant" && typeof p.data.proof === "string"));
  assert.equal(h.up.at(-1).type, "create");
  assert.equal(h.calls.length, 1, "duplicate startup refresh reuses the connection's proof");
  assert.deepEqual(h.calls[0], { key: KEY, audience: AUDIENCE, challenge: CHALLENGE });
  assert.equal(JSON.stringify(h.up).includes(KEY), false);
  assert.equal(JSON.stringify(h.up).includes(RK), false);
  h.relay.close();
});

test("redemption retains the original request ID, while invalid and legacy codes fail locally", async () => {
  const h = harness({ obtainGrant: async ({ key }) => { if (key === OTHER) throw new Error("private-provider-error"); return proof(160000); } });
  await h.relay.client({ type: "hello", data: { codes: [] } }); h.relay.server(welcome());
  await h.relay.client({ type: "redeem", data: { code: KEY }, request: 7 });
  assert.equal(h.up.at(-1).type, "license-grant");
  assert.equal(h.up.at(-1).request, 7);
  await h.relay.client({ type: "redeem", data: { code: OTHER }, request: 8 });
  await h.relay.client({ type: "redeem", data: { code: RK }, request: 9 });
  assert.deepEqual(h.down.filter(p => p.type === "ack").map(p => [p.request, p.ok]), [[8, false], [9, false]]);
  assert.equal(JSON.stringify(h.up).includes(KEY), false);
  assert.equal(JSON.stringify(h.up).includes(OTHER), false);
  assert.equal(JSON.stringify(h.up).includes(RK), false);
  assert.equal(JSON.stringify(h.down).includes("private-provider-error"), false);
  h.relay.close();
});

test("LAN guests keep free room messages but cannot submit or forward credentials", async () => {
  const h = harness({ credentialsAllowed: false });
  await h.relay.client({ type: "hello", data: { codes: [KEY, RK] } }); h.relay.server(welcome());
  await h.relay.client({ type: "licenses", data: { codes: [KEY] } });
  await h.relay.client({ type: "redeem", data: { code: KEY }, request: 2 });
  await h.relay.client({ type: "join", data: { code: "ABCD", name: "Guest" }, request: 3 });
  assert.equal(h.calls.length, 0);
  assert.equal(h.up.at(-1).type, "join");
  assert.equal(JSON.stringify(h.up).includes(KEY), false);
  assert.equal(JSON.stringify(h.up).includes(RK), false);
  assert.equal(h.down.find(p => p.request === 2).ok, false);
  h.relay.close();
});

test("proof renewal precedes privileged commands and never changes their wire order", async () => {
  const h = harness();
  await h.relay.client({ type: "hello", data: { codes: [KEY] } }); h.relay.server(welcome());
  await h.relay.client({ type: "ping", data: {} });
  h.advance(56000);
  const start = h.up.length;
  await Promise.all([h.relay.client({ type: "settings", data: { mode: "blind" }, request: 4 }),
    h.relay.client({ type: "stroke.begin", data: {}, request: 5 }),
    h.relay.client({ type: "stroke.end", data: {}, request: 6 })]);
  assert.deepEqual(h.up.slice(start).map(p => p.type), ["license-grant", "settings", "stroke.begin", "stroke.end"]);
  assert.equal(h.calls.length, 2);
  h.relay.close();
});

test("a rotated connection challenge obtains a new proof rather than reusing the old binding", async () => {
  const h = harness();
  await h.relay.client({ type: "hello", data: { codes: [KEY] } }); h.relay.server(welcome());
  await h.relay.client({ type: "ping", data: {} });
  const next = "55555555-5555-4555-8555-555555555555";
  h.relay.server({ type: "license-refresh", data: { licenseAudience: AUDIENCE, licenseChallenge: next } });
  await h.relay.client({ type: "ping", data: {} });
  assert.equal(h.calls.at(-1).challenge, next);
  h.relay.close();
});

test("unconfigured/older peers and removed keys cannot keep an old proof alive", async () => {
  const h = harness();
  await h.relay.client({ type: "hello", data: { codes: [KEY] } }); h.relay.server(welcome());
  await h.relay.client({ type: "licenses", data: { codes: [] } });
  assert.equal(h.up.at(-1).data.proof, null);
  await h.relay.client({ type: "settings", data: { code: KEY }, request: 8 });
  assert.equal(h.down.at(-1).ok, false);
  assert.equal(JSON.stringify(h.up).includes(KEY), false);
  h.relay.close();
});

test("only exact local Host/Origin pairs may submit credentials", () => {
  const req = { headers: { host: "127.0.0.1:47801", origin: "http://127.0.0.1:47801" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(maySubmitCredentials(req, 47801), true);
  for (const changed of [{ headers: { ...req.headers, origin: "https://evil.example" } },
    { headers: { host: "127.0.0.1:47801" } }, { socket: { remoteAddress: "192.168.1.4" } },
    { headers: { host: "evil.example:47801", origin: "http://evil.example:47801" } }]) {
    assert.equal(maySubmitCredentials({ ...req, ...changed }, 47801), false);
  }
  assert.equal(maySubmitCredentials({ ...req, headers: { host: req.headers.host } }, 47801, false), true);
});

test("public desktop configuration never admits signing/private key fields", () => {
  const x = "A".repeat(43);
  const good = JSON.stringify({ current: { kty: "OKP", crv: "Ed25519", x, key_ops: ["verify"] } });
  assert.equal(publicStoreEnvironment({ LS_GRANT_PUBLIC_KEYS: good }).LS_GRANT_PUBLIC_KEYS, good);
  for (const keys of [{ current: { kty: "OKP", crv: "Ed25519", x, d: "private" } },
    { current: { kty: "OKP", crv: "Ed25519", x, key_ops: ["sign"] } }, {}]) {
    assert.equal(publicStoreEnvironment({ LS_GRANT_PUBLIC_KEYS: JSON.stringify(keys) }).LS_GRANT_PUBLIC_KEYS, undefined);
  }
  assert.equal(publicStoreEnvironment({ LS_GRANT_PRIVATE_JWK: "never-copy" }).LS_GRANT_PRIVATE_JWK, undefined);
});

test("a stalled proof check cannot create an unbounded outgoing message queue", async () => {
  let begin, release;
  const started = new Promise(resolve => { begin = resolve; });
  const h = harness({ obtainGrant: () => { begin(); return new Promise(resolve => { release = resolve; }); } });
  await h.relay.client({ type: "hello", data: { codes: [KEY] } }); h.relay.server(welcome());
  await started;
  const waiting = Array.from({ length: 65 }, () => h.relay.client({ type: "ping", data: {} }));
  assert.equal(h.closed(), true);
  release(proof(160000)); await Promise.all(waiting);
});

class Socket extends EventEmitter {
  constructor() { super(); this.writes = []; this.writableLength = 0; this.destroyed = false; }
  setNoDelay() {}
  write(value) { this.writes.push(Buffer.from(value)); }
  end() {}
  destroy() { this.destroyed = true; }
}
test("Peer client mode masks outgoing frames and decodes unmasked server frames including fragments", () => {
  const a = new Socket(), b = new Socket(), client = new Peer(a, Buffer.alloc(0), { client: true }), server = new Peer(b, Buffer.alloc(0));
  const received = [];
  server.on("message", value => received.push(value));
  client.frame(1, '{"type":"licenses","data":{"codes":["' + KEY + '"]}}');
  const frame = a.writes[0]; assert.equal(!!(frame[1] & 128), true);
  server.read(frame.subarray(0, 1)); server.read(frame.subarray(1, 7)); server.read(frame.subarray(7));
  assert.equal(received.length, 1); assert.equal(JSON.parse(received[0]).data.codes[0], KEY);
  const back = []; client.on("message", value => back.push(value));
  server.send({ type: "welcome", data: {} });
  assert.equal(!!(b.writes[0][1] & 128), false);
  client.read(b.writes[0]); assert.equal(JSON.parse(back[0]).type, "welcome");
  client.frame(1, '{"type":"licenses",'); a.writes.at(-1)[0] = 0x01;
  client.frame(0, '"data":{"codes":[]}}');
  server.read(a.writes.at(-2)); assert.equal(received.length, 1, "partial credential messages are not emitted");
  server.read(a.writes.at(-1)); assert.equal(received.length, 2);
  client.read(frame); assert.equal(client.closed, true, "masked frames from a server are rejected");
  server.close();
});
