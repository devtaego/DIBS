import asyncio, re
from playwright.async_api import async_playwright
URL='http://127.0.0.1:8090/_f/tok123/index.html'
R=[]
def ok(n,c,x=''): R.append(('PASS' if c else 'FAIL',n,x))
num=lambda t,pat: int(re.search(pat,t).group(1).replace(',','')) if re.search(pat,t) else -1
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('dibs.introSeen','1')"); await pg.goto(URL); await pg.wait_for_timeout(3500)
        async def go(path, wait=2200):
            await pg.evaluate(f"history.pushState({{}}, '', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(wait)
        T=lambda: pg.evaluate("document.body.innerText")
        await go('/'); t=await T(); ok('홈 투자한 작품 라벨', '투자한 작품 1' in t and '청월도 8%' not in t)
        await pg.screenshot(path='/tmp/shots/v3/h_home.png')
        await go('/wallet'); t=await T(); d0=num(t,r'([\d,]+)원\n'); ok('지갑 예치금', d0>0, str(d0))
        await pg.screenshot(path='/tmp/shots/v3/h_wallet.png')
        # 충전 50만
        await go('/transfer?type=in'); await pg.get_by_text('+50만').click(); await pg.get_by_text('500,000원 충전하기').click(); await pg.wait_for_timeout(1000)
        await pg.screenshot(path='/tmp/shots/v3/h_splash.png'); await pg.wait_for_timeout(2600)
        await pg.screenshot(path='/tmp/shots/v3/h_confirm.png')
        await pg.get_by_text('500,000원 충전하기').last.click(); await pg.wait_for_timeout(1500); t=await T()
        ok('충전 완료 화면', '예치금을 충전했어요' in t); await pg.screenshot(path='/tmp/shots/v3/h_done.png')
        await go('/wallet'); t=await T(); d1=num(t,r'([\d,]+)원\n'); ok('충전 반영', d1==d0+500000, f'{d0}->{d1}'); ok('내역 예치금 충전', '예치금 충전' in t)
        # 출금 10만
        await go('/transfer?type=out'); 
        for k in ['1','0','0','0','0','0']: await pg.get_by_label(k,exact=True).click()
        await pg.get_by_text('100,000원 출금하기').click(); await pg.wait_for_timeout(3600)
        await pg.get_by_text('100,000원 출금하기').last.click(); await pg.wait_for_timeout(1500)
        await go('/wallet'); t=await T(); d2=num(t,r'([\d,]+)원\n'); ok('출금 반영', d2==d1-100000, f'{d1}->{d2}')
        # 청약: 이세계 맛집 (funding id?) → 홈에서 찾기: funding 3?
        await go('/my'); t=await T(); f0=t.count('건 진행 중'); act0=num(t,r'(\d+)건 진행 중')
        await go('/subscribe/3'); t=await T(); ok('청약 화면', '얼마나 펀딩할까요' in t or '펀딩' in t)
        await pg.get_by_text('+5만').first.click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('펀딩하기',exact=False).last.click(); await pg.wait_for_timeout(1200)
        for lab in ['모두 확인했어요']:
            if await pg.get_by_text(lab).count(): await pg.get_by_text(lab).first.click()
        await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/shots/v3/h_terms.png')
        await pg.get_by_text('키움증권에서 결제하기',exact=False).last.click(); await pg.wait_for_timeout(3800)
        await pg.screenshot(path='/tmp/shots/v3/h_kiwoom.png')
        await pg.get_by_text('결제하고 청약하기',exact=False).last.click(); await pg.wait_for_timeout(2000); t=await T()
        ok('키움 청약 완료', '키움에서 청약을 접수했어요' in t, t[:80].replace('\n',' '))
        await go('/my'); t=await T(); act1=num(t,r'(\d+)건 진행 중'); ok('MY 진행 중 펀딩 +1', act1==act0+1, f'{act0}->{act1}')
        await go('/portfolio?tab=subs'); t=await T(); ok('내 펀딩에 반영', '이세계 맛집' in t)
        await go('/wallet'); t=await T(); d3=num(t,r'([\d,]+)원\n'); ok('청약 증거금 차감', d3==d2-150000, f'{d2}->{d3}'); ok('내역 청약', '청약 증거금' in t)
        await go('/funding/1'); await pg.screenshot(path='/tmp/shots/v3/h_funding.png')
        await go('/explore'); await pg.screenshot(path='/tmp/shots/v3/h_explore.png')
        await go('/market'); await pg.screenshot(path='/tmp/shots/v3/h_market.png')
        await go('/my'); await pg.screenshot(path='/tmp/shots/v3/h_my.png')
        await go('/shorts',6000); await pg.screenshot(path='/tmp/shots/v3/h_shorts.png')
        print(errs[:5]); await b.close()
asyncio.run(main())
for r in R: print(*r)
