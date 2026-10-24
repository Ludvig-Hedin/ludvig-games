import asyncio, json, pathlib, time, os, shutil
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT',str(ROOT/'.test-output'))); OUT.mkdir(exist_ok=True)
BASE=os.environ.get('GAME_URL','http://127.0.0.1:3000')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'] if hasattr(os,'geteuid') and os.geteuid()==0 else [])
  contexts=[await browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1) for _ in range(3)]
  pages=[await c.new_page() for c in contexts];errors=[]
  for page in pages:
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(BASE);await page.wait_for_selector('#connection-dot.online')
  await pages[0].screenshot(path=str(OUT/'01-home.png'),full_page=True)
  await pages[0].fill('#nickname','Ludvig');await pages[0].click('#create-room');await pages[0].wait_for_selector('#lobby:not([hidden])')
  code=await pages[0].inner_text('#lobby-code')
  for i in [1,2]:
   await pages[i].fill('#nickname',['Ludvig','Albin','Amanda'][i]);await pages[i].fill('#room-code',code);await pages[i].click('#join-form button');await pages[i].wait_for_selector('#lobby:not([hidden])')
  await pages[0].wait_for_function("document.querySelectorAll('#lobby-players .player-row').length===3")
  await pages[0].click('[data-mode="coop"]');await pages[0].select_option('#setting-rounds','1');await pages[0].screenshot(path=str(OUT/'02-lobby.png'),full_page=True)
  await pages[0].click('#start-game');await pages[0].wait_for_selector('[data-choice="0"]')
  answer=await pages[0].inner_text('[data-choice="0"] strong');await pages[0].click('[data-choice="0"]');await pages[0].wait_for_selector('.drawing-surface.can-draw');await pages[1].wait_for_selector('.drawing-surface.can-draw')
  await pages[2].wait_for_function("!document.querySelector('#guess-input').disabled")
  # Real simultaneous pointer streams from independent contexts.
  async def draw(page,color,ys):
   await page.click('[data-color="'+color+'"]');box=await page.locator('#canvas').bounding_box();
   await page.mouse.move(box['x']+box['width']*.15,box['y']+box['height']*ys[0]);await page.mouse.down()
   for i in range(1,31):await page.mouse.move(box['x']+box['width']*(.15+.7*i/30),box['y']+box['height']*(ys[0]+(ys[1]-ys[0])*i/30))
   await page.mouse.up()
  await asyncio.gather(draw(pages[0],'#292d28',[.25,.75]),draw(pages[1],'#ec7464',[.75,.25]))
  await pages[0].wait_for_timeout(500)
  hashes=await asyncio.gather(*[page.eval_on_selector('#canvas','c=>c.toDataURL()') for page in pages]);assert len(set(hashes))==1,'Canvas pixels differ between clients'
  await pages[0].screenshot(path=str(OUT/'03-drawing.png'),full_page=True)
  await pages[2].screenshot(path=str(OUT/'04-guesser.png'),full_page=True)
  # Undo from second artist leaves first artist's black line on every canvas.
  await pages[1].click('#undo');await pages[1].wait_for_timeout(350)
  hashes2=await asyncio.gather(*[page.eval_on_selector('#canvas','c=>c.toDataURL()') for page in pages]);assert len(set(hashes2))==1;assert hashes2[0]!=hashes[0]
  # Refresh artist: session identity, role and bitmap survive.
  token=await pages[1].evaluate("sessionStorage.getItem('ritkaos.token')");await pages[1].reload();await pages[1].wait_for_selector('.drawing-surface.can-draw');await pages[1].wait_for_timeout(300)
  assert await pages[1].evaluate("sessionStorage.getItem('ritkaos.token')")==token
  assert await pages[1].eval_on_selector('#canvas','c=>c.toDataURL()')==hashes2[0]
  # Guess through visible form, check synchronized reveal and scores.
  await pages[2].fill('#guess-input',answer);await pages[2].click('#guess-submit');await pages[0].wait_for_selector('.revealed-answer')
  assert (await pages[2].inner_text('.revealed-answer')).lower()==answer.lower()
  scores=await asyncio.gather(*[page.locator('#game-players .player-points').all_inner_texts() for page in pages]);assert scores[0]==scores[1]==scores[2]
  # Verify narrow-screen layout and canvas pixel reconstruction after resize.
  await pages[0].set_viewport_size({'width':390,'height':844});await pages[0].wait_for_timeout(250)
  assert await pages[0].evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  await pages[0].screenshot(path=str(OUT/'05-mobile.png'),full_page=True)
  assert not errors, errors
  report={'browser':'Chromium','contexts':3,'real_pointer_draw_sync':True,'pixel_identical_boards':True,'owner_only_undo':True,'refresh_reconnect':True,'guess_scoring_and_reveal':True,'mobile_390px_no_overflow':True,'page_errors':errors,'room':code}
  (OUT/'smoke-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
  await browser.close()
asyncio.run(main())
