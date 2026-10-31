// Focused two-runtime purchase delivery check. No checkout, charge, refund or publication.
// Root runs this only through a hash-pinned registered Games verification lane.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { Peer } from '../../ritkaos/lib/websocket.mjs';
import { createDesktopCommerce } from '../runtime/commerce.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owner = '/Users/ludvighedin';
const keyFile = `${owner}/.config/ludvig-games-commerce/test-native-license.txt`;
const sourceBundle = path.join(root, 'bundle');
const output = path.join(root, 'output/purchase-selftest');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = () => { throw new Error('federation-check-failed'); };
const check = value => { if (!value) fail(); };
const results = {};
const owned = new Map(), children = [], clients = [], taps = [], sockets = new Set();
let run, privateDir, key, tracking, trackingFailed = false, clean = false;
const deadline = Date.now() + 120000;

function regular(file, directory = false) {
  const value = fs.lstatSync(file);
  check(fs.realpathSync(file) === file && value.uid === process.getuid()
    && (directory ? value.isDirectory() : value.isFile()));
  return value;
}
function identity(pid) {
  try {
    return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart=,comm='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
    }).trim();
  } catch { return ''; }
}
function track() {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
  }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const parents = new Set([...owned].filter(([pid, value]) => identity(pid) === value).map(([pid]) => pid));
  let added;
  do {
    added = false;
    for (const [pid, parent] of rows) {
      if (!parents.has(parent) || parents.has(pid)) continue;
      const value = identity(pid);
      if (value) { owned.set(pid, value); parents.add(pid); added = true; }
    }
  } while (added);
}
async function stopOwned() {
  const living = () => [...owned].filter(([pid, value]) => identity(pid) === value);
  const wait = async ms => {
    const end = Date.now() + ms;
    while (living().length && Date.now() < end) await pause(100);
  };
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const [pid, value] of living()) {
      if (identity(pid) !== value) continue;
      try { process.kill(pid, signal); } catch { /* Identified process may have exited. */ }
    }
    await wait(signal === 'SIGTERM' ? 3000 : 1000);
  }
  return living().length === 0 && !trackingFailed;
}
async function until(fn, ms = 15000) {
  const end = Math.min(deadline, Date.now() + ms);
  while (Date.now() < end) { const value = await fn(); if (value) return value; await pause(50); }
  fail();
}
async function vacant(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function copyTree(from, to, count = { value: 0 }) {
  regular(from, true); fs.mkdirSync(to, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    check(!entry.name.startsWith('.') && entry.name !== 'node_modules' && !entry.isSymbolicLink());
    const source = path.join(from, entry.name), target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target, count);
    else {
      const info = regular(source);
      check(++count.value <= 300 && info.size <= 4 * 1024 * 1024);
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    }
  }
}
function stageMinimalBundle() {
  const bundle = path.join(privateDir, 'bundle'); fs.mkdirSync(bundle, { mode: 0o700 });
  fs.mkdirSync(path.join(bundle, 'hub'), { mode: 0o700 });
  const cfg = path.join(sourceBundle, 'hub/config.json'); regular(cfg);
  fs.copyFileSync(cfg, path.join(bundle, 'hub/config.json'), fs.constants.COPYFILE_EXCL);
  for (const directory of ['server', 'migrations', 'commerce'])
    copyTree(path.join(sourceBundle, 'hub', directory), path.join(bundle, 'hub', directory));
  fs.mkdirSync(path.join(bundle, 'hub/client'), { mode: 0o700 });
  copyTree(path.join(sourceBundle, 'ritkaos'), path.join(bundle, 'ritkaos'));
  return bundle;
}

