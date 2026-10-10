@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python virtual environment not found.
  echo Create it with: py -3.12 -m venv .venv
  echo Then install: .venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
pause
