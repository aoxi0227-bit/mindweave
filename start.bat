@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
set "DIR=%~dp0"
if "%PORT%"=="" set "PORT=4317"
set "URL=http://127.0.0.1:%PORT%/"
set "LOG=%TEMP%\mindweave-bridge.log"

where node >nul 2>nul
if errorlevel 1 (
  echo [mindweave] 未检测到 Node.js。请先安装 Node.js ^>= 18：https://nodejs.org
  echo [mindweave] 安装后重新双击 start.bat 即可（本软件打开时会自动启动后台 server.js）。
  echo [mindweave] 仅用 Mock 演示可不装 Node：直接用浏览器打开 mindweave.html。
  pause
  exit /b 1
)

netstat -ano 2>nul | findstr "LISTENING" | findstr ":%PORT% " >nul 2>nul
if errorlevel 1 (
  echo [mindweave] 正在启动本地桥接后台 server.js（端口 %PORT%）...
  start "mindweave-bridge" /min cmd /c "cd /d "%DIR%" && set PORT=%PORT% && node server.js > "%LOG%" 2>&1"
  set "ok="
  for /L %%i in (1,1,40) do (
    powershell -NoProfile -Command "try{$r=Invoke-WebRequest -Uri '%URL%api/health' -UseBasicParsing -TimeoutSec 2;exit 0}catch{exit 1}" >nul 2>nul
    if not errorlevel 1 ( set "ok=1" & goto :ready )
    powershell -NoProfile -Command "Start-Sleep -Milliseconds 250" >nul 2>nul
  )
  :ready
  if not defined ok (
    echo [mindweave] 后台启动失败，日志：%LOG%
    if exist "%LOG%" type "%LOG%"
    echo [mindweave] 常见原因：端口 %PORT% 被占用（可设 set PORT=5050 后重试）或防火墙拦截。
    pause
    exit /b 1
  )
) else (
  echo [mindweave] 后台已在运行，直接打开网页。
)
start "" "%URL%"
endlocal
