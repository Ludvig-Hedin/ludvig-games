from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/screenshots';OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),headless=os.environ.get('HEADED')!='1',args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
    page.set_default_timeout(12000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://**/*',lambda route:route.abort())
    page.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
    page.screenshot(path=str(OUT/'01-landing.png'),full_page=True)
    page.click('#big-no');page.click('#decoy-click')
    page.click('#begin')
    page.screenshot(path=str(OUT/'02-cookie.png'),full_page=True)
    page.click('#accept-cookies')
    page.click('#support-hide')
    page.click('#next-step')
    page.fill('#email-local','test');page.fill('#email-domain','example');page.select_option('#email-tld','com')
    page.fill('#password','Abcdefghij');page.click('#next-step')
    assert 'Include a number' in page.locator('#password-rules').inner_text()
    page.fill('#password','Abcdefghi12');page.click('#next-step')
    assert 'add up to 13' in page.locator('#password-rules').inner_text()
    page.fill('#password','Abcdefghi49');page.click('#next-step')
    assert 'sorry' in page.locator('#password-rules').inner_text()
    page.fill('#password','Sorry49!xx');page.click('#next-step')
    assert 'Я' in page.locator('#password-rules').inner_text()
    page.click('#insert-cyrillic')
    page.click('#next-step')
    assert 'still not accepting' in page.locator('#stage-error').inner_text()
    page.uncheck('#reject-terms')
    page.screenshot(path=str(OUT/'03-account.png'),full_page=True)
    page.click('#next-step')
    assert page.evaluate('UserHostile.status.stage')==2
    page.locator('#age-slider').evaluate("el=>{el.value='63';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.click('[data-country="Sweden"]')
    for digit in '555013':page.click(f'[data-digit="{digit}"]')
    assert page.locator('#phone-display').inner_text()=='555013'
    page.click('#next-step')
    assert 'name is required' in page.locator('#stage-error').inner_text()
    page.fill('#profile-name','Test Human')
    page.screenshot(path=str(OUT/'04-profile.png'),full_page=True)
    page.click('#next-step')
    assert page.evaluate('UserHostile.status.stage')==3
    page.click('#support-hide')
    page.click('[data-plan="free"]')
    for i in range(3):page.uncheck(f'[data-addon="{i}"]')
    assert page.locator('[data-addon="0"]').is_checked()
    page.uncheck('[data-addon="0"]')
    assert page.locator('#pref-total').inner_text()=='$0.00'
    # Five interests preselected; remove two, despite the first-click reorder.
    page.click('[data-interest="0"]');page.click('[data-interest="2"]')
    page.click('#email-switch')
    page.screenshot(path=str(OUT/'05-preferences.png'),full_page=True)
    page.click('#next-step')
    assert page.evaluate('UserHostile.status.stage')==4
    
    if page.locator('#captcha-scene canvas').count():
        page.locator('#captcha-scene canvas').click(position={'x':80,'y':65})
    else:
        page.click('[data-spin="0"]')
    for i in [0,2,4]:page.check(f'[data-object="{i}"]')
    page.screenshot(path=str(OUT/'06-captcha.png'),full_page=True)
    page.click('#next-step')
    assert 'invisible bicycles' in page.locator('.captcha-heading').inner_text()
    page.click('#next-step')
    assert 'no correct objects' in page.locator('#stage-error').inner_text()
    for i in [0,2,4]:page.uncheck(f'[data-object="{i}"]')
    page.click('#next-step')
    assert page.evaluate('UserHostile.status.stage')==5
    page.click('#support-hide')
    page.locator('#terms-box').evaluate('el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event("scroll"));}')
    page.fill('#terms-word','BANANA');page.check('#terms-agree')
    page.click('#next-step')
    assert 'just changed' in page.locator('#stage-error').inner_text()
    page.locator('#terms-box').evaluate('el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event("scroll"));}')
    page.check('#terms-agree')
    page.screenshot(path=str(OUT/'07-terms.png'),full_page=True)
    page.click('#next-step')
    assert page.evaluate('UserHostile.status.stage')==6
    # Exercise the actual mouse-dodging interaction, then let it settle.
    for i in range(3):
        box=page.locator('#create-account').bounding_box()
        page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        page.wait_for_timeout(220)
        page.mouse.move(20,70)
    assert page.locator('#create-account').evaluate("el=>el.classList.contains('exhausted')")
    page.screenshot(path=str(OUT/'08-final.png'),full_page=True)
    page.click('#create-account')
    page.click('[data-modal-action="1"]')
    page.wait_for_function("document.querySelector('#loading-percent')?.textContent==='99%'",timeout=10000)
    page.click('#loading-percent')
    assert page.evaluate('UserHostile.status.finished')
    page.screenshot(path=str(OUT/'09-victory.png'),full_page=True)
    print('DESKTOP',json.dumps(page.evaluate('UserHostile.status')))
    print('ERRORS',errors)
    assert not errors,errors
    # Replay clears progress; escape really pauses and resumes.
    page.click('#play-again');assert page.locator('#begin').is_visible()
    page.click('#begin');page.click('#reject-cookies');page.click('#support-hide')
    page.keyboard.press('Escape');assert page.locator('.pause-window').is_visible()
    t=page.evaluate('UserHostile.status.elapsed');page.wait_for_timeout(500)
    assert abs(page.evaluate('UserHostile.status.elapsed')-t)<.05
    page.click('#real-hint');assert page.evaluate('UserHostile.status.penalty')==15
    page.check('#real-readable');page.uncheck('#real-motion')
    page.keyboard.press('Escape');assert not page.locator('.pause-window').count()
    # Responsive smoke test + assisted completion on touch-sized viewport.
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile.route('https://**/*',lambda route:route.abort())
    mobile_errors=[];mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
    mobile.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
    mobile.screenshot(path=str(OUT/'10-mobile-landing.png'),full_page=True)
    mobile.click('#begin');mobile.click('#accept-cookies')
    mobile.screenshot(path=str(OUT/'11-mobile-account.png'),full_page=True)
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    for s in range(1,7):
        mobile.click('#safety-help');mobile.click('#real-skip')
        assert mobile.evaluate('UserHostile.status.stage')==s+1
    assert mobile.evaluate('UserHostile.status.finished')
    mobile.screenshot(path=str(OUT/'12-mobile-victory.png'),full_page=True)
    print('MOBILE',json.dumps(mobile.evaluate('UserHostile.status')))
    print('MOBILE_ERRORS',mobile_errors);assert not mobile_errors
    browser.close()
