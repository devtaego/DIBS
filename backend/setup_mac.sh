#!/usr/bin/env bash
# DIBS 백엔드 개발 환경 설치 (macOS)
#   압축 푼 폴더에서:  bash setup_mac.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ 1/5 Python 확인"
PY=""
for c in python3.13 python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  echo "  Python 3.11 이상이 필요해요."
  if command -v brew >/dev/null 2>&1; then
    echo "  Homebrew로 Python 3.13을 설치할게요..."
    brew install python@3.13
    PY="$(brew --prefix)/bin/python3.13"
  else
    echo "  Homebrew가 없어요. https://www.python.org/downloads/ 에서 3.13을 설치한 뒤 다시 실행해 주세요."
    exit 1
  fi
fi
echo "  사용: $PY ($("$PY" --version))"

echo "▶ 2/5 가상환경 (.venv)"
[ -d .venv ] || "$PY" -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -q --upgrade pip

echo "▶ 3/5 패키지 설치 (requirements.txt)"
pip install -q -r requirements.txt

echo "▶ 4/5 테스트"
pytest -q

echo "▶ 5/5 데모 데이터 (dibs.db)"
rm -f dibs.db
python -m scripts.seed_demo

cat <<'MSG'

✅ 설치 완료

  서버 실행:   source .venv/bin/activate && uvicorn app.main:app --reload
  API 문서:    http://localhost:8000/docs
  테스트:      pytest -q
  데모 초기화: rm dibs.db && python -m scripts.seed_demo
  문서 재생성: python -m scripts.export_docs

  로그인 토큰: POST /auth/dev-login  {"email": "reader1@dibs.dev"}
MSG
