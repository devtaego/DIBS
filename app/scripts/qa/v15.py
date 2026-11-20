import asyncio
from playwright.async_api import async_playwright
URL='http://127.0.0.1:8090/_f/tok123/index.html'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={'width':390,'height':844})).new_page()
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('dibs.introSeen','1')"); await pg.goto(URL); await pg.wait_for_timeout(3000)
        await pg.get_by_label('검색').first.click(); await pg.wait_for_timeout(1500)
        print('검색창 열림', await pg.get_by_label('검색어').count())
        await pg.get_by_label('검색어').fill('청월'); await pg.wait_for_timeout(1200)
        t=await pg.evaluate("document.body.innerText"); print('결과', "'청월' 검색 결과" in t)
        await pg.get_by_label('검색 닫기').click(); await pg.wait_for_timeout(800)
        t=await pg.evaluate("document.body.innerText"); print('닫힘→추천', '추천' in t and await pg.get_by_label('검색어').count()==0)
        await pg.screenshot(path='/tmp/shots/v3/j_back.png'); await b.close()
asyncio.run(main())
