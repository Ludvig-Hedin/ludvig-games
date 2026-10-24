/* Score bridge for existing games (docs/platform-api.md). Watches the storage keys listed in
   window.__LUDVIG_SCORES and submits new bests through Ludvig.score. It never changes what a game stores.
   Many games save their best mid-run, so each board submits only its best value once it has been stable
   for 4 s, at most once per 30 s, and flushes when the page is hidden. */
(() => {
  'use strict';
  const config = window.__LUDVIG_SCORES;
  if (!config || typeof config !== 'object' || window.__ludvigBridge) return;
  window.__ludvigBridge = true;
  const STABLE_MS = 4000;
  const GAP_MS = 30000;
  const STATE_KEY = 'ludvig:bridge';
  const boards = Object.entries(config).filter(([, board]) => board && typeof board.key === 'string');
  if (!boards.length) return;
  // build.py names the game in __LUDVIG_GAME; it runs at /<slug>/ and /games/<slug>/.
  const slug = (window.__LUDVIG_GAME && window.__LUDVIG_GAME.slug) || boards[0][0].split(':')[0];
  const prefix = `ludvig-games:${slug}:`;

  let proto, setItem, getItem, store = null;
  try { proto = Storage.prototype; setItem = proto.setItem; getItem = proto.getItem; } catch { return; }
  try { store = window.localStorage; } catch { /* No storage: state stays in memory. */ }

  const matchers = boards.map(([id, board]) => {
    const kind = board.match || 'exact';
    let test = key => key === board.key;
    if (kind === 'prefix') test = key => key.startsWith(board.key);
    else if (kind === 'regex') { try { const re = new RegExp(board.key); test = key => re.test(key); } catch { test = () => false; } }
    return { id, board, test };
  });
  const strip = key => (key.startsWith(prefix) ? key.slice(prefix.length) : key);
  const watched = key => matchers.filter(m => m.test(strip(key)));

  // `path` is split on '.' only; keys may contain ':' or '-' (e.g. "0:normal.score", "scores.0-0").
  function valueAt(text, path) {
    if (typeof text !== 'string') return null;
    let value;
    if (!path) {
      value = text.trim() === '' ? NaN : Number(text);
      if (!Number.isFinite(value)) { try { value = JSON.parse(text); } catch { return null; } }
    } else {
      try { value = JSON.parse(text); } catch { return null; }
      for (const part of path.split('.')) {
        if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return null;
        value = value[part];
      }
    }
    if (typeof value === 'string' && value.trim() !== '') value = Number(value);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  const readState = () => {
    try { const state = JSON.parse(getItem.call(store, STATE_KEY)); if (state && typeof state === 'object') return { sent: state.sent || {}, pending: state.pending || {} }; } catch { /* Missing or corrupt. */ }
    return { sent: {}, pending: {} };
  };
  const state = readState();
  // Other games' entries (open in other tabs) are kept as stored; this game's boards come from memory.
  const saveState = () => {
    try {
      if (!store) return;
      const stored = readState();
      for (const part of ['sent', 'pending']) {
        for (const id of Object.keys(stored[part])) if (config[id]) delete stored[part][id];
        for (const [id, value] of Object.entries(state[part])) if (config[id]) stored[part][id] = value;
      }
      setItem.call(store, STATE_KEY, JSON.stringify(stored));
    } catch { /* Storage full. */ }
  };
  const timers = {};
  const isBetter = (board, a, b) => b === undefined || b === null || (board.order === 'asc' ? a < b : a > b);
  const usable = (board, value) => value !== null && value >= board.min && value <= board.max
    && !(value === 0 && board.order !== 'asc'); // 0 on a higher-is-better board means "no score yet"

  function submit(id) {
    const entry = state.pending[id];
    if (!entry || !window.Ludvig) return;
    delete state.pending[id];
    state.sent[id] = Date.now();
    saveState();
    window.Ludvig.score(id, entry.value, { source: 'bridge' });
  }

  function schedule(id, delay) {
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      const wait = (state.sent[id] || 0) + GAP_MS - Date.now();
      if (wait > 0) schedule(id, wait); else submit(id);
    }, Math.max(STABLE_MS, delay || 0));
  }

  function observe(key, value, before) {
    for (const { id, board } of watched(key)) {
      const next = valueAt(value, board.path);
      if (next === null || next === valueAt(before, board.path) || !usable(board, next)) continue;
      const pending = state.pending[id];
      if (pending && !isBetter(board, next, pending.value)) continue;
      state.pending[id] = { value: next, at: Date.now() };
      saveState();
      schedule(id, (state.sent[id] || 0) + GAP_MS - Date.now());
    }
  }

  try {
    proto.setItem = function (key, value) {
      let matches = false, before = null;
      try { matches = watched(String(key)).length > 0; if (matches) before = getItem.call(this, key); } catch { matches = false; }
      const result = setItem.apply(this, arguments);
      if (matches) try { observe(String(key), String(value), before); } catch { /* Never disturb the game. */ }
      return result;
    };
  } catch { return; }

  // Hidden page: send what may be sent now; the rest waits in storage for the next visit.
  function flush() {
    for (const id of Object.keys(state.pending)) {
      if (!config[id]) continue;
      if (Date.now() - (state.sent[id] || 0) >= GAP_MS) { clearTimeout(timers[id]); submit(id); }
    }
  }
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // Values left from an earlier visit (closed within 30 s of a submit) go out after the usual wait.
  for (const [id, entry] of Object.entries(state.pending)) {
    if (!config[id]) continue;
    if (!entry || !Number.isFinite(entry.value) || Date.now() - entry.at > 864e5) { delete state.pending[id]; continue; }
    schedule(id, (state.sent[id] || 0) + GAP_MS - Date.now());
  }
  for (const [id, at] of Object.entries(state.sent)) if (config[id] && Date.now() - at > GAP_MS) delete state.sent[id];
  saveState();
})();
