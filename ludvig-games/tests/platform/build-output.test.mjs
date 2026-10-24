/** Checks the generated public/ folder. Run `python3 build.py` first. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const ORIGIN = 'https://games.ludvighedin.com';
const ROOT = new URL('../../', import.meta.url);
const PUBLIC = new URL('public/', ROOT);
const read = path => readFileSync(new URL(path, PUBLIC), 'utf8');
const boards = JSON.parse(read('assets/boards.json'));
const catalog = JSON.parse(readFileSync(new URL('games.json', ROOT), 'utf8')).filter(game => !game.hidden);
const local = catalog.filter(game => !game.external);
const TOUCH = '<style>html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}html{touch-action:manipulation}input,textarea,select,[contenteditable],[contenteditable] *{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}</style>';
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const headOf = html => html.slice(0, html.search(/<\/head\s*>/i) + 1 || undefined);
const afterHead = html => { const match = html.match(/<head(?:\s[^>]*)?>/i); return html.slice(match.index + match[0].length); };
const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match => JSON.parse(match[1]));

function checkPlatform(slug, rest) {
  const config = rest.match(/^<script src="\/assets\/audio-resume\.js"><\/script><script src="\/assets\/ludvig\.js"><\/script><script>window\.__LUDVIG_GAME=(\{.*?\});(?:window\.__LUDVIG_SCORES=(\{.*?\});)?<\/script>(<script src="\/assets\/score-bridge\.js"><\/script>)?/);
  assert.ok(config, `${slug}: platform injection order`);
  assert.doesNotMatch(config[1] + (config[2] || ''), /[<>&]/, `${slug}: inline config is script-safe`);
  const game = JSON.parse(config[1]);
  const ids = Object.keys(boards).filter(id => boards[id].game === slug);
  assert.equal(game.slug, slug);
  assert.deepEqual(game.boards, ids);
  assert.ok(['tl', 'tr', 'bl', 'br', 'none'].includes(game.button));
  if (!ids.length) assert.equal(game.button, 'none', `${slug}: no trophy without boards`);
  const bridged = ids.filter(id => boards[id].key);
  assert.equal(Boolean(config[2]), bridged.length > 0, `${slug}: bridge only with keyed boards`);
  if (config[2]) assert.deepEqual(Object.keys(JSON.parse(config[2])).sort(), bridged.sort());
  return config[0].length;
}

test('each game is served full screen at /<slug>/ with SEO tags, then the platform scripts', () => {
  for (const game of local) {
    const { slug } = game;
    const html = read(`${slug}/index.html`);
    let rest = afterHead(html);
    assert.ok(rest.startsWith(`<meta charset="utf-8">${TOUCH}<title>`), `${slug}: charset, touch style, then SEO`);
    const head = headOf(html);
    assert.equal((head.match(/<title\b/gi) || []).length, 1, `${slug}: one title`);
    assert.ok(head.includes(`<title>${escapeHtml(game.name)} · Free browser game · Ludvig Games</title>`), `${slug}: title`);
    assert.equal((head.match(/<meta name="description"/gi) || []).length, 1, `${slug}: one description`);
    assert.equal((head.match(/rel="?canonical/gi) || []).length, 1, `${slug}: one canonical`);
    assert.ok(head.includes(`<link rel="canonical" href="${ORIGIN}/${slug}/">`), `${slug}: canonical`);
    for (const property of ['og:title', 'og:description', 'og:url']) assert.equal(head.split(`property="${property}"`).length - 1, 1, `${slug}: ${property}`);
    assert.match(head, /<meta name="twitter:card"/);
    const [data] = jsonLd(head);
    assert.equal(data['@type'], 'VideoGame', slug);
    assert.equal(data.name, game.name);
    assert.equal(data.url, `${ORIGIN}/${slug}/`);
    assert.equal(data.applicationCategory, 'Game');
    assert.equal(data.operatingSystem, 'Web browser');
    assert.equal(data.isAccessibleForFree, true);
    assert.deepEqual(data.author, { '@type': 'Person', name: 'Ludvig Hedin', url: 'https://www.ludvighedin.com' });
    assert.ok(data.playMode, `${slug}: playMode`);
    if (game.preview !== false) assert.equal(data.image, `${ORIGIN}/assets/previews/${slug}.webp`);
    rest = rest.slice(rest.indexOf('</script>', rest.indexOf('application/ld+json')) + '</script>'.length);
    const length = checkPlatform(slug, rest);
    assert.ok(rest.slice(length).startsWith('<script defer src="https://static.cloudflareinsights.com/beacon.min.js"'), `${slug}: analytics after platform`);
  }
});

test('the /games/<slug>/ copy stays, points its canonical to /<slug>/ and has the platform', () => {
  for (const { slug } of local) {
    const html = read(`games/${slug}/index.html`);
    const prefix = `<meta charset="utf-8">${TOUCH}<link rel="canonical" href="${ORIGIN}/${slug}/">`;
    const rest = afterHead(html);
    assert.ok(rest.startsWith(prefix), `${slug}: canonical`);
    assert.equal((headOf(html).match(/rel="?canonical/gi) || []).length, 1, `${slug}: one canonical`);
    checkPlatform(slug, rest.slice(prefix.length));
  }
});

test('the wrapper page is gone', () => {
  assert.ok(!existsSync(new URL('assets/player.js', PUBLIC)));
  for (const { slug } of local) assert.doesNotMatch(read(`${slug}/index.html`), /id="game-frame"|class="player-bar"|scores-ui\.js/, slug);
});

test('hub: wordmark, links, one card per game, images with alt and size, structured data', () => {
  const html = read('index.html');
  assert.match(html, /<a class="wordmark" href="\/">Ludvig Games<\/a>/);
  assert.match(html, /<a href="\/me\/">My records<\/a>/);
  assert.match(html, /<a href="https:\/\/www\.ludvighedin\.com" rel="noopener">Ludvig Hedin/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
  assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  assert.ok(html.includes(TOUCH));
  assert.doesNotMatch(html, /Play<span|class="capacity"/);
  const cards = (html.match(/<article class="card"[ >]/g) || []).length;
  assert.equal(cards, catalog.length);
  const images = [...html.matchAll(/<img [^>]*>/g)].map(match => match[0]);
  assert.equal(images.length, catalog.filter(game => game.preview !== false).length);
  images.forEach((img, index) => {
    assert.match(img, /alt="[^"]+ gameplay screenshot"/);
    assert.match(img, /width="960" height="600"/);
    assert.match(img, index < 3 ? /fetchpriority="high"/ : /loading="lazy"/);
  });
  const metas = [...html.matchAll(/<p class="card-meta">([^<]*)<\/p>/g)].map(match => match[1]);
  const multiplayer = catalog.filter(game => /^\s*(\d+)\s*[–-]|^\s*([2-9]|\d\d)/.test(game.players));
  assert.equal(metas.filter(text => /player/.test(text)).length, multiplayer.length);
  assert.ok(!metas.some(text => text.startsWith('1 player')));
  // Best first (quality, ties in catalog order), names as written, no device text.
  const best = catalog.map((game, index) => ({ game, index })).sort((a, b) => (b.game.quality || 0) - (a.game.quality || 0) || a.index - b.index).map(item => item.game);
  const names = [...html.matchAll(/<h3 class="card-name">([^<]*)/g)].map(match => match[1]);
  assert.deepEqual(names, best.map(game => escapeHtml(game.name)));
  for (const game of catalog) if (game.device) assert.ok(!html.includes(`>${escapeHtml(game.device)}<`) && !html.includes(`· ${escapeHtml(game.device)}`), `${game.slug}: device text`);
  assert.doesNotMatch(read('assets/site.css'), /text-transform\s*:\s*uppercase/);
  const [data] = jsonLd(html);
  const types = data['@graph'].map(node => node['@type']);
  assert.deepEqual(types.sort(), ['ItemList', 'Person', 'WebSite']);
  const list = data['@graph'].find(node => node['@type'] === 'ItemList');
  assert.equal(list.itemListElement.length, catalog.length);
  assert.deepEqual(list.itemListElement.map(item => item.name), best.map(game => game.name));
});

test('hub filter bar: hidden without JavaScript, chips from data, card data for filtering', () => {
  const html = read('index.html');
  assert.match(html, /<form class="filters" id="filters" role="search" aria-label="Filter games" hidden>/);
  assert.match(html, /<script src="\/assets\/hub\.js" defer><\/script>/);
  assert.match(html, /<input class="filter-search" id="filter-q" type="search"/);
  const categories = [...new Set(catalog.map(game => game.category).filter(Boolean))].sort();
  const chips = [...html.matchAll(/data-filter="cat" data-value="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(chips, categories.map(escapeHtml).sort());
  for (const [value, label] of [['1', '1'], ['2', '2+'], ['2d', '2D'], ['3d', '3D']]) assert.ok(html.includes(`data-value="${value}" aria-pressed="false">${label}</button>`), label);
  assert.match(html, /id="filter-group" aria-pressed="false">Group by category</);
  assert.match(html, /<option value="">Best first<\/option><option value="az">A–Z<\/option>/);
  const cards = [...html.matchAll(/<article class="card" data-search="([^"]*)" data-players="(1|2)" data-dims="(2d|3d|)" data-category="([^"]*)" data-name="([^"]*)" data-order="(\d+)">/g)];
  assert.equal(cards.length, catalog.length);
  const ritkaos = cards.find(match => match[5] === 'ritkaos');
  if (ritkaos) assert.equal(ritkaos[2], '2', 'Ritkaos counts as 2+');
});

test('SEO uses the new names and lists the former name as alternateName', () => {
  const llms = read('llms.txt');
  for (const game of local) {
    const [data] = jsonLd(headOf(read(`${game.slug}/index.html`)));
    const former = game.formerName && game.formerName.trim().toLowerCase() !== game.name.trim().toLowerCase() ? game.formerName : undefined;
    assert.equal(data.name, game.name);
    assert.equal(data.alternateName, former, game.slug);
    if (game.category) assert.equal(data.genre, game.category);
    if (former) assert.ok(llms.includes(`formerly ${former}`), `${game.slug}: llms formerName`);
  }
});

test('My records and 404 use the hub style', () => {
  const me = read('me/index.html');
  assert.match(me, /<h1 class="page-title">My records<\/h1>/);
  assert.match(me, /class="wordmark"/);
  assert.match(me, /scores-ui\.js/);
  assert.match(read('404.html'), /class="wordmark"[\s\S]*Game not found/);
});

test('sitemap, robots and llms.txt', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g)].map(match => match[1]);
  assert.deepEqual(urls, [`${ORIGIN}/`, ...local.map(game => `${ORIGIN}/${game.slug}/`)]);
  assert.doesNotMatch(sitemap, /\/me\/|\/games\//);
  const robots = read('robots.txt');
  for (const line of ['Allow: /', 'Disallow: /games/', 'Disallow: /api/', 'Disallow: /mp/', `Sitemap: ${ORIGIN}/sitemap.xml`]) assert.ok(robots.includes(line), line);
  const llms = read('llms.txt');
  assert.match(llms, /^# Ludvig Games\n\n> /);
  for (const game of catalog) assert.ok(llms.includes(`[${game.name}](${game.external || `${ORIGIN}/${game.slug}/`})`), game.slug);
});

test('hub CSS has no fixed widths that can overflow small phones', () => {
  const css = read('assets/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, property, value] of css.matchAll(/(?:^|[;{\s])((?:min-)?width|flex-basis|flex)\s*:\s*([^;}]+)/g)) {
    for (const [, n] of value.matchAll(/(\d+(?:\.\d+)?)px/g)) assert.ok(Number(n) <= 320, `${property}: ${value} is wider than a 320 px phone`);
    for (const [, n] of value.matchAll(/(\d+(?:\.\d+)?)vw/g)) assert.ok(Number(n) <= 100, `${property}: ${value}`);
  }
  for (const [, n] of css.matchAll(/(?:^|[;{\s])(?:left|right|margin-left|margin-right)\s*:\s*-(\d+)px/g)) assert.ok(Number(n) <= 24, `negative offset ${n}px`);
  for (const page of ['index.html', 'me/index.html', '404.html']) assert.match(read(page), /<meta name="viewport" content="width=device-width, initial-scale=1/);
});

test('board config is valid', () => {
  for (const [id, board] of Object.entries(boards)) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
    assert.equal(id.split(':')[0], board.game);
    assert.ok(['asc', 'desc'].includes(board.order), id);
    assert.ok(['int', 'float1', 'time-ms', 'time-s', 'money'].includes(board.format), id);
    assert.ok(Number.isFinite(board.min) && Number.isFinite(board.max) && board.min < board.max, id);
    assert.equal(typeof board.scoped, 'boolean');
  }
});

test('published scripts parse', () => {
  for (const file of ['ludvig.js', 'score-bridge.js', 'scores-ui.js', 'audio-resume.js', 'game-storage.js']) {
    assert.doesNotThrow(() => new Function(read(`assets/${file}`)), file);
  }
  for (const file of readdirSync(new URL('assets/', PUBLIC))) assert.ok(!/player\.js/.test(file));
});
