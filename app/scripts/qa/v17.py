import asyncio, re
from playwright.async_api import async_playwright
URL='http://127.0.0.1:8091/_f/tok123/index.html'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={'width':390,'height':844})).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('dibs.introSeen','1')"); await pg.goto(URL); await pg.wait_for_timeout(3000)
        async def go(path, wait=2200):
            await pg.evaluate(f"history.pushState({{}}, '', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(wait)
        T=lambda: pg.evaluate("document.body.innerText")
        await go('/my'); await pg.get_by_text('출석하고', exact=False).click(); await pg.wait_for_timeout(800)
        await go('/transfer?type=in'); await pg.get_by_text('+10만').click(); await pg.get_by_text('100,000원 충전하기').click(); await pg.wait_for_timeout(3700)
        await pg.get_by_text('100,000원 충전하기').last.click(); await pg.wait_for_timeout(1500)
        # 새로고침
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        await go('/my'); t=await T(); print('새로고침 후 출석 유지', '오늘 출석 완료' in t, '예치금 4,018,990' in t or '4,018,990' in t)
        # 초기화
        await pg.get_by_text('시연 처음부터').click(); await pg.wait_for_timeout(300); await pg.get_by_text('한 번 더 누르면', exact=False).click(); await pg.wait_for_timeout(4500)
        await go('/my'); t=await T(); print('초기화 후', '출석하고' in t, '3,918,990' in t)
        await go('/notifications'); await pg.screenshot(path='/tmp/shots/v3/p1.png')
        await go('/work/1'); await pg.screenshot(path='/tmp/shots/v3/p2.png')
        await go('/episode/1'); await pg.screenshot(path='/tmp/shots/v3/p3.png')
        print(errs); await b.close()
asyncio.run(main())
