import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Mirrors the check in app/updater.mjs (which imports electron and cannot load in plain Node).
const verify = (digest, signature, key) => crypto.verify(null, digest, key, Buffer.from(signature, "base64"));

test("a zip signed with the release key verifies, a changed one does not", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const digest = crypto.createHash("sha256").update("the app").digest();
  const signature = crypto.sign(null, digest, privateKey).toString("base64");
  assert.equal(verify(digest, signature, publicKey), true);
  const tampered = crypto.createHash("sha256").update("another app").digest();
  assert.equal(verify(tampered, signature, publicKey), false);
  const other = crypto.generateKeyPairSync("ed25519").publicKey;
  assert.equal(verify(digest, signature, other), false);
});
