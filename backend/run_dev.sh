#!/usr/bin/env bash
# 폰(Expo Go)에서 접속할 수 있게 같은 와이파이 전체에 서버를 연다.
#   bash run_dev.sh
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || { echo "먼저 bash setup_mac.sh 를 실행해 주세요"; exit 1; }
# shellcheck disable=SC1091
source .venv/bin/activate
[ -f dibs.db ] || python -m scripts.seed_demo
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo ""
echo "  앱 로그인 화면의 서버 주소:  http://${IP}:8000"
echo "  API 문서:                  http://${IP}:8000/docs"
echo ""
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