// Transparent task-owned room-host taps. Decode masked client frames only in memory;
// retain booleans plus one short-lived proof for the wrong-connection rejection check.
const audit = { keyAbsent: true, authHeadersAbsent: true, helloEmpty: false, frames: 0, proof: '', valid: true };
function observeConnection() {
  let header = Buffer.alloc(0), buffer = Buffer.alloc(0), websocket = null, fragments = [], size = 0;
  return chunk => {
    try {
      if (websocket === null) {
        header = Buffer.concat([header, chunk]); check(header.length <= 65536);
        const end = header.indexOf('\r\n\r\n'); if (end < 0) return;
        const text = header.subarray(0, end).toString('utf8');
        audit.keyAbsent &&= !text.toLowerCase().includes(key.toLowerCase());
        audit.authHeadersAbsent &&= !/\r\n(?:cookie|authorization|proxy-authorization):/i.test(text);
        websocket = /\r\nupgrade:\s*websocket\r?$/im.test(text);
        chunk = header.subarray(end + 4); header = Buffer.alloc(0);
      }
      if (!websocket) { audit.keyAbsent &&= !chunk.toString('utf8').toLowerCase().includes(key.toLowerCase()); return; }
      buffer = Buffer.concat([buffer, chunk]); check(buffer.length <= 262144);
      while (buffer.length >= 2) {
        const first = buffer[0], second = buffer[1], opcode = first & 15;
        check(!(first & 112) && (second & 128));
        let length = second & 127, offset = 2;
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
        if (length === 127) {
          if (buffer.length < 10) return;
          const wide = buffer.readBigUInt64BE(2); check(wide <= 131072n); length = Number(wide); offset = 10;
        }
        check(length <= 131072); if (buffer.length < offset + 4 + length) return;
        const mask = buffer.subarray(offset, offset + 4), body = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
        buffer = buffer.subarray(offset + 4 + length);
        for (let i = 0; i < length; i++) body[i] ^= mask[i % 4];
        if (opcode >= 8) continue;
        check(opcode === 0 || opcode === 1); fragments.push(body); size += body.length; check(size <= 131072);
        if (!(first & 128)) continue;
        const text = Buffer.concat(fragments).toString('utf8'); fragments = []; size = 0;
        audit.keyAbsent &&= !text.toLowerCase().includes(key.toLowerCase()); audit.frames++;
        const packet = JSON.parse(text);
        if (packet.type === 'hello') audit.helloEmpty ||= Array.isArray(packet.data.codes) && packet.data.codes.length === 0;
        if (packet.type === 'license-grant' && typeof packet.data?.proof === 'string') audit.proof = packet.data.proof;
      }
    } catch { audit.valid = false; }
  };
}
async function tap(port, target) {
  const server = net.createServer(incoming => {
    const upstream = net.connect(target, '127.0.0.1');
    for (const socket of [incoming, upstream]) {
      sockets.add(socket); socket.once('close', () => sockets.delete(socket));
      socket.on('error', () => { incoming.destroy(); upstream.destroy(); });
    }
    incoming.on('data', observeConnection()); incoming.pipe(upstream); upstream.pipe(incoming);
    incoming.once('close', () => upstream.destroy()); upstream.once('close', () => incoming.destroy());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  taps.push(server);
}
async function runtime(bundle, offset, name, roomHost = '') {
  const data = path.join(privateDir, name); fs.mkdirSync(data, { mode: 0o700 });
  const env = Object.fromEntries(['HOME', 'TMPDIR', 'AGENT_JOB_TOKEN', 'AGENT_RUNTIME_DIR']
    .filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { PATH: `${owner}/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    NODE_OPTIONS: '--max-old-space-size=768', LUDVIG_BUNDLE: bundle, LUDVIG_DATA: data,
    LUDVIG_BIND: '127.0.0.1', LUDVIG_PORT_OFFSET: String(offset), LUDVIG_ROOM_HOST: roomHost });
  const child = spawn(process.execPath, [path.join(root, 'runtime/server.mjs')], {
    cwd: root, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  children.push(child);
  await new Promise((resolve, reject) => {
    child.once('spawn', () => {
      const value = identity(child.pid);
      if (!value) { trackingFailed = true; reject(new Error('identity-unavailable')); return; }
      owned.set(child.pid, value); resolve();
    });
    child.once('error', reject);
  });
  let ready = false; child.on('message', value => { if (value?.type === 'ready') ready = true; });
  await until(() => ready && child.exitCode === null, 45000);
  return child;
}
async function client(port, origin = `http://127.0.0.1:${port}`, credentials = false) {
  const nonce = randomBytes(16).toString('base64');
  const expected = createHash('sha1').update(nonce + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  const result = { events: [], state: null, products: [], welcome: null, count: 0, pending: new Map() };
  const peer = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/ws', method: 'GET', agent: false,
      headers: { Host: `127.0.0.1:${port}`, Origin: origin, Upgrade: 'websocket', Connection: 'Upgrade',
        'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': nonce,
        ...(credentials ? { Cookie: 'probe=non-secret', Authorization: 'Bearer probe-non-secret' } : {}) } });
    request.setTimeout(10000, () => request.destroy(new Error('upgrade-timeout')));
    request.once('error', reject);
    request.once('response', response => { response.resume(); resolve(response.statusCode); });
    request.once('upgrade', (response, socket, head) => {
      request.setTimeout(0);
      if (response.statusCode !== 101 || response.headers['sec-websocket-accept'] !== expected) { socket.destroy(); reject(new Error('invalid-upgrade')); return; }
      resolve(new Peer(socket, head, { client: true }));
    });
    request.end();
  });
  if (typeof peer === 'number') return peer;
  result.peer = peer; clients.push(result);
  peer.on('message', text => {
    try {
      const packet = JSON.parse(text);
      if (packet.type === 'welcome') result.welcome = packet.data;
      if (packet.type === 'owned') result.products = packet.data.products;
      if (packet.type === 'state') result.state = packet.data;
      if (packet.type === 'ack') {
        const pending = result.pending.get(packet.request);
        if (pending) { result.pending.delete(packet.request); clearTimeout(pending.timer); pending.resolve(packet); }
      }
    } catch { result.badPacket = true; }
  });
  result.request = (type, data = {}) => new Promise((resolve, reject) => {
    const number = ++result.count;
    const timer = setTimeout(() => { result.pending.delete(number); reject(new Error('ack-timeout')); }, 15000);
    result.pending.set(number, { resolve, reject, timer }); peer.send({ type, data, request: number });
  });
  peer.on('close', () => {
    for (const pending of result.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('peer-closed')); }
    result.pending.clear();
  });
  return result;
}

