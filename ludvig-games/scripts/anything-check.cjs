// Tests the hidden HTML with mocked local requests. No server route or paid API.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('/Users/ludvighedin/.codex/skills/gstack/node_modules/playwright'); }

async function check() {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'private-games/anything-vs-anything/index.html'), 'utf8');
  const url = 'http://127.0.0.1:4317/__private-anything-audit?check=1';
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest() && route.request().url().startsWith(url)) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.removeItem('ava.configs');
      localStorage.setItem('ava.ai', 'false');
      window.__mockPending = [];
      window.fetch = (input, options = {}) => {
        if (input !== '/api/interpret') return Promise.reject(new Error('Unexpected request blocked'));
        return new Promise(resolve => {
          const pending = { aborted: false, resolve: payload => resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })) };
          // Intentionally ignore cancellation for resolution. The stale-token
          // fence must still work even if an upstream response arrives late.
          options.signal?.addEventListener('abort', () => { pending.aborted = true; });
          window.__mockPending.push(pending);
        });
      };
    });
    await page.goto(url);
    await page.locator('#fight').click();
    await page.waitForFunction(() => location.hash.startsWith('#fight='));
    const hash = await page.evaluate(() => location.hash);
    const shared = JSON.parse(Buffer.from(hash.slice('#fight='.length), 'base64url').toString());
    const blueprint = fighter => Object.fromEntries(['shape', 'count', 'scale', 'weapon', 'hat', 'traits', 'palette'].map(key => [key, fighter[key]]));
    const response = { a: blueprint(shared.a), b: blueprint(shared.b) };
    const shareLink = url.split('?')[0] + hash;
    await page.goto(url + hash);
    assert.equal(await page.locator('#fighter-a').inputValue(), shared.a.label);
    assert.equal(await page.evaluate(() => window.__AVA__.snapshot().seed), shared.seed);
    await page.locator('#home').click();
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.equal(await page.evaluate(() => location.search), '?check=1');
    const actions = [
      ['surprise', () => page.locator('#surprise').click()],
      ['typing', () => page.locator('#fighter-a').fill('new unknown concept')],
      ['swap', () => page.locator('#swap').click()],
      ['home', () => page.locator('#home').click()],
      ['import', async () => {
        await page.locator('#settings').click();
        await page.locator('#load-code').click();
        await page.locator('#import-code').fill(shareLink);
        await page.locator('#import-fight').click();
      }],
      ['disable-ai', () => page.evaluate(() => {
        const toggle = document.querySelector('#use-ai');
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      })],
    ];
    for (const [name, action] of actions) {
      await page.goto(url);
      await page.evaluate(() => {
        const toggle = document.querySelector('#use-ai');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.locator('#fighter-a').fill('zorbledorf unknown concept');
      await page.locator('#fight').click();
      await page.waitForFunction(() => window.__mockPending.length === 1);
      assert.equal(await page.evaluate(() => window.__AVA__.snapshot().phase), 'loading');
      await action();
      assert.equal(await page.evaluate(() => window.__mockPending[0].aborted), true, name + ' cancels');
      await page.evaluate(payload => window.__mockPending[0].resolve(payload), response);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__AVA__.snapshot().phase), 'preview', name + ' rejects stale start');
      assert.equal(await page.evaluate(() => localStorage.getItem('ava.configs')), null, name + ' rejects stale cache');
      assert.equal(await page.locator('#fight').isEnabled(), true, name + ' remains usable');
      assert.equal(await page.locator('#toast').textContent().then(text => text.includes('AI is unavailable')), false);
      console.log('Checked private cancellation:', name);
    }
    await page.goto(url);
    await page.locator('#fight').click();
    await page.waitForFunction(() => window.__AVA__.snapshot().phase === 'fight');
    await page.locator('#exit').click();
    assert.equal(await page.evaluate(() => location.hash), '');
    assert.equal(await page.evaluate(() => window.__AVA__.snapshot().phase), 'preview');
    await page.locator('#settings').click();
    assert.equal(await page.locator('#info-dialog').textContent().then(text => text.includes('AI interpretation is not configured')), true);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, 'output/anything-results.json'), JSON.stringify({ mockedOnly: true, canceledInputs: actions.map(([name]) => name), sharedReload: true, homeClearsShare: true, exitClearsShare: true, honestCopy: true, errors }, null, 2));
    console.log('Checked private sharing, local fight entry, and honest AI settings');
    await context.close();
  } finally {
    await browser.close();
  }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
