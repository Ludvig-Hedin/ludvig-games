import test from 'node:test';
import assert from 'node:assert/strict';
import { browser, flush } from './browser-fakes.mjs';

const BOARDS = {
  'demo:a': { game: 'demo', gameName: 'Demo', label: 'Score', mode: 'Classic', format: 'int' },
  'demo:b': { game: 'demo', gameName: 'Demo', label: 'Time', mode: 'Chill', format: 'time-s' },
};
const entries = n => Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: `Player ${i + 1}`, score: 1000 - i * 10, player: `p${i + 1}` }));

function setup({ game, you = { rank: 3, score: 980, player: 'p3' }, week = { rank: 3, score: 120 }, best = 120 } = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body && JSON.parse(options.body) });
    const reply = body => ({ status: 200, json: async () => body });
    if (String(url) === '/assets/boards.json') return reply(BOARDS);
    if (String(url).startsWith('/api/scores?')) return reply({ entries: entries(Number(new URL(url, 'https://x').searchParams.get('limit'))), you });
    if (String(url) === '/api/scores') return reply({ ok: true, best, rank: 1, week });
    if (String(url) === '/api/name') return reply({ ok: true, name: calls.at(-1).body.name });
    return reply({});
  };
  const w = browser({ fetch, dom: true, game });
  w.run('ludvig.js');
  return { w, calls, body: w.document.body };
}
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const text = node => node.textContent;
const byTag = (root, tag) => root.findAll(node => node.tagName === tag);
const scoreCalls = calls => calls.filter(c => c.url.startsWith('/api/scores?')).map(c => Object.fromEntries(new URL(c.url, 'https://x').searchParams));

test('icons are real SVG, never emoji or text glyphs', () => {
  const { w } = setup();
  for (const [name, icon] of Object.entries(w.Ludvig.ui.icons)) {
    assert.match(icon, /^<svg [^>]*viewBox="0 0 24 24"[^>]*aria-hidden="true"/, name);
    assert.doesNotMatch(icon, /[^\x00-\x7f]/, `${name}: ASCII markup only`);
  }
  assert.deepEqual(Object.keys(w.Ludvig.ui.icons).sort(), ['close', 'left', 'right', 'trophy']);
});

