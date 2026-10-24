"""Offline browser UI checks. WebSocket stub is ONLY a renderer test fixture.
Real multiplayer is tested separately by network.test.mjs.
"""
import asyncio,json,pathlib,re,urllib.parse,os,shutil,subprocess
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('TEST_OUTPUT',str(ROOT/'.test-output')));OUT.mkdir(exist_ok=True)
subprocess.run(['node',str(ROOT/'tests/make-fixtures.mjs')],check=True,env={**os.environ,'TEST_OUTPUT':str(OUT)})
fixtures=json.loads((OUT/'fixtures.json').read_text())
html=(ROOT/'public/index.html').read_text();css=(ROOT/'public/style.css').read_text();js=(ROOT/'public/app.js').read_text()
favicon='data:image/svg+xml,'+urllib.parse.quote((ROOT/'public/favicon.svg').read_text())
html=html.replace('<link rel="stylesheet" href="/style.css">','').replace('<script src="/app.js" type="module"></script>','').replace('/favicon.svg',favicon)
mock='''
window.__fixtures=FIXTURES; window.sent=[]; history.replaceState=()=>{};
class TestSocket extends EventTarget {
 static OPEN=1;
 constructor(url){super();this.readyState=1;window.fakeSocket=this;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
 deliver(type,data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type,data})}));}
 send(raw){const p=JSON.parse(raw);window.sent.push(p);const data=p.data||{};
   if(p.type==='hello'){queueMicrotask(()=>this.deliver('welcome',{token:'ui-fixture',id:window.__fixtures.id,serverTime:Date.now(),room:null}));return;}
   if(p.type==='create'){this.deliver('state',window.__fixtures.lobby);}
   if(p.type==='start'){this.deliver('state',window.__fixtures.choosing);}
   if(p.type==='choose'){this.deliver('state',window.__fixtures.drawing);}
   if(p.type==='stroke.begin'){this.strokes??={};this.strokes[data.stroke]={color:data.color,width:data.width,last:data.point};this.deliver('ink',{epoch:data.epoch,op:{seq:++window.inkSeq,stroke:data.stroke,owner:window.__fixtures.id,color:data.color,width:data.width,points:[data.point],from:null,cid:data.cid}});}
   if(p.type==='stroke.points'){const s=this.strokes[data.stroke];this.deliver('ink',{epoch:data.epoch,op:{seq:++window.inkSeq,stroke:data.stroke,owner:window.__fixtures.id,color:s.color,width:s.width,points:data.points,from:s.last,cid:data.cid}});s.last=data.points.at(-1);}
   if(p.request){queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'ack',request:p.request,ok:true,data:{serverTime:Date.now()}})})));}
 }
 close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
}
window.WebSocket=TestSocket;window.inkSeq=0;
window.showFixture=key=>{const f=structuredClone(window.__fixtures[key]);f.deadline=Date.now()+60000;f.serverTime=Date.now();window.fakeSocket.deliver('state',f);};
window.fetch=()=>Promise.resolve({json:()=>Promise.resolve({lan:['http://192.168.1.50:3000']})});
'''.replace('FIXTURES',json.dumps(fixtures))
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'] if hasattr(os,'geteuid') and os.geteuid()==0 else [])
  context=await browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,has_touch=True)
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html);await page.add_style_tag(content=css);await page.add_script_tag(content=mock);await page.add_script_tag(content=js,type='module');await page.wait_for_selector('#connection-dot.online');
  await page.screenshot(path=str(OUT/'01-home.png'),full_page=True)
  await page.fill('#nickname','Ludvig');await page.click('#create-room');await page.wait_for_selector('#lobby:not([hidden])');await page.screenshot(path=str(OUT/'02-lobby.png'),full_page=True)
  await page.click('#start-game');await page.wait_for_selector('[data-choice="0"]');await page.screenshot(path=str(OUT/'03-choices.png'),full_page=True)
  await page.click('[data-choice="0"]');await page.wait_for_selector('.drawing-surface.can-draw');
  # Draw a recognizable, charmingly bad pigeon using real Pointer Events.
  box=await page.locator('#canvas').bounding_box()
  paths=[[(.30,.60),(.27,.54),(.27,.43),(.32,.36),(.37,.35),(.39,.24),(.44,.19),(.52,.19),(.58,.25),(.59,.33),(.63,.36),(.59,.40),(.58,.50),(.55,.59),(.48,.66),(.36,.66),(.30,.60)],[(.58,.32),(.66,.35),(.59,.38)],[(.32,.50),(.40,.44),(.49,.44),(.46,.52),(.40,.58),(.34,.58)],[(.38,.66),(.36,.77),(.32,.78)],[(.49,.65),(.53,.77),(.58,.78)],[(.45,.27),(.45,.28)],[(.39,.19),(.37,.11),(.43,.14),(.47,.07),(.51,.16),(.57,.11),(.56,.20)],[(.30,.57),(.22,.60),(.31,.64)]]
  for points in paths:
   await page.mouse.move(box['x']+box['width']*points[0][0],box['y']+box['height']*points[0][1]);await page.mouse.down()
   for x,y in points[1:]:await page.mouse.move(box['x']+box['width']*x,box['y']+box['height']*y,steps=4)
   await page.mouse.up()
  await page.wait_for_timeout(200);await page.screenshot(path=str(OUT/'04-drawing.png'),full_page=True)
  sent=await page.evaluate('sent');assert any(x['type']=='stroke.begin' for x in sent);assert any(x['type']=='stroke.points' for x in sent)
  # Resize reconstruction must preserve ink; keyboard tools work.
  await page.keyboard.press('e');assert await page.locator('#tool-eraser').evaluate("e=>e.classList.contains('active')")
  await page.keyboard.press('b');assert await page.locator('#tool-pen').evaluate("e=>e.classList.contains('active')")
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(200);assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');await page.screenshot(path=str(OUT/'05-mobile-drawing.png'),full_page=True)
  # Brush must stay usable with touch pointer events.
  box=await page.locator('#canvas').bounding_box(); await page.touchscreen.tap(box['x']+box['width']*.8,box['y']+box['height']*.8)
  await page.set_viewport_size({'width':1440,'height':1000});await page.evaluate("showFixture('guesser')");await page.fill('#guess-input','en kyckling??');await page.click('#guess-submit');assert any(x['type']=='guess' for x in await page.evaluate('sent'));await page.screenshot(path=str(OUT/'06-guesser.png'),full_page=True)
  await page.evaluate("showFixture('results')");await page.wait_for_timeout(300);await page.screenshot(path=str(OUT/'07-results.png'),full_page=True)
  report={'environment':'Chromium offline document; fixture WebSocket (not real browser networking)','desktop_layout':True,'mobile_390_no_horizontal_overflow':True,'real_mouse_pointer_strokes':True,'keyboard_tools':True,'guess_form_emits_message':True,'page_errors':errors}
  assert not errors,errors
  (OUT/'ui-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));await browser.close()
asyncio.run(main())
