$ErrorActionPreference='Stop'
$DIR=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not $env:PORT){$env:PORT='4317'}
$URL="http://127.0.0.1:$($env:PORT)/"
$LOG="$env:TEMP\mindweave-bridge.log"
$node=Get-Command node -ErrorAction SilentlyContinue
if(-not $node){Write-Host '[mindweave] Node.js not found. Install Node.js >= 18. Mock-only: open mindweave.html.' -ForegroundColor Yellow;Read-Host 'Press Enter';exit 1}
$listen=(Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue)
if(-not $listen){
  Write-Host "[mindweave] starting bridge on port $($env:PORT) ..."
  Start-Process -FilePath $node.Source -ArgumentList 'server.js' -WorkingDirectory $DIR -WindowStyle Hidden -RedirectStandardOutput $LOG -RedirectStandardError "$LOG.err" | Out-Null
  $ok=$false
  for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -Uri "$($URL)api/health" -UseBasicParsing -TimeoutSec 2|Out-Null;$ok=$true;break}catch{Start-Sleep -Milliseconds 250}}
  if(-not $ok){Write-Host "[mindweave] bridge failed. Log: $LOG" -ForegroundColor Red;Get-Content $LOG -ErrorAction SilentlyContinue;Read-Host 'Press Enter';exit 1}
}
Start-Process $URL
