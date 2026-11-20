import asyncio, re, json
from playwright.async_api import async_playwright
URL='http://127.0.0.1:8090/_f/tok123/index.html'
ROUTES=['/','/explore','/explore?search=1','/shorts','/market','/my','/notifications','/wallet','/transfer?type=in','/transfer?type=out','/portfolio','/portfolio?tab=subs','/dividends','/risk-profile','/profile',
 '/me/dibs','/me/alerts','/me/account','/me/limits','/me/docs','/me/help','/me/terms','/intro?replay=1',
 '/work/1','/work/2','/work/7','/work/42','/funding/1','/funding/2','/funding/3','/security/2','/subscribe/1','/subscribe/3','/order/2?side=BUY','/order/2?side=SELL','/kiwoom/1?units=5','/episode/1','/episode/4','/episode/245']
BAD=re.compile(r'undefined|NaN|\bnull\b|NOT_FOUND|not_found|Infinity|\[object|모의|시연|D-undefined|Error')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={'width':390,'height':844})).new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:160])); pg.on('console', lambda m: errs.append('C:'+m.text[:160]) if m.type=='error' else None)
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('dibs.introSeen','1')"); await pg.goto(URL); await pg.wait_for_timeout(3000)
        out=[]
        for r in ROUTES:
            errs.clear()
            await pg.evaluate(f"history.pushState({{}}, '', '{r}'); dispatchEvent(new PopStateEvent('popstate'))"); await pg.wait_for_timeout(3600 if 'kiwoom' in r or 'transfer' in r else 2000)
            t=await pg.evaluate("document.body.innerText")
            hits=sorted(set(m.group(0) for m in BAD.finditer(t)))
            ctx=[t[max(0,m.start()-25):m.end()+25].replace('\n',' ') for m in BAD.finditer(t)][:3]
            name=r.strip('/').replace('/','_').replace('?','_').replace('=','') or 'home'
            await pg.screenshot(path=f'/tmp/shots/sw/{name}.png')
            out.append((r, hits, ctx, errs[:2], len(t)))
        for o in out:
            flag='!!' if (o[1] or o[3] or o[4]<30) else 'ok'
            print(flag, o[0], o[1], o[2], o[3], o[4])
        await b.close()
asyncio.run(main())
