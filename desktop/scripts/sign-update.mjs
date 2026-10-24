// Signs the release zip so the app's updater (app/updater.mjs) only installs builds made on this Mac.
// The private key never leaves this Mac and is not in the repo:
//   ~/Library/Application Support/Ludvig Games Release/update-signing-key.pem
// Its public half is app/update-key.pem, bundled into the app. Usage: node scripts/sign-update.mjs [zip]
// The first run creates the key pair; keep the private key safe (losing it means users update by hand once).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyDir = path.join(os.homedir(), "Library", "Application Support", "Ludvig Games Release");
const keyFile = path.join(keyDir, "update-signing-key.pem");
const publicFile = path.join(root, "app", "update-key.pem");

if (!fs.existsSync(keyFile)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(publicFile, publicKey.export({ type: "spki", format: "pem" }));
  console.log("Created a new update signing key:", keyFile);
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
const expected = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
if (!fs.existsSync(publicFile) || fs.readFileSync(publicFile, "utf8") !== expected) {
  throw new Error("app/update-key.pem does not match the signing key. Rebuild after fixing it, or users cannot update.");
}

const zip = process.argv[2] || path.join(root, "release", `Ludvig-Games-mac-${process.arch === "arm64" ? "arm64" : "x64"}.zip`);
if (process.argv[2] === "--key-only") process.exit(0);
const digest = crypto.createHash("sha256");
await new Promise((resolve, reject) => fs.createReadStream(zip).on("data", (c) => digest.update(c)).on("end", resolve).on("error", reject));
const hash = digest.digest();
const signature = crypto.sign(null, hash, privateKey).toString("base64");
fs.writeFileSync(`${zip}.sig`, JSON.stringify({ sha256: hash.toString("hex"), signature }) + "\n");
console.log("Signed", path.basename(zip), hash.toString("hex"));
