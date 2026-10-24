const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const hub = path.join(__dirname, '..');
const imports = JSON.parse(fs.readFileSync(path.join(hub, 'docs/game-import-2026-10-21.json')));
let scripts = 0;
function parse(file, source, module) {
  try {
    if (module) new vm.SourceTextModule(source, { identifier: file });
    else new vm.Script(source, { filename: file });
    scripts++;
  } catch (error) { throw new Error(`${file}: ${error.message}`); }
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const p = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Symlink in runtime: ${p}`);
    return entry.isDirectory() ? walk(p) : [p];
  });
}
for (const item of imports) {
  const directory = path.join(hub, 'source-games', item.slug);
  for (const file of walk(directory)) {
    if (file.endsWith('.js')) parse(file, fs.readFileSync(file, 'utf8'), true);
    if (!file.endsWith('.html')) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = match[1], code = match[2];
      if (/\bsrc\s*=/.test(attrs)) continue;
      const type = attrs.match(/\btype\s*=\s*["']([^"']*)/i)?.[1];
      if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
      parse(file, code, type === 'module');
    }
  }
}
// A cleared old edition must never clear the live game's record or another edition.
class Store {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  getItem(key) { return this.data.get(String(key)) ?? null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
  key(i) { return [...this.data.keys()][i] ?? null; }
}
const local = new Store(), session = new Store();
local.setItem('score', 'original');
const shim = fs.readFileSync(path.join(hub, 'assets/game-storage.js'), 'utf8');
function edition(slug) {
  const window = { localStorage: local, sessionStorage: session };
  vm.runInNewContext(shim, { window, document: { currentScript: { dataset: { game: slug } } } });
  return window;
}
const a = edition('version-a'), b = edition('version-b');
a.localStorage.setItem('score', 12); b.localStorage.score = 50;
assert.equal(a.localStorage.getItem('score'), '12');
assert.equal(b.localStorage.getItem('score'), '50');
assert.equal(local.getItem('score'), 'original');
assert.deepEqual(Object.keys(a.localStorage), ['score']);
assert.equal(a.localStorage.length, 1);
assert.equal(a.localStorage.key(0), 'score');
assert.equal(a.localStorage.key(1), null);
a.sessionStorage.setItem('score', 7);
assert.equal(a.sessionStorage.getItem('score'), '7');
assert.equal(b.sessionStorage.getItem('score'), null);
a.localStorage.clear();
assert.equal(a.localStorage.getItem('score'), null);
assert.equal(b.localStorage.getItem('score'), '50');
assert.equal(local.getItem('score'), 'original');
delete b.localStorage.score;
assert.equal(b.localStorage.getItem('score'), null);
console.log(JSON.stringify({ importedGames: imports.length, scriptsParsed: scripts, storageIsolation: 'passed' }));
