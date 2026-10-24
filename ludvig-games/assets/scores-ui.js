/* My records page (/me/). Needs /assets/ludvig.js first. In-game boards live in ludvig.js (Ludvig.ui). */
(() => {
  'use strict';
  const L = window.Ludvig;
  if (!L) return;

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.filter(child => child !== null && child !== undefined));
    return node;
  };

  /** "Playing as <name> Change" with an inline rename form. */
  function nameEditor(container, onRename) {
    const nameText = el('strong');
    const show = el('div', { class: 'name-show' }, 'Playing as ', nameText, ' ');
    const input = el('input', { id: `name-input-${Math.random().toString(36).slice(2, 7)}`, type: 'text', maxlength: '16', autocomplete: 'nickname', spellcheck: 'false', enterkeyhint: 'done' });
    const error = el('p', { class: 'name-error', role: 'status' });
    const form = el('form', { class: 'name-form', hidden: true },
      el('label', { for: input.id, text: 'Your name' }), input,
      el('div', { class: 'name-actions' }, el('button', { class: 'button', type: 'submit', text: 'Save' }),
        el('button', { class: 'link-button', type: 'button', text: 'Cancel', onclick: () => close() })), error);
    const change = el('button', { class: 'link-button', type: 'button', text: 'Change', onclick: () => {
      input.value = L.player.name;
      error.textContent = '';
      show.hidden = true;
      form.hidden = false;
      input.focus();
      input.select();
    } });
    show.append(change);
    const refresh = () => { nameText.textContent = L.player.name; };
    const close = () => { form.hidden = true; show.hidden = false; change.focus(); };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const value = input.value;
      if (!L.cleanName(value)) { error.textContent = 'Use 2–16 letters or numbers.'; return; }
      const result = await L.setName(value);
      if (!result.ok) { error.textContent = 'That name isn’t allowed. Try another.'; return; }
      refresh();
      close();
      onRename?.();
    });
    input.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    addEventListener('storage', event => { if (event.key === 'ludvig:player') refresh(); });
    refresh();
    container.append(show, form);
    return { refresh };
  }

  /* My records */
  const PREFIX = slug => `ludvig-games:${slug}:`;
  function valueAt(text, path) {
    if (typeof text !== 'string') return null;
    let value;
    try { value = path ? JSON.parse(text) : Number(text); } catch { return null; }
    if (!path && !Number.isFinite(value)) { try { value = JSON.parse(text); } catch { return null; } }
    if (path) for (const part of path.split('.')) {
      if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return null;
      value = value[part];
    }
    if (typeof value === 'string' && value.trim() !== '') value = Number(value);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  function localBest(board) {
    if (!board.key) return null;
    let best = null;
    try {
      const keys = [];
      if (board.match === 'exact') keys.push(board.scoped ? PREFIX(board.game) + board.key : board.key);
      else {
        const test = board.match === 'regex' ? (re => key => re.test(key))(new RegExp(board.key)) : key => key.startsWith(board.key);
        for (let i = 0; i < localStorage.length; i++) {
          const full = localStorage.key(i);
          if (board.scoped !== full.startsWith(PREFIX(board.game))) continue;
          if (test(board.scoped ? full.slice(PREFIX(board.game).length) : full)) keys.push(full);
        }
      }
      for (const key of keys) {
        const value = valueAt(localStorage.getItem(key), board.path);
        if (value === null || value < board.min || value > board.max || (value === 0 && board.order !== 'asc')) continue;
        if (best === null || (board.order === 'asc' ? value < best : value > best)) best = value;
      }
    } catch { return null; }
    return best;
  }

  async function recordsPage(main) {
    const status = main.querySelector('#records-status');
    const list = main.querySelector('#records-list');
    nameEditor(main.querySelector('[data-name-edit]'));
    const [boards, api] = await Promise.all([L.boards(), L.records()]);
    const online = new Map(api.records.map(record => [record.game, record]));
    const rows = [];
    for (const [id, board] of Object.entries(boards)) {
      const record = online.get(id);
      const local = record ? null : localBest(board);
      if (!record && local === null) continue;
      const what = board.mode ? `${board.mode} · ${board.label}` : board.label;
      rows.push(el('li', { class: 'records-row' },
        el('a', { class: 'records-game', href: `/${board.game}/` }, el('span', { class: 'records-game-name', text: board.gameName }), el('span', { class: 'records-mode', text: what })),
        el('span', { class: 'records-best' }, el('span', { class: 'records-score', text: L.format(record ? record.best : local, board.format) }),
          el('span', { class: 'records-rank', text: record ? (record.rank ? `#${record.rank} all time` : '') : 'Saved on this device' }))));
    }
    list.replaceChildren(...rows);
    if (api.error && !Object.keys(boards).length) status.textContent = 'Records are unavailable right now.';
    else if (api.error) status.textContent = rows.length ? 'Couldn’t reach the leaderboards. Showing records saved on this device.' : 'Couldn’t reach the leaderboards. Try again later.';
    else status.textContent = rows.length ? '' : 'No records yet. Play a game with a leaderboard to set one.';
    status.hidden = !status.textContent;
  }

  const start = () => {
    const records = document.querySelector('#records');
    if (records) recordsPage(records);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
