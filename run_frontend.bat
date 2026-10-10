@echo off
cd /d "%~dp0frontend"
if not exist "node_modules" (
  echo Frontend packages are not installed yet.
  echo Run: npm install
  pause
  exit /b 1
)
npm run dev -- --host 127.0.0.1
pause
