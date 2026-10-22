"""Browser smoke/regression tests for approved standalone receiver, not repo integration."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
BASE=Path(__file__).resolve().parents[1]
HTML=(BASE/'Traveller_Comms_Final_Live_Preview.html').read_text(encoding='utf8')

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--allow-file-access-from-files'])
        page=await browser.new_page(viewport={'width':1648,'height':927})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        await page.set_content(HTML,wait_until='load',timeout=50000)
        await page.wait_for_selector('.trx-receiver',timeout=12000)
        assert await page.locator('[data-trx-next],.trx-preview-next,#demo-next,#style-bars,#style-line').count()==0
        assert await page.locator('.trx-receiver').get_attribute('data-waveform')=='bars'
        assert await page.locator('[data-trx-sig] i').count()==10
        await page.click('#demo-idle')
        await page.wait_for_timeout(350)
        async def snapshot():
            return await page.evaluate('''() => ({
               tower:getComputedStyle(document.querySelector('.trx-tower-ping--a')).transform,
               sig:getComputedStyle(document.querySelector('.trx-sigbars i')).opacity,
               dot:getComputedStyle(document.querySelector('.trx-antenna-dot')).opacity,
               trace:document.querySelector('[data-trx-trace]').getAttribute('d'),
               idle:document.querySelector('.trx-receiver').dataset.mode,
               wave:document.querySelector('.trx-receiver').dataset.waveform,
               copy:document.querySelector('[data-trx-words]').textContent
            })''')
        snap1=await snapshot()
        await page.wait_for_timeout(500)
        snap2=await snapshot()
        assert snap1['tower']!=snap2['tower'], 'antenna not independently moving during idle'
        assert snap1['sig']==snap2['sig'], 'SIG brightness changed during idle'
        assert snap1['dot']==snap2['dot'], 'mast brightness changed during idle'
        assert snap1['trace']!=snap2['trace'], 'waveform froze between transmissions'
        assert snap2['wave']=='bars'
        await page.locator('#custom-sample summary').click()
        await page.fill('#custom-source','STATION KORNEV TWENTY-SEVEN UNUSUALLY LONG NAME')
        await page.fill('#custom-text','Control, read me back: bearing zero-eight-five. Hold for the traffic shuttle, then proceed.')
        await page.click('#demo-custom')
        await page.wait_for_timeout(1700)
        assert await page.locator('.trx-receiver').get_attribute('data-mode')=='receiving'
        assert await page.locator('[data-trx-trace]').get_attribute('d')
        sig_active=await page.locator('.trx-sigbars i').first.evaluate('(e)=>getComputedStyle(e).opacity')
        assert sig_active==snap2['sig'], 'speech altered SIG brightness'
        assert await page.locator('[data-trx-channel]').text_content() == 'CH 03'
        assert await page.locator('[data-trx-source]').get_attribute('title')=='STATION KORNEV TWENTY-SEVEN UNUSUALLY LONG NAME'
        await page.click('#demo-beowulf')
        await page.wait_for_timeout(750)
        assert 'BEOWULF' in (await page.locator('[data-trx-source]').text_content())
        assert 'ARCHIVE' in (await page.locator('[data-trx-kind]').text_content())
        assert not errors, errors
        await page.screenshot(path=str(BASE/'qa/final-receiver-on-susadi.png'),full_page=True)
        # Layout checks for 3 realistic widths.
        for width in (375,768,1648):
            await page.set_viewport_size({'width':width,'height':927})
            await page.wait_for_timeout(200)
            b=await page.locator('.trx-receiver').bounding_box()
            assert b and b['x']>=-1 and b['x']+b['width']<=width+1,(width,b)
        rm=await browser.new_page(viewport={'width':1648,'height':927},reduced_motion='reduce')
        await rm.set_content(HTML,wait_until='load',timeout=50000)
        await rm.wait_for_selector('.trx-tower-ping--a')
        a=await rm.locator('.trx-tower-ping--a').evaluate('(e)=>getComputedStyle(e).animationName')
        assert a=='none',f'reduced-motion tower animation still on: {a}'
        await browser.close()
        print('PASS: no skip / no mode switch; bars-only; idle waveform; idle antenna; calm SIG/mast; arbitrary long text; Beowulf; responsive; reduced motion; no page errors')

if __name__=='__main__':
    asyncio.run(main())
