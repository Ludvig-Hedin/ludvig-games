import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRoomHost, sharedPath } from "../runtime/share.mjs";

const self = { id: "b", version: "0.4.0", started: 2000 };

test("the oldest app of the same version holds the rooms", () => {
  const a = { id: "a", version: "0.4.0", started: 1000, address: "10.0.0.2", port: 47800 };
  assert.equal(pickRoomHost(self, [a]), a);
  assert.equal(pickRoomHost({ ...a }, [self]), null);
});

test("other versions and this Mac alone keep the rooms here", () => {
  assert.equal(pickRoomHost(self, []), null);
  assert.equal(pickRoomHost(self, [{ id: "a", version: "0.3.1", started: 1 }]), null);
  assert.equal(pickRoomHost(self, [{ id: "a", version: "0.4.0", started: NaN }]), null);
});

test("same start time: every Mac picks the same one", () => {
  const a = { id: "a", version: "0.4.0", started: 2000 };
  assert.equal(pickRoomHost(self, [a]), a);
  assert.equal(pickRoomHost(a, [self]), null);
});

test("only room traffic is shared", () => {
  const hub = { id: "hub" }, air = { id: "air-hockey" }, rit = { id: "ritkaos" };
  assert.equal(sharedPath(hub, "worker", "/mp/ws"), true);
  assert.equal(sharedPath(hub, "worker", "/api/mp/list"), true);
  assert.equal(sharedPath(hub, "worker", "/api/scores"), false);
  assert.equal(sharedPath(hub, "worker", "/api/me"), false);
  assert.equal(sharedPath(air, "worker", "/api/rooms"), true);
  assert.equal(sharedPath(rit, "node", "/ws"), true);
  assert.equal(sharedPath(rit, "node", "/api/rooms"), true);
  assert.equal(sharedPath(rit, "node", "/api/connection"), false);
  assert.equal(sharedPath(rit, "node", "/"), false);
});
