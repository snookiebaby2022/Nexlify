@echo off
REM Windows only — on Linux use: ./scripts/start-dev.sh
cd /d "%~dp0.."
where npm >nul 2>&1
if errorlevel 1 (
  echo npm not found. Install Node.js from https://nodejs.org
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting Nexlify at http://localhost:3000
call npm run dev
