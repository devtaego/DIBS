"""정적 데모 웹 빌드를 Claude 아티팩트로 올릴 수 있게 다듬는다.

    EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir dist-demo
    python3 scripts/artifact_postprocess.py dist-demo

아티팩트 호스팅 조건에 맞춘다.
- '_' 로 시작하는 경로는 서버 예약 이름: _expo/ → xpo/, _layout-*.js → layout-*.js, [id]-*.js → id-*.js
- 페이지가 하위 경로(/<토큰>/index.html)에서 열린다: 스크립트·에셋·청크 주소를 상대 경로로 바꾸고,
  <base> 를 문서 폴더로 고정한 뒤 주소창 경로를 '/' 로 바꿔 expo-router 가 홈에서 시작하게 한다.
"""
import os
import re
import shutil
import sys

root = os.path.abspath(sys.argv[1])

# 1) 예약 이름 피하기
renames: dict[str, str] = {}
for dp, _, fn in os.walk(root):
    for f in fn:
        rel = os.path.relpath(os.path.join(dp, f), root)
        new = re.sub(r"^_expo/", "xpo/", rel)
        base = os.path.basename(new).replace("[", "").replace("]", "").lstrip("_")
        new = os.path.join(os.path.dirname(new), base)
        if new != rel:
            renames[rel] = new

reps = [(os.path.basename(o), os.path.basename(n)) for o, n in renames.items() if os.path.basename(o) != os.path.basename(n)]
reps += [("/_expo/", "/xpo/"), ("_expo/static", "xpo/static")]

# 2) 절대 경로 → 상대 경로, 청크 주소는 document.baseURI 기준
CHUNK_OLD = "if(/^https?:\\/\\//.test(e))return e;const{url:t}=(0,u.default)();return t?new URL(e,t).toString():`//${e.replace(/^\\/+/,'')}`"
CHUNK_NEW = "if(/^https?:\\/\\//.test(e))return e;return new URL(e,document.baseURI).toString()"
patched_chunk = False
for dp, _, fn in os.walk(root):
    for f in fn:
        if not f.endswith((".js", ".html", ".json")):
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding="utf-8").read()
        o = s
        for a, b in reps:
            s = s.replace(a, b)
        if f.endswith(".js"):
            s = s.replace('"/xpo/', '"xpo/').replace('"/assets/', '"assets/')
            if CHUNK_OLD in s:
                s = s.replace(CHUNK_OLD, CHUNK_NEW)
                patched_chunk = True
        if s != o:
            open(p, "w", encoding="utf-8").write(s)
if not patched_chunk:
    sys.exit("청크 주소 함수(buildUrlForBundle)를 찾지 못했어요. Expo 버전이 바뀌었으면 CHUNK_OLD 를 고쳐 주세요.")

for old, new in renames.items():
    os.makedirs(os.path.dirname(os.path.join(root, new)) or root, exist_ok=True)
    os.rename(os.path.join(root, old), os.path.join(root, new))
shutil.rmtree(os.path.join(root, "_expo"), ignore_errors=True)

# 3) index.html: <base> 고정 + 경로 '/' 로
idx = os.path.join(root, "index.html")
h = open(idx, encoding="utf-8").read()
boot = ("<script>(function(){var d=location.pathname.replace(/[^/]*$/,'');"
        "document.write('<base href=\"'+d+'\">');"
        "try{history.replaceState(null,'','/'+location.hash)}catch(e){}})();</script>")
h = h.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    ' + boot, 1)
h = h.replace('src="/xpo/', 'src="xpo/').replace('href="/favicon.ico"', 'href="favicon.ico"')
h = h.replace("<title>DIBS</title>", "<title>DIBS 앱 데모 (디자인 v2.0)</title>")
# 넓은 화면(데스크톱)에서는 가운데 휴대폰 틀(390x844)로, 휴대폰에서는 그대로 전체 화면
frame = """<style id="phone-frame">
@media (min-width: 480px) and (min-height: 560px) {
  html, body { background: #E9EBF0; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 100vh; overflow: hidden; }
  #root {
    flex: none; position: relative;
    width: 390px; height: 844px; zoom: var(--phone-zoom, 1); /* 창이 작으면 틀째로 줄인다 (레이아웃은 그대로) */
    border-radius: 46px; overflow: hidden; background: #fff;
    box-shadow: 0 0 0 11px #15161c, 0 0 0 12px #3a3b44, 0 28px 70px rgba(20, 22, 30, 0.35);
    transform: translateZ(0); /* 안쪽 fixed 요소를 틀 기준으로 */
    box-sizing: border-box; padding-top: 44px; /* 휴대폰 상태바 자리: 상단바가 틀 천장에 붙지 않게 */
  }
  #root > div { height: 100%; }
  #root::before { content: "9:41"; position: absolute; top: 0; left: 0; right: 0; height: 44px; padding: 0 0 0 34px; box-sizing: border-box;
    display: flex; align-items: center; font: 600 15px/1 Pretendard, -apple-system, sans-serif; color: #15161c; background: #fff; z-index: 2147483647; }
  #root::after { content: ""; position: absolute; top: 17px; right: 30px; width: 25px; height: 11px; border: 1.5px solid #15161c; border-radius: 3.5px;
    box-sizing: border-box; background: linear-gradient(90deg, #15161c 72%, transparent 72%) 2px 2px / calc(100% - 4px) calc(100% - 4px) no-repeat; z-index: 2147483647; }
  body::after { content: "DIBS 앱 데모 · 휴대폰에서 열면 전체 화면"; font: 500 12px/1 Pretendard, -apple-system, sans-serif; color: #8a8f9c; }
}
</style>
<script>(function(){function fit(){var z=Math.min(1,(innerHeight-64)/844,(innerWidth-48)/414);document.documentElement.style.setProperty('--phone-zoom',String(Math.max(0.5,z)))}fit();addEventListener('resize',fit)})();</script>"""
h = h.replace("</head>", frame + "\n</head>", 1)
open(idx, "w", encoding="utf-8").write(h)
print(f"{len(renames)}개 파일 이름 변경, 상대 경로 처리 완료: {root}")
