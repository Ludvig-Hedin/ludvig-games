// Focused real-input checks for confirmed audit findings. Localhost only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('/Users/ludvighedin/.codex/skills/gstack/node_modules/playwright');
const base = 'http://127.0.0.1:4317';
const root = path.resolve(__dirname, '..');
const observe = process.argv.includes('observe');

async function main() {
  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== '1',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 700 } });
    context.setDefaultTimeout(7000);
    const page = await context.newPage();
    let frame;
    async function open(slug) {
      await page.goto(`${base}/${slug}/`);
      await page.bringToFront();
      frame = page.frameLocator('#game-frame');
      await frame.locator('body').waitFor();
      await page.locator('#load-status').waitFor({ state: 'hidden' });
    }
    async function key(selector, key) {
      await frame.locator(selector).focus();
      await page.keyboard.press(key);
    }
    async function check(name, action) {
      if (process.argv.includes('human-only') && !name.startsWith('Human ')) return;
      if (process.argv.includes('remaining') && !/^(Human|Origin|Afterglow paused)/.test(name)) return;
      try {
        await action();
        results.push({ name, passed: true });
        console.log(`Checked ${name}`);
      } catch (error) {
        results.push({ name, passed: false, error: error.message });
        console.log(`FAILED ${name}: ${error.message.split('\n')[0]}`);
      }
    }
    await check('Pigeon Space starts the focused Play button', async () => {
      await open('pigeon');
      await key('#play', 'Space');
      assert.equal(await frame.locator('body').evaluate(() => window.__pigeon.mode), 'playing');
    });
    await check('Afterglow Enter activates Quit', async () => {
      await open('afterglow');
      await frame.locator('#startBtn').click();
      await frame.locator('#pauseBtn').click();
      await key('#quitBtn', 'Enter');
      assert.equal(await frame.locator('body').evaluate(() => window.AFTERGLOW.snapshot().state), 'home');
    });
    await check('Afterglow paused resize retains the scene', async () => {
      await open('afterglow');
      await frame.locator('#startBtn').click();
      await frame.locator('#pauseBtn').click();
      await page.setViewportSize({ width: 1000, height: 720 });
      await page.waitForTimeout(150);
      await frame.locator('body').evaluate(() => window.dispatchEvent(new Event('resize')));
      const painted = await frame.locator('canvas').first().evaluate(canvas => {
        const c = canvas.getContext('2d');
        const bytes = c.getImageData(0, 0, canvas.width, canvas.height).data;
        return bytes.some((value, i) => i % 4 !== 3 && value > 0);
      });
      assert.equal(painted, true);
      assert.equal(await frame.locator('body').evaluate(() => window.AFTERGLOW.snapshot().state), 'paused');
      await page.setViewportSize({ width: 960, height: 700 });
    });
    await check('Cage Enter activates Training', async () => {
      await open('cage');
      await key('#training-button', 'Enter');
      assert.equal(await frame.locator('body').evaluate(() => document.body.classList.contains('is-training')), true);
    });
    await check('Cage Enter activates Settings', async () => {
      await open('cage');
      await key('#settings-button', 'Enter');
      assert.equal(await frame.locator('#settings').evaluate(el => el.classList.contains('open')), true);
      assert.equal(await frame.locator('body').evaluate(() => window.CAGE.snapshot().phase), 'menu');
    });
    await check('Flappy Space selects Chill without starting', async () => {
      await open('flappy-first-person');
      await key('#chill-mode', 'Space');
      const data = await frame.locator('body').evaluate(() => window.__flappy.snapshot());
      assert.equal(data.state, 'menu');
      assert.equal(data.mode, 'chill');
    });
    await check('One Small Fake Enter returns to Main Menu', async () => {
      await open('one-small-fake');
      await frame.locator('#startBtn').click();
      await frame.locator('#pauseBtn').click();
      await key('#menuBtn', 'Enter');
      assert.equal(await frame.locator('body').evaluate(() => window.__OSF.state.mode), 'home');
    });
    await check('One Small Fake Space toggles Sound without starting', async () => {
      await open('one-small-fake');
      const before = await frame.locator('body').evaluate(() => window.__OSF.state.muted);
      await key('#soundBtn', 'Space');
      const data = await frame.locator('body').evaluate(() => ({ mode: window.__OSF.state.mode, muted: window.__OSF.state.muted }));
      assert.equal(data.mode, 'home');
      assert.equal(data.muted, !before);
    });
    await check('Kiln Enter toggles Sound without starting a mission', async () => {
      await open('kiln');
      const before = await frame.locator('body').evaluate(() => window.__KILN__.sound.muted);
      await key('#menu-sound', 'Enter');
      const data = await frame.locator('body').evaluate(() => ({ state: window.__KILN__.state, muted: window.__KILN__.sound.muted }));
      assert.equal(data.state, 'menu');
      assert.equal(data.muted, !before);
    });
    await check('Human keyboard Continue starts the next test cleanly', async () => {
      await open('human-probably');
      await frame.locator('#startBtn').click();
      for (const id of [0, 3, 7]) await frame.locator(`[data-art="${id}"]`).click();
      await frame.locator('.punchline').waitFor();
      await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow.humanProbably.snapshot().between > .3);
      await frame.locator('.punchline').click();
      for (const button of (await frame.locator('[data-tile]').all()).slice(0, 3)) await button.click();
      await frame.locator('.punchline').waitFor();
      await page.waitForFunction(() => document.querySelector('#game-frame').contentWindow.humanProbably.snapshot().between > .3);
      await key('.punchline', 'Enter');
      const data = await frame.locator('body').evaluate(() => window.humanProbably.snapshot());
      assert.equal(data.round.id, 'soul');
      assert.equal(data.round.errors, 0);
      assert.equal(data.combo, 2);
    });
    await check('Origin Play today uses the latest date after two rollovers', async () => {
      await page.addInitScript(() => {
        const NativeDate = Date;
        window.__auditNow = NativeDate.parse('2026-09-30T12:00:00Z');
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [window.__auditNow])); }
          static now() { return window.__auditNow; }
        };
      });
      await open('origin');
      await frame.locator('#city-search').waitFor();
      await frame.locator('body').evaluate(() => { window.__auditNow = Date.parse('2026-10-01T12:00:00Z'); });
      await frame.locator('#new-daily').waitFor({ state: 'visible' });
      await frame.locator('#new-daily').click();
      await frame.locator('body').evaluate(() => { window.__auditNow = Date.parse('2026-10-02T12:00:00Z'); });
      await frame.locator('#new-daily').waitFor({ state: 'visible' });
      await frame.locator('#new-daily').click();
      await frame.locator('#city-search').waitFor();
      assert.equal(await frame.locator('body').evaluate(() => Boolean(localStorage.getItem('origin-v1:daily:2026-10-02'))), true);
    });
    await check('Origin failed saving keeps the score form available', async () => {
      // The direct-opening fallback also supports native forms, independently
      // of the wrapper's sandbox configuration.
      await page.goto(base + '/games/origin/index.html');
      frame = page;
      await frame.locator('#city-search').waitFor();
      await frame.locator('body').evaluate(() => {
        localStorage.clear();
        Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'QuotaExceededError'); };
      });
      await frame.locator('#practice-nav').click();
      await frame.locator('#daily-nav').click();
      for (let i = 0; i < 5; i++) {
        await frame.locator('#city-search').fill('Stockholm');
        await frame.locator('[role="option"]').first().click();
        await frame.locator('#guess-btn').click();
        await frame.locator('#guess-btn').click();
      }
      await frame.locator('#save-details summary').click();
      await frame.locator('#score-form').waitFor();
      await frame.locator('#player-name').fill('Audit');
      await frame.locator('#score-form button').click();
      await page.waitForTimeout(100);
      assert.equal(await frame.locator('#score-form').isVisible(), true);
      assert.match(await frame.locator('#toast').textContent(), /could not|couldn.t|unavailable|not saved/i);
    });
    await check('Origin native score form saves inside the player', async () => {
      await open('origin');
      await frame.locator('body').evaluate(() => localStorage.clear());
      await frame.locator('#practice-nav').click();
      await frame.locator('#daily-nav').click();
      for (let i = 0; i < 5; i++) {
        await frame.locator('#city-search').fill('Stockholm');
        await frame.locator('[role="option"]').first().click();
        await frame.locator('#guess-btn').click();
        await frame.locator('#guess-btn').click();
      }
      await frame.locator('#save-details summary').click();
      await frame.locator('#player-name').fill('Audit');
      await frame.locator('#score-form button').click();
      await page.waitForTimeout(100);
      assert.equal(await frame.locator('#score-form').isVisible(), false);
      assert.equal(await frame.locator('#summary-board').isVisible(), true);
      assert.match(await frame.locator('#toast').textContent(), /saved to this browser/);
      await frame.locator('#summary-board').click();
      assert.match(await frame.locator('#board-content').textContent(), /Audit/);
    });
    await context.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(root, 'output', observe ? 'audit-before.json' : 'audit-after.json'), JSON.stringify(results, null, 2));
  if (!observe && results.some(result => !result.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
