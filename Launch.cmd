@echo off
cd /d "%~dp0"
if not exist "dist-electron\main.cjs" (
  echo First run: install dependencies and run npm run build. See README.md.
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "AI Assist" "node_modules\electron\dist\electron.exe" .
