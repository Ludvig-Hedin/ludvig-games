// Actual product-app QA only. Run through the reviewed registered Games app-test lane.
// No checkout, purchase, refund, update installation or federated-room proof is performed.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const output = path.join(root, 'output/purchase-selftest');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = message => { throw new Error(message); };
let runDirectory;
let processCleanupPassed = true;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function regular(file, directory = false) {
  const info = fs.lstatSync(file);
  if (fs.realpathSync(file) !== file || info.uid !== process.getuid()
      || (directory ? !info.isDirectory() : !info.isFile())) fail('Unexpected test path');
  return info;
}
function directory(file) {
  if (!fs.existsSync(file)) fs.mkdirSync(file, { mode: 0o700 });
  regular(file, true);
}
function identity(pid) {
  try {
    return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart=,comm='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
    }).trim();
  } catch { return ''; }
}
function trackDescendants(rootPid, owned) {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000,
  }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const parents = new Set([...owned].filter(([pid, value]) => identity(pid) === value).map(([pid]) => pid));
  if (parents.has(rootPid)) parents.add(rootPid);
  let added;
  do {
    added = false;
    for (const [pid, parent] of rows) {
      if (!parents.has(parent) || parents.has(pid)) continue;
      const value = identity(pid);
      if (!value) continue;
      owned.set(pid, value); parents.add(pid); added = true;
    }
  } while (added);
}
async function stopOwned(owned) {
  const living = () => [...owned].filter(([pid, value]) => identity(pid) === value);
  const wait = async ms => {
    const deadline = Date.now() + ms;
    while (living().length && Date.now() < deadline) await pause(100);
  };
  await wait(2500);
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    for (const [pid, value] of living()) {
      if (identity(pid) !== value) continue;
      try { process.kill(pid, signal); } catch { /* It may have just exited. */ }
    }
    await wait(signal === 'SIGTERM' ? 2500 : 1000);
  }
  return living().length === 0;
}
async function vacant(port) {
  const deadline = Date.now() + 3000;
  while (true) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', () => reject(new Error('A test port is occupied')));
        server.listen(port, '127.0.0.1', () => server.close(resolve));
      });
      return;
    } catch {
      if (Date.now() >= deadline) fail('A test port is occupied');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

// Runs in the actual game renderer through the app's existing isolated SELFTEST hook.
// Return only a fixed set of booleans. Do not return localStorage, inputs or provider errors.
async function journey({ game, phase, key }) {
  const result = { game, phase, testMode: false, ready: false, restored: false,
    styleApplicable: ['pigeon', 'karts'].includes(game), style: false, ok: false };
  const $ = selector => document.querySelector(selector);
  const assert = value => { if (!value) throw new Error('purchase-selftest-check-failed'); };
  const wait = async check => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (check()) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('purchase-selftest-check-timeout');
  };
  let unsubscribe;
  try {
    assert(location.hostname === '127.0.0.1' && location.protocol === 'http:');
    if (game === 'ritkaos') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      let catalog;
      try { catalog = await fetch('/api/store', { signal: controller.signal, cache: 'no-store' }).then(r => r.json()); }
      finally { clearTimeout(timeout); }
      assert(catalog.environment === 'test' && catalog.nativeReady === true);
      result.testMode = true; result.ready = true;
      await wait(() => $('#plus'));
      $('#plus').click();
      await wait(() => document.querySelectorAll('#modal .store-row').length === 10);
      if (phase === 'restore') {
        assert(typeof key === 'string');
        $('#unlock-code').value = key;
        $('#unlock-form button[type=submit]').click();
      }
      await wait(() => document.querySelectorAll('#modal .store-owned').length === 10);
      result.restored = true;
    } else {
      await wait(() => typeof window.LudvigStore?.subscribe === 'function');
      let state;
      unsubscribe = window.LudvigStore.subscribe(value => { state = value; });
      await wait(() => state?.ready);
      assert(state.environment === 'test');
      result.testMode = true; result.ready = true;
      if (phase === 'restore') {
        if (game === 'shop') {
          assert($('[data-shop-status]').textContent.includes('Test mode'));
          for (const id of ['ritkaos', 'pigeon', 'karts', 'bundle']) {
            const button = $(`[data-store-offer="${id}"]`);
            assert(button && !button.disabled); button.click();
            assert($('#lg-store-product').value === id);
            $('.lg-store[open]').close();
          }
          $('[data-store-restore]').click();
        } else window.LudvigStore.open(game);
        assert($('#lg-store-key') && typeof key === 'string');
        $('#lg-store-key').value = key;
        $('#lg-store-key').closest('form').querySelector('button[type=submit]').click();
      }
      await wait(() => game === 'shop' ? ['ritkaos', 'pigeon', 'karts'].every(id => window.LudvigStore.owns(id))
        : window.LudvigStore.owns(game));
      result.restored = true;
      $('.lg-store[open]')?.close();
      if (game === 'pigeon') {
        await wait(() => $('#bird-style'));
        $('#bird-style').click();
        await wait(() => $('#bird-style-dialog').open);
        if (phase === 'restore') {
          $('[data-style-kind=hat][data-style-choice=crown]').click();
          $('[data-style-kind=feathers][data-style-choice=midnight]').click();
          assert(!$('#bird-style-apply').disabled);
          $('#bird-style-apply').click();
          $('#bird-style').click();
        }
        const stored = JSON.parse(localStorage.getItem('pigeon:style:v1') || 'null');
        result.style = stored?.hat === 'crown' && stored?.feathers === 'midnight'
          && $('[data-style-kind=hat][data-style-choice=crown]').getAttribute('aria-pressed') === 'true'
          && $('[data-style-kind=feathers][data-style-choice=midnight]').getAttribute('aria-pressed') === 'true'
          && !$('#bird-style-apply').disabled;
      } else if (game === 'karts') {
        await wait(() => $('#kart-styles'));
        $('#kart-styles').click();
        await wait(() => $('#kart-style-dialog').open);
        if (phase === 'restore') {
          $('#kart-pack-options [data-style=checks]').click();
          assert(!$('#kart-style-use').hidden && !$('#kart-style-use').disabled);
          $('#kart-style-use').click();
          $('#kart-styles').click();
        }
        const stored = JSON.parse(localStorage.getItem('citrus-circuit-coastline-v4') || 'null');
        result.style = stored?.kartStyle === 'checks' && $('#color-name').textContent === 'Checker panels'
          && $('#kart-pack-options [data-style=checks]').getAttribute('aria-pressed') === 'true'
          && !$('#kart-style-use').hidden;
      }
    }
    assert(result.restored && (!result.styleApplicable || result.style));
    result.ok = true;
  } catch {
    result.ok = false;
  } finally {
    unsubscribe?.();
    // The existing SELFTEST takes a screenshot immediately after this hook.
    // Clear secret fields on success, provider failure, assertion and timeout paths.
    for (const selector of ['#lg-store-key', '#unlock-code']) {
      const input = $(selector); if (input) input.value = '';
    }
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  }
  return result;
}

