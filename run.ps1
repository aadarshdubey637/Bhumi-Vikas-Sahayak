<#
.SYNOPSIS
  One-command local launcher for NirmaanSetu AI (backend + frontend). Windows PowerShell 5.1+.

.EXAMPLE
  .\run.ps1              # check, install, migrate, load rules, start both servers in their own windows, open the browser
  .\run.ps1 -Check       # only verify prerequisites and ports; change nothing
  .\run.ps1 -Background  # start hidden (logs in .runtime\); use -Stop to end them
  .\run.ps1 -Stop        # stop servers started by this script
  .\run.ps1 -Reset       # delete the local SQLite database first (fresh start)
#>
param(
  [switch]$Check, [switch]$Background, [switch]$Stop, [switch]$Reset, [switch]$NoBrowser,
  [int]$ApiPort = 8000, [int]$WebPort = 5173
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$be = Join-Path $root "backend"; $fe = Join-Path $root "frontend"
$rt = Join-Path $be ".runtime"; New-Item -ItemType Directory -Force $rt | Out-Null
$pidFile = Join-Path $rt "pids.txt"

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    OK   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    WARN $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "    FAIL $m" -ForegroundColor Red }
function Native([scriptblock]$cmd) {
  # PowerShell 5.1 turns native stderr text (alembic/pip/npm log there) into terminating errors under -ErrorAction Stop.
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { $out = & $cmd 2>&1 | ForEach-Object { "$_" }; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $old }
  return [pscustomobject]@{ Out = ($out -join "`n"); Code = $code }
}
function PortOwner($port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; return "$($p.ProcessName) (pid $($c.OwningProcess))" }
  return $null
}

if ($Stop) {
  Step "Stopping servers started by run.ps1"
  if (Test-Path $pidFile) {
    foreach ($id in (Get-Content $pidFile)) {
      if ($id -match '^\d+$') {
        # kill the whole tree (npm -> node, uvicorn reloader -> worker)
        & taskkill /PID $id /T /F 2>$null | Out-Null
      }
    }
    Remove-Item $pidFile -Force; Ok "stopped"
  } else { Warn "no pid file; nothing to stop" }
  exit 0
}

# ---------------------------------------------------------------- prerequisites
Step "Checking prerequisites"
$problems = 0
$pyCmd = $null
foreach ($v in "3.12", "3.13") {
  try { & py "-$v" -c "import sys" 2>$null; if ($LASTEXITCODE -eq 0) { $pyCmd = "-$v"; Ok "Python $v found"; break } } catch { }
}
if (-not $pyCmd) { Fail "Python 3.12 not found. Install it from https://www.python.org/downloads/ (tick 'py launcher'). Python 3.14 is untested."; $problems++ }
try {
  $nodeV = (& node --version).TrimStart("v"); $major = [int]($nodeV.Split(".")[0])
  if ($major -ge 20) { Ok "Node $nodeV" } else { Fail "Node $nodeV is too old; need 20 or newer (https://nodejs.org)"; $problems++ }
} catch { Fail "Node.js not found (https://nodejs.org, version 20 or newer)"; $problems++ }
foreach ($pair in @(@($ApiPort, "backend"), @($WebPort, "frontend"))) {
  $o = PortOwner $pair[0]
  if ($o) { Warn "port $($pair[0]) ($($pair[1])) is already in use by $o. Close it, or run .\run.ps1 -Stop, or choose another port with -ApiPort / -WebPort." ; if (-not $Check) { $problems++ } }
  else { Ok "port $($pair[0]) is free ($($pair[1]))" }
}
if ($Check) {
  if ($problems) { Fail "$problems problem(s) found"; exit 1 }
  if ((PortOwner $ApiPort) -or (PortOwner $WebPort)) { Warn "prerequisites are fine, but a port is busy (maybe the app is already running: http://localhost:$WebPort)"; exit 0 }
  Ok "everything needed is available"; exit 0
}
if ($problems) { Fail "Fix the problems above, then run .\run.ps1 again."; exit 1 }

# ---------------------------------------------------------------- backend
Step "Backend: virtual environment and dependencies"
$venvPy = Join-Path $be ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { & py $pyCmd -m venv (Join-Path $be ".venv"); Ok "created .venv" }
$reqHash = (Get-FileHash (Join-Path $be "requirements-dev.txt")).Hash + (Get-FileHash (Join-Path $be "requirements.txt")).Hash
$stamp = Join-Path $rt "requirements.stamp"
if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $reqHash)) { Ok "dependencies already installed" }
else {
  Push-Location $be; $r = Native { & $venvPy -m pip install --disable-pip-version-check -q -r requirements-dev.txt }; Pop-Location
  if ($r.Code -ne 0) { Fail "pip install failed (check your internet connection):`n$($r.Out)"; exit 1 }
  Set-Content $stamp $reqHash; Ok "installed Python dependencies"
}

