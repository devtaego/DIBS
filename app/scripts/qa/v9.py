import asyncio, re
from playwright.async_api import async_playwright
URL='http://127.0.0.1:8090/_f/tok123/index.html'
R=[]
def ok(name, cond, extra=''): R.append(('PASS' if cond else 'FAIL', name, extra))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('dibs.introSeen','1')"); await pg.goto(URL); await pg.wait_for_timeout(3500)
        async def go(path, wait=2200):
            await pg.evaluate(f"history.pushState({{}}, '', '{path}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(wait)
        async def text(): return await pg.evaluate("document.body.innerText")
        # MY 기본
        await go('/my'); t=await text()
        m=re.search(r'관심 작품\s*(\d+)작품', t); dib0=int(m.group(1)) if m else -1
        ok('MY 접속 N일째 표시', '접속 1일째' in t); ok('MY 관심 작품 수', dib0>0, str(dib0))
        ok('모의 문구 없음(MY)', '모의' not in t)
        c0=int(re.search(r'보유 ([\d,]+)코인', t).group(1).replace(',','')) if re.search(r'보유 ([\d,]+)코인', t) else -1
        # 출석
        await pg.get_by_text('출석하고', exact=False).click(); await pg.wait_for_timeout(1500); t=await text()
        c1=int(re.search(r'보유 ([\d,]+)코인', t).group(1).replace(',','')) if re.search(r'보유 ([\d,]+)코인', t) else -1
        ok('출석 → 코인 +200(3일째)', c1==c0+200, f'{c0}->{c1}'); ok('출석 완료 표시', '오늘 출석 완료' in t)
        await pg.screenshot(path='/tmp/shots/v3/f_my.png')
        # 찜: 공모 전 작품(편의점 마법사 42)은 찜 상태 → 해제
        await go('/work/42'); 
        await pg.get_by_label('찜 해제').click(); await pg.wait_for_timeout(800)
        ok('작품 하트 해제', await pg.get_by_label('찜하기').count()>0)
        await go('/my'); t=await text(); m=re.search(r'관심 작품\s*(\d+)작품', t); d1=int(m.group(1)) if m else -1
        ok('찜 해제 → MY 관심 수 -1', d1==dib0-1, f'{dib0}->{d1}')
        await go('/me/dibs'); t=await text(); ok('관심 작품 목록에서 빠짐', '새벽 세시의 편의점 마법사' not in t)
        await go('/work/42'); await pg.get_by_label('찜하기').click(); await pg.wait_for_timeout(800)
        await go('/me/dibs'); t=await text(); ok('다시 찜 → 목록에 추가', '새벽 세시의 편의점 마법사' in t)
        # 쇼츠 하트가 찜 상태 반영 (첫 쇼츠 = 편의점 마법사)
        await go('/shorts',3000); t=await text(); ok('쇼츠 하트 = 찜함', '찜함' in t)
        # 유료 회차: 코인으로 열기
        await go('/episode/4'); t=await text(); ok('유료 회차 잠김', '코인이 필요해요' in t); ok('키움 포인트 버튼', '키움 포인트 300P로 열기' in t)
        await pg.screenshot(path='/tmp/shots/v3/f_lock.png')
        await pg.get_by_text('코인으로 열기',exact=True).click(); await pg.wait_for_timeout(1500); t=await text()
        ok('코인으로 열림', '코인이 필요해요' not in t)
        await go('/episode/5'); await pg.get_by_text('키움 포인트 300P로 열기').click(); await pg.wait_for_timeout(1500); t=await text()
        ok('키움 포인트로 열림', '코인이 필요해요' not in t)
        await go('/me/account'); t=await text(); ok('키움 포인트 2,700P', '2,700P' in t, re.findall(r'[\d,]+P',t)[:2].__str__())
        await pg.get_by_text('키움증권 계좌 연결하기').click(); await pg.wait_for_timeout(600)
        await go('/my'); t=await text(); ok('연결 계좌 반영', '키움 ••31' in t)
        # 프로필 편집
        await go('/profile'); await pg.locator('input').first.fill('디비팬'); await pg.get_by_text('저장하기').click(); await pg.wait_for_timeout(1500)
        await go('/my'); t=await text(); ok('닉네임 변경 반영', '디비팬' in t)
        await pg.screenshot(path='/tmp/shots/v3/f_my2.png')
        # 투자성향
        await go('/risk-profile')
        for lab in ['3년 이상','더 산다','30% 이상']:
            await pg.get_by_text(lab,exact=True).first.click()
        opts=pg.locator('div[role="button"], [tabindex="0"]')
        t=await text()
        # FAQ 하나만 열림
        await go('/me/help'); await pg.get_by_text('조각이 뭔가요?').click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('목표에 못 미치면요?').click(); await pg.wait_for_timeout(300); t=await text()
        ok('FAQ 하나만 열림', ('1조각은 1만 원' not in t) and ('전액 돌려드려요' in t))
        # 댓글 등록
        await go('/shorts',3000); await pg.get_by_text('댓글 ',exact=False).first.click(); await pg.wait_for_timeout(600)
        await pg.locator('input, textarea').last.fill('정주행 각이네요'); await pg.get_by_label('댓글 등록').click(); await pg.wait_for_timeout(500); t=await text()
        ok('댓글 등록', '정주행 각이네요' in t)
        # 전역 '모의' 문구
        for path in ['/','/market','/me/account','/kiwoom/1?units=5']:
            await go(path, 3500 if 'kiwoom' in path else 2000); t=await text(); ok(f'모의 없음 {path}', '모의' not in t, ', '.join(re.findall(r'.{0,12}모의.{0,12}',t))[:120])
        print(errs[:5]); await b.close()
asyncio.run(main())
for r in R: print(*r)
