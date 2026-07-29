$ErrorActionPreference='Stop'
$DIR=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not $env:PORT){$env:PORT='4317'}
$URL="http://127.0.0.1:$($env:PORT)/"
$LOG="$env:TEMP\mindweave-bridge.log"
$node=Get-Command node -ErrorAction SilentlyContinue
if(-not $node){Write-Host '[mindweave] Node.js not found. Install Node.js >= 18. Mock-only: open mindweave.html.' -ForegroundColor Yellow;Read-Host 'Press Enter';exit 1}
$running=$false
try{$h=Invoke-WebRequest -Uri "$($URL)api/health" -UseBasicParsing -TimeoutSec 2;if($h.Content -match '"ready"'){$running=$true}}catch{}
if(-not $running){
  Write-Host "[mindweave] starting bridge on port $($env:PORT) ..."
  # Write a tiny runner .cmd (ANSI encoding, readable by cmd) to avoid Start-Process quoting/redirect conflicts.
  $runner = Join-Path $env:TEMP ("mindweave-run-" + $env:PORT + ".cmd")
  $lines = '@cd /d "' + $DIR + '"', '@node server.js 1>>"' + $LOG + '" 2>&1'
  Set-Content -Path $runner -Value $lines -Encoding Default
  Start-Process -FilePath $runner -WindowStyle Hidden
  $ok=$false
  for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -Uri "$($URL)api/health" -UseBasicParsing -TimeoutSec 2|Out-Null;$ok=$true;break}catch{Start-Sleep -Milliseconds 250}}
  if(-not $ok){Write-Host "[mindweave] bridge failed. Log: $LOG" -ForegroundColor Red;Get-Content $LOG -ErrorAction SilentlyContinue;Read-Host 'Press Enter';exit 1}
}
Start-Process $URL
