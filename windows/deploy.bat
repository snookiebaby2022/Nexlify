@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-from-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo Deploy failed. See DEPLOY-WINDOWS.md in this folder.
  pause
  exit /b 1
)
pause
