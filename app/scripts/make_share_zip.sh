#!/bin/bash
# 팀원 공유용 데모 묶음(DIBS-demo.zip) 만들기: 웹 데모 빌드 + 실행기(Mac/Windows) + 안내
# 사용: cd app && bash scripts/make_share_zip.sh  → ../DIBS-demo.zip
set -e
cd "$(dirname "$0")/.."
rm -rf /tmp/dist-demo && EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir /tmp/dist-demo
python3 scripts/artifact_postprocess.py /tmp/dist-demo
OUT=$(mktemp -d); mkdir "$OUT/DIBS-demo"; cp -r /tmp/dist-demo "$OUT/DIBS-demo/site"; cp scripts/share/* "$OUT/DIBS-demo/"
chmod +x "$OUT/DIBS-demo/실행하기(Mac).command"
(cd "$OUT" && zip -qr DIBS-demo.zip DIBS-demo) && mv "$OUT/DIBS-demo.zip" ../DIBS-demo.zip
echo "만들었어요: $(cd .. && pwd)/DIBS-demo.zip"
