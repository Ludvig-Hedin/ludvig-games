import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class El {
  constructor(tag, props = {}) { Object.assign(this, { tagName: tag, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, value: '', className: '', text: '' }, props); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type) { (this.listeners[type] || []).forEach(fn => fn({ type, preventDefault() {} })); }
  click() { this.fire('click'); }
  append(...nodes) { for (const node of nodes) { if (node instanceof El) { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; } this.children.push(node); } }
  replaceChildren(...nodes) { for (const c of this.children) if (c instanceof El) c.parent = null; this.children = []; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(c => (c instanceof El ? c.textContent : c)).join(''); }
  descendants() { return this.children.filter(c => c instanceof El).flatMap(c => [c, ...c.descendants()]); }
  querySelectorAll(selector) {
    if (selector === '.card') return this.descendants().filter(c => c.className === 'card');
    if (selector === '[data-filter]') return this.descendants().filter(c => c.dataset.filter);
    return [];
  }
}

const GAMES = [
  { name: 'flap', search: 'flap one button bird arcade', players: '1', dims: '3d', category: 'Arcade' },
  { name: 'ritkaos', search: 'ritkaos draw guess party', players: '2', dims: '2d', category: 'Party' },
  { name: 'karts', search: 'karts citrus circuit race racing', players: '1', dims: '3d', category: 'Racing' },
  { name: 'anything arena', search: 'anything arena fighters party', players: '2', dims: '2d', category: 'Party' },
  { name: 'block hop', search: 'block hop jump platformer', players: '1', dims: '3d', category: 'Platformer' },
];

function setup(search = '') {
  const ids = {};
  const make = (id, tag = 'div', props) => (ids[id] = new El(tag, { id, ...props }));
  const form = make('filters', 'form', { hidden: true });
  const root = make('games-root');
  const grid = make('games', 'section');
  root.append(grid);
  GAMES.forEach((g, order) => grid.append(new El('article', { className: 'card', dataset: { ...g, order: String(order) } })));
  const q = make('filter-q', 'input');
  const sort = make('filter-sort', 'select');
  const group = make('filter-group', 'button');
  make('filter-status', 'p');
  make('filter-empty', 'div', { hidden: true });
  make('filter-clear', 'button');
  const chip = (filter, value) => new El('button', { dataset: { filter, value } });
  form.append(q, sort, group, ...[['players', ''], ['players', '1'], ['players', '2'], ['dims', ''], ['dims', '2d'], ['dims', '3d'],
    ['cat', ''], ['cat', 'Party'], ['cat', 'Arcade'], ['cat', 'Racing'], ['cat', 'Platformer']].map(([f, v]) => chip(f, v)));
  const urls = [];
  const location = { search, pathname: '/' };
  const history = { replaceState: (_, __, url) => { urls.push(url); location.search = url.startsWith('?') ? url : ''; } };
  const document = { getElementById: id => ids[id] || null, createElement: tag => new El(tag) };
  const code = readFileSync(new URL('../../assets/hub.js', import.meta.url), 'utf8');
  new Function('document', 'location', 'history', 'addEventListener', 'URLSearchParams', code)(document, location, history, () => {}, URLSearchParams);
  const visible = () => grid.children.filter(c => !c.hidden).map(c => c.dataset.name);
  const chips = form.querySelectorAll('[data-filter]');
  const press = (f, v) => chips.find(c => c.dataset.filter === f && c.dataset.value === v).click();
  return { ids, form, root, grid, urls, visible, press, chips };
}

test('shows the bar only with JavaScript and lists every game best-first by default', () => {
  const { form, visible, ids } = setup();
  assert.equal(form.hidden, false);
  assert.deepEqual(visible(), GAMES.map(g => g.name));
  assert.equal(ids['filter-status'].textContent, '5 games');
});

test('filters combine and are read from and written to the URL', () => {
  const { visible, press, urls, ids, chips } = setup('?players=2&dims=2d');
  assert.deepEqual(visible(), ['ritkaos', 'anything arena']);
  assert.equal(chips.find(c => c.dataset.filter === 'players' && c.dataset.value === '2').getAttribute('aria-pressed'), 'true');
  ids['filter-q'].value = 'draw';
  ids['filter-q'].fire('input');
  assert.deepEqual(visible(), ['ritkaos']);
  assert.equal(urls.at(-1), '?players=2&dims=2d&q=draw');
  ids['filter-q'].value = '';
  ids['filter-q'].fire('input');
  press('players', '2'); // pressing the active chip turns it off
  press('cat', 'Party');
  assert.deepEqual(visible(), ['ritkaos', 'anything arena']);
  press('dims', '3d');
  assert.deepEqual(visible(), []);
  assert.equal(ids['filter-empty'].hidden, false);
  ids['filter-clear'].click();
  assert.deepEqual(visible(), GAMES.map(g => g.name));
  assert.equal(urls.at(-1), '/');
});

test('search matches several words across name, former name, description and category', () => {
  const { visible, ids } = setup('?q=citrus%20race');
  assert.deepEqual(visible(), ['karts']);
  assert.equal(ids['filter-q'].value, 'citrus race');
});

test('A–Z sort and group by category', () => {
  const { visible, ids, root, grid, urls } = setup();
  ids['filter-sort'].value = 'az';
  ids['filter-sort'].fire('change');
  assert.deepEqual(visible(), ['anything arena', 'block hop', 'flap', 'karts', 'ritkaos']);
  ids['filter-group'].click();
  assert.equal(urls.at(-1), '?sort=az&group=1');
  assert.equal(ids['filter-group'].getAttribute('aria-pressed'), 'true');
  assert.equal(grid.hidden, true);
  const sections = root.children.filter(c => c.className === 'group');
  assert.deepEqual(sections.map(s => s.children[0].textContent), ['Party 2', 'Arcade 1', 'Racing 1', 'Platformer 1']);
  assert.deepEqual(sections[0].children[1].children.map(c => c.dataset.name), ['anything arena', 'ritkaos']);
  ids['filter-group'].click();
  assert.equal(grid.hidden, false);
  assert.equal(root.children.length, 1);
  assert.equal(grid.children.length, 5, 'all cards back in the grid');
});

test('ignores unknown URL values', () => {
  const { visible } = setup('?players=9&dims=4d&cat=Nope&sort=zzz');
  assert.deepEqual(visible(), GAMES.map(g => g.name));
});
