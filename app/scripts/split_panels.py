import numpy as np, sys
from PIL import Image, ImageFilter
def runs(mask, minlen):
    out=[]; start=None
    for i,v in enumerate(list(mask)+[False]):
        if v and start is None: start=i
        if not v and start is not None:
            if i-start>=minlen: out.append((start,i))
            start=None
    return out
def segs(gut,n,minseg):
    out=[]; prev=0
    for a,b in gut:
        if a-prev>=minseg: out.append((prev,a))
        prev=b
    if n-prev>=minseg: out.append((prev,n))
    return out
def panels(im):
    a=np.asarray(im).astype(int); w=a.min(axis=2)>200; ws=a.min(axis=2)>225; H,W=w.shape; out=[]
    for y0,y1 in segs(runs(w.mean(axis=1)>0.8,2),H,40):
        b=ws[y0:y1]
        cols=segs(runs(b.mean(axis=0)>0.95,3),W,int(W*0.3))  # 세로 칸은 깨끗한 흰 여백일 때만, 30% 미만 조각은 안 나눔
        if not cols: cols=[(0,W)]
        for x0,x1 in cols:
            sub=w[y0:y1,x0:x1]; r=np.where(sub.mean(axis=1)<0.97)[0]; c=np.where(sub.mean(axis=0)<0.97)[0]
            if len(r) and len(c): out.append((x0+c[0],y0+r[0],x0+c[-1]+1,y0+r[-1]+1))
    return out
W,GAP,SH=720,36,1800
for name in sys.argv[1:]:
    src=f'/home/claude/devtaego/dibs/app/public/episodes/{name}-1.jpg'
    im=Image.open(src).convert('RGB'); ps=panels(im)
    tiles=[]
    for (x0,y0,x1,y1) in ps:
        p=im.crop((x0,y0,x1,y1)); h=round(p.height*W/p.width)
        p=p.resize((W,h),Image.LANCZOS)
        if p.width/(x1-x0)>1.3: p=p.filter(ImageFilter.UnsharpMask(radius=1.2,percent=60,threshold=2))
        tiles.append(p)
    total=sum(t.height for t in tiles)+GAP*(len(tiles)+1)
    strip=Image.new('RGB',(W,total),(255,255,255)); y=GAP
    for t in tiles: strip.paste(t,(0,y)); y+=t.height+GAP
    n=(total+SH-1)//SH
    for i in range(n):
        tile=Image.new('RGB',(W,SH),(255,255,255)); tile.paste(strip.crop((0,i*SH,W,min(total,(i+1)*SH))),(0,0))
        tile.save(f'/home/claude/devtaego/dibs/app/public/episodes/{name}-1-{i+1:02d}.jpg',quality=82,optimize=True,progressive=True)
    strip.resize((W//6,total//6)).save(f'/tmp/cuts/{name}_preview.png')
    print(name, len(ps), 'panels ->', n, 'slices', total)
