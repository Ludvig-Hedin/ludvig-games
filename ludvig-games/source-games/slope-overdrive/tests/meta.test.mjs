// Meta layer tests for Roll (slope-overdrive). Run:
// node --max-old-space-size=768 --experimental-vm-modules source-games/slope-overdrive/tests/meta.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 1. Every inline script compiles (the music blob is data, not script).
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (/\bsrc=|octet-stream/.test(m[1]) || !m[2].trim()) continue;
  if (/type=["']?module/.test(m[1])) new vm.SourceTextModule(m[2]); else new vm.Script(m[2]);
}

// 2. Load the pure meta block by its markers.
const start = html.indexOf('/* meta layer */\n// Daily seed');
const end = html.indexOf('/* meta layer ui */');
assert.ok(start > 0 && end > start, 'meta markers found');
const ctx = vm.createContext({});
const M = vm.runInContext(html.slice(start, end) + '\nMetaCore', ctx);

function fakeStorage(init = {}) {
  const data = { ...init };
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

test('daily seed is FNV-1a of slug:UTC date, same every call', () => {
  const ref = s => { let h = 0x811c9dc5; for (const c of Buffer.from(s)) h = Math.imul(h ^ c, 0x01000193); return h >>> 0; };
  assert.equal(M.dailySeed('2026-10-23'), ref('slope-overdrive:2026-10-23'));
  assert.equal(M.dailySeed('2026-10-23'), M.dailySeed('2026-10-23'));
  assert.notEqual(M.dailySeed('2026-10-23'), M.dailySeed('2026-10-24'));
  assert.equal(M.utcDay(new Date('2026-10-23T23:30:00-05:00')), '2026-10-24');
  assert.ok(html.includes("mode==='daily'?MetaCore.dailySeed(runDay)"), 'game uses meta daily seed');
  assert.ok(html.includes('function dateKey(){return new Date().toISOString().slice(0,10)}'), 'UTC date key');
});

const baseRun = { day: '2026-10-23', daily: false, score: 0, dist: 0, near: 0, time: 0, passed: 0, kmh: 0, jumps: 0 };

test('missions: 3 active, replaced on completion, never an immediate repeat', () => {
  const st = M.load(fakeStorage(), {});
  assert.equal(st.missions.active.length, 3);
  assert.equal(new Set(st.missions.active.map(a => a.id)).size, 3);
  const first = st.missions.active.map(a => a.id);
  same(first, ['score50', 'near3', 'km2']);
  const r = M.endRun(st, { ...baseRun, score: 60, dist: 600 });
  same(r.done, ['score50']);
  assert.equal(r.news, 'Unlocked: Teal slope'); // 50 pts also unlocks Teal
  const ids = st.missions.active.map(a => a.id);
  assert.ok(!ids.includes('score50'));
  assert.equal(new Set(ids).size, 3);
  assert.equal(st.missions.active.find(a => a.id === 'km2').p, 600, 'total missions accumulate');
  // Many runs: always 3 distinct, completed id never comes straight back.
  for (let i = 0; i < 200; i++) {
    const before = st.missions.active.map(a => a.id);
    const res = M.endRun(st, { ...baseRun, daily: i % 2 === 0, score: 300, dist: 3000, near: 9, time: 130, passed: 30, kmh: 250, jumps: 4 });
    const after = st.missions.active.map(a => a.id);
    assert.equal(new Set(after).size, 3);
    for (const id of res.done) assert.ok(!after.includes(id), 'no immediate repeat');
    for (const id of before) {
      const def = M.MISSIONS.find(m => m.id === id);
      if (def.kind === 'run' && (def.stat !== 'dscore' || i % 2 === 0)) assert.ok(res.done.includes(id), 'run mission done on a huge run: ' + id);
    }
  }
  assert.ok(st.stats.missionsDone > 100);
  const t = M.missionText({ id: 'km10', p: 1234 });
  assert.equal(t.progress, '1.2/10 km');
});

test('unlock rules, equip and badges', () => {
  const st = M.load(fakeStorage(), {});
  assert.equal(M.BALLS.length + M.THEMES.length, 12);
  assert.ok(M.MISSIONS.length >= 12 && M.MISSIONS.length <= 20);
  assert.ok(M.BADGES.length >= 6 && M.BADGES.length <= 10);
  assert.equal(M.equip(st, 'ball', 'ice'), false, 'locked ball refused');
  M.endRun(st, { ...baseRun, score: 49 });
  assert.equal(M.isUnlocked(st, M.THEMES.find(t => t.id === 'teal')), false);
  const r = M.endRun(st, { ...baseRun, score: 100 });
  assert.ok(r.unlocked.includes('b:ice') && r.unlocked.includes('t:teal'));
  assert.equal(st.unseen, true);
  assert.equal(M.equip(st, 'ball', 'ice'), true);
  assert.equal(st.ball, 'ice');
  assert.ok(M.badgeIds(st).includes('first') && M.badgeIds(st).includes('c100'));
  // Unlocked state is derived from stats, so a tampered equip falls back on load.
  const s2 = fakeStorage({ 'slope-overdrive-meta-v1': JSON.stringify({ ...st, ball: 'gold', theme: 'mono' }) });
  const st2 = M.load(s2, {});
  assert.equal(st2.ball, 'neon'); assert.equal(st2.theme, 'lime');
  const m = M.themeMatrix(M.THEMES[0]);
  same(Array.from(m).map(v => Math.round(v * 1000) / 1000), [1, 0, 0, 0, 1, 0, 0, 0, 1], 'default theme is identity');
});

test('daily best and tries live in the meta key', () => {
  const store = fakeStorage();
  const st = M.load(store, {});
  M.endRun(st, { ...baseRun, daily: true, score: 40 });
  M.endRun(st, { ...baseRun, daily: true, score: 25 });
  assert.equal(M.dailyBest(st, '2026-10-23'), 40);
  assert.equal(M.dailyTries(st, '2026-10-23'), 2);
  assert.equal(M.dailyBest(st, '2026-10-24'), 0);
  M.endRun(st, { ...baseRun, day: '2026-10-24', daily: true, score: 5 });
  assert.equal(M.dailyTries(st, '2026-10-24'), 1);
  assert.equal(st.stats.dailyDays, 2);
  M.save(store, st);
  assert.ok(!('slope-overdrive-v1' in store.data), 'meta never writes the main save key');
  assert.ok(html.includes("if(!daily)best=Math.max(best,score)"), 'daily runs do not raise main best');
});

test('ghost encode/decode round trip, cap, size and save rule', () => {
  const rec = M.makeRecorder(M.MAX_SAMPLES);
  let x = 0, y = 11.45, d = 0, v = 24;
  for (let i = 0; i < M.MAX_SAMPLES + 50; i++) { rec.push(x, y, d); x = 30 * Math.sin(i / 37); d += v / 12; y -= v * 0.3 / 12; v = Math.min(86, v + 0.05); }
  assert.equal(rec.n, M.MAX_SAMPLES, 'capped at 5 minutes');
  const data = M.encodeGhost(rec.buf, rec.n);
  assert.ok(data.length < 60000, `ghost size ${data.length}`);
  const pos = M.decodeGhost(data, rec.n);
  for (let i = 0; i < rec.n * 3; i++) assert.ok(Math.abs(pos[i] - rec.buf[i] / 100) < 1e-3);
  assert.equal(M.decodeGhost(data, rec.n + 1), null);
  assert.equal(M.decodeGhost('1,2,zz!', 1), null);
  const out = new Float32Array(3), g = { n: rec.n, pos };
  assert.ok(M.sampleGhost(g, 0.5 / 12, out));
  assert.ok(Math.abs(out[2] - (pos[2] + pos[5]) / 2) < 1e-3, 'interpolates');
  assert.equal(M.sampleGhost(g, 400, out), false, 'gone after the run ended');
  const store = fakeStorage(), seed = M.dailySeed('2026-10-23');
  const small = M.makeRecorder(10); for (let i = 0; i < 10; i++) small.push(i, -i, i * 5);
  assert.equal(M.saveGhost(store, small, '2026-10-23', seed, 50), true);
  assert.equal(M.saveGhost(store, small, '2026-10-23', seed, 40), false, 'worse run kept out');
  assert.equal(M.saveGhost(store, small, '2026-10-23', seed, 60), true);
  const loaded = M.loadGhost(store, '2026-10-23', seed);
  assert.equal(loaded.score, 60); assert.equal(loaded.n, 10);
  assert.equal(M.loadGhost(store, '2026-10-24', seed), null, 'other day has no ghost');
  store.data['slope-overdrive-ghost-v1'] = '{oops';
  assert.equal(M.loadGhost(store, '2026-10-23', seed), null);
  assert.equal(M.saveGhost(store, small, '2026-10-23', seed, 1), true, 'corrupt ghost replaced');
});

test('safe load: corrupt, wrong types, throwing or missing storage; migration', () => {
  const legacy = { best: 230, records: [{ score: 230, distance: 2305 }, { score: 90, distance: 905 }], daily: { '2026-10-20': 70, '2026-10-21': 40 } };
  for (const raw of ['{bad json', 'null', '5', '"x"', '[]']) {
    const st = M.load(fakeStorage({ 'slope-overdrive-meta-v1': raw }), legacy);
    assert.equal(st.missions.active.length, 3);
    assert.equal(st.stats.bestScore, 230, 'migrated from existing best');
  }
  const typed = M.load(fakeStorage({ 'slope-overdrive-meta-v1': JSON.stringify({ v: 1, stats: { runs: 'x', bestScore: -5, totalDist: 1e3 }, missions: { active: [{ id: 'nope' }, { id: 'near3', p: 'q' }, { id: 'near3' }] }, ghost: 0 }) }), legacy);
  assert.equal(typed.stats.runs, 0); assert.equal(typed.stats.bestScore, 0); assert.equal(typed.stats.totalDist, 1000);
  same(typed.missions.active.map(a => a.id).filter(id => id === 'near3').length, 1);
  assert.equal(typed.missions.active.length, 3);
  assert.equal(typed.ghost, true);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const st = M.load(throwing, legacy);
  assert.equal(st.stats.bestScore, 230);
  assert.equal(M.save(throwing, st), false);
  assert.equal(M.save(null, st), false);
  assert.equal(M.load(null, null).stats.runs, 0);
  const mig = M.load(fakeStorage(), legacy);
  assert.equal(mig.stats.totalDist, 3210); assert.equal(mig.stats.runs, 2); assert.equal(mig.stats.dailyDays, 2);
  assert.ok(M.isUnlocked(mig, M.BALLS.find(b => b.id === 'ice')), 'returning players keep earned unlocks');
});

console.log(`${passed} tests passed`);
