"""Input, rendering and audio integration tests against the identical offline HTML.
Requires Playwright + Chromium. On Linux, set DISPLAY for SwiftShader if needed.
No test server or network requests are used.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os, shutil, time
root=Path(__file__).resolve().parents[1]
results=[];errors=[];requests=[]
def record(name,fn):
    try:
        detail=fn()
        results.append({'name':name,'status':'PASS','detail':detail})
    except Exception as e:
        results.append({'name':name,'status':'FAIL','error':str(e)})
    print(results[-1],flush=True)
def need(value,why='Assertion failed'):
    if not value: raise AssertionError(why)
with sync_playwright() as p:
    exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    opts={'headless':True,'args':['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']}
    if exe: opts['executable_path']=exe
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:requests.append(r.url))
    page.evaluate('window.SKYLINE_TEST=true')
    page.set_content((root/'index.html').read_text(),wait_until='load')
    page.wait_for_function('!!window.__skyline && __skyline.getState().renderedFrames>0',timeout=30000)
    def js(code): return page.evaluate(code)
    def state(): return js('__skyline.getState()')
    def advance(n): return js(f'__skyline.advance({n})')
    def start(activity='free',spawn='air',high=False):
        js(f'__skyline.selectActivity("{activity}"); __skyline.start("{spawn}")')
        if high: js('__skyline.setFlight({y:350})')
    def hold(key,seconds):
        page.keyboard.down(key)
        try:
            advance(seconds)
            return state()  # Sample while held; a slow renderer can advance between input RPCs.
        finally:
            page.keyboard.up(key)
    record('WebGL initialization and first frame',lambda:need(state()['renderedFrames']>0 and not page.is_visible('#error')))
    record('No audio starts before user interaction',lambda:need(js('__skyline.getAudio().state')=='not-started'))
    page.click('#flyBtn');page.wait_for_timeout(350)
    def test_fly_now():
        need(state()['phase']=='playing' and not state()['flight']['grounded'])
        radio=page.locator('#radio').bounding_box();instruments=page.locator('#instruments').bounding_box()
        need(radio['y']+radio['height']<=instruments['y']-12,'Radio overlaps instrument panel')
    record('Fly now enters controlled airborne flight with readable HUD',test_fly_now)
    record('Engine produces a non-silent audio signal',lambda:need(js('__skyline.getAudio().state')=='running' and js('__skyline.getAudio().level')>.002))
    def test_w():
        start();s=state();out=hold('w',2);need(out['flight']['speed']>s['flight']['speed']+10);need(abs(out['flight']['pitch'])<.0001);need(abs(out['flight']['y']-s['flight']['y'])<.01)
        return {'speed_mps':round(out['flight']['speed'],2),'pitch':out['flight']['pitch']}
    record('W accelerates without pitching or changing altitude',test_w)
    def test_s():
        start(high=True);out=hold('s',2);need(out['flight']['throttle']<.1);need(abs(out['flight']['pitch'])<.0001);need(not out['flight']['crashed'])
    record('S reduces throttle, not pitch',test_s)
    def test_right():
        start(high=True);out=hold('d',1.5);need(out['flight']['x']>12 and out['flight']['heading']>0);return round(out['flight']['x'],2)
    record('D turns right on actual keyboard events',test_right)
    def test_left():
        start(high=True);out=hold('a',1.5);need(out['flight']['x']< -12 and out['flight']['heading']<0)
    record('A turns left on actual keyboard events',test_left)
    def test_level():
        advance(3);out=state();need(abs(out['flight']['bank'])<.004);need(abs(out['flight']['pitch'])<.003)
    record('Release recenters bank and pitch',test_level)
    def test_climb():
        start(high=True);out=hold('ArrowUp',1.5);need(out['flight']['y']>365);start(high=True);out=hold('ArrowDown',1.5);need(out['flight']['y']<335)
    record('Up climbs and Down descends',test_climb)
    def test_brake():
        start(high=True);before=state()['flight']['speed'];out=hold('Space',3);need(out['phase']=='playing' and 0<out['flight']['speed']<34, str(out));return {'before_mps':round(before,2),'while_braking_mps':round(out['flight']['speed'],2)}
    record('Air brake slows without reversing',test_brake)
    def test_boost():
        start(high=True);out=hold('Shift',3);need(out['flight']['energy']<.5);need(out['flight']['speed']>80)
    record('Boost changes speed, sound and energy',test_boost)
    def test_camera():
        start(high=True);modes=[]
        for _ in range(3): page.keyboard.press('c');modes.append(state()['camera'])
        need(modes==[1,2,0]);return modes
    record('C cycles cockpit, wide and chase cameras',test_camera)
    def test_mouse():
        start(high=True);page.mouse.move(650,420);page.mouse.down();page.mouse.move(730,355);advance(1.2);out=state();need(out['flight']['x']>5 and out['flight']['y']>356);page.mouse.up();advance(3);need(abs(state()['flight']['bank'])<.01)
    record('Drag steering responds correctly and releases cleanly',test_mouse)
    def test_pause():
        start(high=True);page.keyboard.down('w');page.keyboard.press('Escape');before=state()['elapsed'];advance(4);need(state()['elapsed']==before);need(state()['phase']=='paused');need(js('__skyline.input().throttle')==0);page.keyboard.up('w');page.keyboard.press('Escape');need(state()['phase']=='playing')
    record('Pause freezes simulation and clears held inputs',test_pause)
    def test_runway():
        start(spawn='runway');out=hold('w',8);need(not out['flight']['grounded'] and not out['flight']['crashed']);need(out['flight']['y']>35);return {k:round(out['flight'][k],2) for k in ['y','z','speed']}
    record('Runway W-only takeoff completes without a crash',test_runway)
    def test_gate():
        start();advance(7.5);out=state();need(out['gate']>=1 and out['score']>=150, str(out));return {'gate':out['gate'],'score':out['score']}
    record('Flying through a gate updates score and progression',test_gate)
    def test_landing():
        start('landing');page.keyboard.down('ArrowDown');advance(18);page.keyboard.up('ArrowDown');s=state();need(s['flight']['grounded'] and not s['flight']['crashed']);page.keyboard.down('Space');advance(3);page.keyboard.up('Space');need(state()['phase']=='finished');return {'landings':s['flight']['landings'],'touchdown_mps':round(s['flight']['touchdownSpeed'],2)}
    record('Landing lesson can be completed using only Down and Space',test_landing)
    def test_collision():
        start();js('__skyline.setFlight({x:63,y:39,z:351,speed:40})');advance(.1);need(state()['phase']=='crashed');need(page.is_visible('#crash'));page.keyboard.press('r');need(state()['phase']=='playing');need(not state()['flight']['crashed']);need(state()['flight']['energy']==1)
    record('Obstacle collision shows recovery UI; R restores flight',test_collision)
    def test_ground_obstacle():
        start(spawn='runway');js('__skyline.setFlight({x:63,y:16.72,z:350,speed:18})');advance(.1);need(state()['phase']=='crashed');page.keyboard.press('r');need(state()['phase']=='playing')
    record('Taxiing into a building is detected, not clipped through',test_ground_obstacle)

    def test_near():
        start(high=True);js('''(()=>{const w=__skyline.getWorld(),p=w.planes[2];p.nearCooldown=0;__skyline.setFlight({x:p.x+20,y:p.y,z:p.z,speed:40,heading:p.heading});})()''');before=state()['score'];advance(.04);need(state()['score']>=before+250)
    record('NPC near-miss awards points without a collision',test_near)
    def test_timer():
        start('coast',high=True);js('__skyline.setElapsed(179.8)');advance(1);need(state()['phase']=='finished');before=state()['score'];advance(10);need(state()['score']==before)
    record('Coast race ends at the time limit and stops scoring',test_timer)
    def test_blur():
        start(high=True);page.keyboard.down('d');js('window.dispatchEvent(new Event("blur"))');need(state()['phase']=='paused');need(js('__skyline.input().turn')==0);page.keyboard.up('d');page.keyboard.press('Escape')
    record('Focus loss pauses and prevents stuck steering',test_blur)
    def test_mute():
        start(high=True);page.keyboard.press('m');page.wait_for_timeout(500);need(js('__skyline.getAudio().muted'));need(js('__skyline.getAudio().level')<.001);page.keyboard.press('m');page.wait_for_timeout(300);need(not js('__skyline.getAudio().muted'))
    record('M actually mutes the audio output',test_mute)
    def test_pause_audio():
        start(high=True);page.keyboard.press('Escape');page.wait_for_function('__skyline.getAudio().level<.001',timeout=5000);need(state()['phase']=='paused');page.keyboard.press('Escape');page.wait_for_function('__skyline.getAudio().level>.002',timeout=5000);need(state()['phase']=='playing')
    record('Pause silences engine and wind; resume restores them',test_pause_audio)

    def test_traffic():
        start(high=True)
        before=js('[__skyline.getWorld().vehicles[0],__skyline.getWorld().planes[1],__skyline.getWorld().boats[0]].map(p=>({x:p.x,z:p.z}))')
        advance(2)
        after=js('[__skyline.getWorld().vehicles[0],__skyline.getWorld().planes[1],__skyline.getWorld().boats[0]].map(p=>({x:p.x,z:p.z}))')
        need(all(((a['x']-b['x'])**2+(a['z']-b['z'])**2)**.5>1 for a,b in zip(after,before)))
        need(state()['boats']==6 and state()['cars']==7 and state()['npcCount']==4)
    record('AI aircraft, boats and vehicles animate',test_traffic)
    def test_road():
        bad=js('''(()=>{let count=0;const w=__skyline.getWorld();for(let t=0;t<300;t+=3){w.update(0,t);for(const c of w.vehicles)for(const b of w.solids){if(Math.abs(c.x-b.x)<b.w/2+1.5&&Math.abs(c.z-b.z)<b.d/2+3)count++;}}return count;})()''');need(bad==0,f'{bad} road/obstacle overlaps')
    record('Service traffic routes avoid buildings and hangars',test_road)
    def test_mobile():
        page.set_viewport_size({'width':390,'height':844});page.keyboard.press('Escape');page.click('#returnMenu');page.wait_for_timeout(600);box=page.locator('#flyBtn').bounding_box();need(0<=box['x']<390 and box['x']+box['width']<=390);page.screenshot(path=str(root/'mobile-preview.png'));page.click('#flyBtn');page.wait_for_timeout(700);need(state()['phase']=='playing');page.screenshot(path=str(root/'mobile-flight.png'));page.set_viewport_size({'width':1280,'height':800})
    record('Mobile-sized menu and flight HUD remain usable',test_mobile)
    record('No external network requests',lambda:need(len(requests)==0, str(requests)))
    record('No browser runtime or shader errors',lambda:need(not errors,str(errors)))
    page.screenshot(path=str(root/'tested-flight.png'))
    report={'tests':results,'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results),'browser':'Chromium + SwiftShader WebGL','method':'Identical self-contained HTML injected into a blank page. Actual browser key/pointer events, fixed-step time advances and seeded collision scenarios. Audio measured from the live output graph.','errors':errors,'external_requests':requests}
    (root/'tests'/'browser-results.json').write_text(json.dumps(report,indent=2))
    print('SUMMARY',report['passed'],report['failed'],flush=True)
    browser.close()
if any(r['status']=='FAIL' for r in results):raise SystemExit(1)
