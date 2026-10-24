// Emulated-touch integration checks, not physical-device certification.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('/Users/ludvighedin/.codex/skills/gstack/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:4317';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    context.setDefaultTimeout(7000);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let frame;
    async function open(slug) {
      await page.goto(`${base}/${slug}/`);
      frame = page.frameLocator('#game-frame');
      await page.locator('#load-status').waitFor({ state: 'hidden' });
    }
    async function check(name, action) {
      if (process.argv.includes('human-only') && !name.startsWith('Human ')) return;
      await action();
      assert.equal(errors.length, 0, errors.join('; '));
      results.push(name);
      console.log(`Checked ${name}`);
    }
    await check('Pigeon focused FLAP preserves lift', async () => {
      await open('pigeon');
      await frame.locator('#play').tap();
      const before = await frame.locator('body').evaluate(() => window.__pigeon.p[1]);
      await frame.locator('[data-key="Space"]').focus();
      await page.keyboard.down('Space');
      await page.waitForTimeout(250);
      const after = await frame.locator('body').evaluate(() => window.__pigeon.p[1]);
      await page.keyboard.up('Space');
      assert.ok(after > before + .1, `Lift did not rise: ${before} -> ${after}`);
    });
    await check('Flappy focused TAP TO FLAP preserves Space', async () => {
      await open('flappy-first-person');
      await frame.locator('#start-btn').tap();
      const before = await frame.locator('body').evaluate(() => window.__flappy.snapshot().flaps);
      await frame.locator('#tap-btn').focus();
      await page.keyboard.press('Space');
      const after = await frame.locator('body').evaluate(() => window.__flappy.snapshot().flaps);
      assert.equal(after, before + 1);
    });
    await check('Afterglow focused BOOST preserves held Space', async () => {
      await open('afterglow');
      await frame.locator('#startBtn').tap();
      await frame.locator('#touchBoost').focus();
      await page.keyboard.down('Space');
      await page.waitForTimeout(250);
      assert.equal(await frame.locator('body').evaluate(() => window.AFTERGLOW.snapshot().boost), true);
      await page.keyboard.up('Space');
      await page.waitForTimeout(100);
      assert.equal(await frame.locator('body').evaluate(() => window.AFTERGLOW.snapshot().boost), false);
    });
    await check('Kiln focused JUMP preserves Space', async () => {
      await open('kiln');
      await frame.locator('#play').tap();
      assert.equal(await frame.locator('body').evaluate(() => window.__KILN__.state), 'playing');
      await frame.locator('#touch-jump').focus();
      await page.keyboard.press('Space');
      assert.equal(await frame.locator('body').evaluate(() => window.__KILN__.player.ground), false);
    });
    await check('Paper touch pause, mode switch, resume and flick', async () => {
      await open('paper-after-hours');
      await frame.locator('#startBtn').tap();
      await frame.locator('#pauseBtn').tap();
      assert.equal(await frame.locator('body').getAttribute('data-phase'), 'paused');
      await frame.locator('#easyBtn').tap();
      assert.equal(await frame.locator('body').getAttribute('data-phase'), 'paused');
      assert.equal(await frame.locator('body').getAttribute('data-mode'), 'easy');
      await frame.locator('#resumeBtn').tap();
      await page.waitForTimeout(200);
      const box = await frame.locator('#world').boundingBox();
      const client = await context.newCDPSession(page);
      const x = box.x + box.width / 2, y = box.y + box.height * .78;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      assert.equal(await frame.locator('body').getAttribute('data-holding'), 'true');
      for (let i = 1; i <= 8; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 12 }] });
        await page.waitForTimeout(16);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await frame.locator('body').getAttribute('data-holding'), 'false');
      await page.waitForFunction(() => document.querySelector('#game-frame').contentDocument.querySelector('#windInfo').getAttribute('aria-label') !== 'No wind', null, { timeout: 7000 });
      await client.detach();
      await page.setViewportSize({ width: 844, height: 390 });
      await frame.locator('#pauseBtn').tap();
      await frame.locator('#quitBtn').tap();
      const restart = await frame.locator('#restartBtn').boundingBox();
      assert.ok(restart.y >= 0 && restart.y + restart.height <= 390, `Landscape restart clipped: ${JSON.stringify(restart)}`);
      await frame.locator('#restartBtn').tap();
      assert.equal(await frame.locator('body').getAttribute('data-phase'), 'playing');
      await page.setViewportSize({ width: 390, height: 844 });
    });
    await check('Human complete seven-test touch flow, scorecard and replay', async () => {
      await open('human-probably');
      await frame.locator('#startBtn').tap();
      const state = () => frame.locator('body').evaluate(() => window.humanProbably.snapshot());
      async function next(id) {
        await page.waitForFunction(expected => document.querySelector('#game-frame').contentWindow.humanProbably.snapshot().round.id === expected, id, { timeout: 17000 });
      }
      for (const id of [0, 3, 7]) await frame.locator(`[data-art="${id}"]`).tap();
      await next('dread');
      for (const button of (await frame.locator('[data-tile]').all()).slice(0, 3)) await button.tap();
      await next('soul');
      for (let i = 0; i < 3; i++) {
        await page.waitForFunction(() => {
          const r = document.querySelector('#game-frame').contentWindow.humanProbably.snapshot().round;
          return r.id === 'soul' && Math.abs(r.position - r.center) < r.width / 2 - .04;
        });
        await frame.locator('#soulBtn').tap();
      }
      await next('cookies');
      const arena = await frame.locator('#catchArena').boundingBox();
      const client = await context.newCDPSession(page);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: arena.x + arena.width / 2, y: arena.y + arena.height - 70 }] });
      for (let n = 0; n < 90; n++) {
        const data = await state();
        if (data.round.id !== 'cookies' || data.phase !== 'playing') break;
        const cookie = data.round.items.filter(item => !item.bot).sort((a, b) => b.y - a.y)[0];
        if (cookie) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: arena.x + cookie.x * arena.width, y: arena.y + arena.height - 70 }] });
        await page.waitForTimeout(120);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
      await next('shred');
      for (let i = 0; i < 3; i++) {
        await frame.locator(`[data-paper="${i}"]`).tap();
        await frame.locator('#shredder').tap();
      }
      await next('popups');
      for (let i = 0; i < 7; i++) await frame.locator('.popup:not(:disabled)').first().tap();
      await next('boss');
      for (let i = 0; i < 5; i++) {
        // The target deliberately moves every frame. Tap its current position
        // instead of waiting for an animation to become stationary.
        const box = await frame.locator('#boss').boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(150);
      }
      await frame.locator('#replayBtn').waitFor();
      const data = await state();
      assert.equal(data.phase, 'result');
      assert.equal(data.results.length, 7);
      assert.ok(data.results.every(round => round.won), JSON.stringify(data.results));
      const [download] = await Promise.all([page.waitForEvent('download'), frame.locator('#saveBtn').tap()]);
      assert.equal(download.suggestedFilename(), 'human-probably-score.png');
      await download.saveAs(path.join(root, 'output', 'human-probably-score.png'));
      await frame.locator('#turboBtn').tap();
      assert.equal((await state()).mode, 'turbo');
      assert.equal((await state()).round.id, 'traffic');
      await frame.locator('#pauseBtn').tap();
      const before = (await state()).round.elapsed;
      await page.waitForTimeout(300);
      assert.equal((await state()).round.elapsed, before);
      await frame.locator('[data-modal="0"]').tap();
      assert.equal((await state()).paused, false);
    });
    await page.screenshot({ path: path.join(root, 'output', 'human-touch.png') });
    fs.writeFileSync(path.join(root, 'output', 'touch-results.json'), JSON.stringify({ emulated: true, checks: results }, null, 2));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