Step "Backend: database and rule data"
$env:DATABASE_URL = "sqlite:///./nirmaansetu.db"
if ($Reset) { Remove-Item (Join-Path $be "nirmaansetu.db") -ErrorAction SilentlyContinue; Ok "removed old local database" }
Push-Location $be
$r = Native { & $venvPy -m alembic upgrade head }
if ($r.Code -ne 0) { Pop-Location; Fail "database migration failed:`n$($r.Out)"; exit 1 }
Ok "database migrated"
# outputs go to .runtime so the shipped data/processed files are never rewritten
$r = Native { & $venvPy -m scripts.ingest_jsonl --load-db --corpus-out ".runtime/corpus_rules.jsonl" --report-out ".runtime/ingestion_report.json" }
if ($r.Code -ne 0) { Pop-Location; Fail "rule ingestion failed:`n$($r.Out)"; exit 1 }
Ok (($r.Out -split "`n" | Where-Object { $_ -match "^processed=" } | Select-Object -First 1))
Pop-Location

# ---------------------------------------------------------------- frontend
Step "Frontend: dependencies"
if (-not (Test-Path (Join-Path $fe "node_modules"))) {
  Push-Location $fe; $r = Native { & npm ci }; Pop-Location
  if ($r.Code -ne 0) { Fail "npm ci failed:`n$($r.Out)"; exit 1 }
  Ok "installed Node dependencies"
} else { Ok "node_modules present" }
if (Test-Path (Join-Path $fe ".env.local")) { Warn "frontend\.env.local exists and overrides the default backend URL (http://localhost:8000)" }

# ---------------------------------------------------------------- start
Step "Starting servers"
$apiArgs = "-m uvicorn app.main:app_factory --factory --port $ApiPort"
$webArgs = "run dev -- --port $WebPort --strictPort"
$ids = @()
$env:CORS_ORIGINS = "http://localhost:$WebPort"   # the backend must allow whichever web port was chosen
if ($Background) {
  $env:VITE_API_BASE_URL = "http://localhost:$ApiPort"
  $a = Start-Process -FilePath $venvPy -ArgumentList $apiArgs -WorkingDirectory $be -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $rt "api.log") -RedirectStandardError (Join-Path $rt "api.err.log")
  $w = Start-Process -FilePath "npm.cmd" -ArgumentList $webArgs -WorkingDirectory $fe -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $rt "web.log") -RedirectStandardError (Join-Path $rt "web.err.log")
  Remove-Item Env:VITE_API_BASE_URL
} else {
  $a = Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='NirmaanSetu API'; cd '$be'; `$env:DATABASE_URL='sqlite:///./nirmaansetu.db'; `$env:CORS_ORIGINS='http://localhost:$WebPort'; & '$venvPy' $apiArgs" -PassThru
  $w = Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='NirmaanSetu Web'; cd '$fe'; `$env:VITE_API_BASE_URL='http://localhost:$ApiPort'; npm $webArgs" -PassThru
}
$ids += $a.Id, $w.Id; Set-Content $pidFile $ids

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  try { $h = Invoke-WebRequest "http://localhost:$ApiPort/api/v1/ready" -UseBasicParsing -TimeoutSec 2; if ($h.StatusCode -eq 200) { $ready = $true; break } } catch { }
}
if (-not $ready) { Fail "backend did not become ready in 60 s. Look at the 'NirmaanSetu API' window (or backend\.runtime\api.err.log)."; exit 1 }
$body = $h.Content | ConvertFrom-Json
Ok "backend ready: $($body.rules_loaded) rules loaded -> http://localhost:$ApiPort/docs"
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try { if ((Invoke-WebRequest "http://localhost:$WebPort/" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $up = $true; break } } catch { }
}
if (-not $up) { Fail "frontend did not start in 40 s. Look at the 'NirmaanSetu Web' window (or backend\.runtime\web.err.log)."; exit 1 }
Ok "frontend ready -> http://localhost:$WebPort"
Remove-Item Env:CORS_ORIGINS -ErrorAction SilentlyContinue
Write-Host "`nNirmaanSetu AI is running. Stop with:  .\run.ps1 -Stop" -ForegroundColor Green
if (-not $NoBrowser -and -not $Background) { Start-Process "http://localhost:$WebPort" }
