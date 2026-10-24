"""Full touch-layout playthrough and a narrow-layout overflow check."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'tests/screenshots').mkdir(exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),headless=os.environ.get('HEADED')!='1',args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.route('https://**/*',lambda r:r.abort())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((ROOT/'index.html').read_text(),wait_until='domcontentloaded')
    page.click('#begin');page.click('#accept-cookies')
    page.fill('#password','Sorry49!Яx');page.fill('#email-local','imaginary');page.fill('#email-domain','example');page.select_option('#email-tld','com');page.uncheck('#reject-terms');page.click('#next-step')
    page.fill('#profile-name','Mobile Human');page.locator('#age-slider').evaluate("e=>{e.value='63';e.dispatchEvent(new Event('input'))}");page.click('[data-country="Sweden"]')
    for d in '555013':page.click(f'[data-digit="{d}"]')
    page.screenshot(path=str(ROOT/'tests/screenshots/13-mobile-profile.png'),full_page=True)
    page.click('#next-step');page.click('#support-hide')
    page.click('[data-plan="free"]')
    for i in range(3):page.uncheck(f'[data-addon="{i}"]')
    page.uncheck('[data-addon="0"]');page.click('[data-interest="0"]');page.click('[data-interest="2"]');page.click('#email-switch');page.click('#next-step')
    page.screenshot(path=str(ROOT/'tests/screenshots/14-mobile-captcha.png'),full_page=True)
    for i in [0,2,4]:page.check(f'[data-object="{i}"]')
    page.click('#next-step')
    for i in [0,2,4]:page.uncheck(f'[data-object="{i}"]')
    page.click('#next-step');page.click('#support-hide')
    for _ in range(2):
        page.locator('#terms-box').evaluate('e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event("scroll"));}')
        page.fill('#terms-word','banana');page.check('#terms-agree');page.click('#next-step')
    # Tap each new button position three times; the fourth tap submits.
    for _ in range(4):
        page.locator('#create-account').tap();page.wait_for_timeout(180)
    page.click('[data-modal-action="1"]')
    page.wait_for_function("document.querySelector('#loading-percent')?.textContent==='99%'")
    page.click('#loading-percent')
    assert page.evaluate('UserHostile.status.finished')
    assert page.evaluate('UserHostile.status.skips')==0
    assert not errors,errors
    print('FULL MOBILE FLOW PASSED',page.evaluate('UserHostile.status'))
    page.click('#play-again')
    for width in [320,360,768,1024,1920]:
        page.set_viewport_size({'width':width,'height':800})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),width
    print('NARROW AND WIDE LANDING LAYOUTS PASSED')
    b.close()
