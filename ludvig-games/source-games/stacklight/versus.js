/* Stacks · Versus helpers. Pure functions shared by index.html and tests/versus.test.mjs:
   a seeded seven-piece bag, the garbage table, cancelling, adding garbage rows,
   a compact board encoding for opponents' mini boards and the final standings. */
(function (root) {
  'use strict';
  const COLS = 10, ROWS = 22, HIDDEN = 2, GARBAGE = 8;
  const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Same seed, same piece order on every device.
  function bag(rand) {
    const b = TYPES.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
  // Clearing two or more lines sends garbage: 2 → 1, 3 → 2, 4 → 4.
  function garbageFor(lines) { return [0, 0, 1, 2, 4][lines] || (lines > 4 ? 4 : 0); }
  // Cleared lines cancel incoming garbage first; the rest goes to an opponent.
  function cancel(pending, out) {
    const queue = pending.map(p => ({ n: p.n, h: p.h }));
    let send = out;
    while (send > 0 && queue.length) {
      const take = Math.min(send, queue[0].n);
      queue[0].n -= take; send -= take;
      if (!queue[0].n) queue.shift();
    }
    return { pending: queue, send };
  }
  function pendingRows(pending) { return pending.reduce((s, p) => s + p.n, 0); }
  // Pushes the stack up by n rows with one gap at column `hole`. Mutates and returns the grid.
  // `overflow` is true when blocks are pushed out of the top: that player is out.
  function addGarbage(grid, n, hole) {
    n = Math.max(0, Math.min(ROWS, n | 0));
    hole = Math.max(0, Math.min(COLS - 1, hole | 0));
    let overflow = false;
    for (let i = 0; i < n; i++) {
      const top = grid.shift();
      if (top.some(Boolean)) overflow = true;
      const row = Array(COLS).fill(GARBAGE); row[hole] = 0;
      grid.push(row);
    }
    return { grid, overflow };
  }
  // 200 characters, one per visible cell ('0' empty, '1'–'8' colour), the falling piece included.
  function encode(grid, piece) {
    const cells = [];
    for (let y = HIDDEN; y < ROWS; y++) for (let x = 0; x < COLS; x++) cells.push(grid[y][x] | 0);
    if (piece) piece.m.forEach((row, r) => row.forEach((v, c) => {
      const x = piece.x + c, y = piece.y + r - HIDDEN;
      if (v && x >= 0 && x < COLS && y >= 0 && y < ROWS - HIDDEN) cells[y * COLS + x] = v;
    }));
    return cells.join('');
  }
  function decode(s) {
    const out = [];
    for (let y = 0; y < ROWS - HIDDEN; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) { const v = (s && s.charCodeAt(y * COLS + x) - 48) | 0; row.push(v >= 0 && v <= GARBAGE ? v : 0); }
      out.push(row);
    }
    return out;
  }
  function target(self, alive, rand = Math.random) {
    const list = alive.filter(id => id !== self);
    return list.length ? list[Math.floor(rand() * list.length)] : null;
  }
  // ids: everyone who started; deaths: ids in the order they went out. Winner first.
  function standings(ids, deaths) {
    const alive = ids.filter(id => !deaths.includes(id));
    const out = deaths.filter(id => ids.includes(id)).reverse();
    return alive.concat(out);
  }
  root.StacksVersus = { COLS, ROWS, HIDDEN, GARBAGE, TYPES, rng, bag, garbageFor, cancel, pendingRows, addGarbage, encode, decode, target, standings };
})(typeof globalThis !== 'undefined' ? globalThis : this);
