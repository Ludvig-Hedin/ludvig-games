// Localhost-only screenshot capture and focused checks. Run through agent-heavy-run browser.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('/Users/ludvighedin/.codex/skills/gstack/node_modules/playwright'); }

const root = path.resolve(__dirname, '..');
const games = JSON.parse(fs.readFileSync(path.join(root, 'games.json'), 'utf8'));
const visibleGames = games.filter(game => !game.hidden);
const base = 'http://127.0.0.1:4317';
const startButtons = {
  pigeon: '#play', skyline: '#flyBtn', jailbreak: '#startBtn',
  'under-sail': '#startBtn', afterglow: '#startBtn',
  'flappy-first-person': '#start-btn', cage: '#start-button',
  'paper-after-hours': '#startBtn', 'one-small-fake': '#startBtn', kiln: '#play',
  'user-hostile': '#begin', 'human-probably': '#startBtn',
  powder: '#start', 'slither-afterglow': '#play-button', deadblock: '#startBtn',
  epoch: '#start', lastlight: '#playButton', 'block-hop': '#startButton',
  heatwave: '#start', sunbound: '#startButton', stacklight: '#primaryBtn',
  mosslight: '#start-btn', 'sunset-dash': '#start',
};

async function main() {
  const browser = await playwright.chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== '1',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const output = path.join(root, 'output');
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    const touchImport = process.argv.includes('touch-import');
    const context = await browser.newContext(touchImport
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
      : { viewport: { width: 960, height: 600 } });
    const page = await context.newPage();
    if (process.argv.includes('debug')) console.log('Browser:', { headed: process.env.PLAYWRIGHT_HEADED, executable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.argv.includes('debug')) page.on('console', message => {
      if (message.type() === 'error') console.log('Browser error:', message.text());
    });
    const selected = visibleGames.filter(game => process.argv.includes(game.slug));
    const capture = !touchImport && (process.argv.includes('capture') || process.argv.includes('capture-only'));
    for (const game of visibleGames.filter(game => !game.external && !process.argv.includes('layout') && (!selected.length || selected.includes(game)))) {
      errors = [];
      if (touchImport && game.slug === 'slither-afterglow') {
        await page.goto(base);
        await page.evaluate(() => {
          localStorage.setItem('afterglow.best', '98765');
          localStorage.setItem('afterglow.muted', '1');
        });
      }
      const response = await page.goto(`${base}/${game.slug}/`, { waitUntil: 'load' });
      await page.bringToFront();
      assert.equal(response.status(), 200, game.slug);
      const frame = page.frameLocator('#game-frame');
      await frame.locator('body').waitFor();
      await page.locator('#load-status').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('h1').textContent(), game.name);
      if (touchImport && game.slug === 'slither-afterglow') {
        assert.equal(await frame.locator('body').evaluate(() => window.slither.getState().best), 0, 'Snake ignores STACKLIGHT record');
      }
      const start = startButtons[game.slug];
      if (game.slug === 'kiln' && process.argv.includes('debug')) {
        await frame.locator('body').evaluate(() => {
          const request = Element.prototype.requestPointerLock;
          Element.prototype.requestPointerLock = function (...args) {
            try {
              const result = request.apply(this, args);
              return result?.catch(error => { window.__pointerLockFailure = error.name + ': ' + error.message; throw error; });
            } catch (error) { window.__pointerLockFailure = error.name + ': ' + error.message; throw error; }
          };
        });
      }
      if (start) {
        if (touchImport) await frame.locator(start).tap({ timeout: 10000 });
        else await frame.locator(start).click({ timeout: 10000 });
      } else if (game.slug === 'origin') {
        // Guess a city from a real searchable map challenge.
        const input = frame.locator('#city-search');
        await input.fill('Stockholm');
        await frame.locator('[role="option"]').first().click();
        await frame.locator('#guess-btn').click();
      } else if (game.slug === 'higher-or-lower') {
        if (touchImport) await frame.locator('#leftCard').tap();
        else {
          await frame.locator('article[data-side]').first().focus();
          await page.keyboard.press('Enter');
        }
      } else {
        // HUMAN's first challenge is itself the starting interaction.
        const challenge = frame.locator('#humanCheck');
        if (await challenge.count()) await challenge.click();
      }
      await page.waitForTimeout(1100);
      if (game.slug === 'kiln') {
        const kiln = await frame.locator('body').evaluate(() => ({ state: window.__KILN__.state, input: window.__KILN__.input, error: window.__pointerLockFailure, focused: document.hasFocus() }));
        assert.equal(kiln.state, 'playing', `KILN did not start: ${JSON.stringify(kiln)}`);
      }
      if (game.slug === 'user-hostile') {
        const status = await frame.locator('body').evaluate(() => window.UserHostile.status);
        assert.equal(status.stage, 1, 'USER HOSTILE stage start');
        assert.equal(status.threeLoaded, true, 'Local Three.js loads');
      }
      if (game.slug === 'human-probably') {
        const status = await frame.locator('body').evaluate(() => window.humanProbably.snapshot());
        assert.equal(status.phase, 'playing', 'HUMAN starts its first test');
        assert.equal(status.round.id, 'traffic');
      }
      const imported = ['powder', 'slither-afterglow', 'deadblock', 'epoch', 'lastlight', 'block-hop', 'heatwave', 'sunbound', 'stacklight', 'mosslight', 'sunset-dash'];
      if (imported.includes(game.slug)) {
        const status = await frame.locator('body').evaluate((body, slug) => {
          const visible = id => {
            const element = document.getElementById(id);
            return !!element && element.getBoundingClientRect().height > 0 && !element.hidden;
          };
          switch (slug) {
            case 'powder': return window.powderState.mode === 'play' && window.powderState.distance > 0;
            case 'slither-afterglow': {
              const data = window.slither.getState();
              return data.mode === 'playing' && data.player.alive && data.aliveTime > 0 && data.renderer === 'Three.js';
            }
            case 'deadblock': return window.deadblock.state === 'run' && window.deadblock.stats.engine === '158' && window.deadblock.stats.drawCalls > 0;
            case 'epoch': return window.__epoch.mode === 'playing' && window.__epoch.frameCount > 0;
            case 'lastlight': return document.body.classList.contains('playing') && visible('hud');
            case 'block-hop': return document.body.dataset.state === 'playing';
            case 'heatwave': return document.body.classList.contains('playing') && visible('hud');
            case 'sunbound': return !visible('startScreen') && visible('hud');
            case 'stacklight': return !visible('overlay') && visible('board');
            case 'mosslight': return visible('hud') && !visible('start');
            case 'sunset-dash': return visible('hud') && parseFloat(document.getElementById('distance').textContent) > 0;
          }
        }, game.slug);
        assert.equal(status, true, `${game.slug} enters live gameplay with its local renderer`);
      }
      if (touchImport) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${game.slug} mobile shell fits`);
        if (game.slug === 'stacklight') {
          const score = await frame.locator('#score').textContent();
          await frame.locator('[data-action="drop"]').tap();
          await page.waitForFunction(previous => document.querySelector('#game-frame').contentDocument.getElementById('score').textContent !== previous, score);
          assert.notEqual(await frame.locator('#score').textContent(), score, 'Touch hard drop scores');
          await frame.locator('#pauseBtn').tap();
          await frame.locator('#pausePanel').waitFor({ state: 'visible' });
          await frame.locator('#primaryBtn').tap();
          await frame.locator('#overlay').waitFor({ state: 'hidden' });
        }
        if (game.slug === 'epoch') {
          const gold = await frame.locator('body').evaluate(() => window.__epoch.snapshot().teams[0].gold);
          await frame.locator('#unit0').tap();
          assert.ok(await frame.locator('body').evaluate(() => window.__epoch.snapshot().teams[0].gold) < gold, 'Touch recruitment spends gold');
        }
        if (game.slug === 'deadblock') {
          const before = await frame.locator('body').evaluate(() => window.deadblock.stats);
          const stick = await frame.locator('#moveStick').boundingBox();
          const client = await context.newCDPSession(page);
          const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y }] });
          await page.waitForTimeout(300);
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await client.detach();
          const after = await frame.locator('body').evaluate(() => window.deadblock.stats);
          assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .1, 'Touch joystick moves player');
        }
        if (game.slug === 'slither-afterglow') {
          await frame.locator('#audio-button').tap();
          assert.deepEqual(await frame.locator('body').evaluate(() => ({ best: localStorage.getItem('afterglow.best'), muted: localStorage.getItem('afterglow.muted'), snakeMuted: localStorage.getItem('slither-afterglow.muted') })), { best: '98765', muted: '1', snakeMuted: 'true' }, 'Snake settings preserve STACKLIGHT saves');
          await frame.locator('#pause-button').tap();
          const before = await frame.locator('body').evaluate(() => window.slither.getState().aliveTime);
          await page.waitForTimeout(250);
          assert.equal(await frame.locator('body').evaluate(() => window.slither.getState().aliveTime), before, 'Touch pause freezes snake');
          await frame.locator('#resume-button').tap();
          assert.equal(await frame.locator('body').evaluate(() => window.slither.getState().mode), 'playing');
        }
        if (game.slug === 'user-hostile') {
          await frame.locator('#pause-top').tap();
          const before = await frame.locator('body').evaluate(() => window.UserHostile.status.timeRemaining);
          await page.waitForTimeout(250);
          assert.equal(await frame.locator('body').evaluate(() => window.UserHostile.status.timeRemaining), before, 'Honest menu stops deadline');
          await frame.locator('#resume-game').tap();
          assert.equal(await frame.locator('body').evaluate(() => window.UserHostile.status.paused), false);
        }
        if (game.slug === 'higher-or-lower') {
          assert.notEqual(await frame.locator('#arena').getAttribute('data-phase'), 'playing', 'Touch comparison answers the round');
        }
        await page.screenshot({ path: path.join(output, `${game.slug}-touch.png`) });
      }
      if (game.allowExternalLinks) {
        // Exercise the same new-tab navigation used by credit/source links.
        // The local browser must never visit their real external destinations.
        const [popup] = await Promise.all([
          page.waitForEvent('popup'),
          frame.locator('body').evaluate(() => {
            const link = document.createElement('a');
            link.href = 'http://127.0.0.1:4317/not-a-game';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.append(link);
            link.click();
            link.remove();
          }),
        ]);
        await popup.waitForLoadState();
        assert.equal(popup.url(), base + '/not-a-game');
        await popup.close();
        await page.bringToFront();
      }
      assert.equal(errors.length, 0, `${game.slug}: ${errors.join('; ')}`);
      assert.equal(await frame.locator('canvas').count() > 0 || ['origin', 'human-probably', 'higher-or-lower', 'user-hostile'].includes(game.slug), true);
      if (capture) {
        if (game.slug === 'cage') await page.waitForTimeout(2400);
        const png = path.join(output, `${game.slug}.png`);
        await page.locator('#game-frame').screenshot({ path: png });
        execFileSync('cwebp', ['-quiet', '-q', '85', '-resize', '960', '600', png, '-o', path.join(root, 'assets/previews', `${game.slug}.webp`)]);
      }
      if (['kiln', 'lastlight', 'mosslight'].includes(game.slug)) {
        await frame.locator('body').evaluate(() => document.exitPointerLock());
        await page.waitForFunction(() => !document.querySelector('#game-frame').contentDocument.pointerLockElement);
      }
      await page.locator('#fullscreen-button').click();
      await page.waitForFunction(() => document.fullscreenElement !== null);
      await page.locator('#fullscreen-exit').click();
      await page.waitForFunction(() => document.fullscreenElement === null);
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#game-frame')), true, 'Keyboard focus after fullscreen');
      await page.locator('.back').click();
      await page.waitForURL(base + '/');
      if (!process.argv.includes('capture-only')) assert.equal(await page.locator('.game').count(), visibleGames.length);
      results.push({ game: game.slug, load: true, start: true, fullscreen: true, back: true, errors });
      console.log(`Checked ${game.slug}`);
    }
    if (results.length) fs.writeFileSync(path.join(output, touchImport ? 'import-touch-results.json' : 'game-results.json'), JSON.stringify(results, null, 2));
    if (process.argv.includes('capture-only')) {
      await context.close();
      return;
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    for (const image of await page.locator('.preview img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'home-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile home overflow');
    for (const image of await page.locator('.preview img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(img => img.decode());
      assert.equal(await image.evaluate(img => img.naturalWidth > 0), true, 'Preview missing');
    }
    await page.evaluate(() => scrollTo(0, 0));
    // A longer catalog can exceed Chromium's full-page texture limit.
    // All rows are decoded above; capture bounded mobile views instead.
    await page.screenshot({ path: path.join(output, 'home-mobile.png') });
    await page.locator('.game').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'home-mobile-bottom.png') });
    assert.equal(await page.locator('.game').count(), visibleGames.length);
    for (const game of games.filter(game => game.hidden)) {
      assert.equal(await page.locator(`a[href="/${game.slug}/"]`).count(), 0, `${game.slug} hidden in catalog`);
      if (game.external) assert.equal(await page.locator(`a[href="${game.external}"]`).count(), 0);
      for (const route of [`/${game.slug}/`, `/games/${game.slug}/index.html`, `/assets/previews/${game.slug}.webp`]) {
        const response = await page.request.get(base + route);
        assert.equal(response.status(), 404, `${game.slug} private route ${route}`);
      }
    }
    await page.goto(base + '/pigeon/');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile player overflow');
    await page.screenshot({ path: path.join(output, 'player-mobile.png') });
    // Browsers without fullscreen still retain the direct game link.
    await page.evaluate(() => { document.querySelector('#game-stage').requestFullscreen = undefined; });
    await page.locator('#fullscreen-button').click();
    await page.locator('#fullscreen-status').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.tool.secondary').getAttribute('href'), '/games/pigeon/index.html');
    const missing = await page.goto(base + '/not-a-game');
    assert.equal(missing.status(), 404);
    await page.getByRole('link', { name: 'All games' }).click();
    await page.waitForURL(base + '/');
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ games: results, mobileHome: true, mobilePlayer: true, missingPage: true, fullscreenFallback: true }, null, 2));
    console.log('Checked all previews, desktop/mobile layout, fullscreen fallback, and missing page');
    await context.close();
  } finally {
    await browser.close();
  }
}
if (process.argv.includes('touch-audit')) require('./touch-check.cjs');
else if (process.argv.includes('gameplay-audit')) require('./gameplay-check.cjs');
else if (process.argv.includes('private-audit')) require('./anything-check.cjs');
else main().catch(error => { console.error(error); process.exitCode = 1; });