async function runApp({ game, phase, key, run }) {
  for (const port of [...Array.from({ length: 14 }, (_, n) => 48000 + n), 48101]) await vacant(port);
  const url = game === 'ritkaos' ? 'http://127.0.0.1:48001/'
    : `http://127.0.0.1:48000/${game === 'shop' ? 'shop' : game === 'pigeon' ? 'pigeon' : 'citrus-circuit-coastline'}/`;
  const roomScript = `(${journey.toString()})(${JSON.stringify({ game, phase, ...(phase === 'restore' ? { key } : {}) })})`;
  const env = Object.fromEntries(['HOME', 'TMPDIR', 'AGENT_JOB_TOKEN', 'AGENT_RUNTIME_DIR'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, {
    PATH: '/Users/ludvighedin/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    NODE_OPTIONS: '--max-old-space-size=768', LUDVIG_BIND: '127.0.0.1',
    LUDVIG_PORT_OFFSET: '200', LUDVIG_SELFTEST: run, LUDVIG_SELFTEST_GAME: url,
    LUDVIG_SELFTEST_ROOM: roomScript,
  });
  // Output may contain a renderer exception or private request body. Never inherit or save it.
  const child = spawn(electron, [root], { cwd: root, env, stdio: 'ignore' });
  const owned = new Map();
  let trackingFailed = false;
  let initialIdentity = '';
  child.once('spawn', () => {
    initialIdentity = identity(child.pid);
    if (initialIdentity) owned.set(child.pid, initialIdentity);
  });
  const tracking = setInterval(() => {
    try { trackDescendants(child.pid, owned); } catch { trackingFailed = true; }
  }, 200);
  let exited = false, timedOut = false;
  const signalOwned = signal => {
    if (!exited && child.pid && initialIdentity && identity(child.pid) === initialIdentity) child.kill(signal);
  };
  const status = await new Promise(resolve => {
    let killTimer, finishTimer;
    const finish = code => { clearTimeout(timer); clearTimeout(killTimer); clearTimeout(finishTimer); resolve(code); };
    const timer = setTimeout(() => {
      timedOut = true; signalOwned('SIGTERM');
      killTimer = setTimeout(() => {
        signalOwned('SIGKILL');
        finishTimer = setTimeout(() => finish(-1), 2000);
      }, 2000);
    }, 60000);
    child.once('error', () => { exited = true; finish(-1); });
    child.once('exit', code => { exited = true; finish(code ?? -1); });
  });
  try { trackDescendants(child.pid, owned); } catch { trackingFailed = true; }
  const cleaned = await stopOwned(owned);
  clearInterval(tracking);
  if (!cleaned || trackingFailed || !initialIdentity) {
    processCleanupPassed = false;
    return { game, phase, ok: false, runtimeCleanupNeedsInspection: true };
  }
  if (timedOut || status !== 0) return { game, phase, ok: false, appExit: status, timedOut,
    processCleanupPassed: true };
  let report;
  try {
    const file = path.join(run, 'report.json');
    regular(file);
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.length > 65536 || raw.toLowerCase().includes(key.toLowerCase())) fail('Unsafe test report');
    report = JSON.parse(raw);
  } catch { return { game, phase, ok: false, reportAvailable: false }; }
  const answer = report.steps?.find(step => step.step === 'room')?.answer;
  const result = { game, phase, ok: !report.error && answer?.game === game && answer?.phase === phase && answer?.ok === true };
  for (const name of ['testMode', 'ready', 'restored', 'styleApplicable', 'style']) result[name] = answer?.[name] === true;
  // Keep each session's screenshots. The shared user-data directory intentionally survives restarts.
  for (const name of fs.readdirSync(run).filter(name => /^(hub|game|room|panel)-(bar|content|tip)\.png$/.test(name))) {
    fs.renameSync(path.join(run, name), path.join(run, `${game}-${phase}-${name}`));
  }
  fs.unlinkSync(path.join(run, 'report.json'));
  return result;
}

