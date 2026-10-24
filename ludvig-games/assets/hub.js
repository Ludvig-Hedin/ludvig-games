/* Catalog filters: search and four dropdowns (players, 2D/3D, category, order). State lives in the URL query
   (?q=&players=1|2&dims=2d|3d&cat=&sort=az|group) so filtered views can be shared. Old links with ?group=1 or a
   detailed category (?cat=Racing) still work. Without JavaScript the bar stays hidden and every game is listed,
   best first. */
(() => {
  'use strict';
  const form = document.getElementById('filters');
  const root = document.getElementById('games-root');
  const grid = document.getElementById('games');
  if (!form || !root || !grid) return;
  const search = document.getElementById('filter-q');
  const selects = Array.from(form.querySelectorAll('select[data-filter]'));
  const status = document.getElementById('filter-status');
  const empty = document.getElementById('filter-empty');
  const cards = Array.from(grid.querySelectorAll('.card'));
  const options = key => Array.from(form.querySelector(`#filter-${key}`).options).map(o => o.value).filter(Boolean);
  const categoryOrder = options('cat');
  let aliases = {};
  try { aliases = JSON.parse(form.dataset.catAliases || '{}'); } catch { /* Ignore. */ }
  const KEYS = ['q', 'players', 'dims', 'cat', 'sort'];
  let state = read();

  function read() {
    const params = new URLSearchParams(location.search);
    const value = key => { const v = params.get(key) || ''; return options(key).includes(v) ? v : ''; };
    const cat = params.get('cat') || '';
    return {
      q: (params.get('q') || '').slice(0, 80),
      players: value('players'),
      dims: value('dims'),
      cat: categoryOrder.includes(cat) ? cat : categoryOrder.includes(aliases[cat]) ? aliases[cat] : '',
      sort: params.get('group') === '1' ? 'group' : value('sort'),
    };
  }

  function write() {
    const params = new URLSearchParams(location.search);
    params.delete('group');
    for (const key of KEYS) { if (state[key]) params.set(key, state[key]); else params.delete(key); }
    const query = params.toString();
    try { history.replaceState(null, '', query ? `?${query}` : location.pathname); } catch { /* Ignore. */ }
  }

  const words = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/\s+/).filter(Boolean);
  function matches(card) {
    const d = card.dataset;
    if (state.players && d.players !== state.players) return false;
    if (state.dims && d.dims !== state.dims) return false;
    if (state.cat && d.category !== state.cat) return false;
    const haystack = d.search.normalize('NFD').replace(/\p{M}/gu, '');
    return words(state.q).every(word => haystack.includes(word));
  }

  const order = state => (a, b) => (state.sort === 'az'
    ? a.dataset.name.localeCompare(b.dataset.name, 'en') || a.dataset.order - b.dataset.order
    : a.dataset.order - b.dataset.order);

  function section(title, list) {
    const block = document.createElement('section');
    block.className = 'group';
    const heading = document.createElement('h2');
    heading.className = 'group-title';
    heading.textContent = title;
    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = String(list.length);
    heading.append(' ', count);
    const inner = document.createElement('div');
    inner.className = 'cards';
    inner.append(...list);
    block.append(heading, inner);
    return block;
  }

  function render() {
    search.value = state.q;
    for (const select of selects) {
      select.value = state[select.dataset.filter] || '';
      select.classList.toggle('is-set', Boolean(select.value));
    }
    const visible = cards.filter(matches).sort(order(state));
    for (const card of cards) card.hidden = !visible.includes(card);
    if (state.sort === 'group') {
      const sections = categoryOrder.map(cat => [cat, visible.filter(card => card.dataset.category === cat)])
        .filter(([, list]) => list.length).map(([cat, list]) => section(cat, list));
      const other = visible.filter(card => !categoryOrder.includes(card.dataset.category));
      if (other.length) sections.push(section('Other', other));
      grid.hidden = true;
      root.replaceChildren(grid, ...sections);
    } else {
      grid.append(...visible, ...cards.filter(card => !visible.includes(card)));
      grid.hidden = false;
      root.replaceChildren(grid);
    }
    empty.hidden = visible.length > 0;
    status.textContent = `${visible.length} ${visible.length === 1 ? 'game' : 'games'}`;
  }

  function update(patch) {
    state = { ...state, ...patch };
    write();
    render();
  }

  form.addEventListener('submit', event => event.preventDefault());
  search.addEventListener('input', () => update({ q: search.value.slice(0, 80) }));
  for (const select of selects) select.addEventListener('change', () => update({ [select.dataset.filter]: select.value }));
  document.getElementById('filter-clear')?.addEventListener('click', () => update({ q: '', players: '', dims: '', cat: '' }));
  addEventListener('popstate', () => { state = read(); render(); });
  form.hidden = false;
  render();
})();
