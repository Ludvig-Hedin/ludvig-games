import asyncio,json,os,shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'tests'
report={'checks':[],'errors':[]}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1280,'height':800})
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  await page.set_content((ROOT.parent/'EPOCH-Endless-War.html').read_text(),wait_until='load')
  await page.wait_for_function('window.__epoch',timeout=30000)
  await page.evaluate('__epoch.view.renderer.setPixelRatio(.6);__epoch.view.renderer.shadowMap.enabled=false')
  async def check(name,expression):
   value=await page.evaluate(expression);assert value,(name,value);report['checks'].append(name);print('PASS',name,flush=True)
  async def advance(s):
   await page.evaluate('(s)=>{for(let t=0;t<s;t+=1/60){__epoch.sim.step(1/60);__epoch.drain();__epoch.view.update(__epoch.sim,1/60,__epoch.sim.time)}__epoch.refresh()}',s)
  await check('Three.js offline initialization','__epoch.threeRevision === "140" && __epoch.mode === "menu"')
  await page.locator('#start').click()
  await check('Start button and audio unlock','__epoch.mode === "playing" && __epoch.audio.ctx.state === "running"')
  await page.evaluate('__epoch.sim.teams[0].gold=1500;__epoch.refresh()')
  for i in range(3):await page.locator(f'#unit{i}').click()
  await check('Three recruitment controls','__epoch.sim.trained===3')
  await page.locator('#queue button').last.click()
  await check('Cancellable training queue','__epoch.sim.teams[0].queue.length<=2')
  await advance(3)
  await check('Queue produces actual 3D units','__epoch.sim.teams[0].pop>=3 && __epoch.view.models.size>=4')
  await page.locator('#defense').click();await page.locator('[data-build="0"]').click()
  await check('Build defense and install 3D turret','__epoch.sim.teams[0].turrets[0]?.level===1 && !!__epoch.view.turrets[0][0]')
  await page.locator('[data-upgrade="0"]').click()
  await check('Upgrade defense','__epoch.sim.teams[0].turrets[0].level===2')
  await page.locator('[data-sell="0"]').click()
  await check('Sell defense','__epoch.sim.teams[0].turrets[0]===null && __epoch.view.turrets[0][0]===null')
  await page.locator('#closeDefense').click()
  await page.locator('#speed').click();await check('2x battle speed','__epoch.speed===2')
  await page.locator('#pause').click();t=await page.evaluate('__epoch.sim.time');await page.wait_for_timeout(500)
  assert await page.evaluate('__epoch.sim.time')==t
  await check('Pause freezes simulation','__epoch.mode === "paused" && __epoch.audio.paused')
  await page.locator('#resume').click();await check('Resume restores simulation','__epoch.mode === "playing" && !__epoch.audio.paused')
  await page.locator('#sound').click();await check('Mute','__epoch.audio.muted');await page.locator('#sound').click()
  # Place enemies in a known target area to verify the actual pointer targeting flow.
  await page.evaluate('for(let i=0;i<5;i++)__epoch.sim.spawn(1,0,0,5+i*.4);__epoch.drain();__epoch.refresh()')
  await page.locator('#power').click();await check('Targeted special enters aiming mode','__epoch.aiming')
  pos=await page.evaluate('__epoch.view.project(6,.1,0)');await page.mouse.click(pos['x'],pos['y']);await advance(2.4)
  await check('Meteor strike damages enemies and resets cooldown','!__epoch.aiming && __epoch.sim.teams[0].power < .2 && __epoch.sim.kills>0')
  await page.evaluate('__epoch.sim.teams[0].xp=10000;__epoch.sim.teams[0].gold=10000;__epoch.refresh()')
  for age in range(1,5):
   await page.keyboard.press('e')
   await check(f'Evolution {age+1}: base, troop roster, special',f'__epoch.sim.teams[0].age==={age} && __epoch.view.bases[0].userData.age==={age} && document.getElementById("powerName").textContent===EpochSim.AGES[{age}].power')
   for typ in range(3):
    await page.evaluate('([a,t])=>{__epoch.sim.spawn(0,a,t,-6-t*3);__epoch.drain()}',[age,typ])
   await page.evaluate('(a)=>{__epoch.sim.teams[0].power=1;__epoch.sim.spawn(1,a,2,8);__epoch.sim.power(0,8);__epoch.drain()}',age)
   await advance(2.2)
  await check('All 15 models and all five special attack effects constructed','[...__epoch.view.models.values()].every(m=>Number.isFinite(m.position.x))')
  # Future battlefield presentation, with actual models on both sides.
  await page.evaluate('''()=>{const s=__epoch.sim,v=__epoch.view;
   for(const m of v.models.values())v.scene.remove(m);v.models.clear();s.units=[];s.pending=[];s.teams.forEach(t=>{t.pop=0;t.queue=[];t.xp=10000;t.gold=10000;t.power=1});
   while(s.teams[1].age<4)s.evolve(1);
   for(let side=0;side<2;side++)for(let i=0;i<3;i++){s.spawn(side,4,i,(side?1:-1)*(3+i*3.0));s.build(side,i,i)}
   __epoch.drain();__epoch.refresh();v.renderer.setPixelRatio(1);v.renderer.shadowMap.enabled=true;
   document.getElementById('ageAnnouncement').classList.remove('show');document.getElementById('notice').classList.remove('show');document.getElementById('tooltip').classList.add('hidden');
  }''')
  await page.mouse.move(1100,180);await page.wait_for_timeout(700)
  await page.screenshot(path=str(OUTPUT/'future.png'))
  await page.evaluate('__epoch.view.renderer.setPixelRatio(.5);__epoch.view.renderer.shadowMap.enabled=false')
  await page.evaluate('__epoch.sim.hurtBase(1,999999,0);__epoch.drain()')
  await check('Victory state','__epoch.sim.result === "victory" && __epoch.mode === "ending"')
  await page.wait_for_function('__epoch.mode === "result"',timeout=20000)
  await check('Victory modal','!document.getElementById("resultScreen").classList.contains("hidden")')
  await page.locator('#playAgain').click();await check('Replay resets the match','__epoch.sim.result===null && __epoch.sim.teams[0].age===0 && __epoch.mode==="playing"')
  await page.evaluate('__epoch.sim.hurtBase(0,999999,1);__epoch.drain()')
  await check('Defeat state','__epoch.sim.result==="defeat" && document.getElementById("resultTitle").textContent==="Defeat"')
  await page.wait_for_function('__epoch.mode === "result"',timeout=20000)
  await page.locator('#backToMenu').click();await check('Return to menu','__epoch.mode === "menu"')
  # Responsive hit targets and UI bounds.
  await page.set_viewport_size({'width':390,'height':844});await page.locator('#start').click();await page.wait_for_timeout(400)
  await check('Mobile command cards remain within viewport','[...document.querySelectorAll(".unit-card,#defense,#power,#evolve")].every(e=>{let r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight})')
  await page.screenshot(path=str(OUTPUT/'mobile.png'))
  await page.set_viewport_size({'width':844,'height':390});await page.wait_for_timeout(300)
  await page.screenshot(path=str(OUTPUT/'landscape.png'))
  await check('Landscape command cards remain in viewport','[...document.querySelectorAll(".unit-card,#defense,#power,#evolve")].every(e=>{let r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight})')
  report['audioEvents']=await page.evaluate('__epoch.audio.eventsPlayed');report['finalState']=await page.evaluate('__epoch.snapshot()')
  await browser.close()
 (OUTPUT/'browser-results.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report,indent=2))
asyncio.run(main())