try {
  check(process.argv.length === 2 && process.platform === 'darwin' && process.env.HOME === owner
    && process.env.AGENT_JOB_TOKEN && process.env.AGENT_RUNTIME_DIR && process.env.LS_TEST_LICENSE_FILE === keyFile);
  regular(root, true); regular(sourceBundle, true);
  const info = regular(keyFile); check((info.mode & 0o777) === 0o600 && info.size <= 256);
  const publicFile = path.join(sourceBundle, 'hub/commerce/config.json'); regular(publicFile);
  const environment = JSON.parse(fs.readFileSync(publicFile, 'utf8'));
  check(environment.TEST_MODE === 'true' && environment.LS_STORE_ID === '504842' && !environment.LS_LIVE_PRODUCTS);
  const mapping = JSON.parse(environment.LS_TEST_PRODUCTS), pins = JSON.parse(environment.LS_GRANT_PUBLIC_KEYS);
  check(mapping.bundle?.productId === '1488399' && mapping.bundle?.variantId === '2319096'
    && mapping.bundle?.testMode === true && Object.keys(pins).length === 1 && pins['games-test-v1']?.crv === 'Ed25519'
    && !Object.hasOwn(pins['games-test-v1'], 'd'));
  key = fs.readFileSync(keyFile, 'utf8').trim(); check(UUID.test(key));
  regular(output, true);
  run = fs.mkdtempSync(path.join(output, 'federation-')); fs.chmodSync(run, 0o700);
  privateDir = path.join(run, 'private'); fs.mkdirSync(privateDir, { mode: 0o700 });
  for (const port of [48000, 48001, 48020, 48021, 48100, 48101, 48121, 48201]) await vacant(port);
  const bundle = stageMinimalBundle();
  tracking = setInterval(() => { try { track(); } catch { trackingFailed = true; } }, 200);
  // A is offset220. Transparent taps expose it at offset200 so the actual
  // B->room-host HTTP/WebSocket wire can be inspected without changing app code.
  await runtime(bundle, 220, 'room-mac');
  await tap(48000, 48020); await tap(48001, 48021);
  await runtime(bundle, 300, 'buyer-mac', '127.0.0.1:48000');
  const catalogue = await fetch('http://127.0.0.1:48100/api/store', { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  check(catalogue.ready === true && catalogue.environment === 'test'); results.testConfiguration = true;
  const forbidden = await fetch('http://127.0.0.1:48100/api/licenses/resolve', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
  });
  check(forbidden.status === 403); results.untrustedRestoreRejected = true;
  check(await client(48101, 'https://untrusted.example') === 403); results.untrustedSocketRejected = true;
  const buyer = await client(48101, undefined, true); check(typeof buyer !== 'number');
  buyer.peer.send({ type: 'hello', data: { lang: 'en', codes: [] } });
  await until(() => buyer.welcome);
  const restored = await buyer.request('redeem', { code: key });
  check(restored.ok === true && restored.data?.products?.includes('plus'));
  await until(() => buyer.products.includes('plus') && buyer.products.length === 10);
  results.actualHostedGrantRestores = true;
  const made = await buyer.request('create', { name: 'Buyer test' }); check(made.ok && made.data?.room);
  const configured = await buyer.request('settings', { pack: 'office', mode: 'blind' }); check(configured.ok);
  const guest = await client(48021); check(typeof guest !== 'number');
  guest.peer.send({ type: 'hello', data: { lang: 'en', codes: [] } }); await until(() => guest.welcome);
  await until(() => audit.proof);
  const replay = await guest.request('license-grant', { proof: audit.proof });
  check(replay.ok === false && guest.products.length === 0); results.wrongConnectionProofRejected = true;
  const joined = await guest.request('join', { code: made.data.room, name: 'Guest test' }); check(joined.ok);
  await until(() => guest.state?.settings?.pack === 'office' && guest.state?.settings?.mode === 'blind');
  check(guest.state.unlocked?.includes('office') && guest.products.length === 0);
  results.paidHostRoomSharedWithFreeGuest = true;
  check(audit.valid && audit.frames > 0 && audit.helloEmpty && audit.keyAbsent && audit.authHeadersAbsent && audit.proof);
  results.reusableKeyAbsentFromRoomHostWire = true; results.authenticationHeadersAbsentFromRoomHostWire = true;
  let calls = 0;
  const closed = await createDesktopCommerce({ moduleRoot: path.join(bundle, 'hub/commerce'), environment: {},
    fetchImpl: async () => { calls++; throw new Error('unexpected-provider-call'); } });
  check(!closed.catalog().ready);
  let rejected = false;
  try { await closed.obtainGrant({ key, audience: buyer.welcome.licenseAudience, challenge: buyer.welcome.licenseChallenge }); }
  catch { rejected = true; }
  check(rejected && calls === 0); results.missingConfigurationFailsClosed = true;
} catch {
  results.failure = true;
} finally {
  audit.proof = ''; key = '';
  for (const value of clients) value.peer.close();
  for (const socket of sockets) socket.destroy();
  for (const server of taps) await new Promise(resolve => server.close(resolve));
  try { track(); } catch { trackingFailed = true; }
  clean = await stopOwned(); clearInterval(tracking);
  if (clean && privateDir) fs.rmSync(privateDir, { recursive: true });
  const ok = !results.failure && Object.keys(results).length === 9 && clean;
  const report = { ok, checks: results, processCleanupPassed: clean, privateDataRemoved: !!privateDir && !fs.existsSync(privateDir),
    limits: ['two loopback runtimes on one Mac, not two physical Macs', 'current runtime source and staged bundle, not Electron UI',
      'no expiry-wait, refund, checkout, publication or update installation'] };
  if (run) fs.writeFileSync(path.join(run, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ...report, ...(run ? { report: path.join(run, 'summary.json') } : {}) }));
  if (!ok) process.exitCode = 1;
}
