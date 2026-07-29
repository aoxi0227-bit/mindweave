@echo off
setlocal enabledelayedexpansion
set "DIR=%~dp0"
if "%PORT%"=="" set "PORT=4317"
set "URL=http://127.0.0.1:%PORT%/"
set "LOG=%TEMP%\mindweave-bridge.log"
set "RUNNER=%TEMP%\mindweave-run-%PORT%.cmd"

where node >nul 2>nul
if errorlevel 1 (
  echo [mindweave] Node.js not found. Please install Node.js 18 or newer: https://nodejs.org
  echo [mindweave] Then double-click start.bat again.
  echo [mindweave] Mock demo needs no Node: open mindweave.html in a browser directly.
  pause
  exit /b 1
)

curl -sf -m 2 "%URL%api/health" 2>nul | findstr /C:"\"ready\"" >nul 2>nul
if errorlevel 1 (
  echo [mindweave] Starting local bridge server.js on port %PORT% ...
  rem Write a tiny runner script to avoid nested-quote parsing issues in cmd /c.
  > "%RUNNER%" echo @cd /d "%DIR%"
  >> "%RUNNER%" echo @node server.js 1^>^> "%LOG%" 2^>^&1
  start "mindweave-bridge" /min "%RUNNER%"
  set "ok="
  for /L %%i in (1,1,40) do (
    powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri '%URL%api/health' -UseBasicParsing -TimeoutSec 2;exit 0}catch{exit 1}" >nul 2>nul
    if not errorlevel 1 ( set "ok=1" & goto :ready )
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 250" >nul 2>nul
  )
  :ready
  if not defined ok (
    echo [mindweave] Bridge failed to start. Log file: %LOG%
    if exist "%LOG%" type "%LOG%"
    echo [mindweave] Common cause: port %PORT% already in use, or blocked by firewall.
    echo [mindweave] To use another port: set PORT=5050 then run start.bat again.
    pause
    exit /b 1
  )
) else (
  echo [mindweave] Bridge already running, opening the page.
)
start "" "%URL%"
endlocal
