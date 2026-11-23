#!/usr/bin/env bash
# GitHub Pages(https://devtaego.github.io/DIBS/)용 정적 웹 데모 빌드.
#   bash scripts/pages_build.sh [출력 폴더]   (기본 dist-pages)
# 만든 폴더 내용을 gh-pages 브랜치 맨 위에 그대로 올리면 된다.
# - baseUrl /DIBS 로 빌드 (app.json 은 빌드 동안만 바꾸고 되돌림)
# - <base href="/DIBS/"> 를 넣어 covers/·episodes/ 같은 상대 경로 미디어가 /DIBS/ 아래에서 열리게 함
# - 404.html = index.html (하위 주소로 바로 들어오거나 새로고침해도 앱이 뜨게)
# - .nojekyll (_expo 폴더를 Pages 가 무시하지 않게)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-dist-pages}"
cp app.json /tmp/app.json.pages.bak
trap 'cp /tmp/app.json.pages.bak app.json' EXIT
python3 - <<'EOF'
import json
d = json.load(open('app.json'))
d['expo'].setdefault('experiments', {})['baseUrl'] = '/DIBS'
json.dump(d, open('app.json', 'w'), ensure_ascii=False, indent=2)
EOF
rm -rf "$OUT"
EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir "$OUT"
python3 - "$OUT" <<'EOF'
import re, shutil, sys, os
out = sys.argv[1]
src = open('scripts/artifact_postprocess.py', encoding='utf-8').read()
frame = re.search(r'frame = """(.*?)"""', src, re.S).group(1)  # 데스크톱에서 휴대폰 틀
idx = os.path.join(out, 'index.html')
h = open(idx, encoding='utf-8').read()
h = h.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    <base href="/DIBS/">', 1)
h = h.replace('href="/favicon.ico"', 'href="/DIBS/favicon.ico"')
h = re.sub(r'<title>.*?</title>', '<title>DIBS 앱 데모</title>', h)
h = h.replace('</head>', frame + '\n</head>', 1)
open(idx, 'w', encoding='utf-8').write(h)
shutil.copy(idx, os.path.join(out, '404.html'))
open(os.path.join(out, '.nojekyll'), 'w').close()
print('GitHub Pages 빌드 완료:', out)
EOF
