@echo off
setlocal enabledelayedexpansion
set "DIR=%~dp0"
if "%PORT%"=="" set "PORT=4317"
set "URL=http://127.0.0.1:%PORT%/"
set "LOG=%TEMP%\mindweave-bridge.log"

where node >nul 2>nul
if errorlevel 1 (
  echo [mindweave] Node.js not found. Install Node.js ^>= 18 from https://nodejs.org
  echo [mindweave] For Mock-only demo, just open mindweave.html in a browser.
  pause & exit /b 1
)

netstat -ano 2>nul | findstr "LISTENING" | findstr ":%PORT% " >nul 2>nul
if errorlevel 1 (
  echo [mindweave] starting bridge on port %PORT% ...
  start "mindweave-bridge" /B cmd /c "cd /d "%DIR%" && set PORT=%PORT% && node server.js > "%LOG%" 2>&1"
  set "ok="
  for /L %%i in (1,1,40) do (
    powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri '%URL%api/health' -UseBasicParsing -TimeoutSec 2;exit 0}catch{exit 1}" >nul 2>nul
    if not errorlevel 1 ( set "ok=1" & goto :ready )
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 250" >nul 2>nul
  )
  :ready
  if not defined ok (
    echo [mindweave] bridge failed to start. Log: %LOG%
    type "%LOG%" 2>nul
    pause & exit /b 1
  )
)
start "" "%URL%"
endlocal