test('ui.board renders a compact list in Shadow DOM with your row and a period toggle', async () => {
  const { w, calls } = setup();
  const container = w.document.createElement('div');
  w.document.body.append(container);
  const board = w.Ludvig.ui.board(container, { board: 'demo:a', limit: 5 });
  await settle();
  const host = container.children[0];
  assert.ok(host.shadowRoot, 'isolated from game CSS');
  const style = host.shadowRoot.children[0].textContent;
  assert.match(style, /:host\{display:block;font:inherit;color:inherit/);
  assert.match(style, /tabular-nums/);
  const rows = byTag(host, 'LI');
  assert.equal(rows.length, 5);
  assert.equal(rows[2].getAttribute('class'), 'you');
  assert.deepEqual(rows[0].children.map(text), ['1', 'Player 1', '1,000']);
  const buttons = byTag(host, 'BUTTON');
  assert.deepEqual(buttons.map(text), ['Week', 'Month', 'All']);
  assert.equal(scoreCalls(calls).at(-1).period, '7d');
  buttons[1].click();
  await settle();
  assert.equal(scoreCalls(calls).at(-1).period, '30d');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  const before = scoreCalls(calls).length;
  w.dispatchEvent(new w.CustomEvent('ludvig:score', { detail: { board: 'demo:a' } }));
  await settle();
  assert.equal(scoreCalls(calls).length, before + 1, 'refreshes after a new score');
  board.destroy();
  assert.equal(container.children.length, 0);
});

test('ui.board shows your rank below when you are not in the list, and handles offline', async () => {
  const { w } = setup({ you: { rank: 42, score: 5, player: 'me' } });
  const container = w.document.createElement('div');
  w.Ludvig.ui.board(container, { board: 'demo:a', limit: 3, periods: ['all'] });
  await settle();
  const host = container.children[0];
  assert.equal(byTag(host, 'BUTTON').length, 0, 'no toggle for a single period');
  assert.ok(host.all().some(node => text(node) === 'You · #42 · 5'));
  assert.equal(w.Ludvig.ui.board(null, { board: 'x' }), null);
});

test('ui.open shows a full sheet: periods, top 20, your rank, modes, rename, Escape closes', async () => {
  const { w, calls, body } = setup({ game: { slug: 'demo', name: 'Demo', boards: ['demo:a', 'demo:b'], button: 'none' } });
  const opener = w.document.createElement('button');
  body.append(opener);
  opener.focus();
  const sheet = w.Ludvig.ui.open({ board: 'demo:a' });
  await settle();
  const host = body.children.at(-1);
  const dialog = host.find(node => node.getAttribute('role') === 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(byTag(host, 'LI').length, 20);
  assert.ok(host.all().some(node => text(node) === 'Your best: 980 · #3'));
  assert.ok(host.all().some(node => node.tagName === 'H2' && text(node) === 'Demo'));
  const close = host.find(node => node.getAttribute('aria-label') === 'Close leaderboard');
  assert.match(close.innerHTML, /^<svg/);
  assert.equal(w.document.activeElement, close, 'focus moves into the sheet');
  const periods = host.findAll(node => node.getAttribute('data-period'));
  assert.deepEqual(periods.map(text), ['7 days', '30 days', 'All time']);
  periods[0].click();
  await settle();
  assert.equal(scoreCalls(calls).at(-1).period, '7d');
  assert.equal(scoreCalls(calls).at(-1).limit, '20');
  host.find(node => node.getAttribute('aria-label') === 'Next mode').click();
  await settle();
  assert.equal(scoreCalls(calls).at(-1).game, 'demo:b');
  // Rename inline.
  host.find(node => node.tagName === 'BUTTON' && text(node) === 'Edit').click();
  const input = host.find(node => node.tagName === 'INPUT');
  assert.equal(w.document.activeElement, input);
  input.value = 'Night Owl';
  host.find(node => node.tagName === 'FORM').dispatch('submit');
  await settle();
  assert.equal(calls.find(c => c.url === '/api/name').body.name, 'Night Owl');
  assert.equal(w.Ludvig.player.name, 'Night Owl');
  // Keys typed in the sheet never reach the game.
  const key = input.dispatch('keydown', { key: 'a' });
  assert.equal(key.stopped, true);
  input.dispatch('keydown', { key: 'Escape' });
  assert.ok(!host.isConnected, 'Escape closes');
  assert.equal(w.document.activeElement, opener, 'focus returns');
  sheet.close();
});

test('a toast shows "#3 this week" for bridged games by default, and only on opt-in for native calls', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { w, body } = setup({ best: 120, week: { rank: 3, score: 120 } });
  const toasts = () => body.children.filter(node => node.shadowRoot && node.shadowRoot.find(n => n.getAttribute('class') === 'toast'));
  await w.Ludvig.score('demo:a', 120);
  assert.equal(toasts().length, 0, 'native call without opt-in');
  await w.Ludvig.score('demo:a', 120, { source: 'bridge' });
  assert.equal(toasts().length, 1);
  const toast = toasts()[0].shadowRoot.find(n => n.getAttribute('class') === 'toast');
  assert.equal(text(toast), 'New best · #3 this week');
  assert.match(toast.innerHTML, /^<svg/);
  t.mock.timers.tick(3300);
  assert.equal(toasts().length, 0, 'auto-hides');
  w.Ludvig.ui.toast = true;
  await w.Ludvig.score('demo:a', 120);
  assert.equal(toasts().length, 1, 'game opted in');
  toasts()[0].shadowRoot.find(n => n.getAttribute('class') === 'toast').click();
  assert.equal(toasts().length, 0, 'tap dismisses');
  w.Ludvig.ui.toast = false;
  await w.Ludvig.score('demo:a', 120, { source: 'bridge' });
  assert.equal(toasts().length, 0, 'game opted out');
  w.Ludvig.ui.toast = undefined;
  await w.Ludvig.score('demo:a', 100, { source: 'bridge' });
  assert.equal(toasts().length, 0, 'not this week\'s best: no toast');
});

test('the floating trophy button follows games.json lbButton and opens the sheet', async () => {
  const { w, body } = setup({ game: { slug: 'demo', name: 'Demo', boards: ['demo:a'], button: 'tl' } });
  const host = body.children[0];
  const button = host.shadowRoot.find(node => node.tagName === 'BUTTON');
  assert.equal(button.getAttribute('class'), 'lb tl');
  assert.equal(button.getAttribute('aria-label'), 'Leaderboard');
  assert.match(button.innerHTML, /^<svg/);
  const css = host.shadowRoot.children[0].textContent;
  assert.match(css, /width:36px;height:36px/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  const click = button.click();
  assert.equal(click.stopped, true, 'the tap does not reach the game');
  await settle();
  assert.ok(body.children.some(node => node.shadowRoot?.find(n => n.getAttribute('role') === 'dialog')));
  for (const config of [{ boards: ['demo:a'], button: 'none' }, { boards: [], button: 'br' }]) {
    const other = setup({ game: { slug: 'demo', ...config } });
    assert.equal(other.body.children.length, 0, JSON.stringify(config));
  }
});