try {
  if (process.argv.length !== 2 || !process.env.AGENT_JOB_TOKEN || !process.env.AGENT_RUNTIME_DIR) fail('Use the registered app-test lane');
  regular(root, true); regular(electron);
  const keyFile = process.env.LS_TEST_LICENSE_FILE;
  if (!keyFile || !path.isAbsolute(keyFile)) fail('A private test-key file is required');
  const keyInfo = regular(keyFile);
  if (keyInfo.size > 128 || (keyInfo.mode & 0o077)) fail('The test-key file must be private and bounded');
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  if (!UUID.test(key)) fail('The test-key file is invalid');
  regular(path.join(root, 'bundle/hub/commerce/config.json'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'bundle/hub/commerce/config.json'), 'utf8'));
  if (config.TEST_MODE !== 'true' || config.LS_STORE_ID !== '504842') fail('Stage the approved test configuration first');
  directory(path.join(root, 'output')); directory(output);
  const run = fs.mkdtempSync(path.join(output, 'run-'));
  runDirectory = run;
  const results = [];
  for (const game of ['shop', 'pigeon', 'karts', 'ritkaos']) {
    for (const phase of ['restore', 'restart']) {
      const result = await runApp({ game, phase, key, run });
      results.push(result);
      if (!result.ok) break;
    }
    if (!results.at(-1)?.ok) break;
  }
  const summary = { ok: results.length === 8 && results.every(item => item.ok), results,
    unchecked: ['federated-room grant endpoint and two-Mac journey', 'offline free play', 'refund/revocation', 'packaged update installation'],
    limits: 'UI ownership, selected styles and fresh-process restoration; screenshots require separate visual inspection.' };
  fs.writeFileSync(path.join(run, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ok: summary.ok, results, report: path.join(run, 'summary.json') }));
  if (!summary.ok) process.exitCode = 1;
} catch {
  console.error('Mac purchase self-test stopped. Check the private fixture, staged test configuration and registered app-test lane.');
  process.exitCode = 1;
} finally {
  if (runDirectory && processCleanupPassed) {
    const profile = path.join(runDirectory, 'user-data');
    if (fs.existsSync(profile)) {
      regular(profile, true);
      fs.rmSync(profile, { recursive: true });
    }
  }
}
