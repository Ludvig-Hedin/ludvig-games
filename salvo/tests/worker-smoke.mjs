#!/usr/bin/env node
/**
 * Test the compiled Cloudflare Worker in an isolated, disposable workerd/D1
 * instance. Uses dispatchFetch, never the shared browser preview or port4173.
 * Run after a successful build: node tests/worker-smoke.mjs
 */
import { Miniflare, Log, LogLevel } from 'miniflare';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runHttpSmoke } from './http-smoke.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/server');
let mf, temporary;
try {
  const config = JSON.parse(await readFile(path.join(output, 'wrangler.json'), 'utf8'));
  const entry = path.resolve(output, config.main);
  if (!entry.startsWith(output + path.sep)) throw new Error('Worker entrypoint is outside dist/server.');
  const entries = await readdir(output, { recursive: true, withFileTypes: true });
  const files = entries.filter(item => item.isFile() && /\.(?:m?js)$/.test(item.name))
    .map(item => path.join(item.parentPath, item.name)).sort();
  const ordered = [entry, ...files.filter(file => file !== entry)];
  const hash = createHash('sha256');
  const modules = await Promise.all(ordered.map(async file => {
    const contents = await readFile(file, 'utf8');
    return { type: 'ESModule', path: file, contents };
  }));
  for (const module of modules) { hash.update(path.relative(output, module.path)); hash.update(module.contents); }
  temporary = await mkdtemp(path.join(tmpdir(), 'naval-worker-qa-'));
  mf = new Miniflare({
    name: 'naval-isolated-api-test',
    modules,
    modulesRoot: output,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: config.vars ?? {},
    d1Databases: { DB: 'naval-ephemeral-qa' },
    d1Persist: path.join(temporary, 'd1'),
    cachePersist: false,
    host: '127.0.0.1',
    port: 0,
    cf: false,
    log: new Log(LogLevel.ERROR),
    logRequests: false,
    telemetry: { enabled: false },
  });
  // Workerd's internal loopback transport stays private to this test instance.
  // Requests below use dispatchFetch; no browser or user-facing preview starts.
  await mf.ready;
  const db = await mf.getD1Database('DB');
  const journal = JSON.parse(await readFile(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
  let statements = 0;
  for (const migration of journal.entries) {
    const sql = await readFile(path.join(root, 'drizzle', `${migration.tag}.sql`), 'utf8');
    const commands = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await db.batch(commands.map(command => db.prepare(command)));
    statements += commands.length;
  }
  console.log(`Compiled Worker loaded (${hash.digest('hex').slice(0, 12)}); ${statements} migration statements applied to disposable D1.`);
  await runHttpSmoke('https://naval-isolated.test', (input, init) => mf.dispatchFetch(input, init));
  console.log('Isolated compiled-Worker integration passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (mf) await mf.dispose();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
