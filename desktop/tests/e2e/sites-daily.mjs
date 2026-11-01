// Exercise the shipped daily start/finish paths across Stockholm midnight.
// Test-only exports expose existing state and finish functions without replacing them.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4317';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 for(const slug of ['last-call','last-cart','penthouse-panic']){
  const context=await browser.newContext({viewport:{width:960,height:700}});
  await context.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin))return route.abort();
   const pathname=new URL(url).pathname;
   const entry=slug==='last-call'?'/last-call/game/main.js':`/${slug}/game.js`;
   if(pathname!==entry)return route.continue();
   const response=await route.fetch();let body=await response.text();
   if(slug==='last-call')body+='\nglobalThis.__dailyAudit={finish:finishRun,get day(){return runDate},get records(){return profile.daily}};';
   else if(slug==='penthouse-panic')body+='\nglobalThis.__dailyAudit={finish:()=>{sim.finish();endRound(sim.result)},get day(){return runParams.dailyDate},get records(){return profile.records}};';
   else {
    assert.equal(body.split('})();').length,2,'one game bundle closure');
    body=body.replace('})();',';globalThis.__dailyAudit={finish:P0,get day(){return Ht.dailyDate},get records(){return be.daily}};})();');
   }
   await route.fulfill({response,body});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-01T22:59:50Z'));
  await page.goto(`${origin}/${slug}/`);
  if(slug==='last-call'){await page.locator('[data-mode="daily"]').click();await page.locator('#play-btn').click();}
  else if(slug==='last-cart'){await page.locator('[data-mode="daily"]').click();await page.locator('#play-button').click();}
  else await page.locator('#daily-button').click();
  await page.waitForFunction(()=>globalThis.__dailyAudit?.day==='2026-11-01');
  await page.clock.setFixedTime(new Date('2026-11-01T23:00:10Z'));
  await page.evaluate(()=>globalThis.__dailyAudit.finish());
  const records=await page.evaluate(()=>Object.keys(globalThis.__dailyAudit.records));
  assert.ok(records.includes(slug==='penthouse-panic'?'daily-2026-11-01':'2026-11-01'),`${slug} records the start date`);
  assert.ok(!records.some(key=>key.endsWith('2026-11-02')),`${slug} must not credit the next day`);
  assert.deepEqual(errors,[],`${slug} midnight errors`);
  console.log(`PASS ${slug}: a daily run finishing after midnight keeps its starting date`);
  await context.close();
 }
}finally{await browser.close();}
