/** The hub split (docs/free-account-plan.md): static start page config, API Worker config, limiter numbers and the
    API base that build.py puts into ludvig.js. Checks files only; nothing here talks to Cloudflare. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RATE_LIMITS } from '../../worker/util.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');

/** JSON with // and /* comments (wrangler's JSONC), comments removed outside strings. */
function jsonc(text) {
  let out = '', i = 0, inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) { out += c; if (c === '\\') { out += text[i + 1]; i += 2; continue; } if (c === '"') inString = false; i++; continue; }
    if (c === '"') { inString = true; out += c; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

test('wrangler.static.jsonc: assets only, no Worker code, the custom domain on the current account', () => {
  const config = jsonc(read('wrangler.static.jsonc'));
  assert.equal(config.name, 'ludvig-games');
  assert.equal(config.main, undefined, 'no script: every request is a free static asset');
  assert.deepEqual(config.assets, { directory: './public', html_handling: 'auto-trailing-slash', not_found_handling: '404-page' });
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, [{ pattern: 'games.ludvighedin.com', custom_domain: true }]);
  for (const key of ['d1_databases', 'durable_objects', 'migrations', 'ratelimits', 'kv_namespaces', 'r2_buckets', 'account_id', 'triggers']) assert.equal(config[key], undefined, key);
});

test('wrangler.api.jsonc: the API Worker for the Free account', () => {
  const config = jsonc(read('wrangler.api.jsonc'));
  assert.equal(config.name, 'ludvig-games-api');
  assert.equal(config.main, 'worker/index.mjs');
  assert.equal(config.assets, undefined, 'no static files on the API');
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.observability, { enabled: false });
  for (const key of ['routes', 'route', 'account_id', 'triggers', 'r2_buckets', 'kv_namespaces', 'vars']) assert.equal(config[key], undefined, key);
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'ludvig_games', database_id: 'REPLACE_ON_FREE_ACCOUNT', migrations_dir: 'migrations' }]);
  assert.match(read('wrangler.api.jsonc'), /main agent fills this in/);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'MP_ROOM', class_name: 'MpRoom' }, { name: 'MP_LOBBY', class_name: 'MpLobby' }]);
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['MpRoom', 'MpLobby'] }]);
  const limits = Object.fromEntries(config.ratelimits.map(rule => [rule.name, rule.simple]));
  assert.deepEqual(limits, RATE_LIMITS, 'the bindings match worker/util.mjs');
  assert.equal(new Set(config.ratelimits.map(rule => rule.namespace_id)).size, config.ratelimits.length);
  assert.ok(config.ratelimits.every(rule => /^\d+$/.test(rule.namespace_id) && [10, 60].includes(rule.simple.period)));
  const worker = read('worker/index.mjs');
  for (const name of Object.keys(RATE_LIMITS)) assert.match(worker, new RegExp(`'${name}'`), `${name} is used`);
  assert.match(worker, /export class MpRoom/);
  assert.match(worker, /export class MpLobby/);
});

const python = (code, env = {}) => execFileSync('python3', ['-c', code], { cwd: fileURLToPath(ROOT), env: { ...process.env, ...env }, encoding: 'utf8' });

test('build.py puts LUDVIG_API_BASE into the published ludvig.js (empty means same origin)', () => {
  const source = read('assets/ludvig.js');
  const script = base => python('import build, sys; sys.stdout.write(build.ludvig_script(build.api_base()))', { LUDVIG_API_BASE: base });
  assert.equal(script(''), source, 'same origin: the file is unchanged');
  assert.equal(script('http://127.0.0.1:4318/'), `window.__LUDVIG_API="http://127.0.0.1:4318";\n${source}`);
  assert.equal(script('https://ludvig-games-api.ludvig.workers.dev'), `window.__LUDVIG_API="https://ludvig-games-api.ludvig.workers.dev";\n${source}`);
  for (const bad of ['http://evil.example', 'javascript:alert(1)', 'https://x.dev/api', '"};alert(1);//']) {
    assert.throws(() => script(bad), /LUDVIG_API_BASE/, bad);
  }
});

test('the API Worker bundles the same board config the pages read', () => {
  const generated = read('worker/boards.gen.mjs');
  const published = JSON.parse(read('public/assets/boards.json'));
  const body = generated.slice(generated.indexOf('export default ') + 'export default '.length).trim().replace(/;$/, '');
  assert.deepEqual(JSON.parse(body), published, 'run python3 build.py after changing scores.json or games.json');
});
