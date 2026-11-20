@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py server.py & goto :eof)
where python >nul 2>nul && (python server.py & goto :eof)
echo Python 이 없어요. https://www.python.org 에서 설치하거나 Node 가 있으면 npx serve site 를 실행하세요.
pause
