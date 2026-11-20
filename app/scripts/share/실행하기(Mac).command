#!/bin/bash
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then python3 server.py; else echo "python3 가 없어요. 터미널에서 'xcode-select --install' 후 다시 실행하거나 'npx serve site' 를 쓰세요."; read; fi
